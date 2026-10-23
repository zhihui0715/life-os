"""Provider-independent AI gateway. The rest of the app asks for "JSON matching this schema" and gets back a dict
plus token counts; only this file knows which company's API is behind it.

Configuration (.env):
  AI_PROVIDER=anthropic   (or "none" to switch AI off for everyone)
  ANTHROPIC_API_KEY=...   (without a key the AI features are hidden and the app explains why)
  AI_MODEL=claude-opus-5-5  (optional override, e.g. claude-haiku-5-5 for lower cost)

Tests replace the provider with a fake through `app.extensions["ai_provider"]`.
"""

import json
import logging
import os
from dataclasses import dataclass
from typing import Protocol

from flask import current_app

log = logging.getLogger(__name__)

DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5"


@dataclass
class AiResult:
    data: dict
    model: str
    input_tokens: int
    output_tokens: int


class AiProviderError(Exception):
    """code: ai_rate_limited | ai_refused | ai_failed | ai_misconfigured — translated by the frontend."""

    def __init__(self, code: str, detail: str = ""):
        super().__init__(detail or code)
        self.code = code


class AiProvider(Protocol):
    name: str
    model: str

    def generate(self, system: str, user: str, schema: dict, max_tokens: int) -> AiResult: ...


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, api_key: str, model: str):
        import anthropic  # imported here so the app starts even if AI is never used

        self._anthropic = anthropic
        # A plan or review is short: fail after 60 s rather than leave the page spinning; the SDK retries 429/5xx twice.
        self._client = anthropic.Anthropic(api_key=api_key, timeout=60.0, max_retries=2)
        self.model = model

    def generate(self, system: str, user: str, schema: dict, max_tokens: int) -> AiResult:
        a = self._anthropic
        try:
            response = self._client.beta.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
                # Structured outputs: the reply is guaranteed to be JSON matching the schema.
                # Effort "low": planning a day is routine work; it keeps cost and waiting time down.
                output_config={"effort": "low", "format": {"type": "json_schema", "schema": schema}},
                # If a safety classifier declines, retry on Anthropic's recommended fallback model.
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
        except a.RateLimitError as e:
            raise AiProviderError("ai_rate_limited") from e
        except (a.AuthenticationError, a.PermissionDeniedError, a.NotFoundError) as e:
            log.error("AI provider rejected the configuration: %s (request id %s)", type(e).__name__, getattr(e, "request_id", None))
            raise AiProviderError("ai_misconfigured") from e
        except a.APIStatusError as e:
            log.error("AI provider error %s (request id %s)", e.status_code, getattr(e, "request_id", None))
            raise AiProviderError("ai_failed") from e
        except a.APIConnectionError as e:  # includes timeouts
            raise AiProviderError("ai_failed", "connection") from e

        usage = response.usage
        if response.stop_reason == "refusal":
            raise AiProviderError("ai_refused")
        if response.stop_reason == "max_tokens":
            raise AiProviderError("ai_failed", "reply too long")
        text = next((b.text for b in response.content if b.type == "text"), None)
        try:
            data = json.loads(text) if text else None
        except ValueError:
            data = None
        if not isinstance(data, dict):
            raise AiProviderError("ai_failed", "no JSON in reply")
        return AiResult(data, response.model, usage.input_tokens, usage.output_tokens)


def get_provider() -> AiProvider | None:
    """The configured provider, or None when AI isn't set up on this server."""
    if "ai_provider" in current_app.extensions:  # tests
        return current_app.extensions["ai_provider"]
    name = os.environ.get("AI_PROVIDER", "anthropic").strip().lower()
    if name == "anthropic" and os.environ.get("ANTHROPIC_API_KEY"):
        provider = current_app.extensions.get("_anthropic_provider")
        if provider is None:
            provider = AnthropicProvider(os.environ["ANTHROPIC_API_KEY"], os.environ.get("AI_MODEL") or DEFAULT_ANTHROPIC_MODEL)
            current_app.extensions["_anthropic_provider"] = provider
        return provider
    return None
