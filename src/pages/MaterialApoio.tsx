import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  FolderOpen, Plus, Search, ArrowLeft, Upload, Link2, Video,
  FileText, Trash2, X, Image, Music, File, Download, ExternalLink,
  Pencil, Loader2,
} from 'lucide-react'

interface Pasta {
  id: string
  titulo: string
  descricao?: string
  instrumento?: string
  cor: string
  visivel_para: string[]
  created_at: string
  _count?: number
}

interface Arquivo {
  id: string
  pasta_id: string
  titulo: string
  descricao?: string
  tipo: 'arquivo' | 'video' | 'link' | 'imagem'
  url?: string
  storage_path?: string
  arquivo_nome?: string
  tamanho?: number
  mime_type?: string
  created_at: string
}

const CORES = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6']
const INSTRUMENTOS = ['Piano', 'Violão', 'Guitarra', 'Bateria', 'Canto', 'Ukulele', 'Violino', 'Contrabaixo', 'Cavaquinho', 'Percussão', 'Teoria', 'Geral']

function fmtBytes(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

function fmtData(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR')
}

function tipoIcon(tipo: string, mime?: string) {
  if (tipo === 'video') return <Video className="w-5 h-5 text-red-500" />
  if (tipo === 'link') return <ExternalLink className="w-5 h-5 text-blue-500" />
  if (tipo === 'imagem') return <Image className="w-5 h-5 text-green-500" />
  if (mime?.startsWith('audio/')) return <Music className="w-5 h-5 text-purple-500" />
  if (mime === 'application/pdf') return <FileText className="w-5 h-5 text-red-600" />
  return <File className="w-5 h-5 text-gray-500" />
}

function youtubeEmbed(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/)
  return m?.[1] ?? null
}

