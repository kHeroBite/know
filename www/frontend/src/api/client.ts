import axios from 'axios'

const HTTP_ERROR_MESSAGES: Record<number, string> = {
  400: '잘못된 요청입니다.',
  401: '로그인이 필요합니다.',
  403: '접근 권한이 없습니다.',
  404: '요청한 리소스를 찾을 수 없습니다.',
  409: '이미 존재하거나 충돌이 발생했습니다.',
  422: '입력값을 확인해 주세요.',
  500: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
}

const 클라이언트 = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

클라이언트.interceptors.request.use(config => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

클라이언트.interceptors.response.use(
  res => res,
  err => {
    const status = err.response?.status
    if (status === 401) {
      // 로그인/비밀번호찾기 요청의 401은 리다이렉트하지 않음 (에러 메시지 표시 필요)
      const url = err.config?.url || ''
      if (!url.includes('/auth/login') && !url.includes('/auth/forgot-password')) {
        localStorage.removeItem('access_token')
        localStorage.removeItem('auth-storage')
        window.location.href = '/login'
      }
    }
    if (status && HTTP_ERROR_MESSAGES[status] && !err.response?.data?.detail) {
      err.response.data = { ...err.response.data, detail: HTTP_ERROR_MESSAGES[status] }
    }
    return Promise.reject(err)
  }
)

export default 클라이언트
