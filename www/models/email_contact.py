from __future__ import annotations
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime
from core.database import Base


class EmailContact(Base):
    __tablename__ = "email_contacts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(128), nullable=False)
    email = Column(String(256), nullable=False)
    created_at = Column(DateTime, default=datetime.now)
