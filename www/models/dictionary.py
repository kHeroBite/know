from __future__ import annotations
import re
from sqlalchemy import Table, Column, String, DateTime, Text, MetaData

# 사이트명 검증 패턴 (SQL Injection 방지 — SQLAlchemy가 테이블명 자동 따옴표 처리)
_사이트명패턴 = re.compile(r'^[A-Za-z0-9_.]+$')


def validate_site_name(site: str) -> str:
    """사이트명 유효성 검증 — SQL Injection 방지."""
    if not _사이트명패턴.match(site):
        raise ValueError(f"잘못된 사이트명: {site!r} (영문자/숫자/언더스코어/점만 허용)")
    return site.upper()


def get_dict_table(site: str, dic_type: str, metadata: MetaData) -> Table:
    """도메인별 동적 사전 테이블 정의 반환.

    Args:
        site: 도메인 사이트명 (DOMAIN_MNG._SITE)
        dic_type: 사전 타입 (udic|cndic|thesaurus|category)
        metadata: SQLAlchemy MetaData 인스턴스

    Returns:
        Table 객체
    """
    validate_site_name(site)
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
            Column("_TAIL_WORD", Text),   # 쉼표/줄바꿈 구분 동의어 list_tasks
            Column("_MEMO", String(128)),
            Column("_USER_ID", String(32)),
            Column("_UPDATED", DateTime),
        )
    else:  # category
        return Table(
            table_name, metadata,
            Column("_WORD", String(128), primary_key=True),
            Column("_DISPLAY_CATEGORY", String(1024)),
            Column("_DELETE_CATEGORY", String(128)),
            Column("_USER_ID", String(32)),
            Column("_UPDATED", DateTime),
        )


def create_domain_table(site: str, engine) -> None:
    """신규 도메인 등록 시 4개 사전 테이블 CREATE TABLE."""
    validate_site_name(site)
    meta = MetaData()
    for dic_type in ("udic", "cndic", "thesaurus", "category"):
        get_dict_table(site, dic_type, meta)
    meta.create_all(engine)


def drop_domain_table(site: str, engine) -> None:
    """도메인 삭제 시 4개 사전 테이블 DROP TABLE."""
    validate_site_name(site)
    meta = MetaData()
    for dic_type in ("udic", "cndic", "thesaurus", "category"):
        get_dict_table(site, dic_type, meta)
    meta.drop_all(engine)


# ── 워크스페이스 사전 테이블 ──

def ws_dict_site_name(workspace: str, domain: str) -> str:
    """워크스페이스 사전 테이블용 사이트명 생성. 예: WS_A_EPOST"""
    safe_ws = re.sub(r'[^A-Za-z0-9]', '_', workspace)
    return f"WS_{safe_ws}_{domain}".upper()


def ws_create_dict_table(workspace: str, domain: str, engine) -> None:
    """워크스페이스 사전 테이블 4개 CREATE TABLE."""
    site = ws_dict_site_name(workspace, domain)
    create_domain_table(site, engine)


def ws_drop_dict_table(workspace: str, domain: str, engine) -> None:
    """워크스페이스 사전 테이블 4개 DROP TABLE."""
    site = ws_dict_site_name(workspace, domain)
    drop_domain_table(site, engine)


def ws_copy_dict_data(workspace: str, domain: str, engine) -> int:
    """도메인 사전 4개 테이블 데이터를 워크스페이스 사전으로 복사. 총 복사 건수 반환."""
    from sqlalchemy import text
    src_site = domain.upper()
    dst_site = ws_dict_site_name(workspace, domain)
    validate_site_name(src_site)
    validate_site_name(dst_site)
    suffixes = ["_UDIC", "_CNDIC", "_THESAURUS", "_CATEGORY"]
    total = 0
    with engine.connect() as conn:
        for suffix in suffixes:
            src_table = f"{src_site}{suffix}"
            dst_table = f"{dst_site}{suffix}"
            # 테이블 존재 확인 후 복사
            try:
                result = conn.execute(text(f"INSERT INTO {dst_table} SELECT * FROM {src_table}"))
                total += result.rowcount
            except Exception:
                pass  # 원본 테이블이 비어있거나 없으면 무시
        conn.commit()
    return total


def ws_reverse_copy_dict_data(workspace: str, domain: str, engine) -> dict:
    """워크스페이스 사전 4개 테이블 데이터를 도메인 사전으로 역방향 복사.

    트랜잭션 내에서 DELETE FROM {domain}_{TYPE} + INSERT FROM WS_{SAFE_WS}_{DOMAIN}_{TYPE}.
    WS 테이블이 없으면 해당 타입 0건으로 진행(에러 없음).

    Returns:
        {"udic": N, "cndic": N, "thesaurus": N, "category": N}
    """
    import logging
    from sqlalchemy import text
    logger = logging.getLogger(__name__)

    dst_site = domain.upper()
    src_site = ws_dict_site_name(workspace, domain)
    validate_site_name(dst_site)
    validate_site_name(src_site)

    type_map = [
        ("udic", "_UDIC"),
        ("cndic", "_CNDIC"),
        ("thesaurus", "_THESAURUS"),
        ("category", "_CATEGORY"),
    ]
    result_counts = {"udic": 0, "cndic": 0, "thesaurus": 0, "category": 0}

    with engine.connect() as conn:
        trans = conn.begin()
        try:
            for type_key, suffix in type_map:
                src_table = f"{src_site}{suffix}"
                dst_table = f"{dst_site}{suffix}"
                # WS 테이블 존재 확인 (SQLite sqlite_master)
                try:
                    exists = conn.execute(
                        text("SELECT name FROM sqlite_master WHERE type='table' AND name=:n"),
                        {"n": src_table},
                    ).fetchone()
                except Exception:
                    exists = None
                if not exists:
                    logger.info("ws_reverse_copy: %s 테이블 없음 — 0건 복사", src_table)
                    continue
                # 도메인 테이블 비우고 WS 데이터 전체 삽입
                conn.execute(text(f"DELETE FROM {dst_table}"))
                insert_res = conn.execute(
                    text(f"INSERT INTO {dst_table} SELECT * FROM {src_table}")
                )
                cnt = insert_res.rowcount if insert_res.rowcount is not None else 0
                result_counts[type_key] = cnt
                logger.info("ws_reverse_copy: %s → %s %d건 복사", src_table, dst_table, cnt)
            trans.commit()
        except Exception:
            trans.rollback()
            raise
    return result_counts
