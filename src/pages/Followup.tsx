import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, PhoneForwarded, AlertTriangle, Calendar, Phone, X, ExternalLink, Check } from 'lucide-react'
import { normalizePhone } from '@/lib/utils'
import type { Contato } from '@/types'

const INSTRUMENTOS = ['Piano', 'Violão', 'Guitarra', 'Bateria', 'Canto', 'Ukulele', 'Baixo', 'Teclado', 'Musicalização Infantil', 'Cavaquinho', 'Contrabaixo', 'Violino', 'Percussão']

export default function Followup() {
  const [contatos, setContatos] = useState<Contato[]>([])
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    loadFollowups()
  }, [])

  async function loadFollowups() {
    const { data } = await supabase
      .from('alunos')
      .select('*')
      .in('status', ['lead', 'qualificado', 'Em Follow-up', 'Primeiro Contato', 'Aguardando Experimental'])
      .order('created_at', { ascending: true })
    if (data) setContatos(data)
  }

  const followupEnviado = contatos.filter((c) => c.followup_enviado).length
  const followupsHoje = contatos.filter((c) => {
    if (!c.followup_enviado) return false
    const hoje = new Date().toISOString().split('T')[0] ?? ''
    const fat = (c as unknown as Record<string, unknown>).followup_enviado_at
    return typeof fat === 'string' && fat.startsWith(hoje)
  }).length

  async function marcarFollowup(id: string, telefone: string) {
    await supabase.from('alunos').update({
      followup_enviado: true,
      followup_enviado_at: new Date().toISOString(),
      followup_count: contatos.find(c => c.id === id)?.followup_enviado ? undefined : 1,
      status: 'Em Follow-up',
    }).eq('id', id)
    const tel = normalizePhone(telefone)
    window.open(`https://wa.me/${tel}`, '_blank')
    loadFollowups()
  }

  async function handleSaveFollowup(form: { nome: string; telefone: string; instrumento: string; origem: string; observacoes: string }) {
    await supabase.from('alunos').insert({
      nome: form.nome,
      telefone: normalizePhone(form.telefone),
      instrumento_interesse: form.instrumento || null,
      origem: form.origem || null,
      observacoes: form.observacoes || null,
      status: 'lead',
    })
    setShowForm(false)
    loadFollowups()
  }

  const statusColor: Record<string, string> = {
    lead: 'bg-blue-100 text-blue-800',
    qualificado: 'bg-yellow-100 text-yellow-800',
    'Em Follow-up': 'bg-purple-100 text-purple-800',
    'Primeiro Contato': 'bg-cyan-100 text-cyan-800',
    'Aguardando Experimental': 'bg-brand-50 text-brand-800',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Follow-up</h1>
          <p className="text-gray-500">Acompanhe os contatos que precisam de retorno</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2.5 rounded-lg hover:bg-brand-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Follow-up
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-2 mb-2">
            <PhoneForwarded className="w-4 h-4 text-blue-600" />
            <span className="text-sm text-gray-500">Aguardando Follow-up</span>
          </div>
          <p className="text-3xl font-bold">{contatos.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span className="text-sm text-gray-500">Follow-up já Enviado</span>
          </div>
          <p className="text-3xl font-bold">{followupEnviado}</p>
          <p className="text-xs text-gray-400 mt-1">Já houve tentativa anterior</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-green-600" />
            <span className="text-sm text-gray-500">Follow-ups Hoje</span>
          </div>
          <p className="text-3xl font-bold">{followupsHoje}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50">
          <h3 className="font-semibold text-gray-900">Contatos para Follow-up</h3>
        </div>
        <table className="w-full">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Contato</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Instrumento</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Data</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Origem</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {contatos.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <p className="text-sm font-medium">{c.nome}</p>
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {c.telefone}
                  </p>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{c.instrumento_interesse || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{c.origem || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${statusColor[c.status ?? ''] ?? 'bg-gray-100 text-gray-800'}`}>
                    {c.status || '—'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => marcarFollowup(c.id, c.telefone)}
                    className="text-xs bg-brand-500 text-white px-3 py-1.5 rounded-lg hover:bg-brand-600 transition-colors flex items-center gap-1"
                  >
                    {c.followup_enviado ? <Check className="w-3 h-3" /> : <ExternalLink className="w-3 h-3" />}
                    Follow-up
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {contatos.length === 0 && (
          <div className="text-center py-10 text-gray-400">
            Nenhum contato para follow-up
          </div>
        )}
      </div>

      {showForm && (
        <NovoFollowupForm onSave={handleSaveFollowup} onClose={() => setShowForm(false)} />
      )}
    </div>
  )
}

function NovoFollowupForm({ onSave, onClose }: {
  onSave: (form: { nome: string; telefone: string; instrumento: string; origem: string; observacoes: string }) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({ nome: '', telefone: '', instrumento: '', origem: '', observacoes: '' })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Novo Follow-up</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Nome <span className="text-red-500">*</span></label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} placeholder="Nome do contato" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Telefone <span className="text-red-500">*</span></label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.telefone} onChange={e => setForm({...form, telefone: e.target.value})} placeholder="5551999999999" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Instrumento</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.instrumento} onChange={e => setForm({...form, instrumento: e.target.value})}>
              <option value="">Selecione...</option>
              {INSTRUMENTOS.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Origem</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.origem} onChange={e => setForm({...form, origem: e.target.value})}>
              <option value="">Selecione...</option>
              <option>WhatsApp</option>
              <option>Instagram</option>
              <option>Indicação</option>
              <option>Google</option>
              <option>Presencial</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Observações</label>
            <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} value={form.observacoes} onChange={e => setForm({...form, observacoes: e.target.value})} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button
            onClick={() => onSave(form)}
            disabled={!form.nome || !form.telefone}
            className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
