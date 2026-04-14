"""email_service.py — SMTP 이메일 전송.

- 비밀번호 초기화 안내 (기존)
- 완료 백업 리포트 + 공유 URL 전송 (신규)
"""
from __future__ import annotations

import logging
import smtplib
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email import encoders
from pathlib import Path
from typing import Iterable

from core.config import 설정값

logger = logging.getLogger(__name__)

MAX_ATTACH_BYTES = 15 * 1024 * 1024  # 15MB (SMTP 일반 한도 대비 여유)


def _smtp_send(msg: MIMEMultipart) -> None:
    """SMTP 서버로 메시지 전송. 설정이 없으면 RuntimeError."""
    if not 설정값.SMTP_HOST:
        raise RuntimeError("SMTP 설정이 없습니다 (.env에 SMTP_HOST 등 설정 필요)")
    with smtplib.SMTP(설정값.SMTP_HOST, 설정값.SMTP_PORT) as server:
        if 설정값.SMTP_USER and 설정값.SMTP_PASS:
            server.starttls()
            server.login(설정값.SMTP_USER, 설정값.SMTP_PASS)
        server.send_message(msg)


def send_password_reset_email(수신자: str, user_id: str, 새비밀번호: str):
    if not 설정값.SMTP_HOST:
        raise RuntimeError("SMTP 설정이 없습니다 (.env에 SMTP_HOST 등 설정 필요)")
    msg = MIMEMultipart()
    msg["From"] = 설정값.SMTP_FROM or 설정값.SMTP_USER
    msg["To"] = 수신자
    msg["Subject"] = "[지식작업소] 비밀번호 initialize 안내"
    본문 = f"""안녕하세요.

지식작업소 계정 비밀번호가 초기화되었습니다.

아이디: {user_id}
새 비밀번호: {새비밀번호}

login 후 반드시 비밀번호를 변경해주세요.

- 지식작업소 관리자
"""
    msg.attach(MIMEText(본문, "plain", "utf-8"))
    _smtp_send(msg)


def _attach_file(msg: MIMEMultipart, path: Path) -> bool:
    """파일을 MIME 첨부. 크기 초과 시 False."""
    try:
        size = path.stat().st_size
    except OSError:
        return False
    if size > MAX_ATTACH_BYTES:
        logger.warning("첨부 생략 (크기 초과 %d bytes): %s", size, path)
        return False
    try:
        with open(path, "rb") as f:
            part = MIMEBase("application", "octet-stream")
            part.set_payload(f.read())
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", f'attachment; filename="{path.name}"')
        msg.attach(part)
        return True
    except OSError as e:
        logger.warning("첨부 실패 %s: %s", path, e)
        return False


def send_backup_email(
    to: str,
    workspace: str,
    backup_folder: str,
    share_url: str,
    attachments: Iterable[Path] | None = None,
    subject: str | None = None,
    extra_body: str = "",
) -> dict:
    """완료 리포트 + 공유 URL 이메일 전송.

    attachments: PPT, data.tar 등. 크기 초과 시 첨부 생략(링크는 본문에 유지).
    반환: {sent: bool, attached: [파일명], skipped: [파일명]}
    """
    msg = MIMEMultipart()
    msg["From"] = 설정값.SMTP_FROM or 설정값.SMTP_USER or "noreply@know-ops"
    msg["To"] = to
    msg["Subject"] = subject or f"[지식작업소] '{workspace}' 완료 리포트"

    body_lines = [
        f"워크스페이스 '{workspace}' 가 완료되었습니다.",
        "",
        f"백업 폴더: {backup_folder}",
        f"공유 페이지: {share_url}",
        "",
        "첨부된 PPT 리포트 또는 위 공유 링크에서 상세 내역을 확인하실 수 있습니다.",
    ]
    if extra_body:
        body_lines.append("")
        body_lines.append(extra_body)
    body_lines.append("")
    body_lines.append("- 지식작업소")
    msg.attach(MIMEText("\n".join(body_lines), "plain", "utf-8"))

    attached: list[str] = []
    skipped: list[str] = []
    for p in attachments or []:
        path = Path(p)
        if not path.exists():
            skipped.append(path.name)
            continue
        if _attach_file(msg, path):
            attached.append(path.name)
        else:
            skipped.append(path.name)

    _smtp_send(msg)
    logger.info("백업 메일 전송: to=%s ws=%s attached=%s skipped=%s", to, workspace, attached, skipped)
    return {"sent": True, "attached": attached, "skipped": skipped}
