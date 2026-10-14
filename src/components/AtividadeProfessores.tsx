import { useEffect, useMemo, useState } from 'react'
import { CalendarOff, CalendarClock, Repeat, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Evento {
  key: string
  quando: string
  tipo: 'ausencia' | 'remarcacao' | 'reposicao'
  titulo: string
  detalhe: string
}

const PERIODOS: Record<string, string> = { dia: 'dia todo', manha: 'manhã', tarde: 'tarde', noite: 'noite' }
const STATUS_REP: Record<string, string> = {
  aguardando_confirmacao: 'aguardando aceite', agendada: 'aceita/agendada', realizada: 'realizada',
  pendente: 'recusada/pendente', cancelada: 'cancelada', expirada: 'expirada',
}
const fmt = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7)

export default function AtividadeProfessores() {
  const [eventos, setEventos] = useState<Evento[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<'todos' | Evento['tipo']>('todos')

  useEffect(() => {
    const desde = new Date(Date.now() - 45 * 86400000).toISOString()
    Promise.all([
      supabase.from('ausencias_professor')
        .select('id,data_ausencia,periodo,motivo,created_at,professor:professores(nome),registrador:perfis!ausencias_professor_registrado_por_fkey(nome,role)')
        .gte('created_at', desde),
      supabase.from('remarcacoes')
        .select('id,data_original,data_nova,hora_nova,created_at,aluno:alunos(nome),agendamento:agendamentos(professor:professores(nome))')
        .eq('solicitado_por', 'professor').gte('created_at', desde),
      supabase.from('reposicoes')
        .select('id,aluno_nome,status,data_reposicao,hora_reposicao,created_at,updated_at,professor:professores!reposicoes_professor_id_fkey(nome),substituto:professores!reposicoes_professor_reposicao_id_fkey(nome)')
        .not('professor_reposicao_id', 'is', null).gte('created_at', desde),
    ]).then(([a, r, p]) => {
      const lista: Evento[] = []
      ;((a.data ?? []) as any[]).forEach(x => {
        const por = x.registrador?.role === 'professor' ? 'pelo próprio professor' : `por ${x.registrador?.nome ?? 'staff'}`
        lista.push({
          key: 'a' + x.id, quando: x.created_at, tipo: 'ausencia',
          titulo: `${x.professor?.nome ?? 'Professor'} ausente em ${fmt(x.data_ausencia)} (${PERIODOS[x.periodo] ?? x.periodo})`,
          detalhe: `Registrado ${por}${x.motivo ? ` • Motivo: ${x.motivo}` : ''}`,
        })
      })
      ;((r.data ?? []) as any[]).forEach(x => {
        lista.push({
          key: 'r' + x.id, quando: x.created_at, tipo: 'remarcacao',
          titulo: `${x.agendamento?.professor?.nome ?? 'Professor'} remarcou ${x.aluno?.nome ?? 'aluno'}`,
          detalhe: `${fmt(x.data_original)} → ${fmt(x.data_nova)}${x.hora_nova ? ' às ' + x.hora_nova.slice(0, 5) : ''}`,
        })
      })
      ;((p.data ?? []) as any[]).forEach(x => {
        lista.push({
          key: 'p' + x.id, quando: x.updated_at ?? x.created_at, tipo: 'reposicao',
          titulo: `Troca de professor: ${x.aluno_nome} — ${x.professor?.nome ?? '?'} → ${x.substituto?.nome ?? '?'}`,
          detalhe: `Situação: ${STATUS_REP[x.status] ?? x.status}${x.data_reposicao ? ` • ${fmt(x.data_reposicao)} ${(x.hora_reposicao ?? '').slice(0, 5)}` : ''}`,
        })
      })
      lista.sort((m, n) => n.quando.localeCompare(m.quando))
      setEventos(lista)
      setLoading(false)
    })
  }, [])

  const visiveis = useMemo(() => eventos.filter(e => filtro === 'todos' || e.tipo === filtro), [eventos, filtro])
  const icone = (t: Evento['tipo']) =>
    t === 'ausencia' ? <CalendarOff className="w-4 h-4 text-orange-500" />
    : t === 'remarcacao' ? <CalendarClock className="w-4 h-4 text-blue-500" />
    : <Repeat className="w-4 h-4 text-purple-500" />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {([['todos', 'Tudo'], ['ausencia', 'Ausências'], ['remarcacao', 'Remarcações'], ['reposicao', 'Trocas de professor']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFiltro(k)}
            className={`text-xs px-3 py-1.5 rounded-full border ${filtro === k ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-gray-200'}`}>
            {l}
          </button>
        ))}
        <span className="text-xs text-gray-400 self-center">últimos 45 dias</span>
      </div>
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>
        ) : visiveis.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Nenhuma atividade dos professores no período.</div>
        ) : (
          <ul className="divide-y">
            {visiveis.map(e => (
              <li key={e.key} className="p-4 flex gap-3">
                <div className="mt-0.5">{icone(e.tipo)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{e.titulo}</p>
                  <p className="text-xs text-gray-500">{e.detalhe}</p>
                </div>
                <span className="text-xs text-gray-400 shrink-0">{new Date(e.quando).toLocaleString('pt-BR')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
