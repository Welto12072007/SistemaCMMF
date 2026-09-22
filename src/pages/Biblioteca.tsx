import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  BookOpen, Search, Plus, Filter, Music, FileText, Headphones, Video,
  FolderOpen, FolderPlus, ArrowLeft, GripVertical, X, Pencil, ExternalLink,
} from 'lucide-react'

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
  pasta_id?: string | null
  created_at?: string
}

interface Pasta {
  id: string
  titulo: string
  cor: string
  instrumento?: string
  created_at: string
  _count?: number
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
const CORES = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6']

const tipoIcon: Record<string, string> = {
  partitura: '🎵',
  cifra: '🎸',
  letra: '📝',
  apostila: '📚',
  video: '🎬',
  audio: '🎧',
  outro: '📄',
}

const tipoCor: Record<string, string> = {
  partitura: '#6366f1',
  cifra: '#f97316',
  letra: '#eab308',
  apostila: '#22c55e',
  video: '#f43f5e',
  audio: '#8b5cf6',
  outro: '#64748b',
}

export default function Biblioteca() {
  const { hasRole } = useAuth()
  const canEdit = hasRole('admin', 'recepcao', 'professor')

  const [items, setItems] = useState<BibliotecaItem[]>([])
  const [pastas, setPastas] = useState<Pasta[]>([])
  const [pastaAberta, setPastaAberta] = useState<Pasta | null>(null)
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('Todos')
  const [filtroInstrumento, setFiltroInstrumento] = useState('Todos')
  const [showForm, setShowForm] = useState(false)
  const [showPastaForm, setShowPastaForm] = useState(false)
  const [editingItem, setEditingItem] = useState<BibliotecaItem | null>(null)
  const [editingPasta, setEditingPasta] = useState<Pasta | null>(null)
  const [dragOverPasta, setDragOverPasta] = useState<string | null>(null)
  const [dragOverRoot, setDragOverRoot] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const [{ data: itemsData }, { data: pastasData }] = await Promise.all([
      supabase.from('biblioteca').select('*').order('created_at', { ascending: false }),
      supabase.from('biblioteca_pastas').select('*').order('created_at', { ascending: false }),
    ])
    if (itemsData) setItems(itemsData)
    if (pastasData) {
      const countMap = new Map<string, number>()
      for (const item of (itemsData || [])) {
        if (item.pasta_id) countMap.set(item.pasta_id, (countMap.get(item.pasta_id) || 0) + 1)
      }
      setPastas((pastasData as Pasta[]).map(p => ({ ...p, _count: countMap.get(p.id) || 0 })))
    }
  }

