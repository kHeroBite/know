"""know-ops CLI — 지식팀 Ops 자동화 도구."""
import click
from pathlib import Path

from know import __version__


@click.group()
@click.version_option(version=__version__, prog_name="know-ops")
def 메인():
    """지식팀 Ops 자동화 CLI 도구."""
    pass


@메인.command("refine")
@click.argument("입력파일", type=click.Path(exists=True, path_type=Path))
@click.option("--도메인", default="default", help="도메인명 (예: site1, site2)")
@click.option("--출력", type=click.Path(path_type=Path), help="출력 파일 경로")
def 정제(입력파일: Path, 도메인: str, 출력: Path | None):
    """질의로그 스팸 정제 (refine_log_spam.sh 대체)."""
    from know.pipeline.정제.검색로그정제기 import 검색로그정제기
    정제기 = 검색로그정제기()
    결과파일 = 정제기.정제(입력파일, 도메인, 출력)
    click.echo(f"✅ 정제 완료: {결과파일}")


@메인.command("analyze")
@click.argument("입력파일", type=click.Path(exists=True, path_type=Path))
@click.option("--도메인", default="default", help="도메인명")
@click.option("--출력", type=click.Path(path_type=Path), help="출력 파일 경로")
def 분석(입력파일: Path, 도메인: str, 출력: Path | None):
    """형태소 분석 (cotton_test.sh 대체)."""
    from know.pipeline.분석.형태소분석래퍼 import 형태소분석래퍼
    래퍼 = 형태소분석래퍼()
    결과파일 = 래퍼.분석(입력파일, 도메인, 출력)
    click.echo(f"✅ 분석 완료: {결과파일}")


@메인.command("synonym")
@click.argument("pair_파일", type=click.Path(exists=True, path_type=Path))
@click.option("--도메인", default="default", help="도메인명")
@click.option("--출력", type=click.Path(path_type=Path), help="출력 디렉토리")
def 유사어(pair_파일: Path, 도메인: str, 출력: Path | None):
    """유사어 페어 관리 (makepair.pl + keymake.pl + pair2list.pl + fdiff.pl 대체)."""
    from know.pipeline.유사어.페어관리기 import 페어관리기
    관리기 = 페어관리기()
    결과 = 관리기.페어처리(pair_파일, 도메인, 출력)
    click.echo(f"✅ 유사어 처리 완료: {결과}")


@메인.command("build")
@click.option("--도메인", default="default", help="도메인명")
@click.option("--대상", default="dic", help="빌드 대상 (dic/all)")
def 빌드(도메인: str, 대상: str):
    """사전 빌드 (jiana_dic_add.sh + ant dic 대체)."""
    from know.pipeline.빌드.사전빌드래퍼 import 사전빌드래퍼
    래퍼 = 사전빌드래퍼()
    결과 = 래퍼.빌드(도메인, 대상)
    click.echo(f"✅ 빌드 완료: {결과}")


@메인.command("pipeline")
@click.argument("입력파일", type=click.Path(exists=True, path_type=Path))
@click.option("--도메인", default="default", help="도메인명")
@click.option("--단계", default="all",
              type=click.Choice(["all", "refine", "analyze", "synonym", "build"]),
              help="실행할 파이프라인 단계")
def 파이프라인(입력파일: Path, 도메인: str, 단계: str):
    """전체 파이프라인 실행 (refine → analyze → synonym → build)."""
    click.echo(f"🚀 파이프라인 시작 — 도메인: {도메인}, 단계: {단계}")
    click.echo("(상세 구현은 Phase 2에서 추가 예정)")
