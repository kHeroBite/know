import { useState } from 'react'
import { Form, Input, Button, Card, message } from 'antd'
import { useAuthStore } from '../stores/authStore'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const login = useAuthStore(s => s.login)
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  async function onFinish(values: { user_id: string; password: string }) {
    setLoading(true)
    try {
      await login(values.user_id, values.password)
      navigate('/')
    } catch {
      message.error('아이디 또는 비밀번호가 올바르지 않습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f0f2f5' }}>
      <Card title="know 관리 시스템" style={{ width: 360 }}>
        <Form form={form} onFinish={onFinish} layout="vertical">
          <Form.Item name="user_id" label="아이디" rules={[{ required: true, message: '아이디를 입력하세요.' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="비밀번호" rules={[{ required: true, message: '비밀번호를 입력하세요.' }]}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>로그인</Button>
        </Form>
      </Card>
    </div>
  )
}
