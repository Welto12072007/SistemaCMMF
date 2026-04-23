import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  Calendar,
  Clock,
  User,
  AlertCircle,
  CheckCircle2,
  Info,
  ChevronRight,
} from 'lucide-react'

interface AulaAgendada {
  id: string
  professor_id: string | null
  data_aula: string
  hora_inicio: string
  hora_fim: string
  instrumento: string
  professor_nome: string
  tipo: string
  observacoes?: string
  status: string
}

interface HorarioDisponivel {
  id: string
  professor_id: string
  professor_nome: string
  dia_semana: number
  hora_inicio: string
  hora_fim: string
  instrumento: string
  vagas_disponiveis: number
  data_concreta: string // YYYY-MM-DD da data específica deste slot
}

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const SEMANAS_FUTURO = 4 // mostrar próximas 4 semanas

export default function PortalAluno() {
  const { perfil } = useAuth()
  const [aulas, setAulas] = useState<AulaAgendada[]>([])
  const [loading, setLoading] = useState(true)
  const [remarcandoId, setRemarcandoId] = useState<string | null>(null)
  const [horariosDisponiveis, setHorariosDisponiveis] = useState<HorarioDisponivel[]>([])
  const [ultimaRemarcacao, setUltimaRemarcacao] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)

  useEffect(() => {
    loadAulas()
    loadUltimaRemarcacao()
  }, [perfil?.id])

  async function loadAulas() {
    if (!perfil?.id) return
    setLoading(true)

    const { data: alunoRes } = await supabase
      .from('alunos')
      .select('id')
      .eq('email', perfil.email)
      .single()

    if (!alunoRes) {
      setLoading(false)
      return
    }

    const { data } = await supabase
      .from('agendamentos')
      .select('*, professor:professores(nome)')
      .eq('aluno_id', alunoRes.id)
      .gte('data_aula', new Date().toISOString().slice(0, 10))
      .neq('status', 'cancelado')
      .order('data_aula', { ascending: true })

    if (data) {
      setAulas(
        data.map((a: any) => ({
          ...a,
          professor_id: a.professor_id ?? null,
          professor_nome: (a.professor as any)?.nome || '—',
        }))
      )
    }

    setLoading(false)
  }

  async function loadUltimaRemarcacao() {
    if (!perfil?.id) return

    const { data: alunoRes } = await supabase
      .from('alunos')
      .select('id')
      .eq('email', perfil.email)
      .single()

    if (!alunoRes) return

    const inicioMes = new Date()
    inicioMes.setDate(1)
    inicioMes.setHours(0, 0, 0, 0)

    const { data: remarcs } = await supabase
      .from('remarcacoes')
      .select('created_at')
      .eq('aluno_id', alunoRes.id)
      .in('status', ['solicitada', 'aprovada', 'concluida'])
      .gte('created_at', inicioMes.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)

    if (remarcs && remarcs[0]?.created_at) {
      setUltimaRemarcacao(remarcs[0].created_at)
    } else {
      setUltimaRemarcacao(null)
    }
  }

  async function loadHorariosDisp(instrumento: string, professorId: string) {
    if (!professorId) {
      setHorariosDisponiveis([])
      return
    }

    const hoje = new Date()
    const proximas4semanas: HorarioDisponivel[] = []

    for (let i = 0; i < SEMANAS_FUTURO * 7; i++) {
      const data = new Date(hoje)
      data.setDate(data.getDate() + i + 1) // começar amanhã
      const diaSemana = data.getDay()

      // Buscar horários disponíveis para este dia da semana
      const { data: hors } = await supabase
        .from('horarios_disponiveis')
        .select('*')
        .eq('professor_id', professorId)
        .eq('dia_semana', diaSemana)
        .eq('instrumento', instrumento)
        .eq('ativo', true)

      if (hors) {
        const professorRes = await supabase
          .from('professores')
          .select('nome')
          .eq('id', professorId)
          .single()

        for (const h of hors) {
          // Contar quantas aulas já estão agendadas nesse horário nessa data
          const { count } = await supabase
            .from('agendamentos')
            .select('id', { count: 'exact' })
            .eq('horario_id', h.id)
            .eq('data_aula', data.toISOString().slice(0, 10))
            .neq('status', 'cancelado')

          const vagas = (h.max_alunos || 1) - (count || 0)
          if (vagas > 0) {
            proximas4semanas.push({
              id: h.id,
              professor_id: professorId,
              professor_nome: (professorRes.data as any)?.nome || '—',
              dia_semana: diaSemana,
              hora_inicio: h.hora_inicio,
              hora_fim: h.hora_fim,
              instrumento: h.instrumento,
              vagas_disponiveis: vagas,
              data_concreta: data.toISOString().slice(0, 10),
            })
          }
        }
      }
    }

    setHorariosDisponiveis(proximas4semanas)
  }

  async function handleRemarcar(aula: AulaAgendada, slotKey: string) {
    // slotKey = `${horario_id}__${data_concreta}`
    const slot = horariosDisponiveis.find((h) => `${h.id}__${h.data_concreta}` === slotKey)
    if (!slot) {
      setMensagem({ tipo: 'erro', texto: 'Horário inválido. Recarregue e tente novamente.' })
      return
    }

    const { data, error } = await supabase.rpc('remarcar_aula', {
      p_agendamento_id: aula.id,
      p_horario_id_novo: slot.id,
      p_data_nova: slot.data_concreta,
      p_solicitado_por: 'aluno',
      p_motivo: null,
    })

    if (error) {
      console.error('[PortalAluno] remarcar_aula error:', error)
      setMensagem({ tipo: 'erro', texto: `Erro: ${error.message}` })
      return
    }

    const result = data as { ok: boolean; mensagem: string }
    if (!result?.ok) {
      setMensagem({ tipo: 'erro', texto: result?.mensagem || 'Não foi possível remarcar.' })
      return
    }

    setMensagem({ tipo: 'sucesso', texto: result.mensagem })
    setRemarcandoId(null)
    setHorariosDisponiveis([])
    loadAulas()
    loadUltimaRemarcacao()

    setTimeout(() => setMensagem(null), 4000)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Carregando suas aulas...</p>
        </div>
      </div>
    )
  }

  const podeRemarcar = !ultimaRemarcacao

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Minhas Aulas</h1>
        <p className="text-gray-500 mt-1">Veja seus agendamentos e remarque quando necessário</p>
      </div>

      {/* Mensagens */}
      {mensagem && (
        <div
          className={`rounded-xl p-4 flex items-start gap-3 ${
            mensagem.tipo === 'sucesso'
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}
        >
          {mensagem.tipo === 'sucesso' ? (
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          )}
          <p
            className={`text-sm ${
              mensagem.tipo === 'sucesso' ? 'text-green-700' : 'text-red-700'
            }`}
          >
            {mensagem.texto}
          </p>
        </div>
      )}

      {/* Regras */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700">
          <p className="font-medium">Como remarcar:</p>
          <ul className="mt-1 space-y-1 text-xs">
            <li>✓ Máximo <strong>1 remarcação por mês</strong></li>
            <li>✓ Avisar com <strong>24h antecedência</strong></li>
            <li>✓ Mesma duração e instrumento</li>
          </ul>
        </div>
      </div>

      {/* Aulas */}
      {aulas.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 font-medium">Nenhuma aula agendada</p>
          <p className="text-sm text-gray-400 mt-1">
            Entre em contato com o Centro de Música Murilo Finger para agendar sua aula
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {aulas.map((aula) => {
            const dataAula = new Date(aula.data_aula + 'T12:00:00')
            const agora = new Date()
            const podRemarcar = podeRemarcar && dataAula.getTime() - agora.getTime() > 24 * 60 * 60 * 1000
            const diasAte = Math.ceil((dataAula.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24))

            return (
              <div
                key={aula.id}
                className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-center bg-brand-50 rounded-lg px-3 py-2 min-w-fit">
                      <p className="text-xs text-gray-500 uppercase">
                        {DIAS_SEMANA[dataAula.getDay()]}
                      </p>
                      <p className="text-xl font-bold text-brand-600">
                        {dataAula.getDate()}
                      </p>
                      <p className="text-xs text-gray-400">
                        {dataAula.toLocaleDateString('pt-BR', { month: 'short' })}
                      </p>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{aula.instrumento}</h3>
                      <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                        <User className="w-3 h-3" /> {aula.professor_nome}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                    {diasAte} dias
                  </span>
                </div>

                <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {aula.hora_inicio?.slice(0, 5)} - {aula.hora_fim?.slice(0, 5)}
                  </span>
                  <span className="capitalize text-xs bg-gray-100 px-2 py-0.5 rounded">
                    {aula.tipo === 'aula_experimental' ? 'Experimental' : 'Aula'}
                  </span>
                </div>

                {aula.observacoes && (
                  <p className="text-xs text-gray-500 mb-3 italic">{aula.observacoes}</p>
                )}

                {/* Remarcar */}
                {remarcandoId === aula.id ? (
                  <RescheduleModal
                    aula={aula}
                    horariosDisponiveis={horariosDisponiveis}
                    onRemarcar={(horarioId) => handleRemarcar(aula, horarioId)}
                    onCancel={() => setRemarcandoId(null)}
                    loading={horariosDisponiveis.length === 0 && remarcandoId === aula.id}
                  />
                ) : (
                  <button
                    onClick={() => {
                      setRemarcandoId(aula.id)
                      loadHorariosDisp(aula.instrumento, aula.professor_id || '')
                    }}
                    disabled={!podRemarcar}
                    className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    title={
                      !podeRemarcar
                        ? 'Você já remarcou uma aula este mês'
                        : !podRemarcar && diasAte < 1
                        ? 'Precisa avisar com 24h antecedência'
                        : ''
                    }
                  >
                    {!podeRemarcar ? (
                      <span className="text-gray-400 cursor-not-allowed">
                        Já remarcou este mês
                      </span>
                    ) : !podRemarcar ? (
                      <span className="text-gray-400 cursor-not-allowed">
                        Muito perto para remarcar
                      </span>
                    ) : (
                      <>
                        <Calendar className="w-4 h-4" />
                        Remarcar aula
                      </>
                    )}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function RescheduleModal({
  aula,
  horariosDisponiveis,
  onRemarcar,
  onCancel,
  loading,
}: {
  aula: AulaAgendada
  horariosDisponiveis: HorarioDisponivel[]
  onRemarcar: (horarioId: string) => void
  onCancel: () => void
  loading: boolean
}) {
  const [selecionado, setSelecionado] = useState<string | null>(null)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <h2 className="text-lg font-bold mb-1">Remarcar Aula</h2>
        <p className="text-sm text-gray-500 mb-4">
          {aula.instrumento} com {aula.professor_nome}
        </p>

        {loading ? (
          <div className="text-center py-8">
            <div className="w-6 h-6 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm text-gray-500">Carregando horários disponíveis...</p>
          </div>
        ) : horariosDisponiveis.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Nenhum horário disponível nos próximos dias</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {horariosDisponiveis.map((h) => {
                const [y, m, d] = h.data_concreta.split('-')
                const slotKey = `${h.id}__${h.data_concreta}`
                return (
                  <button
                    key={slotKey}
                    onClick={() => setSelecionado(slotKey)}
                    className={`p-3 border rounded-lg text-left transition-colors ${
                      selecionado === slotKey
                        ? 'bg-brand-50 border-brand-300'
                        : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="font-medium text-sm text-gray-900">
                      {DIAS_SEMANA[h.dia_semana]} {d}/{m}/{y}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {h.hora_inicio.slice(0, 5)} - {h.hora_fim.slice(0, 5)}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {h.vagas_disponiveis > 1 ? `${h.vagas_disponiveis} vagas` : '1 vaga'}
                    </p>
                  </button>
                )
              })}
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => selecionado && onRemarcar(selecionado)}
                disabled={!selecionado}
                className="px-4 py-2 text-sm text-white bg-brand-500 hover:bg-brand-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <ChevronRight className="w-4 h-4" />
                Confirmar Remarcação
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
