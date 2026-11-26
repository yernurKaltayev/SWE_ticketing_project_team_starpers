"""Groups stored `action_type` names into categories for the history filter [P12].

Stored names are not uniform (`event_created`, `order.paid`, `checkin.accepted`), so the
history endpoint filters through this one table instead. Add new actions here; a unit test
fails when an `action_type` used in `app/` belongs to no category.
"""

# Exact stored names, for the underscore-style actions.
NAMES: dict[str, tuple[str, ...]] = {
    "event": (
        "event_created",
        "event_updated",
        "event_published",
        "event_unpublished",
        "event_duplicated",
        "event_cancelled",
    ),
    "ticket_type": ("ticket_type_created", "ticket_type_updated"),
    "staff": (
        "staff_assigned",
        "staff_removed",
        "volunteer_created",
        "volunteer_password_reset",
        "volunteer_removed",
    ),
    "refund": ("refund_policy.updated",),
}

# Dotted families: `<prefix>*` (the names are built dynamically in some places).
PREFIXES: dict[str, tuple[str, ...]] = {
    "event": ("event.",),  # event.suspended / event.resumed (P11)
    "order": ("order.", "tickets."),
    "payment": ("payment.", "payout.", "payout_account."),
    "refund": ("refund.",),
    "promo": ("promo.",),
    "support": ("support.",),
    "checkin": ("checkin.",),
    "paid_sales": ("paid_sales.",),
    "admin": ("event_report.", "user.", "settings."),
}

CATEGORIES: tuple[str, ...] = tuple(sorted(set(NAMES) | set(PREFIXES)))


def category_of(action_type: str) -> str | None:
    for category, names in NAMES.items():
        if action_type in names:
            return category
    for category, prefixes in PREFIXES.items():
        if action_type.startswith(prefixes):
            return category
    return None
