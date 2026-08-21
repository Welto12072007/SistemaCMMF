export default async function handler(req, res) {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.ASAAS_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ASAAS_API_KEY not configured' })

  const { chargeId } = req.body || {}
  if (!chargeId) return res.status(400).json({ error: 'chargeId is required' })

  const headers = { 'access_token': apiKey, 'Content-Type': 'application/json' }
  const BASE = 'https://api.asaas.com/v3'

  try {
    const check = await fetch(`${BASE}/payments/${chargeId}`, { headers })
    if (check.status === 404) {
      return res.status(200).json({ ok: true, alreadyGone: true })
    }
    const charge = await check.json()

    if (['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(charge.status)) {
      return res.status(409).json({ error: 'Cobrança já foi paga — não pode ser cancelada' })
    }

    const resp = await fetch(`${BASE}/payments/${chargeId}`, { method: 'DELETE', headers })
    if (!resp.ok) {
      const err = await resp.json()
      return res.status(resp.status).json({ error: err.errors?.[0]?.description || 'Erro ao cancelar cobrança' })
    }

    return res.status(200).json({ ok: true, deleted: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
