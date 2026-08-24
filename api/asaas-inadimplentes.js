export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ASAAS_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ASAAS_API_KEY not configured' })

  try {
    // Fetch all overdue payments (paginated)
    let allPayments = []
    let offset = 0
    let hasMore = true
    while (hasMore) {
      const resp = await fetch(`https://api.asaas.com/v3/payments?status=OVERDUE&limit=100&offset=${offset}`, {
        headers: { 'access_token': apiKey },
      })
      const data = await resp.json()
      const items = data.data || []
      allPayments.push(...items)
      hasMore = data.hasMore === true
      offset += 100
    }

    // Group by customer
    const grouped = {}
    for (const p of allPayments) {
      const cid = p.customer
      if (!grouped[cid]) {
        grouped[cid] = { customerId: cid, total: 0, count: 0, oldest: '', charges: [], subscription: !!p.subscription }
      }
      grouped[cid].total += p.value
      grouped[cid].count += 1
      if (!grouped[cid].oldest || p.dueDate < grouped[cid].oldest) grouped[cid].oldest = p.dueDate
      grouped[cid].charges.push({ id: p.id, value: p.value, dueDate: p.dueDate, description: p.description || '' })
    }

    // Fetch customer names in parallel (batches of 10)
    const customerIds = Object.keys(grouped)
    const batchSize = 10
    for (let i = 0; i < customerIds.length; i += batchSize) {
      const batch = customerIds.slice(i, i + batchSize)
      const promises = batch.map(cid => 
        fetch(`https://api.asaas.com/v3/customers/${cid}`, { headers: { 'access_token': apiKey } })
          .then(r => r.json())
          .then(c => ({ cid, name: c.name || '?', cpfCnpj: c.cpfCnpj || '', phone: c.mobilePhone || c.phone || '' }))
          .catch(() => ({ cid, name: '?', cpfCnpj: '', phone: '' }))
      )
      const results = await Promise.all(promises)
      for (const r of results) {
        grouped[r.cid].name = r.name
        grouped[r.cid].cpfCnpj = r.cpfCnpj
        grouped[r.cid].phone = r.phone
      }
    }

    const result = Object.values(grouped).sort((a, b) => b.total - a.total)
    const today = new Date().toISOString().split('T')[0]

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    return res.status(200).json({
      total: allPayments.length,
      customers: result.length,
      totalValue: allPayments.reduce((s, p) => s + p.value, 0),
      date: today,
      data: result,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
