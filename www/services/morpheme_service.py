"""단일 키워드 analyze_morpheme 서비스 — jiana Java 직접 호출"""
import logging
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

from core.constants import DEFAULT_JIANA_HOME, JAVA_HOME, KNOW_OPS_SRC, WORKSPACE_BASE
MORPHEME_TIMEOUT = 30  # 단일 키워드이므로 30초 충분


def analyze_morpheme(keyword: str, domain: Optional[str] = None, jiana_home: Optional[str] = None) -> dict:
    """단일 키워드를 jiana Java 직접 호출로 analyze_morpheme.

    Args:
        keyword: 분析할 키워드 문자열
        domain: 도메인 (현재 미사용, 향후 사전 컨텍스트 연동용)
        jiana_home: jiana 홈 경로 (None이면 오류)

    Returns:
        {"keyword": str, "result": str, "tokens": list[str]}
    """
    if not keyword or not keyword.strip():
        return {"keyword": keyword, "result": "", "tokens": []}

    if not jiana_home:
        raise ValueError("jiana_home 경로가 없습니다. workspace에 jiana/ 디렉토리가 필요합니다.")
    jh = jiana_home
    lib_path = f"{jh}/lib"
    classpath = f"{lib_path}/jiana1.5.jar:{lib_path}/dqdic-1.0.3.jar"

    # LiteTest에 전달하는 jiana 루트: data/ 폴더가 바로 있는 경로여야 함.
    # workspace jiana: {jh}/data/ 존재
    # domain jiana-dist: {jh}/resources/korean/data/ 존재 → resources/korean을 루트로 사용
    jh_data_root = jh
    if not os.path.isdir(os.path.join(jh, "data")):
        candidate = os.path.join(jh, "resources", "korean")
        if os.path.isdir(os.path.join(candidate, "data")):
            jh_data_root = candidate

    with tempfile.TemporaryDirectory(prefix="morph_") as tmpdir:
        input_file = Path(tmpdir) / "input.txt"
        output_file = Path(tmpdir) / "output.txt"
        input_file.write_text(keyword.strip() + "\n", encoding="utf-8")

        env = os.environ.copy()
        env["JAVA_HOME"] = JAVA_HOME
        env["PATH"] = f"{JAVA_HOME}/bin:{env.get('PATH', '')}"

        try:
            proc = subprocess.run(
                [
                    f"{JAVA_HOME}/bin/java",
                    "-Dfile.encoding=UTF-8",
                    "-classpath", classpath,
                    "test.LiteTest",
                    f"{jh_data_root}/",
                    "use",
                    str(input_file),
                    str(output_file),
                ],
                capture_output=True,
                text=False,  # bytes 모드 — locale 독립적
                timeout=MORPHEME_TIMEOUT,
                env=env,
                cwd=jh,
            )

            if proc.returncode != 0:
                stderr_txt = proc.stderr.decode("utf-8", errors="replace")[:500]
                logger.warning("jiana 실패 (rc=%d): %s", proc.returncode, stderr_txt)
                return {
                    "keyword": keyword,
                    "result": f"분析 실패: {stderr_txt[:200]}",
                    "tokens": [],
                }

            # 결과 파일 읽기
            if output_file.exists():
                result_text = output_file.read_text(encoding="utf-8", errors="replace").strip()
            else:
                result_text = proc.stdout.strip() if proc.stdout else ""

            tokens = [line.strip() for line in result_text.split("\n") if line.strip()]
            return {
                "keyword": keyword,
                "result": result_text,
                "tokens": tokens,
            }

        except subprocess.TimeoutExpired:
            logger.error("analyze_morpheme 타임아웃 (%d초): %s", MORPHEME_TIMEOUT, keyword)
            return {
                "keyword": keyword,
                "result": f"분析 타임아웃 ({MORPHEME_TIMEOUT}초 초과)",
                "tokens": [],
            }
        except FileNotFoundError:
            logger.error("java run_phase1_service 파일 없음: %s", JAVA_HOME)
            return {
                "keyword": keyword,
                "result": f"Java run_phase1_service 파일 없음: {JAVA_HOME}/bin/java",
                "tokens": [],
            }
        except Exception as e:
            logger.exception("analyze_morpheme 예외: %s", e)
            return {
                "keyword": keyword,
                "result": f"분析 오류: {str(e)[:200]}",
                "tokens": [],
            }


