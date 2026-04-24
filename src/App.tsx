import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth, type UserRole } from './contexts/AuthContext'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import DefinirSenha from './pages/DefinirSenha'
import Dashboard from './pages/Dashboard'
import Contatos from './pages/Contatos'
import AulasExperimentais from './pages/AulasExperimentais'
import Usuarios from './pages/Usuarios'
import Followup from './pages/Followup'
import Disparos from './pages/Disparos'
import Relatorios from './pages/Relatorios'
import Horarios from './pages/Horarios'
import Financeiro from './pages/Financeiro'
import DashboardFinanceiro from './pages/DashboardFinanceiro'
import Mensalidades from './pages/Mensalidades'
import Biblioteca from './pages/Biblioteca'
import FingerTV from './pages/FingerTV'
import MaterialApoio from './pages/MaterialApoio'
import Logs from './pages/Logs'
import Presencas from './pages/Presencas'
import Faltas from './pages/Faltas'
import DisparosProgramados from './pages/DisparosProgramados'
import PortalAluno from './pages/PortalAluno'
import Configuracoes from './pages/Configuracoes'

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
        <Route path="/contatos" element={<Guard roles={['admin', 'recepcao']}><Contatos /></Guard>} />
        <Route path="/aulas-experimentais" element={<Guard roles={['admin', 'recepcao']}><AulasExperimentais /></Guard>} />
        <Route path="/usuarios" element={<Guard roles={['admin', 'recepcao']}><Usuarios /></Guard>} />
        <Route path="/followup" element={<Guard roles={['admin', 'recepcao']}><Followup /></Guard>} />
        <Route path="/disparos" element={<Guard roles={['admin', 'recepcao']}><Disparos /></Guard>} />
        <Route path="/disparos-programados" element={<Guard roles={['admin']}><DisparosProgramados /></Guard>} />
        <Route path="/horarios" element={<Guard roles={['admin', 'recepcao', 'professor']}><Horarios /></Guard>} />
        <Route path="/financeiro" element={<Guard roles={['admin']}><Financeiro /></Guard>} />
        <Route path="/dashboard-financeiro" element={<Guard roles={['admin']}><DashboardFinanceiro /></Guard>} />
        <Route path="/mensalidades" element={<Guard roles={['admin', 'recepcao']}><Mensalidades /></Guard>} />
        <Route path="/presencas" element={<Guard roles={['admin', 'recepcao', 'professor']}><Presencas /></Guard>} />
        <Route path="/faltas" element={<Guard roles={['admin', 'recepcao']}><Faltas /></Guard>} />
        <Route path="/portal-aluno" element={<Guard roles={['aluno']}><PortalAluno /></Guard>} />
        <Route path="/biblioteca" element={<Biblioteca />} />
        <Route path="/fingertv" element={<FingerTV />} />
        <Route path="/material-apoio" element={<MaterialApoio />} />
        <Route path="/logs" element={<Guard roles={['admin']}><Logs /></Guard>} />
        <Route path="/relatorios" element={<Guard roles={['admin']}><Relatorios /></Guard>} />
        <Route path="/configuracoes" element={<Guard roles={['admin']}><Configuracoes /></Guard>} />
      </Route>
    </Routes>
  )
}
