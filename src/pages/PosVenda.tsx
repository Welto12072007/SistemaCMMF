import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  Gift,
  Package,
  MessageSquare,
  Calendar,
  CalendarRange,
  BarChart3,
  LayoutDashboard,
  Plus,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  X,
  Pencil,
  Save,
  RefreshCw,
  ArrowRight,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────
interface Brinde {
  id: string
  nome: string
  descricao?: string
  tipo_marco: number
  instrumento_alvo: string
  estoque_atual: number
  estoque_minimo: number
  custo_unitario: number
  fornecedor?: string
  ativo: boolean
}

interface ModeloMensagem {
  id: string
  nome_modelo: string
  tipo_marco: number
  instrumento_alvo: string
  conteudo: string
  ativo: boolean
}

interface EntregaBrinde {
  id: string
  aluno_id: string
  brinde_id?: string
  tipo_marco: number
  data_prevista: string
  data_entrega?: string
  status: 'pendente' | 'entregue' | 'atrasado'
  mensagem_gerada?: string
  observacoes?: string
  aluno?: { nome: string; instrumento_interesse?: string }
  brinde?: Brinde
}

type Tab = 'painel' | 'brindes' | 'mensagens' | 'semana' | 'mes' | 'ano' | 'relatorios'

const TABS = [
  { id: 'painel', label: 'Painel', icon: LayoutDashboard },
  { id: 'semana', label: 'Semana', icon: Calendar },
  { id: 'mes', label: 'Mês', icon: CalendarRange },
  { id: 'ano', label: 'Ano', icon: BarChart3 },
  { id: 'brindes', label: 'Estoque', icon: Package },
  { id: 'mensagens', label: 'Mensagens', icon: MessageSquare },
  { id: 'relatorios', label: 'Relatórios', icon: BarChart3 },
] as const

const MARCOS = [3, 6, 12]
const INSTRUMENTOS = ['todos', 'violão', 'guitarra', 'contrabaixo', 'cordas', 'bateria', 'teclado', 'piano', 'canto', 'cavaquinho', 'ukulele', 'flauta', 'saxofone', 'trompete', 'violino', 'percussão', 'outro']

// ─── Helpers ─────────────────────────────────────────────────────────────────
function marcoLabel(m: number) { return `${m} meses` }
function fmtDate(d: string) {
  if (!d) return '—'
  const [y, mo, day] = d.split('-')
  return `${day}/${mo}/${y}`
}
function fmtBRL(v: number) { return `R$ ${v.toFixed(2).replace('.', ',')}` }
function isAtrasado(e: EntregaBrinde) {
  return e.status === 'pendente' && new Date(e.data_prevista) < new Date()
}
function semanaRange() {
  const hoje = new Date()
  const dow = hoje.getDay()
  const seg = new Date(hoje); seg.setDate(hoje.getDate() - (dow === 0 ? 6 : dow - 1))
  const sab = new Date(seg); sab.setDate(seg.getDate() + 6)
  return {
    start: seg.toISOString().slice(0, 10),
    end: sab.toISOString().slice(0, 10),
  }
}

