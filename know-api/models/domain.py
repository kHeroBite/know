from __future__ import annotations
from sqlalchemy import Table, Column, String, Integer, DateTime, MetaData

메타데이터 = MetaData()

도메인테이블 = Table(
    "DOMAIN_MNG",
    메타데이터,
    Column("_SITE", String(128), primary_key=True),
    Column("_MEMO", String(128)),
    Column("_IP", String(16)),
    Column("_PORT", Integer),
    Column("_URL", String(256)),
    Column("_PARAM", String(128)),
    Column("_USER_ID", String(32)),
    Column("_CREATED", DateTime),
)
