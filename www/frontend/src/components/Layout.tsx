import { useState, useEffect } from 'react'
import { Layout as AntLayout, Menu, Button, Typography, Tooltip, Progress } from 'antd'
import { Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom'
import {
  LogoutOutlined, ApiOutlined, AppstoreOutlined, FilterOutlined,
  TeamOutlined, EditOutlined, TagsOutlined, RocketOutlined, BulbOutlined,
  SettingOutlined, BarChartOutlined, HistoryOutlined, UserOutlined, QuestionCircleOutlined,
  CheckCircleOutlined, DashboardOutlined, GlobalOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../stores/authStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useGlobalTaskStore } from '../stores/globalTaskStore'
import { workspaceAPI } from '../api/workspace'
import { isMenuEnabled } from '../App'
import { useNotification } from '../hooks/useNotification'


const { Sider, Content } = AntLayout

// disabled 이유 결정
function getDisabledReason(key: string, wsSelected: boolean, phase: string, myPhase: string): string {
  if (!wsSelected) return '워크스페이스를 먼저 선택하세요'
  if (key === '/preprocess' && phase !== 'preprocess') return '전처리 단계가 아닙니다'
  if (key === '/assignment' && phase !== 'work') return '작업 단계가 아닙니다'
  if (key === '/assignment' && myPhase !== 'idle') return '이미 작업 중입니다'
  if (key === '/knowledge-work' && phase !== 'work') return '작업 단계가 아닙니다'
  if (key === '/knowledge-work' && myPhase !== 'working') return '데이터 할당을 먼저 받으세요'
  if (key === '/build-history' && phase !== 'build') return '빌드 단계가 아닙니다'
  if (key === '/dict-verify' && phase !== 'verify') return '검증 단계가 아닙니다'
  if (key === '/work-complete' && phase !== 'verify' && phase !== 'complete') return '검증 완료 후 사용 가능합니다'
  if ((key === '/category' || key === '/pipeline' || key === '/knowledge') && phase !== 'work') return '작업 단계가 아닙니다'
  if ((key === '/category' || key === '/pipeline' || key === '/knowledge') && myPhase !== 'working') return '데이터 할당을 먼저 받으세요'
  return '현재 사용 불가'
}

export default function Layout() {
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const navigate = useNavigate()
  const location = useLocation()
  const { selectedWorkspace, selectedDomain, selectedDomainLabel, selectedColor, phase, myPhase } = useWorkspaceStore()
  const wsSelected = !!selectedWorkspace
  const currentTask = useGlobalTaskStore(s => s.currentTask)

  // 알림 WebSocket 훅
  useNotification(user?.user_id || null)

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
    const defaultColor = '#4a4a4a'  // 미선택 시 다크그레이
    const color = selectedWorkspace ? (selectedColor || '#1a1a2e') : defaultColor
    document.documentElement.style.setProperty('--theme-color', color)
    document.documentElement.style.setProperty('--primary', color)
    document.documentElement.style.setProperty('--primary-hover', color)
    document.documentElement.style.setProperty('--sider-bg-start', color)
    document.documentElement.style.setProperty('--sider-bg-end', color)
  }, [selectedColor, selectedWorkspace])

  // Tooltip이 적용된 메뉴 label 생성
  const tooltipLabel = (label: string, menuKey: string, disabled: boolean) => {
    if (!disabled) return label
    const reason = getDisabledReason(menuKey, wsSelected, phase, myPhase)
    return (
      <Tooltip title={reason} placement="right">
        <span>{label}</span>
      </Tooltip>
    )
  }

  const menuItems = [
    {
      key: 'knowledge-group',
      label: '지식 작업',
      icon: <BulbOutlined />,
      children: [
        { key: '/workspace', label: '워크스페이스', icon: <AppstoreOutlined /> },
        { key: '/preprocess', label: tooltipLabel('데이터 전처리', '/preprocess', !wsSelected || phase !== 'preprocess'), icon: <FilterOutlined />, disabled: !wsSelected || phase !== 'preprocess' },
        { key: '/assignment', label: tooltipLabel('데이터 할당', '/assignment', !wsSelected || phase !== 'work' || myPhase !== 'idle'), icon: <TeamOutlined />, disabled: !wsSelected || phase !== 'work' || myPhase !== 'idle' },
        { key: '/knowledge-work', label: tooltipLabel('작업실', '/knowledge-work', !wsSelected || phase !== 'work' || myPhase !== 'working'), icon: <EditOutlined />, disabled: !wsSelected || phase !== 'work' || myPhase !== 'working' },
        { key: '/build-history', label: tooltipLabel('사전 빌드', '/build-history', !wsSelected || phase !== 'build'), icon: <HistoryOutlined />, disabled: !wsSelected || phase !== 'build' },
        { key: '/dict-verify', label: tooltipLabel('사전 검증', '/dict-verify', !wsSelected || phase !== 'verify'), icon: <CheckCircleOutlined />, disabled: !wsSelected || phase !== 'verify' },
        { key: '/work-complete', label: tooltipLabel('작업완료', '/work-complete', !wsSelected || phase !== 'complete'), icon: <CheckCircleOutlined />, disabled: !wsSelected || phase !== 'complete' },
        { key: '/category', label: tooltipLabel('카테고리 관리', '/category', !wsSelected || phase !== 'work' || myPhase !== 'working'), icon: <TagsOutlined />, disabled: !wsSelected || phase !== 'work' || myPhase !== 'working' },
        { key: '/pipeline', label: tooltipLabel('파이프라인', '/pipeline', !wsSelected || phase !== 'work' || myPhase !== 'working'), icon: <RocketOutlined />, disabled: !wsSelected || phase !== 'work' || myPhase !== 'working' },
        { key: '/knowledge', label: tooltipLabel('지식작업', '/knowledge', !wsSelected || phase !== 'work' || myPhase !== 'working'), icon: <BulbOutlined />, disabled: !wsSelected || phase !== 'work' || myPhase !== 'working' },
      ],
    },
    {
      key: 'admin-group',
      label: '관리',
      icon: <SettingOutlined />,
      children: [
        { key: '/dashboard', label: '대시보드', icon: <DashboardOutlined /> },
        { key: '/domain-manage', label: '도메인 관리', icon: <SettingOutlined /> },
        { key: '/site-manage', label: '사이트 관리', icon: <GlobalOutlined /> },
        { key: '/statistics', label: '통계', icon: <BarChartOutlined /> },
        { key: '/llm-settings', label: 'AI 설정', icon: <ApiOutlined /> },
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
                ? `${selectedWorkspace}:${selectedDomain}${selectedDomainLabel ? `(${selectedDomainLabel})` : ''}`
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
        {/* 글로벌 작업 진행표시 — 로그아웃 위 */}
        {currentTask && (
          <div style={{
            padding: '8px 12px',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Typography.Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 500 }}>
                {currentTask.label}
              </Typography.Text>
              <Typography.Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10 }}>
                {currentTask.status === 'done' ? '완료' : currentTask.status === 'error' ? '오류' : `${currentTask.percent}%`}
              </Typography.Text>
            </div>
            <Progress
              percent={currentTask.percent}
              size="small"
              showInfo={false}
              status={currentTask.status === 'error' ? 'exception' : currentTask.status === 'done' ? 'success' : 'active'}
              strokeColor={currentTask.status === 'error' ? '#ff4d4f' : currentTask.status === 'done' ? '#52c41a' : 'rgba(255,255,255,0.7)'}
              trailColor="rgba(255,255,255,0.15)"
            />
          </div>
        )}
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
        <Content style={{ margin: 0, marginLeft: 200, marginTop: 0, padding: '0 16px 16px', overflowX: 'hidden', overflowY: 'auto', height: '100vh', boxSizing: 'border-box' }}>
          {location.pathname !== '/' && !isMenuEnabled(location.pathname, { wsSelected, phase, myPhase })
            ? <Navigate to="/" replace />
            : <Outlet />
          }
        </Content>
      </AntLayout>
    </AntLayout>
  )
}
