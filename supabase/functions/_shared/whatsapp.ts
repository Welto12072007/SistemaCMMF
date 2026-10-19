// Cliente da WhatsApp Cloud API (oficial da Meta) + registro de tudo em wa_mensagens.
// Único ponto do sistema que fala com a Meta — webhook, envio manual, automações e IA passam por aqui.
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GRAPH_VERSION = Deno.env.get('WHATSAPP_GRAPH_VERSION') ?? 'v23.0'
const PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? ''
const TOKEN = Deno.env.get('WHATSAPP_TOKEN') ?? ''
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`
const JANELA_MS = 24 * 60 * 60 * 1000

export const SECRET_KEY = Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function whatsappConfigurado(): boolean {
  return Boolean(PHONE_NUMBER_ID && TOKEN)
}

export function normalizarTelefone(tel: string): string | null {
  let v = String(tel ?? '').replace(/\D/g, '').replace(/^0+/, '')
  if (!v.startsWith('55') && v.length >= 10) v = '55' + v
  if (v.length === 12) v = v.slice(0, 4) + '9' + v.slice(4)
  return v.length === 13 ? v : null
}

export type Autor = 'cliente' | 'ia' | 'humano' | 'sistema' | 'automacao'
export type TipoMidia = 'image' | 'audio' | 'video' | 'document'

export interface EnvioOpts {
  to: string
  texto?: string
  template?: { nome: string; params?: string[]; idioma?: string }
  midia?: { tipo: TipoMidia; url: string; legenda?: string; nomeArquivo?: string }
  autor: Autor
  origem?: string
  enviadoPor?: string | null
  respondeA?: string | null
}

export interface EnvioResultado {
  ok: boolean
  wamid?: string
  codigo?: 'nao_configurado' | 'telefone_invalido' | 'opt_out' | 'fora_da_janela' | 'modelo_inexistente' | 'erro_meta' | 'vazio'
  erro?: string
}

async function graph(path: string, body: unknown) {
  const r = await fetch(`${GRAPH}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await r.json().catch(() => ({}))
  return { ok: r.ok, data }
}

function renderTemplate(corpo: string, params: string[]): string {
  return corpo.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? '')
}

export async function enviar(sb: SupabaseClient, o: EnvioOpts): Promise<EnvioResultado> {
  if (!whatsappConfigurado()) return { ok: false, codigo: 'nao_configurado', erro: 'WhatsApp oficial ainda não configurado' }
  const tel = normalizarTelefone(o.to)
  if (!tel) return { ok: false, codigo: 'telefone_invalido', erro: `Telefone inválido: ${o.to}` }
  if (!o.texto?.trim() && !o.template && !o.midia) return { ok: false, codigo: 'vazio', erro: 'Mensagem vazia' }

  const { data: contato, error: cErr } = await sb.rpc('wa_contato_garantir', { p_telefone: tel }).single()
  if (cErr || !contato) return { ok: false, codigo: 'erro_meta', erro: cErr?.message ?? 'contato' }
  const c = contato as { telefone: string; wa_id: string | null; opt_out: boolean; ultima_entrada_em: string | null }

  if (c.opt_out && o.autor === 'automacao') return { ok: false, codigo: 'opt_out', erro: 'Contato pediu para não receber mensagens' }

  const dentroDaJanela = !!c.ultima_entrada_em && Date.now() - new Date(c.ultima_entrada_em).getTime() < JANELA_MS
  const registro: Record<string, unknown> = {
    telefone: c.telefone, direcao: 'out', autor: o.autor, origem: o.origem ?? null,
    enviado_por: o.enviadoPor ?? null, responde_wamid: o.respondeA ?? null,
  }

  let body: Record<string, unknown>
  if (o.template) {
    const { data: tpl } = await sb.from('wa_templates').select('corpo, idioma, status_meta').eq('nome', o.template.nome).maybeSingle()
    if (!tpl) return { ok: false, codigo: 'modelo_inexistente', erro: `Modelo ${o.template.nome} não cadastrado` }
    const params = (o.template.params ?? []).map((p) => String(p ?? '').trim() || '-')
    body = {
      type: 'template',
      template: {
        name: o.template.nome,
        language: { code: o.template.idioma ?? tpl.idioma },
        components: params.length ? [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }] : [],
      },
    }
    Object.assign(registro, { tipo: 'template', template_nome: o.template.nome, template_params: params, texto: renderTemplate(tpl.corpo, params) })
  } else if (!dentroDaJanela) {
    await sb.from('wa_mensagens').insert({
      ...registro, tipo: o.midia ? o.midia.tipo : 'text', texto: o.texto ?? o.midia?.legenda ?? null,
      status: 'falhou', erro: 'Fora da janela de 24h: só é possível enviar um modelo aprovado pela Meta',
    })
    return { ok: false, codigo: 'fora_da_janela', erro: 'Fora da janela de 24h: o contato não falou com a gente nas últimas 24h. Use um modelo aprovado.' }
  } else if (o.midia) {
    const m = o.midia
    const media: Record<string, string> = { link: m.url }
    if (m.legenda && m.tipo !== 'audio') media.caption = m.legenda
    if (m.tipo === 'document' && m.nomeArquivo) media.filename = m.nomeArquivo
    body = { type: m.tipo, [m.tipo]: media }
    Object.assign(registro, { tipo: m.tipo, midia_url: m.url, texto: m.legenda ?? null })
  } else {
    body = { type: 'text', text: { body: o.texto, preview_url: true } }
    Object.assign(registro, { tipo: 'text', texto: o.texto })
  }

  if (o.respondeA) body.context = { message_id: o.respondeA }
  const r = await graph(`${PHONE_NUMBER_ID}/messages`, {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: c.wa_id ?? c.telefone, ...body,
  })

  const wamid: string | undefined = r.data?.messages?.[0]?.id
  const erro = r.ok ? null : `${r.data?.error?.code ?? ''} ${r.data?.error?.message ?? 'erro'} ${r.data?.error?.error_data?.details ?? ''}`.trim()
  await sb.from('wa_mensagens').insert({
    ...registro, wamid: wamid ?? null, status: r.ok ? 'enviada' : 'falhou', erro, status_em: new Date().toISOString(),
  })
  return r.ok ? { ok: true, wamid } : { ok: false, codigo: 'erro_meta', erro: erro ?? 'erro' }
}

// Baixa mídia recebida (a URL da Meta expira) e guarda no Storage privado
export async function baixarMidia(sb: SupabaseClient, midiaId: string, mime: string): Promise<string | null> {
  const meta = await fetch(`${GRAPH}/${midiaId}`, { headers: { Authorization: `Bearer ${TOKEN}` } }).then((r) => r.json()).catch(() => null)
  if (!meta?.url) return null
  const bin = await fetch(meta.url, { headers: { Authorization: `Bearer ${TOKEN}` } })
  if (!bin.ok) return null
  const ext = (mime.split('/')[1] ?? 'bin').split(';')[0]
  const path = `${new Date().toISOString().slice(0, 7)}/${midiaId}.${ext}`
  const { error } = await sb.storage.from('whatsapp-midia').upload(path, await bin.arrayBuffer(), { contentType: mime, upsert: true })
  return error ? null : path
}

export async function marcarComoLida(wamid: string) {
  if (!whatsappConfigurado()) return
  await graph(`${PHONE_NUMBER_ID}/messages`, { messaging_product: 'whatsapp', status: 'read', message_id: wamid })
}
