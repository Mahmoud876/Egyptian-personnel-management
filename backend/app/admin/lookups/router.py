"""Lookup endpoints: /lookups/<kind>. Reading needs any signed-in user (dropdowns everywhere use them);
creating and editing need lookups.manage.
"""

from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.admin.models import ActionType, BatchSchedule, Governorate, PoliceStation, Qualification, WorkEntity
from app.core.audit import client_ip
from app.core.db import get_db
from app.core.permissions import CurrentUser, require_permission

from . import service
from .schemas import (
    ActionTypeIn,
    ActionTypeOut,
    BatchScheduleOut,
    BatchScheduleUpdate,
    GovernorateIn,
    GovernorateOut,
    PoliceStationIn,
    PoliceStationOut,
    QualificationIn,
    QualificationOut,
    WorkEntityIn,
    WorkEntityOut,
)
from .service import LookupKind

router = APIRouter(prefix="/lookups", tags=["lookups"])


def _register(
    kind: LookupKind,
    name: str,
    out_model: type[BaseModel],
    in_model: type[BaseModel],
    creatable: bool = True,
) -> None:
    path = f"/{kind.path}"

    def list_rows(_: CurrentUser = Depends(require_permission()), db: Session = Depends(get_db)) -> list[BaseModel]:
        return [out_model.model_validate(row, from_attributes=True) for row in service.list_rows(db, kind)]

    router.add_api_route(path, list_rows, methods=["GET"], response_model=list[out_model], name=f"list_{name}")

    if creatable:

        def create_row(
            body: in_model,  # type: ignore[valid-type]
            request: Request,
            actor: CurrentUser = Depends(require_permission("lookups.manage")),
            db: Session = Depends(get_db),
        ) -> BaseModel:
            row = service.create_row(db, actor, kind, body, client_ip(request))
            return out_model.model_validate(row, from_attributes=True)

        router.add_api_route(
            path, create_row, methods=["POST"], response_model=out_model,
            status_code=status.HTTP_201_CREATED, name=f"create_{name}",
        )

    def update_row(
        row_id: int,
        body: in_model,  # type: ignore[valid-type]
        request: Request,
        actor: CurrentUser = Depends(require_permission("lookups.manage")),
        db: Session = Depends(get_db),
    ) -> BaseModel:
        row = service.update_row(db, actor, kind, row_id, body, client_ip(request))
        return out_model.model_validate(row, from_attributes=True)

    router.add_api_route(f"{path}/{{row_id}}", update_row, methods=["PUT"], response_model=out_model, name=f"update_{name}")


_register(LookupKind("governorates", Governorate, "code"), "governorate", GovernorateOut, GovernorateIn)
_register(
    LookupKind("police-stations", PoliceStation, "code", service.validate_police_station),
    "police_station", PoliceStationOut, PoliceStationIn,
)
_register(LookupKind("qualifications", Qualification, "code"), "qualification", QualificationOut, QualificationIn)
# Batches are fixed (1-4, docs/business-rules.md#upload): only their start date can be edited.
_register(
    LookupKind("batch-schedules", BatchSchedule, "batch_no"), "batch_schedule", BatchScheduleOut, BatchScheduleUpdate,
    creatable=False,
)
_register(LookupKind("work-entities", WorkEntity, "code"), "work_entity", WorkEntityOut, WorkEntityIn)
_register(LookupKind("action-types", ActionType, "code"), "action_type", ActionTypeOut, ActionTypeIn)
