"""PoC FR-27: permissions derive exclusively from the user's role.

Legacy names are response/UI aliases, never separately assignable grants.
"""
from typing import Literal

Role = Literal["system_administrator", "data_entry_operator"]
ROLE_PERMISSIONS = {
    "system_administrator": frozenset({
        "file:insert", "audit:get", "profile:get", "profile:insert", "profile:update",
        "barcode:get", "user:get", "user:insert", "user:update", "user:delete",
        "lookups.manage",
    }),
    "data_entry_operator": frozenset({"profile:get", "profile:insert", "barcode:get"}),
}
ALIASES = {
    "users.view": "user:get", "users.manage": "user:update", "audit.view": "audit:get",
    "conscripts.view": "profile:get", "conscripts.enter": "profile:insert",
    "conscripts.edit_locked": "profile:update", "conscripts.label.print": "barcode:get",
    "conscripts.import.upload": "file:insert", "conscripts.import.approve": "file:insert",
    "conscripts.import.export": "file:insert",
}


def permissions_for_role(role: str) -> frozenset[str]:
    codes = ROLE_PERMISSIONS.get(role, frozenset())
    return codes | {alias for alias, code in ALIASES.items() if code in codes}
