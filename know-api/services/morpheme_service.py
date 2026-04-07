"""단일 키워드 형태소분석 서비스 — jiana Java 직접 호출"""
import logging
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

DEFAULT_JIANA_HOME = "/home/know/jiana1.5.12"
JAVA_HOME = "/home/know/jdk1.7.0_80"
MORPHEME_TIMEOUT = 30  # 단일 키워드이므로 30초 충분


def 형태소분석(keyword: str, domain: Optional[str] = None, jiana_home: Optional[str] = None) -> dict:
    """단일 키워드를 jiana Java 직접 호출로 형태소분석.

    Args:
        keyword: 분석할 키워드 문자열
        domain: 도메인 (현재 미사용, 향후 사전 컨텍스트 연동용)
        jiana_home: jiana 홈 경로 (None이면 기본값 사용)

    Returns:
        {"keyword": str, "result": str, "tokens": list[str]}
    """
    if not keyword or not keyword.strip():
        return {"keyword": keyword, "result": "", "tokens": []}

    jh = jiana_home or DEFAULT_JIANA_HOME
    lib_path = f"{jh}/lib"
    classpath = f"{lib_path}/jiana1.5.jar:{lib_path}/dqdic-1.0.3.jar"

    with tempfile.TemporaryDirectory(prefix="morph_") as tmpdir:
        input_file = Path(tmpdir) / "input.txt"
        output_file = Path(tmpdir) / "output.txt"
        input_file.write_text(keyword.strip() + "\n", encoding="euc-kr", errors="replace")

        env = os.environ.copy()
        env["JAVA_HOME"] = JAVA_HOME
        env["PATH"] = f"{JAVA_HOME}/bin:{env.get('PATH', '')}"

        try:
            proc = subprocess.run(
                [
                    f"{JAVA_HOME}/bin/java",
                    "-Dfile.encoding=EUC-KR",
                    "-classpath", classpath,
                    "test.LiteTest",
                    f"{jh}/",
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
                    "result": f"분석 실패: {stderr_txt[:200]}",
                    "tokens": [],
                }

            # 결과 파일 읽기
            if output_file.exists():
                result_text = output_file.read_text(encoding="euc-kr", errors="replace").strip()
            else:
                result_text = proc.stdout.strip() if proc.stdout else ""

            tokens = [line.strip() for line in result_text.split("\n") if line.strip()]
            return {
                "keyword": keyword,
                "result": result_text,
                "tokens": tokens,
            }

        except subprocess.TimeoutExpired:
            logger.error("형태소분석 타임아웃 (%d초): %s", MORPHEME_TIMEOUT, keyword)
            return {
                "keyword": keyword,
                "result": f"분석 타임아웃 ({MORPHEME_TIMEOUT}초 초과)",
                "tokens": [],
            }
        except FileNotFoundError:
            logger.error("java 실행 파일 없음: %s", JAVA_HOME)
            return {
                "keyword": keyword,
                "result": f"Java 실행 파일 없음: {JAVA_HOME}/bin/java",
                "tokens": [],
            }
        except Exception as e:
            logger.exception("형태소분석 예외: %s", e)
            return {
                "keyword": keyword,
                "result": f"분석 오류: {str(e)[:200]}",
                "tokens": [],
            }


def 풀형태소분석(keyword: str, domain: Optional[str] = None, jiana_home: Optional[str] = None) -> dict:
    """FullTest 기반 형태소분석 — 품사태그 포함.

    Returns:
        {"keyword": str, "result": str, "tokens": list[str]}
        result 형식: "어절\\t형태소 품사\\t형태소 품사\\n..."
    """
    if not keyword or not keyword.strip():
        return {"keyword": keyword, "result": "", "tokens": []}

    jh = jiana_home or DEFAULT_JIANA_HOME
    lib_path = f"{jh}/lib"
    classpath = f"{lib_path}/jiana1.5.jar:{lib_path}/dqdic-1.0.3.jar"
    resource_path = f"{jh}/resources/korean"

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
                    "result": f"분석 실패: {stderr_txt[:200]}",
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
                "result": f"분석 타임아웃 ({MORPHEME_TIMEOUT}초 초과)",
                "tokens": [],
            }
        except FileNotFoundError:
            logger.error("java 실행 파일 없음")
            return {
                "keyword": keyword,
                "result": "Java 실행 파일 없음",
                "tokens": [],
            }
        except Exception as e:
            logger.exception("FullTest 예외: %s", e)
            return {
                "keyword": keyword,
                "result": f"분석 오류: {str(e)[:200]}",
                "tokens": [],
            }
