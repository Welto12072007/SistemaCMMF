import { Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { useAuth, type UserRole } from './contexts/AuthContext'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import DefinirSenha from './pages/DefinirSenha'
import Dashboard from './pages/Dashboard'

const Contatos = lazy(() => import('./pages/Contatos'))
const AulasExperimentais = lazy(() => import('./pages/AulasExperimentais'))
const Usuarios = lazy(() => import('./pages/Usuarios'))
const Followup = lazy(() => import('./pages/Followup'))
const Disparos = lazy(() => import('./pages/Disparos'))
const Relatorios = lazy(() => import('./pages/Relatorios'))
const Horarios = lazy(() => import('./pages/Horarios'))
const Financeiro = lazy(() => import('./pages/Financeiro'))
const DashboardFinanceiro = lazy(() => import('./pages/DashboardFinanceiro'))
const Mensalidades = lazy(() => import('./pages/Mensalidades'))
const Biblioteca = lazy(() => import('./pages/Biblioteca'))
const FingerTV = lazy(() => import('./pages/FingerTV'))
const MaterialApoio = lazy(() => import('./pages/MaterialApoio'))
const Logs = lazy(() => import('./pages/Logs'))
const Presencas = lazy(() => import('./pages/Presencas'))
const Faltas = lazy(() => import('./pages/Faltas'))
const DisparosProgramados = lazy(() => import('./pages/DisparosProgramados'))
const PortalAluno = lazy(() => import('./pages/PortalAluno'))
const Configuracoes = lazy(() => import('./pages/Configuracoes'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function Guard({ roles, children }: { roles: UserRole[]; children: React.ReactNode }) {
  const { hasRole } = useAuth()
  if (!hasRole(...roles)) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  const { user, loading, passwordRecovery, hasRole } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Carregando...</p>
        </div>
      </div>
    )
  }

  if (passwordRecovery && user) {
    return <DefinirSenha />
  }

  if (!user) {
    return <Login />
  }

  const defaultPage = hasRole('aluno') ? <Navigate to="/biblioteca" replace /> : <Dashboard />

  return (
    <Routes>
      <Route path="/definir-senha" element={<DefinirSenha />} />
      <Route element={<Layout />}>
        <Route path="/" element={defaultPage} />
        <Route path="/contatos" element={<Guard roles={['admin', 'recepcao']}><Suspense fallback={<PageLoader />}><Contatos /></Suspense></Guard>} />
        <Route path="/aulas-experimentais" element={<Guard roles={['admin', 'recepcao']}><Suspense fallback={<PageLoader />}><AulasExperimentais /></Suspense></Guard>} />
        <Route path="/usuarios" element={<Guard roles={['admin', 'recepcao']}><Suspense fallback={<PageLoader />}><Usuarios /></Suspense></Guard>} />
        <Route path="/followup" element={<Guard roles={['admin', 'recepcao']}><Suspense fallback={<PageLoader />}><Followup /></Suspense></Guard>} />
        <Route path="/disparos" element={<Guard roles={['admin', 'recepcao']}><Suspense fallback={<PageLoader />}><Disparos /></Suspense></Guard>} />
        <Route path="/disparos-programados" element={<Guard roles={['admin']}><Suspense fallback={<PageLoader />}><DisparosProgramados /></Suspense></Guard>} />
        <Route path="/horarios" element={<Guard roles={['admin', 'recepcao', 'professor']}><Suspense fallback={<PageLoader />}><Horarios /></Suspense></Guard>} />
        <Route path="/financeiro" element={<Guard roles={['admin']}><Suspense fallback={<PageLoader />}><Financeiro /></Suspense></Guard>} />
        <Route path="/dashboard-financeiro" element={<Guard roles={['admin']}><Suspense fallback={<PageLoader />}><DashboardFinanceiro /></Suspense></Guard>} />
        <Route path="/mensalidades" element={<Guard roles={['admin', 'recepcao']}><Suspense fallback={<PageLoader />}><Mensalidades /></Suspense></Guard>} />
        <Route path="/presencas" element={<Guard roles={['admin', 'recepcao', 'professor']}><Suspense fallback={<PageLoader />}><Faltas /></Suspense></Guard>} />
        <Route path="/faltas" element={<Guard roles={['admin', 'recepcao', 'professor']}><Suspense fallback={<PageLoader />}><Faltas /></Suspense></Guard>} />
        <Route path="/portal-aluno" element={<Guard roles={['aluno']}><Suspense fallback={<PageLoader />}><PortalAluno /></Suspense></Guard>} />
        <Route path="/biblioteca" element={<Suspense fallback={<PageLoader />}><Biblioteca /></Suspense>} />
        <Route path="/fingertv" element={<Suspense fallback={<PageLoader />}><FingerTV /></Suspense>} />
        <Route path="/material-apoio" element={<Suspense fallback={<PageLoader />}><MaterialApoio /></Suspense>} />
        <Route path="/logs" element={<Guard roles={['admin']}><Suspense fallback={<PageLoader />}><Logs /></Suspense></Guard>} />
        <Route path="/relatorios" element={<Guard roles={['admin']}><Suspense fallback={<PageLoader />}><Relatorios /></Suspense></Guard>} />
        <Route path="/configuracoes" element={<Guard roles={['admin']}><Suspense fallback={<PageLoader />}><Configuracoes /></Suspense></Guard>} />
      </Route>
    </Routes>
  )
}
