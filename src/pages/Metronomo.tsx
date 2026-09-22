import { useEffect, useRef, useState } from 'react'
import { Play, Pause, Minus, Plus } from 'lucide-react'

const BPM_MIN = 20
const BPM_MAX = 300
const TEMPOS = [
  { label: 'Largo', bpm: 50 },
  { label: 'Adagio', bpm: 70 },
  { label: 'Andante', bpm: 90 },
  { label: 'Moderato', bpm: 110 },
  { label: 'Allegro', bpm: 140 },
  { label: 'Presto', bpm: 180 },
]

export default function Metronomo() {
  const [bpm, setBpm] = useState(100)
  const [tocando, setTocando] = useState(false)
  const [volume, setVolume] = useState(80)
  const [compasso, setCompasso] = useState(4) // batidas por compasso
  const [batidaAtual, setBatidaAtual] = useState(0)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<number | null>(null)
  const proximaBatidaRef = useRef(0)
  const batidaIndexRef = useRef(0)

  function tocarClick(tempo: number, forte: boolean) {
    const ctx = audioCtxRef.current
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = forte ? 1000 : 800
    gain.gain.value = (volume / 100) * (forte ? 1 : 0.6)
    gain.gain.exponentialRampToValueAtTime(0.001, tempo + 0.05)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(tempo)
    osc.stop(tempo + 0.05)
  }

  function agendarBatidas() {
    const ctx = audioCtxRef.current
    if (!ctx) return
    const intervalo = 60 / bpm
    while (proximaBatidaRef.current < ctx.currentTime + 0.1) {
      const forte = batidaIndexRef.current % compasso === 0
      tocarClick(proximaBatidaRef.current, forte)
      const idx = batidaIndexRef.current % compasso
      const delay = (proximaBatidaRef.current - ctx.currentTime) * 1000
      setTimeout(() => setBatidaAtual(idx), Math.max(0, delay))
      proximaBatidaRef.current += intervalo
      batidaIndexRef.current += 1
    }
  }

  function iniciar() {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
    }
    batidaIndexRef.current = 0
    proximaBatidaRef.current = audioCtxRef.current.currentTime + 0.05
    setTocando(true)
  }

  function parar() {
    setTocando(false)
    setBatidaAtual(0)
    if (timerRef.current) window.clearInterval(timerRef.current)
  }

  useEffect(() => {
    if (!tocando) return
    agendarBatidas()
    timerRef.current = window.setInterval(agendarBatidas, 25)
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tocando, bpm, compasso, volume])

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    audioCtxRef.current?.close()
  }, [])

  function ajustarBpm(delta: number) {
    setBpm((b) => Math.min(BPM_MAX, Math.max(BPM_MIN, b + delta)))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Metrônomo</h1>
        <p className="text-gray-500 mt-1">Controle o tempo dos seus estudos</p>
      </div>

      <div className="bg-gray-900 rounded-2xl p-6 md:p-8 grid md:grid-cols-2 gap-8 items-center">
        {/* Controles */}
        <div className="space-y-6">
          <button
            onClick={tocando ? parar : iniciar}
            className="w-full flex items-center justify-center gap-2 bg-white text-gray-900 font-semibold py-3 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {tocando ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            {tocando ? 'Parar' : 'Iniciar'}
          </button>

          <div>
            <div className="flex items-center justify-between text-white mb-1">
              <span className="text-sm">Volume</span>
              <span className="text-sm">{volume}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-full accent-red-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-white mb-1">
              <span className="text-sm">Compasso</span>
              <span className="text-sm">{compasso}/4</span>
            </div>
            <div className="flex gap-2">
              {[2, 3, 4, 6].map((c) => (
                <button
                  key={c}
                  onClick={() => setCompasso(c)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                    compasso === c ? 'bg-brand-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Mostrador visual */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-52 h-52">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              {Array.from({ length: compasso }).map((_, i) => {
                const anguloTotal = 360 / compasso
                const inicio = i * anguloTotal
                const r = 42
                const toRad = (deg: number) => (deg * Math.PI) / 180
                const x1 = 50 + r * Math.cos(toRad(inicio + 2))
                const y1 = 50 + r * Math.sin(toRad(inicio + 2))
                const x2 = 50 + r * Math.cos(toRad(inicio + anguloTotal - 2))
                const y2 = 50 + r * Math.sin(toRad(inicio + anguloTotal - 2))
                const largeArc = anguloTotal > 180 ? 1 : 0
                return (
                  <path
                    key={i}
                    d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
                    stroke={i === batidaAtual && tocando ? '#84cc16' : '#f59e0b'}
                    strokeWidth={8}
                    fill="none"
                    strokeLinecap="round"
                    className="transition-colors duration-100"
                  />
                )
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
              <span className="text-4xl font-bold">{batidaAtual + 1}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => ajustarBpm(-1)}
              className="w-9 h-9 rounded-full bg-gray-700 text-white flex items-center justify-center hover:bg-gray-600"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="text-white font-bold text-2xl w-24 text-center">{bpm} BPM</span>
            <button
              onClick={() => ajustarBpm(1)}
              className="w-9 h-9 rounded-full bg-gray-700 text-white flex items-center justify-center hover:bg-gray-600"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <input
            type="range"
            min={BPM_MIN}
            max={BPM_MAX}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="w-full accent-brand-500"
          />
        </div>
      </div>

      {/* Atalhos de tempo */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <p className="text-sm font-medium text-gray-700 mb-3">Atalhos de andamento</p>
        <div className="flex flex-wrap gap-2">
          {TEMPOS.map((t) => (
            <button
              key={t.label}
              onClick={() => setBpm(t.bpm)}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-brand-100 hover:text-brand-700 transition-colors"
            >
              {t.label} <span className="text-gray-400">({t.bpm})</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
