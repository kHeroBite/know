import { useState, useEffect } from 'react'
import { Layout as AntLayout, Menu, Button, Typography } from 'antd'
import { Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom'
import {
  LogoutOutlined, ApiOutlined, AppstoreOutlined, FilterOutlined,
  TeamOutlined, EditOutlined, TagsOutlined, RocketOutlined, BulbOutlined,
  SettingOutlined, BarChartOutlined, HistoryOutlined, UserOutlined, QuestionCircleOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../stores/authStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { workspaceAPI } from '../api/workspace'
import { isMenuEnabled } from '../App'

const { Sider, Content } = AntLayout

export default function Layout() {
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const navigate = useNavigate()
  const location = useLocation()
  const { selectedWorkspace, selectedDomain, selectedColor, phase, myPhase } = useWorkspaceStore()
  const wsSelected = !!selectedWorkspace

  // ─── 핫키 표시 (REQ-17) ─────────────────────────────
  const 핫키기본값: Record<string, string> = {
    focusAnalysis: 'Home', aiAnalysis: '/', undoHistory: 'Escape',
  }
  const [핫키맵, set핫키맵] = useState<Record<string, string>>(핫키기본값)

  useEffect(() => {
    if (!selectedWorkspace) return
    workspaceAPI.getHotkeys()
      .then(({ data }) => set핫키맵({ ...핫키기본값, ...(data || {}) }))
      .catch(() => {})
  }, [selectedWorkspace])

  const keyDisplayMap: Record<string, string> = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Escape: 'Esc', Home: 'Home',
  }
  const displayKey = (key: string) => {
    if (!key) return ''
    if (key.includes('+')) return key.split('+').map(p => keyDisplayMap[p] || p).join('+')
    return keyDisplayMap[key] || key
  }

  // 사이드바 메뉴 ↔ 핫키 매핑
  const 메뉴핫키매핑: Record<string, string> = {
    '/knowledge-work': 'focusAnalysis',
  }
  const 핫키라벨 = (label: string, menuKey: string) => {
    if (!wsSelected) return label
    const hotkeyId = 메뉴핫키매핑[menuKey]
    if (!hotkeyId) return label
    const key = 핫키맵[hotkeyId]
    if (!key) return label
    return <>{label} <span style={{ opacity: 0.45, fontSize: 10, fontWeight: 400 }}>({displayKey(key)})</span></>
  }

  useEffect(() => {
    if (selectedWorkspace && selectedDomain) {
      useWorkspaceStore.getState().loadWorkspaceStatus()
    }
  }, [selectedWorkspace, selectedDomain])

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
      label: '지식 작업',
      icon: <BulbOutlined />,
      children: [
        { key: '/workspace', label: '워크스페이스', icon: <AppstoreOutlined /> },
        { key: '/preprocess', label: '데이터 전처리', icon: <FilterOutlined />, disabled: !wsSelected || phase !== 'preprocess' },
        { key: '/assignment', label: '데이터 할당', icon: <TeamOutlined />, disabled: !wsSelected || phase !== 'work' || myPhase !== 'idle' },
        { key: '/knowledge-work', label: '작업실', icon: <EditOutlined />, disabled: !wsSelected || phase !== 'work' || myPhase !== 'working' },
        { key: '/build-history', label: '사전 빌드', icon: <HistoryOutlined />, disabled: !wsSelected || phase !== 'build' },
        { key: '/dict-verify', label: '사전 검증', icon: <CheckCircleOutlined />, disabled: !wsSelected || phase !== 'verify' },
        { key: '/category', label: '카테고리 관리', icon: <TagsOutlined />, disabled: !wsSelected || phase !== 'work' || myPhase !== 'working' },
        { key: '/pipeline', label: '파이프라인', icon: <RocketOutlined />, disabled: !wsSelected || phase !== 'work' || myPhase !== 'working' },
        { key: '/knowledge', label: '지식작업', icon: <BulbOutlined />, disabled: !wsSelected || phase !== 'work' || myPhase !== 'working' },
      ],
    },
    {
      key: 'admin-group',
      label: '관리',
      icon: <SettingOutlined />,
      children: [
        { key: '/domain-manage', label: '도메인 관리', icon: <SettingOutlined /> },
        { key: '/statistics', label: '통계', icon: <BarChartOutlined /> },
        { key: '/llm-settings', label: 'LLM 설정', icon: <ApiOutlined /> },
        ...(user?.auth === 'A' ? [{ key: '/accounts', label: '계정 관리', icon: <UserOutlined /> }] : []),
      ],
    },
    {
      key: 'help-group',
      label: '도움말',
      icon: <QuestionCircleOutlined />,
      children: [
        { key: '/manual', label: '매뉴얼', icon: <QuestionCircleOutlined /> },
      ],
    },
  ]

  // disabled 판정용 flat 맵
  const disabledKeys = new Set(
    menuItems.flatMap(g => (g.children || []).filter((c: any) => c.disabled).map((c: any) => c.key))
  )

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider className="app-sider" style={{ position: 'fixed', left: 0, top: 0, bottom: 0, height: '100vh', zIndex: 100 }}>
        <div className="app-sider-title">
          {/* 학사모 로고 아이콘 */}
          <svg
            viewBox="0 0 64 64"
            width="36"
            height="36"
            style={{ display: 'block', margin: '0 auto 6px' }}
          >
            <polygon
              points="32,8 60,24 32,40 4,24"
              fill="rgba(255,255,255,0.9)"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="1"
            />
            <path
              d="M16,28 L16,42 Q32,54 48,42 L48,28"
              fill="rgba(255,255,255,0.2)"
              stroke="rgba(255,255,255,0.5)"
              strokeWidth="1"
            />
            <line x1="52" y1="22" x2="56" y2="38" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
            <circle cx="56" cy="40" r="3" fill="rgba(255,255,255,0.8)" />
          </svg>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.5px' }}>
            지식작업소
          </div>
          <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.65, letterSpacing: '1px' }}>
            {selectedWorkspace
              ? selectedDomain
                ? `${selectedWorkspace}-${selectedDomain}`
                : selectedWorkspace
              : '미선택'}
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[location.pathname]}
            defaultOpenKeys={['knowledge-group', 'admin-group', 'help-group']}
            items={menuItems}
            onClick={({ key }) => {
              if (!disabledKeys.has(key)) {
                navigate(key)
                useWorkspaceStore.getState().setLastMenu(key)
              }
            }}
          />
        </div>
        {/* 사용자 정보 + 로그아웃 — 항상 최하단 고정 */}
        <div className="app-sider-footer">
          <Typography.Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>
            {user?.name} ({user?.auth})
          </Typography.Text>
          <Button
            type="text"
            size="small"
            icon={<LogoutOutlined />}
            onClick={logout}
            className="logout-btn"
            style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, padding: '0 4px' }}
          >
            로그아웃
          </Button>
        </div>
      </Sider>
      <AntLayout>
        <Content style={{ margin: 16, marginLeft: 216, overflowX: 'hidden' }}>
          {location.pathname !== '/' && !isMenuEnabled(location.pathname, { wsSelected, phase, myPhase })
            ? <Navigate to="/" replace />
            : <Outlet />
          }
        </Content>
      </AntLayout>
    </AntLayout>
  )
}
