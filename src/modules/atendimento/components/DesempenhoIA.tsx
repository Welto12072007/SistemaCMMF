import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Dados = Record<string, number | null>

const CARTOES: [string, string][] = [
  ['contatos', 'contatos falaram com a gente'], ['mensagens_ia', 'mensagens da IA'], ['conversas_ia', 'conversas atendidas pela IA'],
  ['respostas_equipe', 'respostas da equipe'], ['aprovadas', 'sugestões aprovadas'], ['editadas', 'editadas pela equipe'],
  ['descartadas', 'sugestões descartadas'], ['encaminhamentos', 'encaminhamentos'], ['experimentais', 'experimentais registradas'],
  ['followups', 'follow-ups enviados'], ['regua_respostas', 'responderam a um follow-up'], ['falhas', 'envios com falha'],
]

export default function DesempenhoIA() {
  const [dias, setDias] = useState(30)
  const [d, setD] = useState<Dados | null>(null)

  useEffect(() => {
    supabase.rpc('ia_desempenho', { p_dias: dias }).then(({ data }) => setD(data as Dados))
  }, [dias])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Desempenho da IA e do atendimento</h2>
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="border rounded-lg px-2 py-1.5 text-sm">
          <option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option>
        </select>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {CARTOES.map(([k, l]) => (
          <div key={k} className="bg-white border rounded-xl p-4">
            <p className="text-2xl font-bold text-gray-900">{d?.[k] ?? '—'}</p>
            <p className="text-xs text-gray-500">{l}</p>
          </div>
        ))}
        <div className="bg-white border rounded-xl p-4">
          <p className="text-2xl font-bold text-gray-900">{d?.taxa_leitura != null ? `${d.taxa_leitura}%` : '—'}</p>
          <p className="text-xs text-gray-500">das mensagens foram lidas</p>
        </div>
      </div>
    </div>
  )
}
