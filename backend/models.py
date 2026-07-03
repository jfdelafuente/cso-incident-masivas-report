from sqlalchemy import Column, String, Integer, DateTime, Text, JSON
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()

class Report(Base):
    __tablename__ = "reports"

    id = Column(String, primary_key=True)  # Format: YYYY-WXX (e.g., 2026-W26)
    year = Column(Integer, nullable=False)
    week = Column(Integer, nullable=False)
    range = Column(String, nullable=False)
    dept = Column(String, nullable=False)
    incidents = Column(JSON, nullable=False, default=list)
    status = Column(String, default="draft")  # draft, reviewed, published
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    notes = Column(Text, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "year": self.year,
            "week": self.week,
            "range": self.range,
            "dept": self.dept,
            "incidents": self.incidents,
            "status": self.status,
            "createdBy": self.created_by,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
            "notes": self.notes,
        }
