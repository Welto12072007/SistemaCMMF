import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { splitNomesGrupo } from '@/lib/utils'
import {
  CheckCircle2, XCircle, Clock, ChevronLeft, ChevronRight,
  BookOpen, DollarSign, CalendarCheck, Loader2, AlertCircle,
  ClipboardCheck, MinusCircle, CalendarDays, Users, KeyRound,
  Music2, Eye, EyeOff, StickyNote, CalendarRange, Sparkles,
  ChevronDown, ChevronUp, Plus, Send, PlusCircle, X, FileText, Repeat,
} from 'lucide-react'

interface AulaItem {
  id: string; horario_id: string; aluno_nome: string; instrumento: string
  hora_inicio: string; hora_fim: string; presente: boolean | null
  tipo_falta: string; observacoes: string; presenca_id?: string
  is_experimental?: boolean; experimental_id?: string
  tipo_aula: 'individual' | 'grupo'
}
interface RegistroMes {
  data: string; aluno_nome: string; instrumento: string
  presente: boolean; tipo_falta: string | null; observacoes: string | null
}
interface HorarioGrade {
  id: string; dia_semana: string; hora_inicio: string; hora_fim: string
  aluno_nome: string; instrumento: string; tipo: string | null; created_at: string
}
interface Anotacao {
  id: string; aluno_nome: string; conteudo: string; criado_em: string
}
interface ReposicaoPendente {
  id: string; aluno_nome: string; instrumento: string | null
  data_reposicao: string; hora_reposicao: string
}

const DIAS_SEMANA = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']
const DIAS_ORDEM = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado']
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
// Padrão da equipe para honorário extra (proporcional à duração)
const VALOR_HORA_EXTRA = 26.66
const TIPOS_FALTA = [
  { value: 'falta_injustificada', label: 'Faltou sem avisar' },
  { value: 'falta_justificada', label: 'Faltou com aviso' },
  { value: 'cancelou_avisou', label: 'Aula cancelada (avisou)' },
  { value: 'cancelou_professor', label: 'Cancelado pelo professor' },
]

