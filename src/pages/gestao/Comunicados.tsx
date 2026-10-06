import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Megaphone, Send, Users, GraduationCap, RefreshCw, Paperclip, X, Camera, Circle, Square } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Toast } from '@/components/gestao/ui'
import { MEDIA_ACCEPT, uploadDisparoMedia } from '@/lib/disparosMedia'
import type { MediaType } from '@/lib/disparosMedia'

interface Comunicado {
  id: string
  titulo: string
  mensagem: string
  publico: string[]
  enviar_whatsapp: boolean
  total_destinatarios: number
  criado_por_nome: string | null
  criado_em: string
  anexo_url: string | null
  anexo_tipo: string | null
  instrumentos: string[] | null
}

const PUBLICO_LABEL: Record<string, string> = { alunos: 'Alunos', professores: 'Professores' }

export default function Comunicados() {
  const { perfil, hasRole } = useAuth()
  const podeEnviar = hasRole('admin', 'recepcao')

  const [historico, setHistorico] = useState<Comunicado[]>([])
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const [titulo, setTitulo] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [alvoAlunos, setAlvoAlunos] = useState(true)
  const [alvoProfessores, setAlvoProfessores] = useState(false)
  const [enviarWhatsapp, setEnviarWhatsapp] = useState(true)
  const [instrumentosDisponiveis, setInstrumentosDisponiveis] = useState<string[]>([])
  const [instrumentosFiltro, setInstrumentosFiltro] = useState<string[]>([])
  const [mediaType, setMediaType] = useState<MediaType | null>(null)
  const [mediaUrl, setMediaUrl] = useState('')
  const [uploadingMedia, setUploadingMedia] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const [cameraOn, setCameraOn] = useState(false)
  const [recording, setRecording] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('gestao_comunicados')
      .select('*')
      .order('criado_em', { ascending: false })
      .limit(50)
    setHistorico((data ?? []) as Comunicado[])
    setLoading(false)
  }, [])

  useEffect(() => { void carregar() }, [carregar])

  useEffect(() => {
    void (async () => {
      const [{ data: al }, { data: pr }] = await Promise.all([
        supabase.from('alunos').select('instrumentos').eq('status', 'ativo'),
        supabase.from('professores').select('instrumentos').eq('ativo', true),
      ])
      const set = new Set<string>()
      for (const row of [...(al ?? []), ...(pr ?? [])]) {
        for (const i of (row as { instrumentos: string[] | null }).instrumentos ?? []) set.add(i)
      }
      setInstrumentosDisponiveis(Array.from(set).sort())
    })()
  }, [])

  function toggleInstrumento(i: string) {
    setInstrumentosFiltro((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]))
  }

  async function handleUploadMedia(file: File | null) {
    if (!file || !mediaType) return
    setUploadingMedia(true)
    try {
      const result = await uploadDisparoMedia(supabase, mediaType, file)
      setMediaUrl(result.url)
    } catch (e) {
      alert('Erro ao enviar arquivo:\n' + (e as Error).message)
    } finally {
      setUploadingMedia(false)
    }
  }

  function desligarCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    recorderRef.current = null
    setCameraOn(false)
    setRecording(false)
  }

  useEffect(() => () => desligarCamera(), [])

  async function ligarCamera() {
    try {
      const constraints: MediaStreamConstraints =
        mediaType === 'audio' ? { audio: true } : { video: true, audio: mediaType === 'video' }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      if (videoRef.current && mediaType !== 'audio') {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraOn(true)
    } catch (e) {
      alert('Não foi possível acessar câmera/microfone:\n' + (e as Error).message)
    }
  }

  async function tirarFoto() {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(async (blob) => {
      if (!blob) return
      const file = new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' })
      await handleUploadMedia(file)
      desligarCamera()
    }, 'image/jpeg', 0.9)
  }

  function iniciarGravacao() {
    if (!streamRef.current || !mediaType) return
    chunksRef.current = []
    const mime = mediaType === 'audio' ? 'audio/webm' : 'video/webm'
    const recorder = new MediaRecorder(streamRef.current, { mimeType: mime })
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mime })
      const file = new File([blob], `${mediaType}-${Date.now()}.webm`, { type: mime })
      await handleUploadMedia(file)
      desligarCamera()
    }
    recorder.start()
    recorderRef.current = recorder
    setRecording(true)
  }

  function pararGravacao() {
    recorderRef.current?.stop()
    setRecording(false)
  }

  async function enviarWhatsappMedia(telefone: string) {
    let tel = telefone.replace(/\D/g, '')
    if (tel.length === 11) tel = `55${tel}`
    if (tel.length === 12) tel = tel.slice(0, 4) + '9' + tel.slice(4)
    if (tel.length !== 13) return false

    const { data: { session } } = await supabase.auth.getSession()
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    }
    const legenda = `📢 *${titulo}*\n\n${mensagem}`

    if (mediaType === 'audio' && mediaUrl.trim()) {
      const r = await fetch('/api/whatsapp-send', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ action: 'sendWhatsAppAudio', payload: { number: tel, audio: mediaUrl.trim() } }),
      })
      if (r.ok && (titulo.trim() || mensagem.trim())) {
        await fetch('/api/whatsapp-send', {
          method: 'POST', headers: authHeaders,
          body: JSON.stringify({ action: 'sendText', payload: { number: tel, text: legenda } }),
        })
      }
      return r.ok
    }
    if (mediaType && mediaUrl.trim()) {
      const r = await fetch('/api/whatsapp-send', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ action: 'sendMedia', payload: { number: tel, mediatype: mediaType, media: mediaUrl.trim(), caption: legenda } }),
      })
      return r.ok
    }
    return false
  }

  async function enviar() {
    if (!titulo.trim() || !mensagem.trim()) { alert('Preencha título e mensagem.'); return }
    if (!alvoAlunos && !alvoProfessores) { alert('Escolha pelo menos um público.'); return }

    setEnviando(true)
    try {
      const publico: string[] = []
      if (alvoAlunos) publico.push('alunos')
      if (alvoProfessores) publico.push('professores')

      let total = 0
      const temMidia = Boolean(mediaType && mediaUrl.trim())

      if (enviarWhatsapp) {
        const destinatarios: { telefone: string }[] = []

        if (alvoAlunos) {
          let q = supabase.from('alunos').select('telefone').eq('status', 'ativo')
          if (instrumentosFiltro.length > 0) q = q.overlaps('instrumentos', instrumentosFiltro)
          const { data: alunos } = await q
          for (const a of alunos ?? []) if (a.telefone) destinatarios.push({ telefone: a.telefone })
        }
        if (alvoProfessores) {
          let q = supabase.from('professores').select('telefone').eq('ativo', true)
          if (instrumentosFiltro.length > 0) q = q.overlaps('instrumentos', instrumentosFiltro)
          const { data: profs } = await q
          for (const p of profs ?? []) if (p.telefone) destinatarios.push({ telefone: p.telefone })
        }

        total = destinatarios.length
        if (total === 0) { alert('Nenhum destinatário com telefone cadastrado para o público escolhido.'); setEnviando(false); return }
        if (!confirm(`Enviar este comunicado por WhatsApp para ${total} destinatário(s)?`)) { setEnviando(false); return }

        if (temMidia) {
          // Mídia (imagem/vídeo/áudio) precisa de envio direto via Evolution API — a fila
          // disparos_pendentes (processada pelo GitHub Actions) só manda texto.
          let falhas = 0
          for (const d of destinatarios) {
            const ok = await enviarWhatsappMedia(d.telefone)
            if (!ok) falhas++
          }
          if (falhas > 0) alert(`${falhas} de ${total} envio(s) falharam.`)
        } else {
          const inserts = destinatarios.map((d) => ({
            tipo: 'comunicado_interno',
            canal: 'whatsapp',
            mensagem: `📢 *${titulo}*\n\n${mensagem}`,
            telefone_destinatario: d.telefone,
            status: 'pendente',
          }))
          const { error } = await supabase.from('disparos_pendentes').insert(inserts)
          if (error) throw new Error(error.message)
        }
      }

      const { error: errHist } = await supabase.from('gestao_comunicados').insert({
        titulo,
        mensagem,
        publico,
        enviar_whatsapp: enviarWhatsapp,
        total_destinatarios: total,
        criado_por_nome: perfil?.nome ?? null,
        anexo_url: temMidia ? mediaUrl.trim() : null,
        anexo_tipo: temMidia ? mediaType : null,
        instrumentos: instrumentosFiltro.length > 0 ? instrumentosFiltro : null,
      })
      if (errHist) throw new Error(errHist.message)

      setTitulo('')
      setMensagem('')
      setMediaType(null)
      setMediaUrl('')
      setInstrumentosFiltro([])
      setToast(enviarWhatsapp ? `Comunicado enviado para ${total} destinatário(s).` : 'Comunicado registrado no histórico.')
      void carregar()
    } catch (e) {
      alert('Erro ao enviar comunicado:\n' + (e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-brand-500" /> Comunicados
        </h1>
        <p className="text-sm text-gray-500">Mural de avisos que alunos e professores conferem dentro do sistema, com envio opcional também por WhatsApp para garantir que todos vejam.</p>
      </div>

      {podeEnviar && (
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título do comunicado"
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <textarea
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            placeholder="Escreva a mensagem..."
            rows={4}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={alvoAlunos} onChange={(e) => setAlvoAlunos(e.target.checked)} />
              <Users className="w-4 h-4 text-gray-500" /> Alunos (ativos)
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={alvoProfessores} onChange={(e) => setAlvoProfessores(e.target.checked)} />
              <GraduationCap className="w-4 h-4 text-gray-500" /> Professores
            </label>
            <label className="flex items-center gap-2 cursor-pointer ml-auto">
              <input type="checkbox" checked={enviarWhatsapp} onChange={(e) => setEnviarWhatsapp(e.target.checked)} />
              Enviar também por WhatsApp
            </label>
          </div>

          {instrumentosDisponiveis.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs text-gray-500">
                Restringir por instrumento (opcional — vazio = todos do público escolhido):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {instrumentosDisponiveis.map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleInstrumento(i)}
                    className={`px-2.5 py-1 rounded-full border text-xs ${instrumentosFiltro.includes(i) ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-300 text-gray-600'}`}
                  >
                    {i}
                  </button>
                ))}
                {instrumentosFiltro.length > 0 && (
                  <button type="button" onClick={() => setInstrumentosFiltro([])} className="flex items-center gap-1 text-gray-400 hover:text-gray-600 text-xs">
                    <X className="w-3.5 h-3.5" /> limpar
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">Anexo:</span>
              {(['image', 'video', 'audio'] as MediaType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { desligarCamera(); setMediaType(mediaType === t ? null : t); setMediaUrl('') }}
                  className={`px-2.5 py-1 rounded-full border ${mediaType === t ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-300 text-gray-600'}`}
                >
                  {t === 'image' ? 'Foto' : t === 'video' ? 'Vídeo' : 'Áudio'}
                </button>
              ))}
              {mediaType && (
                <button type="button" onClick={() => { desligarCamera(); setMediaType(null); setMediaUrl('') }} className="flex items-center gap-1 text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" /> remover
                </button>
              )}
            </div>

            {mediaType && !mediaUrl && (
              <div className="border rounded-lg p-3 bg-gray-50 space-y-2">
                {!cameraOn ? (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={ligarCamera}
                      className="flex items-center gap-2 px-3 py-1.5 bg-brand-500 text-white rounded-lg text-xs hover:bg-brand-600"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      {mediaType === 'audio' ? 'Ligar microfone' : 'Ligar câmera'}
                    </button>
                    <span className="text-xs text-gray-400">ou</span>
                    <label className="flex items-center gap-2 px-3 py-1.5 border rounded-lg text-xs cursor-pointer text-gray-600 hover:bg-white">
                      <Paperclip className="w-3.5 h-3.5" />
                      Enviar arquivo pronto
                      <input type="file" accept={MEDIA_ACCEPT[mediaType]} className="hidden" onChange={(e) => handleUploadMedia(e.target.files?.[0] || null)} />
                    </label>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {mediaType !== 'audio' && (
                      <video ref={videoRef} muted playsInline className="w-full max-w-sm rounded-lg bg-black" />
                    )}
                    <canvas ref={canvasRef} className="hidden" />
                    <div className="flex items-center gap-2">
                      {mediaType === 'image' ? (
                        <button type="button" onClick={tirarFoto} className="flex items-center gap-2 px-3 py-1.5 bg-brand-500 text-white rounded-lg text-xs hover:bg-brand-600">
                          <Camera className="w-3.5 h-3.5" /> Tirar foto
                        </button>
                      ) : !recording ? (
                        <button type="button" onClick={iniciarGravacao} className="flex items-center gap-2 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs hover:bg-red-600">
                          <Circle className="w-3.5 h-3.5 fill-current" /> {mediaType === 'audio' ? 'Gravar áudio' : 'Gravar vídeo'}
                        </button>
                      ) : (
                        <button type="button" onClick={pararGravacao} className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 text-white rounded-lg text-xs hover:bg-gray-900">
                          <Square className="w-3.5 h-3.5 fill-current" /> Parar gravação
                        </button>
                      )}
                      <button type="button" onClick={desligarCamera} className="px-3 py-1.5 border rounded-lg text-xs text-gray-600 hover:bg-white">
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {uploadingMedia && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Enviando...
              </div>
            )}
            {mediaUrl && !uploadingMedia && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-green-600">Pronto ✓</span>
                <button type="button" onClick={() => setMediaUrl('')} className="text-gray-400 hover:text-gray-600 underline">refazer</button>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              onClick={enviar}
              disabled={enviando}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-60"
            >
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Enviar comunicado
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="text-sm font-semibold text-gray-700">Histórico</h2>
          <button onClick={carregar} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg" title="Atualizar">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
          </div>
        ) : historico.length === 0 ? (
          <p className="text-sm text-gray-500 px-5 py-6 text-center">Nenhum comunicado enviado ainda.</p>
        ) : (
          <ul className="divide-y">
            {historico.map((c) => (
              <li key={c.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-gray-800 text-sm">{c.titulo}</span>
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {new Date(c.criado_em).toLocaleString('pt-BR')}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{c.mensagem}</p>
                {c.anexo_url && c.anexo_tipo === 'image' && (
                  <img src={c.anexo_url} alt="" className="mt-2 max-h-40 rounded-lg border" />
                )}
                {c.anexo_url && c.anexo_tipo === 'video' && (
                  <video src={c.anexo_url} controls className="mt-2 max-h-40 rounded-lg border" />
                )}
                {c.anexo_url && c.anexo_tipo === 'audio' && (
                  <audio src={c.anexo_url} controls className="mt-2 w-full max-w-xs" />
                )}
                <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-500">
                  {c.publico.map((p) => (
                    <span key={p} className="px-2 py-0.5 bg-gray-100 rounded-full">{PUBLICO_LABEL[p] ?? p}</span>
                  ))}
                  {(c.instrumentos ?? []).map((i) => (
                    <span key={i} className="px-2 py-0.5 bg-brand-50 text-brand-700 rounded-full">{i}</span>
                  ))}
                  {c.enviar_whatsapp && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full">WhatsApp · {c.total_destinatarios}</span>}
                  {c.criado_por_nome && <span>por {c.criado_por_nome}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {toast && <Toast mensagem={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
