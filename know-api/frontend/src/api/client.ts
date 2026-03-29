import axios from 'axios'

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
    if (err.response?.status === 401) {
      // 로그인/비밀번호찾기 요청의 401은 리다이렉트하지 않음 (에러 메시지 표시 필요)
      const url = err.config?.url || ''
      if (!url.includes('/auth/login') && !url.includes('/auth/forgot-password')) {
        localStorage.removeItem('access_token')
        localStorage.removeItem('auth-storage')
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export default 클라이언트
