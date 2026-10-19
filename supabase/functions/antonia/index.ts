// Antonia (IA de atendimento) — roda a cada mensagem recebida, fora do n8n.
// Chamadas:
//  { telefone, wamid }                      ← whatsapp-webhook (Bearer SB_SECRET_KEY)
//  { telefone, gerar_sugestao: true }       ← Caixa de entrada, botão "Gerar sugestão da IA" (equipe logada)
//  { teste: { mensagens, prompt? } }        ← Configurações > IA, "Testar o prompt" (equipe logada, nada é gravado)
import { adminClient, enviar, marcarComoLida, SECRET_KEY } from '../_shared/whatsapp.ts'
import { avisarEquipe, tratarRespostaProfessor } from '../_shared/avisos.ts'
import { carregarConfig, dentroDoHorario, gerarResposta, historico, montarSistema, transcreverAudio, agoraBR, type Turno } from '../_shared/ia/agente.ts'
import type { Contexto } from '../_shared/ia/ferramentas.ts'

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void }

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json', ...CORS } })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
type SB = ReturnType<typeof adminClient>

async function ultimaEntrada(sb: SB, telefone: string) {
  const { data } = await sb.from('wa_mensagens').select('id, wamid, texto, tipo')
    .eq('telefone', telefone).eq('direcao', 'in').order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data
}

async function nomeDoContato(sb: SB, telefone: string): Promise<string> {
  const { data } = await sb.from('wa_contatos').select('nome').eq('telefone', telefone).maybeSingle()
  const { data: dc } = await sb.rpc('consultar_dados_contato', { p_tel: telefone })
  return dc?.nome ?? data?.nome ?? 'Contato'
}

// Áudios recebidos desde a última resposta viram texto antes de a IA ler a conversa
async function transcreverPendentes(sb: SB, telefone: string) {
  const { data: ultOut } = await sb.from('wa_mensagens').select('created_at').eq('telefone', telefone).eq('direcao', 'out')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  let q = sb.from('wa_mensagens').select('id, midia_url, midia_mime').eq('telefone', telefone).eq('direcao', 'in').eq('tipo', 'audio').is('texto', null)
  if (ultOut) q = q.gt('created_at', ultOut.created_at)
  const { data } = await q
  for (const m of data ?? []) if (m.midia_url) await transcreverAudio(sb, m.id, m.midia_url, m.midia_mime ?? 'audio/ogg')
}

async function falhaComAviso(sb: SB, telefone: string, msgErro: string, erro: unknown) {
  console.error('antonia erro', telefone, erro)
  const { count } = await sb.from('wa_mensagens').select('id', { count: 'exact', head: true })
    .eq('telefone', telefone).eq('origem', 'ia:erro').gt('created_at', new Date(Date.now() - 10 * 60_000).toISOString())
  if (count) return
  await enviar(sb, { to: telefone, texto: msgErro, autor: 'ia', origem: 'ia:erro' })
  await avisarEquipe(sb, { assunto: 'Erro na IA', contato: telefone, resumo: String(erro instanceof Error ? erro.message : erro).slice(0, 300) })
}

