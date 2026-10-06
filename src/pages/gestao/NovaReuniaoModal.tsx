import { useMemo, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  COR_CHIP, hojeSP,
  type GestaoContexto, type GestaoProjeto, type GestaoTipoReuniao,
} from '@/lib/gestao'

const campo = 'w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30'

export default function NovaReuniaoModal({ ctx, tipos, projetos, onClose, onCriada }: {
  ctx: GestaoContexto
  tipos: GestaoTipoReuniao[]
  projetos: GestaoProjeto[]
  onClose: () => void
  onCriada: (mensagem: string) => void
}) {
  const hoje = hojeSP()
  const [tipoId, setTipoId] = useState(tipos[0]?.id ?? '')
  const tipo = tipos.find((t) => t.id === tipoId)

  const [titulo, setTitulo] = useState('')
  const [projetoId, setProjetoId] = useState('')
  const [data, setData] = useState(hoje)
  const [hora, setHora] = useState('09:00')
  const [duracao, setDuracao] = useState(tipo?.duracao_padrao_min ?? 60)
  const [local, setLocal] = useState('')
  const [link, setLink] = useState('')
  const [participantes, setParticipantes] = useState<string[]>(tipo?.participantes_padrao ?? [])
  const [pautas, setPautas] = useState<string[]>(tipo?.pauta_padrao ?? [])
  const [novaPauta, setNovaPauta] = useState('')
  const [recorrente, setRecorrente] = useState(false)
  const [frequencia, setFrequencia] = useState<'semanal' | 'quinzenal' | 'mensal'>('semanal')
  const [dataFim, setDataFim] = useState('')
  const [salvando, setSalvando] = useState(false)

  const membrosAtivos = useMemo(() => ctx.membros.filter((m) => m.ativo), [ctx.membros])

  function escolherTipo(id: string) {
    setTipoId(id)
    const t = tipos.find((x) => x.id === id)
    if (!t) return
    setDuracao(t.duracao_padrao_min)
    setParticipantes(t.participantes_padrao)
    setPautas(t.pauta_padrao)
  }

  function alternarParticipante(id: string) {
    setParticipantes((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  function adicionarPauta() {
    if (!novaPauta.trim()) return
    setPautas((p) => [...p, novaPauta.trim()])
    setNovaPauta('')
  }

  const faltando = [
    !titulo.trim() && 'o título',
    !tipoId && 'o tipo',
    !data && 'a data',
    !hora && 'a hora',
  ].filter(Boolean) as string[]

  async function salvar() {
    if (faltando.length) return
    setSalvando(true)
    try {
      if (recorrente) {
        const { error } = await supabase.from('gestao_reuniao_series').insert({
          titulo: titulo.trim(),
          tipo_id: tipoId,
          projeto_id: projetoId || null,
          frequencia,
          data_inicio: data,
          data_fim: dataFim || null,
          hora_inicio: hora,
          duracao_min: duracao,
          local: local.trim() || null,
          link: link.trim() || null,
          participantes,
        })
        if (error) throw new Error(error.message)
        onCriada('Série de reuniões criada — as próximas ocorrências já foram geradas.')
        return
      }

      const { data: reuniao, error } = await supabase
        .from('gestao_reunioes')
        .insert({
          titulo: titulo.trim(),
          tipo_id: tipoId,
          projeto_id: projetoId || null,
          data,
          hora_inicio: hora,
          duracao_prevista_min: duracao,
          local: local.trim() || null,
          link: link.trim() || null,
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)

      if (participantes.length) {
        const { error: errPart } = await supabase.from('gestao_reuniao_participantes')
          .insert(participantes.map((membro_id) => ({ reuniao_id: reuniao.id, membro_id })))
        if (errPart) throw new Error(errPart.message)
      }
      if (pautas.length) {
        const { error: errPauta } = await supabase.from('gestao_pautas')
          .insert(pautas.map((t, i) => ({ reuniao_id: reuniao.id, titulo: t, posicao: i })))
        if (errPauta) throw new Error(errPauta.message)
      }
      onCriada('Reunião criada.')
    } catch (e) {
      alert('Erro:\n' + (e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">Nova reunião</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg" aria-label="Fechar"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500">Tipo</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {tipos.map((t) => (
                <button
                  key={t.id}
                  onClick={() => escolherTipo(t.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                    tipoId === t.id ? 'border-transparent text-white' : 'border-gray-300 text-gray-600'
                  }`}
                  style={tipoId === t.id ? { backgroundColor: t.cor ?? '#53d5fd' } : undefined}
                >
                  {t.nome}
                </button>
              ))}
            </div>
          </div>

          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título da reunião" className={campo} />

          <select value={projetoId} onChange={(e) => setProjetoId(e.target.value)} className={`${campo} bg-white`}>
            <option value="">Sem projeto</option>
            {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500">Data</label>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={campo} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Hora</label>
              <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={campo} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Duração (min)</label>
              <input type="number" min={5} value={duracao} onChange={(e) => setDuracao(Number(e.target.value))} className={campo} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Local (opcional)" className={campo} />
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link (opcional)" className={campo} />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">Participantes</label>
            <div className="flex flex-wrap gap-1.5 mt-1 max-h-28 overflow-y-auto">
              {membrosAtivos.map((m) => (
                <button
                  key={m.id}
                  onClick={() => alternarParticipante(m.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                    participantes.includes(m.id) ? `border-transparent ${COR_CHIP.blue}` : 'border-gray-300 text-gray-500'
                  }`}
                >
                  {m.nome}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">Pautas</label>
            <ul className="space-y-1 mt-1">
              {pautas.map((p, i) => (
                <li key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-2.5 py-1.5 text-sm">
                  {p}
                  <button onClick={() => setPautas((arr) => arr.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2 mt-1.5">
              <input
                value={novaPauta}
                onChange={(e) => setNovaPauta(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && adicionarPauta()}
                placeholder="Adicionar tema de pauta"
                className={campo}
              />
              <button onClick={adicionarPauta} className="px-3 py-2 bg-gray-100 rounded-lg text-sm font-medium text-gray-700 shrink-0">
                + Pauta
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 pt-1">
            <input type="checkbox" checked={recorrente} onChange={(e) => setRecorrente(e.target.checked)} />
            Recorrente (gera as próximas ocorrências automaticamente)
          </label>
          {recorrente && (
            <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-lg p-3">
              <select value={frequencia} onChange={(e) => setFrequencia(e.target.value as typeof frequencia)} className={`${campo} bg-white`}>
                <option value="semanal">Semanal</option>
                <option value="quinzenal">Quinzenal</option>
                <option value="mensal">Mensal</option>
              </select>
              <div>
                <label className="text-xs font-medium text-gray-500">Até (opcional)</label>
                <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className={campo} />
              </div>
            </div>
          )}
        </div>

        {faltando.length > 0 && (
          <p className="text-xs text-amber-700 mt-3">Falta preencher: {faltando.join(', ')}.</p>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100">Cancelar</button>
          <button
            onClick={salvar}
            disabled={salvando || faltando.length > 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
          >
            {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
            Criar reunião
          </button>
        </div>
      </div>
    </div>
  )
}
