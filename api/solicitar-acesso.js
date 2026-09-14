import { createClient } from '@supabase/supabase-js'

// Public endpoint: self-service access request. Validates against the school's
// records via RPC before creating any Auth user — no admin session required,
// but the service role key stays server-side.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SB_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!SERVICE_KEY) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY not configured' })

  const { email, redirectTo } = req.body || {}
  if (!email) return res.status(400).json({ error: 'email é obrigatório' })
  const normalizedEmail = email.trim().toLowerCase()

  const anon = createClient(SUPABASE_URL, ANON_KEY)
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

  try {
    const { data: validacao, error: rpcErr } = await anon.rpc('validar_email_acesso', { p_email: normalizedEmail })
    if (rpcErr) return res.status(500).json({ error: 'Erro ao verificar email' })
    if (!validacao?.ok) {
      return res.status(200).json({ ok: false, motivo: validacao?.motivo ?? 'nao_encontrado' })
    }

    const { role, nome, ref_id } = validacao

    const { data: created, error: errCreate } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password: crypto.randomUUID(),
      email_confirm: true,
      user_metadata: { nome, role },
    })

    if (errCreate) {
      if (errCreate.message?.includes('already been registered')) {
        await anon.auth.resetPasswordForEmail(normalizedEmail, { redirectTo })
        return res.status(200).json({ ok: true, nome })
      }
      return res.status(500).json({ error: 'Erro ao criar acesso: ' + errCreate.message })
    }
    if (!created?.user) return res.status(500).json({ error: 'Erro inesperado ao criar conta.' })

    await admin.from('perfis').insert({
      user_id: created.user.id,
      nome,
      email: normalizedEmail,
      role,
      professor_id: role === 'professor' ? ref_id : null,
      ativo: true,
    })

    await anon.auth.resetPasswordForEmail(normalizedEmail, { redirectTo })

    return res.status(200).json({ ok: true, nome })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro interno' })
  }
}
