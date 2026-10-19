// Núcleo da Antonia: monta o contexto (prompt versionado + regras fixas + conhecimento do banco + ficha + histórico)
// e conversa com a OpenAI usando as ferramentas. Devolve os blocos de mensagem; quem envia é o chamador.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { executarFerramenta, ferramentasOpenAI, type Contexto } from './ferramentas.ts'

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY') ?? ''
const TZ = 'America/Sao_Paulo'

// Valem mesmo que o prompt editável mude
const REGRAS_FIXAS = `- Nunca invente horários: só ofereça o que verificar_disponibilidade retornou.
- Nunca diga que uma aula está agendada/confirmada sem a ferramenta ter retornado sucesso.
- Nunca invente informação que não esteja no CONHECIMENTO, na FICHA ou no retorno das ferramentas. Se não souber, encaminhe para a equipe.
- Datas sempre do CALENDÁRIO, nunca calculadas. Telefone do contato é automático, nunca peça.
- Não repita perguntas cuja resposta já está na FICHA ou no histórico.
- Se uma ferramenta retornar erro, não invente o motivo: explique de forma simples ou encaminhe.`

export interface ConfigIA {
  ligada: boolean; nome: string; apresentacao: string; modo_padrao: string; espera_seg: number; max_blocos: number
  modelo: string; temperatura: number; responder_fora_horario: boolean; mensagem_fora_horario: string; mensagem_erro: string
  mensagem_midia: string; semana_inicio: string; semana_fim: string; sabado_inicio: string; sabado_fim: string
  endereco: string; link_mapa: string; conhecimento_extra: string
}

export interface Turno { role: 'user' | 'assistant'; content: string }

export async function carregarConfig(sb: SupabaseClient): Promise<ConfigIA> {
  const { data } = await sb.from('ia_config').select('*').eq('id', 1).single()
  return data as ConfigIA
}

export function agoraBR() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false })
    .formatToParts(new Date()).map((x) => [x.type, x.value]))
  return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour === '24' ? '00' : p.hour}:${p.minute}`, dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) }
}

export function dentroDoHorario(cfg: ConfigIA): boolean {
  const { hora, dow } = agoraBR()
  if (dow >= 1 && dow <= 5) return hora >= cfg.semana_inicio.slice(0, 5) && hora < cfg.semana_fim.slice(0, 5)
  if (dow === 6) return hora >= cfg.sabado_inicio.slice(0, 5) && hora < cfg.sabado_fim.slice(0, 5)
  return false
}

function calendario(): string {
  const dias = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
  const base = new Date(`${agoraBR().data}T12:00:00Z`)
  return Array.from({ length: 21 }, (_, i) => {
    const d = new Date(base.getTime() + i * 86400_000)
    const iso = d.toISOString().slice(0, 10)
    return `${dias[d.getUTCDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)} = ${iso}${i === 0 ? ' ← HOJE' : i === 1 ? ' (amanhã)' : ''}`
  }).join('\n')
}

async function conhecimento(sb: SupabaseClient, cfg: ConfigIA): Promise<string> {
  const [{ data: planos }, { data: conf }] = await Promise.all([
    sb.from('planos').select('nome, valor_mensal, duracao_aula_minutos, descricao').eq('ativo', true).order('valor_mensal', { ascending: false }),
    sb.from('configuracoes').select('chave, valor').in('chave', ['instrumentos_disponiveis', 'duracao_aula']),
  ])
  const c = Object.fromEntries((conf ?? []).map((x) => [x.chave, x.valor]))
  const brl = (v: number) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`
  return [
    'PLANOS (valor por mês):',
    ...(planos ?? []).map((p) => `- *${p.nome}*: ${brl(p.valor_mensal)}/mês${p.descricao ? ` (${p.descricao})` : ''}`),
    `Duração da aula: ${c.duracao_aula ?? '45 minutos'}.`,
    `CURSOS / INSTRUMENTOS: ${c.instrumentos_disponiveis ?? ''}`,
    `HORÁRIO DE FUNCIONAMENTO: segunda a sexta ${cfg.semana_inicio.slice(0, 5)} às ${cfg.semana_fim.slice(0, 5)}; sábado ${cfg.sabado_inicio.slice(0, 5)} às ${cfg.sabado_fim.slice(0, 5)}.`,
    `ENDEREÇO: ${cfg.endereco} — mapa: ${cfg.link_mapa}`,
    cfg.conhecimento_extra?.trim() ? `\n${cfg.conhecimento_extra.trim()}` : '',
  ].join('\n')
}

