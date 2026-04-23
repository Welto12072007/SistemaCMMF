import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AlertTriangle, CheckCircle2, Clock, Search, Send, Eye, RefreshCw, X, Check } from 'lucide-react'

interface PainelLinha {
  aluno_id: string
  aluno_nome: string
  aluno_telefone: string | null
  instrumento: string | null
  professor_nome: string | null
  faltas_mes: number
  faltas_ano: number
  faltas_consecutivas: number
  ultima_falta_em: string | null
  alerta_id: string | null
  alerta_status: string | null
  alerta_criado_em: string | null
  nivel_risco: 'ok' | 'atencao' | 'risco'
}

interface AlertaFila {
  id: string
  aluno_id: string | null
  aluno_nome: string
  professor_nome: string | null
  telefone: string | null
  faltas_consecutivas: number
  faltas_mes: number
  mensagem_sugerida: string | null
  status: 'pendente' | 'aprovado' | 'enviado' | 'cancelado'
  created_at: string
  aprovado_em: string | null
  enviado_em: string | null
}

interface HistoricoPresenca {
  id: string
  data: string
  presente: boolean
  tipo_falta: string | null
  observacoes: string | null
}

const RISCO_BADGE: Record<string, string> = {
  ok: 'bg-green-100 text-green-700',
  atencao: 'bg-yellow-100 text-yellow-700',
  risco: 'bg-red-100 text-red-700',
}

const RISCO_LABEL: Record<string, string> = {
  ok: 'OK',
  atencao: 'Atenção',
  risco: 'Risco',
}

const STATUS_BADGE: Record<string, string> = {
  pendente: 'bg-yellow-100 text-yellow-800',
  aprovado: 'bg-blue-100 text-blue-800',
  enviado: 'bg-green-100 text-green-800',
  cancelado: 'bg-gray-100 text-gray-800',
}

function formatBR(date: string | null) {
  if (!date) return '—'
  const d = new Date(date)
  return d.toLocaleDateString('pt-BR')
}

