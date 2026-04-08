# core/exceptions.py — 커스텀 예외 클래스
"""
전역 예외 핸들러(main.py)에서 처리되는 프로젝트 공통 예외.
"""


class KnowAPIError(Exception):
    """프로젝트 공통 API 예외 기반 클래스."""

    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class NotFoundError(KnowAPIError):
    """리소스를 찾을 수 없을 때 (404)."""

    def __init__(self, resource: str):
        super().__init__(f"{resource}를 찾을 수 없습니다.", 404)


class ValidationError(KnowAPIError):
    """입력값 검증 실패 (400)."""

    def __init__(self, message: str):
        super().__init__(message, 400)


class UnauthorizedError(KnowAPIError):
    """인증이 필요하거나 실패 (401)."""

    def __init__(self):
        super().__init__("인증이 필요합니다.", 401)
