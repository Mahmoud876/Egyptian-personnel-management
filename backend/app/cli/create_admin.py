"""Creates the first user with the system_administrator role (docs/permissions.md).

Usage (from backend/):  python -m app.cli.create_admin [--username admin] [--reset]

Prints a generated password once; the user must change it at first login.
--reset: reactivate the user, reset their password and restore the administrator role.
"""

import argparse
import sys

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

import app.models  # noqa: F401  (registers every table, so foreign keys such as app_user.work_entity_id resolve)
from app.core import audit
from app.core.db import get_sessionmaker
from app.core.models import AppUser, UserPermission
from app.core.roles import permissions_for_role
from app.core.security import delete_user_sessions, generate_password, hash_password, utcnow

DEFAULT_FULL_NAME = "مدير النظام"


def create_admin(db: Session, username: str, full_name: str, reset: bool) -> str:
    """Returns the generated password. Raises ValueError if the user exists and reset is False."""
    password = generate_password()
    codes = permissions_for_role("system_administrator")
    user = db.scalar(select(AppUser).where(AppUser.username == username))

    if user is not None and not reset:
        raise ValueError(f"User '{username}' already exists. Use --reset to reset its password and permissions.")

    if user is None:
        user = AppUser(username=username, full_name=full_name, password_hash=hash_password(password),
                       is_active=True, must_change_password=True, role="system_administrator")
        db.add(user)
        db.flush()
        action = "create"
    else:
        user.password_hash = hash_password(password)
        user.role = "system_administrator"
        user.is_active = True
        user.must_change_password = True
        user.updated_at = utcnow()
        db.execute(delete(UserPermission).where(UserPermission.user_id == user.id))
        delete_user_sessions(db, user.id)
        action = "reset_admin"

    audit.write(
        db,
        action=action,
        entity="app_user",
        entity_id=user.id,
        new_values={"username": username, "full_name": user.full_name, "role": user.role, "permissions": sorted(codes),
                    "source": "create_admin"},
    )
    db.commit()
    return password


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--username", default="admin")
    parser.add_argument("--full-name", default=DEFAULT_FULL_NAME)
    parser.add_argument("--reset", action="store_true")
    args = parser.parse_args()

    with get_sessionmaker()() as db:
        try:
            password = create_admin(db, args.username, args.full_name, args.reset)
        except ValueError as exc:
            print(f"FAILED: {exc}", file=sys.stderr)
            return 1

    print(f"Admin user: {args.username}")
    print(f"Password:   {password}")
    print("Shown once. The user must change it at first login.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