async function atender(telefone: string, wamid: string) {
  const sb = adminClient()
  const cfg = await carregarConfig(sb)
  await sleep(cfg.espera_seg * 1000)

  const ultima = await ultimaEntrada(sb, telefone)
  if (!ultima || ultima.wamid !== wamid) return // chegou mensagem mais nova: a próxima execução responde tudo junto

  if (await tratarRespostaProfessor(sb, telefone, ultima.texto ?? '')) return

  const { data: gate } = await sb.rpc('ia_gate', { p_telefone: telefone })
  if (!gate?.responder) return

  try {
    await transcreverPendentes(sb, telefone)

    if (!cfg.responder_fora_horario && !dentroDoHorario(cfg)) {
      const { count } = await sb.from('wa_mensagens').select('id', { count: 'exact', head: true })
        .eq('telefone', telefone).eq('origem', 'ia:fora_horario').gte('created_at', `${agoraBR().data}T00:00:00-03:00`)
      if (!count) await enviar(sb, { to: telefone, texto: cfg.mensagem_fora_horario, autor: 'ia', origem: 'ia:fora_horario' })
      return
    }

    await marcarComoLida(wamid, gate.modo === 'auto')
    const ctx: Contexto = { sb, telefone, nomeContato: await nomeDoContato(sb, telefone), teste: false, acoes: [] }
    const { turnos, novoContato } = await historico(sb, telefone)
    const sistema = await montarSistema(sb, cfg, { telefone, situacao: { ...gate, primeiro_contato: novoContato } })
    const blocos = await gerarResposta(ctx, cfg, sistema, turnos)

    const depois = await ultimaEntrada(sb, telefone)
    if (depois?.wamid !== wamid && !ctx.acoes.length) return // cliente escreveu de novo enquanto a IA pensava
    if (!blocos.length) return

    if (gate.modo === 'copiloto') {
      await sb.from('wa_mensagens').update({ status: 'descartada' }).eq('telefone', telefone).eq('status', 'sugestao')
      await sb.from('wa_mensagens').insert({ telefone, direcao: 'out', autor: 'ia', tipo: 'text', texto: blocos.join('\n\n'), status: 'sugestao', origem: 'ia', payload: { acoes: ctx.acoes } })
      return
    }
    for (const [i, b] of blocos.entries()) {
      if (i > 0) await sleep(Math.min(3500, 800 + b.length * 15))
      await enviar(sb, { to: telefone, texto: b, autor: 'ia', origem: 'ia' })
    }
  } catch (e) {
    await falhaComAviso(sb, telefone, cfg.mensagem_erro, e)
  }
}

async function equipeLogada(sb: SB, token: string): Promise<string | null> {
  const { data: u } = await sb.auth.getUser(token)
  if (!u?.user) return null
  const { data: p } = await sb.from('perfis').select('role, ativo').eq('user_id', u.user.id).maybeSingle()
  return p?.ativo && ['admin', 'recepcao'].includes(p.role) ? u.user.id : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const body = await req.json().catch(() => ({}))
  const sb = adminClient()

  if (token === SECRET_KEY && body.telefone && body.wamid) {
    EdgeRuntime.waitUntil(atender(String(body.telefone), String(body.wamid)).catch((e) => console.error('antonia', e)))
    return json({ ok: true }, 202)
  }

  const userId = token ? await equipeLogada(sb, token) : null
  if (!userId) return json({ error: 'Acesso negado' }, 401)
  const cfg = await carregarConfig(sb)

  try {
    if (body.teste) {
      const ctx: Contexto = { sb, telefone: '5500000000000', nomeContato: 'Cliente de teste', teste: true, acoes: [] }
      const turnos = (body.teste.mensagens ?? []) as Turno[]
      const sistema = await montarSistema(sb, cfg, { telefone: ctx.telefone, promptOverride: body.teste.prompt, teste: true, situacao: { primeiro_contato: turnos.filter((t) => t.role === 'assistant').length === 0 } })
      return json({ blocos: await gerarResposta(ctx, cfg, sistema, turnos), acoes: ctx.acoes })
    }

    if (body.telefone && body.gerar_sugestao) {
      const telefone = String(body.telefone)
      await transcreverPendentes(sb, telefone)
      const ctx: Contexto = { sb, telefone, nomeContato: await nomeDoContato(sb, telefone), teste: false, acoes: [] }
      const { data: gate } = await sb.rpc('ia_gate', { p_telefone: telefone })
      const { turnos, novoContato } = await historico(sb, telefone)
      const sistema = await montarSistema(sb, cfg, { telefone, situacao: { ...gate, primeiro_contato: novoContato } })
      const blocos = await gerarResposta(ctx, cfg, sistema, turnos)
      await sb.from('wa_mensagens').update({ status: 'descartada' }).eq('telefone', telefone).eq('status', 'sugestao')
      const { data: sug } = await sb.from('wa_mensagens').insert({ telefone, direcao: 'out', autor: 'ia', tipo: 'text', texto: blocos.join('\n\n'), status: 'sugestao', origem: 'ia', enviado_por: userId, payload: { acoes: ctx.acoes } }).select('id, texto').single()
      return json({ sugestao: sug, acoes: ctx.acoes })
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
  return json({ error: 'requisição inválida' }, 400)
})
