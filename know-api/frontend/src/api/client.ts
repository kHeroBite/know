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
      localStorage.removeItem('access_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default 클라이언트