// Histórico da conversa no formato da OpenAI (no 1º atendimento pós-migração, aproveita o histórico do n8n)
export async function historico(sb: SupabaseClient, telefone: string): Promise<{ turnos: Turno[]; novoContato: boolean }> {
  const { data } = await sb.from('wa_mensagens').select('direcao, autor, tipo, texto, created_at')
    .eq('telefone', telefone).in('status', ['recebida', 'enviada', 'entregue', 'lida'])
    .order('created_at', { ascending: false }).limit(40)
  const msgs = (data ?? []).reverse()
  const turnos: Turno[] = msgs.map((m) => {
    const t = m.texto?.trim() || `[${m.direcao === 'in' ? 'o cliente enviou' : 'enviado'} ${m.tipo}]`
    if (m.direcao === 'in') return { role: 'user', content: t }
    const pref = m.autor === 'humano' ? '[mensagem da equipe] ' : m.autor === 'ia' ? '' : '[mensagem automática do sistema] '
    return { role: 'assistant', content: pref + t }
  })

  if (msgs.filter((m) => m.direcao === 'out').length === 0) {
    const sem9 = telefone.slice(0, 4) + telefone.slice(5)
    const { data: antigo } = await sb.from('n8n_chat_histories').select('message')
      .in('session_id', [`${telefone}@s.whatsapp.net`, `${sem9}@s.whatsapp.net`]).order('id', { ascending: false }).limit(20)
    const anteriores: Turno[] = (antigo ?? []).reverse()
      .map((r) => r.message as { type: string; content: string })
      .filter((m) => m?.content && (m.type === 'human' || m.type === 'ai'))
      .map((m) => ({ role: m.type === 'human' ? 'user' : 'assistant', content: String(m.content).replace(/^\[SISTEMA:[^\]]*\]\s*/, '') }))
    return { turnos: [...anteriores, ...turnos], novoContato: anteriores.length === 0 && msgs.length <= 1 }
  }
  return { turnos, novoContato: false }
}

export async function montarSistema(sb: SupabaseClient, cfg: ConfigIA, o: { telefone: string; promptOverride?: string; situacao?: unknown; teste?: boolean }) {
  const [{ data: versao }, aluno, dados, { data: exemplos }, saber] = await Promise.all([
    sb.from('ia_prompt_versoes').select('prompt').eq('ativo', true).maybeSingle(),
    o.teste ? Promise.resolve({ data: null }) : sb.rpc('buscar_aluno_por_telefone', { p_telefone: o.telefone }),
    o.teste ? Promise.resolve({ data: null }) : sb.rpc('consultar_dados_contato', { p_tel: o.telefone }),
    sb.from('ia_exemplos').select('mensagem_cliente, resposta_enviada').eq('aprovado', true).order('criado_em', { ascending: false }).limit(12),
    conhecimento(sb, cfg),
  ])
  const { data: hoje, hora } = agoraBR()
  return [
    o.promptOverride ?? versao?.prompt ?? '',
    `\n=== REGRAS FIXAS DO SISTEMA ===\n${REGRAS_FIXAS}`,
    `\n=== CONFIGURAÇÃO ===\nSeu nome: ${cfg.nome}\nFrase de apresentação (primeiro contato): ${cfg.apresentacao}\nMáximo de blocos por resposta: ${cfg.max_blocos}`,
    `\n=== AGORA ===\nHoje é ${hoje}, ${hora} (horário de Brasília).\nCALENDÁRIO (use sempre, nunca calcule datas):\n${calendario()}`,
    `\n=== CONHECIMENTO ===\n${saber}`,
    `\n=== FICHA DO CONTATO ===\nCadastro: ${JSON.stringify(aluno.data ?? {})}\nDados já coletados: ${JSON.stringify(dados.data ?? {})}`,
    o.situacao ? `\n=== SITUAÇÃO ATUAL ===\n${JSON.stringify(o.situacao)}` : '',
    exemplos?.length ? `\n=== EXEMPLOS APROVADOS DE COMO A EQUIPE RESPONDE ===\n${exemplos.map((e) => `Cliente: ${e.mensagem_cliente}\nResposta: ${e.resposta_enviada}`).join('\n\n')}` : '',
    `\n=== FORMATO DA RESPOSTA ===\nResponda SOMENTE com JSON: {"blocos": ["mensagem 1", "mensagem 2"]}\n- de 1 a ${cfg.max_blocos} mensagens curtas de WhatsApp, na ordem de envio.\n- {"blocos": []} somente se não houver nada a dizer.`,
  ].join('\n')
}