  function handleDragStart(e: React.DragEvent, itemId: string) {
    e.dataTransfer.setData('text/plain', itemId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDropOnPasta(e: React.DragEvent, pastaId: string) {
    e.preventDefault()
    setDragOverPasta(null)
    const itemId = e.dataTransfer.getData('text/plain')
    if (!itemId) return
    moveItem(itemId, pastaId)
  }

  function handleDropOnRoot(e: React.DragEvent) {
    e.preventDefault()
    setDragOverRoot(false)
    const itemId = e.dataTransfer.getData('text/plain')
    if (!itemId) return
    moveItem(itemId, null)
  }

  async function moveItem(itemId: string, pastaId: string | null) {
    await supabase.from('biblioteca').update({ pasta_id: pastaId }).eq('id', itemId)
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, pasta_id: pastaId } : i))
    setPastas(prev => prev.map(p => {
      let count = 0
      for (const i of items) {
        const pid = i.id === itemId ? pastaId : i.pasta_id
        if (pid === p.id) count++
      }
      return { ...p, _count: count }
    }))
  }

  async function handleSave(form: Partial<BibliotecaItem>) {
    if (editingItem) {
      await supabase.from('biblioteca').update(form).eq('id', editingItem.id)
      setEditingItem(null)
    } else {
      const payload = { ...form, pasta_id: pastaAberta?.id || null }
      await supabase.from('biblioteca').insert(payload)
    }
    setShowForm(false)
    loadAll()
  }

  async function handleSavePasta(titulo: string, cor: string, instrumento: string) {
    if (editingPasta) {
      await supabase.from('biblioteca_pastas').update({ titulo, cor, instrumento: instrumento || null }).eq('id', editingPasta.id)
      setEditingPasta(null)
    } else {
      await supabase.from('biblioteca_pastas').insert({ titulo, cor, instrumento: instrumento || null })
    }
    setShowPastaForm(false)
    loadAll()
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este material?')) return
    await supabase.from('biblioteca').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  async function handleDeletePasta(id: string) {
    if (!confirm('Excluir esta pasta? Os materiais voltam para a raiz.')) return
    await supabase.from('biblioteca').update({ pasta_id: null }).eq('pasta_id', id)
    await supabase.from('biblioteca_pastas').delete().eq('id', id)
    loadAll()
  }

  const hasFilter = busca || filtroTipo !== 'Todos' || filtroInstrumento !== 'Todos'

  const currentItems = items.filter(item => {
    if (pastaAberta) return item.pasta_id === pastaAberta.id
    // Na raiz com filtro ativo: busca em TUDO (inclusive dentro de pastas)
    if (hasFilter) return true
    return !item.pasta_id
  })

  const filtered = currentItems.filter((item) => {
    if (busca && !item.titulo.toLowerCase().includes(busca.toLowerCase()) && !item.autor?.toLowerCase().includes(busca.toLowerCase())) return false
    if (filtroTipo !== 'Todos' && item.tipo !== filtroTipo) return false
    if (filtroInstrumento !== 'Todos' && item.instrumento !== filtroInstrumento) return false
    return true
  })

  const pastaMap = new Map(pastas.map(p => [p.id, p]))

  // ====== INSIDE FOLDER VIEW ======
  if (pastaAberta) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setPastaAberta(null)} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: pastaAberta.cor + '20', color: pastaAberta.cor }}>
            <FolderOpen className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{pastaAberta.titulo}</h1>
            {pastaAberta.instrumento && <p className="text-sm text-gray-500">{pastaAberta.instrumento}</p>}
          </div>
          {canEdit && (
            <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2.5 rounded-lg hover:bg-brand-600">
              <Plus className="w-4 h-4" /> Novo Material
            </button>
          )}
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOverRoot(true) }}
          onDragLeave={() => setDragOverRoot(false)}
          onDrop={handleDropOnRoot}
          className={`border-2 border-dashed rounded-lg p-3 text-center text-sm transition-colors ${dragOverRoot ? 'border-brand-500 bg-brand-50 text-brand-600' : 'border-gray-200 text-gray-400'}`}
        >
          ← Soltar aqui para mover para a raiz
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(item => (
            <div
              key={item.id}
              draggable={canEdit}
              onDragStart={(e) => handleDragStart(e, item.id)}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-grab active:cursor-grabbing"
              style={{ borderTop: `3px solid ${tipoCor[item.tipo] || '#64748b'}` }}
            >
              <ItemCard item={item} onDelete={canEdit ? handleDelete : undefined} onEdit={canEdit ? (i) => { setEditingItem(i); setShowForm(true) } : undefined} />
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-400">
              <BookOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Pasta vazia</p>
            </div>
          )}
        </div>

        {showForm && <BibliotecaForm initial={editingItem} onSave={handleSave} onClose={() => { setShowForm(false); setEditingItem(null) }} />}
      </div>
    )
  }

  // ====== ROOT VIEW ======
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Biblioteca</h1>
          <p className="text-gray-500">Acervo de materiais musicais — arraste para organizar em pastas</p>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <>
              <button onClick={() => setShowPastaForm(true)} className="flex items-center gap-2 border border-brand-500 text-brand-600 px-4 py-2.5 rounded-lg hover:bg-brand-50">
                <FolderPlus className="w-4 h-4" /> Nova Pasta
              </button>
              <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2.5 rounded-lg hover:bg-brand-600">
                <Plus className="w-4 h-4" /> Novo Material
              </button>
            </>
          )}
        </div>
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

      {/* Folders */}
      {pastas.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Pastas</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {pastas.map(pasta => (
              <div
                key={pasta.id}
                onDragOver={(e) => { e.preventDefault(); setDragOverPasta(pasta.id) }}
                onDragLeave={() => setDragOverPasta(null)}
                onDrop={(e) => handleDropOnPasta(e, pasta.id)}
                onClick={() => setPastaAberta(pasta)}
                className={`relative bg-white rounded-xl border shadow-sm hover:shadow-md transition-all cursor-pointer group ${dragOverPasta === pasta.id ? 'ring-2 ring-brand-500 scale-[1.02]' : ''}`}
              >
                <div className="h-1.5 rounded-t-xl" style={{ backgroundColor: pasta.cor }} />
                <div className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: pasta.cor + '20', color: pasta.cor }}>
                      <FolderOpen className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-gray-900 text-sm truncate">{pasta.titulo}</h4>
                      <p className="text-xs text-gray-400">{pasta._count || 0} item(ns)</p>
                    </div>
                  </div>
                  {pasta.instrumento && (
                    <span className="mt-2 inline-block text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{pasta.instrumento}</span>
                  )}
                </div>
                {canEdit && (
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingPasta(pasta); setShowPastaForm(true) }}
                      className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700 transition-all"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeletePasta(pasta.id) }}
                      className="p-1 hover:bg-red-50 rounded text-red-400 hover:text-red-600 transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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

      {(hasFilter || filtered.length > 0) && (
        <p className="text-sm text-gray-500 flex items-center gap-1">
          <Filter className="w-3.5 h-3.5" />
          {filtered.length} material(is){hasFilter ? '' : ' sem pasta'}
        </p>
      )}

      {/* Items grid — só exibe se houver filtro ativo ou itens fora de pasta */}
      {(hasFilter || filtered.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => {
            const pasta = item.pasta_id ? pastaMap.get(item.pasta_id) : null
            return (
              <div
                key={item.id}
                draggable={canEdit}
                onDragStart={(e) => handleDragStart(e, item.id)}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-grab active:cursor-grabbing"
                style={{ borderTop: `3px solid ${tipoCor[item.tipo] || '#64748b'}` }}
              >
                {pasta && (
                  <button
                    onClick={() => setPastaAberta(pasta)}
                    className="flex items-center gap-1.5 mb-3 text-xs px-2 py-1 rounded-full hover:opacity-80 transition-opacity"
                    style={{ backgroundColor: pasta.cor + '15', color: pasta.cor }}
                  >
                    <FolderOpen className="w-3 h-3" />
                    {pasta.titulo}
                  </button>
                )}
                <ItemCard item={item} onDelete={canEdit ? handleDelete : undefined} onEdit={canEdit ? (i) => { setEditingItem(i); setShowForm(true) } : undefined} />
              </div>
            )
          })}
        </div>
      )}

      {filtered.length === 0 && !hasFilter && !pastas.length && (
        <div className="text-center py-12 text-gray-400">
          <BookOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>Nenhum material na biblioteca ainda</p>
          <p className="text-sm mt-1">Adicione partituras, cifras, apostilas e mais</p>
        </div>
      )}

      {hasFilter && filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <Search className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p>Nenhum material encontrado com esse filtro</p>
        </div>
      )}

      {showForm && <BibliotecaForm initial={editingItem} onSave={handleSave} onClose={() => { setShowForm(false); setEditingItem(null) }} />}
      {showPastaForm && <PastaForm initial={editingPasta} onSave={handleSavePasta} onClose={() => { setShowPastaForm(false); setEditingPasta(null) }} />}
    </div>
  )
}

