export default async function handler(req, res) {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.ASAAS_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ASAAS_API_KEY not configured' })

  const { chargeId, subscriptionId, referencia } = req.body || {}
  if (!chargeId && !(subscriptionId && referencia)) {
    return res.status(400).json({ error: 'chargeId (ou subscriptionId + referencia) is required' })
  }

  const headers = { 'access_token': apiKey, 'Content-Type': 'application/json' }
  const BASE = 'https://api.asaas.com/v3'

  try {
    // Isenção do mês: cancela a cobrança em aberto que a assinatura gerou para o mês da referência
    if (!chargeId) {
      const ym = String(referencia).substring(0, 7)
      const list = await fetch(`${BASE}/payments?subscription=${encodeURIComponent(subscriptionId)}&limit=100`, { headers })
      const body = await list.json()
      if (!list.ok) return res.status(list.status).json({ error: body.errors?.[0]?.description || 'Erro ao consultar Asaas' })
      const alvo = (body.data || []).filter(p => String(p.dueDate).startsWith(ym) && ['PENDING', 'OVERDUE'].includes(p.status))
      for (const p of alvo) {
        const d = await fetch(`${BASE}/payments/${p.id}`, { method: 'DELETE', headers })
        if (!d.ok) {
          const err = await d.json()
          return res.status(d.status).json({ error: err.errors?.[0]?.description || 'Erro ao cancelar cobrança' })
        }
      }
      return res.status(200).json({ ok: true, canceladas: alvo.length })
    }

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
