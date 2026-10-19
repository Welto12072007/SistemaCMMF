import { supabase } from '@/lib/supabase'

export type ModoIA = 'auto' | 'copiloto' | 'pausada'

export interface ContatoCaixa {
  telefone: string
  nome: string
  nome_whatsapp: string | null
  tipo: string
  modo_ia: ModoIA
  opt_out: boolean
  aluno_id: string | null
  aluno_status: string | null
  instrumento: string | null
  ultima_entrada_em: string | null
  ultima_msg_em: string | null
  ultima_msg_preview: string | null
  aguardando_resposta: boolean
  janela_aberta: boolean
  tem_sugestao: boolean
  encaminhamentos_pendentes: number
}

export interface MensagemWA {
  id: string
  telefone: string
  direcao: 'in' | 'out'
  autor: 'cliente' | 'ia' | 'humano' | 'sistema' | 'automacao'
  tipo: string
  texto: string | null
  midia_url: string | null
  midia_mime: string | null
  template_nome: string | null
  status: string
  erro: string | null
  origem: string | null
  created_at: string
}

export async function enviarTexto(telefone: string, texto: string, origem = 'crm') {
  const { data, error } = await supabase.functions.invoke('whatsapp-send', { body: { to: telefone, texto, origem } })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const body = ctx ? await ctx.json().catch(() => null) : null
    throw new Error(body?.erro ?? body?.error ?? error.message)
  }
  return data
}

export async function definirModo(telefone: string, modo: ModoIA) {
  const { data: u } = await supabase.auth.getUser()
  const { error } = await supabase.rpc('ia_definir_modo', { p_telefone: telefone, p_modo: modo, p_user: u.user?.id ?? null, p_motivo: 'caixa_entrada' })
  if (error) throw error
}

export async function gerarSugestao(telefone: string) {
  const { data, error } = await supabase.functions.invoke('antonia', { body: { telefone, gerar_sugestao: true } })
  if (error) throw error
  return data as { sugestao: { id: string; texto: string }; acoes: string[] }
}

export async function urlMidia(path: string) {
  const { data } = await supabase.storage.from('whatsapp-midia').createSignedUrl(path, 600)
  return data?.signedUrl ?? null
}
