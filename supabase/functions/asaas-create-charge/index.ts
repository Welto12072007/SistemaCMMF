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

async function getOrCreateCustomer(name: string, phone: string, email: string, externalRef: string): Promise<string> {
  const customerBody: Record<string, string> = { name, externalReference: externalRef }
  const cleaned = phone.replace(/\D/g, '')
  if (email) customerBody.email = email
  if (cleaned.length >= 10) customerBody.mobilePhone = cleaned

  const searchResp = await fetch(`${ASAAS_BASE}/customers?externalReference=${externalRef}`, {
    headers: { access_token: ASAAS_KEY },
  })
  const searchData = await searchResp.json()
  if (searchData?.data?.length > 0) return searchData.data[0].id

  const custResp = await fetch(`${ASAAS_BASE}/customers`, {
    method: 'POST',
    headers: { access_token: ASAAS_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(customerBody),
  })
  const custData = await custResp.json()
  if (!custResp.ok) throw new Error('Asaas customer error: ' + JSON.stringify(custData))
  return custData.id
}

async function fetchPixPayload(chargeId: string): Promise<string | null> {
  try {
    const pixResp = await fetch(`${ASAAS_BASE}/payments/${chargeId}/pixQrCode`, {
      headers: { access_token: ASAAS_KEY },
    })
    if (pixResp.ok) {
      const pixData = await pixResp.json()
      return pixData.payload ?? null
    }
  } catch (_) { /* PIX pode não estar disponível imediatamente */ }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json()
    const billing_type: string = (body.billing_type ?? 'CREDIT_CARD').toUpperCase()
    const isPix = billing_type === 'PIX'

    // ══════════════════════════════════════════════════════════════════
    // MODO AVULSO — cobrança para pessoa não cadastrada no sistema
    // ══════════════════════════════════════════════════════════════════
    if (body.avulsa) {
      const { nome, telefone, email = '', valor, vencimento, descricao = 'Cobrança CMMF' } = body
      if (!nome || !valor || !vencimento) throw new Error('nome, valor e vencimento são obrigatórios')

      const extRef = `avulsa_${telefone.replace(/\D/g, '')}_${Date.now()}`
      const customerId = await getOrCreateCustomer(nome, telefone ?? '', email, extRef)

      const chargeResp = await fetch(`${ASAAS_BASE}/payments`, {
        method: 'POST',
        headers: { access_token: ASAAS_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: customerId,
          billingType: billing_type,
          value: Number(valor),
          dueDate: vencimento,
          description: descricao,
          externalReference: extRef,
        }),
      })
      const chargeData = await chargeResp.json()
      if (!chargeResp.ok) throw new Error('Asaas charge error: ' + JSON.stringify(chargeData))

      const pix_copy_paste = isPix ? await fetchPixPayload(chargeData.id) : null

      return jsonResp({
        ok: true,
        charge_id: chargeData.id,
        payment_url: chargeData.invoiceUrl,
        pix_copy_paste,
        valor: Number(valor),
      })
    }

    // ══════════════════════════════════════════════════════════════════
    // MODO MENSALIDADE — aluno cadastrado no sistema
    // ══════════════════════════════════════════════════════════════════
    const { mensalidade_id } = body
    if (!mensalidade_id) throw new Error('mensalidade_id ou avulsa=true é obrigatório')

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    const { data: mensa, error: mensaErr } = await supabase
      .from('mensalidades')
      .select(`
        id, aluno_id, valor, desconto, data_vencimento, referencia,
        asaas_charge_id, asaas_payment_url, asaas_pix_copy_paste,
        alunos!inner(id, nome, telefone, email, cpf, asaas_customer_id)
      `)
      .eq('id', mensalidade_id)
      .single()

    if (mensaErr || !mensa) throw new Error('Mensalidade não encontrada: ' + mensaErr?.message)

    if (mensa.asaas_charge_id) {
      return jsonResp({
        ok: true,
        existing: true,
        charge_id: mensa.asaas_charge_id,
        payment_url: mensa.asaas_payment_url,
        pix_copy_paste: mensa.asaas_pix_copy_paste,
      })
    }

    const aluno = (mensa as any).alunos
    let asaas_customer_id: string = aluno.asaas_customer_id ?? ''

    if (!asaas_customer_id) {
      asaas_customer_id = await getOrCreateCustomer(aluno.nome, aluno.telefone ?? '', aluno.email ?? '', aluno.id)
      await supabase.from('alunos').update({ asaas_customer_id }).eq('id', aluno.id)
    }

    const valor = Number(mensa.valor) - Number(mensa.desconto ?? 0)
    const installmentCount: number = body.installment_count ?? 1

    const chargeBody: Record<string, unknown> = {
      customer: asaas_customer_id,
      billingType: billing_type,
      value: valor,
      dueDate: mensa.data_vencimento,
      description: `Mensalidade ${mensa.referencia.substring(0, 7)} — CMMF`,
      externalReference: mensa.id,
    }
    if (!isPix && installmentCount > 1) {
      chargeBody.installmentCount = installmentCount
      chargeBody.installmentValue = parseFloat((valor / installmentCount).toFixed(2))
    }

    const chargeResp = await fetch(`${ASAAS_BASE}/payments`, {
      method: 'POST',
      headers: { access_token: ASAAS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(chargeBody),
    })
    const chargeData = await chargeResp.json()
    if (!chargeResp.ok) throw new Error('Asaas charge error: ' + JSON.stringify(chargeData))

    const pix_copy_paste = isPix ? await fetchPixPayload(chargeData.id) : null

    await supabase.from('mensalidades').update({
      asaas_charge_id:      chargeData.id,
      asaas_payment_url:    chargeData.invoiceUrl,
      asaas_pix_copy_paste: pix_copy_paste,
      asaas_billing_type:   billing_type,
      asaas_created_at:     new Date().toISOString(),
    }).eq('id', mensalidade_id)

    return jsonResp({
      ok: true,
      charge_id: chargeData.id,
      payment_url: chargeData.invoiceUrl,
      pix_copy_paste,
      valor,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return jsonResp({ ok: false, error: msg }, 400)
  }
})
