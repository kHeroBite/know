from __future__ import annotations
import re
from sqlalchemy import Table, Column, String, DateTime, Text, MetaData

# 사이트명 검증 패턴 (SQL Injection 방지)
_사이트명패턴 = re.compile(r'^[A-Za-z0-9_]+$')


def 사이트명검증(site: str) -> str:
    """사이트명 유효성 검증 — SQL Injection 방지."""
    if not _사이트명패턴.match(site):
        raise ValueError(f"잘못된 사이트명: {site!r} (영문자/숫자/언더스코어만 허용)")
    return site.upper()


def 사전테이블가져오기(site: str, dic_type: str, metadata: MetaData) -> Table:
    """도메인별 동적 사전 테이블 정의 반환.

    Args:
        site: 도메인 사이트명 (DOMAIN_MNG._SITE)
        dic_type: 사전 타입 (udic|cndic|thesaurus|category)
        metadata: SQLAlchemy MetaData 인스턴스

    Returns:
        Table 객체
    """
    사이트명검증(site)
    suffix_map = {
        "udic": "_UDIC",
        "cndic": "_CNDIC",
        "thesaurus": "_THESAURUS",
        "category": "_CATEGORY",
    }
    if dic_type not in suffix_map:
        raise ValueError(f"알 수 없는 사전 타입: {dic_type}")

    table_name = f"{site.upper()}{suffix_map[dic_type]}"

    # 이미 메타데이터에 등록된 경우 반환
    if table_name in metadata.tables:
        return metadata.tables[table_name]

    if dic_type in ("udic", "cndic"):
        return Table(
            table_name, metadata,
            Column("_WORD", String(128), primary_key=True),
            Column("_MEMO", String(128)),
            Column("_USER_ID", String(32)),
            Column("_UPDATED", DateTime),
        )
    elif dic_type == "thesaurus":
        return Table(
            table_name, metadata,
            Column("_HEAD_WORD", String(128), primary_key=True),
            Column("_TAIL_WORD", Text),   # 쉼표/줄바꿈 구분 동의어 목록
            Column("_MEMO", String(128)),
            Column("_USER_ID", String(32)),
            Column("_UPDATED", DateTime),
        )
    else:  # category
        return Table(
            table_name, metadata,
            Column("_WORD", String(128), primary_key=True),
            Column("_DISPLAY_CATEGORY", String(128)),
            Column("_DELETE_CATEGORY", String(128)),
            Column("_USER_ID", String(32)),
            Column("_UPDATED", DateTime),
        )


def 도메인테이블생성(site: str, engine) -> None:
    """신규 도메인 등록 시 4개 사전 테이블 CREATE TABLE."""
    사이트명검증(site)
    meta = MetaData()
    for dic_type in ("udic", "cndic", "thesaurus", "category"):
        사전테이블가져오기(site, dic_type, meta)
    meta.create_all(engine)


def 도메인테이블삭제(site: str, engine) -> None:
    """도메인 삭제 시 4개 사전 테이블 DROP TABLE."""
    사이트명검증(site)
    meta = MetaData()
    for dic_type in ("udic", "cndic", "thesaurus", "category"):
        사전테이블가져오기(site, dic_type, meta)
    meta.drop_all(engine)
