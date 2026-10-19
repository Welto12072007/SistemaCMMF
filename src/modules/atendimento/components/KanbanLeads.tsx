import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageSquare, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { normalizarTelefone } from '../lib/whatsapp'

export interface CardFunil {
  id: string
  nome: string
  telefone?: string
  instrumento_interesse?: string
  etapa_funil: string
  score_temperatura: number
  proxima_acao?: string | null
  proxima_acao_em?: string | null
  regua_nome?: string | null
  regua_passo?: number | null
  regua_total?: number | null
  data_matricula?: string | null
  data_perdido_at?: string | null
  data_primeiro_contato?: string
  data_em_atendimento_at?: string
  data_horario_aprovado_at?: string
  data_aula_realizada_at?: string
  exp_data?: string
}

interface Coluna { key: string; label: string; etapas: string[]; statusAoSoltar?: string }

const COLUNAS: Coluna[] = [
  { key: 'lead', label: 'Lead', etapas: ['1_lead_novo'], statusAoSoltar: 'lead' },
  { key: 'contato', label: 'Contato', etapas: ['2_em_atendimento'], statusAoSoltar: 'Em Follow-up' },
  { key: 'agendada', label: 'Experimental agendada', etapas: ['3_horario_pre_aprovado', '4_aguardando_pagamento', '4_experimental_confirmada', '5_experimental_paga'] },
  { key: 'realizada', label: 'Experimental realizada', etapas: ['6_aula_realizada'] },
  { key: 'noshow', label: 'No-show', etapas: ['5_no_show'] },
  { key: 'matricula', label: 'Matrícula (30 dias)', etapas: ['7_matriculado'] },
  { key: 'encerrado', label: 'Encerrado (30 dias)', etapas: ['9_perdido'], statusAoSoltar: 'perdido' },
]
const ETAPAS_ATIVAS = new Set(['lead', 'contato', 'agendada', 'realizada', 'noshow'])
const TRINTA_DIAS = 30 * 86400_000

function desdeEtapa(c: CardFunil) {
  const d = c.etapa_funil === '2_em_atendimento' ? c.data_em_atendimento_at
    : c.etapa_funil.startsWith('3_') || c.etapa_funil.startsWith('4_') ? c.data_horario_aprovado_at
    : c.etapa_funil === '6_aula_realizada' ? c.data_aula_realizada_at
    : c.etapa_funil === '9_perdido' ? c.data_perdido_at
    : c.etapa_funil === '7_matriculado' ? c.data_matricula
    : c.data_primeiro_contato
  if (!d) return ''
  const dias = Math.floor((Date.now() - new Date(d).getTime()) / 86400_000)
  return dias === 0 ? 'entrou hoje' : `${dias} dia${dias > 1 ? 's' : ''} na etapa`
}

function temperatura(score: number) {
  if (score >= 60) return { l: 'Quente', c: 'bg-red-50 text-red-700' }
  if (score >= 30) return { l: 'Morno', c: 'bg-amber-50 text-amber-700' }
  return { l: 'Frio', c: 'bg-sky-50 text-sky-700' }
}

