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
      return res.status(200).json({ ok: true, data })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
