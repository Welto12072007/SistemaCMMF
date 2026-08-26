import { useEffect, useState } from 'react'
import { supabase, supabaseAdmin } from '@/lib/supabase'
import { Plus, Pencil, Trash2, Users, Music, MapPin, CreditCard, Shield, Mail, Target, Copy, CheckCircle2, Link } from 'lucide-react'
import { maskPhone, normalizePhone, formatPhoneDisplay, maskPixKey, normalizePixKey } from '@/lib/utils'
import { getLabelGrupoBase } from '@/lib/crmSegmentos'
import type { Professor, Curso, Sala, Plano, Perfil, UserRole } from '@/types'
import type { CRMSegmento, GrupoBaseSegmento } from '@/lib/crmSegmentos'

type Tab = 'acessos' | 'professores' | 'cursos' | 'salas' | 'planos' | 'segmentos'

export default function Configuracoes() {
  const [tab, setTab] = useState<Tab>('acessos')

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'acessos', label: 'Acessos', icon: <Shield className="w-4 h-4" /> },
    { key: 'professores', label: 'Professores', icon: <Users className="w-4 h-4" /> },
    { key: 'cursos', label: 'Cursos', icon: <Music className="w-4 h-4" /> },
    { key: 'salas', label: 'Salas', icon: <MapPin className="w-4 h-4" /> },
    { key: 'planos', label: 'Planos', icon: <CreditCard className="w-4 h-4" /> },
    { key: 'segmentos', label: 'Segmentos CRM', icon: <Target className="w-4 h-4" /> },
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
      {tab === 'segmentos' && <SegmentosTab />}
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
  const [linkConvite, setLinkConvite] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [busca, setBusca] = useState('')
  const [filtroRole, setFiltroRole] = useState<UserRole | 'todos'>('todos')
  const [ultimoAcesso, setUltimoAcesso] = useState<Record<string, string | null>>({})
  const [reenviandoLote, setReenviandoLote] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: p }, { data: profs }] = await Promise.all([
      supabase.from('perfis').select('*').order('nome'),
      supabase.from('professores').select('id, nome').eq('ativo', true).order('nome'),
    ])
    if (p) setPerfis(p)
    if (profs) setProfessores(profs)

    // Busca ultimo_acesso via Admin API (auth.users nao e' consultavel pelo client normal)
    try {
      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 })
      const map: Record<string, string | null> = {}
      for (const u of usersData?.users || []) map[u.id] = u.last_sign_in_at ?? null
      setUltimoAcesso(map)
    } catch {
      // Se falhar, so' nao mostramos o status de acesso — nao trava a tela
    }
  }

  // Staff (nao-aluno) que nunca acessou e o cadastro tem 24h+ — alunos ainda nao tem portal liberado
  function pendentesDe24h(): Perfil[] {
    const agora = Date.now()
    return perfis.filter((p) => {
      if (p.role === 'aluno' || !p.ativo) return false
      if (ultimoAcesso[p.user_id]) return false
      const criadoEm = new Date(p.created_at as any).getTime()
      return agora - criadoEm >= 24 * 60 * 60 * 1000
    })
  }

  async function handleReenviarLote() {
    const pendentes = pendentesDe24h()
    if (pendentes.length === 0) { alert('Ninguém pendente há mais de 24h sem acessar.'); return }
    if (!confirm(`Reenviar email de acesso para ${pendentes.length} pessoa(s) que ainda não entraram no sistema?\n\n${pendentes.map(p => p.nome).join(', ')}`)) return
    setReenviandoLote(true)
    let ok = 0
    for (const p of pendentes) {
      const { error } = await supabase.auth.resetPasswordForEmail(p.email, {
        redirectTo: `${window.location.origin}/definir-senha`,
      })
      if (!error) ok++
    }
    setReenviandoLote(false)
    setSuccessMsg(`Reenviado para ${ok} de ${pendentes.length} pessoa(s).`)
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
      // 1. Cria o usuário com senha temporária (necessário para Auth)
      const tempSenha = crypto.randomUUID()
      const { data: created, error: errCreate } = await supabaseAdmin.auth.admin.createUser({
        email: form.email,
        password: tempSenha,
        email_confirm: true,
        user_metadata: { nome: form.nome, role: form.role },
      })

      if (errCreate || !created.user) {
        setErro(errCreate?.message ?? 'Erro ao criar usuário')
        setLoading(false)
        return
      }

      // 2. Cria perfil
      await supabase.from('perfis').insert({
        user_id: created.user.id,
        nome: form.nome,
        email: form.email,
        role: form.role,
        professor_id: form.role === 'professor' ? form.professor_id || null : null,
        telefone: telNorm,
        ativo: true,
      })

      // 3. Envia email com link para definir senha
      const { error: errReset } = await supabase.auth.resetPasswordForEmail(form.email, {
        redirectTo: `${window.location.origin}/definir-senha`,
      })

      // 4. Gera link manual como backup (caso email não chegue)
      const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: form.email,
        options: { redirectTo: `${window.location.origin}/definir-senha` },
      })

      setShowForm(false)
      setEditando(null)
      setLoading(false)
      load()

      if (linkData) {
        setLinkConvite((linkData.properties as any).action_link ?? null)
      }
      setSuccessMsg(errReset
        ? `Acesso criado! O email não pôde ser enviado — use o link abaixo.`
        : `Acesso criado! Email enviado para ${form.email} com link para definir senha.`
      )
      return
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
    setSuccessMsg('')
    // Envia email de redefinição de senha
    const { error } = await supabase.auth.resetPasswordForEmail(perfil.email, {
      redirectTo: `${window.location.origin}/definir-senha`,
    })
    // Gera link manual também (caso queira mandar por WhatsApp em vez de email)
    const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: perfil.email,
      options: { redirectTo: `${window.location.origin}/definir-senha` },
    })
    if (linkData) {
      setLinkConvite((linkData.properties as any).action_link ?? null)
    }
    if (error) {
      setErro('Erro ao enviar email: ' + error.message)
    } else {
      setSuccessMsg(`Email enviado para ${perfil.email} com link para definir/redefinir senha. Você também pode copiar o link abaixo e mandar direto por WhatsApp.`)
    }
  }

  function copiarLink() {
    if (!linkConvite) return
    navigator.clipboard.writeText(linkConvite).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    })
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
        <h3 className="font-semibold text-gray-900">Usuários do Sistema</h3>
        <div className="flex items-center gap-2">
          {pendentesDe24h().length > 0 && (
            <button
              onClick={handleReenviarLote}
              disabled={reenviandoLote}
              className="flex items-center gap-2 border border-amber-300 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-lg text-sm hover:bg-amber-100 disabled:opacity-50"
              title="Pessoas que nunca acessaram e o cadastro já tem mais de 24h"
            >
              <Mail className="w-4 h-4" /> {reenviandoLote ? 'Reenviando...' : `Reenviar p/ ${pendentesDe24h().length} pendente(s)`}
            </button>
          )}
          <button
            onClick={() => { setEditando(null); setShowForm(true); setErro('') }}
            className="flex items-center gap-2 bg-brand-500 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-brand-600"
          >
            <Plus className="w-4 h-4" /> Novo Acesso
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-500 px-5 pt-3">Cadastre quem pode acessar o sistema. A pessoa receberá um email para criar a senha.</p>

      <div className="flex flex-wrap gap-2 px-5 pt-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou email..."
          className="flex-1 min-w-[200px] border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        />
        <select
          value={filtroRole}
          onChange={(e) => setFiltroRole(e.target.value as UserRole | 'todos')}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="todos">Todos os perfis</option>
          <option value="admin">Admin</option>
          <option value="recepcao">Recepção</option>
          <option value="professor">Professor</option>
          <option value="aluno">Aluno</option>
        </select>
      </div>

      {erro && <div className="mx-5 mt-3 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">{erro}</div>}
      {successMsg && <div className="mx-5 mt-3 bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg">{successMsg}</div>}

      {linkConvite && (
        <div className="mx-5 mt-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm font-medium text-blue-800 mb-2">Link de convite (backup caso o email não chegue):</p>
          <div className="flex items-center gap-2">
            <input readOnly value={linkConvite} className="flex-1 text-xs bg-white border rounded px-2 py-1.5 text-gray-600 font-mono" />
            <button onClick={copiarLink} className={`px-3 py-1.5 rounded text-xs font-medium ${copiado ? 'bg-green-500 text-white' : 'bg-blue-500 text-white hover:bg-blue-600'}`}>
              {copiado ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
          <button onClick={() => setLinkConvite(null)} className="text-xs text-blue-600 mt-2 hover:underline">Fechar</button>
        </div>
      )}

      <table className="w-full mt-3">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Nome</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Telefone</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Perfil</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Acesso</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {perfis
            .filter((p) => filtroRole === 'todos' || p.role === filtroRole)
            .filter((p) => !busca.trim() || p.nome.toLowerCase().includes(busca.toLowerCase()) || p.email.toLowerCase().includes(busca.toLowerCase()))
            .map((p) => (
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
                {p.role === 'aluno' ? (
                  <span className="text-xs text-gray-400">portal ainda não liberado</span>
                ) : ultimoAcesso[p.user_id] ? (
                  <span className="text-xs text-gray-500">{new Date(ultimoAcesso[p.user_id]!).toLocaleDateString('pt-BR')}</span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Nunca acessou</span>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  <button onClick={() => handleResendInvite(p)} title="Reiniciar senha (gera link manual)" className="text-gray-400 hover:text-brand-600"><Mail className="w-4 h-4" /></button>
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
    const { error } = await supabase.from('professores').delete().eq('id', id)
    if (error) {
      if (error.code === '23503') {
        alert('Não é possível excluir: este professor tem horários, aulas experimentais ou histórico vinculado a ele.\n\nUse "Editar" e desmarque "Ativo" para desativá-lo sem perder o histórico.')
      } else {
        alert('Erro ao excluir: ' + error.message)
      }
      return
    }
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
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Valor/aula</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {professores.map((p) => {
            const tipo = (p.tipo_professor || 'B') as 'A' | 'B'
            const valor = Number(p.valor_hora_aula) || (tipo === 'A' ? 26.66 : 20.00)
            return (
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
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${tipo === 'A' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                  Tipo {tipo}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-gray-700">R$ {valor.toFixed(2)}</td>
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
          )})}
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
  const defaultBonif = { '2': '20', '3': '25', '4': '30' }
  const initBonif = professor?.bonificacao_grupo
    ? { '2': String(professor.bonificacao_grupo['2'] ?? 20), '3': String(professor.bonificacao_grupo['3'] ?? 25), '4': String(professor.bonificacao_grupo['4'] ?? 30) }
    : defaultBonif

  const [form, setForm] = useState({
    nome: professor?.nome ?? '',
    instrumentos: professor?.instrumentos?.join(', ') ?? '',
    telefone: professor?.telefone ? formatPhoneDisplay(professor.telefone) : '',
    ativo: professor?.ativo ?? true,
    tipo_professor: (professor?.tipo_professor ?? 'B') as 'A' | 'B',
    valor_hora_aula: professor?.valor_hora_aula != null ? String(professor.valor_hora_aula) : '',
    chave_pix: professor?.chave_pix ? maskPixKey(professor.chave_pix, professor.pix_tipo ?? 'cpf') : '',
    pix_tipo: professor?.pix_tipo ?? 'cpf',
    bonif_2: initBonif['2'],
    bonif_3: initBonif['3'],
    bonif_4: initBonif['4'],
  })

  const valorPadrao = form.tipo_professor === 'A' ? 26.66 : 20.00
  const valorEfetivo = form.valor_hora_aula ? Number(form.valor_hora_aula.replace(',', '.')) : valorPadrao

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">{professor ? 'Editar Professor' : 'Novo Professor'}</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome *</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Nome completo" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Instrumentos</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Violão, Piano, Canto (separados por vírgula)" value={form.instrumentos} onChange={(e) => setForm({ ...form, instrumentos: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Telefone</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="(51) 99999-9999" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: maskPhone(e.target.value) })} />
          </div>

          <div className="border-t pt-3 mt-2">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Pagamento</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo do professor *</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.tipo_professor}
                  onChange={(e) => setForm({ ...form, tipo_professor: e.target.value as 'A' | 'B' })}
                >
                  <option value="A">Tipo A (R$ 26,66)</option>
                  <option value="B">Tipo B (R$ 20,00)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Valor por aula (opcional)</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder={`Padrão: R$ ${valorPadrao.toFixed(2)}`}
                  value={form.valor_hora_aula}
                  onChange={(e) => setForm({ ...form, valor_hora_aula: e.target.value })}
                />
                <p className="text-[11px] text-gray-400 mt-1">Em branco = usa valor padrão do tipo</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">Valor que será usado: <strong className="text-gray-700">R$ {valorEfetivo.toFixed(2)}</strong> por aula (individual)</p>

            <div className="mt-3 p-3 bg-blue-50 rounded-lg">
              <h4 className="text-xs font-semibold text-blue-800 mb-2">Bonificação por aula em grupo</h4>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] text-blue-600 mb-0.5">2 alunos (R$)</label>
                  <input
                    className="w-full border border-blue-200 rounded px-2 py-1.5 text-sm"
                    value={form.bonif_2}
                    onChange={(e) => setForm({ ...form, bonif_2: e.target.value })}
                    placeholder="20"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-blue-600 mb-0.5">3 alunos (R$)</label>
                  <input
                    className="w-full border border-blue-200 rounded px-2 py-1.5 text-sm"
                    value={form.bonif_3}
                    onChange={(e) => setForm({ ...form, bonif_3: e.target.value })}
                    placeholder="25"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-blue-600 mb-0.5">4+ alunos (R$)</label>
                  <input
                    className="w-full border border-blue-200 rounded px-2 py-1.5 text-sm"
                    value={form.bonif_4}
                    onChange={(e) => setForm({ ...form, bonif_4: e.target.value })}
                    placeholder="30"
                  />
                </div>
              </div>
              <p className="text-[10px] text-blue-500 mt-1">Valor que o professor recebe por aula conforme o tamanho do grupo</p>
            </div>
          </div>

          <div className="border-t pt-3 mt-2">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Chave PIX (para receber pagamento)</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.pix_tipo}
                  onChange={(e) => {
                    const novoTipo = e.target.value
                    // re-aplica máscara da chave atual no novo tipo
                    const apenas = form.chave_pix.replace(/\D/g, '')
                    const reformatado = (novoTipo === 'cpf' || novoTipo === 'cnpj' || novoTipo === 'telefone')
                      ? maskPixKey(apenas, novoTipo)
                      : form.chave_pix
                    setForm({ ...form, pix_tipo: novoTipo, chave_pix: reformatado })
                  }}
                >
                  <option value="cpf">CPF</option>
                  <option value="cnpj">CNPJ</option>
                  <option value="email">E-mail</option>
                  <option value="telefone">Telefone</option>
                  <option value="aleatoria">Aleatória</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Chave</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder={
                    form.pix_tipo === 'cpf' ? '000.000.000-00'
                    : form.pix_tipo === 'cnpj' ? '00.000.000/0000-00'
                    : form.pix_tipo === 'telefone' ? '(51) 99999-9999'
                    : form.pix_tipo === 'email' ? 'email@exemplo.com'
                    : 'Chave PIX'
                  }
                  value={form.chave_pix}
                  onChange={(e) => setForm({ ...form, chave_pix: maskPixKey(e.target.value, form.pix_tipo) })}
                />
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm pt-2">
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
            tipo_professor: form.tipo_professor,
            valor_hora_aula: form.valor_hora_aula ? Number(form.valor_hora_aula.replace(',', '.')) : null,
            bonificacao_grupo: {
              '2': Number(form.bonif_2.replace(',', '.')) || 20,
              '3': Number(form.bonif_3.replace(',', '.')) || 25,
              '4': Number(form.bonif_4.replace(',', '.')) || 30,
            },
            chave_pix: form.chave_pix ? normalizePixKey(form.chave_pix, form.pix_tipo) : null,
            pix_tipo: form.chave_pix ? form.pix_tipo : null,
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
        <div>
          <h3 className="font-semibold text-gray-900">Salas</h3>
          <p className="text-xs text-gray-500 mt-1">Padrão CMMF: 1 aula por sala em cada horário</p>
        </div>
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
              <td className="px-4 py-3 text-sm">1 aula</td>
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

function SegmentosTab() {
  const [segmentos, setSegmentos] = useState<CRMSegmento[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<CRMSegmento | null>(null)

  useEffect(() => {
    loadSegmentos()
  }, [])

  async function loadSegmentos() {
    const { data } = await supabase
      .from('crm_segmentos')
      .select('*')
      .order('created_at', { ascending: false })

    const parsed: CRMSegmento[] = (data || []).map((s: any) => ({
      id: s.id,
      nome: s.nome,
      descricao: s.descricao || '',
      grupoBase: s.grupo_base,
      instrumento: s.instrumento || '',
      apenasComTelefone: Boolean(s.apenas_com_telefone),
      ativo: Boolean(s.ativo),
      createdAt: s.created_at,
    }))

    setSegmentos(parsed)
  }

  async function handleSave(payload: {
    nome: string
    descricao: string
    grupoBase: GrupoBaseSegmento
    instrumento: string
    apenasComTelefone: boolean
    ativo: boolean
  }) {
    if (editing) {
      await supabase
        .from('crm_segmentos')
        .update({
          nome: payload.nome,
          descricao: payload.descricao || null,
          grupo_base: payload.grupoBase,
          instrumento: payload.instrumento || null,
          apenas_com_telefone: payload.apenasComTelefone,
          ativo: payload.ativo,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editing.id)
    } else {
      await supabase.from('crm_segmentos').insert({
        nome: payload.nome,
        descricao: payload.descricao || null,
        grupo_base: payload.grupoBase,
        instrumento: payload.instrumento || null,
        apenas_com_telefone: payload.apenasComTelefone,
        ativo: payload.ativo,
      })
    }

    await loadSegmentos()
    setShowForm(false)
    setEditing(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este segmento?')) return
    await supabase.from('crm_segmentos').delete().eq('id', id)
    await loadSegmentos()
  }

  async function toggleAtivo(id: string) {
    const item = segmentos.find((s) => s.id === id)
    if (!item) return
    await supabase.from('crm_segmentos').update({ ativo: !item.ativo }).eq('id', id)
    await loadSegmentos()
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
        <div>
          <h3 className="font-semibold text-gray-900">Segmentos CRM</h3>
          <p className="text-xs text-gray-500 mt-1">Crie públicos personalizados para usar em disparos programados</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true) }}
          className="flex items-center gap-2 bg-brand-500 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-brand-600"
        >
          <Plus className="w-4 h-4" /> Novo Segmento
        </button>
      </div>

      <table className="w-full">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Segmento</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Base</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Filtro</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {segmentos.map((s) => (
            <tr key={s.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <p className="text-sm font-medium text-gray-900">{s.nome}</p>
                <p className="text-xs text-gray-500">{s.descricao || 'Sem descrição'}</p>
              </td>
              <td className="px-4 py-3 text-sm text-gray-700">{getLabelGrupoBase(s.grupoBase)}</td>
              <td className="px-4 py-3 text-sm text-gray-700">
                {s.instrumento ? `Instrumento: ${s.instrumento}` : 'Sem filtro de instrumento'}
                {s.apenasComTelefone ? ' | Com telefone válido' : ''}
              </td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-1 rounded-full ${s.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {s.ativo ? 'Ativo' : 'Inativo'}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-2 justify-end">
                  <button onClick={() => { setEditing(s); setShowForm(true) }} className="text-gray-400 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => toggleAtivo(s.id)} className="text-xs px-2 py-1 rounded text-orange-600 hover:bg-orange-50">Alternar</button>
                  <button onClick={() => handleDelete(s.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {segmentos.length === 0 && <div className="text-center py-10 text-gray-400">Nenhum segmento criado</div>}

      {showForm && (
        <SegmentoForm
          segmento={editing}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null) }}
        />
      )}
    </div>
  )
}

function SegmentoForm({
  segmento,
  onSave,
  onClose,
}: {
  segmento: CRMSegmento | null
  onSave: (data: {
    nome: string
    descricao: string
    grupoBase: GrupoBaseSegmento
    instrumento: string
    apenasComTelefone: boolean
    ativo: boolean
  }) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    nome: segmento?.nome ?? '',
    descricao: segmento?.descricao ?? '',
    grupoBase: segmento?.grupoBase ?? 'alunos_ativos' as GrupoBaseSegmento,
    instrumento: segmento?.instrumento ?? '',
    apenasComTelefone: segmento?.apenasComTelefone ?? true,
    ativo: segmento?.ativo ?? true,
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">{segmento ? 'Editar Segmento' : 'Novo Segmento CRM'}</h2>
        <div className="space-y-3">
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="Nome do segmento"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
          />
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="Descrição (opcional)"
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
          />
          <select
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={form.grupoBase}
            onChange={(e) => setForm({ ...form, grupoBase: e.target.value as GrupoBaseSegmento })}
          >
            <option value="todos">Todos os contatos</option>
            <option value="alunos_ativos">Alunos ativos</option>
            <option value="leads">Leads</option>
            <option value="ex_alunos">Ex-alunos</option>
          </select>
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="Instrumento (opcional)"
            value={form.instrumento}
            onChange={(e) => setForm({ ...form, instrumento: e.target.value })}
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.apenasComTelefone}
              onChange={(e) => setForm({ ...form, apenasComTelefone: e.target.checked })}
            />
            Somente contatos com telefone válido
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
            />
            Segmento ativo
          </label>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button
            onClick={() => onSave(form)}
            disabled={!form.nome}
            className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
