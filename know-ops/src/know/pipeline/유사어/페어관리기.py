"""유사어 페어 관리기 — 펄 스크립트 4종 Python 통합 대체.

대체 대상:
    - makepair.pl: 공백 구분 그룹 병합 (전이적 폐포)
    - keymake.pl: 각 키에 대해 key\tkey+동의어 매핑 생성
    - pair2list.pl: synonym->key 형식 -> key+동의어 그룹
    - fdiff.pl: 일부/전체 추가/삭제 diff

입력 형식 (공통): 공백 구분 동의어 그룹 (kor_kor.pair 형식)
    예: 나이키 NIKE 나이크
        투버튼 2버튼
"""
from __future__ import annotations

from pathlib import Path


def _대문자변환(텍스트: str) -> str:
    """makepair.pl의 \\U 플래그 동작 모사: 전체 대문자 변환.

    Perl의 '\\U' 플래그와 동일 — ASCII/한글 모두 upper() 적용
    (한글은 대소문자 없으므로 실질적으로 ASCII만 변환됨).
    """
    return 텍스트.upper()


class 페어관리기:
    """유사어 페어 관리기.

    makepair.pl + keymake.pl + pair2list.pl + fdiff.pl을 통합한 Python 구현.
    """

    def __init__(self, 설정값=None):
        from know.core.config import 기본설정
        self.설정값 = 설정값 or 기본설정

    # ── 그룹 로딩 ──────────────────────────────────────────────

    def 그룹로딩(self, 입력파일: Path) -> list[list[str]]:
        """공백 구분 동의어 그룹 파일 파싱 (makepair.pl 입력 형식).

        형식: word1 word2 word3 ... (공백 구분 동의어 그룹, 한 줄당 하나)
        반환: [["WORD1", "WORD2", ...], ...]  # 대문자 변환 적용
        """
        결과 = []
        with 입력파일.open(encoding="utf-8", errors="ignore") as f:
            for 줄 in f:
                줄 = _대문자변환(줄.strip())
                if not 줄 or 줄.startswith("#"):
                    continue
                단어들 = [w for w in 줄.split() if w]
                if 단어들:
                    결과.append(단어들)
        return 결과

    # ── makepair.pl 대체 ──────────────────────────────────────

    def 그룹병합(self, 그룹목록: list[list[str]]) -> list[list[str]]:
        """makepair.pl 대체: 공유 키 있는 그룹 전이적 병합.

        같은 키를 포함하는 모든 그룹을 하나로 합침 (Union-Find).
        출력: 대표키(lexicographically 첫번째) 기준 정렬된 그룹 목록.
        """
        parent: dict[str, str] = {}

        def find(x: str) -> str:
            if x not in parent:
                parent[x] = x
            while parent[x] != x:
                parent[x] = parent[parent[x]]  # 경로 압축
                x = parent[x]
            return x

        def union(a: str, b: str) -> None:
            ra, rb = find(a), find(b)
            if ra == rb:
                return
            # makepair.pl: 정렬 앞선 키를 대표키로 (sort keys %HASH 기반)
            if ra < rb:
                parent[rb] = ra
            else:
                parent[ra] = rb

        # 모든 단어 등록
        for 그룹 in 그룹목록:
            for 단어 in 그룹:
                if 단어 not in parent:
                    parent[단어] = 단어

        # 그룹 내 모든 단어 연결
        for 그룹 in 그룹목록:
            if len(그룹) > 1:
                for i in range(1, len(그룹)):
                    union(그룹[0], 그룹[i])

        # 컴포넌트별 단어 수집
        components: dict[str, list[str]] = {}
        for 단어 in sorted(parent.keys()):
            root = find(단어)
            if root not in components:
                components[root] = []
            components[root].append(단어)

        # 대표키 첫번째, 나머지 정렬 후 반환
        결과 = []
        for root in sorted(components.keys()):
            그룹 = components[root]
            나머지 = sorted([w for w in 그룹 if w != root])
            결과.append([root] + 나머지)
        return 결과

    def 그룹파일저장(self, 그룹목록: list[list[str]], 출력파일: Path) -> Path:
        """그룹 병합 결과를 공백 구분 그룹 파일로 저장 (makepair.pl 출력 형식)."""
        with 출력파일.open("w", encoding="utf-8") as f:
            for 그룹 in 그룹목록:
                if 그룹:
                    f.write(" ".join(그룹) + "\n")
        return 출력파일

    # ── keymake.pl 대체 ──────────────────────────────────────

    def 키맵핑생성(self, 그룹목록: list[list[str]], 출력파일: Path) -> Path:
        """keymake.pl 대체: 각 키에 대해 key\\tkey+동의어 매핑 파일 생성.

        형식: key\\tkey syn1 syn2 ... (키 정렬 순서로 출력)
        각 키가 자신의 그룹 맨 앞에 위치.

        예: 입력그룹 [NIKE, 나이키, 나이크] 에서
            NIKE\\tNIKE 나이크 나이키
            나이크\\t나이크 NIKE 나이키
            나이키\\t나이키 NIKE 나이크
        """
        lines = []
        for 그룹 in 그룹목록:
            for 키 in sorted(그룹):
                나머지 = sorted([w for w in 그룹 if w != 키])
                그룹문자열 = 키 + (" " + " ".join(나머지) if 나머지 else "")
                lines.append(f"{키}\t{그룹문자열}\n")

        with 출력파일.open("w", encoding="utf-8") as f:
            for 줄 in sorted(lines):
                f.write(줄)
        return 출력파일

    # ── pair2list.pl 대체 ─────────────────────────────────────

    def 페어2그룹변환(self, 입력파일: Path, 출력파일: Path) -> Path:
        """pair2list.pl 대체: synonym key 형식 -> key syn1 syn2 그룹 파일.

        입력 형식: synonym key  (공백 구분 2열 — 동의어 키 순)
        출력 형식: key syn1 syn2 ... (공백 구분 그룹)

        예: 입력 '나이크 NIKE' -> 출력 'NIKE 나이크'
        """
        그룹_맵: dict[str, list[str]] = {}

        with 입력파일.open(encoding="utf-8", errors="ignore") as f:
            for 줄 in f:
                줄 = 줄.strip()
                if not 줄 or 줄.startswith("#"):
                    continue
                parts = 줄.split(None, 1)
                if len(parts) < 2:
                    continue
                동의어, 키 = parts[0], parts[1]
                if 키 not in 그룹_맵:
                    그룹_맵[키] = [키]
                if 동의어 not in 그룹_맵[키]:
                    그룹_맵[키].append(동의어)

        with 출력파일.open("w", encoding="utf-8") as f:
            for 키 in sorted(그룹_맵.keys()):
                f.write(" ".join(그룹_맵[키]) + "\n")
        return 출력파일

    # ── fdiff.pl 대체 ────────────────────────────────────────

    def diff생성(
        self,
        기존파일: Path,
        신규파일: Path,
        출력파일: Path,
        단어파일: Path | None = None,
    ) -> Path:
        """fdiff.pl 대체: 공백 구분 그룹 파일 두 개 비교 -> 일부/전체 추가/삭제 분류.

        입력 형식: 공백 구분 동의어 그룹 (makepair.pl 출력 형식)
        출력: fdiff.pl과 동일한 섹션 구조 (일부/전체 추가/삭제 + <<표시>> 마킹)
        """
        # 기존 파일 로딩: 각 단어 -> 그룹줄 매핑
        기존_단어_맵: dict[str, str] = {}
        기존_그룹들: list[str] = []
        if 기존파일.exists():
            for 줄 in 기존파일.read_text(encoding="utf-8").splitlines():
                줄 = 줄.strip()
                if not 줄:
                    continue
                기존_그룹들.append(줄)
                for 단어 in 줄.split():
                    기존_단어_맵[단어] = 줄

        # 신규 파일 로딩
        신규_단어_맵: dict[str, str] = {}
        신규_그룹들: list[str] = []
        for 줄 in 신규파일.read_text(encoding="utf-8").splitlines():
            줄 = 줄.strip()
            if not 줄:
                continue
            신규_그룹들.append(줄)
            for 단어 in 줄.split():
                신규_단어_맵[단어] = 줄

        일부추가: dict[str, str] = {}
        전체추가: dict[str, str] = {}
        일부삭제: dict[str, str] = {}
        전체삭제: dict[str, str] = {}

        전체추가키: dict[str, int] = {}
        부분추가키: dict[str, int] = {}
        전체삭제키: dict[str, int] = {}
        부분삭제키: dict[str, int] = {}

        # 신규 그룹 분석 (추가 찾기)
        for 그룹줄 in 신규_그룹들:
            단어들 = 그룹줄.split()
            새단어들 = [w for w in 단어들 if w not in 기존_단어_맵]
            기존단어들 = [w for w in 단어들 if w in 기존_단어_맵]

            if not 새단어들:
                continue  # 완전히 기존 그룹 — 추가 없음

            # <<단어>> 마킹 (fdiff.pl 방식)
            표시된줄 = 그룹줄
            for 단어 in 새단어들:
                표시된줄 = 표시된줄.replace(단어, f"<<{단어}>>", 1)

            if not 기존단어들:
                전체추가[표시된줄] = "1"
                for 단어 in 새단어들:
                    전체추가키[단어 + " "] = 전체추가키.get(단어 + " ", 0) + 1
            else:
                일부추가[표시된줄] = "1"
                for 단어 in 새단어들:
                    부분추가키[단어 + " "] = 부분추가키.get(단어 + " ", 0) + 1

        # 기존 그룹 분석 (삭제 찾기)
        for 그룹줄 in 기존_그룹들:
            단어들 = 그룹줄.split()
            삭제단어들 = [w for w in 단어들 if w not in 신규_단어_맵]
            남은단어들 = [w for w in 단어들 if w in 신규_단어_맵]

            if not 삭제단어들:
                continue  # 모든 단어 유지 — 삭제 없음

            표시된줄 = 그룹줄
            for 단어 in 삭제단어들:
                표시된줄 = 표시된줄.replace(단어, f"<<{단어}>>", 1)

            if not 남은단어들:
                전체삭제[표시된줄] = "1"
                for 단어 in 삭제단어들:
                    전체삭제키[단어 + " "] = 전체삭제키.get(단어 + " ", 0) + 1
            else:
                일부삭제[표시된줄] = "1"
                for 단어 in 삭제단어들:
                    부분삭제키[단어 + " "] = 부분삭제키.get(단어 + " ", 0) + 1

        with 출력파일.open("w", encoding="utf-8") as f:
            f.write("============== 일부 추가 ===============\n")
            for 줄 in sorted(일부추가.keys()):
                f.write(f"{줄}\n")
            f.write("============== 전체 추가 ===============\n")
            for 줄 in sorted(전체추가.keys()):
                f.write(f"{줄}\n")
            f.write("============== 일부 삭제 ===============\n")
            for 줄 in sorted(일부삭제.keys()):
                f.write(f"{줄}\n")
            f.write("============== 전체 삭제 ===============\n")
            for 줄 in sorted(전체삭제.keys()):
                f.write(f"{줄}\n")

        # 단어 파일 (선택적 — fdiff.pl ARGV[3])
        if 단어파일:
            with 단어파일.open("w", encoding="utf-8") as f:
                f.write("============== 전체 추가 항목 ===============\n")
                for k in sorted(전체추가키.keys()):
                    f.write(f"{k}\n")
                f.write("============== 부분 추가 항목 ===============\n")
                for k in sorted(부분추가키.keys()):
                    f.write(f"{k}\n")
                f.write("============== 전체 삭제 항목 ===============\n")
                for k in sorted(전체삭제키.keys()):
                    f.write(f"{k}\n")
                f.write("============== 부분 삭제 항목 ===============\n")
                for k in sorted(부분삭제키.keys()):
                    f.write(f"{k}\n")

        return 출력파일

    # ── 통합 처리 ──────────────────────────────────────────────

    def 페어처리(
        self,
        입력파일: Path,
        도메인: str = "default",
        출력파일: Path | None = None,
    ) -> Path:
        """메인 처리: 공백 구분 그룹 파일 -> synonym.txt (쉼표 구분, synonym.UTF-8 형식).

        처리 순서:
            1. 그룹 로딩 (대문자 변환)
            2. 그룹 병합 (makepair.pl)
            3. synonym.txt 출력 (쉼표 구분)

        Args:
            입력파일: 공백 구분 동의어 그룹 파일 (kor_kor.pair 형식)
            도메인: 도메인명
            출력파일: 출력 경로 (기본: work/synonym.txt)

        Returns:
            synonym.txt 파일 경로
        """
        if 출력파일 is None:
            출력파일 = self.설정값.work_경로 / "synonym.txt"

        # 1. 그룹 로딩 (대문자 변환)
        그룹목록 = self.그룹로딩(입력파일)

        # 2. 그룹 병합 (makepair.pl)
        병합그룹 = self.그룹병합(그룹목록)

        # 3. synonym.txt 출력 (쉼표 구분 — synonym.UTF-8 형식)
        with 출력파일.open("w", encoding="utf-8") as f:
            for 그룹 in 병합그룹:
                if len(그룹) >= 2:  # 동의어 없는 단독 단어 제외
                    f.write(",".join(그룹) + "\n")

        return 출력파일


# ── 내부 유틸리티 ───────────────────────────────────────────

def _fdiff_정규식이스케이프(단어: str) -> str:
    """fdiff.pl 정규식 특수문자 이스케이프 (+ . ? * $ ^ 처리)."""
    for ch in ("+", ".", "?", "*", "$", "^"):
        단어 = 단어.replace(ch, "\\" + ch)
    return 단어
