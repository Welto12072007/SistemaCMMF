import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Plus, Search, Filter, Phone, Mail, ChevronDown, ChevronUp,
  Users, Music,
} from 'lucide-react'

interface Aluno {
  id: string
  nome: string
  telefone: string
  email?: string
  instrumento_interesse?: string
  status: string
  data_nascimento?: string
  sexo?: string
  cpf?: string
  pais?: string
  cep?: string
  endereco_rua?: string
  endereco_numero?: string
  endereco_complemento?: string
  bairro?: string
  cidade?: string
  estado?: string
  ddi?: string
  ddd?: string
  rede_social_tipo?: string
  rede_social_link?: string
  nome_responsavel?: string
  telefone_responsavel?: string
  email_responsavel?: string
  cpf_responsavel?: string
  grau_parentesco?: string
  responsavel_financeiro?: string
  tags?: string[]
  historico?: string
  observacoes?: string
  experiencia_musical?: string
  modalidade_preferida?: string
  origem?: string
  created_at?: string
}

const INSTRUMENTOS = ['Piano', 'Violão', 'Guitarra', 'Bateria', 'Canto', 'Ukulele', 'Baixo', 'Teclado', 'Musicalização Infantil', 'Cavaquinho', 'Contrabaixo', 'Violino', 'Percussão']
const SEXO_OPTIONS = ['Masculino', 'Feminino', 'Outro', 'Prefiro não informar']
const ESTADOS_BR = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']
const MODALIDADES = ['Individual Mensal', 'Individual Semestral', 'Grupo', 'Avulsa']