// ─── Componentes pequenos ─────────────────────────────────────────────────────
function StatusBadge({ status, atrasado }: { status: string; atrasado?: boolean }) {
  const s = atrasado ? 'atrasado' : status
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
      s === 'entregue' ? 'bg-emerald-100 text-emerald-700' :
      s === 'atrasado' ? 'bg-red-100 text-red-700' :
      'bg-amber-100 text-amber-700'
    }`}>
      {s === 'entregue' ? <Check className="w-3 h-3" /> : s === 'atrasado' ? <AlertTriangle className="w-3 h-3" /> : null}
      {s === 'entregue' ? 'Entregue' : s === 'atrasado' ? 'Atrasado' : 'Pendente'}
    </span>
  )
}

// ─── Modal de Entrega ─────────────────────────────────────────────────────────
function EntregaModal({
  entrega, brindes, modelos, onClose, onSave, onMarcarEntregue
}: {
  entrega: EntregaBrinde
  brindes: Brinde[]
  modelos: ModeloMensagem[]
  onClose: () => void
  onSave: (id: string, data: Partial<EntregaBrinde>) => void
  onMarcarEntregue: (id: string) => void
}) {
  const [brindeId, setBrindeId] = useState(entrega.brinde_id || '')
  const [modeloId, setModeloId] = useState('')
  const [mensagem, setMensagem] = useState(entrega.mensagem_gerada || '')
  const [obs, setObs] = useState(entrega.observacoes || '')
  const [saving, setSaving] = useState(false)
  const [marking, setMarking] = useState(false)

  const aluno = entrega.aluno
  const instrumento = aluno?.instrumento_interesse || ''

  const modelosFiltrados = modelos.filter(m =>
    m.ativo && m.tipo_marco === entrega.tipo_marco &&
    (m.instrumento_alvo === 'todos' || m.instrumento_alvo.toLowerCase() === instrumento.toLowerCase())
  )

  function aplicarModelo(id: string) {
    setModeloId(id)
    const modelo = modelos.find(m => m.id === id)
    if (!modelo) return
    const texto = modelo.conteudo
      .replace(/{nome}/g, aluno?.nome || '')
      .replace(/{instrumento}/g, instrumento || 'música')
      .replace(/{meses}/g, String(entrega.tipo_marco))
    setMensagem(texto)
  }

  async function handleSave() {
    setSaving(true)
    await onSave(entrega.id, { brinde_id: brindeId || undefined, mensagem_gerada: mensagem, observacoes: obs })
    setSaving(false)
  }

  async function handleEntregar() {
    setMarking(true)
    await onMarcarEntregue(entrega.id)
    setMarking(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-brand-500" />
            <h3 className="font-semibold text-gray-900">{marcoLabel(entrega.tipo_marco)} — {aluno?.nome}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Info aluno */}
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <p><span className="text-gray-500">Instrumento:</span> <strong>{instrumento || '—'}</strong></p>
            <p><span className="text-gray-500">Data prevista:</span> <strong>{fmtDate(entrega.data_prevista)}</strong></p>
            <p><span className="text-gray-500">Status:</span> <StatusBadge status={entrega.status} atrasado={isAtrasado(entrega)} /></p>
          </div>

          {/* Brinde */}
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1">Brinde</label>
            <select
              value={brindeId}
              onChange={e => setBrindeId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Sem brinde selecionado</option>
              {brindes.filter(b => b.ativo && b.tipo_marco === entrega.tipo_marco).map(b => (
                <option key={b.id} value={b.id}>
                  {b.nome} — estoque: {b.estoque_atual}
                </option>
              ))}
            </select>
          </div>

          {/* Modelo de mensagem */}
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1">Modelo de Dedicatória</label>
            <select
              value={modeloId}
              onChange={e => aplicarModelo(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Selecionar modelo...</option>
              {modelosFiltrados.map(m => (
                <option key={m.id} value={m.id}>{m.nome_modelo}</option>
              ))}
            </select>
          </div>

          {/* Mensagem gerada */}
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1">Dedicatória (editável)</label>
            <textarea
              value={mensagem}
              onChange={e => setMensagem(e.target.value)}
              rows={4}
              placeholder="Selecione um modelo acima ou escreva a dedicatória..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Observações */}
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1">Observações</label>
            <input
              value={obs}
              onChange={e => setObs(e.target.value)}
              placeholder="Ex: entregue no recital de inverno"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 border border-gray-300 bg-white text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            {entrega.status !== 'entregue' && (
              <button
                onClick={handleEntregar}
                disabled={marking}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                {marking ? 'Marcando...' : 'Marcar como entregue'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Modal de Brinde (CRUD) ───────────────────────────────────────────────────
function BrindeModal({ brinde, onClose, onSave }: {
  brinde: Brinde | null
  onClose: () => void
  onSave: () => void
}) {
  const [form, setForm] = useState({
    nome: brinde?.nome ?? '',
    descricao: brinde?.descricao ?? '',
    tipo_marco: String(brinde?.tipo_marco ?? 3),
    instrumento_alvo: brinde?.instrumento_alvo ?? 'todos',
    estoque_atual: String(brinde?.estoque_atual ?? 0),
    estoque_minimo: String(brinde?.estoque_minimo ?? 5),
    custo_unitario: String(brinde?.custo_unitario ?? ''),
    fornecedor: brinde?.fornecedor ?? '',
    ativo: brinde?.ativo ?? true,
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!form.nome.trim()) { alert('Nome é obrigatório'); return }
    setSaving(true)
    const payload = {
      nome: form.nome,
      descricao: form.descricao || null,
      tipo_marco: parseInt(form.tipo_marco),
      instrumento_alvo: form.instrumento_alvo,
      estoque_atual: parseInt(form.estoque_atual) || 0,
      estoque_minimo: parseInt(form.estoque_minimo) || 5,
      custo_unitario: parseFloat(form.custo_unitario) || 0,
      fornecedor: form.fornecedor || null,
      ativo: form.ativo,
    }
    if (brinde?.id) {
      const { error } = await supabase.from('brindes').update(payload).eq('id', brinde.id)
      if (error) { alert('Erro: ' + error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('brindes').insert(payload)
      if (error) { alert('Erro: ' + error.message); setSaving(false); return }
    }
    setSaving(false)
    onSave()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="font-semibold text-gray-900">{brinde ? 'Editar Brinde' : 'Novo Brinde'}</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Nome*</label>
            <input value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Ex: Palheta personalizada 3 meses" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Marco</label>
              <select value={form.tipo_marco} onChange={e => setForm({...form, tipo_marco: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                {MARCOS.map(m => <option key={m} value={m}>{m} meses</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Instrumento alvo</label>
              <select value={form.instrumento_alvo} onChange={e => setForm({...form, instrumento_alvo: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                {INSTRUMENTOS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Estoque atual</label>
              <input type="number" value={form.estoque_atual} onChange={e => setForm({...form, estoque_atual: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Estoque mínimo</label>
              <input type="number" value={form.estoque_minimo} onChange={e => setForm({...form, estoque_minimo: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Custo (R$)</label>
              <input type="number" step="0.01" value={form.custo_unitario} onChange={e => setForm({...form, custo_unitario: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Fornecedor</label>
            <input value={form.fornecedor} onChange={e => setForm({...form, fornecedor: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Nome do fornecedor" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Descrição</label>
            <input value={form.descricao} onChange={e => setForm({...form, descricao: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.ativo} onChange={e => setForm({...form, ativo: e.target.checked})} className="rounded accent-brand-500" />
            Brinde ativo
          </label>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving} className="flex items-center gap-1.5 bg-brand-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-brand-600 disabled:opacity-50">
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal de Modelo de Mensagem ──────────────────────────────────────────────
function ModeloModal({ modelo, onClose, onSave }: {
  modelo: ModeloMensagem | null
  onClose: () => void
  onSave: () => void
}) {
  const [form, setForm] = useState({
    nome_modelo: modelo?.nome_modelo ?? '',
    tipo_marco: String(modelo?.tipo_marco ?? 3),
    instrumento_alvo: modelo?.instrumento_alvo ?? 'todos',
    conteudo: modelo?.conteudo ?? '',
    ativo: modelo?.ativo ?? true,
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!form.nome_modelo.trim() || !form.conteudo.trim()) { alert('Nome e conteúdo são obrigatórios'); return }
    setSaving(true)
    const payload = { ...form, tipo_marco: parseInt(form.tipo_marco) }
    if (modelo?.id) {
      const { error } = await supabase.from('modelos_mensagem_brinde').update(payload).eq('id', modelo.id)
      if (error) { alert('Erro: ' + error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('modelos_mensagem_brinde').insert(payload)
      if (error) { alert('Erro: ' + error.message); setSaving(false); return }
    }
    setSaving(false); onSave(); onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="font-semibold text-gray-900">{modelo ? 'Editar Modelo' : 'Novo Modelo de Mensagem'}</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Nome do modelo*</label>
            <input value={form.nome_modelo} onChange={e => setForm({...form, nome_modelo: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Ex: 6 meses — canto" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Marco</label>
              <select value={form.tipo_marco} onChange={e => setForm({...form, tipo_marco: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                {MARCOS.map(m => <option key={m} value={m}>{m} meses</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Instrumento</label>
              <select value={form.instrumento_alvo} onChange={e => setForm({...form, instrumento_alvo: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                {INSTRUMENTOS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Conteúdo* — use {'{nome}'}, {'{instrumento}'}, {'{meses}'}</label>
            <textarea
              value={form.conteudo}
              onChange={e => setForm({...form, conteudo: e.target.value})}
              rows={5}
              className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
              placeholder="{nome}, parabéns por {meses} meses de {instrumento}! ..."
            />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.ativo} onChange={e => setForm({...form, ativo: e.target.checked})} className="rounded accent-brand-500" />
            Modelo ativo
          </label>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving} className="flex items-center gap-1.5 bg-brand-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-brand-600 disabled:opacity-50">
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tabela de entregas (reutilizável) ────────────────────────────────────────
function EntregasTable({ entregas, brindes, modelos, onRefresh }: {
  entregas: EntregaBrinde[]
  brindes: Brinde[]
  modelos: ModeloMensagem[]
  onRefresh: () => void
}) {
  const [modal, setModal] = useState<EntregaBrinde | null>(null)

  async function handleSaveEntrega(id: string, data: Partial<EntregaBrinde>) {
    const { error } = await supabase.from('entregas_brinde').update(data).eq('id', id)
    if (error) alert('Erro: ' + error.message)
    else onRefresh()
  }

  async function handleMarcarEntregue(id: string) {
    const { data, error } = await supabase.rpc('marcar_brinde_entregue', { p_entrega_id: id })
    if (error) { alert('Erro: ' + error.message); return }
    if (data?.alerta_estoque) {
      alert(`⚠️ Estoque baixo! Restam ${data.estoque_atual} unidade(s) — abaixo do mínimo.`)
    }
    onRefresh()
  }

  if (entregas.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">Nenhuma entrega neste período.</p>
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Aluno</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Instrumento</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Marco</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Brinde</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Previsto</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {entregas.map(e => (
              <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-2.5 font-medium text-gray-900">{e.aluno?.nome || '—'}</td>
                <td className="px-4 py-2.5 text-gray-600 capitalize">{e.aluno?.instrumento_interesse || '—'}</td>
                <td className="px-4 py-2.5"><span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">{marcoLabel(e.tipo_marco)}</span></td>
                <td className="px-4 py-2.5 text-gray-600">{e.brinde?.nome || <span className="text-gray-400 italic">Não definido</span>}</td>
                <td className="px-4 py-2.5 text-gray-600">{fmtDate(e.data_prevista)}</td>
                <td className="px-4 py-2.5"><StatusBadge status={e.status} atrasado={isAtrasado(e)} /></td>
                <td className="px-4 py-2.5">
                  <button
                    onClick={() => setModal(e)}
                    className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800 font-medium"
                  >
                    <Pencil className="w-3 h-3" />
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && (
        <EntregaModal
          entrega={modal}
          brindes={brindes}
          modelos={modelos}
          onClose={() => setModal(null)}
          onSave={handleSaveEntrega}
          onMarcarEntregue={handleMarcarEntregue}
        />
      )}
    </>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function PosVenda() {
  const [tab, setTab] = useState<Tab>('painel')
  const [brindes, setBrindes] = useState<Brinde[]>([])
  const [modelos, setModelos] = useState<ModeloMensagem[]>([])
  const [entregas, setEntregas] = useState<EntregaBrinde[]>([])
  const [loading, setLoading] = useState(true)
  const [gerando, setGerando] = useState(false)

  // Filtros
  const [mesFiltro, setMesFiltro] = useState(() => new Date().toISOString().slice(0, 7))
  const [anoFiltro, setAnoFiltro] = useState(() => String(new Date().getFullYear()))

  // Modais
  const [modalBrinde, setModalBrinde] = useState<{ open: boolean; item: Brinde | null }>({ open: false, item: null })
  const [modalModelo, setModalModelo] = useState<{ open: boolean; item: ModeloMensagem | null }>({ open: false, item: null })

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: br }, { data: mo }, { data: en }] = await Promise.all([
      supabase.from('brindes').select('*').order('tipo_marco').order('nome'),
      supabase.from('modelos_mensagem_brinde').select('*').order('tipo_marco'),
      supabase.from('entregas_brinde').select(`
        *,
        aluno:alunos(nome, instrumento_interesse),
        brinde:brindes(*)
      `).order('data_prevista'),
    ])
    setBrindes(br || [])
    setModelos(mo || [])
    setEntregas((en || []) as EntregaBrinde[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function gerarEntregas() {
    setGerando(true)
    const { data, error } = await supabase.rpc('gerar_entregas_pendentes')
    if (error) alert('Erro: ' + error.message)
    else {
      alert(`✅ ${(data as {criados: number}).criados} entrega(s) gerada(s)!`)
      fetchData()
    }
    setGerando(false)
  }

  // ─── Derived data ──────────────────────────────────────────────────────────
  const entregasSemana = (() => {
    const { start, end } = semanaRange()
    return entregas.filter(e => e.data_prevista >= start && e.data_prevista <= end && e.status !== 'entregue')
  })()

  const entregasMes = entregas.filter(e => e.data_prevista.startsWith(mesFiltro))

  const entregasAno = entregas.filter(e => e.data_prevista.startsWith(anoFiltro))

  const alertasEstoque = brindes.filter(b => b.ativo && b.estoque_atual < b.estoque_minimo)

  const pendentes = entregas.filter(e => e.status === 'pendente')
  const atrasadas = entregas.filter(e => isAtrasado(e))

  // Custo estimado do mês (pendentes)
  const custoEstimadoMes = entregasMes
    .filter(e => e.status === 'pendente')
    .reduce((sum, e) => sum + (e.brinde?.custo_unitario || 0), 0)
  const custoRealMes = entregasMes
    .filter(e => e.status === 'entregue')
    .reduce((sum, e) => sum + (e.brinde?.custo_unitario || 0), 0)

  // Resumo por mês no ano
  const mesesAno = Array.from({ length: 12 }, (_, i) => {
    const mes = String(i + 1).padStart(2, '0')
    const chave = `${anoFiltro}-${mes}`
    const esMes = entregasAno.filter(e => e.data_prevista.startsWith(chave))
    return {
      mes: new Date(`${chave}-15`).toLocaleString('pt-BR', { month: 'short' }),
      m3: esMes.filter(e => e.tipo_marco === 3).length,
      m6: esMes.filter(e => e.tipo_marco === 6).length,
      m12: esMes.filter(e => e.tipo_marco === 12).length,
      total: esMes.length,
      custo: esMes.reduce((s, e) => s + (e.brinde?.custo_unitario || 0), 0),
    }
  })

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Gift className="w-8 h-8 text-brand-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pós-Venda — Brindes</h1>
            <p className="text-sm text-gray-500">Gestão de marcos, brindes e dedicatórias</p>
          </div>
        </div>
        {/* Botões de ação rápida */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={gerarEntregas}
            disabled={gerando}
            className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${gerando ? 'animate-spin' : ''}`} />
            Gerar entregas pendentes
          </button>
          <button
            onClick={() => setModalBrinde({ open: true, item: null })}
            className="flex items-center gap-1.5 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Novo brinde
          </button>
          <button
            onClick={() => setModalModelo({ open: true, item: null })}
            className="flex items-center gap-1.5 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium"
          >
            <MessageSquare className="w-4 h-4" />
            Nova mensagem
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as Tab)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.id ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: PAINEL ────────────────────────────────────────────────────── */}
      {tab === 'painel' && (
        <div className="space-y-5">
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Entregas esta semana</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{entregasSemana.length}</p>
              <p className="text-xs text-gray-400 mt-0.5">{pendentes.length} pendentes no total</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Atrasadas</p>
              <p className={`text-3xl font-bold mt-1 ${atrasadas.length > 0 ? 'text-red-600' : 'text-gray-900'}`}>{atrasadas.length}</p>
              <p className="text-xs text-gray-400 mt-0.5">Precisam de atenção</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Brindes em alerta</p>
              <p className={`text-3xl font-bold mt-1 ${alertasEstoque.length > 0 ? 'text-amber-600' : 'text-gray-900'}`}>{alertasEstoque.length}</p>
              <p className="text-xs text-gray-400 mt-0.5">Estoque abaixo do mínimo</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Custo previsto do mês</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{fmtBRL(custoEstimadoMes)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{entregasMes.filter(e => e.status === 'pendente').length} entregas previstas</p>
            </div>
          </div>

          {/* Próximas entregas */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="font-semibold text-gray-900">Próximas entregas</h3>
              <button onClick={() => setTab('semana')} className="text-sm text-brand-600 hover:text-brand-800 flex items-center gap-1">
                Ver semana <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-4">
              <EntregasTable entregas={entregasSemana.slice(0, 5)} brindes={brindes} modelos={modelos} onRefresh={fetchData} />
            </div>
          </div>

          {/* Alertas estoque */}
          {alertasEstoque.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-amber-200">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <h3 className="font-semibold text-gray-900">Brindes em alerta de estoque</h3>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {alertasEstoque.map(b => (
                  <div key={b.id} className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="font-medium text-gray-900 text-sm">{b.nome}</p>
                    <p className="text-xs text-gray-500">{marcoLabel(b.tipo_marco)} — {b.instrumento_alvo}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-xs text-amber-700 font-semibold">Estoque: {b.estoque_atual} / mín: {b.estoque_minimo}</span>
                      {b.fornecedor && <span className="text-xs text-gray-400">{b.fornecedor}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: SEMANA ────────────────────────────────────────────────────── */}
      {tab === 'semana' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-5 py-3 border-b">
            <h3 className="font-semibold text-gray-900">Entregas desta semana — {entregasSemana.length} pendentes</h3>
          </div>
          <div className="p-4">
            <EntregasTable entregas={entregasSemana} brindes={brindes} modelos={modelos} onRefresh={fetchData} />
          </div>
        </div>
      )}

      {/* ── TAB: MÊS ───────────────────────────────────────────────────────── */}
      {tab === 'mes' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="month"
              value={mesFiltro}
              onChange={e => setMesFiltro(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
            <div className="flex gap-4 text-sm text-gray-600">
              <span>Previsto: <strong className="text-gray-900">{fmtBRL(custoEstimadoMes)}</strong></span>
              <span>Realizado: <strong className="text-emerald-700">{fmtBRL(custoRealMes)}</strong></span>
            </div>
          </div>
          {/* Resumo por marco */}
          <div className="grid grid-cols-3 gap-3">
            {MARCOS.map(m => {
              const mesLista = entregasMes.filter(e => e.tipo_marco === m)
              return (
                <div key={m} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">{marcoLabel(m)}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{mesLista.length}</p>
                  <p className="text-xs text-gray-400">{mesLista.filter(e => e.status === 'entregue').length} entregues</p>
                </div>
              )
            })}
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="px-5 py-3 border-b">
              <h3 className="font-semibold text-gray-900">Todas as entregas — {mesFiltro}</h3>
            </div>
            <div className="p-4">
              <EntregasTable entregas={entregasMes} brindes={brindes} modelos={modelos} onRefresh={fetchData} />
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: ANO ───────────────────────────────────────────────────────── */}
      {tab === 'ano' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select value={anoFiltro} onChange={e => setAnoFiltro(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
              {[2025, 2026, 2027].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <span className="text-sm text-gray-500">
              Total previsto: <strong>{fmtBRL(entregasAno.reduce((s, e) => s + (e.brinde?.custo_unitario || 0), 0))}</strong>
            </span>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Mês</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500">3 meses</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500">6 meses</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500">12 meses</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500">Total</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Custo est.</th>
                </tr>
              </thead>
              <tbody>
                {mesesAno.map(r => (
                  <tr key={r.mes} className={`border-b border-gray-100 ${r.total > 0 ? 'hover:bg-gray-50' : 'text-gray-300'}`}>
                    <td className="px-4 py-2.5 font-medium capitalize">{r.mes}</td>
                    <td className="px-4 py-2.5 text-center">{r.m3 || '—'}</td>
                    <td className="px-4 py-2.5 text-center">{r.m6 || '—'}</td>
                    <td className="px-4 py-2.5 text-center">{r.m12 || '—'}</td>
                    <td className="px-4 py-2.5 text-center font-semibold">{r.total || '—'}</td>
                    <td className="px-4 py-2.5 text-right">{r.custo > 0 ? fmtBRL(r.custo) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                  <td className="px-4 py-2.5">Total</td>
                  <td className="px-4 py-2.5 text-center">{mesesAno.reduce((s, r) => s + r.m3, 0)}</td>
                  <td className="px-4 py-2.5 text-center">{mesesAno.reduce((s, r) => s + r.m6, 0)}</td>
                  <td className="px-4 py-2.5 text-center">{mesesAno.reduce((s, r) => s + r.m12, 0)}</td>
                  <td className="px-4 py-2.5 text-center">{mesesAno.reduce((s, r) => s + r.total, 0)}</td>
                  <td className="px-4 py-2.5 text-right">{fmtBRL(mesesAno.reduce((s, r) => s + r.custo, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB: ESTOQUE / BRINDES ─────────────────────────────────────────── */}
      {tab === 'brindes' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setModalBrinde({ open: true, item: null })} className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <Plus className="w-4 h-4" /> Novo brinde
            </button>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Nome</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Marco</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Instrumento</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500">Estoque</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500">Mínimo</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Custo unit.</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Val. estoque</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Fornecedor</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {brindes.map(b => {
                  const alerta = b.estoque_atual < b.estoque_minimo
                  return (
                    <tr key={b.id} className={`border-b border-gray-100 hover:bg-gray-50 ${!b.ativo ? 'opacity-40' : ''}`}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {alerta && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                          <span className="font-medium text-gray-900">{b.nome}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5"><span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">{marcoLabel(b.tipo_marco)}</span></td>
                      <td className="px-4 py-2.5 text-gray-600 capitalize">{b.instrumento_alvo}</td>
                      <td className={`px-4 py-2.5 text-center font-semibold ${alerta ? 'text-red-600' : 'text-gray-900'}`}>{b.estoque_atual}</td>
                      <td className="px-4 py-2.5 text-center text-gray-500">{b.estoque_minimo}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{fmtBRL(b.custo_unitario)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{fmtBRL(b.estoque_atual * b.custo_unitario)}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{b.fornecedor || '—'}</td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => setModalBrinde({ open: true, item: b })} className="text-xs text-brand-600 hover:text-brand-800">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB: MENSAGENS ─────────────────────────────────────────────────── */}
      {tab === 'mensagens' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setModalModelo({ open: true, item: null })} className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <Plus className="w-4 h-4" /> Novo modelo
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {modelos.map(m => (
              <div key={m.id} className={`bg-white rounded-xl shadow-sm border p-4 ${!m.ativo ? 'opacity-40' : 'border-gray-100'}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{m.nome_modelo}</p>
                    <div className="flex gap-2 mt-0.5">
                      <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">{marcoLabel(m.tipo_marco)}</span>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">{m.instrumento_alvo}</span>
                    </div>
                  </div>
                  <button onClick={() => setModalModelo({ open: true, item: m })} className="text-gray-400 hover:text-brand-600 shrink-0">
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed bg-gray-50 rounded-lg p-2.5">{m.conteudo}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB: RELATÓRIOS ────────────────────────────────────────────────── */}
      {tab === 'relatorios' && (
        <div className="space-y-5">
          {/* Custo por instrumento */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Custo por instrumento (entregas entregues)</h3>
            {(() => {
              const entregues = entregas.filter(e => e.status === 'entregue')
              const por = new Map<string, { qtd: number; custo: number }>()
              for (const e of entregues) {
                const instr = e.aluno?.instrumento_interesse || 'outros'
                const c = e.brinde?.custo_unitario || 0
                const prev = por.get(instr) || { qtd: 0, custo: 0 }
                por.set(instr, { qtd: prev.qtd + 1, custo: prev.custo + c })
              }
              const rows = Array.from(por.entries()).sort((a, b) => b[1].custo - a[1].custo)
              if (rows.length === 0) return <p className="text-sm text-gray-400">Nenhuma entrega realizada ainda.</p>
              return (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="pb-2 text-left text-xs font-semibold text-gray-500">Instrumento</th>
                      <th className="pb-2 text-center text-xs font-semibold text-gray-500">Entregas</th>
                      <th className="pb-2 text-right text-xs font-semibold text-gray-500">Custo total</th>
                      <th className="pb-2 text-right text-xs font-semibold text-gray-500">Custo médio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([instr, d]) => (
                      <tr key={instr} className="border-b border-gray-100">
                        <td className="py-2 capitalize font-medium">{instr}</td>
                        <td className="py-2 text-center">{d.qtd}</td>
                        <td className="py-2 text-right">{fmtBRL(d.custo)}</td>
                        <td className="py-2 text-right">{fmtBRL(d.custo / d.qtd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            })()}
          </div>

          {/* Custo por marco */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Custo por marco (tudo)</h3>
            <div className="grid grid-cols-3 gap-4">
              {MARCOS.map(m => {
                const lista = entregas.filter(e => e.tipo_marco === m)
                const entregues = lista.filter(e => e.status === 'entregue')
                const custoTotal = entregues.reduce((s, e) => s + (e.brinde?.custo_unitario || 0), 0)
                return (
                  <div key={m} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">{marcoLabel(m)}</p>
                    <p className="text-xl font-bold text-gray-900">{fmtBRL(custoTotal)}</p>
                    <p className="text-xs text-gray-400">{entregues.length} entregue(s) de {lista.length}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modais */}
      {modalBrinde.open && (
        <BrindeModal
          brinde={modalBrinde.item}
          onClose={() => setModalBrinde({ open: false, item: null })}
          onSave={fetchData}
        />
      )}
      {modalModelo.open && (
        <ModeloModal
          modelo={modalModelo.item}
          onClose={() => setModalModelo({ open: false, item: null })}
          onSave={fetchData}
        />
      )}
    </div>
  )
}