// deno-lint-ignore no-explicit-any
async function openai(body: any) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${data?.error?.message ?? 'erro'}`)
  return data
}

export async function gerarResposta(ctx: Contexto, cfg: ConfigIA, sistema: string, turnos: Turno[]): Promise<string[]> {
  if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY não configurada')
  // deno-lint-ignore no-explicit-any
  const messages: any[] = [{ role: 'system', content: sistema }, ...turnos]
  if (messages[messages.length - 1].role !== 'user') messages.push({ role: 'user', content: '[sem nova mensagem do cliente] Escreva a próxima mensagem adequada.' })

  for (let rodada = 0; rodada < 8; rodada++) {
    const r = await openai({ model: cfg.modelo, temperature: Number(cfg.temperatura), messages, tools: ferramentasOpenAI, response_format: { type: 'json_object' } })
    const msg = r.choices?.[0]?.message
    if (msg?.tool_calls?.length) {
      messages.push(msg)
      for (const call of msg.tool_calls) {
        messages.push({ role: 'tool', tool_call_id: call.id, content: await executarFerramenta(ctx, call.function.name, call.function.arguments) })
      }
      continue
    }
    const texto = String(msg?.content ?? '')
    let blocos: string[]
    try {
      blocos = (JSON.parse(texto).blocos ?? []).map(String)
    } catch {
      blocos = texto.split(/\n{2,}/)
    }
    blocos = blocos.map((b) => b.replace(/\*\*(.+?)\*\*/g, '*$1*').trim()).filter(Boolean)
    if (blocos.length > cfg.max_blocos) blocos = [...blocos.slice(0, cfg.max_blocos - 1), blocos.slice(cfg.max_blocos - 1).join('\n\n')]
    return blocos
  }
  throw new Error('A IA não concluiu a resposta (muitas chamadas de ferramenta)')
}

// Áudio do cliente vira texto (antes a Antonia pedia pra escrever)
export async function transcreverAudio(sb: SupabaseClient, msgId: string, path: string, mime: string): Promise<string | null> {
  if (!OPENAI_KEY) return null
  const { data: blob } = await sb.storage.from('whatsapp-midia').download(path)
  if (!blob) return null
  const form = new FormData()
  form.append('file', new File([blob], `audio.${(mime.split('/')[1] ?? 'ogg').split(';')[0]}`, { type: mime }))
  form.append('model', 'whisper-1')
  form.append('language', 'pt')
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${OPENAI_KEY}` }, body: form })
  if (!r.ok) return null
  const texto = String((await r.json()).text ?? '').trim()
  if (texto) await sb.from('wa_mensagens').update({ texto: `🎤 ${texto}` }).eq('id', msgId)
  return texto || null
}
