from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Connection

from app.core.db import get_engine
from app.main import create_app


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(create_app()) as test_client:
        yield test_client


@pytest.fixture
def db() -> Iterator[Connection]:
    """Connection as the app login inside a transaction that is always rolled back."""
    with get_engine().connect() as connection:
        transaction = connection.begin()
        try:
            yield connection
        finally:
            transaction.rollback()
