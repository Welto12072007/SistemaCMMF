import { useState, useEffect, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Users, PhoneForwarded, Tag } from 'lucide-react'

const Contatos = lazy(() => import('./Contatos'))
const Followup = lazy(() => import('./Followup'))
const ContatosLabels = lazy(() => import('./ContatosLabels'))

type TabKey = 'lista' | 'followup' | 'labels'

const TABS: { key: TabKey; label: string; icon: typeof Users; descricao: string }[] = [
  { key: 'lista',    label: 'Lista',     icon: Users,          descricao: 'Todos os contatos cadastrados' },
  { key: 'followup', label: 'Follow-up', icon: PhoneForwarded, descricao: 'Contatos a acompanhar' },
  { key: 'labels',   label: 'Labels & Sofia', icon: Tag,       descricao: 'Labels do WhatsApp e pausa da Sofia' },
]

export default function ContatosHub() {
  const [params, setParams] = useSearchParams()
  const initial = (params.get('tab') as TabKey) || 'lista'
  const [tab, setTab] = useState<TabKey>(TABS.some(t => t.key === initial) ? initial : 'lista')

  useEffect(() => {
    if (params.get('tab') !== tab) {
      const next = new URLSearchParams(params)
      next.set('tab', tab)
      setParams(next, { replace: true })
    }
  }, [tab])

  return (
    <div className="space-y-4">
      <div className="border-b border-gray-200">
        <div className="flex gap-1">
          {TABS.map(t => {
            const Icon = t.icon
            const ativo = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  ativo
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      <Suspense fallback={<div className="py-20 text-center text-gray-400 text-sm">Carregando...</div>}>
        {tab === 'lista' && <Contatos />}
        {tab === 'followup' && <Followup />}
        {tab === 'labels' && <ContatosLabels />}
      </Suspense>
    </div>
  )
}
