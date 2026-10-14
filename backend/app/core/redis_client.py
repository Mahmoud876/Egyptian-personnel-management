from functools import lru_cache

from redis import Redis

from app.core.config import get_settings


@lru_cache
def get_redis() -> Redis:
    return Redis.from_url(get_settings().redis_url.get_secret_value(), socket_connect_timeout=5,
                          socket_timeout=10, health_check_interval=30)


def key(suffix: str) -> str:
    return f"{get_settings().redis_prefix}:{suffix}"
