import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Plus, CalendarPlus2, Check, X, Clock, AlertCircle, RefreshCw } from 'lucide-react'

const INSTRUMENTOS = ['Piano', 'Violão', 'Guitarra', 'Bateria', 'Canto', 'Ukulele', 'Teclado', 'Cavaquinho', 'Contrabaixo', 'Violino', 'Percussão']
const MOTIVOS = [
  { value: 'reposicao', label: 'Reposição' },
  { value: 'antecipacao', label: 'Antecipação' },
  { value: 'evento', label: 'Evento' },
  { value: 'outro', label: 'Outro' },
]

interface Professor { id: string; nome: string }
interface HorarioExtra {
  id: string
  professor_id: string
  data_proposta: string
  hora_inicio: string
  hora_fim: string
  aluno_id: string | null
  aluno_nome: string | null
  motivo: string
  status: 'pendente' | 'aprovado' | 'recusado'
  observacoes: string | null
  motivo_recusa: string | null
  created_at: string
  aprovado_em: string | null
  professor?: Professor
}

const statusBadge: Record<string, string> = {
  pendente: 'bg-amber-100 text-amber-800 border-amber-200',
  aprovado: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  recusado: 'bg-red-100 text-red-800 border-red-200',
}

export default function HorariosExtras() {
  const { perfil, hasRole } = useAuth()
  const [items, setItems] = useState<HorarioExtra[]>([])
  const [professores, setProfessores] = useState<Professor[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'pendente' | 'aprovado' | 'recusado'>('pendente')
  const [recusaModal, setRecusaModal] = useState<HorarioExtra | null>(null)
  const [motivoRecusa, setMotivoRecusa] = useState('')

  const isAdminOuRecepcao = hasRole('admin', 'recepcao')
  const isProfessor = perfil?.role === 'professor'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('horarios_extras')
      .select('*, professor:professores(id,nome)')
      .order('data_proposta', { ascending: false })
      .order('hora_inicio', { ascending: true })
    if (data) setItems(data as HorarioExtra[])
    const { data: profs } = await supabase.from('professores').select('id,nome').eq('ativo', true).order('nome')
    if (profs) setProfessores(profs)
    setLoading(false)
  }

  async function aprovar(id: string) {
    const { error } = await supabase
      .from('horarios_extras')
      .update({ status: 'aprovado', aprovado_em: new Date().toISOString(), aprovado_por: perfil?.user_id || null, motivo_recusa: null })
      .eq('id', id)
    if (error) { alert('Erro: ' + error.message); return }
    load()
  }

  async function recusar() {
    if (!recusaModal) return
    if (!motivoRecusa.trim()) { alert('Informe o motivo da recusa.'); return }
    const { error } = await supabase
      .from('horarios_extras')
      .update({ status: 'recusado', aprovado_em: new Date().toISOString(), aprovado_por: perfil?.user_id || null, motivo_recusa: motivoRecusa.trim() })
      .eq('id', recusaModal.id)
    if (error) { alert('Erro: ' + error.message); return }
    setRecusaModal(null); setMotivoRecusa(''); load()
  }

  const filtrados = useMemo(() => {
    let arr = items
    if (filtroStatus !== 'todos') arr = arr.filter(i => i.status === filtroStatus)
    return arr
  }, [items, filtroStatus])

  const kpis = useMemo(() => ({
    pendentes: items.filter(i => i.status === 'pendente').length,
    aprovados: items.filter(i => i.status === 'aprovado').length,
    recusados: items.filter(i => i.status === 'recusado').length,
  }), [items])

  if (loading) {
    return <div className="flex items-center justify-center py-20"><RefreshCw className="w-6 h-6 animate-spin text-brand-500" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end flex-wrap gap-3">
        <div className="flex gap-2">
          <button onClick={load} className="p-2 text-gray-500 hover:text-gray-700" title="Atualizar"><RefreshCw className="w-4 h-4" /></button>
          {(isProfessor || isAdminOuRecepcao) && (
            <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2 rounded-lg hover:bg-brand-600">
              <Plus className="w-4 h-4" /> Sugerir horário
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <KPI icon={<Clock className="w-4 h-4 text-amber-600" />} label="Pendentes" value={kpis.pendentes} onClick={() => setFiltroStatus('pendente')} active={filtroStatus === 'pendente'} />
        <KPI icon={<Check className="w-4 h-4 text-emerald-600" />} label="Aprovados" value={kpis.aprovados} onClick={() => setFiltroStatus('aprovado')} active={filtroStatus === 'aprovado'} />
        <KPI icon={<X className="w-4 h-4 text-red-600" />} label="Recusados" value={kpis.recusados} onClick={() => setFiltroStatus('recusado')} active={filtroStatus === 'recusado'} />
      </div>

      {/* Filtro */}
      <div className="flex gap-2">
        {(['todos', 'pendente', 'aprovado', 'recusado'] as const).map(s => (
          <button key={s} onClick={() => setFiltroStatus(s)} className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${filtroStatus === s ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>
            {s === 'todos' ? 'Todos' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr className="text-left text-xs font-medium text-gray-500 uppercase">
              <th className="px-4 py-3">Professor</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Horário</th>
              <th className="px-4 py-3">Motivo</th>
              <th className="px-4 py-3">Aluno</th>
              <th className="px-4 py-3">Status</th>
              {isAdminOuRecepcao && <th className="px-4 py-3 text-right">Ações</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtrados.map(it => (
              <tr key={it.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{it.professor?.nome || '—'}</td>
                <td className="px-4 py-3">{new Date(it.data_proposta + 'T00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</td>
                <td className="px-4 py-3 font-mono">{it.hora_inicio?.slice(0, 5)} – {it.hora_fim?.slice(0, 5)}</td>
                <td className="px-4 py-3 capitalize">{it.motivo}</td>
                <td className="px-4 py-3">{it.aluno_nome || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${statusBadge[it.status]}`}>{it.status}</span>
                  {it.status === 'recusado' && it.motivo_recusa && (
                    <p className="text-xs text-red-600 mt-1" title={it.motivo_recusa}>“{it.motivo_recusa.slice(0, 40)}{it.motivo_recusa.length > 40 ? '…' : ''}”</p>
                  )}
                </td>
                {isAdminOuRecepcao && (
                  <td className="px-4 py-3 text-right">
                    {it.status === 'pendente' ? (
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => aprovar(it.id)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded" title="Aprovar"><Check className="w-4 h-4" /></button>
                        <button onClick={() => { setRecusaModal(it); setMotivoRecusa('') }} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Recusar"><X className="w-4 h-4" /></button>
                      </div>
                    ) : <span className="text-xs text-gray-400">{it.aprovado_em ? new Date(it.aprovado_em).toLocaleDateString('pt-BR') : ''}</span>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {filtrados.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            Nenhum horário extra {filtroStatus !== 'todos' ? filtroStatus : ''}.
          </div>
        )}
      </div>

      {showForm && (
        <NovoForm
          professores={professores}
          professorIdDefault={perfil?.professor_id || ''}
          isProfessor={isProfessor}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load() }}
        />
      )}

      {recusaModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setRecusaModal(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2">Recusar horário</h2>
            <p className="text-sm text-gray-600 mb-4">{recusaModal.professor?.nome} — {new Date(recusaModal.data_proposta + 'T00:00').toLocaleDateString('pt-BR')} {recusaModal.hora_inicio?.slice(0, 5)}</p>
            <label className="block text-xs text-gray-500 mb-1">Motivo da recusa</label>
            <textarea value={motivoRecusa} onChange={e => setMotivoRecusa(e.target.value)} rows={3} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Ex: conflito com outra aula, sala ocupada..." />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setRecusaModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button onClick={recusar} className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600">Recusar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function KPI({ icon, label, value, onClick, active }: { icon: React.ReactNode; label: string; value: number; onClick: () => void; active: boolean }) {
  return (
    <button onClick={onClick} className={`bg-white rounded-xl border p-4 text-left transition-all ${active ? 'border-brand-400 ring-2 ring-brand-100' : 'border-gray-200 hover:border-brand-300'}`}>
      <div className="flex items-center gap-2 mb-1">{icon}<span className="text-sm text-gray-600">{label}</span></div>
      <p className="text-2xl font-bold">{value}</p>
    </button>
  )
}

function NovoForm({ professores, professorIdDefault, isProfessor, onClose, onSaved }: {
  professores: Professor[]
  professorIdDefault: string
  isProfessor: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    professor_id: professorIdDefault,
    data_proposta: '',
    hora_inicio: '',
    hora_fim: '',
    instrumento: '',
    motivo: 'reposicao',
    aluno_nome: '',
    observacoes: '',
  })
  const [saving, setSaving] = useState(false)

  async function salvar() {
    if (!form.professor_id || !form.data_proposta || !form.hora_inicio || !form.hora_fim) {
      alert('Preencha professor, data e horários.'); return
    }
    if (form.hora_fim <= form.hora_inicio) { alert('Hora fim deve ser maior que hora início.'); return }
    setSaving(true)
    const { error } = await supabase.from('horarios_extras').insert({
      professor_id: form.professor_id,
      data_proposta: form.data_proposta,
      hora_inicio: form.hora_inicio,
      hora_fim: form.hora_fim,
      motivo: form.motivo,
      aluno_nome: form.aluno_nome || null,
      observacoes: form.observacoes || null,
      status: 'pendente',
    })
    setSaving(false)
    if (error) { alert('Erro: ' + error.message); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">Sugerir horário extra</h2>
        <div className="space-y-3">
          {!isProfessor && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Professor *</label>
              <select value={form.professor_id} onChange={e => setForm({ ...form, professor_id: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">Selecione...</option>
                {professores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Data *</label>
              <input type="date" value={form.data_proposta} onChange={e => setForm({ ...form, data_proposta: e.target.value })} className="w-full border rounded-lg px-2 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Início *</label>
              <input type="time" value={form.hora_inicio} onChange={e => setForm({ ...form, hora_inicio: e.target.value })} className="w-full border rounded-lg px-2 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Fim *</label>
              <input type="time" value={form.hora_fim} onChange={e => setForm({ ...form, hora_fim: e.target.value })} className="w-full border rounded-lg px-2 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Motivo</label>
              <select value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                {MOTIVOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Instrumento</label>
              <select value={form.instrumento} onChange={e => setForm({ ...form, instrumento: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">—</option>
                {INSTRUMENTOS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Aluno (opcional)</label>
            <input value={form.aluno_nome} onChange={e => setForm({ ...form, aluno_nome: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Nome do aluno" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Observações</label>
            <textarea value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Ex: aula de reposição da falta de quinta..." />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button onClick={salvar} disabled={saving} className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50">
            {saving ? 'Salvando...' : 'Enviar para aprovação'}
          </button>
        </div>
      </div>
    </div>
  )
}
