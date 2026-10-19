import { supabase } from '@/lib/supabase'

export type Gatilho = 'sem_resposta' | 'no_show' | 'realizada_sem_matricula' | 'reserva_sem_pagamento' | 'manual'
export type TipoPasso = 'retomada' | 'prova' | 'oportunidade' | 'encerramento'

export const GATILHOS: Record<Gatilho, string> = {
  sem_resposta: 'Lead ficou sem responder',
  no_show: 'Aula experimental marcada como no-show',
  realizada_sem_matricula: 'Fez a experimental e não matriculou',
  reserva_sem_pagamento: 'Reserva aguardando pagamento',
  manual: 'Inscrição manual (ex.: prospecção)',
}

export interface Regua { id: string; nome: string; gatilho: Gatilho; ativo: boolean; envio_automatico: boolean; ordem: number }
export interface Passo { id?: string; regua_id?: string; ordem: number; horas: number; referencia: 'inicio' | 'antes_aula'; tipo: TipoPasso; mensagem: string }
export interface Followup {
  id: string; telefone: string; nome: string; instrumento: string | null; regua_nome: string; gatilho: Gatilho
  passo_atual: number; total_passos: number; passo_tipo: TipoPasso; passo_mensagem: string; proximo_envio_em: string; envio_automatico: boolean
}
export interface Prova { id: string; titulo: string; tipo: string; perfil: string | null; instrumento: string | null; motivacao: string | null; conteudo: string; ativo: boolean; usos: number }

export async function acaoFollowup(acao: 'enviar' | 'pular' | 'cancelar', inscricao_id: string) {
  const { data, error } = await supabase.functions.invoke('crm-reguas', { body: { acao, inscricao_id } })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const b = ctx ? await ctx.json().catch(() => null) : null
    throw new Error(b?.erro ?? b?.error ?? error.message)
  }
  return data
}

export async function inscreverEmRegua(telefone: string, regua_id: string) {
  const { error } = await supabase.functions.invoke('crm-reguas', { body: { acao: 'inscrever', telefone, regua_id } })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const b = ctx ? await ctx.json().catch(() => null) : null
    throw new Error(b?.error ?? error.message)
  }
}

export function descreverPrazo(p: Passo) {
  const t = p.horas % 24 === 0 && p.horas >= 24 ? `${p.horas / 24} dia${p.horas / 24 > 1 ? 's' : ''}` : `${p.horas} hora${p.horas > 1 ? 's' : ''}`
  return p.referencia === 'antes_aula' ? `${t} antes da aula` : `${t} depois`
}
