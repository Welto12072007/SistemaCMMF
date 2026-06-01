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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json()
    const { mensalidade_id } = body
    if (!mensalidade_id) throw new Error('mensalidade_id obrigatório')

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // ------------------------------------------------------------------
    // 1. Buscar mensalidade + aluno
    // ------------------------------------------------------------------
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

    // Se já tem cobrança ativa, retornar os links existentes
    if (mensa.asaas_charge_id) {
      return jsonResp({
        ok: true,
        existing: true,
        charge_id: mensa.asaas_charge_id,
        payment_url: mensa.asaas_payment_url,
        pix_copy_paste: mensa.asaas_pix_copy_paste,
      })
    }

    // ------------------------------------------------------------------
    // 2. Criar / recuperar customer Asaas
    // ------------------------------------------------------------------
    const aluno = (mensa as any).alunos
    let asaas_customer_id: string = aluno.asaas_customer_id ?? ''

    if (!asaas_customer_id) {
      const phone = (aluno.telefone ?? '').replace(/\D/g, '')
      const customerBody: Record<string, string> = {
        name: aluno.nome,
        externalReference: aluno.id,
      }
      if (aluno.email)                      customerBody.email = aluno.email
      if (aluno.cpf)                         customerBody.cpfCnpj = aluno.cpf.replace(/\D/g, '')
      if (phone.length >= 10)               customerBody.mobilePhone = phone

      // Verificar se já existe no Asaas pelo externalReference
      const searchResp = await fetch(
        `${ASAAS_BASE}/customers?externalReference=${aluno.id}`,
        { headers: { access_token: ASAAS_KEY } },
      )
      const searchData = await searchResp.json()

      if (searchData?.data?.length > 0) {
        asaas_customer_id = searchData.data[0].id
      } else {
        const custResp = await fetch(`${ASAAS_BASE}/customers`, {
          method: 'POST',
          headers: { access_token: ASAAS_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify(customerBody),
        })
        const custData = await custResp.json()
        if (!custResp.ok) throw new Error('Asaas customer error: ' + JSON.stringify(custData))
        asaas_customer_id = custData.id
      }

      // Persistir no banco
      await supabase.from('alunos').update({ asaas_customer_id }).eq('id', aluno.id)
    }

    // ------------------------------------------------------------------
    // 3. Criar cobrança
    // ------------------------------------------------------------------
    const valor = Number(mensa.valor) - Number(mensa.desconto ?? 0)
    const installmentCount: number = body.installment_count ?? 1

    const chargeBody: Record<string, unknown> = {
      customer: asaas_customer_id,
      billingType: 'CREDIT_CARD',
      value: valor,
      dueDate: mensa.data_vencimento,
      description: `Mensalidade ${mensa.referencia.substring(0, 7)} — CMMF`,
      externalReference: mensa.id,
    }
    if (installmentCount > 1) {
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

    // ------------------------------------------------------------------
    // 4. Salvar IDs na mensalidade
    // ------------------------------------------------------------------
    await supabase.from('mensalidades').update({
      asaas_charge_id:    chargeData.id,
      asaas_payment_url:  chargeData.invoiceUrl,
      asaas_billing_type: 'CREDIT_CARD',
      asaas_created_at:   new Date().toISOString(),
    }).eq('id', mensalidade_id)

    return jsonResp({
      ok: true,
      charge_id: chargeData.id,
      payment_url: chargeData.invoiceUrl,
      valor,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return jsonResp({ ok: false, error: msg }, 400)
  }
})
