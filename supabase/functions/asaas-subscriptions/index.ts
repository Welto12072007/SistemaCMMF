import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ASAAS_BASE = Deno.env.get('ASAAS_SANDBOX') === 'true'
  ? 'https://sandbox.asaas.com/api/v3'
  : 'https://api.asaas.com/v3'

const ASAAS_KEY = Deno.env.get('ASAAS_API_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

// ═══════════════════════════════════════════════════════════════
// LIST — lista assinaturas do Asaas (todas ou filtradas)
// ═══════════════════════════════════════════════════════════════
async function listSubscriptions(offset = 0, limit = 100, status?: string) {
  let url = `${ASAAS_BASE}/subscriptions?offset=${offset}&limit=${limit}`
  if (status) url += `&status=${status}`

  const resp = await fetch(url, {
    headers: { access_token: ASAAS_KEY },
  })
  if (!resp.ok) {
    const err = await resp.json()
    throw new Error('Asaas list error: ' + JSON.stringify(err))
  }
  return await resp.json()
}

// ═══════════════════════════════════════════════════════════════
// CREATE — criar nova assinatura recorrente
// ═══════════════════════════════════════════════════════════════
async function createSubscription(body: {
  aluno_id: string
  valor: number
  billing_type: string
  next_due_date: string
  cycle?: string
  descricao?: string
}) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Buscar dados do aluno
  const { data: aluno, error: alunoErr } = await supabase
    .from('alunos')
    .select('id, nome, telefone, email, cpf, asaas_customer_id, asaas_subscription_id, instrumento_interesse')
    .eq('id', body.aluno_id)
    .single()

  if (alunoErr || !aluno) throw new Error('Aluno não encontrado: ' + alunoErr?.message)

  // Se já tem assinatura ativa, retornar erro
  if (aluno.asaas_subscription_id) {
    // Verificar no Asaas se está ativa
    const checkResp = await fetch(`${ASAAS_BASE}/subscriptions/${aluno.asaas_subscription_id}`, {
      headers: { access_token: ASAAS_KEY },
    })
    if (checkResp.ok) {
      const subData = await checkResp.json()
      if (subData.status === 'ACTIVE') {
        return { ok: false, error: 'Aluno já tem assinatura ativa', existing_id: aluno.asaas_subscription_id }
      }
    }
  }

  // Obter ou criar customer no Asaas
  let customerId = aluno.asaas_customer_id
  if (!customerId) {
    const cpf = (aluno.cpf ?? '').replace(/\D/g, '')
    if (!cpf) {
      return { ok: false, error: 'Aluno sem CPF — necessário para assinatura recorrente' }
    }
    const customerBody: Record<string, string> = {
      name: aluno.nome,
      externalReference: aluno.id,
      cpfCnpj: cpf,
    }
    const tel = (aluno.telefone ?? '').replace(/\D/g, '')
    if (tel.length >= 10) customerBody.mobilePhone = tel
    if (aluno.email) customerBody.email = aluno.email

    const searchResp = await fetch(`${ASAAS_BASE}/customers?externalReference=${aluno.id}`, {
      headers: { access_token: ASAAS_KEY },
    })
    const searchData = await searchResp.json()
    if (searchData?.data?.length > 0) {
      customerId = searchData.data[0].id
    } else {
      const custResp = await fetch(`${ASAAS_BASE}/customers`, {
        method: 'POST',
        headers: { access_token: ASAAS_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(customerBody),
      })
      const custData = await custResp.json()
      if (!custResp.ok) throw new Error('Asaas customer error: ' + JSON.stringify(custData))
      customerId = custData.id
    }
    await supabase.from('alunos').update({ asaas_customer_id: customerId }).eq('id', aluno.id)
  }

  // Criar assinatura
  const instr = aluno.instrumento_interesse ?? 'Música'
  const subResp = await fetch(`${ASAAS_BASE}/subscriptions`, {
    method: 'POST',
    headers: { access_token: ASAAS_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: customerId,
      billingType: body.billing_type.toUpperCase(),
      value: body.valor,
      nextDueDate: body.next_due_date,
      cycle: body.cycle ?? 'MONTHLY',
      description: body.descricao ?? `Mensalidade ${instr} — CMMF`,
      externalReference: `sub_${aluno.id}`,
      notifications: [],
    }),
  })
  const subData = await subResp.json()
  if (!subResp.ok) throw new Error('Asaas subscription error: ' + JSON.stringify(subData))

  // Salvar no aluno
  await supabase.from('alunos').update({ asaas_subscription_id: subData.id }).eq('id', aluno.id)

  return {
    ok: true,
    subscription_id: subData.id,
    status: subData.status,
    next_due_date: subData.nextDueDate,
    value: subData.value,
  }
}