function fmtData(iso: string) { const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}` }
function fmtMoeda(v: number) { return v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) }
function fmtHora(t: string) { return t?.slice(0,5)??'' }
function iniciais(nome: string) { return nome.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase() }

type TabKey = 'chamada'|'agenda'|'alunos'|'mes'

interface PropostaExtra {
  id: string
  data_aula: string
  hora_inicio: string
  hora_fim: string
  aluno_nome: string
  instrumento?: string
  justificativa: string
  valor_extra: number
  status: 'pendente' | 'aprovada' | 'rejeitada'
  observacao_admin?: string
  criado_em: string
}

export default function PortalProfessor() {
  const { perfil } = useAuth()
  const professor_id = perfil?.professor_id ?? null

  const [searchParams, setSearchParams] = useSearchParams()
  const tab = (searchParams.get('tab') ?? 'chamada') as TabKey
  function setTab(t: TabKey) { setSearchParams({ tab: t }) }

  const [nomeProfessor, setNomeProfessor] = useState('')
  const [instrumentosProfessor, setInstrumentosProfessor] = useState<string[]>([])
  const [valorHoraAula, setValorHoraAula] = useState(0)

  // chamada
  const [dataAtual, setDataAtual] = useState(new Date().toISOString().slice(0,10))
  const [aulas, setAulas] = useState<AulaItem[]>([])
  const [loadingChamada, setLoadingChamada] = useState(false)
  const [modal, setModal] = useState<{item:AulaItem;presente:boolean;tipoFalta:string}|null>(null)
  const [obsTexto, setObsTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  // Chamada em grupo: mostrada inline na própria lista (sem popup). Presença é
  // individual por aluno; observação pedagógica é opcional e única pra turma toda.
  const [rascunhoGrupo, setRascunhoGrupo] = useState<Record<string, {
    presencaPorId: Record<string, boolean | null>
    tipoFaltaPorId: Record<string, string>
    obs: string
  }>>({})
  const [salvandoGrupoId, setSalvandoGrupoId] = useState<string | null>(null)

  // grade / alunos
  const [grade, setGrade] = useState<HorarioGrade[]>([])
  const [loadingGrade, setLoadingGrade] = useState(false)

  // meu mês
  const [mesSel, setMesSel] = useState(new Date().getMonth()+1)
  const [anoSel, setAnoSel] = useState(new Date().getFullYear())
  const [registrosMes, setRegistrosMes] = useState<RegistroMes[]>([])
  const [reposRealizadasMes, setReposRealizadasMes] = useState(0)
  const [loadingMes, setLoadingMes] = useState(false)

  // alterar senha
  const [showSenha, setShowSenha] = useState(false)
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [showNova, setShowNova] = useState(false)
  const [showConf, setShowConf] = useState(false)
  const [salvandoSenha, setSalvandoSenha] = useState(false)
  const [senhaSucesso, setSenhaSucesso] = useState(false)
  const [senhaErro, setSenhaErro] = useState('')

  // agenda
  const [semanaOffset, setSemanaOffset] = useState(0)
  const [experimentaisAgenda, setExperimentaisAgenda] = useState<{id:string;nome:string;instrumento:string;hora_inicio:string;hora_fim:string;data_aula:string;status:string}[]>([])
  const [feriadosSemana, setFeriadosSemana] = useState<Record<string,{titulo:string;tipo:string}>>({})

  // feriado/recesso no dia da chamada (explica por que não tem aula, em vez de sumir)
  const [feriadoChamada, setFeriadoChamada] = useState<{titulo:string;tipo:string}|null>(null)
  const [forcarChamada, setForcarChamada] = useState(false)

  // propostas de horário extra
  const [propostas, setPropostas] = useState<PropostaExtra[]>([])
  const [showPropostaModal, setShowPropostaModal] = useState(false)
  const [salvandoProposta, setSalvandoProposta] = useState(false)
  const [formProposta, setFormProposta] = useState({
    data_aula: '',
    hora_inicio: '',
    hora_fim: '',
    aluno_nome: '',
    instrumento: '',
    justificativa: '',
    valor_extra: '',
  })

  // anotações
  const [anotacoes, setAnotacoes] = useState<Anotacao[]>([])
  const [loadingAnotacoes, setLoadingAnotacoes] = useState(false)
  const [alunoExpandido, setAlunoExpandido] = useState<string|null>(null)
  const [novaAnotacao, setNovaAnotacao] = useState('')
  const [salvandoNota, setSalvandoNota] = useState(false)

  // reposições aguardando confirmação
  const [reposicoesPendentes, setReposicoesPendentes] = useState<ReposicaoPendente[]>([])
  const [confirmandoRepId, setConfirmandoRepId] = useState<string|null>(null)

  async function loadReposicoesPendentes() {
    if (!professor_id) return
    const { data } = await supabase
      .from('reposicoes')
      .select('id, aluno_nome, instrumento, data_reposicao, hora_reposicao')
      .eq('professor_id', professor_id)
      .eq('status', 'aguardando_confirmacao')
      .order('data_reposicao')
    setReposicoesPendentes((data || []) as ReposicaoPendente[])
  }

  useEffect(() => { loadReposicoesPendentes() }, [professor_id])

  async function responderReposicao(rep: ReposicaoPendente, aprovado: boolean) {
    if (!professor_id) return
    setConfirmandoRepId(rep.id)
    const motivo = aprovado ? null : (prompt('Motivo da recusa (opcional):') || undefined)
    const { data, error } = await supabase.rpc('reposicao_professor_confirmar', {
      p_reposicao_id: rep.id,
      p_professor_id: professor_id,
      p_aprovado: aprovado,
      p_motivo_recusa: motivo ?? null,
    })
    setConfirmandoRepId(null)
    if (error) { alert('Erro: ' + error.message); return }
    const result = data as { ok: boolean; mensagem: string }
    if (!result?.ok) { alert(result?.mensagem || 'Não foi possível processar.'); return }
    loadReposicoesPendentes()
  }

  useEffect(() => {
    if (!professor_id) return
    supabase.from('professores').select('nome,valor_hora_aula,instrumentos')
      .eq('id',professor_id).single()
      .then(({data}) => {
        if (data) {
          setNomeProfessor(data.nome||'')
          setValorHoraAula(Number(data.valor_hora_aula)||0)
          setInstrumentosProfessor(data.instrumentos||[])
        }
      })
  }, [professor_id])

  useEffect(() => { if (tab==='chamada'&&professor_id) { loadChamada(); loadFeriadoChamada() } }, [dataAtual,tab,professor_id])
  useEffect(() => { if (tab==='agenda'&&professor_id) { loadExperimentaisAgenda() } }, [tab,professor_id,semanaOffset])

  async function loadFeriadoChamada() {
    setForcarChamada(false)
    const { data } = await supabase
      .from('eventos_agenda')
      .select('titulo, tipo, data_inicio, data_fim')
      .in('tipo', ['feriado', 'recesso'])
      .lte('data_inicio', dataAtual)
      .or(`data_fim.gte.${dataAtual},data_fim.is.null`)
    const encontrado = (data || []).find((e:any) => (e.data_fim || e.data_inicio) >= dataAtual)
    setFeriadoChamada(encontrado ? { titulo: encontrado.titulo, tipo: encontrado.tipo } : null)
  }

  async function loadChamada() {
    if (!professor_id) return
    setLoadingChamada(true)
    const date = new Date(dataAtual+'T12:00:00')
    const diaSemana = DIAS_SEMANA[date.getDay()]
    const [{data:horarios},{data:presencasExistentes},{data:experimentais}] = await Promise.all([
      supabase.from('horarios').select('id,dia_semana,hora_inicio,hora_fim,status,aluno_nome,aluno_ids,tipo,instrumento')
        .eq('professor_id',professor_id).eq('dia_semana',diaSemana).eq('status','ocupado').order('hora_inicio'),
      supabase.from('presencas').select('*').eq('professor_id',professor_id).eq('data',dataAtual),
      supabase.from('aulas_experimentais').select('id,nome,instrumento,hora_inicio,hora_fim,status')
        .eq('professor_id',professor_id).eq('data_aula',dataAtual)
        .not('status','in','(cancelada,remarcada)').order('hora_inicio'),
    ])
    const idsReferenciados = Array.from(new Set((horarios||[]).flatMap((h:any)=>h.aluno_ids||[])))
    const matriculaPorId = new Map<string,string|null>()
    if (idsReferenciados.length>0) {
      const {data:alunosRef} = await supabase.from('alunos').select('id,data_matricula').in('id',idsReferenciados)
      for (const a of (alunosRef||[])) matriculaPorId.set(a.id,a.data_matricula)
    }
    const lista: AulaItem[] = []
    for (const h of (horarios||[])) {
      if (!h.aluno_nome) continue
      const isGrupo = h.tipo==='grupo'||(!h.tipo&&(h.aluno_nome.includes(',')||h.aluno_nome.includes('\n')||/\w{2,}\s+e\s+\w{2,}/.test(h.aluno_nome)))
      const nomes = isGrupo ? splitNomesGrupo(h.aluno_nome) : [h.aluno_nome]
      const idsHorario = (h as any).aluno_ids || []
      for (let i=0;i<nomes.length;i++) {
        const nome = nomes[i]
        const alunoId = isGrupo ? idsHorario[i] : idsHorario[0]
        const dataMatricula = alunoId ? matriculaPorId.get(alunoId) : undefined
        if (dataMatricula && dataMatricula > dataAtual) continue
        const px = (presencasExistentes||[]).find((p:any)=>p.horario_id===h.id&&(isGrupo?p.aluno_nome===nome:true))
        lista.push({ id:isGrupo?h.id+'_'+nome:h.id, horario_id:h.id, aluno_nome:nome, instrumento:h.instrumento||'', hora_inicio:h.hora_inicio||'', hora_fim:h.hora_fim||'', presente:px?px.presente:null, tipo_falta:px?.tipo_falta||'', observacoes:px?.observacoes||'', presenca_id:px?.id, tipo_aula:isGrupo?'grupo':'individual' })
      }
    }
    for (const exp of (experimentais||[])) {
      const realizada = exp.status==='realizada'||exp.status==='concluida'
      lista.push({ id:'exp_'+exp.id, horario_id:'', aluno_nome:exp.nome||'', instrumento:exp.instrumento||'', hora_inicio:exp.hora_inicio||'', hora_fim:exp.hora_fim||'', presente:realizada?true:null, tipo_falta:'', observacoes:'', is_experimental:true, experimental_id:exp.id, tipo_aula:'individual' })
    }
    lista.sort((a,b)=>a.hora_inicio.localeCompare(b.hora_inicio))
    setAulas(lista)
    setRascunhoGrupo({})
    setLoadingChamada(false)
  }

  // Agrupa os itens da chamada: alunos de uma mesma turma em grupo viram 1 único
  // bloco de renderização (ao invés de 1 card por aluno) — presença fica individual
  // dentro do bloco, mas tudo aparece direto na lista, sem popup.
  type RenderUnit =
    | { kind: 'individual'; item: AulaItem }
    | { kind: 'grupo'; horarioId: string; itens: AulaItem[] }
  const renderUnits = useMemo<RenderUnit[]>(() => {
    const vistos = new Set<string>()
    const units: RenderUnit[] = []
    for (const item of aulas) {
      if (item.tipo_aula === 'grupo') {
        if (vistos.has(item.horario_id)) continue
        vistos.add(item.horario_id)
        units.push({ kind: 'grupo', horarioId: item.horario_id, itens: aulas.filter(a => a.horario_id === item.horario_id && a.tipo_aula === 'grupo') })
      } else {
        units.push({ kind: 'individual', item })
      }
    }
    return units
  }, [aulas])

  function draftGrupo(horarioId: string, itens: AulaItem[]) {
    return rascunhoGrupo[horarioId] ?? {
      presencaPorId: Object.fromEntries(itens.map(it => [it.id, it.presente])),
      tipoFaltaPorId: Object.fromEntries(itens.map(it => [it.id, it.tipo_falta || 'falta_injustificada'])),
      obs: itens.find(it => it.observacoes)?.observacoes || '',
    }
  }
  function atualizarDraftGrupo(horarioId: string, itens: AulaItem[], patch: Partial<ReturnType<typeof draftGrupo>>) {
    setRascunhoGrupo(prev => ({ ...prev, [horarioId]: { ...draftGrupo(horarioId, itens), ...patch } }))
  }

  async function salvarChamadaGrupo(horarioId: string, itens: AulaItem[]) {
    if (!professor_id) return
    const draft = draftGrupo(horarioId, itens)
    const pendente = itens.find(it => draft.presencaPorId[it.id] == null)
    if (pendente) {
      alert(`Marque presença/falta de "${pendente.aluno_nome}" antes de salvar.`)
      return
    }
    setSalvandoGrupoId(horarioId)
    const obs = draft.obs.trim() || null
    for (const item of itens) {
      const presente = draft.presencaPorId[item.id] as boolean
      const tipoFalta = draft.tipoFaltaPorId[item.id]
      const { data: ad } = await supabase.from('alunos').select('id').ilike('nome', item.aluno_nome).limit(1).maybeSingle()
      const payload = {
        aluno_id: ad?.id || null, professor_id, horario_id: item.horario_id || null,
        data: dataAtual, hora_inicio: item.hora_inicio || null, hora_fim: item.hora_fim || null,
        instrumento: item.instrumento || null, presente,
        tipo_falta: presente ? null : (tipoFalta || 'falta_injustificada'),
        aluno_nome: item.aluno_nome, observacoes: obs,
      }
      if (item.presenca_id) {
        await supabase.from('presencas').update({ presente, tipo_falta: payload.tipo_falta, observacoes: obs }).eq('id', item.presenca_id)
      } else {
        await supabase.from('presencas').insert(payload)
      }
    }
    setSalvandoGrupoId(null)
    setRascunhoGrupo(prev => { const n = { ...prev }; delete n[horarioId]; return n })
    loadChamada()
  }

  useEffect(() => { if ((tab==='alunos'||tab==='agenda')&&professor_id&&grade.length===0) loadGrade() }, [tab,professor_id])
  useEffect(() => { if (tab==='alunos'&&professor_id) loadAnotacoes() }, [tab,professor_id])

  async function loadGrade() {
    if (!professor_id) return
    setLoadingGrade(true)
    const {data} = await supabase.from('horarios').select('id,dia_semana,hora_inicio,hora_fim,aluno_nome,instrumento,tipo,created_at')
      .eq('professor_id',professor_id).eq('status','ocupado').order('hora_inicio')
    setGrade((data||[]) as HorarioGrade[])
    setLoadingGrade(false)
  }

  useEffect(() => { if (tab==='mes'&&professor_id) { loadMes(); loadPropostas() } }, [tab,mesSel,anoSel,professor_id])

  async function loadMes() {
    if (!professor_id) return
    setLoadingMes(true)
    const p1=`${anoSel}-${String(mesSel).padStart(2,'0')}-01`
    const p2=new Date(anoSel,mesSel,0).toISOString().slice(0,10)
    const {data} = await supabase.from('presencas').select('data,aluno_nome,instrumento,presente,tipo_falta,observacoes')
      .eq('professor_id',professor_id).gte('data',p1).lte('data',p2).order('data',{ascending:false})
    setRegistrosMes((data||[]) as RegistroMes[])
    const {count} = await supabase.from('reposicoes').select('id',{count:'exact',head:true})
      .eq('professor_id',professor_id).eq('status','realizada').gte('data_reposicao',p1).lte('data_reposicao',p2)
    setReposRealizadasMes(count||0)
    setLoadingMes(false)
  }

  async function loadPropostas() {
    if (!professor_id) return
    const {data} = await supabase.from('propostas_horario_extra')
      .select('*').eq('professor_id', professor_id).order('criado_em', {ascending:false})
    setPropostas((data||[]) as PropostaExtra[])
  }

  const valorProposta = useMemo(() => {
    const {hora_inicio:i,hora_fim:f} = formProposta
    if (!i||!f) return 0
    const [h1=0,m1=0]=i.split(':').map(Number), [h2=0,m2=0]=f.split(':').map(Number)
    return Math.max((h2*60+m2)-(h1*60+m1),0)/60*VALOR_HORA_EXTRA
  }, [formProposta.hora_inicio, formProposta.hora_fim])

  async function salvarProposta() {
    if (!professor_id) return
    const f = formProposta
    if (!f.data_aula||!f.hora_inicio||!f.hora_fim||!f.aluno_nome.trim()||!f.justificativa.trim()) {
      alert('Preencha todos os campos obrigatórios.'); return
    }
    setSalvandoProposta(true)
    const {error} = await supabase.from('propostas_horario_extra').insert({
      professor_id,
      data_aula: f.data_aula,
      hora_inicio: f.hora_inicio,
      hora_fim: f.hora_fim,
      aluno_nome: f.aluno_nome.trim(),
      instrumento: f.instrumento.trim()||null,
      justificativa: f.justificativa.trim(),
    })
    setSalvandoProposta(false)
    if (error) { alert('Erro: '+error.message); return }
    setShowPropostaModal(false)
    setFormProposta({data_aula:'',hora_inicio:'',hora_fim:'',aluno_nome:'',instrumento:'',justificativa:'',valor_extra:''})
    loadPropostas()
  }

  function abrirModal(item:AulaItem,presente:boolean) {
    setObsTexto(item.observacoes||'')
    setModal({item,presente,tipoFalta:item.tipo_falta||(presente?'':'falta_injustificada')})
  }

  async function salvarPresenca() {
    if (!modal||!professor_id) return
    const obs=obsTexto.trim()||null
    setSalvando(true)
    const {item,presente,tipoFalta}=modal
    const {data:ad}=await supabase.from('alunos').select('id').ilike('nome',item.aluno_nome).limit(1).maybeSingle()
    const payload = {
      aluno_id:ad?.id||null, professor_id, horario_id:item.horario_id||null,
      data:dataAtual, hora_inicio:item.hora_inicio||null, hora_fim:item.hora_fim||null,
      instrumento:item.instrumento||null, presente,
      tipo_falta:presente?null:(tipoFalta||'falta_injustificada'),
      aluno_nome:item.aluno_nome, observacoes:obs
    }
    let error
    if (item.presenca_id) {
      ({error}=await supabase.from('presencas').update({presente,tipo_falta:payload.tipo_falta,observacoes:obs}).eq('id',item.presenca_id))
    } else {
      ({error}=await supabase.from('presencas').insert(payload))
    }
    if (error) { alert('Erro ao salvar presença:\n'+error.message); console.error(error) }
    setSalvando(false); setModal(null); setObsTexto(''); loadChamada()
  }

  async function loadExperimentaisAgenda() {
    if (!professor_id) return
    const hoje = new Date(); hoje.setHours(12,0,0,0)
    const dow = hoje.getDay()
    const diff = dow===0?-6:1-dow
    const segunda = new Date(hoje); segunda.setDate(hoje.getDate()+diff+semanaOffset*7)
    const sabado = new Date(segunda); sabado.setDate(segunda.getDate()+5)
    const from = segunda.toISOString().slice(0,10)
    const to = sabado.toISOString().slice(0,10)
    const {data} = await supabase.from('aulas_experimentais')
      .select('id,nome,instrumento,hora_inicio,hora_fim,data_aula,status')
      .eq('professor_id',professor_id).gte('data_aula',from).lte('data_aula',to)
      .not('status','in','(cancelada,remarcada)').order('hora_inicio')
    setExperimentaisAgenda((data||[]) as any)

    const {data:eventos} = await supabase
      .from('eventos_agenda')
      .select('titulo,tipo,data_inicio,data_fim')
      .in('tipo',['feriado','recesso'])
      .lte('data_inicio',to)
      .or(`data_fim.gte.${from},data_fim.is.null`)
    const mapa: Record<string,{titulo:string;tipo:string}> = {}
    for (const ev of (eventos||[]) as any[]) {
      const ini = ev.data_inicio > from ? ev.data_inicio : from
      const fim = (ev.data_fim || ev.data_inicio) < to ? (ev.data_fim || ev.data_inicio) : to
      for (let d = new Date(ini+'T12:00:00'); d.toISOString().slice(0,10) <= fim; d.setDate(d.getDate()+1)) {
        mapa[d.toISOString().slice(0,10)] = { titulo: ev.titulo, tipo: ev.tipo }
      }
    }
    setFeriadosSemana(mapa)
  }

  async function confirmarExperimental(expId: string, realizada: boolean) {
    await supabase.from('aulas_experimentais').update({status:realizada?'realizada':'cancelada'}).eq('id',expId)
    loadChamada()
  }

  async function loadAnotacoes() {
    if (!professor_id) return
    setLoadingAnotacoes(true)
    const {data} = await supabase.from('anotacoes_alunos')
      .select('id,aluno_nome,conteudo,criado_em')
      .eq('professor_id',professor_id)
      .order('criado_em',{ascending:false})
    setAnotacoes((data||[]) as Anotacao[])
    setLoadingAnotacoes(false)
  }

  async function addAnotacao(aluno_nome: string) {
    if (!professor_id||!novaAnotacao.trim()) return
    setSalvandoNota(true)
    await supabase.from('anotacoes_alunos').insert({professor_id,aluno_nome,conteudo:novaAnotacao.trim()})
    setNovaAnotacao('')
    await loadAnotacoes()
    setSalvandoNota(false)
  }

  async function salvarSenha() {
    setSenhaErro('')
    if (novaSenha.length<6) { setSenhaErro('A senha deve ter pelo menos 6 caracteres.'); return }
    if (novaSenha!==confirmarSenha) { setSenhaErro('As senhas não coincidem.'); return }
    setSalvandoSenha(true)
    const {error}=await supabase.auth.updateUser({password:novaSenha})
    setSalvandoSenha(false)
    if (error) { setSenhaErro(error.message); return }
    setSenhaSucesso(true); setNovaSenha(''); setConfirmarSenha('')
    setTimeout(()=>{ setSenhaSucesso(false); setShowSenha(false) },2000)
  }

  function navDia(d:number) {
    const dt=new Date(dataAtual+'T12:00:00'); dt.setDate(dt.getDate()+d)
    setDataAtual(dt.toISOString().slice(0,10))
  }
  function navMes(d:number) {
    let m=mesSel+d,a=anoSel
    if(m>12){m=1;a++} if(m<1){m=12;a--}
    setMesSel(m);setAnoSel(a)
  }

  const statsChamada = useMemo(()=>({
    total:aulas.length, presentes:aulas.filter(a=>a.presente===true).length,
    ausentes:aulas.filter(a=>a.presente===false).length, pendentes:aulas.filter(a=>a.presente===null).length,
  }),[aulas])

  const statsMes = useMemo(()=>{
    const r=registrosMes.filter(r=>r.presente||r.tipo_falta==='falta_injustificada').length
    const f=registrosMes.filter(r=>!r.presente).length
    return {aulasRealizadas:r,aulasFaltadas:f,total:registrosMes.length,estimativa:(r+reposRealizadasMes)*valorHoraAula}
  },[registrosMes,valorHoraAula,reposRealizadasMes])

  const gradeAgrupadaPorDia = useMemo(()=>{
    const g:Record<string,HorarioGrade[]>={}
    DIAS_ORDEM.forEach(d=>{g[d]=[]})
    grade.forEach(h=>{ if(g[h.dia_semana]) g[h.dia_semana]!.push(h) })
    return g
  },[grade])

  const meusAlunos = useMemo(()=>{
    const map=new Map<string,{instrumento:string;horarios:string[]}>()
    grade.forEach(h=>{
      const isG=h.tipo==='grupo'||(h.aluno_nome??'').includes(',')||(h.aluno_nome??'').includes('\n')||/\w{2,}\s+e\s+\w{2,}/.test(h.aluno_nome??'')
      const nomes=isG?splitNomesGrupo(h.aluno_nome):[h.aluno_nome]
      nomes.forEach(n=>{
        if(!map.has(n)) map.set(n,{instrumento:h.instrumento||'',horarios:[]})
        map.get(n)!.horarios.push(`${h.dia_semana} ${fmtHora(h.hora_inicio)}`)
      })
    })
    return Array.from(map.entries()).map(([nome,v])=>({nome,...v})).sort((a,b)=>a.nome.localeCompare(b.nome))
  },[grade])

  const hojeStr = new Date().toISOString().slice(0,10)
  const diaSemanaLabel = DIAS_SEMANA[new Date(dataAtual+'T12:00:00').getDay()]
  const diaSemanaHoje = DIAS_SEMANA[new Date().getDay()]

  // Alunos adicionados nos últimos 30 dias (slot criado recentemente)
  const alunosNovos = useMemo(()=>{
    const threshold = new Date(Date.now()-30*24*60*60*1000).toISOString()
    const s = new Set<string>()
    grade.forEach(h=>{
      if ((h.created_at||'') >= threshold) {
        const isG = h.tipo==='grupo'||(h.aluno_nome??'').includes(',')||(h.aluno_nome??'').includes('\n')||/\w{2,}\s+e\s+\w{2,}/.test(h.aluno_nome??'')
        const ns = isG ? splitNomesGrupo(h.aluno_nome) : [h.aluno_nome]
        ns.forEach(n=>s.add(n))
      }
    })
    return s
  },[grade])

  // Semana da Agenda: segunda-feira da semana atual + offset
  const semanaAtual = useMemo(()=>{
    const hoje = new Date(); hoje.setHours(12,0,0,0)
    const dow = hoje.getDay()
    const diff = dow===0 ? -6 : 1-dow
    const segunda = new Date(hoje)
    segunda.setDate(hoje.getDate()+diff+semanaOffset*7)
    return DIAS_ORDEM.map((dia,i)=>{
      const d = new Date(segunda); d.setDate(segunda.getDate()+i)
      return { dia, date: d.toISOString().slice(0,10), label:`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}` }
    })
  },[semanaOffset])

  const TABS=[
    {key:'chamada' as TabKey, label:'Chamada', icon:<ClipboardCheck className="w-4 h-4"/>},
    {key:'agenda'  as TabKey, label:'Minha Semana', icon:<CalendarRange className="w-4 h-4"/>},
    {key:'alunos'  as TabKey, label:'Meus Alunos', icon:<Users className="w-4 h-4"/>, badge: alunosNovos.size},
    {key:'mes'     as TabKey, label:'Meu Mês', icon:<DollarSign className="w-4 h-4"/>},
  ]

  if (!professor_id) return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
      <AlertCircle className="w-12 h-12 text-amber-400"/>
      <h2 className="text-xl font-semibold text-gray-700">Conta não vinculada</h2>
      <p className="text-gray-500 max-w-sm">Solicite ao administrador para associar sua conta a um professor.</p>
    </div>
  )

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-lg shrink-0">
            {nomeProfessor ? iniciais(nomeProfessor) : '?'}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Olá, {nomeProfessor ? nomeProfessor.split(' ')[0] : 'Professor'}! 👋
            </h1>
            {instrumentosProfessor.length>0 && (
              <p className="text-sm text-gray-500 flex items-center gap-1">
                <Music2 className="w-3.5 h-3.5"/>
                {instrumentosProfessor.join(' · ')}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={()=>{setShowSenha(true);setSenhaErro('');setSenhaSucesso(false)}}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-brand-600 hover:bg-brand-50 rounded-lg border border-gray-200 transition-colors"
        >
          <KeyRound className="w-4 h-4"/>
          <span className="hidden sm:inline">Alterar Senha</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-xl p-1 gap-1 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors relative ${
              tab === t.key ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {t.icon}
            {t.label}
            {t.badge ? <span className="absolute -top-1 -right-1 w-4 h-4 bg-brand-500 text-white text-xs rounded-full flex items-center justify-center">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      {/* Reposições aguardando confirmação */}
      {reposicoesPendentes.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-orange-800 flex items-center gap-2">
            <Repeat className="w-4 h-4" /> Reposições aguardando sua confirmação
          </h3>
          {reposicoesPendentes.map((rep) => (
            <div key={rep.id} className="bg-white rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-medium text-gray-900">{rep.aluno_nome} — {rep.instrumento || 'aula'}</p>
                <p className="text-xs text-gray-500">
                  {new Date(rep.data_reposicao + 'T12:00').toLocaleDateString('pt-BR')} às {rep.hora_reposicao.slice(0, 5)}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => responderReposicao(rep, true)}
                  disabled={confirmandoRepId === rep.id}
                  className="text-xs px-3 py-1.5 rounded bg-green-100 text-green-800 hover:bg-green-200 disabled:opacity-50 inline-flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3 h-3" /> Confirmar
                </button>
                <button
                  onClick={() => responderReposicao(rep, false)}
                  disabled={confirmandoRepId === rep.id}
                  className="text-xs px-3 py-1.5 rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 inline-flex items-center gap-1"
                >
                  <XCircle className="w-3 h-3" /> Recusar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── CHAMADA ── */}
      {tab==='chamada' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
            <button onClick={()=>navDia(-1)} className="p-2 rounded-lg hover:bg-gray-100">
              <ChevronLeft className="w-5 h-5"/>
            </button>
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-900">{diaSemanaLabel}</p>
              <p className="text-sm text-gray-500">{fmtData(dataAtual)}</p>
              {dataAtual===hojeStr && <span className="inline-block mt-1 text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">Hoje</span>}
            </div>
            <button onClick={()=>navDia(1)} disabled={dataAtual>=hojeStr} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30">
              <ChevronRight className="w-5 h-5"/>
            </button>
          </div>

          {feriadoChamada && (
            <div className="flex flex-wrap items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <span className="text-sm text-red-700 font-medium">
                {feriadoChamada.tipo==='feriado'?'Feriado':'Recesso/Férias'}: {feriadoChamada.titulo} — não há aula neste dia, as aulas desta data foram canceladas automaticamente.
              </span>
              {!forcarChamada && (
                <button onClick={()=>setForcarChamada(true)} className="ml-auto text-xs font-medium text-red-600 hover:underline shrink-0">
                  Fazer chamada mesmo assim
                </button>
              )}
            </div>
          )}

          {(!feriadoChamada || forcarChamada) && aulas.length>0 && (
            <div className="grid grid-cols-3 gap-3">
              {[{v:statsChamada.presentes,l:'Presentes',c:'text-green-600'},{v:statsChamada.ausentes,l:'Faltaram',c:'text-red-500'},{v:statsChamada.pendentes,l:'Pendentes',c:'text-amber-500'}].map(s=>(
                <div key={s.l} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
                  <p className={`text-2xl font-bold ${s.c}`}>{s.v}</p>
                  <p className="text-xs text-gray-500 mt-1">{s.l}</p>
                </div>
              ))}
            </div>
          )}

          {(!feriadoChamada || forcarChamada) && (
          loadingChamada ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-500"/></div>
          ) : aulas.length===0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <CalendarCheck className="w-10 h-10 text-gray-300 mx-auto mb-3"/>
              <p className="text-gray-500 font-medium">Nenhuma aula neste dia</p>
              <p className="text-sm text-gray-400 mt-1">Navegue para outro dia.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {renderUnits.map(u => u.kind==='individual' ? (() => { const item = u.item; return (
                <div key={item.id} className={`bg-white rounded-xl border-2 p-4 transition-colors ${
                  item.is_experimental
                    ? item.presente===true ? 'border-purple-200 bg-purple-50' : 'border-purple-200'
                    : item.presente===true?'border-green-200 bg-green-50':item.presente===false?'border-red-100 bg-red-50':'border-gray-200'
                }`}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      {item.presente===true ? <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0"/>
                       :item.presente===false ? <XCircle className="w-6 h-6 text-red-400 shrink-0"/>
                       :<MinusCircle className="w-6 h-6 text-gray-300 shrink-0"/>}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900 truncate">{item.aluno_nome}</p>
                          {item.is_experimental && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium shrink-0">Experimental</span>}
                        </div>
                        <div className="flex items-center gap-3 text-sm text-gray-500">
                          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5"/>{fmtHora(item.hora_inicio)}{item.hora_fim?` – ${fmtHora(item.hora_fim)}`:''}</span>
                          {item.instrumento && <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5"/>{item.instrumento}</span>}
                        </div>
                        {!item.is_experimental&&item.presente!==null&&item.observacoes && <p className="text-xs text-gray-400 mt-1 italic truncate">{item.observacoes}</p>}
                        {!item.is_experimental&&item.presente===false&&item.tipo_falta && <p className="text-xs text-red-400 mt-0.5">{TIPOS_FALTA.find(t=>t.value===item.tipo_falta)?.label??item.tipo_falta}</p>}
                        {item.is_experimental&&item.presente===true && <p className="text-xs text-purple-500 mt-0.5 font-medium">Aula realizada ✓</p>}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {item.is_experimental ? (
                        item.presente===true ? null : (
                          <button onClick={()=>confirmarExperimental(item.experimental_id!,true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-100 hover:bg-purple-200 text-purple-700 transition-colors">
                            <CheckCircle2 className="w-4 h-4"/><span className="hidden sm:inline">Realizada</span>
                          </button>
                        )
                      ) : (
                        <>
                          <button onClick={()=>abrirModal(item,true)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${item.presente===true?'bg-green-100 text-green-700 border border-green-200':'bg-gray-100 hover:bg-green-100 hover:text-green-700 text-gray-600'}`}>
                            <CheckCircle2 className="w-4 h-4"/><span className="hidden sm:inline">Presente</span>
                          </button>
                          <button onClick={()=>abrirModal(item,false)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${item.presente===false?'bg-red-100 text-red-600 border border-red-200':'bg-gray-100 hover:bg-red-100 hover:text-red-600 text-gray-600'}`}>
                            <XCircle className="w-4 h-4"/><span className="hidden sm:inline">Faltou</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )})() : (() => {
                const { horarioId, itens } = u
                const draft = draftGrupo(horarioId, itens)
                const salvandoEsse = salvandoGrupoId === horarioId
                const primeiro = itens[0]!
                return (
                  <div key={horarioId} className="bg-white rounded-xl border-2 border-purple-200 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <Users className="w-5 h-5 text-purple-500 shrink-0"/>
                        <div>
                          <p className="font-semibold text-gray-900">Turma em grupo</p>
                          <div className="flex items-center gap-3 text-sm text-gray-500">
                            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5"/>{fmtHora(primeiro.hora_inicio)}{primeiro.hora_fim?` – ${fmtHora(primeiro.hora_fim)}`:''}</span>
                            {primeiro.instrumento && <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5"/>{primeiro.instrumento}</span>}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => atualizarDraftGrupo(horarioId, itens, { presencaPorId: Object.fromEntries(itens.map(it => [it.id, true])) })}
                        className="text-xs font-medium text-brand-600 hover:underline shrink-0">
                        Marcar todos presentes
                      </button>
                    </div>

                    <div className="space-y-2">
                      {itens.map(it => {
                        const presente = draft.presencaPorId[it.id]
                        return (
                          <div key={it.id} className="flex items-center justify-between gap-2 border border-gray-200 rounded-lg px-3 py-2">
                            <span className="text-sm font-medium text-gray-800 truncate">{it.aluno_nome}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => atualizarDraftGrupo(horarioId, itens, { presencaPorId: { ...draft.presencaPorId, [it.id]: true } })}
                                className={`p-1.5 rounded-lg transition-colors ${presente===true?'bg-green-100 text-green-600 ring-2 ring-green-300':'text-gray-300 hover:text-green-500 hover:bg-green-50'}`}
                                title="Presente">
                                <CheckCircle2 className="w-5 h-5"/>
                              </button>
                              <button
                                onClick={() => atualizarDraftGrupo(horarioId, itens, { presencaPorId: { ...draft.presencaPorId, [it.id]: false } })}
                                className={`p-1.5 rounded-lg transition-colors ${presente===false?'bg-red-100 text-red-600 ring-2 ring-red-300':'text-gray-300 hover:text-red-500 hover:bg-red-50'}`}
                                title="Faltou">
                                <XCircle className="w-5 h-5"/>
                              </button>
                              {presente === false && (
                                <select
                                  value={draft.tipoFaltaPorId[it.id] || 'falta_injustificada'}
                                  onChange={e => atualizarDraftGrupo(horarioId, itens, { tipoFaltaPorId: { ...draft.tipoFaltaPorId, [it.id]: e.target.value } })}
                                  className="text-xs border border-gray-300 rounded px-1.5 py-1">
                                  {TIPOS_FALTA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Observação pedagógica da turma <span className="text-gray-400 text-xs font-normal">(opcional)</span>
                      </label>
                      <p className="text-xs text-gray-400 mb-1">Vale pra todos os alunos do grupo — não precisa repetir aluno por aluno.</p>
                      <textarea
                        value={draft.obs}
                        onChange={e => atualizarDraftGrupo(horarioId, itens, { obs: e.target.value })}
                        rows={2}
                        placeholder="O que foi trabalhado nesta aula? (opcional)"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"/>
                    </div>

                    <div className="flex justify-end">
                      <button onClick={() => salvarChamadaGrupo(horarioId, itens)} disabled={salvandoEsse}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-white flex items-center gap-2 disabled:opacity-60 bg-brand-500 hover:bg-brand-600">
                        {salvandoEsse && <Loader2 className="w-4 h-4 animate-spin"/>}
                        Salvar chamada da turma
                      </button>
                    </div>
                  </div>
                )
              })())}
            </div>
          )
          )}
        </div>
      )}

      {/* ── AGENDA ── */}
      {tab==='agenda' && (
        <div className="space-y-4">
          {/* Navegação de semana */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
            <button onClick={()=>setSemanaOffset(o=>o-1)} className="p-2 rounded-lg hover:bg-gray-100"><ChevronLeft className="w-5 h-5"/></button>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-900">
                {semanaAtual[0]?.label} – {semanaAtual[semanaAtual.length-1]?.label}
              </p>
              {semanaOffset===0 && <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">Esta semana</span>}
              {semanaOffset!==0 && (
                <button onClick={()=>setSemanaOffset(0)} className="text-xs text-brand-600 underline">Ir para hoje</button>
              )}
            </div>
            <button onClick={()=>setSemanaOffset(o=>o+1)} className="p-2 rounded-lg hover:bg-gray-100"><ChevronRight className="w-5 h-5"/></button>
          </div>

          {loadingGrade ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-500"/></div>
          ) : (
            <div className="space-y-3">
              {semanaAtual.map(({dia,date,label})=>{
                const auls = (gradeAgrupadaPorDia[dia]||[])
                const exps = experimentaisAgenda.filter(e=>e.data_aula===date)
                const total = auls.length + exps.length
                const isHoje = date===hojeStr
                const isPast = date<hojeStr
                const feriado = feriadosSemana[date]
                return (
                  <div key={dia} className={`bg-white rounded-xl border-2 overflow-hidden ${feriado?'border-red-200':isHoje?'border-brand-300':isPast?'border-gray-100':'border-gray-200'}`}>
                    <div className={`px-4 py-2.5 flex items-center justify-between ${feriado?'bg-red-50':isHoje?'bg-brand-50':isPast?'bg-gray-50/50':'bg-gray-50'}`}>
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold text-sm ${feriado?'text-red-700':isHoje?'text-brand-700':isPast?'text-gray-400':'text-gray-700'}`}>{dia}</span>
                        <span className={`text-xs ${feriado?'text-red-500':isHoje?'text-brand-500':isPast?'text-gray-400':'text-gray-500'}`}>{label}</span>
                        {isHoje && <span className="text-xs bg-brand-500 text-white px-1.5 py-0.5 rounded-full font-medium">Hoje</span>}
                        {exps.length>0 && <span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full font-medium">{exps.length} exp.</span>}
                      </div>
                      {feriado
                        ? <span className="text-xs text-red-500 font-medium">{feriado.tipo==='feriado'?'Feriado':'Recesso/Férias'}</span>
                        : total>0
                        ? <span className="text-xs text-gray-400">{total} aula{total!==1?'s':''}</span>
                        : <span className="text-xs text-gray-300">Sem aulas</span>}
                    </div>
                    {feriado ? (
                      <div className="px-4 py-3 text-sm text-red-600 bg-red-50/60">
                        {feriado.titulo} — não há aula neste dia{auls.length>0?` (${auls.length} aula${auls.length!==1?'s':''} da grade cancelada${auls.length!==1?'s':''})`:''}.
                      </div>
                    ) : (auls.length>0||exps.length>0) && (
                      <div className="divide-y divide-gray-100">
                        {auls.map(h=>{
                          const isNovo = alunosNovos.has(h.aluno_nome)
                          return (
                            <div key={h.id} className={`px-4 py-2.5 flex items-center gap-3 ${isPast?'opacity-60':''}`}>
                              <span className="text-sm font-mono text-gray-500 w-11 shrink-0">{fmtHora(h.hora_inicio)}</span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-gray-900 truncate">{h.aluno_nome}</p>
                                  {isNovo && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5 shrink-0"><Sparkles className="w-3 h-3"/>Novo</span>}
                                </div>
                                {h.instrumento && <p className="text-xs text-gray-400">{h.instrumento}</p>}
                              </div>
                              {h.tipo==='grupo' && <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full shrink-0">Grupo</span>}
                            </div>
                          )
                        })}
                        {exps.map(exp=>(
                          <div key={exp.id} className={`px-4 py-2.5 flex items-center gap-3 bg-purple-50/40 ${isPast?'opacity-60':''}`}>
                            <span className="text-sm font-mono text-gray-500 w-11 shrink-0">{fmtHora(exp.hora_inicio)}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-gray-900 truncate">{exp.nome}</p>
                                <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium shrink-0">Experimental</span>
                              </div>
                              {exp.instrumento && <p className="text-xs text-gray-400">{exp.instrumento}</p>}
                            </div>
                            {(exp.status==='realizada'||exp.status==='concluida') && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0"/>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── MEUS ALUNOS ── */}
      {tab==='alunos' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center">
              <Users className="w-5 h-5 text-brand-600"/>
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">{meusAlunos.length} alunos</p>
              <p className="text-sm text-gray-500">em sua grade atual{alunosNovos.size>0&&<span className="ml-2 text-amber-600 font-medium">· {alunosNovos.size} novo{alunosNovos.size!==1?'s':''}</span>}</p>
            </div>
          </div>

          {loadingGrade ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-500"/></div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="divide-y divide-gray-100">
                {meusAlunos.map((a,i)=>{
                  const isNovo=alunosNovos.has(a.nome)
                  const expanded=alunoExpandido===a.nome
                  const notasAluno=anotacoes.filter(n=>n.aluno_nome===a.nome)
                  return (
                    <div key={i}>
                      <div
                        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={()=>setAlunoExpandido(expanded?null:a.nome)}
                      >
                        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-600 shrink-0">
                          {iniciais(a.nome)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900 truncate">{a.nome}</p>
                            {isNovo && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5 shrink-0"><Sparkles className="w-3 h-3"/>Novo</span>}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                            {a.instrumento && <span className="text-xs text-gray-400 flex items-center gap-1"><Music2 className="w-3 h-3"/>{a.instrumento}</span>}
                            {a.horarios.map((h,j)=>(
                              <span key={j} className="text-xs text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3"/>{h}</span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {notasAluno.length>0 && <span className="text-xs text-gray-400 flex items-center gap-0.5"><StickyNote className="w-3.5 h-3.5"/>{notasAluno.length}</span>}
                          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400"/> : <ChevronDown className="w-4 h-4 text-gray-400"/>}
                        </div>
                      </div>
                      {expanded && (
                        <div className="bg-amber-50/50 border-t border-amber-100 px-4 py-3 space-y-3">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><StickyNote className="w-3.5 h-3.5"/>Anotações Pedagógicas</p>
                          {loadingAnotacoes ? (
                            <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-brand-400"/></div>
                          ) : notasAluno.length===0 ? (
                            <p className="text-xs text-gray-400 italic">Nenhuma anotação ainda.</p>
                          ) : (
                            <div className="space-y-2">
                              {notasAluno.map(n=>(
                                <div key={n.id} className="bg-white rounded-lg border border-amber-100 px-3 py-2">
                                  <p className="text-sm text-gray-700">{n.conteudo}</p>
                                  <p className="text-xs text-gray-400 mt-1">{new Date(n.criado_em).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</p>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <input
                              value={novaAnotacao}
                              onChange={e=>setNovaAnotacao(e.target.value)}
                              onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();addAnotacao(a.nome)} }}
                              placeholder="Nova anotação sobre este aluno..."
                              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                            <button
                              onClick={()=>addAnotacao(a.nome)}
                              disabled={salvandoNota||!novaAnotacao.trim()}
                              className="px-3 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm disabled:opacity-50 flex items-center gap-1"
                            >
                              {salvandoNota?<Loader2 className="w-4 h-4 animate-spin"/>:<Send className="w-4 h-4"/>}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MEU MÊS ── */}
      {tab==='mes' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
            <button onClick={()=>navMes(-1)} className="p-2 rounded-lg hover:bg-gray-100"><ChevronLeft className="w-5 h-5"/></button>
            <p className="text-lg font-semibold text-gray-900">{MESES[mesSel-1]} {anoSel}</p>
            <button onClick={()=>navMes(1)} disabled={mesSel===new Date().getMonth()+1&&anoSel===new Date().getFullYear()} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30">
              <ChevronRight className="w-5 h-5"/>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-brand-600">{statsMes.total}</p>
              <p className="text-xs text-gray-500 mt-1">Registros</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{statsMes.aulasRealizadas}</p>
              <p className="text-xs text-gray-500 mt-1">Aulas Dadas</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-red-500">{statsMes.aulasFaltadas}</p>
              <p className="text-xs text-gray-500 mt-1">Faltas</p>
            </div>
          </div>

          {loadingMes ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-500"/></div>
          ) : registrosMes.length===0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <ClipboardCheck className="w-10 h-10 text-gray-300 mx-auto mb-3"/>
              <p className="text-gray-500">Nenhum registro neste mês</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Data</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Aluno</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Instrumento</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Observação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {registrosMes.map((r,i)=>(
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtData(r.data)}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{r.aluno_nome}</td>
                      <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{r.instrumento||'—'}</td>
                      <td className="px-4 py-3 text-center">
                        {r.presente
                          ? <span className="inline-flex items-center gap-1 text-green-600 font-medium text-xs"><CheckCircle2 className="w-3.5 h-3.5"/>Presente</span>
                          : <span className="inline-flex items-center gap-1 text-red-500 font-medium text-xs"><XCircle className="w-3.5 h-3.5"/>Faltou</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell max-w-xs truncate">{r.observacoes||'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Propostas de Horário Extra ── */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-brand-500"/>
                <h3 className="font-semibold text-gray-900 text-sm">Propostas de Aula Extra</h3>
                <span className="text-xs text-gray-400">(solicita aprovação para receber extra)</span>
              </div>
              <button
                onClick={() => setShowPropostaModal(true)}
                className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
              >
                <PlusCircle className="w-3.5 h-3.5"/>
                Nova proposta
              </button>
            </div>
            {propostas.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Nenhuma proposta enviada ainda.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {propostas.map(p => (
                  <div key={p.id} className="px-5 py-3 flex items-start gap-3">
                    <span className={`mt-0.5 flex-shrink-0 w-2 h-2 rounded-full ${p.status==='aprovada'?'bg-green-500':p.status==='rejeitada'?'bg-red-400':'bg-amber-400'}`}/>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 text-sm">{fmtData(p.data_aula)}</span>
                        <span className="text-xs text-gray-500">{fmtHora(p.hora_inicio)}–{fmtHora(p.hora_fim)}</span>
                        <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{p.aluno_nome}</span>
                        {p.instrumento && <span className="text-xs text-gray-400">{p.instrumento}</span>}
                        {p.valor_extra > 0 && <span className="text-xs font-semibold text-green-700">{fmtMoeda(p.valor_extra)}</span>}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{p.justificativa}</p>
                      {p.observacao_admin && <p className="text-xs text-brand-600 mt-0.5 italic">{p.observacao_admin}</p>}
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                      p.status==='aprovada' ? 'bg-green-100 text-green-700' :
                      p.status==='rejeitada' ? 'bg-red-100 text-red-600' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {p.status==='aprovada'?'Aprovada':p.status==='rejeitada'?'Rejeitada':'Pendente'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL PROPOSTA AULA EXTRA ── */}
      {showPropostaModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-semibold text-gray-900">Propor Aula Extra</h3>
              <button onClick={()=>setShowPropostaModal(false)}><X className="w-4 h-4 text-gray-400"/></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-3">
                  <label className="text-xs text-gray-500 block mb-1">Data da aula *</label>
                  <input type="date" value={formProposta.data_aula} onChange={e=>setFormProposta(f=>({...f,data_aula:e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"/>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Início *</label>
                  <input type="time" value={formProposta.hora_inicio} onChange={e=>setFormProposta(f=>({...f,hora_inicio:e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"/>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Fim *</label>
                  <input type="time" value={formProposta.hora_fim} onChange={e=>setFormProposta(f=>({...f,hora_fim:e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"/>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Valor (pelas horas)</label>
                  <div className="w-full border border-gray-100 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700">
                    {fmtMoeda(valorProposta)}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Aluno(s) *</label>
                <input value={formProposta.aluno_nome} onChange={e=>setFormProposta(f=>({...f,aluno_nome:e.target.value}))}
                  placeholder="Nome do aluno" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"/>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Instrumento</label>
                <input value={formProposta.instrumento} onChange={e=>setFormProposta(f=>({...f,instrumento:e.target.value}))}
                  placeholder="Ex: violão, teclado..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"/>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Justificativa *</label>
                <textarea value={formProposta.justificativa} onChange={e=>setFormProposta(f=>({...f,justificativa:e.target.value}))}
                  rows={3} placeholder="Por que esta aula é extra? (reposição especial, preparação para recital, etc.)"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"/>
              </div>
              <p className="text-xs text-gray-400">A proposta será enviada para aprovação do administrador antes de gerar pagamento extra.</p>
            </div>
            <div className="flex gap-3 px-5 py-3 border-t">
              <button onClick={()=>setShowPropostaModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-xl text-sm text-gray-700">Cancelar</button>
              <button onClick={salvarProposta} disabled={salvandoProposta} className="flex-1 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                {salvandoProposta&&<Loader2 className="w-4 h-4 animate-spin"/>}
                Enviar proposta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL PRESENÇA ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className={`p-5 rounded-t-2xl ${modal.presente?'bg-green-50':'bg-red-50'}`}>
              <div className="flex items-center gap-3">
                {modal.presente ? <CheckCircle2 className="w-6 h-6 text-green-600"/> : <XCircle className="w-6 h-6 text-red-500"/>}
                <div>
                  <p className="font-semibold text-gray-900">{modal.item.aluno_nome}</p>
                  <p className="text-sm text-gray-500">{fmtHora(modal.item.hora_inicio)} – {fmtHora(modal.item.hora_fim)}{modal.item.instrumento?` · ${modal.item.instrumento}`:''}</p>
                </div>
              </div>
            </div>
            <div className="p-5 space-y-4">
              {!modal.presente && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de falta</label>
                  <select value={modal.tipoFalta} onChange={e=>setModal(m=>m?{...m,tipoFalta:e.target.value}:null)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                    {TIPOS_FALTA.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observação pedagógica <span className="text-gray-400 text-xs">(opcional)</span></label>
                <textarea value={obsTexto} onChange={e=>setObsTexto(e.target.value)} rows={3}
                  placeholder={modal.presente?'O que foi trabalhado? Progresso do aluno...':'Motivo da falta, observações...'}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"/>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={()=>{setModal(null);setObsTexto('')}} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
                <button onClick={salvarPresenca} disabled={salvando}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-60 ${modal.presente?'bg-green-600 hover:bg-green-700':'bg-red-500 hover:bg-red-600'}`}>
                  {salvando&&<Loader2 className="w-4 h-4 animate-spin"/>}
                  {modal.presente?'Confirmar Presença':'Registrar Falta'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL ALTERAR SENHA ── */}
      {showSenha && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <KeyRound className="w-5 h-5 text-brand-500"/>
              <h3 className="text-lg font-semibold text-gray-900">Alterar Senha</h3>
            </div>
            {senhaSucesso ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <CheckCircle2 className="w-12 h-12 text-green-500"/>
                <p className="text-green-700 font-medium">Senha alterada com sucesso!</p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
                    <div className="relative">
                      <input type={showNova?'text':'password'} value={novaSenha} onChange={e=>setNovaSenha(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
                      <button type="button" onClick={()=>setShowNova(v=>!v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showNova?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar nova senha</label>
                    <div className="relative">
                      <input type={showConf?'text':'password'} value={confirmarSenha} onChange={e=>setConfirmarSenha(e.target.value)}
                        placeholder="Repita a nova senha"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
                      <button type="button" onClick={()=>setShowConf(v=>!v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showConf?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}
                      </button>
                    </div>
                  </div>
                  {senhaErro && <p className="text-sm text-red-500">{senhaErro}</p>}
                </div>
                <div className="flex gap-3">
                  <button onClick={()=>{setShowSenha(false);setNovaSenha('');setConfirmarSenha('');setSenhaErro('')}}
                    className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
                  <button onClick={salvarSenha} disabled={salvandoSenha}
                    className="flex-1 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2">
                    {salvandoSenha&&<Loader2 className="w-4 h-4 animate-spin"/>}Salvar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
