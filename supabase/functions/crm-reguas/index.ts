// Motor das réguas de follow-up (módulo Atendimento/CRM).
//  {}                                   ← pg_cron a cada 10 min (Bearer SB_SECRET_KEY): inscreve, interrompe e envia os automáticos
//  { acao: 'enviar' | 'pular' | 'cancelar', inscricao_id }   ← tela Follow-up (equipe)
//  { acao: 'inscrever', telefone, regua_id }                 ← inscrição manual (ex.: Prospecção ativa)
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { adminClient, enviar, normalizarTelefone, SECRET_KEY } from '../_shared/whatsapp.ts'
import { carregarConfig, dentroDoHorario } from '../_shared/ia/agente.ts'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json', ...CORS } })

interface Inscricao {
  id: string; regua_id: string; telefone: string; aluno_id: string | null; passo_atual: number
  inicio_em: string; aula_em: string | null; status: string
}
interface Passo { id: string; ordem: number; horas: number; referencia: 'inicio' | 'antes_aula'; tipo: string; mensagem: string }

const horas = (h: number) => h * 3600_000

async function passos(sb: SupabaseClient, reguaId: string): Promise<Passo[]> {
  const { data } = await sb.from('crm_regua_passos').select('*').eq('regua_id', reguaId).order('ordem')
  return (data ?? []) as Passo[]
}

function quando(i: Inscricao, p: Passo): string {
  const base = p.referencia === 'antes_aula' && i.aula_em
    ? new Date(i.aula_em).getTime() - horas(p.horas)
    : new Date(i.inicio_em).getTime() + horas(p.horas)
  return new Date(base).toISOString()
}

