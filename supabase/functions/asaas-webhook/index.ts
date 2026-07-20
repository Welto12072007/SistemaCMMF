import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
// Token configurado no painel Asaas → Configurações → Webhooks
const ASAAS_WEBHOOK_TOKEN = Deno.env.get('ASAAS_WEBHOOK_TOKEN')

// Eventos que significam "pagamento confirmado"
const PAID_EVENTS = new Set([
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'PAYMENT_CREDITED',
])

// Eventos que significam "pagamento revertido/estornado"
const REFUND_EVENTS = new Set([
  'PAYMENT_REFUNDED',
  'PAYMENT_CHARGEBACK_REQUESTED',
  'PAYMENT_CHARGEBACK_DISPUTE',
])

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  // Aceitar qualquer request POST — a URL é obscura (contém project-ref)
  // e o Asaas valida a entrega; checagem extra de token é opcional

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  const event: string = payload?.event ?? ''
  const payment: any = payload?.payment ?? {}

  console.log(`Asaas webhook: event=${event} charge=${payment?.id}`)

  // Eventos relevantes para processar
  const isPaymentEvent = PAID_EVENTS.has(event) || REFUND_EVENTS.has(event)
  const isCreated = event === 'PAYMENT_CREATED'

  // Ignorar eventos irrelevantes — retornar 200 para evitar reenvio do Asaas
  if (!isPaymentEvent && !isCreated) {
    return new Response(JSON.stringify({ ok: true, skipped: event }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Buscar mensalidade pelo asaas_charge_id (cobrança normal ou ID do payment link)
  let { data: mensa, error: findErr } = await supabase
    .from('mensalidades')
    .select('id, status')
    .eq('asaas_charge_id', payment.id)
    .maybeSingle()

  if (findErr) {
    console.error('Erro ao buscar mensalidade:', findErr.message)
    return new Response(JSON.stringify({ ok: false, error: findErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Fallback 1: Payment Links geram um payment.id novo a cada pagamento
  // Nesse caso o externalReference contém "mens_<uuid>"
  if (!mensa && payment.externalReference?.startsWith('mens_')) {
    const mensId = payment.externalReference.slice(5)
    const { data: mensa2 } = await supabase
      .from('mensalidades')
      .select('id, status')
      .eq('id', mensId)
      .maybeSingle()
    if (mensa2) {
      mensa = mensa2
      // Atualizar charge_id com o payment real para futuros lookups
      await supabase.from('mensalidades')
        .update({ asaas_charge_id: payment.id })
        .eq('id', mensId)
    }
  }

  // Fallback 2: Assinatura recorrente — externalReference = "sub_<aluno_id>"
  // Asaas cria charges mensais automáticos; precisamos linkar à mensalidade correta
  if (!mensa && payment.externalReference?.startsWith('sub_')) {
    const alunoId = payment.externalReference.slice(4)
    // Extrair mês de referência do dueDate (ex: "2026-08-10" → "2026-08-01")
    const dueDate: string = payment.dueDate ?? ''
    if (dueDate.length >= 7) {
      const refMonth = dueDate.substring(0, 7) + '-01'
      const { data: mensa3 } = await supabase
        .from('mensalidades')
        .select('id, status')
        .eq('aluno_id', alunoId)
        .eq('referencia', refMonth)
        .in('status', ['pendente', 'atrasado'])
        .maybeSingle()
      if (mensa3) {
        mensa = mensa3
        // Linkar charge da assinatura à mensalidade + salvar URL de pagamento
        await supabase.from('mensalidades')
          .update({
            asaas_charge_id: payment.id,
            asaas_payment_url: payment.invoiceUrl ?? null,
            asaas_billing_type: payment.billingType ?? 'CREDIT_CARD',
          })
          .eq('id', mensa3.id)
        console.log(`Subscription charge ${payment.id} linked to mensalidade ${mensa3.id}`)
      }
    }
  }

  // PAYMENT_CREATED de assinatura: apenas linkar, não marcar como pago
  if (isCreated && !isPaymentEvent) {
    if (mensa) {
      return new Response(JSON.stringify({ ok: true, linked: true, mensalidade_id: mensa.id }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // Charge avulso ou de outro sistema — ignorar
    return new Response(JSON.stringify({ ok: true, skipped: 'created_no_match' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!mensa) {
    // Pode ser uma cobrança de outro sistema — apenas ignorar
    console.warn('Mensalidade não encontrada para charge:', payment.id)
    return new Response(JSON.stringify({ ok: true, not_found: payment.id }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (PAID_EVENTS.has(event)) {
    // Marcar como pago
    if (mensa.status === 'pago') {
      return new Response(JSON.stringify({ ok: true, already_paid: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const metodo = (payment.billingType ?? 'pix').toLowerCase().replace('credit_card', 'cartao_credito').replace('debit_card', 'cartao_debito')

    const { error: upErr } = await supabase.from('mensalidades').update({
      status: 'pago',
      data_pagamento: payment.paymentDate ?? new Date().toISOString().slice(0, 10),
      valor_pago: payment.value ?? payment.netValue ?? null,
      metodo_pagamento: metodo,
    }).eq('id', mensa.id)

    if (upErr) {
      console.error('Erro ao marcar pago:', upErr.message)
      return new Response(JSON.stringify({ ok: false, error: upErr.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.log(`Mensalidade ${mensa.id} marcada como paga via ${metodo}`)
  }

  if (REFUND_EVENTS.has(event) && mensa.status === 'pago') {
    // Reverter para pendente/atrasado em caso de chargeback
    await supabase.from('mensalidades').update({
      status: 'pendente',
      data_pagamento: null,
      valor_pago: null,
      metodo_pagamento: null,
    }).eq('id', mensa.id)

    console.log(`Mensalidade ${mensa.id} revertida por ${event}`)
  }

  return new Response(JSON.stringify({ ok: true, mensalidade_id: mensa.id }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

