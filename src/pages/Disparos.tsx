import { useEffect, useState, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getLabelGrupoBase } from '@/lib/crmSegmentos'
import { MEDIA_ACCEPT, uploadDisparoMedia, listDisparoMedia, deleteDisparoMedia } from '@/lib/disparosMedia'
import type { MediaType } from '@/lib/disparosMedia'
import type { CRMSegmento, GrupoBaseSegmento } from '@/lib/crmSegmentos'
import AudioRecorder from '@/components/AudioRecorder'
import CameraCaptureModal from '@/components/CameraCaptureModal'
import {
  Send,
  Users,
  UserCheck,
  Search,
  X,
  CheckSquare,
  Square,
  Filter,
  MessageSquare,
  Loader2,
  Image,
  Paperclip,
  Camera,
} from 'lucide-react'

interface Destinatario {
  id: string
  nome: string
  telefone: string
  instrumento_interesse?: string
  status?: string
  label?: string
  selected: boolean
}

type GrupoBase =
  | 'todos'
  | 'alunos_ativos'
  | 'ex_alunos'
  | 'leads'
  | 'aguardando_pagamento'
  | `segmento:${string}`
  | `publico:${string}`

const GRUPOS: { key: GrupoBase; label: string; desc: string }[] = [
  { key: 'todos', label: 'Todos os contatos', desc: 'Enviar para toda a base' },
  { key: 'alunos_ativos', label: 'Alunos ativos', desc: 'Matriculados com plano ativo' },
  { key: 'ex_alunos', label: 'Ex-alunos', desc: 'Status concluido ou perdido' },
  { key: 'leads', label: 'Leads novos', desc: 'Leads que ainda não agendaram' },
  { key: 'aguardando_pagamento', label: 'Aguardando pagamento', desc: 'Experimental agendada, sem pagar' },
]

const INSTRUMENTOS = [
  'Violão',
  'Guitarra',
  'Piano',
  'Teclado',
  'Bateria',
  'Baixo',
  'Canto',
  'Ukulele',
  'Violino',
  'Cavaquinho',
]

