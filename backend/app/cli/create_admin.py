"""Creates the first admin user with every permission code (docs/permissions.md#seed-templates).

Usage (from backend/):  python -m app.cli.create_admin [--username admin] [--reset]

Prints a generated password once; the user must change it at first login.
--reset: if the user exists, reactivate it, set a new password and grant every code again.
"""

import argparse
import sys

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

import app.models  # noqa: F401  (registers every table, so foreign keys such as app_user.work_entity_id resolve)
from app.core import audit
from app.core.db import get_sessionmaker
from app.core.models import AppUser, Permission, UserPermission
from app.core.security import delete_user_sessions, generate_password, hash_password, utcnow

DEFAULT_FULL_NAME = "مدير النظام"


def create_admin(db: Session, username: str, full_name: str, reset: bool) -> str:
    """Returns the generated password. Raises ValueError if the user exists and reset is False."""
    password = generate_password()
    codes = list(db.scalars(select(Permission.code)))
    user = db.scalar(select(AppUser).where(AppUser.username == username))

    if user is not None and not reset:
        raise ValueError(f"User '{username}' already exists. Use --reset to reset its password and permissions.")

    if user is None:
        user = AppUser(username=username, full_name=full_name, password_hash=hash_password(password),
                       is_active=True, must_change_password=True)
        db.add(user)
        db.flush()
        action = "create"
    else:
        user.password_hash = hash_password(password)
        user.is_active = True
        user.must_change_password = True
        user.updated_at = utcnow()
        db.execute(delete(UserPermission).where(UserPermission.user_id == user.id))
        delete_user_sessions(db, user.id)
        action = "reset_admin"

    db.add_all(UserPermission(user_id=user.id, permission_code=code) for code in codes)
    audit.write(
        db,
        action=action,
        entity="app_user",
        entity_id=user.id,
        new_values={"username": username, "full_name": user.full_name, "permissions": sorted(codes),
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