def analyze_morpheme_full(keyword: str, domain: Optional[str] = None, jiana_home: Optional[str] = None) -> dict:
    """FullTest 기반 analyze_morpheme — 품사태그 포함.

    Returns:
        {"keyword": str, "result": str, "tokens": list[str]}
        result 형식: "어절\\t형태소 품사\\t형태소 품사\\n..."
    """
    if not keyword or not keyword.strip():
        return {"keyword": keyword, "result": "", "tokens": []}

    if not jiana_home:
        raise ValueError("jiana_home 경로가 없습니다. workspace에 jiana/ 디렉토리가 필요합니다.")
    jh = jiana_home
    lib_path = f"{jh}/lib"
    classpath = f"{lib_path}/jiana1.5.jar:{lib_path}/dqdic-1.0.3.jar"
    # LiteTest와 동일한 jiana 루트 결정 로직 적용
    # workspace jiana인 경우 jh/data/ 존재 → jh 사용 (최신 udic)
    # 구버전 엔진 경로인 경우 jh/resources/korean fallback
    resource_path = jh
    if not os.path.isdir(os.path.join(jh, "data")):
        candidate = os.path.join(jh, "resources", "korean")
        if os.path.isdir(os.path.join(candidate, "data")):
            resource_path = candidate

    with tempfile.TemporaryDirectory(prefix="morph_full_") as tmpdir:
        input_file = Path(tmpdir) / "input.txt"
        output_file = Path(tmpdir) / "output.txt"
        input_file.write_text(keyword.strip() + "\n", encoding="utf-8")

        env = os.environ.copy()
        env["MARINER2_HOME"] = jh

        try:
            proc = subprocess.run(
                [
                    "java",
                    "-classpath", classpath,
                    "test.FullTest",
                    resource_path,
                    str(input_file),
                    str(output_file),
                ],
                capture_output=True,
                text=False,
                timeout=MORPHEME_TIMEOUT,
                env=env,
                cwd=jh,
            )

            if proc.returncode != 0:
                stderr_txt = proc.stderr.decode("utf-8", errors="replace")[:500]
                logger.warning("FullTest 실패 (rc=%d): %s", proc.returncode, stderr_txt)
                return {
                    "keyword": keyword,
                    "result": f"분析 실패: {stderr_txt[:200]}",
                    "tokens": [],
                }

            if output_file.exists():
                result_text = output_file.read_text(encoding="utf-8", errors="replace").strip()
            else:
                result_text = ""

            tokens = [line.strip() for line in result_text.split("\n") if line.strip()]
            return {
                "keyword": keyword,
                "result": result_text,
                "tokens": tokens,
            }

        except subprocess.TimeoutExpired:
            logger.error("FullTest 타임아웃 (%d초): %s", MORPHEME_TIMEOUT, keyword)
            return {
                "keyword": keyword,
                "result": f"분析 타임아웃 ({MORPHEME_TIMEOUT}초 초과)",
                "tokens": [],
            }
        except FileNotFoundError:
            logger.error("java run_phase1_service 파일 없음")
            return {
                "keyword": keyword,
                "result": "Java run_phase1_service 파일 없음",
                "tokens": [],
            }
        except Exception as e:
            logger.exception("FullTest 예외: %s", e)
            return {
                "keyword": keyword,
                "result": f"분析 오류: {str(e)[:200]}",
                "tokens": [],
            }





def _ensure_know_ops_path() -> None:
    if KNOW_OPS_SRC not in sys.path:
        sys.path.insert(0, KNOW_OPS_SRC)