export default function Disparos() {
  const [contatos, setContatos] = useState<Destinatario[]>([])
  const [segmentos, setSegmentos] = useState<CRMSegmento[]>([])
  const [grupoBase, setGrupoBase] = useState<GrupoBase>('alunos_ativos')
  const [instrumentosSelecionados, setInstrumentosSelecionados] = useState<string[]>([])
  const [busca, setBusca] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<{ sucesso: number; erro: number; detalhes?: string[] } | null>(null)
  const [mediaUrl, setMediaUrl] = useState('')
  const [mediaType, setMediaType] = useState<'text' | 'image' | 'video' | 'audio' | 'document'>('text')
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [mediaLibrary, setMediaLibrary] = useState<Array<{ name: string; path: string; url: string }>>([])
  const [mediaError, setMediaError] = useState('')
  const [publicos, setPublicos] = useState<{ id: string; nome: string; ativo: boolean }[]>([])
  const [publicoMembros, setPublicoMembros] = useState<Record<string, Set<string>>>({})
  const [showCamera, setShowCamera] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function insertVar(v: string) {
    const el = textareaRef.current
    if (!el) { setMensagem(m => m + v); return }
    const start = el.selectionStart
    const end = el.selectionEnd
    const before = mensagem.slice(0, start)
    const after = mensagem.slice(end)
    const novo = before + v + after
    setMensagem(novo)
    setTimeout(() => { el.focus(); el.setSelectionRange(start+v.length, start+v.length) }, 0)
  }

  function interpolate(texto: string, dest: Destinatario): string {
    const nomeCompleto = (dest.nome ?? '').trim()
    const primeiroNome = nomeCompleto.split(/\s+/)[0] || nomeCompleto
    return texto
      .replace(/\{nome\}/gi, primeiroNome)
      .replace(/\{nome_completo\}/gi, nomeCompleto)
      .replace(/\{instrumento\}/gi, dest.instrumento_interesse ?? '')
      // contato sem nome cadastrado deixa espaço duplo/sobrando - normaliza
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/^ +| +$/gm, '')
  }

  useEffect(() => {
    void loadContatos()
    void loadSegmentos()
    void loadPublicos()
  }, [])

  useEffect(() => {
    if (typeof grupoBase !== 'string' || !grupoBase.startsWith('publico:')) return
    const publicoId = grupoBase.replace('publico:', '')
    if (publicoMembros[publicoId]) return
    void loadMembrosPublico(publicoId)
  }, [grupoBase])

  async function loadPublicos() {
    const { data } = await supabase.from('disparos_publicos').select('id, nome, ativo').eq('ativo', true).order('nome')
    setPublicos(data || [])
  }

  async function loadMembrosPublico(publicoId: string) {
    const { data } = await supabase.from('disparos_publicos_alunos').select('aluno_id').eq('publico_id', publicoId)
    setPublicoMembros((prev) => ({ ...prev, [publicoId]: new Set((data || []).map((r: any) => r.aluno_id)) }))
  }

  useEffect(() => {
    if (mediaType === 'text') {
      setMediaLibrary([])
      setMediaError('')
      return
    }

    void loadMediaLibrary(mediaType as MediaType)
  }, [mediaType])

  async function loadSegmentos() {
    const { data } = await supabase
      .from('crm_segmentos')
      .select('*')
      .eq('ativo', true)
      .order('nome')

    const parsed: CRMSegmento[] = (data || []).map((s: any) => ({
      id: s.id,
      nome: s.nome,
      descricao: s.descricao || '',
      grupoBase: s.grupo_base as GrupoBaseSegmento,
      instrumento: s.instrumento || '',
      apenasComTelefone: Boolean(s.apenas_com_telefone),
      ativo: Boolean(s.ativo),
      createdAt: s.created_at,
    }))

    setSegmentos(parsed)
  }

  async function loadContatos() {
    // Fetch alunos and labels in parallel
    const [alunosRes, labelsRes] = await Promise.all([
      supabase.from('alunos').select('id, nome, telefone, instrumento_interesse, status').order('nome'),
      supabase.from('contato_labels').select('telefone, label_name'),
    ])

    const alunos = alunosRes.data || []
    const labels = labelsRes.data || []

    // Build label map by phone
    const labelMap = new Map<string, string>()
    for (const l of labels) {
      labelMap.set(l.telefone, l.label_name)
    }

    // Merge labels into alunos
    const merged: Destinatario[] = alunos.map((c) => ({
      ...c,
      label: labelMap.get(c.telefone),
      selected: false,
    }))

    // Add label-only contacts (not in alunos table)
    const alunoPhones = new Set(alunos.map((a) => a.telefone))
    for (const l of labels) {
      if (!alunoPhones.has(l.telefone)) {
        merged.push({
          id: `label-${l.telefone}`,
          nome: '',
          telefone: l.telefone,
          status: undefined,
          label: l.label_name,
          selected: false,
        })
      }
    }

    setContatos(merged)
  }

  async function loadMediaLibrary(type: MediaType) {
    try {
      const items = await listDisparoMedia(supabase, type)
      setMediaLibrary(items)
      setMediaError('')
    } catch {
      setMediaLibrary([])
      setMediaError('Não foi possível carregar a biblioteca de mídia.')
    }
  }

  async function handleUploadMedia(file: File | null) {
    if (!file || mediaType === 'text') return

    setUploadingMedia(true)
    setMediaError('')

    try {
      const result = await uploadDisparoMedia(supabase, mediaType as MediaType, file)
      setMediaUrl(result.url)
      await loadMediaLibrary(mediaType as MediaType)
    } catch {
      setMediaError('Falha ao enviar arquivo. Verifique permissões do bucket.')
    } finally {
      setUploadingMedia(false)
    }
  }

  async function handleRecordedAudio(blob: Blob) {
    const ext = blob.type.includes('mp4') ? 'm4a' : 'webm'
    const file = new File([blob], `gravacao-${Date.now()}.${ext}`, { type: blob.type })
    await handleUploadMedia(file)
  }

  async function handleDeleteMedia(path: string) {
    try {
      await deleteDisparoMedia(supabase, path)
      if (mediaUrl.includes(path)) setMediaUrl('')
      await loadMediaLibrary(mediaType as MediaType)
    } catch {
      setMediaError('Falha ao excluir mídia da biblioteca.')
    }
  }

  // Filter by group and search
  const filtrados = useMemo(() => {
    let lista = contatos

    if (typeof grupoBase === 'string' && grupoBase.startsWith('publico:')) {
      const publicoId = grupoBase.replace('publico:', '')
      const ids = publicoMembros[publicoId]
      lista = ids ? lista.filter((c) => ids.has(c.id)) : []
    } else if (typeof grupoBase === 'string' && grupoBase.startsWith('segmento:')) {
      const segmentoId = grupoBase.replace('segmento:', '')
      const segmento = segmentos.find((s) => s.id === segmentoId)
      if (segmento) {
        if (segmento.grupoBase === 'alunos_ativos') lista = lista.filter((c) => ['ativo', 'aluno'].includes(c.status || ''))
        if (segmento.grupoBase === 'ex_alunos') lista = lista.filter((c) => ['perdido', 'cancelado', 'concluido'].includes(c.status || ''))
        if (segmento.grupoBase === 'leads') lista = lista.filter((c) => c.status === 'lead')
        if (segmento.instrumento) lista = lista.filter((c) => c.instrumento_interesse?.toLowerCase().includes(segmento.instrumento.toLowerCase()))
        if (segmento.apenasComTelefone) lista = lista.filter((c) => (c.telefone || '').replace(/\D/g, '').length >= 10)
      }
    } else {
      switch (grupoBase) {
        case 'alunos_ativos':
          lista = lista.filter((c) => ['ativo', 'aluno'].includes(c.status || ''))
          break
        case 'ex_alunos':
          lista = lista.filter((c) => ['perdido', 'cancelado', 'concluido'].includes(c.status || ''))
          break
        case 'leads':
          lista = lista.filter((c) => c.status === 'lead')
          break
        case 'aguardando_pagamento':
          lista = lista.filter((c) => c.status === 'agendado')
          break
      }
    }

    // Instrument multi-filter (applied on top of group)
    if (instrumentosSelecionados.length > 0) {
      lista = lista.filter((c) =>
        instrumentosSelecionados.some((inst) =>
          c.instrumento_interesse?.toLowerCase().includes(inst.toLowerCase())
        )
      )
    }

    // Only include contacts with valid phone
    lista = lista.filter((c) => (c.telefone || '').replace(/\D/g, '').length >= 10)

    if (busca) {
      const term = busca.toLowerCase()
      lista = lista.filter(
        (c) => c.nome?.toLowerCase().includes(term) || c.telefone?.includes(term)
      )
    }

    return lista
  }, [contatos, segmentos, grupoBase, instrumentosSelecionados, busca, publicoMembros])

  const selecionados = contatos.filter((c) => c.selected)
  const semNome = selecionados.filter((c) => !c.nome?.trim())

  function toggleAll(selected: boolean) {
    const filtradoIds = new Set(filtrados.map((f) => f.id))
    setContatos((prev) =>
      prev.map((c) => (filtradoIds.has(c.id) ? { ...c, selected } : c))
    )
  }

  function toggleOne(id: string) {
    setContatos((prev) => prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)))
  }

  function selectGroup() {
    const filtradoIds = new Set(filtrados.map((f) => f.id))
    setContatos((prev) => prev.map((c) => ({ ...c, selected: filtradoIds.has(c.id) })))
  }

  async function enviarDisparos() {
    const temTexto = Boolean(mensagem.trim())
    const temMidia = mediaType !== 'text' && Boolean(mediaUrl.trim())
    if (selecionados.length === 0 || (!temTexto && !temMidia)) return

    setEnviando(true)
    setResultado(null)

    let sucesso = 0
    let erro = 0
    const erroDetalhes: string[] = []

    for (const dest of selecionados) {
      try {
        let tel = dest.telefone.replace(/\D/g, '')
        // Normalizar telefone brasileiro
        if (tel.length === 11) tel = `55${tel}` // DDD+9dig → adicionar DDI
        if (tel.length === 12) tel = tel.slice(0, 4) + '9' + tel.slice(4) // 55+DDD+8dig → inserir 9
        if (tel.length !== 13) {
          erroDetalhes.push(`${dest.nome}: telefone inválido (${dest.telefone})`)
          erro++
          continue
        }

        const baseUrl = import.meta.env.VITE_EVOLUTION_URL || 'https://api.centrodemusicamurilofinger.com'
        const apiKey = import.meta.env.VITE_EVOLUTION_KEY || ''

        let res: Response
        if (mediaType === 'audio' && mediaUrl.trim()) {
          // Áudio precisa do endpoint dedicado: converte pra ogg/opus (ptt) e toca no WhatsApp.
          // sendMedia com mediatype=audio manda o arquivo cru (webm) e a mensagem chega muda.
          res = await fetch(
            `${baseUrl}/message/sendWhatsAppAudio/CentroMusica`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: apiKey,
              },
              body: JSON.stringify({
                number: tel,
                audio: mediaUrl.trim(),
              }),
            }
          )
          // Áudio (ptt) não aceita legenda no WhatsApp — manda o texto como mensagem separada
          if (res.ok && mensagem.trim()) {
            await fetch(
              `${baseUrl}/message/sendText/CentroMusica`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  apikey: apiKey,
                },
                body: JSON.stringify({
                  number: tel,
                  text: interpolate(mensagem, dest),
                }),
              }
            )
          }
        } else if (mediaType !== 'text' && mediaUrl.trim()) {
          // Send media message
          res = await fetch(
            `${baseUrl}/message/sendMedia/CentroMusica`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: apiKey,
              },
              body: JSON.stringify({
                number: tel,
                mediatype: mediaType,
                media: mediaUrl.trim(),
                caption: interpolate(mensagem, dest) || undefined,
              }),
            }
          )
        } else {
          // Send text message
          res = await fetch(
            `${baseUrl}/message/sendText/CentroMusica`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: apiKey,
              },
              body: JSON.stringify({
                number: tel,
                text: interpolate(mensagem, dest),
              }),
            }
          )
        }
        if (res.ok) {
          sucesso++
        } else {
          const body = await res.text().catch(() => '')
          erroDetalhes.push(`${dest.nome}: ${res.status} ${body.slice(0, 100)}`)
          erro++
        }
      } catch (e) {
        erroDetalhes.push(`${dest.nome}: ${e instanceof Error ? e.message : 'erro de rede'}`)
        erro++
      }
    }

    setResultado({ sucesso, erro, detalhes: erroDetalhes })
    setEnviando(false)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Disparos de Mensagens</h1>
        <p className="text-gray-500">Envie mensagens para grupos ou contatos individuais</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Group Selection + Contacts */}
        <div className="lg:col-span-2 space-y-4">
          {/* Group Filters */}
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Selecionar público
              </h3>
              <Link to="/disparos-programados" className="text-xs text-brand-600 hover:underline">
                Gerenciar públicos personalizados →
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {GRUPOS.map((g) => (
                <button
                  key={g.key}
                  onClick={() => setGrupoBase(g.key)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    grupoBase === g.key
                      ? 'bg-brand-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title={g.desc}
                >
                  {g.label}
                </button>
              ))}
              {segmentos.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setGrupoBase(`segmento:${s.id}`)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    grupoBase === `segmento:${s.id}`
                      ? 'bg-brand-500 text-white'
                      : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  }`}
                  title={`${getLabelGrupoBase(s.grupoBase)}${s.instrumento ? ` | ${s.instrumento}` : ''}`}
                >
                  {s.nome}
                </button>
              ))}
              {publicos.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setGrupoBase(`publico:${p.id}`)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    grupoBase === `publico:${p.id}`
                      ? 'bg-brand-500 text-white'
                      : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                  }`}
                  title="Público personalizado (lista manual de alunos)"
                >
                  {p.nome}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
              <span className="text-xs text-gray-500 self-center mr-1">Instrumento:</span>
              {INSTRUMENTOS.map((inst) => {
                const ativo = instrumentosSelecionados.includes(inst)
                return (
                  <button
                    key={inst}
                    onClick={() =>
                      setInstrumentosSelecionados((prev) =>
                        ativo ? prev.filter((i) => i !== inst) : [...prev, inst]
                      )
                    }
                    className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                      ativo
                        ? 'bg-brand-500 text-white'
                        : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                    }`}
                  >
                    {inst}
                  </button>
                )
              })}
              {instrumentosSelecionados.length > 0 && (
                <button
                  onClick={() => setInstrumentosSelecionados([])}
                  className="px-2.5 py-1 rounded-full text-xs bg-red-50 text-red-500 hover:bg-red-100"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          {/* Search + Select All */}
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por nome ou telefone..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                />
              </div>
              <button
                onClick={selectGroup}
                className="text-xs bg-brand-50 text-brand-700 px-3 py-2 rounded-lg hover:bg-brand-100 transition-colors whitespace-nowrap"
              >
                Selecionar grupo ({filtrados.length})
              </button>
              <button
                onClick={() => toggleAll(false)}
                className="text-xs bg-gray-100 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
              >
                Limpar
              </button>
            </div>

            {/* Contact List */}
            <div className="max-h-96 overflow-y-auto space-y-1">
              {filtrados.map((c) => (
                <div
                  key={c.id}
                  onClick={() => toggleOne(c.id)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    c.selected ? 'bg-brand-50 border border-brand-200' : 'hover:bg-gray-50'
                  }`}
                >
                  {c.selected ? (
                    <CheckSquare className="w-4 h-4 text-brand-500 flex-shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.nome || 'Sem nome'}</p>
                    <p className="text-xs text-gray-500">{c.telefone}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-xs text-gray-400">{c.instrumento_interesse || '—'}</span>
                  </div>
                </div>
              ))}
              {filtrados.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">
                  Nenhum contato encontrado
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right: Message Composer */}
        <div className="space-y-4">
          {/* Selected Summary */}
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <UserCheck className="w-4 h-4" />
              Destinatários
            </h3>
            <p className="text-2xl font-bold text-brand-600">{selecionados.length}</p>
            <p className="text-xs text-gray-500">contatos selecionados</p>

            {selecionados.length > 0 && selecionados.length <= 5 && (
              <div className="mt-3 space-y-1">
                {selecionados.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-700 truncate">{s.nome}</span>
                    <button
                      onClick={() => toggleOne(s.id)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Message */}
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Mensagem
            </h3>

            {/* Media Type Selector */}
            <div className="flex gap-1 mb-3 bg-gray-100 rounded-lg p-1">
              {([
                { key: 'text', label: 'Texto' },
                { key: 'image', label: 'Imagem' },
                { key: 'video', label: 'Vídeo' },
                { key: 'audio', label: 'Áudio' },
                { key: 'document', label: 'Documento' },
              ] as const).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setMediaType(t.key)}
                  className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    mediaType === t.key ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-600'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Media URL Input */}
            {mediaType !== 'text' && (
              <div className="mb-3">
                {/* Audio recorder (only for audio type) */}
                {mediaType === 'audio' && !mediaUrl && (
                  <div className="mb-3">
                    <AudioRecorder onRecorded={handleRecordedAudio} disabled={uploadingMedia} />
                    <div className="flex items-center gap-2 my-2">
                      <div className="flex-1 border-t border-gray-200" />
                      <span className="text-xs text-gray-400">ou envie um arquivo</span>
                      <div className="flex-1 border-t border-gray-200" />
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 mb-1">
                  <Paperclip className="w-3.5 h-3.5 text-gray-400" />
                  <label className="text-xs text-gray-500">Mídia (upload de arquivo)</label>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="file"
                    accept={MEDIA_ACCEPT[mediaType as MediaType]}
                    className="text-xs"
                    onChange={(e) => handleUploadMedia(e.target.files?.[0] || null)}
                  />
                  {(mediaType === 'image' || mediaType === 'video') && (
                    <button
                      type="button"
                      onClick={() => setShowCamera(true)}
                      className="flex items-center gap-1 text-xs px-2 py-1.5 rounded border border-gray-200 hover:bg-gray-50 whitespace-nowrap"
                    >
                      <Camera className="w-3.5 h-3.5" /> Usar câmera
                    </button>
                  )}
                  {uploadingMedia && <span className="text-xs text-gray-500">Enviando...</span>}
                </div>
                {mediaUrl && (
                  <div className="flex items-center justify-between bg-gray-50 border rounded-lg px-3 py-2">
                    <span className="text-xs text-gray-700 truncate">Mídia selecionada</span>
                    <button
                      type="button"
                      onClick={() => setMediaUrl('')}
                      className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200"
                    >
                      Remover
                    </button>
                  </div>
                )}
                {mediaError && <p className="text-xs text-red-500 mt-1">{mediaError}</p>}
                {mediaLibrary.length > 0 && (
                  <div className="mt-2 max-h-24 overflow-y-auto space-y-1">
                    {mediaLibrary.slice(0, 8).map((item) => (
                      <div key={item.path} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setMediaUrl(item.url)}
                          className="flex-1 text-left text-xs px-2 py-1 rounded bg-gray-50 hover:bg-gray-100 text-gray-700"
                          title={item.url}
                        >
                          Usar: {item.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMedia(item.path)}
                          className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200"
                        >
                          Excluir
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Chips de variáveis */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              <span className="text-xs text-gray-400 self-center">Inserir:</span>
              {[
                { label: '{nome}', desc: 'Primeiro nome' },
                { label: '{nome_completo}', desc: 'Nome completo' },
                { label: '{instrumento}', desc: 'Instrumento' },
              ].map(v => (
                <button key={v.label} type="button" onClick={() => insertVar(v.label)}
                  title={v.desc}
                  className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 border border-brand-200 hover:bg-brand-100 transition-colors font-mono"
                >{v.label}</button>
              ))}
            </div>

            <textarea
              ref={textareaRef}
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="Ex: Olá {nome}, tudo bem? Lembramos que sua aula de {instrumento} está confirmada!"
              rows={6}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-none"
            />

            {/* Preview personalizado */}
            {mensagem.includes('{') && selecionados.length > 0 && (() => {
              const primeiro = selecionados[0]!
              const preview = interpolate(mensagem, primeiro)
              return (
                <div className="mt-1.5 p-2.5 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="text-xs text-gray-400 mb-1">Preview para <strong className="text-gray-600">{primeiro.nome || '(sem nome)'}</strong>:</p>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap">{preview}</p>
                </div>
              )
            })()}

            {mensagem.toLowerCase().includes('{nome') && semNome.length > 0 && (
              <p className="text-xs text-amber-600 mt-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                ⚠️ {semNome.length} contato{semNome.length !== 1 ? 's' : ''} sem nome cadastrado — {'{nome}'} vai ficar em branco pra {semNome.length !== 1 ? 'eles' : 'ele'}.
              </p>
            )}

            <p className="text-xs text-gray-400 mt-1">
              {mensagem.length} caracteres
              {mediaType !== 'text' && mediaUrl && ' • com mídia'}
            </p>

            <button
              onClick={enviarDisparos}
              disabled={enviando || selecionados.length === 0 || (!mensagem.trim() && !(mediaType !== 'text' && mediaUrl.trim()))}
              className="w-full mt-3 flex items-center justify-center gap-2 bg-brand-500 text-white px-4 py-2.5 rounded-lg hover:bg-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {enviando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Enviar para {selecionados.length} contato{selecionados.length !== 1 ? 's' : ''}
                </>
              )}
            </button>
          </div>

          {/* Result */}
          {resultado && (
            <div className="bg-white rounded-xl shadow-sm border p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Resultado do disparo</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-green-600">Enviados com sucesso</span>
                  <span className="font-bold text-green-600">{resultado.sucesso}</span>
                </div>
                {resultado.erro > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-red-500">Erros</span>
                    <span className="font-bold text-red-500">{resultado.erro}</span>
                  </div>
                )}
                {resultado.detalhes && resultado.detalhes.length > 0 && (
                  <div className="mt-2 text-xs text-red-500 bg-red-50 rounded-lg p-2 max-h-32 overflow-y-auto space-y-1">
                    {resultado.detalhes.map((d, i) => <div key={i}>{d}</div>)}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showCamera && (
        <CameraCaptureModal
          mode={mediaType === 'video' ? 'video' : 'photo'}
          onClose={() => setShowCamera(false)}
          onCapture={async (file) => { setShowCamera(false); await handleUploadMedia(file) }}
        />
      )}
    </div>
  )
}
