import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Tv, Plus, Search, Play, Star, Filter } from 'lucide-react'

interface ConteudoTV {
  id: string
  titulo: string
  descricao?: string
  categoria?: string
  instrumento?: string
  url?: string
  thumbnail_url?: string
  destaque: boolean
  created_at?: string
}

const CATEGORIAS = ['Aula', 'Apresentação', 'Tutorial', 'Entrevista', 'Recital', 'Bastidores', 'Outro']
const INSTRUMENTOS = ['Piano', 'Violão', 'Guitarra', 'Bateria', 'Canto', 'Ukulele', 'Violino', 'Contrabaixo', 'Geral']

function getYouTubeThumbnail(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/)
  return match ? `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg` : null
}

export default function FingerTV() {
  const [videos, setVideos] = useState<ConteudoTV[]>([])
  const [busca, setBusca] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('Todas')
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    loadVideos()
  }, [])

  async function loadVideos() {
    const { data } = await supabase
      .from('conteudos')
      .select('*')
      .eq('tipo', 'fingertv')
      .order('destaque', { ascending: false })
      .order('created_at', { ascending: false })
    if (data) setVideos(data)
  }

  const filtered = videos.filter((v) => {
    if (busca && !v.titulo.toLowerCase().includes(busca.toLowerCase())) return false
    if (filtroCategoria !== 'Todas' && v.categoria !== filtroCategoria) return false
    return true
  })

  const destaques = filtered.filter(v => v.destaque)
  const regulares = filtered.filter(v => !v.destaque)

  async function handleSave(form: Partial<ConteudoTV>) {
    await supabase.from('conteudos').insert({
      ...form,
      tipo: 'fingertv',
    })
    setShowForm(false)
    loadVideos()
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este vídeo?')) return
    await supabase.from('conteudos').delete().eq('id', id)
    loadVideos()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Tv className="w-6 h-6 text-brand-500" />
            FingerTV
          </h1>
          <p className="text-gray-500">Conteúdo em vídeo do Centro de Música</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2.5 rounded-lg hover:bg-brand-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Vídeo
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar vídeos..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm"
          />
        </div>
        <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm">
          <option>Todas</option>
          {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* Destaques */}
      {destaques.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1">
            <Star className="w-4 h-4 text-yellow-500" /> Destaques
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {destaques.map(v => (
              <VideoCard key={v.id} video={v} onDelete={handleDelete} featured />
            ))}
          </div>
        </div>
      )}

      {/* Grid */}
      <div>
        <p className="text-sm text-gray-500 mb-3 flex items-center gap-1">
          <Filter className="w-3.5 h-3.5" />
          {filtered.length} vídeo(s)
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {regulares.map((v) => (
            <VideoCard key={v.id} video={v} onDelete={handleDelete} />
          ))}
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Tv className="w-16 h-16 mx-auto mb-4 text-gray-200" />
            <p className="text-lg">Nenhum vídeo na FingerTV ainda</p>
            <p className="text-sm mt-1">Adicione vídeos de aulas, apresentações e recitais</p>
          </div>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <VideoForm onSave={handleSave} onClose={() => setShowForm(false)} />
      )}
    </div>
  )
}

function VideoCard({ video, onDelete, featured }: { video: ConteudoTV; onDelete: (id: string) => void; featured?: boolean }) {
  const thumb = video.thumbnail_url || (video.url ? getYouTubeThumbnail(video.url) : null)

  return (
    <div className={`bg-white rounded-xl shadow-sm border overflow-hidden hover:shadow-md transition-shadow ${featured ? 'ring-2 ring-yellow-400' : ''}`}>
      {/* Thumbnail */}
      <div className="relative bg-gray-100 aspect-video flex items-center justify-center">
        {thumb ? (
          <img src={thumb} alt={video.titulo} className="w-full h-full object-cover" />
        ) : (
          <Tv className="w-12 h-12 text-gray-300" />
        )}
        {video.url && (
          <a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity"
          >
            <div className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center">
              <Play className="w-6 h-6 text-brand-600 ml-1" fill="currentColor" />
            </div>
          </a>
        )}
        {featured && (
          <div className="absolute top-2 left-2 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
            <Star className="w-3 h-3" fill="currentColor" /> Destaque
          </div>
        )}
      </div>
      {/* Info */}
      <div className="p-4">
        <div className="flex items-start justify-between">
          <h4 className="font-medium text-gray-900 text-sm line-clamp-2">{video.titulo}</h4>
          <button onClick={() => onDelete(video.id)} className="text-xs text-red-400 hover:text-red-600 ml-2 flex-shrink-0">✕</button>
        </div>
        {video.descricao && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{video.descricao}</p>}
        <div className="flex items-center gap-2 mt-2">
          {video.categoria && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">{video.categoria}</span>
          )}
          {video.instrumento && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{video.instrumento}</span>
          )}
        </div>
      </div>
    </div>
  )
}

function VideoForm({ onSave, onClose }: {
  onSave: (data: Partial<ConteudoTV>) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    titulo: '',
    descricao: '',
    categoria: '',
    instrumento: '',
    url: '',
    thumbnail_url: '',
    destaque: false,
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">Novo Vídeo</h2>
        <div className="space-y-3">
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Título do vídeo" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
          <textarea className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Descrição" rows={2} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="URL do vídeo (YouTube, etc.)" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="URL da thumbnail (opcional)" value={form.thumbnail_url} onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })} />
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
            <option value="">Categoria</option>
            {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
          </select>
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.instrumento} onChange={(e) => setForm({ ...form, instrumento: e.target.value })}>
            <option value="">Instrumento (opcional)</option>
            {INSTRUMENTOS.map(i => <option key={i}>{i}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.destaque} onChange={(e) => setForm({ ...form, destaque: e.target.checked })} className="rounded" />
            Marcar como destaque
          </label>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button onClick={() => onSave(form)} className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600">Salvar</button>
        </div>
      </div>
    </div>
  )
}
