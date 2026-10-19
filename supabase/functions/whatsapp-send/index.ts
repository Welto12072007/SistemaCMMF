// Envio de WhatsApp pela API oficial. Quem pode chamar:
//  - serviços internos (GitHub Actions, outras Edge Functions): Authorization: Bearer <SB_SECRET_KEY>
//  - equipe logada no sistema (admin/recepcao/professor): Authorization: Bearer <access_token>
// Corpo: { to, texto?, template?: {nome, params}, modelo?: {uso, vars}, midia?: {tipo, url, legenda, nomeArquivo}, origem? }
import { adminClient, enviar, SECRET_KEY, type Autor } from '../_shared/whatsapp.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json', ...CORS } })

const STATUS_HTTP: Record<string, number> = {
  nao_configurado: 503, telefone_invalido: 400, vazio: 400, opt_out: 409, fora_da_janela: 422, modelo_inexistente: 400, erro_meta: 502,
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Acesso negado' }, 401)
  const sb = adminClient()

  let autor: Autor = 'automacao'
  let enviadoPor: string | null = null
  if (token !== SECRET_KEY) {
    const { data: u } = await sb.auth.getUser(token)
    if (!u?.user) return json({ error: 'Acesso negado' }, 401)
    const { data: perfil } = await sb.from('perfis').select('role, ativo').eq('user_id', u.user.id).maybeSingle()
    if (!perfil?.ativo || !['admin', 'recepcao', 'professor'].includes(perfil.role)) return json({ error: 'Acesso negado' }, 403)
    autor = 'humano'
    enviadoPor = u.user.id
  }

  const b = await req.json().catch(() => ({}))
  if (!b?.to) return json({ error: 'to obrigatório' }, 400)
  const r = await enviar(sb, {
    to: String(b.to), texto: b.texto, template: b.template, modelo: b.modelo, midia: b.midia,
    autor: autor === 'automacao' && b.autor === 'ia' ? 'ia' : autor,
    origem: b.origem ?? (autor === 'humano' ? 'crm' : undefined), enviadoPor,
  })
  return json(r, r.ok ? 200 : STATUS_HTTP[r.codigo ?? 'erro_meta'] ?? 500)
})