def _find_synonym_path(workspace: str) -> Optional[Path]:
    """워크스페이스의 유사어사전 경로 탐색. 없으면 None."""
    candidates = [
        Path(WORKSPACE_BASE) / workspace / "synonym_full_v2.txt",
        Path(WORKSPACE_BASE) / workspace / "build" / "work" / "synonym_full_v2.txt",
        Path(WORKSPACE_BASE) / workspace / "work" / "synonym_full_v2.txt",
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


def _build_config(workspace: str, jiana_home: Optional[str] = None):
    """know-ops 설정 객체 생성 (형태소分析래퍼용)."""
    _ensure_know_ops_path()
    from know.core.config import 설정

    if not jiana_home:
        raise ValueError("jiana_home 경로가 없습니다.")
    jh = Path(jiana_home)
    lib_path = jh.parent / "lib" if (jh.parent / "lib").exists() else jh / "lib"

    설정값 = 설정()
    jar1 = lib_path / "jiana1.5.jar"
    jar2 = lib_path / "dqdic-1.0.3.jar"
    if jar1.exists():
        설정값.jiana_jar경로 = jar1
    if jar2.exists():
        설정값.dqdic_jar경로 = jar2
    return 설정값


def analyze_realtime(keyword: str, domain: str, workspace: str) -> dict:
    """단일 키워드 실시간 LITE 分析 파이프라인.

    1. LiteTest 형태소分析 (analyze_morpheme() 재사용)
    2. 결과변환 (형태소결과변환기 사용)
    3. check_synonyms (check_single_synonym() 사용)

    Returns:
        {"keyword": str, "analysis": str}
    """
    if not keyword or not keyword.strip():
        return {"keyword": keyword, "analysis": ""}

    if not workspace:
        return {"keyword": keyword, "analysis": "오류: workspace가 지정되지 않았습니다."}
    ws_jiana = Path(WORKSPACE_BASE) / workspace / "jiana"
    if not ws_jiana.exists():
        return {"keyword": keyword, "analysis": f"오류: {ws_jiana} 경로가 없습니다."}
    jiana_home = str(ws_jiana)

    morph_result = analyze_morpheme(keyword, domain, jiana_home=jiana_home)
    raw_text = morph_result.get("result", "")

    if not raw_text or raw_text.startswith("분析"):
        return {"keyword": keyword, "analysis": raw_text}

    # Step 2: 결과변환 (임시파일 기반)
    transformed = raw_text
    try:
        _ensure_know_ops_path()
        from know.pipeline.변환.형태소결과변환기 import 형태소결과변환기

        with tempfile.TemporaryDirectory(prefix="realtime_") as tmpdir:
            tmp_analyzed = Path(tmpdir) / "analyzed.txt"
            tmp_analyzed.write_text(raw_text, encoding="utf-8")
            변환기 = 형태소결과변환기()
            transformed_path = 변환기.변환(tmp_analyzed)
            if transformed_path.exists():
                transformed = transformed_path.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        logger.warning("결과변환 실패, raw 사용: %s", e)

    # Step 3: check_synonyms
    analysis = transformed
    if workspace:
        syn_path = _find_synonym_path(workspace)
        if syn_path:
            try:
                from phase1.synonym_checker import check_single_synonym
                config = None
                try:
                    config = _build_config(workspace, jiana_home)
                except Exception as e:
                    logger.warning("설정값 생성 실패, 유사어 형태소分析 스킵: %s", e)
                analysis = check_single_synonym(keyword, transformed, syn_path, config)
            except Exception as e:
                logger.warning("check_synonyms 실패, transform 결과 반환: %s", e)

    return {"keyword": keyword, "analysis": analysis}


def analyze_realtime_full(keyword: str, domain: str, workspace: str) -> dict:
    """단일 키워드 실시간 FULL 分析 파이프라인.

    1. FullTest 형태소分析 (analyze_morpheme_full() 재사용)
    2. 유사어사전 로드
    3. 유사어 정보 병합

    Returns:
        {"keyword": str, "full_analysis": str}
    """
    if not keyword or not keyword.strip():
        return {"keyword": keyword, "full_analysis": ""}

    if not workspace:
        return {"keyword": keyword, "full_analysis": "오류: workspace가 지정되지 않았습니다."}
    ws_jiana = Path(WORKSPACE_BASE) / workspace / "jiana"
    if not ws_jiana.exists():
        return {"keyword": keyword, "full_analysis": f"오류: {ws_jiana} 경로가 없습니다."}
    jiana_home = str(ws_jiana)

    # Step 1: 풀형태소分析
    morph_result = analyze_morpheme_full(keyword, domain, jiana_home=jiana_home)
    raw_text = morph_result.get("result", "")

    if not raw_text or raw_text.startswith("분析"):
        return {"keyword": keyword, "full_analysis": raw_text}

    # Step 2: 유사어 정보 병합
    full_analysis = raw_text
    if workspace:
        syn_path = _find_synonym_path(workspace)
        if syn_path:
            try:
                from phase1.synonym_checker import _load_synonym_dict
                사전 = _load_synonym_dict(syn_path)
                lines_out = []
                for line in raw_text.splitlines():
                    lines_out.append(line)
                    if "\t" in line:
                        headkwd = line.split("\t")[0].strip()
                        if headkwd in 사전:
                            lines_out.append(f"<<{사전[headkwd]}>>")
                full_analysis = "\n".join(lines_out)
            except Exception as e:
                logger.warning("FULL 유사어 병합 실패, raw 반환: %s", e)

    return {"keyword": keyword, "full_analysis": full_analysis}


