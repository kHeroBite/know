from __future__ import annotations
from sqlalchemy import Table, Column, String, DateTime, MetaData

메타데이터 = MetaData()

계정테이블 = Table(
    "accounts",
    메타데이터,
    Column("_USER_ID", String(32), primary_key=True),
    Column("_NAME", String(10)),
    Column("_PASSWORD", String(128)),   # 평문 또는 bcrypt 해시
    Column("_AUTH", String(1)),          # A=admin, W=write, R=read, N=none
    Column("_EMAIL", String(128)),
    Column("_UPDATED", DateTime),
    Column("_CREATED", DateTime),
)
