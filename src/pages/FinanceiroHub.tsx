import { useState } from 'react'
import { DollarSign, BarChart3 } from 'lucide-react'
import Financeiro from './Financeiro'
import DashboardFinanceiro from './DashboardFinanceiro'

type Tab = 'lancamentos' | 'dashboard'

export default function FinanceiroHub() {
  const [aba, setAba] = useState<Tab>('lancamentos')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Financeiro</h1>
        <p className="text-sm text-gray-500 mt-1">Lançamentos, fluxo de alunos e dashboard de receitas</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setAba('lancamentos')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            aba === 'lancamentos'
              ? 'border-brand-500 text-brand-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Lançamentos
        </button>
        <button
          onClick={() => setAba('dashboard')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            aba === 'dashboard'
              ? 'border-brand-500 text-brand-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Dashboard
        </button>
      </div>

      <div>
        {aba === 'lancamentos' && <Financeiro />}
        {aba === 'dashboard' && <DashboardFinanceiro />}
      </div>
    </div>
  )
}
