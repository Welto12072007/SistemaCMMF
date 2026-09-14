import { createClient } from '@supabase/supabase-js'

// Service role key must NEVER be exposed to the browser — only read here, server-side.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SB_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

const admin = SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!admin) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY not configured' })

  const caller = await requireAdmin(req)
  if (!caller) return res.status(403).json({ error: 'Acesso negado' })

  const { action, payload } = req.body || {}

  try {
    switch (action) {
      case 'listUsers': {
        const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 })
        if (error) throw error
        return res.status(200).json({
          users: (data?.users || []).map((u) => ({ id: u.id, last_sign_in_at: u.last_sign_in_at ?? null })),
        })
      }
      case 'createUser': {
        const { email, nome, role } = payload || {}
        if (!email || !role) return res.status(400).json({ error: 'email e role são obrigatórios' })
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password: crypto.randomUUID(),
          email_confirm: true,
          user_metadata: { nome, role },
        })
        if (error) return res.status(409).json({ error: error.message })
        return res.status(200).json({ user: { id: data.user.id } })
      }
      case 'deleteUser': {
        const { userId } = payload || {}
        if (!userId) return res.status(400).json({ error: 'userId é obrigatório' })
        const { error } = await admin.auth.admin.deleteUser(userId)
        if (error) throw error
        return res.status(200).json({ ok: true })
      }
      case 'generateLink': {
        const { email, redirectTo } = payload || {}
        if (!email) return res.status(400).json({ error: 'email é obrigatório' })
        const { data, error } = await admin.auth.admin.generateLink({
          type: 'recovery',
          email,
          options: { redirectTo },
        })
        if (error) throw error
        return res.status(200).json({ action_link: data.properties?.action_link ?? null })
      }
      default:
        return res.status(400).json({ error: 'Ação inválida' })
    }
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro interno' })
  }
}
