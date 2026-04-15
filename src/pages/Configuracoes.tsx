import { useEffect, useState } from 'react'
import { supabase, supabaseAdmin } from '@/lib/supabase'
import { Plus, Pencil, Trash2, Users, Music, MapPin, CreditCard, Shield, Mail } from 'lucide-react'
import { maskPhone, normalizePhone, formatPhoneDisplay } from '@/lib/utils'
import type { Professor, Curso, Sala, Plano, Perfil, UserRole } from '@/types'

type Tab = 'acessos' | 'professores' | 'cursos' | 'salas' | 'planos'

export default function Configuracoes() {
  const [tab, setTab] = useState<Tab>('acessos')

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'acessos', label: 'Acessos', icon: <Shield className="w-4 h-4" /> },
    { key: 'professores', label: 'Professores', icon: <Users className="w-4 h-4" /> },
    { key: 'cursos', label: 'Cursos', icon: <Music className="w-4 h-4" /> },
    { key: 'salas', label: 'Salas', icon: <MapPin className="w-4 h-4" /> },
    { key: 'planos', label: 'Planos', icon: <CreditCard className="w-4 h-4" /> },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
        <p className="text-gray-500">Gerencie cursos, professores, salas e planos da escola</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-colors ${
              tab === t.key ? 'bg-brand-500 text-white' : 'bg-white border text-gray-700 hover:bg-gray-50'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'acessos' && <AcessosTab />}
      {tab === 'professores' && <ProfessoresTab />}
      {tab === 'cursos' && <CursosTab />}
      {tab === 'salas' && <SalasTab />}
      {tab === 'planos' && <PlanosTab />}
    </div>
  )
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  recepcao: 'Recepção',
  professor: 'Professor',
  aluno: 'Aluno',
}

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-purple-100 text-purple-800',
  recepcao: 'bg-blue-100 text-blue-800',
  professor: 'bg-amber-100 text-amber-800',
  aluno: 'bg-green-100 text-green-800',
}