// Prova que mais combina com o lead (instrumento, perfil, motivação); provas sem texto ficam de fora
async function escolherProva(sb: SupabaseClient, instrumento: string, perfil: string, motivacao: string) {
  const { data } = await sb.from('crm_provas').select('id, conteudo, instrumento, perfil, motivacao, usos').eq('ativo', true)
  const norm = (s: string | null) => (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const ranking = (data ?? [])
    .filter((p) => p.conteudo?.trim() && !p.conteudo.trim().startsWith('['))
    .map((p) => ({
      p,
      nota: (norm(p.instrumento) && norm(p.instrumento) === norm(instrumento) ? 3 : !p.instrumento ? 1 : 0)
        + (norm(p.perfil) && norm(p.perfil) === norm(perfil) ? 2 : 0)
        + (norm(p.motivacao) && norm(motivacao).includes(norm(p.motivacao)) ? 1 : 0)
        - p.usos * 0.01,
    }))
    .sort((a, b) => b.nota - a.nota)
  return ranking[0]?.p ?? null
}

async function enviarPasso(sb: SupabaseClient, i: Inscricao): Promise<{ ok: boolean; erro?: string }> {
  const lista = await passos(sb, i.regua_id)
  const p = lista.find((x) => x.ordem === i.passo_atual)
  if (!p) {
    await sb.from('crm_regua_inscricoes').update({ status: 'concluida', updated_at: new Date().toISOString() }).eq('id', i.id)
    return { ok: true }
  }

  const { data: f } = await sb.from('vw_crm_followups').select('nome, instrumento, regua_nome').eq('id', i.id).single()
  const { data: dc } = await sb.rpc('consultar_dados_contato', { p_tel: i.telefone })
  const nome = String(dc?.nome_responsavel || f?.nome || '').split(/[ (]/)[0] || 'tudo bem'
  const modalidade = String(f?.instrumento || 'música').toLowerCase()

  let prova = ''
  if (p.mensagem.includes('[prova]')) {
    const escolhida = await escolherProva(sb, f?.instrumento ?? '', dc?.perfil ?? '', dc?.motivacao ?? '')
    if (!escolhida) return avancar(sb, i, lista, p, 'sem prova cadastrada para este perfil')
    prova = escolhida.conteudo.replace(/\s+/g, ' ').trim()
    await sb.from('crm_provas').update({ usos: (escolhida.usos ?? 0) + 1 }).eq('id', escolhida.id)
  }

  const texto = p.mensagem.replaceAll('[nome]', nome).replaceAll('[modalidade]', modalidade).replaceAll('[prova]', prova)
  const r = await enviar(sb, {
    to: i.telefone, texto, autor: 'automacao', origem: `regua:${f?.regua_nome ?? i.regua_id}`,
    modelo: { uso: `regua:${p.id}`, vars: { nome, modalidade, prova } },
  })
  if (!r.ok) {
    await sb.from('crm_regua_inscricoes').update({ motivo: r.erro?.slice(0, 300), updated_at: new Date().toISOString() }).eq('id', i.id)
    return { ok: false, erro: r.erro }
  }
  if (p.tipo === 'encerramento') await sb.rpc('crm_reguas_encerrar', { p_inscricao: i.id })
  return avancar(sb, i, lista, p, null)
}

async function avancar(sb: SupabaseClient, i: Inscricao, lista: Passo[], atual: Passo, motivo: string | null) {
  const prox = lista.find((x) => x.ordem > atual.ordem)
  const agora = new Date().toISOString()
  await sb.from('crm_regua_inscricoes').update(prox
    ? { passo_atual: prox.ordem, proximo_envio_em: quando(i, prox), motivo, updated_at: agora }
    : { status: 'concluida', motivo, updated_at: agora }).eq('id', i.id)
  return { ok: true }
}

async function rodarAgendado(sb: SupabaseClient) {
  const { data: inscritos } = await sb.rpc('crm_reguas_inscrever')
  const { data: interrompidos } = await sb.rpc('crm_reguas_interromper')
  let enviados = 0

  const cfg = await carregarConfig(sb)
  if (dentroDoHorario(cfg)) {
    const { data: auto } = await sb.from('crm_reguas').select('id').eq('ativo', true).eq('envio_automatico', true)
    const ids = (auto ?? []).map((r) => r.id)
    if (ids.length) {
      const { data: devidos } = await sb.from('crm_regua_inscricoes').select('*').eq('status', 'ativa')
        .in('regua_id', ids).lte('proximo_envio_em', new Date().toISOString()).order('proximo_envio_em').limit(40)
      for (const i of (devidos ?? []) as Inscricao[]) {
        if ((await enviarPasso(sb, i)).ok) enviados++
        await new Promise((r) => setTimeout(r, 1500))
      }
    }
  }
  return { inscritos, interrompidos, enviados }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const sb = adminClient()
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const b = await req.json().catch(() => ({}))

  if (token !== SECRET_KEY) {
    const { data: u } = await sb.auth.getUser(token)
    const { data: p } = u?.user ? await sb.from('perfis').select('role, ativo').eq('user_id', u.user.id).maybeSingle() : { data: null }
    if (!p?.ativo || !['admin', 'recepcao'].includes(p.role)) return json({ error: 'Acesso negado' }, 403)
  } else if (!b.acao) {
    return json(await rodarAgendado(sb))
  }

  if (b.acao === 'inscrever') {
    const tel = normalizarTelefone(String(b.telefone ?? ''))
    if (!tel || !b.regua_id) return json({ error: 'telefone e regua_id obrigatórios' }, 400)
    const [p1] = await passos(sb, b.regua_id)
    if (!p1) return json({ error: 'régua sem passos' }, 400)
    const { data: c } = await sb.from('wa_contatos').select('aluno_id').eq('telefone', tel).maybeSingle()
    const agora = new Date()
    const { error } = await sb.from('crm_regua_inscricoes').insert({
      regua_id: b.regua_id, telefone: tel, aluno_id: c?.aluno_id ?? null, inicio_em: agora.toISOString(),
      proximo_envio_em: new Date(agora.getTime() + horas(p1.horas)).toISOString(),
    })
    return error ? json({ error: error.code === '23505' ? 'Este contato já está em uma régua ativa' : error.message }, 409) : json({ ok: true })
  }

  const { data: i } = await sb.from('crm_regua_inscricoes').select('*').eq('id', b.inscricao_id).eq('status', 'ativa').maybeSingle()
  if (!i) return json({ error: 'Follow-up não encontrado ou já encerrado' }, 404)

  if (b.acao === 'enviar') {
    const r = await enviarPasso(sb, i as Inscricao)
    return json(r, r.ok ? 200 : 502)
  }
  if (b.acao === 'pular') {
    const lista = await passos(sb, i.regua_id)
    const atual = lista.find((x) => x.ordem === i.passo_atual)
    return json(atual ? await avancar(sb, i as Inscricao, lista, atual, 'passo pulado pela equipe') : { ok: true })
  }
  if (b.acao === 'cancelar') {
    await sb.from('crm_regua_inscricoes').update({ status: 'cancelada', motivo: 'cancelado pela equipe', updated_at: new Date().toISOString() }).eq('id', i.id)
    return json({ ok: true })
  }
  return json({ error: 'acao inválida' }, 400)
})