export default function KanbanLeads({ contatos, onChange }: { contatos: CardFunil[]; onChange: () => void }) {
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [editando, setEditando] = useState<CardFunil | null>(null)
  const [acao, setAcao] = useState({ texto: '', quando: '' })

  const porColuna = useMemo(() => {
    const agora = Date.now()
    const m: Record<string, CardFunil[]> = Object.fromEntries(COLUNAS.map((c) => [c.key, []]))
    for (const c of contatos) {
      const col = COLUNAS.find((x) => x.etapas.includes(c.etapa_funil))
      if (!col) continue
      if (col.key === 'matricula' && (!c.data_matricula || agora - new Date(c.data_matricula).getTime() > TRINTA_DIAS)) continue
      if (col.key === 'encerrado' && (!c.data_perdido_at || agora - new Date(c.data_perdido_at).getTime() > TRINTA_DIAS)) continue
      m[col.key]!.push(c)
    }
    for (const k in m) m[k]!.sort((a, b) => b.score_temperatura - a.score_temperatura)
    return m
  }, [contatos])

  async function soltar(col: Coluna) {
    const c = contatos.find((x) => x.id === arrastando)
    setArrastando(null)
    if (!c || !col.statusAoSoltar || col.etapas.includes(c.etapa_funil)) return
    if (col.statusAoSoltar === 'perdido') {
      const motivo = prompt(`Por que ${c.nome} foi encerrado?`, 'Sem resposta')
      if (motivo === null) return
      await supabase.rpc('marcar_lead_perdido', { p_aluno_id: c.id, p_motivo: motivo || 'sem motivo informado' })
    } else {
      await supabase.from('alunos').update({ status: col.statusAoSoltar }).eq('id', c.id)
    }
    onChange()
  }

  async function salvarAcao() {
    if (!editando) return
    await supabase.from('alunos').update({
      proxima_acao: acao.texto.trim() || null,
      proxima_acao_em: acao.quando ? new Date(acao.quando).toISOString() : null,
    }).eq('id', editando.id)
    setEditando(null); onChange()
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">Arraste um card para Lead, Contato ou Encerrado. As outras etapas mudam sozinhas (agendamento, aula, matrícula). Uma oportunidade nunca some: sem próxima ação, o card fica marcado.</p>
      <div className="flex gap-3 overflow-x-auto pb-3">
        {COLUNAS.map((col) => (
          <div key={col.key} onDragOver={(e) => col.statusAoSoltar && e.preventDefault()} onDrop={() => soltar(col)}
            className={`w-64 shrink-0 bg-gray-50 rounded-xl p-2 space-y-2 ${arrastando && col.statusAoSoltar ? 'ring-2 ring-brand-200' : ''}`}>
            <h3 className="text-sm font-semibold text-gray-700 px-1 flex justify-between">{col.label}<span className="text-gray-400">{porColuna[col.key]?.length ?? 0}</span></h3>
            <div className="space-y-2 max-h-[65vh] overflow-y-auto">
              {(porColuna[col.key] ?? []).slice(0, 60).map((c) => {
                const t = temperatura(c.score_temperatura)
                const semAcao = ETAPAS_ATIVAS.has(col.key) && !c.proxima_acao && !c.regua_nome
                const vencida = c.proxima_acao_em && new Date(c.proxima_acao_em) < new Date()
                return (
                  <div key={c.id} draggable onDragStart={() => setArrastando(c.id)} onClick={() => { setEditando(c); setAcao({ texto: c.proxima_acao ?? '', quando: c.proxima_acao_em?.slice(0, 16) ?? '' }) }}
                    className={`bg-white rounded-lg border p-2.5 text-sm cursor-pointer hover:shadow-sm ${semAcao ? 'border-red-200' : ''}`}>
                    <p className="font-medium text-gray-900 truncate">{c.nome}</p>
                    <p className="text-xs text-gray-500">{c.instrumento_interesse ?? 'instrumento não informado'}</p>
                    <p className="text-[11px] text-gray-400">{desdeEtapa(c)}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {ETAPAS_ATIVAS.has(col.key) && <span className={`text-[10px] px-1.5 py-0.5 rounded ${t.c}`}>{t.l}</span>}
                      {c.regua_nome && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700" title={c.regua_nome}>Régua {c.regua_passo}/{c.regua_total}</span>}
                      {semAcao && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700">Sem próxima ação</span>}
                    </div>
                    {c.proxima_acao && <p className={`text-[11px] mt-1 ${vencida ? 'text-red-600' : 'text-gray-600'}`}>Próxima ação: {c.proxima_acao}{c.proxima_acao_em ? ` (${new Date(c.proxima_acao_em).toLocaleDateString('pt-BR')})` : ''}</p>}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {editando && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setEditando(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{editando.nome}</h3>
              <button onClick={() => setEditando(null)}><X className="w-4 h-4" /></button>
            </div>
            {editando.regua_nome && <p className="text-xs text-violet-700">Na régua "{editando.regua_nome}" (contato {editando.regua_passo} de {editando.regua_total})</p>}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Próxima ação</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={acao.texto} onChange={(e) => setAcao({ ...acao, texto: e.target.value })} placeholder="Ex.: ligar para oferecer horário de sábado" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Quando</label>
              <input type="datetime-local" className="w-full border rounded-lg px-3 py-2 text-sm" value={acao.quando} onChange={(e) => setAcao({ ...acao, quando: e.target.value })} />
            </div>
            <div className="flex gap-2 justify-between">
              {editando.telefone && <Link to={`/conversas?telefone=${normalizarTelefone(editando.telefone)}`} className="text-sm px-3 py-2 border rounded-lg flex items-center gap-1"><MessageSquare className="w-4 h-4" /> Conversa</Link>}
              <button onClick={salvarAcao} className="text-sm px-4 py-2 rounded-lg bg-brand-500 text-white">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
