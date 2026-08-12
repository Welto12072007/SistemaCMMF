export default async function handler(req, res) {
  const apiKey = process.env.ASAAS_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ASAAS_API_KEY not configured' })

  const headers = { 'access_token': apiKey, 'Content-Type': 'application/json' }
  const BASE = 'https://api.asaas.com/v3'

  if (req.method === 'GET') {
    try {
      let allSubs = []
      let offset = 0
      let hasMore = true
      while (hasMore) {
        const resp = await fetch(`${BASE}/subscriptions?status=ACTIVE&limit=100&offset=${offset}`, { headers })
        const data = await resp.json()
        allSubs.push(...(data.data || []))
        hasMore = data.hasMore === true
        offset += 100
      }

      const batchSize = 10
      const customerIds = [...new Set(allSubs.map(s => s.customer))]
      const custMap = {}
      for (let i = 0; i < customerIds.length; i += batchSize) {
        const batch = customerIds.slice(i, i + batchSize)
        const results = await Promise.all(
          batch.map(cid =>
            fetch(`${BASE}/customers/${cid}`, { headers })
              .then(r => r.json())
              .then(c => ({ cid, name: c.name || '?', cpfCnpj: c.cpfCnpj || '', phone: c.mobilePhone || c.phone || '' }))
              .catch(() => ({ cid, name: '?', cpfCnpj: '', phone: '' }))
          )
        )
        for (const r of results) custMap[r.cid] = r
      }

      const result = allSubs.map(s => ({
        id: s.id,
        customer: s.customer,
        name: custMap[s.customer]?.name || '?',
        cpfCnpj: custMap[s.customer]?.cpfCnpj || '',
        phone: custMap[s.customer]?.phone || '',
        value: s.value,
        cycle: s.cycle,
        nextDueDate: s.nextDueDate,
        billingType: s.billingType,
        status: s.status,
        description: s.description || '',
      })).sort((a, b) => a.name.localeCompare(b.name))

      res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300')
      return res.status(200).json({ total: result.length, data: result })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  if (req.method === 'PUT') {
    const { id, value, nextDueDate, billingType, description } = req.body || {}
    if (!id) return res.status(400).json({ error: 'id is required' })

    const update = {}
    if (value !== undefined) update.value = value
    if (nextDueDate !== undefined) update.nextDueDate = nextDueDate
    if (billingType !== undefined) update.billingType = billingType
    if (description !== undefined) update.description = description

    try {
      const resp = await fetch(`${BASE}/subscriptions/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(update),
      })
      if (!resp.ok) {
        const err = await resp.json()
        return res.status(resp.status).json({ error: err.errors?.[0]?.description || 'Erro ao atualizar' })
      }
      const data = await resp.json()

      // After update, remove duplicate PENDING charges for same due date
      const paysResp = await fetch(`${BASE}/subscriptions/${id}/payments?limit=30`, { headers })
      const pays = await paysResp.json()
      const byDate = {}
      for (const p of (pays.data || [])) {
        if (!byDate[p.dueDate]) byDate[p.dueDate] = []
        byDate[p.dueDate].push(p)
      }
      let deleted = 0
      for (const [, charges] of Object.entries(byDate)) {
        if (charges.length <= 1) continue
        const pending = charges.filter(c => c.status === 'PENDING')
        // Keep one pending, delete extras
        for (let i = 1; i < pending.length; i++) {
          await fetch(`${BASE}/payments/${pending[i].id}`, { method: 'DELETE', headers })
          deleted++
        }
      }

      return res.status(200).json({ ok: true, data, duplicatesRemoved: deleted })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  if (req.method === 'POST') {
    const { customer, value, dueDate, billingType, description } = req.body || {}
    if (!customer || !value || !dueDate) {
      return res.status(400).json({ error: 'customer, value and dueDate are required' })
    }

    try {
      const resp = await fetch(`${BASE}/payments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customer,
          value,
          dueDate,
          billingType: billingType || 'BOLETO',
          description: description || 'Mensalidade mensal — CMMF',
        }),
      })
      if (!resp.ok) {
        const err = await resp.json()
        return res.status(resp.status).json({ error: err.errors?.[0]?.description || 'Erro ao gerar cobrança' })
      }
      const data = await resp.json()
      return res.status(200).json({ ok: true, data })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