export default function MaterialApoio() {
  const { perfil, hasRole } = useAuth()
  const canEdit = hasRole('admin', 'recepcao', 'professor')
  const userRole = perfil?.role ?? 'aluno'

  const [pastas, setPastas] = useState<Pasta[]>([])
  const [pastaAberta, setPastaAberta] = useState<Pasta | null>(null)
  const [arquivos, setArquivos] = useState<Arquivo[]>([])
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)
  const [showNovaPasta, setShowNovaPasta] = useState(false)
  const [showNovoArquivo, setShowNovoArquivo] = useState(false)
  const [editandoPasta, setEditandoPasta] = useState<Pasta | null>(null)

  useEffect(() => { loadPastas() }, [])

  async function loadPastas() {
    setLoading(true)
    const { data } = await supabase
      .from('material_pastas')
      .select('*')
      .order('created_at', { ascending: false })

    if (data) {
      const { data: counts } = await supabase
        .from('material_arquivos')
        .select('pasta_id')

      const countMap = new Map<string, number>()
      for (const c of (counts || [])) {
        countMap.set(c.pasta_id, (countMap.get(c.pasta_id) || 0) + 1)
      }

      const filtered = (data as Pasta[]).filter(p =>
        p.visivel_para?.includes(userRole) ?? true
      )
      setPastas(filtered.map(p => ({ ...p, _count: countMap.get(p.id) || 0 })))
    }
    setLoading(false)
  }

  async function loadArquivos(pastaId: string) {
    const { data } = await supabase
      .from('material_arquivos')
      .select('*')
      .eq('pasta_id', pastaId)
      .order('created_at', { ascending: false })
    setArquivos((data || []) as Arquivo[])
  }

  function abrirPasta(pasta: Pasta) {
    setPastaAberta(pasta)
    loadArquivos(pasta.id)
  }

  async function deletarPasta(id: string) {
    if (!confirm('Excluir esta pasta e todos os materiais dentro?')) return
    const { data: arqs } = await supabase.from('material_arquivos').select('storage_path').eq('pasta_id', id)
    if (arqs) {
      const paths = arqs.map(a => a.storage_path).filter(Boolean) as string[]
      if (paths.length > 0) await supabase.storage.from('materiais').remove(paths)
    }
    await supabase.from('material_pastas').delete().eq('id', id)
    setPastas(prev => prev.filter(p => p.id !== id))
  }

  async function deletarArquivo(arq: Arquivo) {
    if (!confirm(`Excluir "${arq.titulo}"?`)) return
    if (arq.storage_path) {
      await supabase.storage.from('materiais').remove([arq.storage_path])
    }
    await supabase.from('material_arquivos').delete().eq('id', arq.id)
    setArquivos(prev => prev.filter(a => a.id !== arq.id))
    setPastas(prev => prev.map(p => p.id === arq.pasta_id ? { ...p, _count: (p._count || 1) - 1 } : p))
  }

  function getFileUrl(arq: Arquivo): string | null {
    if (arq.url) return arq.url
    if (arq.storage_path) {
      const { data } = supabase.storage.from('materiais').getPublicUrl(arq.storage_path)
      return data?.publicUrl || null
    }
    return null
  }

  const pastasFiltradas = pastas.filter(p =>
    !busca || p.titulo.toLowerCase().includes(busca.toLowerCase()) ||
    p.instrumento?.toLowerCase().includes(busca.toLowerCase()) ||
    p.descricao?.toLowerCase().includes(busca.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
      </div>
    )
  }

  // ============ INSIDE FOLDER VIEW ============
  if (pastaAberta) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setPastaAberta(null); setArquivos([]) }}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: pastaAberta.cor + '20', color: pastaAberta.cor }}
          >
            <FolderOpen className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{pastaAberta.titulo}</h1>
            {pastaAberta.descricao && <p className="text-sm text-gray-500">{pastaAberta.descricao}</p>}
          </div>
          {canEdit && (
            <button
              onClick={() => setShowNovoArquivo(true)}
              className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2.5 rounded-lg hover:bg-brand-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Adicionar Material
            </button>
          )}
        </div>

        {pastaAberta.instrumento && (
          <span className="inline-block text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-600">
            {pastaAberta.instrumento}
          </span>
        )}

        {arquivos.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <FolderOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Nenhum material nesta pasta</p>
            {canEdit && <p className="text-sm mt-1">Adicione arquivos, vídeos ou links</p>}
          </div>
        ) : (
          <div className="space-y-3">
            {arquivos.map(arq => {
              const fileUrl = getFileUrl(arq)
              const ytId = arq.tipo === 'video' && arq.url ? youtubeEmbed(arq.url) : null

              return (
                <div key={arq.id} className="bg-white rounded-xl border shadow-sm p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{tipoIcon(arq.tipo, arq.mime_type || undefined)}</div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-gray-900 text-sm">{arq.titulo}</h4>
                      {arq.descricao && <p className="text-xs text-gray-500 mt-0.5">{arq.descricao}</p>}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                        <span>{fmtData(arq.created_at)}</span>
                        {arq.tamanho && <span>{fmtBytes(arq.tamanho)}</span>}
                        {arq.arquivo_nome && <span className="truncate max-w-[200px]">{arq.arquivo_nome}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {fileUrl && arq.tipo !== 'video' && (
                        <a
                          href={fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 hover:bg-gray-100 rounded-lg text-brand-500"
                          title={arq.storage_path ? 'Baixar' : 'Abrir'}
                        >
                          {arq.storage_path ? <Download className="w-4 h-4" /> : <ExternalLink className="w-4 h-4" />}
                        </a>
                      )}
                      {canEdit && (
                        <button
                          onClick={() => deletarArquivo(arq)}
                          className="p-2 hover:bg-red-50 rounded-lg text-red-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {ytId && (
                    <div className="mt-3 aspect-video rounded-lg overflow-hidden bg-black">
                      <iframe
                        src={`https://www.youtube.com/embed/${ytId}`}
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title={arq.titulo}
                      />
                    </div>
                  )}

                  {arq.tipo === 'imagem' && fileUrl && (
                    <div className="mt-3">
                      <img src={fileUrl} alt={arq.titulo} className="max-h-64 rounded-lg" />
                    </div>
                  )}

                  {arq.mime_type?.startsWith('audio/') && fileUrl && (
                    <div className="mt-3">
                      <audio controls src={fileUrl} className="w-full" />
                    </div>
                  )}

                  {arq.mime_type === 'application/pdf' && fileUrl && (
                    <div className="mt-3">
                      <iframe src={fileUrl} className="w-full h-[400px] rounded-lg border" title={arq.titulo} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {showNovoArquivo && (
          <NovoArquivoModal
            pastaId={pastaAberta.id}
            onClose={() => setShowNovoArquivo(false)}
            onSaved={() => {
              setShowNovoArquivo(false)
              loadArquivos(pastaAberta.id)
              setPastas(prev => prev.map(p => p.id === pastaAberta.id ? { ...p, _count: (p._count || 0) + 1 } : p))
            }}
          />
        )}
      </div>
    )
  }

  // ============ FOLDER LIST VIEW ============
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Material de Apoio</h1>
          <p className="text-gray-500">Pastas de conteúdo para professores e alunos</p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setEditandoPasta(null); setShowNovaPasta(true) }}
            className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2.5 rounded-lg hover:bg-brand-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nova Pasta
          </button>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar pasta..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm"
        />
      </div>

      {pastasFiltradas.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FolderOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>Nenhuma pasta criada</p>
          {canEdit && <p className="text-sm mt-1">Crie pastas para organizar materiais, vídeos e arquivos</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pastasFiltradas.map(pasta => (
            <div
              key={pasta.id}
              onClick={() => abrirPasta(pasta)}
              className="bg-white rounded-xl border shadow-sm hover:shadow-md transition-all cursor-pointer group relative"
            >
              <div className="h-2 rounded-t-xl" style={{ backgroundColor: pasta.cor }} />
              <div className="p-5">
                <div className="flex items-start gap-3">
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: pasta.cor + '15', color: pasta.cor }}
                  >
                    <FolderOpen className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 group-hover:text-brand-600 transition-colors">{pasta.titulo}</h3>
                    {pasta.descricao && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{pasta.descricao}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-4 text-xs text-gray-400">
                  <div className="flex items-center gap-2">
                    {pasta.instrumento && (
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{pasta.instrumento}</span>
                    )}
                    <span>{pasta._count || 0} {(pasta._count || 0) === 1 ? 'material' : 'materiais'}</span>
                  </div>
                  <span>{fmtData(pasta.created_at)}</span>
                </div>
              </div>
              {canEdit && (
                <div className="absolute top-4 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => { setEditandoPasta(pasta); setShowNovaPasta(true) }}
                    className="p-1.5 bg-white/90 hover:bg-gray-100 rounded-lg shadow-sm"
                    title="Editar pasta"
                  >
                    <Pencil className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                  <button
                    onClick={() => deletarPasta(pasta.id)}
                    className="p-1.5 bg-white/90 hover:bg-red-50 rounded-lg shadow-sm"
                    title="Excluir pasta"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showNovaPasta && (
        <PastaModal
          pasta={editandoPasta}
          onClose={() => { setShowNovaPasta(false); setEditandoPasta(null) }}
          onSaved={() => { setShowNovaPasta(false); setEditandoPasta(null); loadPastas() }}
        />
      )}
    </div>
  )
}

// ============================================
// Modal: Criar/Editar Pasta
// ============================================
function PastaModal({ pasta, onClose, onSaved }: { pasta: Pasta | null; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth()
  const [form, setForm] = useState({
    titulo: pasta?.titulo || '',
    descricao: pasta?.descricao || '',
    instrumento: pasta?.instrumento || '',
    cor: pasta?.cor || CORES[0],
    visivel_para: pasta?.visivel_para || ['admin', 'recepcao', 'professor', 'aluno'],
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.titulo.trim()) { alert('Título é obrigatório'); return }
    setSaving(true)
    const payload = {
      titulo: form.titulo.trim(),
      descricao: form.descricao.trim() || null,
      instrumento: form.instrumento || null,
      cor: form.cor,
      visivel_para: form.visivel_para,
      ...(pasta ? {} : { criado_por: user?.id }),
    }
    if (pasta) {
      const { error } = await supabase.from('material_pastas').update(payload).eq('id', pasta.id)
      if (error) { alert('Erro:\n' + error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('material_pastas').insert(payload)
      if (error) { alert('Erro:\n' + error.message); setSaving(false); return }
    }
    setSaving(false)
    onSaved()
  }

  const toggleRole = (role: string) => {
    setForm(prev => ({
      ...prev,
      visivel_para: prev.visivel_para.includes(role)
        ? prev.visivel_para.filter(r => r !== role)
        : [...prev.visivel_para, role],
    }))
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="font-semibold text-gray-900">{pasta ? 'Editar Pasta' : 'Nova Pasta'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Título</label>
            <input
              value={form.titulo}
              onChange={e => setForm({ ...form, titulo: e.target.value })}
              placeholder="Ex: Teoria Musical Básica"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Descrição</label>
            <textarea
              value={form.descricao}
              onChange={e => setForm({ ...form, descricao: e.target.value })}
              placeholder="Descrição opcional..."
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Instrumento</label>
            <select
              value={form.instrumento}
              onChange={e => setForm({ ...form, instrumento: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            >
              <option value="">Todos / Geral</option>
              {INSTRUMENTOS.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Cor</label>
            <div className="flex gap-2">
              {CORES.map(c => (
                <button
                  key={c}
                  onClick={() => setForm({ ...form, cor: c })}
                  className={`w-7 h-7 rounded-full transition-all ${form.cor === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Visível para</label>
            <div className="flex flex-wrap gap-2">
              {[
                { role: 'admin', label: 'Admin' },
                { role: 'recepcao', label: 'Recepção' },
                { role: 'professor', label: 'Professores' },
                { role: 'aluno', label: 'Alunos' },
              ].map(({ role, label }) => (
                <button
                  key={role}
                  onClick={() => toggleRole(role)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    form.visivel_para.includes(role)
                      ? 'bg-brand-50 border-brand-300 text-brand-700'
                      : 'border-gray-200 text-gray-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Salvando...' : pasta ? 'Salvar' : 'Criar Pasta'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// Modal: Adicionar Material
// ============================================
function NovoArquivoModal({ pastaId, onClose, onSaved }: { pastaId: string; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<'arquivo' | 'video' | 'link'>('arquivo')
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<globalThis.File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  async function handleSave() {
    if (!titulo.trim()) { alert('Título é obrigatório'); return }

    setUploading(true)
    let storagePath: string | null = null
    let arquivoNome: string | null = null
    let tamanho: number | null = null
    let mimeType: string | null = null
    let finalUrl: string | null = url.trim() || null
    let tipo: string = tab

    if (tab === 'arquivo' && file) {
      const path = `${pastaId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      setProgress(10)

      const { error } = await supabase.storage.from('materiais').upload(path, file, {
        contentType: file.type,
        upsert: false,
      })

      if (error) {
        alert('Erro no upload:\n' + error.message)
        setUploading(false)
        return
      }

      storagePath = path
      arquivoNome = file.name
      tamanho = file.size
      mimeType = file.type
      finalUrl = null

      if (file.type.startsWith('image/')) tipo = 'imagem'

      setProgress(80)
    } else if (tab === 'video') {
      if (!url.trim()) { alert('Cole a URL do vídeo'); setUploading(false); return }
      tipo = 'video'
    } else if (tab === 'link') {
      if (!url.trim()) { alert('Cole a URL do link'); setUploading(false); return }
      tipo = 'link'
    } else if (tab === 'arquivo' && !file) {
      alert('Selecione um arquivo')
      setUploading(false)
      return
    }

    const { error } = await supabase.from('material_arquivos').insert({
      pasta_id: pastaId,
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      tipo,
      url: finalUrl,
      storage_path: storagePath,
      arquivo_nome: arquivoNome,
      tamanho,
      mime_type: mimeType,
      criado_por: user?.id,
    })

    setProgress(100)
    setUploading(false)

    if (error) {
      alert('Erro ao salvar:\n' + error.message)
      return
    }

    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="font-semibold text-gray-900">Adicionar Material</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {[
              { key: 'arquivo' as const, label: 'Arquivo', icon: Upload },
              { key: 'video' as const, label: 'Vídeo', icon: Video },
              { key: 'link' as const, label: 'Link', icon: Link2 },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                  tab === t.key ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Título</label>
            <input
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              placeholder="Nome do material"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Descrição (opcional)</label>
            <textarea
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Breve descrição..."
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
            />
          </div>

          {tab === 'arquivo' ? (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Arquivo</label>
              <input
                ref={fileInputRef}
                type="file"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) {
                    setFile(f)
                    if (!titulo) setTitulo(f.name.replace(/\.[^.]+$/, ''))
                  }
                }}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-300 rounded-lg py-6 text-center hover:border-brand-400 hover:bg-brand-50/30 transition-colors"
              >
                {file ? (
                  <div className="text-sm">
                    <p className="font-medium text-gray-900">{file.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{fmtBytes(file.size)}</p>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">
                    <Upload className="w-6 h-6 mx-auto mb-1 text-gray-400" />
                    <p>Clique para selecionar arquivo</p>
                    <p className="text-xs text-gray-400 mt-0.5">PDF, imagens, áudio, documentos (máx 50MB)</p>
                  </div>
                )}
              </button>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {tab === 'video' ? 'URL do Vídeo (YouTube, Vimeo, etc.)' : 'URL do Link'}
              </label>
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder={tab === 'video' ? 'https://youtube.com/watch?v=...' : 'https://...'}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
              {tab === 'video' && url && youtubeEmbed(url) && (
                <div className="mt-2 aspect-video rounded-lg overflow-hidden bg-black">
                  <iframe
                    src={`https://www.youtube.com/embed/${youtubeEmbed(url)}`}
                    className="w-full h-full"
                    allowFullScreen
                    title="Preview"
                  />
                </div>
              )}
            </div>
          )}

          {uploading && (
            <div className="flex items-center gap-3">
              <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div className="bg-brand-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-xs text-gray-500">{progress}%</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={uploading}
            className="px-4 py-1.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
          >
            {uploading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando...</> : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  )
}
