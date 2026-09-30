import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ASAAS_BASE = Deno.env.get('ASAAS_SANDBOX') === 'true'
  ? 'https://sandbox.asaas.com/api/v3'
  : 'https://api.asaas.com/v3'
const ASAAS_KEY = Deno.env.get('ASAAS_API_KEY') ?? ''
const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL') ?? 'https://api.centrodemusicamurilofinger.com'
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') ?? ''
const EVOLUTION_INSTANCE = Deno.env.get('EVOLUTION_INSTANCE') ?? 'CentroMusica'

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

async function enviarWhatsApp(telefone: string, mensagem: string): Promise<{ ok: boolean; detail?: string }> {
  const num = telefone.replace(/\D/g, '')
  const number = num.length >= 12 ? num : `55${num}`
  try {
    const resp = await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
      body: JSON.stringify({ number, text: mensagem }),
    })
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '')
      return { ok: false, detail: `HTTP ${resp.status}: ${txt.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, detail: e?.message ?? 'fetch error' }
  }
}

async function fetchPaymentDetails(chargeId: string): Promise<any | null> {
  try {
    const resp = await fetch(`${ASAAS_BASE}/payments/${chargeId}`, {
      headers: { access_token: ASAAS_KEY },
    })
    if (!resp.ok) return null
    return await resp.json()
  } catch {
    return null
  }
}

async function fetchPixCopyPaste(chargeId: string): Promise<string | null> {
  try {
    const resp = await fetch(`${ASAAS_BASE}/payments/${chargeId}/pixQrCode`, {
      headers: { access_token: ASAAS_KEY },
    })
    if (!resp.ok) return null
    const data = await resp.json()
    return data?.payload ?? null
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  let body: any
  try { body = await req.json() } catch { body = {} }

  const referencia = body.referencia ?? '2026-08-01'
  const dryRun = body.dry_run === true
  const excludeNames: string[] = body.exclude ?? []
  const limit: number = body.limit ?? 30
  const offset: number = body.offset ?? 0

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Buscar mensalidades pendentes com charge Asaas válido (pay_*)
  const { data: mensas, error: mErr } = await supabase
    .from('mensalidades')
    .select('id, aluno_id, asaas_charge_id, alunos(nome, telefone)')
    .eq('referencia', referencia)
    .in('status', ['pendente', 'atrasado'])
    .like('asaas_charge_id', 'pay_%')

  if (mErr) {
    return new Response(JSON.stringify({ ok: false, error: mErr.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  // Verificar quais já foram notificados
  const { data: jaEnviados } = await supabase
    .from('disparos_pendentes')
    .select('aluno_id')
    .eq('tipo', 'boleto_disponivel')
    .eq('status', 'enviado')
    .in('aluno_id', (mensas ?? []).map((m: any) => m.aluno_id))

  const enviadosSet = new Set((jaEnviados ?? []).map((d: any) => d.aluno_id))
  const excludeSet = new Set(excludeNames.map((n: string) => n.toLowerCase()))

  const pendentes = (mensas ?? []).filter((m: any) => {
    if (enviadosSet.has(m.aluno_id)) return false
    const nome = (m.alunos as any)?.nome ?? ''
    if (excludeSet.has(nome.toLowerCase())) return false
    if (!(m.alunos as any)?.telefone) return false
    return true
  })

  if (dryRun) {
    return new Response(JSON.stringify({
      ok: true,
      dry_run: true,
      total_pendentes: pendentes.length,
      ja_enviados: enviadosSet.size,
      alunos: pendentes.slice(offset, offset + limit).map((m: any) => ({
        nome: (m.alunos as any)?.nome,
        telefone: (m.alunos as any)?.telefone,
        charge_id: m.asaas_charge_id,
      })),
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  // Aplicar limit/offset para processar em lotes
  const lote = pendentes.slice(offset, offset + limit)

  const resultados: any[] = []
  let enviados = 0
  let erros = 0

  for (const m of lote) {
    const aluno = m.alunos as any
    const nome = (aluno.nome ?? '').split(' ')[0]

    // Buscar detalhes do pagamento no Asaas
    const payment = await fetchPaymentDetails(m.asaas_charge_id)
    if (!payment) {
      resultados.push({ nome: aluno.nome, status: 'erro', erro: 'payment_not_found' })
      erros++
      continue
    }

    const valor = formatBRL(payment.value ?? 0)
    const vencimento = formatDateBR(payment.dueDate ?? '')
    const linkCartao = payment.invoiceUrl ?? ''
    const pixCode = await fetchPixCopyPaste(m.asaas_charge_id)

    if (pixCode) {
      await supabase.from('mensalidades')
        .update({ asaas_pix_copy_paste: pixCode })
        .eq('id', m.id)
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

    const result = await enviarWhatsApp(aluno.telefone, msg)
    const sent = result.ok

    await supabase.from('disparos_pendentes').insert({
      aluno_id: m.aluno_id,
      tipo: 'boleto_disponivel',
      canal: 'whatsapp',
      mensagem: msg,
      telefone_destinatario: aluno.telefone,
      status: sent ? 'enviado' : 'erro',
      processado_em: new Date().toISOString(),
      erro: sent ? null : (result.detail ?? 'Falha Evolution API'),
    })

    resultados.push({ nome: aluno.nome, status: sent ? 'enviado' : 'erro', erro: sent ? undefined : result.detail })
    if (sent) enviados++
    else erros++

    // Delay entre envios
    await new Promise(r => setTimeout(r, 800))
  }

  return new Response(JSON.stringify({
    ok: true,
    enviados,
    erros,
    ja_notificados: enviadosSet.size,
    lote_atual: { offset, limit, processados: lote.length },
    total_pendentes: pendentes.length,
    restantes: Math.max(0, pendentes.length - offset - limit),
    resultados,
  }), { headers: { 'Content-Type': 'application/json' } })
})
