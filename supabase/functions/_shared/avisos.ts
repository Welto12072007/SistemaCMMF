// Avisos operacionais (equipe e professores). Texto livre dentro da janela de 24h, modelo aprovado fora dela.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { enviar } from './whatsapp.ts'

const dataBR = (d: string) => d.split('-').reverse().join('/')
const hora = (h: string) => String(h).slice(0, 5)

async function numeroAvisoPadrao(sb: SupabaseClient): Promise<string | null> {
  const { data } = await sb.from('configuracoes').select('valor').eq('chave', 'numero_notificacoes').maybeSingle()
  return data?.valor ?? null
}

export async function avisarEquipe(sb: SupabaseClient, o: { tipo?: string; assunto: string; contato: string; resumo: string }) {
  let numero: string | null = null
  if (o.tipo) {
    const { data } = await sb.from('encaminhamento_tipos').select('telefone_aviso').eq('tipo', o.tipo).maybeSingle()
    numero = data?.telefone_aviso || null
  }
  numero ??= await numeroAvisoPadrao(sb)
  if (!numero) return { ok: false, erro: 'sem número de aviso' }
  const texto = `🚨 *${o.assunto}*\n\n*Contato:* ${o.contato}\n*Resumo:* ${o.resumo}\n\nAbra a Caixa de entrada do sistema para responder.`
  return enviar(sb, {
    to: numero, texto, autor: 'sistema', origem: `aviso_equipe:${o.tipo ?? 'geral'}`,
    template: { nome: 'aviso_equipe', params: [o.assunto, o.contato, o.resumo.replace(/\s+/g, ' ').slice(0, 500)] },
  })
}

export async function notificarProfessorExperimental(sb: SupabaseClient, aulaId: string) {
  const { data: a } = await sb.from('aulas_experimentais')
    .select('id, nome, instrumento, data_aula, hora_inicio, professor_nome, professor_telefone, experiencia')
    .eq('id', aulaId).maybeSingle()
  if (!a?.professor_telefone) return { ok: false, erro: 'professor sem telefone' }
  const prof = String(a.professor_nome ?? '').split(' ')[0]
  const texto = `Olá professor ${prof}! 🎶\n\nTemos uma aula experimental para confirmar:\n\n👤 *Aluno:* ${a.nome}\n🎵 *Instrumento:* ${a.instrumento}\n📅 *Data:* ${dataBR(a.data_aula)}\n🕐 *Horário:* ${hora(a.hora_inicio)}\n\nPode atender? Responda *SIM* ou *NÃO*`
  const r = await enviar(sb, {
    to: a.professor_telefone, texto, autor: 'sistema', origem: 'experimental:pedido_professor',
    template: { nome: 'experimental_confirmar_professor', params: [prof, a.nome, a.instrumento, dataBR(a.data_aula), hora(a.hora_inicio)] },
  })
  if (r.ok) await sb.rpc('marcar_notificacao_enviada', { p_aula_experimental_id: a.id })
  return r
}

// Resposta do professor (SIM/NÃO) — regras ficam em processar_resposta_professor()
export async function tratarRespostaProfessor(sb: SupabaseClient, telefone: string, texto: string): Promise<boolean> {
  const { data: pend } = await sb.rpc('verificar_professor_pendente', { p_telefone: telefone })
  if (!pend?.has_pending) return false

  const { data: r } = await sb.rpc('processar_resposta_professor', { p_telefone: telefone, p_resposta: texto })
  if (!r) return false
  if (r.mensagem_professor) {
    await enviar(sb, { to: telefone, texto: r.mensagem_professor, autor: 'sistema', origem: 'experimental:resposta_professor' })
  }
  if (r.sucesso && r.aluno_telefone && r.mensagem_aluno) {
    const nome = String(r.aluno_nome ?? '').split(' ')[0]
    const template = r.status === 'agendada'
      ? { nome: 'experimental_confirmada', params: [nome, String(r.professor_nome ?? '').split(' ')[0], r.instrumento, dataBR(String(r.data_aula)), hora(String(r.hora_inicio))] }
      : { nome: 'experimental_reagendar', params: [nome, r.instrumento] }
    await enviar(sb, { to: r.aluno_telefone, texto: r.mensagem_aluno, autor: 'sistema', origem: `experimental:${r.status}`, template })
  }
  return true
}
