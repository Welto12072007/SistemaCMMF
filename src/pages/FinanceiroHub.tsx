import { useState } from 'react'
import { DollarSign, BarChart3, ArrowLeftRight, UsersRound, Wallet, CalendarCheck } from 'lucide-react'
import Financeiro from './Financeiro'
import DashboardFinanceiro from './DashboardFinanceiro'
import FluxoAlunos from './FluxoAlunos'
import PagamentoProfessores from './PagamentoProfessores'
import HorariosExtras from './HorariosExtras'
import Mensalidades from './Mensalidades'
import FechamentoMes from './FechamentoMes'

type Tab = 'fechamento' | 'mensalidades' | 'professores' | 'lancamentos' | 'fluxo' | 'dashboard'

export default function FinanceiroHub() {
  const [aba, setAba] = useState<Tab>('fechamento')

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'fechamento',   label: 'Fechamento do Mês', icon: CalendarCheck },
    { id: 'mensalidades', label: 'Mensalidades',       icon: DollarSign },
    { id: 'professores',  label: 'Pagamento Prof.',    icon: UsersRound },
    { id: 'lancamentos',  label: 'Lançamentos',        icon: Wallet },
    { id: 'fluxo',        label: 'Fluxo de Alunos',   icon: ArrowLeftRight },
    { id: 'dashboard',    label: 'Dashboard',          icon: BarChart3 },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Financeiro</h1>
        <p className="text-sm text-gray-500 mt-1">Fechamento, mensalidades, professores, lançamentos e dashboard</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              aba === id
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      <div>
        {aba === 'fechamento'   && <FechamentoMes />}
        {aba === 'mensalidades' && <Mensalidades />}
        {aba === 'lancamentos'  && <Financeiro />}
        {aba === 'fluxo'        && <FluxoAlunos />}
        {aba === 'professores'  && (
          <div className="space-y-10">
            <PagamentoProfessores />
            <div className="border-t border-gray-200 pt-8">
              <HorariosExtras />
            </div>
          </div>
        )}
        {aba === 'dashboard' && <DashboardFinanceiro />}
      </div>
    </div>
  )
}
