import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { FileText, Plus, Search, Filter, GraduationCap, Users, BookOpen } from 'lucide-react'

interface MaterialItem {
  id: string
  titulo: string
  descricao?: string
  tipo: 'material_professor' | 'material_aluno'
  categoria?: string
  instrumento?: string
  url?: string
  arquivo_nome?: string
  created_at?: string
}

const INSTRUMENTOS = ['Piano', 'Violão', 'Guitarra', 'Bateria', 'Canto', 'Ukulele', 'Violino', 'Contrabaixo', 'Geral']

const CATEGORIAS_PROFESSOR = ['Plano de Aula', 'Material Pedagógico', 'Avaliação', 'Método', 'Referência', 'Outro']
const CATEGORIAS_ALUNO = ['Letra', 'Cifra', 'Exercício', 'Partitura', 'Teoria', 'Outro']

export default function MaterialApoio() {
  const { perfil, hasRole } = useAuth()
  const [items, setItems] = useState<MaterialItem[]>([])
  const [busca, setBusca] = useState('')
  const [filtroInstrumento, setFiltroInstrumento] = useState('Todos')
  const [abaAtiva, setAbaAtiva] = useState<'professor' | 'aluno'>(
    hasRole('professor') && !hasRole('admin') ? 'professor' : 'professor'
  )
  const [showForm, setShowForm] = useState(false)

  const isProfessorOnly = hasRole('professor') && !hasRole('admin')
  const isAlunoOnly = hasRole('aluno') && !hasRole('admin', 'professor')

  useEffect(() => {
    loadItems()
  }, [abaAtiva])

  async function loadItems() {
    const tipo = abaAtiva === 'professor' ? 'material_professor' : 'material_aluno'
    const { data } = await supabase
      .from('conteudos')
      .select('*')
      .eq('tipo', tipo)
      .order('created_at', { ascending: false })
    if (data) setItems(data as MaterialItem[])
  }

  const filtered = items.filter((item) => {
    if (busca && !item.titulo.toLowerCase().includes(busca.toLowerCase())) return false
    if (filtroInstrumento !== 'Todos' && item.instrumento !== filtroInstrumento) return false
    return true
  })

  async function handleSave(form: Partial<MaterialItem>) {
    await supabase.from('conteudos').insert({
      ...form,
      tipo: abaAtiva === 'professor' ? 'material_professor' : 'material_aluno',
    })
    setShowForm(false)
    loadItems()
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este material?')) return
    await supabase.from('conteudos').delete().eq('id', id)
    loadItems()
  }

  const categorias = abaAtiva === 'professor' ? CATEGORIAS_PROFESSOR : CATEGORIAS_ALUNO

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Material de Apoio</h1>
          <p className="text-gray-500">
            {abaAtiva === 'professor'
              ? 'Materiais pedagógicos exclusivos para professores'
              : 'Conteúdos para alunos: letras, cifras e exercícios'}
          </p>
        </div>
        {hasRole('admin', 'professor') && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2.5 rounded-lg hover:bg-brand-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Novo Material
          </button>
        )}
      </div>

      {/* Tabs */}
      {!isAlunoOnly && (
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          <button
            onClick={() => setAbaAtiva('professor')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              abaAtiva === 'professor'
                ? 'bg-white text-brand-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            Professores
          </button>
          <button
            onClick={() => setAbaAtiva('aluno')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              abaAtiva === 'aluno'
                ? 'bg-white text-brand-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Users className="w-4 h-4" />
            Alunos
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar material..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm"
          />
        </div>
        <select value={filtroInstrumento} onChange={(e) => setFiltroInstrumento(e.target.value)} className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm">
          <option>Todos</option>
          {INSTRUMENTOS.map(i => <option key={i}>{i}</option>)}
        </select>
      </div>

      <p className="text-sm text-gray-500 flex items-center gap-1">
        <Filter className="w-3.5 h-3.5" />
        {filtered.length} material(is)
      </p>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((item) => (
          <div key={item.id} className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  abaAtiva === 'professor' ? 'bg-purple-100 text-purple-600' : 'bg-green-100 text-green-600'
                }`}>
                  {abaAtiva === 'professor' ? <GraduationCap className="w-5 h-5" /> : <BookOpen className="w-5 h-5" />}
                </div>
                <div>
                  <h4 className="font-medium text-gray-900 text-sm">{item.titulo}</h4>
                  {item.categoria && <p className="text-xs text-gray-500">{item.categoria}</p>}
                </div>
              </div>
              {hasRole('admin', 'professor') && (
                <button onClick={() => handleDelete(item.id)} className="text-xs text-red-400 hover:text-red-600">✕</button>
              )}
            </div>
            {item.descricao && (
              <p className="text-xs text-gray-600 mb-3 line-clamp-2">{item.descricao}</p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              {item.instrumento && (
                <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">{item.instrumento}</span>
              )}
            </div>
            {item.url && (
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-3 block text-xs text-brand-500 hover:underline">
                Abrir material →
              </a>
            )}
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>Nenhum material de apoio ainda</p>
          <p className="text-sm mt-1">
            {abaAtiva === 'professor'
              ? 'Adicione planos de aula, métodos e referências'
              : 'Adicione letras, cifras e exercícios para alunos'}
          </p>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <MaterialForm categorias={categorias} onSave={handleSave} onClose={() => setShowForm(false)} />
      )}
    </div>
  )
}

function MaterialForm({ categorias, onSave, onClose }: {
  categorias: string[]
  onSave: (data: Partial<MaterialItem>) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    titulo: '',
    descricao: '',
    categoria: '',
    instrumento: '',
    url: '',
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">Novo Material</h2>
        <div className="space-y-3">
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Título" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
          <textarea className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Descrição" rows={2} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
            <option value="">Categoria</option>
            {categorias.map(c => <option key={c}>{c}</option>)}
          </select>
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.instrumento} onChange={(e) => setForm({ ...form, instrumento: e.target.value })}>
            <option value="">Instrumento (opcional)</option>
            {INSTRUMENTOS.map(i => <option key={i}>{i}</option>)}
          </select>
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="URL do material" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button onClick={() => onSave(form)} className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600">Salvar</button>
        </div>
      </div>
    </div>
  )
}
