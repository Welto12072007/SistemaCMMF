import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Search, Plus, Phone, Mail, Filter } from 'lucide-react'
import type { Contato } from '@/types'

const STATUS_OPTIONS = [
  'Todos os status',
  'Primeiro Contato',
  'Aguardando Experimental',
  'Aula Experimental Marcada',
  'Em Follow-up',
  'Matriculado',
  'Perdido',
]

const CANAL_OPTIONS = ['Todos os canais', 'WhatsApp', 'Instagram', 'Indicação', 'Google']
const INSTRUMENTO_OPTIONS = ['Todos os instrumentos', 'Piano', 'Violão', 'Canto', 'Guitarra', 'Bateria', 'Ukulele', 'Violino', 'Contrabaixo', 'Cavaquinho', 'Percussão']

const statusColor: Record<string, string> = {
  'Primeiro Contato': 'bg-blue-100 text-blue-800',
  'Aguardando Experimental': 'bg-yellow-100 text-yellow-800',
  'Aula Experimental Marcada': 'bg-orange-100 text-orange-800',
  'Em Follow-up': 'bg-purple-100 text-purple-800',
  'Matriculado': 'bg-green-100 text-green-800',
  'Perdido': 'bg-red-100 text-red-800',
}

export default function Contatos() {
  const [contatos, setContatos] = useState<Contato[]>([])
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('Todos os status')
  const [filtroCanal, setFiltroCanal] = useState('Todos os canais')
  const [filtroInstrumento, setFiltroInstrumento] = useState('Todos os instrumentos')
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState<Contato | null>(null)

  useEffect(() => {
    loadContatos()
  }, [])

  async function loadContatos() {
    const { data } = await supabase
      .from('contatos')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setContatos(data)
  }

  const filtered = contatos.filter((c) => {
    if (busca && !c.nome.toLowerCase().includes(busca.toLowerCase()) && !c.telefone.includes(busca) && !(c.email?.toLowerCase().includes(busca.toLowerCase()))) return false
    if (filtroStatus !== 'Todos os status' && c.status !== filtroStatus) return false
    if (filtroCanal !== 'Todos os canais' && c.canal_origem !== filtroCanal) return false
    if (filtroInstrumento !== 'Todos os instrumentos' && c.instrumento !== filtroInstrumento) return false
    return true
  })

  async function handleSave(data: Partial<Contato>) {
    if (editando) {
      await supabase.from('contatos').update(data).eq('id', editando.id)
    } else {
      await supabase.from('contatos').insert(data)
    }
    setShowForm(false)
    setEditando(null)
    loadContatos()
  }

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja excluir este contato?')) return
    await supabase.from('contatos').delete().eq('id', id)
    loadContatos()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contatos</h1>
          <p className="text-gray-500">Gerencie todos os contatos e leads da escola</p>
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
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Canal</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Data</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-900">{c.nome}</p>
                  <p className="text-xs text-gray-500">{c.tipo_pessoa}</p>
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
                <td className="px-4 py-3 text-sm text-gray-700">{c.instrumento}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{c.canal_origem}</td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {new Date(c.data_contato).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${statusColor[c.status] ?? 'bg-gray-100 text-gray-800'}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button
                      onClick={() => { setEditando(c); setShowForm(true) }}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="text-xs text-red-600 hover:underline"
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
    tipo_pessoa: contato?.tipo_pessoa ?? 'Adulto',
    instrumento: contato?.instrumento ?? '',
    canal_origem: contato?.canal_origem ?? 'WhatsApp',
    status: contato?.status ?? 'Primeiro Contato',
    data_contato: contato?.data_contato ?? new Date().toISOString().split('T')[0],
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
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.tipo_pessoa} onChange={(e) => setForm({ ...form, tipo_pessoa: e.target.value as any })}>
            <option>Adulto</option><option>Criança</option><option>Adolescente</option>
          </select>
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.instrumento} onChange={(e) => setForm({ ...form, instrumento: e.target.value })}>
            <option value="">Selecione o instrumento</option>
            {INSTRUMENTO_OPTIONS.slice(1).map((i) => <option key={i}>{i}</option>)}
          </select>
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.canal_origem} onChange={(e) => setForm({ ...form, canal_origem: e.target.value as any })}>
            {CANAL_OPTIONS.slice(1).map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
            {STATUS_OPTIONS.slice(1).map((s) => <option key={s}>{s}</option>)}
          </select>
          <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.data_contato} onChange={(e) => setForm({ ...form, data_contato: e.target.value })} />
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
