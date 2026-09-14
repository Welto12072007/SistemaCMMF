import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ASAAS_WEBHOOK_TOKEN = Deno.env.get('ASAAS_WEBHOOK_TOKEN')

const ASAAS_BASE = Deno.env.get('ASAAS_SANDBOX') === 'true'
  ? 'https://sandbox.asaas.com/api/v3'
  : 'https://api.asaas.com/v3'
const ASAAS_KEY = Deno.env.get('ASAAS_API_KEY') ?? ''

const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL') ?? 'https://api.centrodemusicamurilofinger.com'
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') ?? 'CentroMusica2026ApiKey'
const EVOLUTION_INSTANCE = Deno.env.get('EVOLUTION_INSTANCE') ?? 'CentroMusica'

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

function saudacao(): string {
  const h = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false })
  const hora = parseInt(h, 10)
  if (hora >= 6 && hora < 12) return 'Bom dia'
  if (hora >= 12 && hora < 18) return 'Boa tarde'
  return 'Boa noite'
}

function formatDateBR(date: string): string {
  if (!date) return ''
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y}`
}

function formatBRL(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function enviarWhatsApp(telefone: string, mensagem: string): Promise<boolean> {
  const num = telefone.replace(/\D/g, '')
  const number = num.length >= 12 ? num : `55${num}`
  try {
    const resp = await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
      body: JSON.stringify({ number, text: mensagem }),
    })
    return resp.ok
  } catch {
    return false
  }
}

async function fetchPixCopyPaste(paymentId: string): Promise<string | null> {
  try {
    const resp = await fetch(`${ASAAS_BASE}/payments/${paymentId}/pixQrCode`, {
      headers: { access_token: ASAAS_KEY },
    })
    if (!resp.ok) return null
    const data = await resp.json()
    return data?.payload ?? null
  } catch {
    return null
  }
}

async function notificarAluno(supabase: any, payment: any, mensaId: string, alunoId: string) {
  const { data: aluno } = await supabase
    .from('alunos')
    .select('nome, telefone')
    .eq('id', alunoId)
    .single()
  if (!aluno?.telefone) return

  const nome = (aluno.nome ?? '').split(' ')[0]
  const valor = formatBRL(payment.value ?? 0)
  const vencimento = formatDateBR(payment.dueDate ?? '')
  const linkCartao = payment.invoiceUrl ?? ''

  const pixCode = await fetchPixCopyPaste(payment.id)

  if (pixCode) {
    await supabase.from('mensalidades')
      .update({ asaas_pix_copy_paste: pixCode })
      .eq('id', mensaId)
  }

  const msg =
    `${saudacao()} ${nome}! 🎼💙\n\n` +
    `Sua mensalidade do Centro de Música Murilo Finger já está disponível.\n\n` +
    `💰 Valor: R$ ${valor}\n` +
    `📅 Vencimento: ${vencimento}\n\n` +
    `Escolha a forma de pagamento mais conveniente:\n` +
    `💳 Cartão: ${linkCartao}\n` +
    (pixCode ? `📲 PIX Copia e Cola: ${pixCode}\n` : '') +
    `\n⚠️ Importante: caso faça o pagamento para nossa chave pix, envie o comprovante respondendo esta mensagem para que possamos identificar e registrar o pagamento em nosso sistema.\n\n` +
    `Agradecemos por fazer parte do CMMF. Desejamos ótimos estudos! 🎶💙`

  const sent = await enviarWhatsApp(aluno.telefone, msg)
  console.log(`WhatsApp ${sent ? 'enviado' : 'FALHOU'} para ${aluno.nome} (${aluno.telefone})`)

  // Logar no disparos_pendentes
  await supabase.from('disparos_pendentes').insert({
    aluno_id: alunoId,
    tipo: 'boleto_disponivel',
    canal: 'whatsapp',
    mensagem: msg,
    telefone_destinatario: aluno.telefone,
    status: sent ? 'enviado' : 'erro',
    processado_em: new Date().toISOString(),
    erro: sent ? null : 'Falha no envio Evolution API',
  })
}

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

  try {
  // Buscar mensalidade pelo asaas_charge_id (cobrança normal ou ID do payment link)
  let { data: mensa, error: findErr } = await supabase
    .from('mensalidades')
    .select('id, status')
    .eq('asaas_charge_id', payment.id)
    .maybeSingle()

  if (findErr) {
    console.error('Erro ao buscar mensalidade:', findErr.message)
    // Nunca retornar 500 pro Asaas: isso faz a plataforma pausar a sincronização de webhooks
    return new Response(JSON.stringify({ ok: false, error: findErr.message }), {
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

  // PAYMENT_CREATED de assinatura: linkar + notificar aluno via WhatsApp
  if (isCreated && !isPaymentEvent) {
    if (mensa && payment.externalReference?.startsWith('sub_')) {
      const alunoId = payment.externalReference.slice(4)
      // Enviar notificação WhatsApp em background (não bloquear resposta ao Asaas)
      const edgeCtx = { waitUntil: (p: Promise<any>) => p.catch(e => console.error('notificar erro:', e)) }
      edgeCtx.waitUntil(notificarAluno(supabase, payment, mensa.id, alunoId))
      return new Response(JSON.stringify({ ok: true, linked: true, notified: true, mensalidade_id: mensa.id }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
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
      // Nunca retornar 500 pro Asaas: isso faz a plataforma pausar a sincronização de webhooks
      return new Response(JSON.stringify({ ok: false, error: upErr.message }), {
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
  } catch (e) {
    // Qualquer exceção não tratada aqui (rede, etc.) travava a função e virava 500 pro Asaas,
    // fazendo a Asaas pausar a sincronização de webhooks após falhas repetidas. Logamos e
    // respondemos 200 mesmo assim — o pagamento fica só sem sincronizar dessa vez.
    console.error('Erro inesperado no webhook Asaas:', e instanceof Error ? e.message : e)
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

