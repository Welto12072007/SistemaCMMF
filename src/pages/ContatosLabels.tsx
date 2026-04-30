import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  MessageSquare, RefreshCw, PauseCircle, PlayCircle,
  Search, Phone, Tag, X, ChevronDown,
} from 'lucide-react'

// ─── tipos ────────────────────────────────────────────────────────────────────

interface ContatoLabel {
  telefone: string
  label_id: string
  label_name: string
  updated_at: string
}

interface PausaManual {
  telefone: string
  pausada: boolean
  motivo: string
  observacao?: string
  updated_at: string
}

interface ContatoView {
  telefone: string
  nome?: string
  labels: ContatoLabel[]
  pausada_manual: boolean
  pausada_motivo?: string
  origem: 'aulas_experimentais' | 'alunos' | 'label_only'
}

const LABEL_CORES: Record<string, string> = {
  '1': 'bg-blue-100 text-blue-700',
  '2': 'bg-gray-100 text-gray-600',
  '6': 'bg-orange-100 text-orange-700',
  '24': 'bg-purple-100 text-purple-700',
  '25': 'bg-yellow-100 text-yellow-700',
  '26': 'bg-teal-100 text-teal-700',
  '27': 'bg-red-100 text-red-700',     // Fechamento
  '28': 'bg-indigo-100 text-indigo-700', // Experimental marcada
  '29': 'bg-green-100 text-green-700',
}

const PAUSE_LABEL_IDS = new Set(['1', '6', '24', '27', '28'])

// ─── component ────────────────────────────────────────────────────────────────

