import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { useWorkspaceStore, type Phase, type MyPhase } from './stores/workspaceStore'
import Login from './pages/Login'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import DomainList from './pages/DomainList'
import DictionaryManage from './pages/DictionaryManage'
import DomainManage from './pages/DomainManage'
import CategoryManage from './pages/CategoryManage'
import Statistics from './pages/Statistics'
import Pipeline from './pages/Pipeline'
import Knowledge from './pages/Knowledge'
import BuildHistory from './pages/BuildHistory'
import AccountManagement from './pages/AccountManagement'
import Phase1Pipeline from './pages/Phase1Pipeline'
import Manual from './pages/Manual'
import Assignment from './pages/Assignment'
import KnowledgeWork from './pages/KnowledgeWork'
import LLMSettings from './pages/LLMSettings'
import DictVerify from './pages/DictVerify'
import WorkComplete from './pages/WorkComplete'
import Dashboard from './pages/Dashboard'
import SiteManage from './pages/SiteManage'
import PublicShare from './pages/PublicShare'

const Workspace = lazy(() => import('./pages/Workspace'))

export function isMenuEnabled(
  path: string,
  ctx: { wsSelected: boolean; phase: Phase; myPhase: MyPhase }
) {
  const { wsSelected, phase, myPhase } = ctx
  const rules: Record<string, boolean> = {
    '/dashboard': true,
    '/workspace': true,
    '/preprocess': wsSelected && phase === 'preprocess',
    '/assignment': wsSelected && phase === 'work' && myPhase === 'idle',
    '/knowledge-work': wsSelected && phase === 'work' && myPhase === 'working',
    '/category': wsSelected && phase === 'work' && myPhase === 'working',
    '/pipeline': wsSelected && phase === 'work' && myPhase === 'working',
    '/knowledge': wsSelected && phase === 'work' && myPhase === 'working',
    '/build-history': wsSelected && phase === 'build',
    '/dict-verify': wsSelected && phase === 'verify',
    '/work-complete': wsSelected && (phase === 'verify' || phase === 'complete' || phase === 'finished'),
    '/domain-manage': true,
    '/site-manage': true,
    '/statistics': true,
    '/accounts': true,
    '/llm-settings': true,
    '/manual': true,
    '/domains': true,
    '/dictionary': true,
  }
  return rules[path] ?? false
}

function DefaultRoute() {
  const { selectedWorkspace, phase, myPhase, _statusLoaded, lastMenu } = useWorkspaceStore()

  // 워크스페이스 미선택 → workspace
  if (!selectedWorkspace) return <Navigate to="/workspace" replace />
  // 서버 상태 로드 미완료 → null 반환 (빈 화면으로 대기, re-render 시 올바른 경로로)
  if (!_statusLoaded) return null
  // lastMenu가 유효하고 활성화 상태이면 해당 메뉴로 이동
  if (lastMenu && isMenuEnabled(lastMenu, { wsSelected: !!selectedWorkspace, phase, myPhase })) {
    return <Navigate to={lastMenu} replace />
  }
  // phase/myPhase 기반 기본 경로
  if (phase === 'preprocess') return <Navigate to="/preprocess" replace />
  if (phase === 'work' && myPhase === 'idle') return <Navigate to="/assignment" replace />
  if (phase === 'work' && myPhase === 'working') return <Navigate to="/knowledge-work" replace />
  if (phase === 'build') return <Navigate to="/build-history" replace />
  if (phase === 'verify') return <Navigate to="/dict-verify" replace />
  if (phase === 'complete') return <Navigate to="/work-complete" replace />
  if (phase === 'finished') return <Navigate to="/work-complete" replace />
  // 폴백 (phase === 'work' && myPhase === 'done' 등)
  return <Navigate to="/workspace" replace />
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.token)
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* 공개 공유 페이지 — PrivateRoute/Layout 없음 (사이드바 제거) */}
      <Route path="/public/share/:token" element={<PublicShare />} />
      <Route path="/" element={<PrivateRoute><ErrorBoundary><Layout /></ErrorBoundary></PrivateRoute>}>
        <Route index element={<DefaultRoute />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="workspace" element={<Suspense fallback={null}><Workspace /></Suspense>} />
        <Route path="preprocess" element={<Phase1Pipeline />} />
        <Route path="assignment" element={<Assignment />} />
        <Route path="knowledge-work" element={<KnowledgeWork />} />
        <Route path="domains" element={<DomainList />} />
        <Route path="dictionary" element={<DictionaryManage />} />
        <Route path="domain-manage" element={<DomainManage />} />
        <Route path="site-manage" element={<SiteManage />} />
        <Route path="category" element={<CategoryManage />} />
        <Route path="statistics" element={<Statistics />} />
        <Route path="pipeline" element={<Pipeline />} />
        <Route path="knowledge" element={<Knowledge />} />
        <Route path="build-history" element={<BuildHistory />} />
        <Route path="dict-verify" element={<DictVerify />} />
        <Route path="work-complete" element={<WorkComplete />} />
        <Route path="accounts" element={<AccountManagement />} />
        <Route path="llm-settings" element={<LLMSettings />} />
        <Route path="manual" element={<Manual />} />
      </Route>
    </Routes>
  )
}
