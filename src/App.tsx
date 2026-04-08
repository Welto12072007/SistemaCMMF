import { Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import Contatos from './pages/Contatos'
import AulasExperimentais from './pages/AulasExperimentais'
import Matriculas from './pages/Matriculas'
import Followup from './pages/Followup'
import Disparos from './pages/Disparos'
import Relatorios from './pages/Relatorios'
import Configuracoes from './pages/Configuracoes'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/contatos" element={<Contatos />} />
        <Route path="/aulas-experimentais" element={<AulasExperimentais />} />
        <Route path="/matriculas" element={<Matriculas />} />
        <Route path="/followup" element={<Followup />} />
        <Route path="/disparos" element={<Disparos />} />
        <Route path="/relatorios" element={<Relatorios />} />
        <Route path="/configuracoes" element={<Configuracoes />} />
      </Route>
    </Routes>
  )
}
