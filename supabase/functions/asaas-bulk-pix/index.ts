import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ASAAS_BASE = Deno.env.get('ASAAS_SANDBOX') === 'true'
  ? 'https://sandbox.asaas.com/api/v3'
  : 'https://api.asaas.com/v3'

const ASAAS_KEY          = Deno.env.get('ASAAS_API_KEY') ?? ''
const SUPABASE_URL        = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
// CNPJ do CMMF — usado como customer genérico para alunos sem CPF
const CMMF_CNPJ = '29247149000151'

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

// Busca ou cria customer no Asaas
async function getOrCreateCustomer(
  nome: string, telefone: string, email: string, alunoId: string, cpf?: string
): Promise<string> {
  const extRef = `aluno_${alunoId}`
  const searchResp = await fetch(
    `${ASAAS_BASE}/customers?externalReference=${extRef}`,
    { headers: { access_token: ASAAS_KEY } }
  )
  const searchData = await searchResp.json()
  if (searchData?.data?.length > 0) {
    const existing = searchData.data[0]
    // Se CPF foi fornecido mas não está no customer, atualizar
    if (cpf && !existing.cpfCnpj) {
      await fetch(`${ASAAS_BASE}/customers/${existing.id}`, {
        method: 'PUT',
        headers: { access_token: ASAAS_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpfCnpj: cpf.replace(/\D/g, '') }),
      })
    }
    return existing.id
  }

  const body: Record<string, string> = { name: nome, externalReference: extRef }
  const cleaned = telefone.replace(/\D/g, '')
  if (email) body.email = email
  if (cleaned.length >= 10) body.mobilePhone = cleaned
  if (cpf) body.cpfCnpj = cpf.replace(/\D/g, '')

  const custResp = await fetch(`${ASAAS_BASE}/customers`, {
    method: 'POST',
    headers: { access_token: ASAAS_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const custData = await custResp.json()
  if (!custResp.ok) throw new Error('Asaas customer: ' + JSON.stringify(custData))
  return custData.id
}

// Cria Payment Link do Asaas (para alunos sem CPF)
// O aluno informa o próprio CPF na página de pagamento
async function criarPaymentLink(
  valor: number,
  vencimento: string,
  descricao: string,
  extRef: string
): Promise<{ linkId: string; paymentUrl: string } | { error: string }> {
  // Data limite = vencimento + 30 dias
  const endDate = new Date(vencimento + 'T12:00:00')
  endDate.setDate(endDate.getDate() + 30)
  const endDateStr = endDate.toISOString().split('T')[0]

  const resp = await fetch(`${ASAAS_BASE}/paymentLinks`, {
    method: 'POST',
    headers: { access_token: ASAAS_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: descricao,
      billingType: 'UNDEFINED',
      chargeType: 'DETACHED',
      value: valor,
      externalReference: extRef,
      endDate: endDateStr,
      dueDateLimitDays: 7,
      notifications: [],           // desabilita email/SMS do Asaas (R$0,99 cada)
    }),
  })
  const data = await resp.json()
  if (!resp.ok) {
    const msg = data?.errors?.[0]?.description ?? JSON.stringify(data)
    console.error('Asaas paymentLink error:', msg)
    return { error: msg }
  }
  return { linkId: data.id, paymentUrl: data.url }
}

// Cria cobrança no Asaas com suporte a PIX e cartão de crédito
async function criarCobranca(
  customerId: string,
  valor: number,
  vencimento: string,
  descricao: string,
  extRef: string
): Promise<{ chargeId: string; paymentUrl: string } | { error: string }> {
  const chargeResp = await fetch(`${ASAAS_BASE}/payments`, {
    method: 'POST',
    headers: { access_token: ASAAS_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: customerId,
      billingType: 'UNDEFINED',   // aluno escolhe: PIX ou cartão
      value: valor,
      dueDate: vencimento,
      description: descricao,
      externalReference: extRef,
      notifications: [],           // desabilita email/SMS do Asaas (R$0,99 cada)
    }),
  })
  const data = await chargeResp.json()
  if (!chargeResp.ok) {
    const msg = data?.errors?.[0]?.description ?? JSON.stringify(data)
    console.error('Asaas charge error:', msg)
    return { error: msg }
  }
  return { chargeId: data.id, paymentUrl: data.invoiceUrl ?? '' }
}

