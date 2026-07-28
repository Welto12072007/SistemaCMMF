import { useState, useRef, useEffect, useCallback } from 'react'
import { Mic, Square, Trash2, Play, Pause } from 'lucide-react'

interface AudioRecorderProps {
  onRecorded: (blob: Blob) => void
  disabled?: boolean
}

export default function AudioRecorder({ onRecorded, disabled }: AudioRecorderProps) {
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [permError, setPermError] = useState('')

  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (audioUrl) URL.revokeObjectURL(audioUrl)
      if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
        mediaRecRef.current.stop()
      }
    }
  }, [audioUrl])

  const startRecording = useCallback(async () => {
    setPermError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // Prefer webm/opus, fallback to whatever browser supports
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : ''

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        setAudioBlob(blob)
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)
      }

      recorder.start(250) // collect data every 250ms
      setRecording(true)
      setAudioBlob(null)
      if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null) }
      setElapsed(0)

      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)
    } catch {
      setPermError('Permissão de microfone negada. Habilite nas configurações do navegador.')
    }
  }, [audioUrl])

  const stopRecording = useCallback(() => {
    if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
      mediaRecRef.current.stop()
    }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setRecording(false)
  }, [])

  const discardRecording = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioBlob(null)
    setAudioUrl(null)
    setElapsed(0)
    setPlaying(false)
  }, [audioUrl])

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return
    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
    } else {
      audioRef.current.play()
      setPlaying(true)
    }
  }, [playing])

  const handleUse = useCallback(() => {
    if (audioBlob) onRecorded(audioBlob)
  }, [audioBlob, onRecorded])

  function fmt(s: number) {
    const m = Math.floor(s / 60)
    const ss = s % 60
    return `${m}:${ss.toString().padStart(2, '0')}`
  }

  return (
    <div className="space-y-2">
      {/* Recording controls */}
      {!audioBlob && (
        <div className="flex items-center gap-3">
          {!recording ? (
            <button
              type="button"
              onClick={startRecording}
              disabled={disabled}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50 text-sm font-medium"
            >
              <Mic className="w-4 h-4" />
              Gravar áudio
            </button>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                <span className="text-sm font-mono text-red-600 font-medium">{fmt(elapsed)}</span>
              </div>
              <button
                type="button"
                onClick={stopRecording}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-700 text-white hover:bg-gray-800 transition-colors text-sm font-medium"
              >
                <Square className="w-3.5 h-3.5" />
                Parar
              </button>
            </>
          )}
        </div>
      )}

      {/* Playback + actions */}
      {audioBlob && audioUrl && (
        <div className="flex items-center gap-2 bg-gray-50 border rounded-lg px-3 py-2">
          <audio
            ref={audioRef}
            src={audioUrl}
            onEnded={() => setPlaying(false)}
            className="hidden"
          />
          <button
            type="button"
            onClick={togglePlay}
            className="p-1.5 rounded-full bg-brand-100 text-brand-600 hover:bg-brand-200 transition-colors"
          >
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <span className="text-xs text-gray-600 font-mono">{fmt(elapsed)}</span>
          <span className="text-xs text-gray-400">•</span>
          <span className="text-xs text-gray-500">
            {(audioBlob.size / 1024).toFixed(0)} KB
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleUse}
            disabled={disabled}
            className="text-xs px-3 py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 font-medium"
          >
            Usar este áudio
          </button>
          <button
            type="button"
            onClick={discardRecording}
            className="p-1.5 rounded-full text-red-500 hover:bg-red-50 transition-colors"
            title="Descartar"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {permError && (
        <p className="text-xs text-red-500">{permError}</p>
      )}
    </div>
  )
}
