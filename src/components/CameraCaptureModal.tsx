import { useEffect, useRef, useState } from 'react'
import { Camera, StopCircle, Video, X } from 'lucide-react'

interface CameraCaptureModalProps {
  mode: 'photo' | 'video'
  onClose: () => void
  onCapture: (file: File) => void
}

export default function CameraCaptureModal({ mode, onClose, onCapture }: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const [error, setError] = useState('')
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: mode === 'video',
        })
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      } catch {
        setError('Não foi possível acessar a câmera. Verifique as permissões do navegador.')
      }
    }
    void start()
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [mode])

  function tirarFoto() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) return
      const file = new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' })
      onCapture(file)
    }, 'image/jpeg', 0.9)
  }

  function iniciarGravacao() {
    const stream = streamRef.current
    if (!stream) return
    chunksRef.current = []
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' })
      const file = new File([blob], `video-${Date.now()}.webm`, { type: 'video/webm' })
      onCapture(file)
    }
    recorder.start()
    recorderRef.current = recorder
    setRecording(true)
    setSeconds(0)
    const timer = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= 60) { pararGravacao(); return s }
        return s + 1
      })
    }, 1000)
    ;(recorder as any)._timer = timer
  }

  function pararGravacao() {
    const recorder = recorderRef.current
    if (!recorder) return
    if ((recorder as any)._timer) clearInterval((recorder as any)._timer)
    if (recorder.state !== 'inactive') recorder.stop()
    setRecording(false)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]" onClick={onClose}>
      <div className="bg-white rounded-xl p-4 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Camera className="w-4 h-4" /> {mode === 'video' ? 'Gravar vídeo' : 'Tirar foto'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
        </div>

        {error ? (
          <p className="text-sm text-red-600 py-8 text-center">{error}</p>
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-lg bg-black aspect-video object-cover" />
            {recording && (
              <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" /> Gravando... {seconds}s / 60s
              </p>
            )}
            <div className="flex justify-center gap-3 mt-4">
              {mode === 'photo' ? (
                <button onClick={tirarFoto} className="flex items-center gap-2 bg-brand-500 text-white px-5 py-2.5 rounded-lg hover:bg-brand-600">
                  <Camera className="w-4 h-4" /> Capturar foto
                </button>
              ) : recording ? (
                <button onClick={pararGravacao} className="flex items-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded-lg hover:bg-red-700">
                  <StopCircle className="w-4 h-4" /> Parar gravação
                </button>
              ) : (
                <button onClick={iniciarGravacao} className="flex items-center gap-2 bg-brand-500 text-white px-5 py-2.5 rounded-lg hover:bg-brand-600">
                  <Video className="w-4 h-4" /> Iniciar gravação
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