// Busca PIX Copia e Cola
async function fetchPixPayload(chargeId: string): Promise<string | null> {
  try {
    const r = await fetch(`${ASAAS_BASE}/payments/${chargeId}/pixQrCode`, {
      headers: { access_token: ASAAS_KEY },
    })
    if (r.ok) {
      const d = await r.json()
      return d.payload ?? null
    }
  } catch (_) { /* PIX pode não estar disponível imediatamente */ }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return jsonResp({ error: 'Method not allowed' }, 405)

  try {
    const body = await req.json()
    // p_referencia: ex "2026-07-01"
    const { p_referencia } = body
    if (!p_referencia) return jsonResp({ error: 'p_referencia obrigatório' }, 400)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Buscar mensalidades pendentes sem charge Asaas ainda
    const { data: mensalidades, error: fetchErr } = await supabase
      .from('vw_mensalidades_aluno')
      .select('id,aluno_id,aluno_nome,aluno_telefone,aluno_email,aluno_cpf,valor,desconto,data_vencimento,referencia,aluno_instrumento')
      .eq('referencia', p_referencia)
      .in('status', ['pendente', 'atrasado'])
      .is('asaas_charge_id', null)

    if (fetchErr) return jsonResp({ error: fetchErr.message }, 500)
    if (!mensalidades || mensalidades.length === 0) {
      return jsonResp({ ok: true, criadas: 0, mensagem: 'Nenhuma mensalidade pendente sem cobrança Asaas' })
    }

    // Alunos com assinatura recorrente no Asaas já têm cobrança gerada automaticamente
    // pelo próprio Asaas todo mês — criar uma cobrança avulsa aqui duplicaria a cobrança
    const alunoIds = [...new Set(mensalidades.map((m) => m.aluno_id).filter(Boolean))]
    const { data: assinantes } = await supabase
      .from('alunos')
      .select('id')
      .in('id', alunoIds)
      .not('asaas_subscription_id', 'is', null)
    const idsComAssinatura = new Set((assinantes ?? []).map((a) => a.id))
    const puladosAssinatura = mensalidades.filter((m) => idsComAssinatura.has(m.aluno_id)).length
    const mensalidadesSemAssinatura = mensalidades.filter((m) => !idsComAssinatura.has(m.aluno_id))

    if (mensalidadesSemAssinatura.length === 0) {
      return jsonResp({ ok: true, criadas: 0, pulados_assinatura: puladosAssinatura, mensagem: 'Todas as mensalidades pendentes já são de alunos com assinatura recorrente (cobrança automática do Asaas)' })
    }

    let criadas = 0
    let erros = 0
    let sem_cpf = 0
    const resultados: Array<{ aluno: string; status: string; pix?: string; motivo?: string }> = []

    for (const m of mensalidadesSemAssinatura) {
      try {
        const nome    = m.aluno_nome ?? 'Aluno'
        const tel     = m.aluno_telefone ?? ''
        const email   = m.aluno_email ?? ''
        const cpf     = (m.aluno_cpf ?? '').replace(/\D/g, '')
        const valor   = Number(m.valor) - Number(m.desconto)
        const venc    = m.data_vencimento
        const instr   = m.aluno_instrumento ?? 'Música'
        const mesLabel = new Date(m.referencia + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

        // Criar/buscar customer (sem CPF = sem cobrança Asaas)
        if (!cpf) {
          // Sem CPF — criar Payment Link (não exige CPF, aluno informa na hora de pagar)
          const pl = await criarPaymentLink(
            valor, venc,
            `Mensalidade ${instr} — ${mesLabel} | ${nome}`,
            `mens_${m.id}`
          )
          if ('error' in pl) {
            erros++
            resultados.push({ aluno: nome, status: 'erro', motivo: pl.error })
          } else {
            await supabase.from('mensalidades').update({
              asaas_charge_id:   pl.linkId,
              asaas_payment_url: pl.paymentUrl,
              asaas_billing_type: 'PAYMENT_LINK',
            }).eq('id', m.id)
            sem_cpf++
            resultados.push({ aluno: nome, status: 'link', pix: pl.paymentUrl })
          }
          continue
        }
        const customerId = await getOrCreateCustomer(nome, tel, email, m.aluno_id, cpf)

        // Criar cobrança (PIX + cartão disponíveis)
        const charge = await criarCobranca(
          customerId,
          valor,
          venc,
          `Mensalidade ${instr} — ${mesLabel} | ${nome}`,
          `mens_${m.id}`
        )

        if ('error' in charge) {
          erros++
          resultados.push({ aluno: nome, status: 'erro', motivo: charge.error })
          continue
        }

        // Buscar PIX copia e cola (tentativa imediata, pode não estar disponível ainda)
        const pixPayload = await fetchPixPayload(charge.chargeId)

        // Salvar no banco
        await supabase
          .from('mensalidades')
          .update({
            asaas_charge_id:      charge.chargeId,
            asaas_payment_url:    charge.paymentUrl,
            asaas_billing_type:   'UNDEFINED',
            asaas_pix_copy_paste: pixPayload,
          })
          .eq('id', m.id)

        // Salvar customer_id no aluno para reutilizar
        if (m.aluno_id) {
          await supabase
            .from('alunos')
            .update({ asaas_customer_id: customerId })
            .eq('id', m.aluno_id)
            .is('asaas_customer_id', null)
        }

        criadas++
        resultados.push({ aluno: nome, status: 'ok', pix: pixPayload ? '✓' : 'aguardando' })
      } catch (err) {
        console.error(`Erro ao criar charge para mensalidade ${m.id}:`, err)
        erros++
        resultados.push({ aluno: m.aluno_nome ?? m.id, status: 'erro', motivo: String(err) })
      }
    }

    return jsonResp({ ok: true, criadas, erros, sem_cpf, pulados_assinatura: puladosAssinatura, total: mensalidadesSemAssinatura.length, resultados })
  } catch (err) {
    console.error('asaas-bulk-pix error:', err)
    return jsonResp({ error: String(err) }, 500)
  }
})
