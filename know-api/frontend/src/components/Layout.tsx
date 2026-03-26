import { Layout as AntLayout, Menu, Button, Typography } from 'antd'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

const { Sider, Content, Header } = AntLayout

export default function Layout() {
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const navigate = useNavigate()
  const location = useLocation()

  const menuItems = [
    { key: '/workspace', label: '워크스페이스' },
    { key: '/preprocess', label: '데이터 전처리' },
    { key: '/domains', label: '도메인 관리' },
    { key: '/dictionary', label: '사전 관리' },
    { key: '/category', label: '카테고리 관리' },
    { key: '/statistics', label: '통계' },
    { type: 'divider' as const },
    { key: '/pipeline', label: '파이프라인' },
    { key: '/knowledge', label: '지식작업' },
    { key: '/build-history', label: '빌드 이력' },
  ]

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider>
        <div style={{ color: '#fff', padding: '16px', fontWeight: 'bold' }}>know 관리</div>
        <Menu
          theme="dark"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <AntLayout>
        <Header style={{ background: '#fff', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '0 16px' }}>
          <Typography.Text style={{ marginRight: 16 }}>{user?.name} ({user?.auth})</Typography.Text>
          <Button onClick={logout}>로그아웃</Button>
        </Header>
        <Content style={{ margin: 16 }}>
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  )
}
