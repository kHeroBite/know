"""know-ops CLI — 지식팀 Ops 자동화 도구."""
from __future__ import annotations

import click
from pathlib import Path

from know import __version__


@click.group()
@click.version_option(version=__version__, prog_name="know-ops")
def 메인():
    """지식팀 Ops 자동화 CLI 도구."""
    pass


@메인.command("refine")
@click.argument("입력파일", required=False, type=click.Path(path_type=Path))
@click.option("--도메인", default="default", help="도메인명 (예: site1, site2)")
@click.option("--출력", type=click.Path(path_type=Path), help="출력 파일 경로")
def 정제(입력파일: Path | None, 도메인: str, 출력: Path | None):
    """질의로그 스팸 정제 (refine_log_spam.sh 대체)."""
    from know.core.config import 기본설정
    from know.pipeline.정제.검색로그정제기 import 검색로그정제기

    실제입력파일 = 입력파일 or (기본설정.work_경로 / "keywords.txt")
    if not 실제입력파일.exists():
        raise click.ClickException(f"입력파일 없음: {실제입력파일}")

    정제기 = 검색로그정제기()
    결과파일 = 정제기.정제(실제입력파일, 도메인, 출력)
    click.echo(f"✅ 정제 완료: {결과파일}")


@메인.command("analyze")
@click.argument("입력파일", required=False, type=click.Path(path_type=Path))
@click.option("--도메인", default="default", help="도메인명")
@click.option("--출력", type=click.Path(path_type=Path), help="출력 파일 경로")
def 분석(입력파일: Path | None, 도메인: str, 출력: Path | None):
    """형태소 분석 (cotton_test.sh 대체)."""
    from know.core.config import 기본설정
    from know.pipeline.분석.형태소분석래퍼 import 형태소분석래퍼

    실제입력파일 = 입력파일 or (기본설정.work_경로 / "refine.txt")
    if not 실제입력파일.exists():
        raise click.ClickException(f"입력파일 없음: {실제입력파일}")

    실제출력파일 = 출력 or (기본설정.work_경로 / "analyzed.txt")

    래퍼 = 형태소분석래퍼()
    결과파일 = 래퍼.분석(실제입력파일, 도메인, 실제출력파일)
    click.echo(f"✅ 분석 완료: {결과파일}")


@메인.command("synonym")
@click.argument("입력", required=False, type=click.Path(path_type=Path))
@click.option("--출력", type=click.Path(path_type=Path), help="출력 파일 경로 (기본: txt_resrc/synonym.UTF-8)")
def 유사어(입력: Path | None, 출력: Path | None):
    """유사어 사전 생성 (makepair.pl + keymake.pl 대체).

    입력: *.pair 디렉토리 또는 단일 .pair 파일 (기본: workspace/txt_resrc/)
    출력: key,syn1,syn2,... 형식 synonym.UTF-8 (기본: workspace/txt_resrc/synonym.UTF-8)
    """
    from know.core.config import 기본설정
    from know.pipeline.유사어.페어관리기 import 페어관리기

    실제입력 = 입력 or 기본설정.txt_resrc_경로
    if not Path(실제입력).exists():
        raise click.ClickException(f"입력 경로 없음: {실제입력}")

    관리기 = 페어관리기()
    결과파일 = 관리기.페어처리(Path(실제입력), 출력)
    click.echo(f"✅ 유사어 처리 완료: {결과파일}")


@메인.command("build")
@click.option("--대상", default="dic",
              type=click.Choice(["dic", "all", "clean"]),
              help="빌드 대상 (dic: 사전만, all: 전체, clean: 정리)")
def 빌드(대상: str):
    """사전 빌드 (ant dic 실행).

    ant를 workspace/ 디렉토리에서 실행하여 txt_resrc/ → data/*.dcd 컴파일.
    """
    from know.pipeline.빌드.사전빌드래퍼 import 사전빌드래퍼
    래퍼 = 사전빌드래퍼()
    결과 = 래퍼.빌드(대상)
    click.echo(f"✅ 빌드 완료: {결과['대상']} — {결과['상태']}")


@메인.command("extract")
@click.option("--모드", "모드", default="rank",
              type=click.Choice(["rank", "count"]),
              help="rank: 상위 N등, count: N회 이상")
@click.option("--n", "n값", default=150000, type=int,
              help="등수(rank) 또는 최소횟수(count)")
@click.option("--출력", type=click.Path(path_type=Path),
              help="출력 파일 경로 (기본: workspace/work/keywords.txt)")
def 추출(모드: str, n값: int, 출력: Path | None):
    """인기/실패 검색어 추출 + 스팸정제 (pop_log + fail_log -> 통합 키워드)."""
    from know.pipeline.추출.키워드추출기 import 키워드추출기
    from know.core.config import 기본설정
    추출기 = 키워드추출기()
    결과파일 = 추출기.추출(
        기본설정.pop_log_경로,
        기본설정.fail_log_경로,
        출력 or 기본설정.work_경로 / "keywords.txt",
        모드=모드,
        n=n값,
    )
    click.echo(f"✅ 추출 완료: {결과파일}")


@메인.command("pipeline")
@click.argument("입력파일", type=click.Path(exists=True, path_type=Path))
@click.option("--도메인", default="default", help="도메인명")
@click.option("--단계", default="all",
              type=click.Choice(["all", "extract", "refine", "analyze", "synonym", "build"]),
              help="실행할 파이프라인 단계")
def 파이프라인(입력파일: Path, 도메인: str, 단계: str):
    """전체 파이프라인 실행 (extract → refine → analyze → synonym → build)."""
    click.echo(f"🚀 파이프라인 시작 — 도메인: {도메인}, 단계: {단계}")

    단계_순서 = ["extract", "refine", "analyze", "synonym", "build"]
    실행_단계들 = 단계_순서 if 단계 == "all" else [단계]

    from know.core.config import 기본설정

    추출산출물 = 기본설정.work_경로 / "keywords.txt"
    정제산출물 = 기본설정.work_경로 / "refine.txt"
    현재입력파일 = 입력파일

    for 현재단계 in 실행_단계들:
        click.echo(f"▶ {현재단계} 단계 실행 중...")
        if 현재단계 == "extract":
            from know.pipeline.추출.키워드추출기 import 키워드추출기
            추출기 = 키워드추출기()
            추출기.추출(
                기본설정.pop_log_경로,
                기본설정.fail_log_경로,
                추출산출물,
            )
            현재입력파일 = 추출산출물
            click.echo(f"  ✅ {현재단계} 완료")
        elif 현재단계 == "refine":
            from know.pipeline.정제.검색로그정제기 import 검색로그정제기

            정제기 = 검색로그정제기()
            정제입력 = 추출산출물 if 단계 == "all" else 현재입력파일
            출력파일 = 정제산출물 if 정제입력 == 추출산출물 else None
            결과파일 = 정제기.정제(정제입력, 도메인, 출력파일)
            현재입력파일 = 결과파일
            click.echo(f"  ✅ {현재단계} 완료: {결과파일}")
        else:
            click.echo(f"  (상세 구현은 Phase 2에서 추가 예정)")
