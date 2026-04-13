import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { BookOpen, Search, Plus, Filter, Music, FileText, Headphones, Video } from 'lucide-react'

interface BibliotecaItem {
  id: string
  titulo: string
  descricao?: string
  tipo: string
  categoria?: string
  instrumento?: string
  url?: string
  arquivo_nome?: string
  autor?: string
  created_at?: string
}

const TIPOS = [
  { value: 'partitura', label: 'Partitura', icon: Music },
  { value: 'cifra', label: 'Cifra', icon: FileText },
  { value: 'letra', label: 'Letra', icon: FileText },
  { value: 'apostila', label: 'Apostila', icon: BookOpen },
  { value: 'video', label: 'Vídeo', icon: Video },
  { value: 'audio', label: 'Áudio', icon: Headphones },
  { value: 'outro', label: 'Outro', icon: FileText },
]

const INSTRUMENTOS = ['Piano', 'Violão', 'Guitarra', 'Bateria', 'Canto', 'Ukulele', 'Violino', 'Contrabaixo', 'Cavaquinho', 'Percussão', 'Geral']

const tipoIcon: Record<string, string> = {
  partitura: '🎵',
  cifra: '🎸',
  letra: '📝',
  apostila: '📚',
  video: '🎬',
  audio: '🎧',
  outro: '📄',
}

export default function Biblioteca() {
  const [items, setItems] = useState<BibliotecaItem[]>([])
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('Todos')
  const [filtroInstrumento, setFiltroInstrumento] = useState('Todos')
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    loadItems()
  }, [])

  async function loadItems() {
    const { data } = await supabase
      .from('biblioteca')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setItems(data)
  }

  const filtered = items.filter((item) => {
    if (busca && !item.titulo.toLowerCase().includes(busca.toLowerCase()) && !item.autor?.toLowerCase().includes(busca.toLowerCase())) return false
    if (filtroTipo !== 'Todos' && item.tipo !== filtroTipo) return false
    if (filtroInstrumento !== 'Todos' && item.instrumento !== filtroInstrumento) return false
    return true
  })

  async function handleSave(form: Partial<BibliotecaItem>) {
    await supabase.from('biblioteca').insert(form)
    setShowForm(false)
    loadItems()
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este material?')) return
    await supabase.from('biblioteca').delete().eq('id', id)
    loadItems()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Biblioteca</h1>
          <p className="text-gray-500">Acervo de materiais musicais do centro</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2.5 rounded-lg hover:bg-brand-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Material
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {TIPOS.slice(0, 4).map(t => {
          const count = items.filter(i => i.tipo === t.value).length
          return (
            <div key={t.value} className="bg-white rounded-xl shadow-sm border p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{tipoIcon[t.value]}</span>
                <span className="text-sm text-gray-500">{t.label}s</span>
              </div>
              <p className="text-xl font-bold">{count}</p>
            </div>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por título ou autor..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm"
          />
        </div>
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm">
          <option>Todos</option>
          {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
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
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{tipoIcon[item.tipo] || '📄'}</span>
                <div>
                  <h4 className="font-medium text-gray-900 text-sm">{item.titulo}</h4>
                  {item.autor && <p className="text-xs text-gray-500">{item.autor}</p>}
                </div>
              </div>
              <button
                onClick={() => handleDelete(item.id)}
                className="text-xs text-red-400 hover:text-red-600"
              >
                ✕
              </button>
            </div>
            {item.descricao && (
              <p className="text-xs text-gray-600 mb-3 line-clamp-2">{item.descricao}</p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs px-2 py-1 rounded-full bg-brand-50 text-brand-700">
                {TIPOS.find(t => t.value === item.tipo)?.label || item.tipo}
              </span>
              {item.instrumento && (
                <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                  {item.instrumento}
                </span>
              )}
            </div>
            {item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 block text-xs text-brand-500 hover:underline"
              >
                Abrir material →
              </a>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-400">
            <BookOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Nenhum material na biblioteca ainda</p>
            <p className="text-sm mt-1">Adicione partituras, cifras, apostilas e mais</p>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <BibliotecaForm onSave={handleSave} onClose={() => setShowForm(false)} />
      )}
    </div>
  )
}

function BibliotecaForm({ onSave, onClose }: {
  onSave: (data: Partial<BibliotecaItem>) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    titulo: '',
    descricao: '',
    tipo: 'partitura',
    instrumento: '',
    url: '',
    autor: '',
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">Novo Material</h2>
        <div className="space-y-3">
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Título" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
          <textarea className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Descrição (opcional)" rows={2} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
            {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.instrumento} onChange={(e) => setForm({ ...form, instrumento: e.target.value })}>
            <option value="">Instrumento (opcional)</option>
            {INSTRUMENTOS.map(i => <option key={i}>{i}</option>)}
          </select>
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="URL do material" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Autor (opcional)" value={form.autor} onChange={(e) => setForm({ ...form, autor: e.target.value })} />
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button onClick={() => onSave(form)} className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600">Salvar</button>
        </div>
      </div>
    </div>
  )
}
