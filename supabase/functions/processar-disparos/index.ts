import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL') ?? 'https://api.centrodemusicamurilofinger.com'
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') ?? 'CentroMusica2026ApiKey'
const EVOLUTION_INSTANCE = Deno.env.get('EVOLUTION_INSTANCE') ?? 'CentroMusica'

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

async function enviarWhatsApp(telefone: string, mensagem: string): Promise<{ ok: boolean; error?: string }> {
  const num = telefone.replace(/\D/g, '')
  const remoteJid = num.length === 12 || num.length === 13
    ? `${num}@s.whatsapp.net`
    : `55${num}@s.whatsapp.net`

  try {
    const resp = await fetch(
      `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: EVOLUTION_API_KEY,
        },
        body: JSON.stringify({
          number: remoteJid.replace('@s.whatsapp.net', ''),
          text: mensagem,
        }),
      }
    )
    if (!resp.ok) {
      const errData = await resp.text()
      return { ok: false, error: `HTTP ${resp.status}: ${errData.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Buscar disparos pendentes (limite de 20 por execução para não estourar timeout)
  const { data: pendentes, error: fetchErr } = await supabase
    .from('disparos_pendentes')
    .select('id, telefone_destinatario, mensagem, tipo, aluno_id')
    .eq('status', 'pendente')
    .order('criado_em', { ascending: true })
    .limit(20)

  if (fetchErr) return jsonResp({ ok: false, error: fetchErr.message }, 500)
  if (!pendentes || pendentes.length === 0) {
    return jsonResp({ ok: true, enviados: 0, mensagem: 'Nenhum disparo pendente' })
  }

  let enviados = 0
  let erros = 0
  const resultados: Array<{ id: string; status: string; erro?: string }> = []

  for (const d of pendentes) {
    if (!d.telefone_destinatario || !d.mensagem) {
      await supabase.from('disparos_pendentes')
        .update({ status: 'erro', erro: 'Telefone ou mensagem vazio', processado_em: new Date().toISOString() })
        .eq('id', d.id)
      erros++
      resultados.push({ id: d.id, status: 'erro', erro: 'Telefone ou mensagem vazio' })
      continue
    }

    const result = await enviarWhatsApp(d.telefone_destinatario, d.mensagem)

    if (result.ok) {
      await supabase.from('disparos_pendentes')
        .update({ status: 'enviado', processado_em: new Date().toISOString() })
        .eq('id', d.id)
      enviados++
      resultados.push({ id: d.id, status: 'enviado' })
    } else {
      await supabase.from('disparos_pendentes')
        .update({ status: 'erro', erro: result.error?.slice(0, 500), processado_em: new Date().toISOString() })
        .eq('id', d.id)
      erros++
      resultados.push({ id: d.id, status: 'erro', erro: result.error })
    }

    // Delay de 2s entre mensagens para não ser bloqueado
    await new Promise(r => setTimeout(r, 2000))
  }

  return jsonResp({ ok: true, enviados, erros, total: pendentes.length, resultados })
})
