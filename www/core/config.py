from __future__ import annotations
import os
import logging
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)


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

    # CORS 허용 오리진 (쉼표 구분, 환경변수 ALLOWED_ORIGINS)
    ALLOWED_ORIGINS: str = "*"

    class Config:
        env_file = ".env"


설정값 = 설정()

# JWT_SECRET 기본값 경고
if 설정값.JWT_SECRET == "change-me-in-production":
    logger.warning(
        "⚠️  JWT_SECRET이 기본값입니다. 프로덕션에서는 반드시 환경변수로 변경하세요."
    )
