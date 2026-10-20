"""Request parsing with Pydantic. Turns validation failures into 422 errors with per-field details."""

from typing import TypeVar

from flask import request
from pydantic import BaseModel, ConfigDict, ValidationError

from app.common.errors import ApiError

M = TypeVar("M", bound=BaseModel)


class InputModel(BaseModel):
    """Base for request bodies: unknown fields are rejected, strings are trimmed."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class QueryModel(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)


def _field_errors(e: ValidationError) -> dict:
    fields: dict[str, list[dict]] = {}
    for err in e.errors():
        key = ".".join(str(p) for p in err["loc"]) or "_body"
        # `type` is stable (e.g. "missing", "string_too_long") so the UI can translate it.
        fields.setdefault(key, []).append({"type": err["type"], "message": err["msg"]})
    return fields


def parse_body(model: type[M]) -> M:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "bad_request", "Request body must be a JSON object.")
    try:
        return model.model_validate(data)
    except ValidationError as e:
        raise ApiError(422, "validation_error", "Some fields are invalid.", fields=_field_errors(e)) from None


def parse_query(model: type[M]) -> M:
    try:
        return model.model_validate(request.args.to_dict())
    except ValidationError as e:
        raise ApiError(422, "validation_error", "Some query parameters are invalid.", fields=_field_errors(e)) from None
