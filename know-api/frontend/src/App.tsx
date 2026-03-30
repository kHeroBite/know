import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { useWorkspaceStore } from './stores/workspaceStore'
import Login from './pages/Login'
import Layout from './components/Layout'
import DomainList from './pages/DomainList'
import DictionaryManage from './pages/DictionaryManage'
import CategoryManage from './pages/CategoryManage'
import Statistics from './pages/Statistics'
import Pipeline from './pages/Pipeline'
import Knowledge from './pages/Knowledge'
import BuildHistory from './pages/BuildHistory'
import AccountManagement from './pages/AccountManagement'
import Phase1Pipeline from './pages/Phase1Pipeline'
import Manual from './pages/Manual'
import Assignment from './pages/Assignment'

const Workspace = lazy(() => import('./pages/Workspace'))

function DefaultRoute() {
  const { selectedWorkspace, isFrozen, isAssigned, _statusLoaded } = useWorkspaceStore()

  // 워크스페이스 미선택 → workspace
  if (!selectedWorkspace) return <Navigate to="/workspace" replace />
  // 서버 상태 로드 미완료 → workspace에서 대기 (비동기 로드 후 리렌더)
  if (!_statusLoaded) return <Navigate to="/workspace" replace />
  // 할당 완료 → dictionary
  if (isAssigned) return <Navigate to="/dictionary" replace />
  // 프리징 완료 → assignment
  if (isFrozen) return <Navigate to="/assignment" replace />
  // 기본 → preprocess
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
        <Route path="domains" element={<DomainList />} />
        <Route path="dictionary" element={<DictionaryManage />} />
        <Route path="category" element={<CategoryManage />} />
        <Route path="statistics" element={<Statistics />} />
        <Route path="pipeline" element={<Pipeline />} />
        <Route path="knowledge" element={<Knowledge />} />
        <Route path="build-history" element={<BuildHistory />} />
        <Route path="accounts" element={<AccountManagement />} />
        <Route path="manual" element={<Manual />} />
      </Route>
    </Routes>
  )
}