function ItemCard({ item, onDelete, onEdit }: { item: BibliotecaItem; onDelete?: (id: string) => void; onEdit?: (item: BibliotecaItem) => void }) {
  const cor = tipoCor[item.tipo] || '#64748b'
  return (
    <>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {onDelete && <GripVertical className="w-4 h-4 text-gray-300 shrink-0" />}
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
            style={{ backgroundColor: cor + '15' }}
          >
            {tipoIcon[item.tipo] || '📄'}
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 text-sm leading-tight">{item.titulo}</h4>
            {item.autor && <p className="text-xs text-gray-500 mt-0.5">{item.autor}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onEdit && (
            <button onClick={() => onEdit(item)} className="p-1 text-gray-400 hover:text-brand-600"><Pencil className="w-3.5 h-3.5" /></button>
          )}
          {onDelete && (
            <button onClick={() => onDelete(item.id)} className="p-1 text-red-400 hover:text-red-600">✕</button>
          )}
        </div>
      </div>
      {item.descricao && <p className="text-xs text-gray-600 mb-3 line-clamp-2">{item.descricao}</p>}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ backgroundColor: cor + '15', color: cor }}>
          {TIPOS.find(t => t.value === item.tipo)?.label || item.tipo}
        </span>
        {item.instrumento && (
          <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">{item.instrumento}</span>
        )}
      </div>
      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-80 transition-opacity"
          style={{ backgroundColor: cor + '15', color: cor }}
        >
          Abrir material <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </>
  )
}

function BibliotecaForm({ initial, onSave, onClose }: { initial?: BibliotecaItem | null; onSave: (data: Partial<BibliotecaItem>) => void; onClose: () => void }) {
  const [form, setForm] = useState({ titulo: initial?.titulo || '', descricao: initial?.descricao || '', tipo: initial?.tipo || 'partitura', instrumento: initial?.instrumento || '', url: initial?.url || '', autor: initial?.autor || '' })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">{initial ? 'Editar Material' : 'Novo Material'}</h2>
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
          <button onClick={() => form.titulo && onSave(form)} className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600">Salvar</button>
        </div>
      </div>
    </div>
  )
}

function PastaForm({ initial, onSave, onClose }: { initial?: Pasta | null; onSave: (titulo: string, cor: string, instrumento: string) => void; onClose: () => void }) {
  const [titulo, setTitulo] = useState(initial?.titulo || '')
  const [cor, setCor] = useState(initial?.cor || '#6366f1')
  const [instrumento, setInstrumento] = useState(initial?.instrumento || '')

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">{initial ? 'Editar Pasta' : 'Nova Pasta'}</h2>
        <div className="space-y-3">
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Nome da pasta" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={instrumento} onChange={(e) => setInstrumento(e.target.value)}>
            <option value="">Instrumento (opcional)</option>
            {INSTRUMENTOS.map(i => <option key={i}>{i}</option>)}
          </select>
          <div>
            <p className="text-xs text-gray-500 mb-2">Cor</p>
            <div className="flex gap-2 flex-wrap">
              {CORES.map(c => (
                <button
                  key={c}
                  onClick={() => setCor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-transform ${cor === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button onClick={() => titulo && onSave(titulo, cor, instrumento)} className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600">{initial ? 'Salvar' : 'Criar'}</button>
        </div>
      </div>
    </div>
  )
}
