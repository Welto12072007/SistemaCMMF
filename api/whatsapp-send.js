import { createClient } from '@supabase/supabase-js'

// Evolution API key/URL must NEVER be exposed to the browser — only read here, server-side.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.SB_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://api.centrodemusicamurilofinger.com'
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'CentroMusica'

const admin = SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

const ALLOWED_ROLES = ['admin', 'recepcao', 'professor']

async function requireStaff(req) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token || !admin) return null

  const anon = createClient(SUPABASE_URL, ANON_KEY)
  const { data: userData, error: userErr } = await anon.auth.getUser(token)
  if (userErr || !userData?.user) return null

  const { data: perfil } = await admin
    .from('perfis')
    .select('role, ativo')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (!perfil || !perfil.ativo || !ALLOWED_ROLES.includes(perfil.role)) return null
  return userData.user
}

// Actions suportadas, mapeadas pro endpoint real da Evolution API
const ENDPOINTS = {
  sendText: 'message/sendText',
  sendMedia: 'message/sendMedia',
  sendWhatsAppAudio: 'message/sendWhatsAppAudio',
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!EVOLUTION_KEY) return res.status(500).json({ error: 'EVOLUTION_API_KEY not configured' })

  const caller = await requireStaff(req)
  if (!caller) return res.status(403).json({ error: 'Acesso negado' })

  const { action, payload } = req.body || {}
  const path = ENDPOINTS[action]
  if (!path) return res.status(400).json({ error: 'action inválida' })

  try {
    const r = await fetch(`${EVOLUTION_URL}/${path}/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_KEY },
      body: JSON.stringify(payload || {}),
    })
    const data = await r.json().catch(() => ({}))
    return res.status(r.status).json(data)
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
