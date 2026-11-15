import re
from pathlib import Path

import pytest

from app.services.audit_categories import CATEGORIES, category_of

APP = Path(__file__).resolve().parents[2] / "app"
LITERAL = re.compile(r'action_type\s*=\s*(?:\(\s*)?f?"([^"]+)"')
BRANCH = re.compile(r'^\s*(?:if .+ else\s+)?"([a-z_.]+)"', re.M)


def _used_action_types() -> set[str]:
    names: set[str] = set()
    for path in APP.rglob("*.py"):
        if path.name == "audit_categories.py":
            continue
        text = path.read_text()
        for match in LITERAL.finditer(text):
            name = match.group(1)
            names.add(name.split("{")[0] if "{" in name else name)
    return names


def test_every_action_type_used_in_the_app_has_a_category():
    used = _used_action_types()
    assert len(used) > 20  # the scan found the call sites
    unmapped = sorted(name for name in used if category_of(name) is None)
    assert unmapped == [], f"add these to app/services/audit_categories.py: {unmapped}"


@pytest.mark.parametrize(
    ("name", "category"),
    [
        ("event_published", "event"),
        ("event.suspended", "event"),
        ("event_report.reviewed", "admin"),
        ("order.paid", "order"),
        ("payment.succeeded", "payment"),
        ("checkin.reverted", "checkin"),
        ("promo.disabled", "promo"),
        ("refund_policy.updated", "refund"),
        ("staff_assigned", "staff"),
        ("something.new", None),
    ],
)
def test_category_of(name, category):
    assert category_of(name) == category


def test_categories_are_listed():
    assert "event" in CATEGORIES and "checkin" in CATEGORIES
