// Mantém o contrato antigo do frontend (action sendText/sendMedia/sendWhatsAppAudio) e repassa
// para a Edge Function whatsapp-send (API oficial da Meta). Autenticação é feita lá, com o token do usuário.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL

function traduzir(action, p = {}) {
  if (action === 'sendText') return { to: p.number, texto: p.text }
  if (action === 'sendWhatsAppAudio') return { to: p.number, midia: { tipo: 'audio', url: p.audio } }
  if (action === 'sendMedia') {
    const tipo = ['image', 'video', 'audio', 'document'].includes(p.mediatype) ? p.mediatype : 'document'
    return { to: p.number, midia: { tipo, url: p.media, legenda: p.caption, nomeArquivo: p.fileName } }
  }
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { action, payload } = req.body || {}
  const body = traduzir(action, payload)
  if (!body) return res.status(400).json({ error: 'action inválida' })

  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: req.headers.authorization || '' },
      body: JSON.stringify(body),
    })
    const data = await r.json().catch(() => ({}))
    return res.status(r.status).json(data)
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
