// Ferramentas da Antonia: cada uma chama uma função do banco (as mesmas regras de antes, agora sem n8n).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { avisarEquipe, notificarProfessorExperimental } from '../avisos.ts'

export interface Contexto {
  sb: SupabaseClient
  telefone: string
  nomeContato: string
  teste: boolean
  acoes: string[]
}

type Exec = (ctx: Contexto, args: Record<string, string>) => Promise<unknown>

const CAMPOS = ['nome', 'instrumento', 'experiencia', 'nome_responsavel', 'grau_parentesco', 'perfil', 'idade', 'disponibilidade', 'motivacao', 'origem', 'observacoes']

export const FERRAMENTAS = [
  {
    nome: 'verificar_disponibilidade',
    descricao: 'Horários livres de aula experimental de um instrumento numa data. Chame uma vez por dia que quiser consultar. A data vem do CALENDÁRIO (yyyy-MM-dd).',
    params: { instrumento: { type: 'string', description: 'Ex.: Violão, Canto, Piano, Bateria' }, data: { type: 'string', description: 'yyyy-MM-dd' } },
    obrigatorios: ['instrumento', 'data'],
  },
  {
    nome: 'criar_agendamento',
    descricao: 'Registra a aula experimental depois que a pessoa escolheu dia e horário retornados por verificar_disponibilidade. Só com o nome real do aluno.',
    params: {
      nome: { type: 'string', description: 'Nome completo do ALUNO (nunca o instrumento)' },
      data: { type: 'string', description: 'yyyy-MM-dd' },
      hora_inicio: { type: 'string', description: 'HH:mm' },
      instrumento: { type: 'string' },
      professor_nome: { type: 'string', description: 'Nome do professor como veio de verificar_disponibilidade' },
      experiencia: { type: 'string' },
      nome_responsavel: { type: 'string', description: 'Se o aluno for menor de idade' },
    },
    obrigatorios: ['nome', 'data', 'hora_inicio', 'instrumento', 'professor_nome'],
  },
  { nome: 'consultar_agendamentos', descricao: 'Aulas e experimentais futuras deste contato.', params: {}, obrigatorios: [] },
  {
    nome: 'cancelar_agendamento',
    descricao: 'Cancela um agendamento deste contato (use o id retornado por consultar_agendamentos).',
    params: { agendamento_id: { type: 'string' } }, obrigatorios: ['agendamento_id'],
  },
  {
    nome: 'salvar_dado_contato',
    descricao: 'Salva um dado novo do contato assim que ele informar. "nome" é sempre o aluno; "nome_responsavel" é o pai/mãe.',
    params: { campo: { type: 'string', enum: CAMPOS }, valor: { type: 'string' } }, obrigatorios: ['campo', 'valor'],
  },
  {
    nome: 'criar_encaminhamento',
    descricao: 'Passa o assunto para a equipe humana (a IA sai da conversa). Use nos casos listados em PASSE PARA A EQUIPE.',
    params: {
      tipo: { type: 'string', enum: ['financeiro', 'negociacao', 'reclamacao', 'aluno_agenda', 'parceria', 'fingerstore', 'estudio', 'vagas', 'sensivel', 'pedido_humano', 'outro'] },
      resumo: { type: 'string', description: 'Resumo curto do que a pessoa precisa, para a equipe' },
    },
    obrigatorios: ['tipo', 'resumo'],
  },
  {
    nome: 'encerrar_lead',
    descricao: 'Encerra o atendimento quando a pessoa disse claramente que não quer mais. Cancela aulas pendentes e para os follow-ups.',
    params: { motivo: { type: 'string', description: 'desistiu, sem_interesse, nao_pode' } }, obrigatorios: ['motivo'],
  },
  { nome: 'consultar_financeiro', descricao: 'Mensalidades em aberto deste contato, com link de pagamento.', params: {}, obrigatorios: [] },
  {
    nome: 'registrar_comprovante_pix',
    descricao: 'Registra que o contato enviou um comprovante de PIX (a equipe confere).',
    params: { valor: { type: 'string' }, observacao: { type: 'string' } }, obrigatorios: [],
  },
]

const rpc = async (ctx: Contexto, fn: string, args: Record<string, unknown>) => {
  const { data, error } = await ctx.sb.rpc(fn, args)
  return error ? { sucesso: false, erro: error.message } : data
}
const simulado = (acao: string) => ({ sucesso: true, simulacao: true, mensagem: `Teste: ${acao} não foi gravado de verdade.` })

