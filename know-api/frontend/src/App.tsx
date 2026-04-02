import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { useWorkspaceStore } from './stores/workspaceStore'
import Login from './pages/Login'
import Layout from './components/Layout'
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

const Workspace = lazy(() => import('./pages/Workspace'))

function isMenuEnabled(path: string, ctx: { wsSelected: boolean; isFrozen: boolean; isAssigned: boolean }) {
  const rules: Record<string, boolean> = {
    '/workspace': true,
    '/preprocess': ctx.wsSelected && !ctx.isFrozen,
    '/assignment': ctx.wsSelected && ctx.isFrozen && !ctx.isAssigned,
    '/knowledge-work': ctx.wsSelected && ctx.isAssigned,
    '/category': ctx.wsSelected && ctx.isAssigned,
    '/pipeline': ctx.wsSelected && ctx.isAssigned,
    '/knowledge': ctx.wsSelected && ctx.isAssigned,
    '/domain-manage': true,
    '/statistics': true,
    '/build-history': true,
    '/accounts': true,
    '/llm-settings': true,
    '/manual': true,
  }
  return rules[path] ?? false
}

function DefaultRoute() {
  const { selectedWorkspace, isFrozen, isAssigned, _statusLoaded, lastMenu } = useWorkspaceStore()

  // 워크스페이스 미선택 → workspace
  if (!selectedWorkspace) return <Navigate to="/workspace" replace />
  // 서버 상태 로드 미완료 → null 반환 (빈 화면으로 대기, re-render 시 올바른 경로로)
  if (!_statusLoaded) return null
  // lastMenu가 유효하고 활성화 상태이면 해당 메뉴로 이동
  if (lastMenu && isMenuEnabled(lastMenu, { wsSelected: !!selectedWorkspace, isFrozen, isAssigned })) {
    return <Navigate to={lastMenu} replace />
  }
  // 할당 완료 → knowledge-work
  if (isAssigned) return <Navigate to="/knowledge-work" replace />
  // 프리징 완료 → assignment
  if (isFrozen) return <Navigate to="/assignment" replace />
  // 워크스페이스만 선택됨 → preprocess
  return <Navigate to="/preprocess" replace />
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.token)
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<DefaultRoute />} />
        <Route path="workspace" element={<Suspense fallback={null}><Workspace /></Suspense>} />
        <Route path="preprocess" element={<Phase1Pipeline />} />
        <Route path="assignment" element={<Assignment />} />
        <Route path="knowledge-work" element={<KnowledgeWork />} />
        <Route path="domains" element={<DomainList />} />
        <Route path="dictionary" element={<DictionaryManage />} />
        <Route path="domain-manage" element={<DomainManage />} />
        <Route path="category" element={<CategoryManage />} />
        <Route path="statistics" element={<Statistics />} />
        <Route path="pipeline" element={<Pipeline />} />
        <Route path="knowledge" element={<Knowledge />} />
        <Route path="build-history" element={<BuildHistory />} />
        <Route path="accounts" element={<AccountManagement />} />
        <Route path="llm-settings" element={<LLMSettings />} />
        <Route path="manual" element={<Manual />} />
      </Route>
    </Routes>
  )
}
