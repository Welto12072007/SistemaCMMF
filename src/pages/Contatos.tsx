import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Search, Plus, Phone, Mail, Filter, AlertTriangle, History, Check } from 'lucide-react'
import type { Contato } from '@/types'

const STATUS_OPTIONS = [
  'Todos os status',
  'lead',
  'qualificado',
  'experimental_agendada',
  'experimental_concluida',
  'matriculado',
  'perdido',
  'Em Follow-up',
]

const CANAL_OPTIONS = ['Todas as origens', 'WhatsApp', 'Instagram', 'Indicação', 'Google']
const INSTRUMENTO_OPTIONS = ['Todos os instrumentos', 'Piano', 'Violão', 'Canto', 'Guitarra', 'Bateria', 'Ukulele', 'Violino', 'Contrabaixo', 'Cavaquinho', 'Percussão']

const statusColor: Record<string, string> = {
  lead: 'bg-blue-100 text-blue-800',
  qualificado: 'bg-yellow-100 text-yellow-800',
  experimental_agendada: 'bg-brand-50 text-brand-800',
  experimental_concluida: 'bg-purple-100 text-purple-800',
  matriculado: 'bg-green-100 text-green-800',
  perdido: 'bg-red-100 text-red-800',
  'Em Follow-up': 'bg-purple-100 text-purple-800',
}