// ═══════════════════════════════════════════════════════════════
// CANCEL — cancelar assinatura
// ═══════════════════════════════════════════════════════════════
async function cancelSubscription(subscriptionId: string, alunoId?: string) {
  const resp = await fetch(`${ASAAS_BASE}/subscriptions/${subscriptionId}`, {
    method: 'DELETE',
    headers: { access_token: ASAAS_KEY },
  })

  if (!resp.ok) {
    const err = await resp.json()
    throw new Error('Asaas cancel error: ' + JSON.stringify(err))
  }

  // Limpar referência no aluno
  if (alunoId) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    await supabase.from('alunos').update({ asaas_subscription_id: null }).eq('id', alunoId)
  }

  return { ok: true, cancelled: subscriptionId }
}

// ═══════════════════════════════════════════════════════════════
// UPDATE — atualizar valor ou billing type
// ═══════════════════════════════════════════════════════════════
async function updateSubscription(subscriptionId: string, updates: { value?: number; billingType?: string; nextDueDate?: string }) {
  const body: Record<string, unknown> = {}
  if (updates.value !== undefined) body.value = updates.value
  if (updates.billingType) body.billingType = updates.billingType
  if (updates.nextDueDate) body.nextDueDate = updates.nextDueDate

  const resp = await fetch(`${ASAAS_BASE}/subscriptions/${subscriptionId}`, {
    method: 'PUT',
    headers: { access_token: ASAAS_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const err = await resp.json()
    throw new Error('Asaas update error: ' + JSON.stringify(err))
  }

  const data = await resp.json()
  return { ok: true, subscription: data }
}

// ═══════════════════════════════════════════════════════════════
// GET — detalhes de uma assinatura + pagamentos
// ═══════════════════════════════════════════════════════════════
async function getSubscription(subscriptionId: string) {
  const resp = await fetch(`${ASAAS_BASE}/subscriptions/${subscriptionId}`, {
    headers: { access_token: ASAAS_KEY },
  })
  if (!resp.ok) {
    const err = await resp.json()
    throw new Error('Asaas get error: ' + JSON.stringify(err))
  }
  const sub = await resp.json()

  // Buscar pagamentos da assinatura
  const paymentsResp = await fetch(`${ASAAS_BASE}/subscriptions/${subscriptionId}/payments?limit=12`, {
    headers: { access_token: ASAAS_KEY },
  })
  let payments: unknown[] = []
  if (paymentsResp.ok) {
    const pData = await paymentsResp.json()
    payments = pData.data ?? []
  }

  return { ok: true, subscription: sub, payments }
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json()
    const action: string = body.action ?? 'list'

    switch (action) {
      case 'list': {
        const data = await listSubscriptions(body.offset ?? 0, body.limit ?? 100, body.status)
        // Enriquecer com dados dos alunos do Supabase
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        const { data: alunos } = await supabase
          .from('alunos')
          .select('id, nome, telefone, instrumento_interesse, asaas_subscription_id, asaas_customer_id, valor_plano, status')
          .not('asaas_subscription_id', 'is', null)

        const alunoMap = new Map<string, any>()
        for (const a of (alunos ?? [])) {
          if (a.asaas_subscription_id) alunoMap.set(a.asaas_subscription_id, a)
        }

        const enriched = (data.data ?? []).map((sub: any) => ({
          ...sub,
          aluno: alunoMap.get(sub.id) ?? null,
        }))

        return jsonResp({ ok: true, data: enriched, totalCount: data.totalCount, hasMore: data.hasMore })
      }

      case 'create':
        return jsonResp(await createSubscription(body))

      case 'cancel':
        if (!body.subscription_id) return jsonResp({ ok: false, error: 'subscription_id obrigatório' }, 400)
        return jsonResp(await cancelSubscription(body.subscription_id, body.aluno_id))

      case 'update':
        if (!body.subscription_id) return jsonResp({ ok: false, error: 'subscription_id obrigatório' }, 400)
        return jsonResp(await updateSubscription(body.subscription_id, {
          value: body.valor,
          billingType: body.billing_type,
          nextDueDate: body.next_due_date,
        }))

      case 'get':
        if (!body.subscription_id) return jsonResp({ ok: false, error: 'subscription_id obrigatório' }, 400)
        return jsonResp(await getSubscription(body.subscription_id))

      default:
        return jsonResp({ ok: false, error: `Ação desconhecida: ${action}` }, 400)
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return jsonResp({ ok: false, error: msg }, 400)
  }
})
