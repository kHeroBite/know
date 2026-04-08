# services/dict_export_service.py — 사전 내보내기 서비스
"""
DB thesaurus/udic/cndic 내보내기 함수 분리.
pipeline/build_wrapper.py → phase1/executor.py 역방향 import 해소 목적.
"""
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def export_db_thesaurus_to_file(workspace: str, domain: str, 출력파일: Path) -> int:
    """DB thesaurus 테이블을 synonym_full_v2.txt(CSV) 형식으로 내보내기."""
    from core.database import 세션팩토리
    from sqlalchemy import text
    from models.dictionary import ws_dict_site_name

    db = 세션팩토리()
    try:
        site = ws_dict_site_name(workspace, domain)
        rows = db.execute(text(f"SELECT _HEAD_WORD, _TAIL_WORD FROM {site}_THESAURUS")).fetchall()
        cnt = 0
        with open(출력파일, "w", encoding="utf-8") as f:
            for head, tail in rows:
                if not head:
                    continue
                tails = [t.strip() for t in (tail or "").split(",") if t.strip()]
                if tails:
                    f.write(f"{head.strip()},{','.join(tails)}\n")
                    cnt += 1
        return cnt
    except Exception as e:
        logger.warning(f"DB thesaurus 내보내기 실패: {e}")
        return 0
    finally:
        db.close()
