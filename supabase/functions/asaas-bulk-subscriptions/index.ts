import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ASAAS_BASE = Deno.env.get('ASAAS_SANDBOX') === 'true'
  ? 'https://sandbox.asaas.com/api/v3'
  : 'https://api.asaas.com/v3'

const ASAAS_KEY = Deno.env.get('ASAAS_API_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

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

async function getOrCreateCustomer(
  nome: string, telefone: string, email: string, alunoId: string, cpf: string
): Promise<string> {
  const extRef = `aluno_${alunoId}`
  const searchResp = await fetch(`${ASAAS_BASE}/customers?externalReference=${extRef}`, {
    headers: { access_token: ASAAS_KEY },
  })
  const searchData = await searchResp.json()
  if (searchData?.data?.length > 0) {
    const existing = searchData.data[0]
    if (cpf && !existing.cpfCnpj) {
      await fetch(`${ASAAS_BASE}/customers/${existing.id}`, {
        method: 'PUT',
        headers: { access_token: ASAAS_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpfCnpj: cpf.replace(/\D/g, '') }),
      })
    }
    return existing.id
  }

  const body: Record<string, string> = { name: nome, externalReference: extRef, cpfCnpj: cpf.replace(/\D/g, '') }
  const tel = telefone.replace(/\D/g, '')
  if (tel.length >= 10) body.mobilePhone = tel
  if (email) body.email = email

  const resp = await fetch(`${ASAAS_BASE}/customers`, {
    method: 'POST',
    headers: { access_token: ASAAS_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error('Customer error: ' + JSON.stringify(data))
  return data.id
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json()
    const action: string = body.action ?? 'create_all'
    const nextDueDate: string = body.next_due_date ?? '2026-09-10'

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // ══════════════════════════════════════════════════════════════
    // FIX — corrigir nextDueDate de assinaturas existentes
    // ══════════════════════════════════════════════════════════════
    if (action === 'fix_dates') {
      const correctDate = body.correct_date ?? '2026-09-10'
      const { data: alunos } = await supabase
        .from('alunos')
        .select('id, nome, asaas_subscription_id')
        .not('asaas_subscription_id', 'is', null)

      let fixed = 0
      const results: Array<{ nome: string; status: string; error?: string }> = []
      for (const a of (alunos ?? [])) {
        try {
          const resp = await fetch(`${ASAAS_BASE}/subscriptions/${a.asaas_subscription_id}`, {
            method: 'PUT',
            headers: { access_token: ASAAS_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ nextDueDate: correctDate }),
          })
          if (resp.ok) {
            fixed++
            results.push({ nome: a.nome, status: 'ok' })
          } else {
            const err = await resp.json()
            results.push({ nome: a.nome, status: 'erro', error: err?.errors?.[0]?.description ?? JSON.stringify(err) })
          }
        } catch (e) {
          results.push({ nome: a.nome, status: 'erro', error: String(e) })
        }
      }
      return jsonResp({ ok: true, fixed, total: alunos?.length ?? 0, results })
    }

    // ══════════════════════════════════════════════════════════════
    // CREATE_ALL — criar assinaturas para todos os alunos sem uma
    // ══════════════════════════════════════════════════════════════
    const { data: alunos, error: fetchErr } = await supabase
      .from('alunos')
      .select('id, nome, telefone, email, cpf, valor_plano, instrumento_interesse, asaas_customer_id, asaas_subscription_id')
      .eq('status', 'ativo')
      .is('asaas_subscription_id', null)
      .not('valor_plano', 'is', null)
      .gt('valor_plano', 0)
      .order('nome')

    if (fetchErr) return jsonResp({ ok: false, error: fetchErr.message }, 500)
    if (!alunos || alunos.length === 0) {
      return jsonResp({ ok: true, criadas: 0, mensagem: 'Todos os alunos já têm assinatura' })
    }

    let criadas = 0
    let erros = 0
    let sem_cpf = 0
    const resultados: Array<{ nome: string; status: string; sub_id?: string; error?: string }> = []

    for (const a of alunos) {
      try {
        const cpf = (a.cpf ?? '').replace(/\D/g, '')
        const valor = Number(a.valor_plano)
        const instr = a.instrumento_interesse ?? 'Música'

        if (!cpf || cpf.length < 11) {
          sem_cpf++
          resultados.push({ nome: a.nome, status: 'sem_cpf' })
          continue
        }

        // Obter ou criar customer
        let customerId = a.asaas_customer_id
        if (!customerId) {
          customerId = await getOrCreateCustomer(
            a.nome, a.telefone ?? '', a.email ?? '', a.id, cpf
          )
          await supabase.from('alunos').update({ asaas_customer_id: customerId }).eq('id', a.id)
        } else {
          // Customer já existe — garantir que tem CPF no Asaas
          const custResp = await fetch(`${ASAAS_BASE}/customers/${customerId}`, {
            headers: { access_token: ASAAS_KEY },
          })
          if (custResp.ok) {
            const custData = await custResp.json()
            if (!custData.cpfCnpj && cpf) {
              await fetch(`${ASAAS_BASE}/customers/${customerId}`, {
                method: 'PUT',
                headers: { access_token: ASAAS_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({ cpfCnpj: cpf }),
              })
            }
          }
        }

        // Criar assinatura
        const subResp = await fetch(`${ASAAS_BASE}/subscriptions`, {
          method: 'POST',
          headers: { access_token: ASAAS_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer: customerId,
            billingType: 'UNDEFINED',
            value: valor,
            nextDueDate: nextDueDate,
            cycle: 'MONTHLY',
            description: `Mensalidade ${instr} — CMMF`,
            externalReference: `sub_${a.id}`,
            notifications: [],
          }),
        })
        const subData = await subResp.json()

        if (!subResp.ok) {
          const errMsg = subData?.errors?.[0]?.description ?? JSON.stringify(subData)
          erros++
          resultados.push({ nome: a.nome, status: 'erro', error: errMsg })
          continue
        }

        // Salvar no aluno
        await supabase.from('alunos')
          .update({ asaas_subscription_id: subData.id })
          .eq('id', a.id)

        criadas++
        resultados.push({ nome: a.nome, status: 'ok', sub_id: subData.id })
      } catch (e) {
        erros++
        resultados.push({ nome: a.nome, status: 'erro', error: String(e) })
      }
    }

    return jsonResp({ ok: true, criadas, erros, sem_cpf, total: alunos.length, resultados })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return jsonResp({ ok: false, error: msg }, 400)
  }
})
