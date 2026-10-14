"""Password hashing (Argon2 via pwdlib) and server-side sessions.

The browser holds a random 32-byte token (hex) in an HTTP-only cookie. The database stores only its SHA-256
(user_session.id), so someone who can read the table cannot use the sessions in it.
"""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from functools import lru_cache

from pwdlib import PasswordHash
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.models import UserSession

PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128

# last_seen_at is written at most this often, so every request doesn't cost a write.
_LAST_SEEN_RESOLUTION = timedelta(minutes=1)

_hasher = PasswordHash.recommended()


def utcnow() -> datetime:
    """Naive UTC, matching the DATETIME2 columns (SYSUTCDATETIME)."""
    return datetime.now(UTC).replace(tzinfo=None)


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> tuple[bool, str | None]:
    """Returns (valid, new_hash). new_hash is set when the stored hash uses outdated parameters."""
    return _hasher.verify_and_update(password, password_hash)


@lru_cache
def _dummy_hash() -> str:
    return _hasher.hash(secrets.token_hex(16))


def verify_dummy_password(password: str) -> None:
    """Spends the same time as a real check, so response times don't reveal whether a username exists."""
    _hasher.verify(password, _dummy_hash())


def generate_password() -> str:
    return secrets.token_urlsafe(12)


def session_id_for(token: str) -> str:
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def create_session(db: Session, user_id: int, ip: str | None) -> str:
    """Adds a session row (caller commits) and returns the token for the cookie."""
    settings = get_settings()
    token = secrets.token_hex(32)
    now = utcnow()
    db.add(
        UserSession(
            id=session_id_for(token),
            user_id=user_id,
            created_at=now,
            last_seen_at=now,
            expires_at=now + timedelta(hours=settings.session_max_hours),
            ip=ip,
        )
    )
    return token


def resolve_session(db: Session, token: str | None) -> UserSession | None:
    """Returns the live session for a cookie token, or None. Expired or idle sessions are deleted."""
    if not token or len(token) != 64:
        return None
    session = db.get(UserSession, session_id_for(token))
    if session is None:
        return None

    now = utcnow()
    idle_limit = timedelta(minutes=get_settings().session_idle_minutes)
    if now >= session.expires_at or now - session.last_seen_at > idle_limit:
        db.delete(session)
        db.commit()
        return None

    if now - session.last_seen_at >= _LAST_SEEN_RESOLUTION:
        session.last_seen_at = now
        db.commit()
    return session


def delete_session(db: Session, token: str | None) -> None:
    if token and len(token) == 64:
        db.execute(delete(UserSession).where(UserSession.id == session_id_for(token)))


def delete_user_sessions(db: Session, user_id: int, keep_session_id: str | None = None) -> None:
    statement = delete(UserSession).where(UserSession.user_id == user_id)
    if keep_session_id is not None:
        statement = statement.where(UserSession.id != keep_session_id)
    db.execute(statement)
