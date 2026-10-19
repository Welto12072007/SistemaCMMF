// Webhook da WhatsApp Cloud API: recebe mensagens, status (enviada/entregue/lida/falhou)
// e ecos do app WhatsApp Business (coexistência). Configurar na Meta:
//   URL: https://<projeto>.supabase.co/functions/v1/whatsapp-webhook
//   Verify token: WHATSAPP_VERIFY_TOKEN   |   Campos: messages, smb_message_echoes
import { adminClient, baixarMidia, normalizarTelefone } from '../_shared/whatsapp.ts'

const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? ''
const APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET') ?? ''
const OPT_OUT = new Set(['sair', 'parar', 'pare', 'stop', 'descadastrar', 'cancelar inscricao', 'cancelar inscrição'])

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void }

async function assinaturaValida(raw: string, header: string | null): Promise<boolean> {
  if (!APP_SECRET || !header?.startsWith('sha256=')) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)))
  const esperado = Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('')
  const recebido = header.slice(7)
  if (recebido.length !== esperado.length) return false
  let diff = 0
  for (let i = 0; i < esperado.length; i++) diff |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i)
  return diff === 0
}

// deno-lint-ignore no-explicit-any
function extrair(m: any): { tipo: string; texto: string | null; midiaId?: string; mime?: string } {
  switch (m.type) {
    case 'text': return { tipo: 'text', texto: m.text?.body ?? '' }
    case 'image': case 'video': case 'document': case 'sticker':
      return { tipo: m.type, texto: m[m.type]?.caption ?? null, midiaId: m[m.type]?.id, mime: m[m.type]?.mime_type }
    case 'audio': return { tipo: 'audio', texto: null, midiaId: m.audio?.id, mime: m.audio?.mime_type }
    case 'button': return { tipo: 'button', texto: m.button?.text ?? m.button?.payload ?? '' }
    case 'interactive':
      return { tipo: 'interactive', texto: m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '' }
    case 'reaction': return { tipo: 'reaction', texto: m.reaction?.emoji ?? '' }
    case 'location': return { tipo: 'location', texto: `${m.location?.name ?? 'Localização'} (${m.location?.latitude}, ${m.location?.longitude})` }
    case 'contacts': return { tipo: 'contacts', texto: (m.contacts ?? []).map((c: any) => c.name?.formatted_name).join(', ') }
    default: return { tipo: 'unsupported', texto: '[mensagem não suportada]' }
  }
}

const STATUS: Record<string, string> = { sent: 'enviada', delivered: 'entregue', read: 'lida', failed: 'falhou' }
const ORDEM: Record<string, number> = { pendente: 0, enviada: 1, entregue: 2, lida: 3, falhou: 4 }

// deno-lint-ignore no-explicit-any
async function processar(payload: any) {
  const sb = adminClient()
  const midias: Promise<unknown>[] = []

  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const v = change?.value ?? {}
      const nomes: Record<string, string> = {}
      for (const c of v.contacts ?? []) nomes[c.wa_id] = c.profile?.name

      if (change.field === 'messages') {
        for (const m of v.messages ?? []) {
          const tel = normalizarTelefone(m.from)
          if (!tel) continue
          await sb.rpc('wa_contato_garantir', { p_telefone: tel, p_wa_id: m.from, p_nome: nomes[m.from] ?? null })
          const x = extrair(m)
          const { data: ins } = await sb.from('wa_mensagens').upsert({
            telefone: tel, direcao: 'in', autor: 'cliente', tipo: x.tipo, texto: x.texto, midia_id: x.midiaId ?? null,
            midia_mime: x.mime ?? null, wamid: m.id, status: 'recebida', responde_wamid: m.context?.id ?? null,
            payload: m, created_at: new Date(Number(m.timestamp) * 1000).toISOString(),
          }, { onConflict: 'wamid', ignoreDuplicates: true }).select('id').maybeSingle()
          if (!ins) continue

          if (x.tipo === 'text' && OPT_OUT.has((x.texto ?? '').trim().toLowerCase())) {
            await sb.from('wa_contatos').update({ opt_out: true }).eq('telefone', tel)
          }
          if (x.midiaId && x.mime) {
            midias.push(baixarMidia(sb, x.midiaId, x.mime).then((path) =>
              path && sb.from('wa_mensagens').update({ midia_url: path }).eq('id', ins.id)))
          }
        }

        for (const s of v.statuses ?? []) {
          const novo = STATUS[s.status]
          if (!novo) continue
          const { data: atual } = await sb.from('wa_mensagens').select('id, status').eq('wamid', s.id).maybeSingle()
          if (!atual || (ORDEM[atual.status] ?? 0) >= ORDEM[novo]) continue
          const erro = s.errors?.length ? s.errors.map((e: any) => `${e.code} ${e.title ?? ''} ${e.error_data?.details ?? ''}`.trim()).join('; ') : null
          await sb.from('wa_mensagens').update({ status: novo, status_em: new Date(Number(s.timestamp) * 1000).toISOString(), ...(erro ? { erro } : {}) }).eq('id', atual.id)
        }
      }

      // Coexistência: mensagem enviada pela equipe no app WhatsApp Business do celular
      if (change.field === 'smb_message_echoes') {
        for (const m of v.message_echoes ?? []) {
          const tel = normalizarTelefone(m.to)
          if (!tel) continue
          await sb.rpc('wa_contato_garantir', { p_telefone: tel, p_wa_id: m.to })
          const x = extrair(m)
          const { data: ins } = await sb.from('wa_mensagens').upsert({
            telefone: tel, direcao: 'out', autor: 'humano', tipo: x.tipo, texto: x.texto, midia_id: x.midiaId ?? null,
            wamid: m.id, status: 'enviada', origem: 'app_celular', payload: m,
            created_at: new Date(Number(m.timestamp) * 1000).toISOString(),
          }, { onConflict: 'wamid', ignoreDuplicates: true }).select('id').maybeSingle()
          // Alguém da equipe respondeu pelo celular: a IA sai da conversa pra não falar por cima
          if (ins) await sb.from('wa_contatos').update({ modo_ia: 'pausada' }).eq('telefone', tel).neq('modo_ia', 'pausada')
        }
      }
    }
  }
  await Promise.allSettled(midias)
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe' && VERIFY_TOKEN && url.searchParams.get('hub.verify_token') === VERIFY_TOKEN
    return ok ? new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 }) : new Response('forbidden', { status: 403 })
  }
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const raw = await req.text()
  if (!(await assinaturaValida(raw, req.headers.get('x-hub-signature-256')))) return new Response('invalid signature', { status: 401 })

  let payload: unknown
  try { payload = JSON.parse(raw) } catch { return new Response('bad json', { status: 400 }) }

  // A Meta reenvia se não responder rápido: responde 200 já e processa em segundo plano
  EdgeRuntime.waitUntil(processar(payload).catch((e) => console.error('webhook erro', e)))
  return new Response('ok', { status: 200 })
})
