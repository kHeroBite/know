import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import Login from './pages/Login'
import Layout from './components/Layout'
import DomainList from './pages/DomainList'
import DictionaryManage from './pages/DictionaryManage'
import CategoryManage from './pages/CategoryManage'
import Statistics from './pages/Statistics'
import Pipeline from './pages/Pipeline'
import Knowledge from './pages/Knowledge'
import BuildHistory from './pages/BuildHistory'
import Phase1Pipeline from './pages/Phase1Pipeline'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.token)
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Navigate to="/phase1" replace />} />
        <Route path="phase1" element={<Phase1Pipeline />} />
        <Route path="domains" element={<DomainList />} />
        <Route path="dictionary" element={<DictionaryManage />} />
        <Route path="category" element={<CategoryManage />} />
        <Route path="statistics" element={<Statistics />} />
        <Route path="pipeline" element={<Pipeline />} />
        <Route path="knowledge" element={<Knowledge />} />
        <Route path="build-history" element={<BuildHistory />} />
      </Route>
    </Routes>
  )
}
