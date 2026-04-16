from __future__ import annotations
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from core.database import db_session
from api.auth import get_current_user
from models.email_contact import EmailContact

라우터 = APIRouter()


class EmailContactCreate(BaseModel):
    name: str
    email: str


class EmailContactResponse(BaseModel):
    id: int
    name: str
    email: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


@라우터.get("/email-contacts")
def list_email_contacts(
    db: Session = Depends(db_session),
    _: dict = Depends(get_current_user),
):
    rows = db.query(EmailContact).order_by(EmailContact.id).all()
    return [EmailContactResponse.model_validate(r) for r in rows]


@라우터.post("/email-contacts", response_model=EmailContactResponse, status_code=status.HTTP_201_CREATED)
def create_email_contact(
    요청: EmailContactCreate,
    db: Session = Depends(db_session),
    _: dict = Depends(get_current_user),
):
    contact = EmailContact(name=요청.name, email=요청.email, created_at=datetime.now())
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return EmailContactResponse.model_validate(contact)


@라우터.delete("/email-contacts/{contact_id}", status_code=status.HTTP_200_OK)
def delete_email_contact(
    contact_id: int,
    db: Session = Depends(db_session),
    _: dict = Depends(get_current_user),
):
    contact = db.query(EmailContact).filter(EmailContact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"연락처 ID {contact_id}를 찾을 수 없습니다")
    db.delete(contact)
    db.commit()
    return {"message": f"연락처 ID {contact_id} 삭제 완료"}