function AcessosTab() {
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [professores, setProfessores] = useState<Professor[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: p }, { data: profs }] = await Promise.all([
      supabase.from('perfis').select('*').order('nome'),
      supabase.from('professores').select('id, nome').eq('ativo', true).order('nome'),
    ])
    if (p) setPerfis(p)
    if (profs) setProfessores(profs)
  }

  async function handleSave(form: { nome: string; email: string; role: UserRole; professor_id: string; telefone: string }) {
    setErro('')
    setLoading(true)
    const telNorm = form.telefone ? normalizePhone(form.telefone) : null

    if (editando) {
      // Update existing perfil
      await supabase.from('perfis').update({
        nome: form.nome,
        role: form.role,
        professor_id: form.role === 'professor' ? form.professor_id || null : null,
        telefone: telNorm,
      }).eq('id', editando.id)
    } else {
      // Create new user via Supabase Admin API
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(form.email, {
        data: { nome: form.nome, role: form.role },
        redirectTo: `${window.location.origin}/definir-senha`,
      })

      if (error) {
        setErro(error.message)
        setLoading(false)
        return
      }

      // Create perfil record
      await supabase.from('perfis').insert({
        user_id: data.user.id,
        nome: form.nome,
        email: form.email,
        role: form.role,
        professor_id: form.role === 'professor' ? form.professor_id || null : null,
        telefone: telNorm,
        ativo: true,
      })
    }

    setShowForm(false)
    setEditando(null)
    setLoading(false)
    load()
  }

  async function handleToggleAtivo(perfil: Perfil) {
    await supabase.from('perfis').update({ ativo: !perfil.ativo }).eq('id', perfil.id)
    load()
  }

  async function handleDelete(perfil: Perfil) {
    if (!confirm(`Excluir acesso de ${perfil.nome}? Isso remove o login da pessoa.`)) return
    await supabaseAdmin.auth.admin.deleteUser(perfil.user_id)
    await supabase.from('perfis').delete().eq('id', perfil.id)
    load()
  }

  async function handleResendInvite(perfil: Perfil) {
    setErro('')
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(perfil.email, {
      redirectTo: `${window.location.origin}/definir-senha`,
    })
    if (error) {
      setErro(error.message)
    } else {
      alert(`Convite reenviado para ${perfil.email}`)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
        <h3 className="font-semibold text-gray-900">Usuários do Sistema</h3>
        <button
          onClick={() => { setEditando(null); setShowForm(true); setErro('') }}
          className="flex items-center gap-2 bg-brand-500 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-brand-600"
        >
          <Plus className="w-4 h-4" /> Novo Acesso
        </button>
      </div>
      <p className="text-sm text-gray-500 px-5 pt-3">Cadastre quem pode acessar o sistema. A pessoa receberá um email para criar a senha.</p>

      {erro && <div className="mx-5 mt-3 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">{erro}</div>}

      <table className="w-full mt-3">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Nome</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Telefone</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Perfil</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {perfis.map((p) => (
            <tr key={p.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-medium">{p.nome}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{p.email}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{formatPhoneDisplay(p.telefone)}</td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-1 rounded-full ${ROLE_COLORS[p.role]}`}>
                  {ROLE_LABELS[p.role]}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-1 rounded-full ${p.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {p.ativo ? 'Ativo' : 'Inativo'}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  <button onClick={() => handleResendInvite(p)} title="Reenviar convite" className="text-gray-400 hover:text-brand-600"><Mail className="w-4 h-4" /></button>
                  <button onClick={() => { setEditando(p); setShowForm(true); setErro('') }} className="text-gray-400 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => handleToggleAtivo(p)} className={`text-xs px-2 py-1 rounded ${p.ativo ? 'text-orange-600 hover:bg-orange-50' : 'text-green-600 hover:bg-green-50'}`}>
                    {p.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                  <button onClick={() => handleDelete(p)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {perfis.length === 0 && <div className="text-center py-10 text-gray-400">Nenhum acesso cadastrado</div>}

      {showForm && (
        <AcessoForm
          perfil={editando}
          professores={professores}
          loading={loading}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditando(null) }}
        />
      )}
    </div>
  )
}

function AcessoForm({ perfil, professores, loading, onSave, onClose }: {
  perfil: Perfil | null
  professores: Professor[]
  loading: boolean
  onSave: (data: { nome: string; email: string; role: UserRole; professor_id: string; telefone: string }) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    nome: perfil?.nome ?? '',
    email: perfil?.email ?? '',
    role: perfil?.role ?? 'aluno' as UserRole,
    professor_id: perfil?.professor_id ?? '',
    telefone: perfil?.telefone ? formatPhoneDisplay(perfil.telefone) : '',
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">{perfil ? 'Editar Acesso' : 'Novo Acesso'}</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Nome completo" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-gray-100"
              placeholder="email@exemplo.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={!!perfil}
            />
            {!perfil && <p className="text-xs text-gray-400 mt-1">A pessoa receberá um email para criar a senha</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Perfil de acesso</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
              <option value="admin">Administrador</option>
              <option value="recepcao">Recepção</option>
              <option value="professor">Professor</option>
              <option value="aluno">Aluno</option>
            </select>
          </div>
          {form.role === 'professor' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vincular ao professor</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.professor_id} onChange={(e) => setForm({ ...form, professor_id: e.target.value })}>
                <option value="">Selecione...</option>
                {professores.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefone <span className="text-red-500">*</span></label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="(51) 99999-9999"
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: maskPhone(e.target.value) })}
            />
            <p className="text-xs text-gray-400 mt-1">Usado pela Antonia para enviar mensagens</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button
            onClick={() => onSave(form)}
            disabled={loading || !form.nome || !form.email || form.telefone.replace(/\D/g, '').length < 11}
            className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50"
          >
            {loading ? 'Salvando...' : perfil ? 'Salvar' : 'Enviar convite'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProfessoresTab() {
  const [professores, setProfessores] = useState<Professor[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState<Professor | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('professores').select('*').order('nome')
    if (data) setProfessores(data)
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir professor?')) return
    await supabase.from('professores').delete().eq('id', id)
    load()
  }

  async function handleSave(form: any) {
    if (editando) {
      await supabase.from('professores').update(form).eq('id', editando.id)
    } else {
      await supabase.from('professores').insert(form)
    }
    setShowForm(false)
    setEditando(null)
    load()
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
        <h3 className="font-semibold text-gray-900">Professores</h3>
        <button
          onClick={() => { setEditando(null); setShowForm(true) }}
          className="flex items-center gap-2 bg-brand-500 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-brand-600"
        >
          <Plus className="w-4 h-4" /> Novo Professor
        </button>
      </div>
      <p className="text-sm text-gray-500 px-5 pt-3">Gerencie o corpo docente e suas disponibilidades</p>
      <table className="w-full mt-3">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Nome</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Instrumentos</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Telefone</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {professores.map((p) => (
            <tr key={p.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-medium">{p.nome}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {p.instrumentos?.map((i) => (
                    <span key={i} className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">{i}</span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">{formatPhoneDisplay(p.telefone)}</td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-1 rounded-full ${p.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {p.ativo ? 'Ativo' : 'Inativo'}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  <button onClick={() => { setEditando(p); setShowForm(true) }} className="text-gray-400 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(p.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {professores.length === 0 && (
        <div className="text-center py-10 text-gray-400">Nenhum professor cadastrado</div>
      )}

      {showForm && (
        <ProfessorForm
          professor={editando}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditando(null) }}
        />
      )}
    </div>
  )
}

function ProfessorForm({ professor, onSave, onClose }: { professor: Professor | null; onSave: (data: any) => void; onClose: () => void }) {
  const [form, setForm] = useState({
    nome: professor?.nome ?? '',
    instrumentos: professor?.instrumentos?.join(', ') ?? '',
    telefone: professor?.telefone ? formatPhoneDisplay(professor.telefone) : '',
    ativo: professor?.ativo ?? true,
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">{professor ? 'Editar Professor' : 'Novo Professor'}</h2>
        <div className="space-y-3">
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Instrumentos (separados por vírgula)" value={form.instrumentos} onChange={(e) => setForm({ ...form, instrumentos: e.target.value })} />
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="(51) 99999-9999" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: maskPhone(e.target.value) })} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} /> Ativo
          </label>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button onClick={() => onSave({
            nome: form.nome,
            instrumentos: form.instrumentos.split(',').map(s => s.trim()).filter(Boolean),
            telefone: form.telefone ? normalizePhone(form.telefone) : null,
            ativo: form.ativo,
          })} className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600" disabled={!form.nome}>Salvar</button>
        </div>
      </div>
    </div>
  )
}

function CursosTab() {
  const [cursos, setCursos] = useState<Curso[]>([])

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('cursos').select('*').order('nome')
    if (data) setCursos(data)
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir curso?')) return
    await supabase.from('cursos').delete().eq('id', id)
    load()
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
        <h3 className="font-semibold text-gray-900">Cursos</h3>
        <button className="flex items-center gap-2 bg-brand-500 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-brand-600">
          <Plus className="w-4 h-4" /> Novo Curso
        </button>
      </div>
      <table className="w-full">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Nome</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Descrição</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {cursos.map((c) => (
            <tr key={c.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-medium">{c.nome}</td>
              <td className="px-4 py-3 text-sm text-gray-500">{c.descricao ?? '—'}</td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-1 rounded-full ${c.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {c.ativo ? 'Ativo' : 'Inativo'}
                </span>
              </td>
              <td className="px-4 py-3">
                <button onClick={() => handleDelete(c.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {cursos.length === 0 && <div className="text-center py-10 text-gray-400">Nenhum curso cadastrado</div>}
    </div>
  )
}

function SalasTab() {
  const [salas, setSalas] = useState<Sala[]>([])

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('salas').select('*').order('nome')
    if (data) setSalas(data)
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir sala?')) return
    await supabase.from('salas').delete().eq('id', id)
    load()
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
        <h3 className="font-semibold text-gray-900">Salas</h3>
        <button className="flex items-center gap-2 bg-brand-500 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-brand-600">
          <Plus className="w-4 h-4" /> Nova Sala
        </button>
      </div>
      <table className="w-full">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Nome</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Instrumentos</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Capacidade</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {salas.map((s) => (
            <tr key={s.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-medium">{s.nome}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {s.instrumentos?.map((i) => (
                    <span key={i} className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">{i}</span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3 text-sm">{s.capacidade}</td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-1 rounded-full ${s.ativa ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {s.ativa ? 'Ativa' : 'Inativa'}
                </span>
              </td>
              <td className="px-4 py-3">
                <button onClick={() => handleDelete(s.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {salas.length === 0 && <div className="text-center py-10 text-gray-400">Nenhuma sala cadastrada</div>}
    </div>
  )
}

function PlanosTab() {
  const [planos, setPlanos] = useState<Plano[]>([])

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('planos').select('*').order('nome')
    if (data) setPlanos(data)
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir plano?')) return
    await supabase.from('planos').delete().eq('id', id)
    load()
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
        <h3 className="font-semibold text-gray-900">Planos</h3>
        <button className="flex items-center gap-2 bg-brand-500 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-brand-600">
          <Plus className="w-4 h-4" /> Novo Plano
        </button>
      </div>
      <table className="w-full">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Nome</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Modalidade</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Período</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Valor Mensal</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {planos.map((p) => (
            <tr key={p.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-medium">{p.nome}</td>
              <td className="px-4 py-3 text-sm">{p.modalidade}</td>
              <td className="px-4 py-3 text-sm">{p.periodo || '—'}</td>
              <td className="px-4 py-3 text-sm font-medium">R$ {p.valor_mensal?.toLocaleString('pt-BR')}</td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-1 rounded-full ${p.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {p.ativo ? 'Ativo' : 'Inativo'}
                </span>
              </td>
              <td className="px-4 py-3">
                <button onClick={() => handleDelete(p.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {planos.length === 0 && <div className="text-center py-10 text-gray-400">Nenhum plano cadastrado</div>}
    </div>
  )
}
