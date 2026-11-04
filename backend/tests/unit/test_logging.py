import json
import logging
import sys

from app.core.logging import JsonFormatter, request_id_var


def _record(**kwargs) -> logging.LogRecord:
    return logging.LogRecord("test", logging.INFO, __file__, 1, "hello %s", ("world",), **kwargs)


def test_json_formatter_includes_request_id_and_extras():
    token = request_id_var.set("abc")
    record = _record(exc_info=None)
    record.order_id = "o-1"
    entry = json.loads(JsonFormatter().format(record))
    request_id_var.reset(token)

    assert entry["message"] == "hello world"
    assert entry["level"] == "INFO"
    assert entry["request_id"] == "abc"
    assert entry["order_id"] == "o-1"


def test_json_formatter_includes_the_traceback():
    try:
        raise ValueError("boom")
    except ValueError:
        entry = json.loads(JsonFormatter().format(_record(exc_info=sys.exc_info())))
    assert "ValueError: boom" in entry["exception"]
