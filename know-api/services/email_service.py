import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from core.config import 설정값


def 비밀번호초기화메일발송(수신자: str, user_id: str, 새비밀번호: str):
    if not 설정값.SMTP_HOST:
        raise RuntimeError("SMTP 설정이 없습니다 (.env에 SMTP_HOST 등 설정 필요)")
    msg = MIMEMultipart()
    msg["From"] = 설정값.SMTP_FROM or 설정값.SMTP_USER
    msg["To"] = 수신자
    msg["Subject"] = "[지식작업소] 비밀번호 초기화 안내"
    본문 = f"""안녕하세요.

지식작업소 계정 비밀번호가 초기화되었습니다.

아이디: {user_id}
새 비밀번호: {새비밀번호}

로그인 후 반드시 비밀번호를 변경해주세요.

- 지식작업소 관리자
"""
    msg.attach(MIMEText(본문, "plain", "utf-8"))
    with smtplib.SMTP(설정값.SMTP_HOST, 설정값.SMTP_PORT) as server:
        if 설정값.SMTP_USER and 설정값.SMTP_PASS:
            server.starttls()
            server.login(설정값.SMTP_USER, 설정값.SMTP_PASS)
        server.send_message(msg)
