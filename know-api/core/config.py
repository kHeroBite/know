from __future__ import annotations
from pydantic_settings import BaseSettings


class 설정(BaseSettings):
    DB_URL: str = "mysql+pymysql://root:@!roqkftjqj#@127.0.0.1:3306/know_mng?charset=utf8"
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480

    class Config:
        env_file = ".env"


설정값 = 설정()
