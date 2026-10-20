"""One error format for the whole API (docs/02-api-conventions.md §4)."""

import logging

from flask import g, jsonify
from werkzeug.exceptions import HTTPException

log = logging.getLogger(__name__)

HTTP_CODES = {
    400: "bad_request",
    401: "unauthenticated",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    413: "payload_too_large",
    415: "unsupported_media_type",
    422: "validation_error",
    429: "rate_limited",
}


class ApiError(Exception):
    """Raise anywhere in a request to return a clean JSON error."""

    def __init__(self, status: int, code: str, message: str, fields: dict | None = None, extra: dict | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.fields = fields
        self.extra = extra


def not_found(what: str = "Resource") -> ApiError:
    return ApiError(404, "not_found", f"{what} not found.")


def _body(code: str, message: str, fields=None, extra=None):
    error = {"code": code, "message": message, "request_id": g.get("request_id")}
    if fields:
        error["fields"] = fields
    if extra:
        error.update(extra)
    return {"error": error}


def register_error_handlers(app) -> None:
    @app.errorhandler(ApiError)
    def handle_api_error(e: ApiError):
        return jsonify(_body(e.code, e.message, e.fields, e.extra)), e.status

    @app.errorhandler(HTTPException)
    def handle_http_error(e: HTTPException):
        status = e.code or 500
        code = HTTP_CODES.get(status, "http_error")
        return jsonify(_body(code, e.description or code)), status

    @app.errorhandler(Exception)
    def handle_unexpected(e: Exception):
        # Full details go to the server log only; the client gets a generic message.
        log.exception("Unhandled error (request_id=%s)", g.get("request_id"))
        return jsonify(_body("internal_error", "Something went wrong on the server.")), 500