export default function ContatosLabels() {
  const { perfil } = useAuth()

  const [loading, setLoading] = useState(true)
  const [contatos, setContatos] = useState<ContatoView[]>([])
  const [pausasManual, setPausasManual] = useState<PausaManual[]>([])
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<'todos' | 'pausados' | 'ativos'>('todos')

  // Modal pausa manual
  const [showModal, setShowModal] = useState(false)
  const [modalContato, setModalContato] = useState<ContatoView | null>(null)
  const [obsInput, setObsInput] = useState('')
  const [saving, setSaving] = useState(false)

  // ─── load ────────────────────────────────────────────────────────────────

  async function load() {
    setLoading(true)

    const [labelsRes, pausaRes, expRes, alunosRes] = await Promise.all([
      supabase.from('contato_labels').select('*').order('updated_at', { ascending: false }),
      supabase.from('sofia_pausada_manual').select('*').order('updated_at', { ascending: false }),
      supabase.from('aulas_experimentais').select('aluno_id, alunos(nome, telefone, telefone_responsavel)').limit(500),
      supabase.from('alunos').select('id, nome, telefone, telefone_responsavel').limit(500),
    ])

    const pausas: PausaManual[] = pausaRes.data ?? []
    setPausasManual(pausas)
    const pausaMap = new Map(pausas.map(p => [p.telefone, p]))

    // Agrupa labels por telefone
    const labelsMap = new Map<string, ContatoLabel[]>()
    for (const l of labelsRes.data ?? []) {
      if (!labelsMap.has(l.telefone)) labelsMap.set(l.telefone, [])
      labelsMap.get(l.telefone)!.push(l)
    }

    // Monta map de nomes (alunos + experimentais)
    const nomeMap = new Map<string, string>()
    for (const a of alunosRes.data ?? []) {
      if (a.telefone) nomeMap.set(a.telefone, a.nome)
      if (a.telefone_responsavel) nomeMap.set(a.telefone_responsavel, a.nome)
    }
    for (const e of expRes.data ?? []) {
      const al = (e.alunos as any)
      if (al?.telefone) nomeMap.set(al.telefone, al.nome)
      if (al?.telefone_responsavel) nomeMap.set(al.telefone_responsavel, al.nome)
    }

    // Todos os telefones conhecidos (labels + pausas manuais)
    const todosPhones = new Set<string>([
      ...labelsMap.keys(),
      ...pausas.map(p => p.telefone),
    ])

    const lista: ContatoView[] = []
    for (const tel of todosPhones) {
      const labels = labelsMap.get(tel) ?? []
      const pausa = pausaMap.get(tel)
      // Tem label de pausa ativa?
      const temLabelPausa = labels.some(l => PAUSE_LABEL_IDS.has(l.label_id))
      lista.push({
        telefone: tel,
        nome: nomeMap.get(tel),
        labels,
        pausada_manual: pausa?.pausada === true,
        pausada_motivo: pausa?.motivo,
        origem: nomeMap.has(tel) ? 'alunos' : 'label_only',
      })
    }

    // Ordena: pausados manuais primeiro, depois por telefone
    lista.sort((a, b) => {
      if (a.pausada_manual && !b.pausada_manual) return -1
      if (!a.pausada_manual && b.pausada_manual) return 1
      return a.telefone.localeCompare(b.telefone)
    })

    setContatos(lista)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // ─── toggle pausa ─────────────────────────────────────────────────────────

  async function togglePausa(c: ContatoView, novaPausa: boolean) {
    setModalContato({ ...c, pausada_manual: novaPausa })
    setObsInput('')
    setShowModal(true)
  }

  async function confirmarToggle() {
    if (!modalContato) return
    setSaving(true)
    const { error } = await supabase.rpc('toggle_sofia_pausada', {
      p_telefone: modalContato.telefone,
      p_pausada: modalContato.pausada_manual,
      p_motivo: modalContato.pausada_manual ? 'pausa_manual' : 'retomada_manual',
      p_obs: obsInput || null,
      p_user_id: perfil?.user_id ?? null,
    })
    setSaving(false)
    setShowModal(false)
    if (!error) load()
  }

  // ─── filtros ──────────────────────────────────────────────────────────────

  const filtrado = contatos.filter(c => {
    const matchBusca = !busca
      || c.telefone.includes(busca.replace(/\D/g, ''))
      || (c.nome ?? '').toLowerCase().includes(busca.toLowerCase())
      || c.labels.some(l => l.label_name.toLowerCase().includes(busca.toLowerCase()))

    const temPausa = c.pausada_manual || c.labels.some(l => PAUSE_LABEL_IDS.has(l.label_id))

    if (filtro === 'pausados' && !temPausa) return false
    if (filtro === 'ativos' && temPausa) return false

    return matchBusca
  })

  const totalPausados = contatos.filter(c =>
    c.pausada_manual || c.labels.some(l => PAUSE_LABEL_IDS.has(l.label_id))
  ).length

  // ─── render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 animate-spin text-brand-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Tag className="w-6 h-6 text-brand-600" />
          <h1 className="text-2xl font-bold text-gray-900">Contatos & Labels</h1>
        </div>
        <button onClick={load} className="p-2 text-gray-400 hover:text-gray-600">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* KPI + Aviso */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-800">{contatos.length}</p>
          <p className="text-xs text-gray-500 mt-1">Total contatos</p>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-200 p-4 text-center">
          <p className="text-2xl font-bold text-red-700">{totalPausados}</p>
          <p className="text-xs text-red-500 mt-1">Sofia pausada</p>
        </div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4 text-center">
          <p className="text-2xl font-bold text-emerald-700">{contatos.length - totalPausados}</p>
          <p className="text-xs text-emerald-500 mt-1">Sofia ativa</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por telefone, nome ou label..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
          {busca && (
            <button onClick={() => setBusca('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {(['todos', 'pausados', 'ativos'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-4 py-2 capitalize transition-colors ${filtro === f ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtrado.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Tag className="w-8 h-8 mb-2" />
            <p className="text-sm">Nenhum contato encontrado.</p>
            <p className="text-xs mt-1">Os labels são sincronizados automaticamente quando aplicados no WhatsApp.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Telefone</th>
                <th className="px-4 py-3 text-left font-medium">Nome</th>
                <th className="px-4 py-3 text-left font-medium">Labels WhatsApp</th>
                <th className="px-4 py-3 text-center font-medium">Sofia</th>
                <th className="px-4 py-3 text-center font-medium">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtrado.map(c => {
                const temLabelPausa = c.labels.some(l => PAUSE_LABEL_IDS.has(l.label_id))
                const pausada = c.pausada_manual || temLabelPausa
                return (
                  <tr key={c.telefone} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <span className="font-mono text-gray-700">{c.telefone}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.nome ?? <span className="text-gray-300 italic">desconhecido</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.labels.length === 0 ? (
                          <span className="text-xs text-gray-300">—</span>
                        ) : c.labels.map(l => (
                          <span
                            key={l.label_id}
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${LABEL_CORES[l.label_id] ?? 'bg-gray-100 text-gray-600'}`}
                          >
                            {l.label_name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {pausada ? (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
                          <PauseCircle className="w-3.5 h-3.5" />
                          {c.pausada_manual ? 'Manual' : 'Label'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                          <PlayCircle className="w-3.5 h-3.5" />
                          Ativa
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {c.pausada_manual ? (
                        <button
                          onClick={() => togglePausa(c, false)}
                          className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg font-medium"
                        >
                          Retomar Sofia
                        </button>
                      ) : (
                        <button
                          onClick={() => togglePausa(c, true)}
                          className="text-xs bg-red-50 hover:bg-red-100 text-red-700 px-3 py-1.5 rounded-lg font-medium"
                        >
                          Pausar Sofia
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Info sobre sync */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
        <strong>Como funciona:</strong> Labels aplicados no WhatsApp são sincronizados automaticamente.
        Use "Pausar Sofia" para bloquear a IA mesmo sem label (ex: chefe assumiu o contato).
        A pausa manual tem prioridade sobre tudo — mesmo que o label seja removido, a Sofia fica pausada até você clicar "Retomar".
      </div>

      {/* Modal confirmar toggle */}
      {showModal && modalContato && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center gap-3">
              {modalContato.pausada_manual ? (
                <PauseCircle className="w-6 h-6 text-red-500 flex-shrink-0" />
              ) : (
                <PlayCircle className="w-6 h-6 text-emerald-500 flex-shrink-0" />
              )}
              <h2 className="text-base font-bold text-gray-900">
                {modalContato.pausada_manual ? 'Pausar Sofia' : 'Retomar Sofia'}
              </h2>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
              <p className="font-mono">{modalContato.telefone}</p>
              {modalContato.nome && <p className="text-xs text-gray-400 mt-0.5">{modalContato.nome}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observação (opcional)</label>
              <input
                type="text"
                value={obsInput}
                onChange={e => setObsInput(e.target.value)}
                placeholder={modalContato.pausada_manual ? 'Ex: chefe assumiu o atendimento' : 'Ex: fechamento concluído'}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <p className="text-xs text-gray-400">
              {modalContato.pausada_manual
                ? 'Sofia ficará pausada para este contato até você retomar manualmente.'
                : 'Sofia voltará a responder este contato normalmente.'}
            </p>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setShowModal(false)} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">
                Cancelar
              </button>
              <button
                onClick={confirmarToggle}
                disabled={saving}
                className={`text-sm text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 ${modalContato.pausada_manual ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                {saving ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
