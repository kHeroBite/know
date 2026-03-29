from __future__ import annotations
import os
from pydantic_settings import BaseSettings


class 설정(BaseSettings):
    DB_URL: str = "sqlite:///" + os.path.join(os.path.dirname(os.path.dirname(__file__)), "know.db")
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480

    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASS: str = ""
    SMTP_FROM: str = ""

    class Config:
        env_file = ".env"


설정값 = 설정()
