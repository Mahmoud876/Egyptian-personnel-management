from typing import Annotated

from pydantic import BaseModel, StringConstraints

TemplateName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]


class TemplateOut(BaseModel):
    id: int
    name_ar: str
    description_ar: str | None
    permissions: list[str]


class TemplateIn(BaseModel):
    name_ar: TemplateName
    description_ar: Description | None = None
    permissions: list[Annotated[str, StringConstraints(min_length=1, max_length=100)]]
