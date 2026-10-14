"""Password hashing (Argon2 via pwdlib) and server-side sessions.

The browser holds a random 32-byte token (hex) in an HTTP-only cookie. Redis keys
contain only its SHA-256. SQL user versions invalidate all sessions atomically.
"""

import hashlib
import secrets
from datetime import UTC, datetime
from functools import lru_cache

from pwdlib import PasswordHash
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.models import AppUser
from app.core.redis_client import get_redis, key
from dataclasses import dataclass
import json
import re
import time

PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128

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
    """Redis stores only a hash of the opaque cookie; SQL versions revoke sessions atomically."""
    settings = get_settings()
    token = secrets.token_hex(32)
    user = db.get(AppUser, user_id)
    absolute = int(time.time()) + settings.session_max_hours * 3600
    data = {"user_id": user_id, "version": user.session_version or 0, "expires": absolute}
    get_redis().set(key(f"session:{session_id_for(token)}"), json.dumps(data),
                    ex=min(settings.session_idle_minutes * 60, settings.session_max_hours * 3600))
    return token


@dataclass
class RedisSession:
    id: str
    user_id: int
    version: int


_TOUCH = """
local value = redis.call('GET', KEYS[1])
if not value then return nil end
local data = cjson.decode(value)
local remaining = tonumber(data.expires) - tonumber(ARGV[1])
if remaining <= 0 then redis.call('DEL', KEYS[1]); return nil end
redis.call('EXPIRE', KEYS[1], math.min(remaining, tonumber(ARGV[2])))
return value
"""


def resolve_session(db: Session, token: str | None) -> RedisSession | None:
    if not token or not re.fullmatch(r"[0-9a-f]{64}", token):
        return None
    sid = session_id_for(token)
    value = get_redis().eval(_TOUCH, 1, key(f"session:{sid}"), int(time.time()),
                             get_settings().session_idle_minutes * 60)
    if not value:
        return None
    data = json.loads(value)
    return RedisSession(sid, int(data["user_id"]), int(data["version"]))


def delete_session(db: Session, token: str | None) -> None:
    if token and re.fullmatch(r"[0-9a-f]{64}", token):
        get_redis().delete(key(f"session:{session_id_for(token)}"))


def delete_user_sessions(db: Session, user_id: int, keep_session_id: str | None = None) -> None:
    # Revocation shares the SQL transaction with password/role/active-state changes.
    db.execute(update(AppUser).where(AppUser.id == user_id).values(
        session_version=AppUser.session_version + 1))
    db.flush()
    user = db.get(AppUser, user_id)
    db.refresh(user, ["session_version"])
    if keep_session_id:
        session_key = key(f"session:{keep_session_id}")
        get_redis().eval("""
local value = redis.call('GET', KEYS[1])
if not value then return 0 end
local data = cjson.decode(value)
data.version = tonumber(ARGV[1])
redis.call('SET', KEYS[1], cjson.encode(data), 'KEEPTTL')
return 1
""", 1, session_key, user.session_version)