export default function Faltas() {
  const [tab, setTab] = useState<'painel' | 'fila'>('painel')
  const [linhas, setLinhas] = useState<PainelLinha[]>([])
  const [fila, setFila] = useState<AlertaFila[]>([])
  const [loading, setLoading] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtroRisco, setFiltroRisco] = useState<string>('todos')
  const [filtroStatus, setFiltroStatus] = useState<string>('pendente')
  const [detectando, setDetectando] = useState(false)
  const [historico, setHistorico] = useState<{ aluno: PainelLinha; itens: HistoricoPresenca[] } | null>(null)

  useEffect(() => {
    if (tab === 'painel') loadPainel()
    else loadFila()
  }, [tab, filtroStatus])

  async function loadPainel() {
    setLoading(true)
    const { data, error } = await supabase
      .from('vw_painel_faltas')
      .select('*')
      .order('faltas_consecutivas', { ascending: false })
      .order('faltas_mes', { ascending: false })
    if (error) {
      console.error('[Faltas] painel error:', error)
      alert(`Erro ao carregar painel:\n${error.message}`)
    }
    setLinhas((data as PainelLinha[]) || [])
    setLoading(false)
  }

  async function loadFila() {
    setLoading(true)
    let q = supabase.from('alertas_faltas_fila').select('*').order('created_at', { ascending: false })
    if (filtroStatus !== 'todos') q = q.eq('status', filtroStatus)
    const { data, error } = await q
    if (error) {
      console.error('[Faltas] fila error:', error)
      alert(`Erro ao carregar fila:\n${error.message}`)
    }
    setFila((data as AlertaFila[]) || [])
    setLoading(false)
  }

  async function detectarAgora() {
    if (!confirm('Rodar detecção de faltas agora?\n\nVai criar alertas pendentes para alunos com >= 2 faltas consecutivas ou >= 2 no mês.')) return
    setDetectando(true)
    const { data, error } = await supabase.rpc('detectar_alertas_faltas')
    setDetectando(false)
    if (error) {
      alert(`Erro: ${error.message}`)
      return
    }
    const r = data as { criados: number; pulados_dedup: number }
    alert(`Detecção concluída:\n\n✓ Alertas criados: ${r.criados}\n• Pulados (já existia recente): ${r.pulados_dedup}`)
    if (tab === 'fila') loadFila()
    else loadPainel()
  }

  async function aprovarAlerta(id: string) {
    const { error } = await supabase
      .from('alertas_faltas_fila')
      .update({ status: 'aprovado', aprovado_em: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      alert(`Erro: ${error.message}`)
      return
    }
    loadFila()
  }

  async function cancelarAlerta(id: string) {
    if (!confirm('Cancelar este alerta? A mensagem não será enviada.')) return
    const { error } = await supabase.from('alertas_faltas_fila').update({ status: 'cancelado' }).eq('id', id)
    if (error) {
      alert(`Erro: ${error.message}`)
      return
    }
    loadFila()
  }

  async function marcarEnviado(id: string) {
    const { error } = await supabase
      .from('alertas_faltas_fila')
      .update({ status: 'enviado', enviado_em: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      alert(`Erro: ${error.message}`)
      return
    }
    loadFila()
  }

  async function abrirHistorico(linha: PainelLinha) {
    const { data } = await supabase
      .from('presencas')
      .select('id, data, presente, tipo_falta, observacoes')
      .eq('aluno_id', linha.aluno_id)
      .order('data', { ascending: false })
      .limit(30)
    setHistorico({ aluno: linha, itens: (data as HistoricoPresenca[]) || [] })
  }

  const filteredPainel = useMemo(() => {
    return linhas.filter((l) => {
      if (filtroRisco !== 'todos' && l.nivel_risco !== filtroRisco) return false
      if (busca) {
        const t = busca.toLowerCase()
        if (!l.aluno_nome?.toLowerCase().includes(t) && !l.aluno_telefone?.includes(t)) return false
      }
      return true
    })
  }, [linhas, busca, filtroRisco])

  const kpis = useMemo(() => {
    return {
      total: linhas.length,
      risco: linhas.filter((l) => l.nivel_risco === 'risco').length,
      atencao: linhas.filter((l) => l.nivel_risco === 'atencao').length,
      ok: linhas.filter((l) => l.nivel_risco === 'ok').length,
    }
  }, [linhas])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Controle de Faltas</h1>
          <p className="text-gray-500">Monitoramento de faltas + fila de alertas para alunos em risco</p>
        </div>
        <button
          onClick={detectarAgora}
          disabled={detectando}
          className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2.5 rounded-lg hover:bg-brand-600 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${detectando ? 'animate-spin' : ''}`} />
          {detectando ? 'Detectando...' : 'Detectar agora'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(['painel', 'fila'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'painel' ? 'Painel por aluno' : 'Fila de alertas'}
          </button>
        ))}
      </div>

      {tab === 'painel' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="Alunos ativos" value={String(kpis.total)} icon={<CheckCircle2 className="w-4 h-4" />} />
            <KpiCard
              label="Em risco"
              value={String(kpis.risco)}
              icon={<AlertTriangle className="w-4 h-4 text-red-600" />}
              color="text-red-700"
            />
            <KpiCard
              label="Atenção"
              value={String(kpis.atencao)}
              icon={<Clock className="w-4 h-4 text-yellow-600" />}
              color="text-yellow-700"
            />
            <KpiCard label="OK" value={String(kpis.ok)} icon={<CheckCircle2 className="w-4 h-4 text-green-600" />} color="text-green-700" />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={filtroRisco}
              onChange={(e) => setFiltroRisco(e.target.value)}
              className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm"
            >
              <option value="todos">Todos os níveis</option>
              <option value="risco">Risco</option>
              <option value="atencao">Atenção</option>
              <option value="ok">OK</option>
            </select>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar aluno ou telefone..."
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 text-sm"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-gray-500">Carregando...</div>
            ) : filteredPainel.length === 0 ? (
              <div className="p-8 text-center text-gray-500">Nenhum aluno encontrado.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Aluno</th>
                    <th className="px-4 py-3">Professor</th>
                    <th className="px-4 py-3 text-center">Faltas mês</th>
                    <th className="px-4 py-3 text-center">Consecutivas</th>
                    <th className="px-4 py-3 text-center">Ano</th>
                    <th className="px-4 py-3">Última falta</th>
                    <th className="px-4 py-3">Risco</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredPainel.map((l) => (
                    <tr key={l.aluno_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{l.aluno_nome}</div>
                        <div className="text-xs text-gray-500">
                          {l.aluno_telefone || '—'} {l.instrumento ? `• ${l.instrumento}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{l.professor_nome || '—'}</td>
                      <td className="px-4 py-3 text-center font-medium">{l.faltas_mes}</td>
                      <td className="px-4 py-3 text-center font-medium">{l.faltas_consecutivas}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{l.faltas_ano}</td>
                      <td className="px-4 py-3 text-gray-700">{formatBR(l.ultima_falta_em)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${RISCO_BADGE[l.nivel_risco]}`}>
                          {RISCO_LABEL[l.nivel_risco]}
                        </span>
                        {l.alerta_status && (
                          <div className="text-xs text-gray-500 mt-1">
                            Alerta: <span className="font-medium">{l.alerta_status}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => abrirHistorico(l)}
                          className="text-xs px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50 inline-flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          Histórico
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'fila' && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm"
            >
              <option value="todos">Todos</option>
              <option value="pendente">Pendentes</option>
              <option value="aprovado">Aprovados</option>
              <option value="enviado">Enviados</option>
              <option value="cancelado">Cancelados</option>
            </select>
            <p className="text-sm text-gray-500">
              Fluxo: <strong>pendente</strong> → revisar → <strong>aprovar</strong> → n8n envia → <strong>enviado</strong>
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-gray-500">Carregando...</div>
            ) : fila.length === 0 ? (
              <div className="p-8 text-center text-gray-500">Nenhum alerta nesta fila.</div>
            ) : (
              <ul className="divide-y">
                {fila.map((a) => (
                  <li key={a.id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-[300px]">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900">{a.aluno_nome}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[a.status]}`}>
                            {a.status}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mb-2">
                          {a.telefone} • Prof: {a.professor_nome || '—'} • {a.faltas_consecutivas} consecutivas / {a.faltas_mes} no mês
                          {' • '}
                          criado {formatBR(a.created_at)}
                        </div>
                        {a.mensagem_sugerida && (
                          <div className="bg-gray-50 border border-gray-200 rounded p-3 text-sm text-gray-700 italic">
                            {a.mensagem_sugerida}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 min-w-[140px]">
                        {a.status === 'pendente' && (
                          <>
                            <button
                              onClick={() => aprovarAlerta(a.id)}
                              className="text-xs px-3 py-1.5 rounded bg-blue-100 text-blue-800 hover:bg-blue-200 inline-flex items-center justify-center gap-1"
                            >
                              <Check className="w-3 h-3" />
                              Aprovar
                            </button>
                            <button
                              onClick={() => cancelarAlerta(a.id)}
                              className="text-xs px-3 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 inline-flex items-center justify-center gap-1"
                            >
                              <X className="w-3 h-3" />
                              Cancelar
                            </button>
                          </>
                        )}
                        {a.status === 'aprovado' && (
                          <>
                            <button
                              onClick={() => marcarEnviado(a.id)}
                              className="text-xs px-3 py-1.5 rounded bg-green-100 text-green-800 hover:bg-green-200 inline-flex items-center justify-center gap-1"
                            >
                              <Send className="w-3 h-3" />
                              Marcar enviado
                            </button>
                            <button
                              onClick={() => cancelarAlerta(a.id)}
                              className="text-xs px-3 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 inline-flex items-center justify-center gap-1"
                            >
                              <X className="w-3 h-3" />
                              Cancelar
                            </button>
                          </>
                        )}
                        {a.telefone && (
                          <a
                            href={`https://wa.me/${a.telefone.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50 inline-flex items-center justify-center gap-1"
                          >
                            Abrir WhatsApp
                          </a>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {historico && (
        <HistoricoModal
          aluno={historico.aluno}
          itens={historico.itens}
          onClose={() => setHistorico(null)}
        />
      )}
    </div>
  )
}

function KpiCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color?: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-5">
      <div className="flex items-center gap-2 mb-2 text-gray-500">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color || 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

function HistoricoModal({
  aluno,
  itens,
  onClose,
}: {
  aluno: PainelLinha
  itens: HistoricoPresenca[]
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Histórico de presenças</h2>
            <p className="text-sm text-gray-500">{aluno.aluno_nome} — últimas 30 aulas</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-5">
          {itens.length === 0 ? (
            <p className="text-center text-gray-500 py-8">Sem registros de presença ainda.</p>
          ) : (
            <ul className="divide-y">
              {itens.map((p) => (
                <li key={p.id} className="py-2 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium">{formatBR(p.data)}</span>
                    {p.tipo_falta && <span className="text-xs text-gray-500 ml-2">({p.tipo_falta})</span>}
                    {p.observacoes && <p className="text-xs text-gray-500 mt-0.5">{p.observacoes}</p>}
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      p.presente ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {p.presente ? 'Presente' : 'Falta'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
