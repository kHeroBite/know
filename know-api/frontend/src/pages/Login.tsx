import { useState } from 'react'
import { Form, Input, Button, message, Alert, Modal } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { useAuthStore } from '../stores/authStore'
import { useNavigate } from 'react-router-dom'
import 클라이언트 from '../api/client'

const 학사모로고 = (
  <svg viewBox="0 0 120 120" width="80" height="80" className="login-logo-svg">
    <defs>
      <linearGradient id="capGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#60a5fa" />
        <stop offset="50%" stopColor="#818cf8" />
        <stop offset="100%" stopColor="#a78bfa" />
      </linearGradient>
      <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="rgba(129,140,248,0.4)" />
        <stop offset="100%" stopColor="rgba(96,165,250,0.1)" />
      </linearGradient>
      <linearGradient id="tasselGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#818cf8" />
        <stop offset="100%" stopColor="#60a5fa" />
      </linearGradient>
      <filter id="glow">
        <feGaussianBlur stdDeviation="2.5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="softGlow">
        <feGaussianBlur stdDeviation="4" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    {/* 외곽 링 장식 */}
    <circle cx="60" cy="60" r="56" fill="none" stroke="rgba(129,140,248,0.12)" strokeWidth="1" />
    <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(96,165,250,0.08)" strokeWidth="0.5" strokeDasharray="3 5" className="login-logo-ring" />
    {/* 학사모 윗판 */}
    <polygon points="60,18 108,44 60,70 12,44" fill="url(#capGrad)" filter="url(#glow)" />
    {/* 학사모 윗판 하이라이트 */}
    <polygon points="60,22 100,44 60,66 20,44" fill="rgba(255,255,255,0.08)" />
    {/* 학사모 아래 부분 */}
    <path d="M28,50 L28,72 Q60,94 92,72 L92,50" fill="url(#bodyGrad)" stroke="rgba(129,140,248,0.4)" strokeWidth="0.8" />
    {/* 술 줄 */}
    <line x1="98" y1="42" x2="105" y2="70" stroke="url(#tasselGrad)" strokeWidth="2" strokeLinecap="round" filter="url(#glow)" />
    {/* 술 끝 장식 */}
    <circle cx="105" cy="74" r="4.5" fill="#818cf8" filter="url(#softGlow)" className="login-logo-tassel" />
    {/* 중앙 빛나는 점 */}
    <circle cx="60" cy="43" r="2.5" fill="rgba(255,255,255,0.9)" className="login-logo-sparkle" />
    <circle cx="45" cy="38" r="1" fill="rgba(255,255,255,0.4)" className="login-logo-sparkle-2" />
    <circle cx="78" cy="38" r="1" fill="rgba(255,255,255,0.4)" className="login-logo-sparkle-3" />
  </svg>
)

export default function Login() {
  const login = useAuthStore(s => s.login)
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [에러, set에러] = useState<string | null>(null)
  const [찾기모달, set찾기모달] = useState(false)
  const [찾기로딩, set찾기로딩] = useState(false)
  const [찾기폼] = Form.useForm()

  async function onFinish(values: { user_id: string; password: string }) {
    setLoading(true)
    try {
      await login(values.user_id, values.password)
      navigate('/')
    } catch (e: any) {
      const detail = e?.response?.data?.detail || '아이디 또는 비밀번호가 올바르지 않습니다.'
      set에러(detail)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      {/* 배경 애니메이션 오브 */}
      <div className="login-bg-orb login-bg-orb-1" />
      <div className="login-bg-orb login-bg-orb-2" />
      <div className="login-bg-orb login-bg-orb-3" />

      {/* 그리드 패턴 오버레이 */}
      <div className="login-bg-grid" />

      {/* 로그인 카드 */}
      <div className="login-card">
        <div className="login-card-header">
          {학사모로고}
          <h1 className="login-title">지식작업소</h1>
          <p className="login-subtitle">Knowledge Workspace</p>
        </div>

        <Form form={form} onFinish={onFinish} layout="vertical" className="login-form">
          {에러 && <Alert message={에러} type="error" showIcon closable onClose={() => set에러(null)} style={{ marginBottom: 16 }} />}
          <Form.Item name="user_id" rules={[{ required: true, message: '아이디를 입력하세요.' }]}>
            <Input
              prefix={<UserOutlined className="login-input-icon" />}
              placeholder="아이디"
              size="large"
              className="login-input"
              autoFocus
            />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '비밀번호를 입력하세요.' }]}>
            <Input.Password
              prefix={<LockOutlined className="login-input-icon" />}
              placeholder="비밀번호"
              size="large"
              className="login-input"
            />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            block
            size="large"
            className="login-btn"
          >
            로그인
          </Button>
          <div style={{ textAlign: 'center', marginTop: 12 }}><a onClick={() => set찾기모달(true)} style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>비밀번호를 잊으셨나요?</a></div>
        </Form>

        <div className="login-footer">
          <span>&copy; 2026 지식작업소</span>
        </div>
      </div>

      <Modal title="비밀번호 찾기" open={찾기모달} onCancel={() => set찾기모달(false)} onOk={async () => {
        set찾기로딩(true)
        try {
          const vals = await 찾기폼.validateFields()
          const res = await 클라이언트.post('/auth/forgot-password', vals)
          message.success(res.data?.message || '임시 비밀번호가 이메일로 발송되었습니다.')
          set찾기모달(false)
          찾기폼.resetFields()
        } catch (e: any) {
          message.error(e?.response?.data?.detail || '비밀번호 찾기 실패')
        } finally {
          set찾기로딩(false)
        }
      }} okText="발송" cancelText="취소" confirmLoading={찾기로딩}>
        <Form form={찾기폼} layout="vertical">
          <Form.Item name="user_id" label="아이디" rules={[{ required: true, message: '아이디를 입력하세요' }]}>
            <Input placeholder="아이디" />
          </Form.Item>
          <Form.Item name="email" label="등록된 이메일" rules={[{ required: true, message: '이메일을 입력하세요' }, { type: 'email', message: '올바른 이메일을 입력하세요' }]}>
            <Input placeholder="가입 시 등록한 이메일" type="email" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