const EXEC: Record<string, Exec> = {
  verificar_disponibilidade: (ctx, a) => rpc(ctx, 'ia_horarios_livres', { p_instrumento: a.instrumento, p_data: a.data }),

  criar_agendamento: async (ctx, a) => {
    if (ctx.teste) return simulado('agendamento')
    const r = await rpc(ctx, 'criar_agendamento_experimental', {
      p_telefone: ctx.telefone, p_nome: a.nome, p_data: a.data, p_hora_inicio: a.hora_inicio, p_instrumento: a.instrumento,
      p_professor_nome: a.professor_nome, p_experiencia: a.experiencia ?? null, p_nome_responsavel: a.nome_responsavel ?? null,
    }) as { sucesso?: boolean; experimental_id?: string }
    if (r?.sucesso && r.experimental_id) {
      ctx.acoes.push(`Experimental registrada: ${a.instrumento} ${a.data} ${a.hora_inicio}`)
      await notificarProfessorExperimental(ctx.sb, r.experimental_id)
    }
    return r
  },

  consultar_agendamentos: (ctx) => rpc(ctx, 'consultar_agendamentos', { p_telefone: ctx.telefone }),

  cancelar_agendamento: async (ctx, a) => {
    if (ctx.teste) return simulado('cancelamento')
    const r = await rpc(ctx, 'cancelar_agendamento', { p_telefone: ctx.telefone, p_agendamento_id: a.agendamento_id })
    ctx.acoes.push('Agendamento cancelado pela IA')
    return r
  },

  salvar_dado_contato: (ctx, a) => ctx.teste ? simulado('dado') : rpc(ctx, 'salvar_dado_contato', { p_tel: ctx.telefone, p_campo: a.campo, p_valor: a.valor }),

  criar_encaminhamento: async (ctx, a) => {
    if (ctx.teste) return simulado('encaminhamento')
    const { data: tipo } = await ctx.sb.from('encaminhamento_tipos').select('nome, responsavel, prazo_horas').eq('tipo', a.tipo).maybeSingle()
    const r = await rpc(ctx, 'criar_encaminhamento', { p_telefone: ctx.telefone, p_nome: ctx.nomeContato, p_tipo: a.tipo, p_descricao: a.resumo }) as { encaminhamento_id?: string }
    if (r?.encaminhamento_id) {
      await ctx.sb.from('encaminhamentos').update({
        responsavel: tipo?.responsavel ?? null,
        prazo: new Date(Date.now() + (tipo?.prazo_horas ?? 4) * 3600_000).toISOString(),
      }).eq('id', r.encaminhamento_id)
    }
    await ctx.sb.rpc('ia_definir_modo', { p_telefone: ctx.telefone, p_modo: 'pausada', p_motivo: `encaminhado:${a.tipo}` })
    await avisarEquipe(ctx.sb, { tipo: a.tipo, assunto: `Encaminhamento: ${tipo?.nome ?? a.tipo}`, contato: `${ctx.nomeContato} (${ctx.telefone})`, resumo: a.resumo })
    ctx.acoes.push(`Encaminhado para ${tipo?.responsavel ?? 'equipe'} (${tipo?.nome ?? a.tipo}); IA pausada`)
    return { sucesso: true, responsavel: tipo?.responsavel ?? 'equipe', mensagem: 'Equipe avisada. A IA sai desta conversa; despeça-se dizendo que a equipe responde por aqui.' }
  },

  encerrar_lead: async (ctx, a) => {
    if (ctx.teste) return simulado('encerramento')
    ctx.acoes.push(`Lead encerrado: ${a.motivo}`)
    return rpc(ctx, 'encerrar_lead', { p_tel: ctx.telefone, p_motivo: a.motivo })
  },

  consultar_financeiro: (ctx) => rpc(ctx, 'ia_consultar_financeiro', { p_telefone: ctx.telefone }),

  registrar_comprovante_pix: async (ctx, a) => {
    if (ctx.teste) return simulado('comprovante')
    ctx.acoes.push('Comprovante PIX registrado')
    const valor = a.valor ? Number(String(a.valor).replace(/[^\d,.]/g, '').replace(',', '.')) || null : null
    return rpc(ctx, 'registrar_comprovante_pix', { p_telefone: ctx.telefone, p_valor: valor, p_observacao: a.observacao ?? null })
  },
}

export const ferramentasOpenAI = FERRAMENTAS.map((f) => ({
  type: 'function',
  function: { name: f.nome, description: f.descricao, parameters: { type: 'object', properties: f.params, required: f.obrigatorios } },
}))

export async function executarFerramenta(ctx: Contexto, nome: string, argsJson: string): Promise<string> {
  const exec = EXEC[nome]
  if (!exec) return JSON.stringify({ sucesso: false, erro: `ferramenta desconhecida: ${nome}` })
  try {
    const args = JSON.parse(argsJson || '{}')
    return JSON.stringify(await exec(ctx, args) ?? { sucesso: true })
  } catch (e) {
    return JSON.stringify({ sucesso: false, erro: String(e instanceof Error ? e.message : e) })
  }
}
