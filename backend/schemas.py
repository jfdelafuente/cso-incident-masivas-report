from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Any
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
    cFTTH: str
    cMobile: str
    brands: str
    ministry: bool
    platform: bool

class ReportCreate(BaseModel):
    year: int
    week: int
    range: str
    dept: str
    incidents: List[IncidentBase] = []
    status: str = "draft"
    created_by: Optional[str] = None
    notes: Optional[str] = None

class ReportUpdate(BaseModel):
    incidents: Optional[Any] = None
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
