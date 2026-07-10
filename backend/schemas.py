from pydantic import BaseModel, ConfigDict, Field
from typing import List, Optional
from datetime import datetime

class IncidentBase(BaseModel):
    group: str
    severity: str
    category: str
    system: str
    title: str
    ticket: str
    date: str
    duration: str
    impact: str
    metrics: str
    cause: str
    solution: str
    actionPoints: str = ""
    cFTTH: str
    cMobile: str
    brands: str
    ministry: bool = False
    platform: bool = False

class ReportCreate(BaseModel):
    # Accepts either `created_by` or `createdBy` -- the latter is what a
    # previously-exported report (GET .../export, or the editor's "Guardar
    # JSON") has, since ReportResponse below outputs camelCase. This model
    # doubles as the import payload (see create_report()), so it needs to
    # round-trip its own export format.
    model_config = ConfigDict(populate_by_name=True)

    year: int
    week: int
    range: str
    dept: str
    incidents: List[IncidentBase] = []
    status: str = "draft"
    created_by: Optional[str] = Field(default=None, alias="createdBy")
    notes: Optional[str] = None

class ReportUpdate(BaseModel):
    incidents: Optional[List[IncidentBase]] = None
    status: Optional[str] = None
    notes: Optional[str] = None

    model_config = ConfigDict(extra='allow')

class ReportResponse(BaseModel):
    id: str
    year: int
    week: int
    range: str
    dept: str
    incidents: List[IncidentBase]
    status: str
    createdBy: Optional[str] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True
