"""Imports every model module so Base.metadata knows all tables (needed for FK resolution and the sync test)."""

from app.admin import models as admin_models
from app.core import models as core_models
from app.core.models import Base
from app.documents import models as documents_models
from app.migration import models as migration_models
from app.modules.conscripts import models as conscripts_models
from app.modules.employees import models as employees_models

__all__ = [
    "Base",
    "admin_models",
    "conscripts_models",
    "core_models",
    "documents_models",
    "employees_models",
    "migration_models",
]