export default function Usuarios() {
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [busca, setBusca] = useState('')
  const [filtroInstrumento, setFiltroInstrumento] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState<Aluno | null>(null)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  useEffect(() => { loadAlunos() }, [])

  async function loadAlunos() {
    const { data } = await supabase
      .from('alunos')
      .select('*')
      .eq('status', 'ativo')
      .order('nome', { ascending: true })
    if (data) setAlunos(data)
  }

  const filtered = alunos.filter((a) => {
    if (busca) {
      const term = busca.toLowerCase()
      if (!a.nome?.toLowerCase().includes(term) && !a.telefone?.includes(term) && !a.email?.toLowerCase().includes(term) && !a.cpf?.includes(term)) return false
    }
    if (filtroInstrumento && a.instrumento_interesse !== filtroInstrumento) return false
    return true
  })

  const porInstrumento: Record<string, number> = {}
  alunos.forEach(a => {
    const inst = a.instrumento_interesse || 'Não definido'
    porInstrumento[inst] = (porInstrumento[inst] || 0) + 1
  })

  async function handleSave(data: Partial<Aluno>) {
    if (editando) {
      await supabase.from('alunos').update({ ...data, updated_at: new Date().toISOString() }).eq('id', editando.id)
    } else {
      await supabase.from('alunos').insert({ ...data, status: 'ativo' })
    }
    setShowForm(false)
    setEditando(null)
    loadAlunos()
  }

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja remover este aluno?')) return
    await supabase.from('alunos').update({ status: 'perdido' }).eq('id', id)
    loadAlunos()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuários</h1>
          <p className="text-gray-500">Alunos ativos matriculados no centro de música</p>
        </div>
        <button
          onClick={() => { setEditando(null); setShowForm(true) }}
          className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2.5 rounded-lg hover:bg-brand-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Aluno
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-brand-600" />
            <span className="text-sm text-gray-500">Total de Alunos</span>
          </div>
          <p className="text-2xl font-bold">{alunos.length}</p>
        </div>
        {Object.entries(porInstrumento).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([inst, count]) => (
          <div key={inst} className="bg-white rounded-xl shadow-sm border p-5">
            <div className="flex items-center gap-2 mb-2">
              <Music className="w-4 h-4 text-cyan-600" />
              <span className="text-sm text-gray-500">{inst}</span>
            </div>
            <p className="text-2xl font-bold">{count}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome, telefone, email ou CPF..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm"
          />
        </div>
        <select value={filtroInstrumento} onChange={(e) => setFiltroInstrumento(e.target.value)} className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm">
          <option value="">Todos os instrumentos</option>
          {INSTRUMENTOS.map(i => <option key={i}>{i}</option>)}
        </select>
      </div>

      <p className="text-sm text-gray-500 flex items-center gap-1">
        <Filter className="w-3.5 h-3.5" />
        {filtered.length} aluno(s) encontrado(s)
      </p>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="w-8 px-2"></th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Nome</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Contato</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Instrumento</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Modalidade</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Desde</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((a) => (
              <AlunoRow
                key={a.id}
                aluno={a}
                expanded={expandedRow === a.id}
                onToggle={() => setExpandedRow(expandedRow === a.id ? null : a.id)}
                onEdit={() => { setEditando(a); setShowForm(true) }}
                onDelete={() => handleDelete(a.id)}
              />
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-10 text-gray-400">Nenhum aluno encontrado</div>
        )}
      </div>

      {showForm && (
        <AlunoForm aluno={editando} onSave={handleSave} onClose={() => { setShowForm(false); setEditando(null) }} />
      )}
    </div>
  )
}

function AlunoRow({ aluno: a, expanded, onToggle, onEdit, onDelete }: {
  aluno: Aluno; expanded: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void
}) {
  return (
    <>
      <tr className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={onToggle}>
        <td className="px-2 text-center">
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </td>
        <td className="px-4 py-3">
          <p className="text-sm font-medium text-gray-900">{a.nome}</p>
          {a.nome_responsavel && <p className="text-xs text-gray-500">Resp: {a.nome_responsavel}</p>}
        </td>
        <td className="px-4 py-3">
          <p className="text-sm text-gray-700 flex items-center gap-1"><Phone className="w-3 h-3" /> {a.telefone}</p>
          {a.email && <p className="text-xs text-gray-500 flex items-center gap-1"><Mail className="w-3 h-3" /> {a.email}</p>}
        </td>
        <td className="px-4 py-3 text-sm text-gray-700">{a.instrumento_interesse || '—'}</td>
        <td className="px-4 py-3 text-sm text-gray-700">{a.modalidade_preferida || '—'}</td>
        <td className="px-4 py-3 text-sm text-gray-700">
          {a.created_at ? new Date(a.created_at).toLocaleDateString('pt-BR') : '—'}
        </td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-2">
            <button onClick={onEdit} className="text-xs text-blue-600 hover:underline">Editar</button>
            <button onClick={onDelete} className="text-xs text-red-600 hover:underline">Remover</button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50">
          <td colSpan={7} className="px-6 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <Detail label="Data de Nascimento" value={a.data_nascimento ? new Date(a.data_nascimento + 'T12:00:00').toLocaleDateString('pt-BR') : undefined} />
              <Detail label="Sexo" value={a.sexo} />
              <Detail label="CPF" value={a.cpf} />
              <Detail label="Endereço" value={[a.endereco_rua, a.endereco_numero].filter(Boolean).join(', ')} />
              <Detail label="Bairro" value={a.bairro} />
              <Detail label="Cidade/UF" value={[a.cidade, a.estado].filter(Boolean).join(' - ')} />
              <Detail label="CEP" value={a.cep} />
              <Detail label="Experiência" value={a.experiencia_musical} />
              <Detail label="Origem" value={a.origem} />
              <Detail label="Rede Social" value={a.rede_social_link ? `${a.rede_social_tipo || ''}: ${a.rede_social_link}` : undefined} />
              <Detail label="Resp. Financeiro" value={a.responsavel_financeiro === 'proprio' ? 'O Próprio' : a.nome_responsavel} />
              {a.nome_responsavel && (
                <>
                  <Detail label="Tel. Responsável" value={a.telefone_responsavel} />
                  <Detail label="CPF Responsável" value={a.cpf_responsavel} />
                  <Detail label="Parentesco" value={a.grau_parentesco} />
                </>
              )}
              {a.tags && a.tags.length > 0 && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-500">Tags</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {a.tags.map(t => <span key={t} className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">{t}</span>)}
                  </div>
                </div>
              )}
              {a.historico && (
                <div className="col-span-4">
                  <p className="text-xs text-gray-500">Histórico</p>
                  <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{a.historico}</p>
                </div>
              )}
              {a.observacoes && (
                <div className="col-span-4">
                  <p className="text-xs text-gray-500">Observações</p>
                  <p className="text-sm text-gray-700 mt-1">{a.observacoes}</p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function Detail({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm text-gray-900">{value}</p>
    </div>
  )
}

function AlunoForm({ aluno, onSave, onClose }: {
  aluno: Aluno | null
  onSave: (data: Partial<Aluno>) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    nome: aluno?.nome ?? '',
    email: aluno?.email ?? '',
    telefone: aluno?.telefone ?? '',
    instrumento_interesse: aluno?.instrumento_interesse ?? '',
    modalidade_preferida: aluno?.modalidade_preferida ?? '',
    experiencia_musical: aluno?.experiencia_musical ?? '',
    data_nascimento: aluno?.data_nascimento ?? '',
    sexo: aluno?.sexo ?? '',
    cpf: aluno?.cpf ?? '',
    pais: aluno?.pais ?? 'Brasil',
    cep: aluno?.cep ?? '',
    endereco_rua: aluno?.endereco_rua ?? '',
    endereco_numero: aluno?.endereco_numero ?? '',
    endereco_complemento: aluno?.endereco_complemento ?? '',
    bairro: aluno?.bairro ?? '',
    cidade: aluno?.cidade ?? '',
    estado: aluno?.estado ?? '',
    ddi: aluno?.ddi ?? '+55',
    ddd: aluno?.ddd ?? '',
    rede_social_tipo: aluno?.rede_social_tipo ?? 'Facebook',
    rede_social_link: aluno?.rede_social_link ?? '',
    nome_responsavel: aluno?.nome_responsavel ?? '',
    telefone_responsavel: aluno?.telefone_responsavel ?? '',
    email_responsavel: aluno?.email_responsavel ?? '',
    cpf_responsavel: aluno?.cpf_responsavel ?? '',
    grau_parentesco: aluno?.grau_parentesco ?? '',
    responsavel_financeiro: aluno?.responsavel_financeiro ?? 'proprio',
    tags: (aluno?.tags ?? []).join(', '),
    historico: aluno?.historico ?? '',
    observacoes: aluno?.observacoes ?? '',
    origem: aluno?.origem ?? 'Presencial',
  })

  const [showFull, setShowFull] = useState(false)

  // Auto-detect minor and switch responsável
  const isMinor = form.data_nascimento ? (() => {
    const nascimento = new Date(form.data_nascimento + 'T12:00:00')
    const hoje = new Date()
    return (hoje.getFullYear() - nascimento.getFullYear() - (hoje < new Date(hoje.getFullYear(), nascimento.getMonth(), nascimento.getDate()) ? 1 : 0)) < 18
  })() : false

  useEffect(() => {
    if (isMinor && form.responsavel_financeiro === 'proprio') {
      setForm(f => ({ ...f, responsavel_financeiro: 'pai_mae' }))
    }
  }, [isMinor])

  function handleSubmit() {
    const payload: Record<string, unknown> = { ...form }
    payload.tags = form.tags ? form.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : []
    onSave(payload as Partial<Aluno>)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">{aluno ? 'Editar Aluno' : 'Novo Aluno'}</h2>

        <h3 className="text-sm font-semibold text-gray-700 mb-2">Dados Principais:</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <FormInput label="Nome" value={form.nome} onChange={(v) => setForm({ ...form, nome: v })} required />
          <FormInput label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          <FormSelect label="Instrumento" value={form.instrumento_interesse} onChange={(v) => setForm({ ...form, instrumento_interesse: v })} options={INSTRUMENTOS} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <FormInput label="Telefone" value={form.telefone} onChange={(v) => setForm({ ...form, telefone: v })} placeholder="5551999999999" required />
          <FormSelect label="Modalidade" value={form.modalidade_preferida} onChange={(v) => setForm({ ...form, modalidade_preferida: v })} options={MODALIDADES} />
          <FormSelect label="Origem" value={form.origem} onChange={(v) => setForm({ ...form, origem: v })} options={['WhatsApp', 'Instagram', 'Indicação', 'Google', 'Presencial']} />
        </div>

        <button onClick={() => setShowFull(!showFull)} className="text-sm text-brand-600 hover:text-brand-700 font-medium mb-4 flex items-center gap-1">
          {showFull ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {showFull ? 'Ocultar Cadastro Completo' : '+ Mostrar Cadastro Completo'}
        </button>

        {showFull && (
          <>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Dados Adicionais:</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <FormInput label="Data de Nascimento" type="date" value={form.data_nascimento} onChange={(v) => setForm({ ...form, data_nascimento: v })} />
              <FormSelect label="Sexo" value={form.sexo} onChange={(v) => setForm({ ...form, sexo: v })} options={SEXO_OPTIONS} />
              <FormInput label="CPF" value={form.cpf} onChange={(v) => setForm({ ...form, cpf: v })} placeholder="000.000.000-00" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <FormInput label="CEP" value={form.cep} onChange={(v) => setForm({ ...form, cep: v })} />
              <div className="col-span-2"><FormInput label="Endereço" value={form.endereco_rua} onChange={(v) => setForm({ ...form, endereco_rua: v })} /></div>
              <FormInput label="Número" value={form.endereco_numero} onChange={(v) => setForm({ ...form, endereco_numero: v })} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <FormInput label="Complemento" value={form.endereco_complemento} onChange={(v) => setForm({ ...form, endereco_complemento: v })} />
              <FormInput label="Bairro" value={form.bairro} onChange={(v) => setForm({ ...form, bairro: v })} />
              <FormInput label="Cidade" value={form.cidade} onChange={(v) => setForm({ ...form, cidade: v })} />
              <FormSelect label="Estado" value={form.estado} onChange={(v) => setForm({ ...form, estado: v })} options={ESTADOS_BR} />
            </div>

            <h3 className="text-sm font-semibold text-gray-700 mb-2">Rede Social:</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <FormSelect label="Tipo" value={form.rede_social_tipo} onChange={(v) => setForm({ ...form, rede_social_tipo: v })} options={['Facebook', 'Instagram', 'TikTok', 'YouTube', 'Outro']} />
              <div className="col-span-2"><FormInput label="Link" value={form.rede_social_link} onChange={(v) => setForm({ ...form, rede_social_link: v })} placeholder="https://..." /></div>
            </div>

            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Responsável Financeiro:
              {form.data_nascimento && (() => {
                const nascimento = new Date(form.data_nascimento + 'T12:00:00')
                const hoje = new Date()
                const idade = hoje.getFullYear() - nascimento.getFullYear() - (hoje < new Date(hoje.getFullYear(), nascimento.getMonth(), nascimento.getDate()) ? 1 : 0)
                return idade < 18 ? <span className="ml-2 text-xs text-amber-600 font-normal">(Aluno menor de idade — preencher responsável)</span> : null
              })()}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <FormSelect label="Quem é?" value={form.responsavel_financeiro} onChange={(v) => setForm({ ...form, responsavel_financeiro: v })} options={['proprio', 'pai_mae', 'outro']} />
              {form.responsavel_financeiro !== 'proprio' && (
                <>
                  <FormInput label="Nome do Responsável" value={form.nome_responsavel} onChange={(v) => setForm({ ...form, nome_responsavel: v })} required />
                  <FormInput label="Telefone Responsável" value={form.telefone_responsavel} onChange={(v) => setForm({ ...form, telefone_responsavel: v })} />
                  <FormInput label="Email Responsável" value={form.email_responsavel} onChange={(v) => setForm({ ...form, email_responsavel: v })} />
                  <FormInput label="CPF Responsável" value={form.cpf_responsavel} onChange={(v) => setForm({ ...form, cpf_responsavel: v })} />
                  <FormInput label="Grau de Parentesco" value={form.grau_parentesco} onChange={(v) => setForm({ ...form, grau_parentesco: v })} placeholder="Ex. Pai, Mãe, Tio" />
                </>
              )}
            </div>

            <h3 className="text-sm font-semibold text-gray-700 mb-2">Tags e Histórico:</h3>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Tags de Identificação (separe por vírgula)</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="iniciante, adulto, piano" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Histórico</label>
                <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} value={form.historico} onChange={(e) => setForm({ ...form, historico: e.target.value })} placeholder="Insira aqui informações importantes..." />
              </div>
            </div>
          </>
        )}

        <div className="mb-4">
          <label className="text-xs text-gray-500 block mb-1">Observações</label>
          <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Fechar</button>
          <button onClick={handleSubmit} className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600">Salvar</button>
        </div>
      </div>
    </div>
  )
}

function FormInput({ label, value, onChange, type = 'text', placeholder, required }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; required?: boolean
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">{label}{required && <span className="text-red-500">*</span>}</label>
      <input type={type} className="w-full border rounded-lg px-3 py-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

function FormSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      <select className="w-full border rounded-lg px-3 py-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecione...</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}
