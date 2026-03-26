import { useEffect } from 'react'
import { Layout as AntLayout, Menu, Button, Typography } from 'antd'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useWorkspaceStore } from '../stores/workspaceStore'

const { Sider, Content, Header } = AntLayout

export default function Layout() {
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const navigate = useNavigate()
  const location = useLocation()
  const { selectedWorkspace, selectedDomain, selectedColor } = useWorkspaceStore()

  useEffect(() => {
    const color = selectedColor || '#1a1a2e'
    document.documentElement.style.setProperty('--theme-color', color)
    if (selectedColor) {
      document.documentElement.style.setProperty('--primary', selectedColor)
      document.documentElement.style.setProperty('--primary-hover', selectedColor)
      document.documentElement.style.setProperty('--sider-bg-start', selectedColor)
      document.documentElement.style.setProperty('--sider-bg-end', selectedColor)
    } else {
      document.documentElement.style.removeProperty('--primary')
      document.documentElement.style.removeProperty('--primary-hover')
      document.documentElement.style.removeProperty('--sider-bg-start')
      document.documentElement.style.removeProperty('--sider-bg-end')
    }
  }, [selectedColor])

  const menuItems = [
    {
      key: 'knowledge-group',
      label: '지식작업',
      children: [
        { key: '/workspace', label: '워크스페이스' },
        { key: '/preprocess', label: '데이터 전처리' },
        { key: '/dictionary', label: '사전 관리' },
        { key: '/category', label: '카테고리 관리' },
        { key: '/pipeline', label: '파이프라인' },
        { key: '/knowledge', label: '지식작업' },
      ],
    },
    {
      key: 'admin-group',
      label: '관리',
      children: [
        { key: '/statistics', label: '통계' },
        { key: '/build-history', label: '빌드이력' },
      ],
    },
  ]

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider className="app-sider">
        <div className="app-sider-title">
          {selectedWorkspace
            ? selectedDomain
              ? `지식작업소(${selectedWorkspace}-${selectedDomain})`
              : `지식작업소(${selectedWorkspace})`
            : '지식작업소'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          defaultOpenKeys={['knowledge-group', 'admin-group']}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <AntLayout>
        <Header className="app-header" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '0 16px' }}>
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
