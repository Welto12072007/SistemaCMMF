import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// Service role key must NEVER be exposed to the browser — only read here, server-side.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SB_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY
const RESEND_FROM = process.env.RESEND_FROM || 'CMMF <nao-responder@centrodemusicamurilofinger.com>'

const admin = SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

const TOKEN_TTL_HORAS = 48

async function requireAdmin(req) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return null

  const anon = createClient(SUPABASE_URL, ANON_KEY)
  const { data: userData, error: userErr } = await anon.auth.getUser(token)
  if (userErr || !userData?.user) return null

  const { data: perfil } = await admin
    .from('perfis')
    .select('role, ativo')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (!perfil || !perfil.ativo || perfil.role !== 'admin') return null
  return userData.user
}

async function enviarEmailConvite(email, nome, link) {
  if (!RESEND_API_KEY) return { enviado: false, motivo: 'RESEND_API_KEY não configurada' }
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [email],
        subject: 'Defina sua senha de acesso — Centro de Música Murilo Finger',
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color:#0C3549;">Olá${nome ? `, ${nome}` : ''}!</h2>
            <p>Você recebeu acesso ao sistema do Centro de Música Murilo Finger.</p>
            <p>Clique no botão abaixo para definir sua senha. Esse link é pessoal e expira em ${TOKEN_TTL_HORAS}h.</p>
            <p style="text-align:center; margin: 32px 0;">
              <a href="${link}" style="background:#FF7A00; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:bold;">Definir minha senha</a>
            </p>
            <p style="font-size:12px; color:#888;">Se o botão não funcionar, copie e cole este link no navegador: ${link}</p>
          </div>
        `,
      }),
    })
    if (!resp.ok) {
      const body = await resp.text().catch(() => '')
      return { enviado: false, motivo: `Resend retornou ${resp.status}: ${body}` }
    }
    return { enviado: true }
  } catch (e) {
    return { enviado: false, motivo: e.message }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!admin) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY not configured' })

  const { action, payload } = req.body || {}

  try {
    // Ação pública — qualquer pessoa com o token (recebido por email/WhatsApp) pode confirmar.
    // Não requer sessão: é exatamente o que permite ao usuário definir a senha sem estar logado.
    if (action === 'confirmar') {
      const { token, password } = payload || {}
      if (!token || !password) return res.status(400).json({ error: 'token e password são obrigatórios' })
      if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' })

      const { data: convite, error: errConvite } = await admin
        .from('convites_senha')
        .select('*')
        .eq('token', token)
        .maybeSingle()

      if (errConvite || !convite) return res.status(400).json({ error: 'Link inválido.' })
      if (convite.used_at) return res.status(400).json({ error: 'Este link já foi usado. Peça um novo link de acesso.' })
      if (new Date(convite.expires_at) < new Date()) return res.status(400).json({ error: 'Este link expirou. Peça um novo link de acesso.' })

      const { data: perfil } = await admin
        .from('perfis')
        .select('user_id')
        .eq('email', convite.email)
        .maybeSingle()
      if (!perfil?.user_id) return res.status(400).json({ error: 'Usuário não encontrado.' })

      const { error: errUpdate } = await admin.auth.admin.updateUserById(perfil.user_id, { password })
      if (errUpdate) return res.status(500).json({ error: errUpdate.message })

      await admin.from('convites_senha').update({ used_at: new Date().toISOString() }).eq('id', convite.id)

      return res.status(200).json({ ok: true })
    }

    // Ações administrativas — exigem sessão de admin
    const caller = await requireAdmin(req)
    if (!caller) return res.status(403).json({ error: 'Acesso negado' })

    switch (action) {
      case 'criar': {
        const { email, nome, origin } = payload || {}
        if (!email || !origin) return res.status(400).json({ error: 'email e origin são obrigatórios' })

        const token = crypto.randomBytes(32).toString('hex')
        const expiresAt = new Date(Date.now() + TOKEN_TTL_HORAS * 60 * 60 * 1000).toISOString()

        const { error: errInsert } = await admin
          .from('convites_senha')
          .insert({ token, email, expires_at: expiresAt })
        if (errInsert) throw errInsert

        const link = `${origin}/definir-senha?token=${token}`
        const envio = await enviarEmailConvite(email, nome, link)

        return res.status(200).json({ link, email_enviado: envio.enviado, motivo_falha: envio.motivo ?? null })
      }
      default:
        return res.status(400).json({ error: 'Ação inválida' })
    }
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro interno' })
  }
}