export default function Contatos() {
  const [contatos, setContatos] = useState<Contato[]>([])
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('Todos os status')
  const [filtroCanal, setFiltroCanal] = useState('Todas as origens')
  const [filtroInstrumento, setFiltroInstrumento] = useState('Todos os instrumentos')
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState<Contato | null>(null)
  const [auditAluno, setAuditAluno] = useState<Contato | null>(null)
  const [auditLog, setAuditLog] = useState<any[]>([])
  const [filtroInvalidos, setFiltroInvalidos] = useState<'todos'|'validos'|'invalidos'>('todos')

  useEffect(() => {
    loadContatos()
  }, [])

  async function loadContatos() {
    const { data } = await supabase
      .from('alunos')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setContatos(data)
  }

  // Filtrar apenas leads — exclui alunos ativos (estes aparecem em Usuários)
  const leads = contatos.filter(c => !['ativo', 'matriculado'].includes(c.status || ''))

  const filtered = leads.filter((c) => {
    if (busca && !c.nome?.toLowerCase().includes(busca.toLowerCase()) && !c.telefone?.includes(busca) && !(c.email?.toLowerCase().includes(busca.toLowerCase()))) return false
    if (filtroStatus !== 'Todos os status' && c.status !== filtroStatus) return false
    if (filtroCanal !== 'Todas as origens' && c.origem !== filtroCanal) return false
    if (filtroInstrumento !== 'Todos os instrumentos' && c.instrumento_interesse !== filtroInstrumento) return false
    if (filtroInvalidos === 'invalidos' && !(c as any).contato_invalido) return false
    if (filtroInvalidos === 'validos' && (c as any).contato_invalido) return false
    return true
  })

  async function toggleInvalido(c: Contato) {
    const novoValor = !(c as any).contato_invalido
    const motivo = novoValor ? prompt('Motivo (telefone errado, número não existe, e-mail bounce, etc):') : null
    if (novoValor && !motivo?.trim()) return
    const { error } = await supabase.from('alunos').update({
      contato_invalido: novoValor,
      contato_invalido_motivo: motivo,
    }).eq('id', c.id)
    if (error) { alert('Erro: ' + error.message); return }
    loadContatos()
  }

  async function abrirAudit(c: Contato) {
    setAuditAluno(c)
    const { data } = await supabase
      .from('contatos_audit_log')
      .select('*')
      .eq('aluno_id', c.id)
      .order('alterado_em', { ascending: false })
      .limit(50)
    setAuditLog(data || [])
  }

  async function handleSave(data: Partial<Contato>) {
    if (editando) {
      await supabase.from('alunos').update(data).eq('id', editando.id)
    } else {
      await supabase.from('alunos').insert(data)
    }
    setShowForm(false)
    setEditando(null)
    loadContatos()
  }

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja excluir este contato?')) return
    await supabase.from('alunos').delete().eq('id', id)
    loadContatos()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contatos</h1>
          <p className="text-gray-500">Leads e futuros clientes que entraram em contato</p>
        </div>
        <button
          onClick={() => { setEditando(null); setShowForm(true) }}
          className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2.5 rounded-lg hover:bg-brand-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Contato
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome, telefone ou email..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm"
          />
        </div>
        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm">
          {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={filtroCanal} onChange={(e) => setFiltroCanal(e.target.value)} className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm">
          {CANAL_OPTIONS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={filtroInstrumento} onChange={(e) => setFiltroInstrumento(e.target.value)} className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm">
          {INSTRUMENTO_OPTIONS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={filtroInvalidos} onChange={(e) => setFiltroInvalidos(e.target.value as any)} className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm">
          <option value="todos">Todos contatos</option>
          <option value="validos">Só válidos</option>
          <option value="invalidos">Só inválidos</option>
        </select>
      </div>

      <p className="text-sm text-gray-500 flex items-center gap-1">
        <Filter className="w-3.5 h-3.5" />
        {filtered.length} contato(s) encontrado(s)
      </p>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Nome</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Contato</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Instrumento</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Origem</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Data</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
                    {c.nome}
                    {(c as any).contato_invalido && (
                      <span title={(c as any).contato_invalido_motivo || 'Contato inválido'}
                        className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                        <AlertTriangle className="w-3 h-3" /> Inválido
                      </span>
                    )}
                  </p>
                  {c.nome_responsavel && <p className="text-xs text-gray-500">Resp: {c.nome_responsavel}</p>}
                </td>
                <td className="px-4 py-3">
                  <p className="text-sm text-gray-700 flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {c.telefone}
                  </p>
                  {c.email && (
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Mail className="w-3 h-3" /> {c.email}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{c.instrumento_interesse || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{c.origem || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${statusColor[c.status ?? ''] ?? 'bg-gray-100 text-gray-800'}`}>
                    {c.status || '—'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => { setEditando(c); setShowForm(true) }}
                      className="text-xs px-3 py-1.5 rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => toggleInvalido(c)}
                      title={(c as any).contato_invalido ? 'Marcar como válido' : 'Marcar contato como inválido'}
                      className={`text-xs px-2 py-1.5 rounded-md transition-colors ${(c as any).contato_invalido ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
                    >
                      {(c as any).contato_invalido ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                    </button>
                    <button
                      onClick={() => abrirAudit(c)}
                      title="Histórico de alterações"
                      className="text-xs px-2 py-1.5 rounded-md bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      <History className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="text-xs px-3 py-1.5 rounded-md bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    >
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-10 text-gray-400">
            Nenhum contato encontrado
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <ContatoForm
          contato={editando}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditando(null) }}
        />
      )}

      {/* Audit Log Modal */}
      {auditAluno && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setAuditAluno(null)}>
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2"><History className="w-5 h-5" /> Histórico — {auditAluno.nome}</h2>
              <button onClick={() => setAuditAluno(null)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            {auditLog.length === 0 ? (
              <p className="text-sm text-gray-500 py-8 text-center">Nenhuma alteração registrada.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-gray-500 border-b">
                  <tr>
                    <th className="text-left p-2">Data</th>
                    <th className="text-left p-2">Campo</th>
                    <th className="text-left p-2">De</th>
                    <th className="text-left p-2">Para</th>
                    <th className="text-left p-2">Por</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((l) => (
                    <tr key={l.id} className="border-b">
                      <td className="p-2 text-xs text-gray-600">{new Date(l.alterado_em).toLocaleString('pt-BR')}</td>
                      <td className="p-2 font-medium">{l.campo}</td>
                      <td className="p-2 text-gray-500 line-through">{l.valor_antigo || '—'}</td>
                      <td className="p-2 text-gray-900">{l.valor_novo || '—'}</td>
                      <td className="p-2 text-xs text-gray-500">{l.alterado_por || 'system'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ContatoForm({ contato, onSave, onClose }: {
  contato: Contato | null
  onSave: (data: Partial<Contato>) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    nome: contato?.nome ?? '',
    telefone: contato?.telefone ?? '',
    email: contato?.email ?? '',
    instrumento_interesse: contato?.instrumento_interesse ?? '',
    origem: contato?.origem ?? 'WhatsApp',
    status: contato?.status ?? 'lead',
    observacoes: contato?.observacoes ?? '',
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">{contato ? 'Editar Contato' : 'Novo Contato'}</h2>
        <div className="space-y-3">
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Nome completo" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Telefone" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Email (opcional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.instrumento_interesse} onChange={(e) => setForm({ ...form, instrumento_interesse: e.target.value })}>
            <option value="">Selecione o instrumento</option>
            {INSTRUMENTO_OPTIONS.slice(1).map((i) => <option key={i}>{i}</option>)}
          </select>
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.origem} onChange={(e) => setForm({ ...form, origem: e.target.value })}>
            {CANAL_OPTIONS.slice(1).map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {STATUS_OPTIONS.slice(1).map((s) => <option key={s}>{s}</option>)}
          </select>
          <textarea className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Observações" rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button onClick={() => onSave(form)} className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600">Salvar</button>
        </div>
      </div>
    </div>
  )
}
