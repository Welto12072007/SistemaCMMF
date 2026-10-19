// Modelos de mensagem (templates) da Meta: envia o catálogo wa_templates para aprovação e sincroniza o status.
// POST { acao: 'enviar', nomes?: string[] } | { acao: 'sincronizar' }  — só admin (ou secret key)
import { adminClient, SECRET_KEY } from '../_shared/whatsapp.ts'

const GRAPH = `https://graph.facebook.com/${Deno.env.get('WHATSAPP_GRAPH_VERSION') ?? 'v23.0'}`
const WABA_ID = Deno.env.get('WHATSAPP_WABA_ID') ?? ''
const TOKEN = Deno.env.get('WHATSAPP_TOKEN') ?? ''
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json', ...CORS } })

interface Tpl { nome: string; idioma: string; categoria: string; corpo: string; exemplo: string[]; botoes: string[]; rodape: string | null; meta_id: string | null }

function componentes(t: Tpl) {
  const c: Record<string, unknown>[] = [{ type: 'BODY', text: t.corpo, ...(t.exemplo.length ? { example: { body_text: [t.exemplo] } } : {}) }]
  if (t.rodape) c.push({ type: 'FOOTER', text: t.rodape })
  if (t.botoes.length) c.push({ type: 'BUTTONS', buttons: t.botoes.map((text) => ({ type: 'QUICK_REPLY', text })) })
  return c
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const sb = adminClient()
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (token !== SECRET_KEY) {
    const { data: u } = await sb.auth.getUser(token)
    const { data: p } = u?.user ? await sb.from('perfis').select('role, ativo').eq('user_id', u.user.id).maybeSingle() : { data: null }
    if (!p?.ativo || p.role !== 'admin') return json({ error: 'Acesso negado' }, 403)
  }
  if (!WABA_ID || !TOKEN) return json({ error: 'WHATSAPP_WABA_ID / WHATSAPP_TOKEN não configurados' }, 503)

  const b = await req.json().catch(() => ({}))
  const auth = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }

  if (b.acao === 'enviar') {
    let q = sb.from('wa_templates').select('nome, idioma, categoria, corpo, exemplo, botoes, rodape, meta_id')
    q = b.nomes?.length ? q.in('nome', b.nomes) : q.in('status_meta', ['rascunho', 'REJECTED', 'ERRO_ENVIO'])
    const { data: lista } = await q
    const resultado = []
    for (const t of (lista ?? []) as Tpl[]) {
      // Já existe na Meta: edita pelo id (criar de novo com o mesmo nome dá erro)
      const r = await fetch(t.meta_id ? `${GRAPH}/${t.meta_id}` : `${GRAPH}/${WABA_ID}/message_templates`, {
        method: 'POST', headers: auth,
        body: JSON.stringify(t.meta_id ? { components: componentes(t) } : { name: t.nome, language: t.idioma, category: t.categoria, components: componentes(t) }),
      })
      const d = await r.json().catch(() => ({}))
      const status = r.ok ? (d.status ?? 'PENDING') : 'ERRO_ENVIO'
      await sb.from('wa_templates').update({
        status_meta: status, meta_id: d.id ?? t.meta_id, motivo_rejeicao: r.ok ? null : (d.error?.error_user_msg ?? d.error?.message ?? 'erro'),
        ...(r.ok && d.category ? { categoria: d.category } : {}), updated_at: new Date().toISOString(),
      }).eq('nome', t.nome)
      resultado.push({ nome: t.nome, status, erro: r.ok ? undefined : d.error?.error_user_msg ?? d.error?.message })
    }
    return json({ resultado })
  }

  if (b.acao === 'sincronizar') {
    const r = await fetch(`${GRAPH}/${WABA_ID}/message_templates?fields=name,status,category,id,rejected_reason&limit=250`, { headers: auth })
    const d = await r.json()
    if (!r.ok) return json({ error: d.error?.message ?? 'erro' }, 502)
    for (const t of d.data ?? []) {
      await sb.from('wa_templates').update({
        status_meta: t.status, meta_id: t.id, categoria: t.category,
        motivo_rejeicao: t.rejected_reason && t.rejected_reason !== 'NONE' ? t.rejected_reason : null, updated_at: new Date().toISOString(),
      }).eq('nome', t.name)
    }
    return json({ sincronizados: (d.data ?? []).length })
  }

  return json({ error: 'acao inválida' }, 400)
})
