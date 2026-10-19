import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, BotOff, Check, CheckCheck, Clock, Loader2, Send, Sparkles, UserRound, X, AlertCircle, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { definirModo, enviarTexto, gerarSugestao, urlMidia, type ContatoCaixa, type MensagemWA, type ModoIA } from '../lib/whatsapp'

type Filtro = 'todos' | 'aguardando' | 'ia' | 'humano' | 'leads' | 'outros'
const FILTROS: [Filtro, string][] = [
  ['todos', 'Todos'], ['aguardando', 'Sem resposta'], ['ia', 'Com IA'], ['humano', 'Com humano'], ['leads', 'Leads'], ['outros', 'Alunos e outros'],
]

function espera(iso: string | null) {
  if (!iso) return ''
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 60) return `há ${min} min`
  if (min < 60 * 24) return `há ${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`
  return `há ${Math.floor(min / 1440)} d`
}
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

function ChipModo({ c }: { c: ContatoCaixa }) {
  if (c.modo_ia === 'pausada' || c.aluno_status === 'ativo' || c.tipo === 'professor')
    return <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Humano</span>
  if (c.modo_ia === 'copiloto') return <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">Copiloto</span>
  return <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-800">IA automática</span>
}

function StatusEnvio({ m }: { m: MensagemWA }) {
  if (m.direcao === 'in') return null
  if (m.status === 'falhou') return <span title={m.erro ?? ''}><AlertCircle className="w-3.5 h-3.5 text-red-500" /></span>
  if (m.status === 'lida') return <CheckCheck className="w-3.5 h-3.5 text-sky-500" />
  if (m.status === 'entregue') return <CheckCheck className="w-3.5 h-3.5 text-gray-400" />
  if (m.status === 'enviada') return <Check className="w-3.5 h-3.5 text-gray-400" />
  return <Clock className="w-3.5 h-3.5 text-gray-300" />
}

function Midia({ m }: { m: MensagemWA }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { if (m.midia_url && !m.midia_url.startsWith('http')) urlMidia(m.midia_url).then(setUrl); else setUrl(m.midia_url) }, [m.midia_url])
  if (!url) return null
  if (m.tipo === 'image' || m.tipo === 'sticker') return <img src={url} className="rounded-lg max-w-[240px] mb-1" />
  if (m.tipo === 'audio') return <audio src={url} controls className="max-w-[240px] mb-1" />
  if (m.tipo === 'video') return <video src={url} controls className="rounded-lg max-w-[240px] mb-1" />
  return <a href={url} target="_blank" rel="noreferrer" className="underline text-xs block mb-1">Abrir arquivo</a>
}

const AUTOR: Record<string, string> = { ia: 'IA', humano: 'Equipe', automacao: 'Automação', sistema: 'Sistema' }

export default function CaixaEntrada() {
  const [contatos, setContatos] = useState<ContatoCaixa[]>([])
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<string | null>(() => new URLSearchParams(window.location.search).get('telefone'))
  const [msgs, setMsgs] = useState<MensagemWA[]>([])
  const [texto, setTexto] = useState('')
  const [sugestao, setSugestao] = useState<{ id: string; original: string; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState<'' | 'enviar' | 'sugerir' | 'modo'>('')
  const [erro, setErro] = useState('')
  const fimRef = useRef<HTMLDivElement>(null)
  const selRef = useRef<string | null>(null)
  selRef.current = sel

  const carregarContatos = useCallback(async () => {
    const { data } = await supabase.from('vw_wa_caixa_entrada').select('*').order('ultima_msg_em', { ascending: false }).limit(300)
    setContatos((data ?? []) as ContatoCaixa[])
  }, [])

  const carregarMsgs = useCallback(async (tel: string) => {
    const { data } = await supabase.from('wa_mensagens').select('*').eq('telefone', tel).neq('status', 'descartada')
      .order('created_at', { ascending: true }).limit(300)
    const lista = (data ?? []) as MensagemWA[]
    setMsgs(lista.filter((m) => m.status !== 'sugestao'))
    const s = lista.filter((m) => m.status === 'sugestao').pop()
    setSugestao(s ? { id: s.id, original: s.texto ?? '', texto: s.texto ?? '' } : null)
  }, [])

  useEffect(() => { carregarContatos() }, [carregarContatos])
  useEffect(() => { if (sel) carregarMsgs(sel) }, [sel, carregarMsgs])
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs.length, sugestao?.id])

  useEffect(() => {
    const ch = supabase.channel('caixa-entrada')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_contatos' }, () => carregarContatos())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_mensagens' }, (p) => {
        const tel = (p.new as MensagemWA)?.telefone ?? (p.old as MensagemWA)?.telefone
        if (tel && tel === selRef.current) carregarMsgs(tel)
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [carregarContatos, carregarMsgs])

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return contatos
      .filter((c) => !q || c.nome.toLowerCase().includes(q) || c.telefone.includes(q.replace(/\D/g, '') || '§'))
      .filter((c) => {
        const humano = c.modo_ia === 'pausada' || c.aluno_status === 'ativo' || c.tipo === 'professor'
        switch (filtro) {
          case 'aguardando': return c.aguardando_resposta
          case 'ia': return !humano
          case 'humano': return humano
          case 'leads': return c.tipo === 'lead' && c.aluno_status !== 'ativo'
          case 'outros': return c.tipo !== 'lead' || c.aluno_status === 'ativo'
          default: return true
        }
      })
      .sort((a, b) => Number(b.aguardando_resposta) - Number(a.aguardando_resposta) ||
        (a.aguardando_resposta ? new Date(a.ultima_entrada_em ?? 0).getTime() - new Date(b.ultima_entrada_em ?? 0).getTime() : 0))
  }, [contatos, filtro, busca])

  const atual = contatos.find((c) => c.telefone === sel) ?? null
  const aguardando = contatos.filter((c) => c.aguardando_resposta).length

  async function enviar(conteudo: string, origem = 'crm') {
    if (!sel || !conteudo.trim()) return
    setOcupado('enviar'); setErro('')
    try {
      await enviarTexto(sel, conteudo.trim(), origem)
      setTexto('')
      await carregarMsgs(sel)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao enviar')
    } finally { setOcupado('') }
  }

  async function aprovarSugestao() {
    if (!sugestao || !sel) return
    const editada = sugestao.texto.trim() !== sugestao.original.trim()
    const ultimaCliente = [...msgs].reverse().find((m) => m.direcao === 'in')?.texto ?? ''
    await enviar(sugestao.texto, editada ? 'ia:copiloto_editada' : 'ia:copiloto')
    await supabase.from('wa_mensagens').update({ status: 'descartada' }).eq('id', sugestao.id)
    if (editada && ultimaCliente) {
      await supabase.from('ia_exemplos').insert({ telefone: sel, mensagem_cliente: ultimaCliente, sugestao_ia: sugestao.original, resposta_enviada: sugestao.texto.trim() })
    }
    setSugestao(null)
  }

  async function descartarSugestao() {
    if (!sugestao) return
    await supabase.from('wa_mensagens').update({ status: 'descartada' }).eq('id', sugestao.id)
    setSugestao(null)
  }

  async function sugerir() {
    if (!sel) return
    setOcupado('sugerir'); setErro('')
    try {
      const r = await gerarSugestao(sel)
      setSugestao({ id: r.sugestao.id, original: r.sugestao.texto, texto: r.sugestao.texto })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'A IA não respondeu')
    } finally { setOcupado('') }
  }

  async function mudarModo(modo: ModoIA) {
    if (!sel) return
    setOcupado('modo')
    try { await definirModo(sel, modo); await carregarContatos() } catch (e) { setErro(e instanceof Error ? e.message : 'Erro') } finally { setOcupado('') }
  }

  return (
    <div className="h-[calc(100vh-7rem)] flex bg-white border rounded-xl overflow-hidden">
      {/* Lista */}
      <aside className="w-80 border-r flex flex-col shrink-0">
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-gray-900">Caixa de entrada</h1>
            {aguardando > 0 && <span className="text-xs bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">{aguardando} esperando</span>}
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome ou telefone" className="w-full pl-8 pr-3 py-2 text-sm border rounded-lg" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTROS.map(([k, l]) => (
              <button key={k} onClick={() => setFiltro(k)} className={`text-xs px-2.5 py-1 rounded-full border ${filtro === k ? 'bg-gray-900 text-white border-gray-900' : 'text-gray-600 hover:bg-gray-50'}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {visiveis.map((c) => (
            <button key={c.telefone} onClick={() => setSel(c.telefone)} className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 ${sel === c.telefone ? 'bg-brand-50' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm text-gray-900 truncate">{c.nome}</span>
                {c.aguardando_resposta
                  ? <span className="text-[11px] shrink-0 px-1.5 py-0.5 rounded bg-red-50 text-red-700">{espera(c.ultima_entrada_em)}</span>
                  : <span className="text-[11px] shrink-0 text-gray-400">{c.ultima_msg_em ? dia(c.ultima_msg_em) : ''}</span>}
              </div>
              <p className="text-xs text-gray-500 truncate mt-0.5">{c.ultima_msg_preview}</p>
              <div className="flex gap-1.5 mt-1.5">
                <ChipModo c={c} />
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{c.aluno_status === 'ativo' ? 'Aluno' : c.tipo === 'lead' ? 'Lead' : c.tipo}</span>
                {c.tem_sugestao && <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Sugestão</span>}
              </div>
            </button>
          ))}
          {visiveis.length === 0 && <p className="text-sm text-gray-400 text-center py-10">Nenhuma conversa aqui.</p>}
        </div>
      </aside>

      {/* Conversa */}
      <section className="flex-1 flex flex-col min-w-0">
        {!atual ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Escolha uma conversa à esquerda.</div>
        ) : (
          <>
            <header className="px-5 py-3 border-b flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 truncate">{atual.nome}</p>
                <p className="text-xs text-gray-500">
                  +{atual.telefone} · {atual.janela_aberta ? 'janela de 24h aberta' : 'fora da janela de 24h: só modelo aprovado'}
                  {atual.opt_out && ' · pediu para não receber campanhas'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {atual.modo_ia === 'pausada' ? (
                  <button disabled={!!ocupado} onClick={() => mudarModo('auto')} className="flex items-center gap-1.5 text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50"><Bot className="w-4 h-4" /> Devolver para a IA</button>
                ) : (
                  <button disabled={!!ocupado} onClick={() => mudarModo('pausada')} className="flex items-center gap-1.5 text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50"><BotOff className="w-4 h-4" /> Assumir conversa</button>
                )}
                <select value={atual.modo_ia} disabled={!!ocupado} onChange={(e) => mudarModo(e.target.value as ModoIA)} className="text-sm border rounded-lg px-2 py-1.5">
                  <option value="auto">IA automática</option>
                  <option value="copiloto">Copiloto (você aprova)</option>
                  <option value="pausada">Só humano</option>
                </select>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2 bg-gray-50">
              {msgs.map((m) => (
                <div key={m.id} className={`flex ${m.direcao === 'in' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[70%] rounded-xl px-3 py-2 text-sm shadow-sm ${m.direcao === 'in' ? 'bg-white' : m.autor === 'ia' ? 'bg-violet-50' : 'bg-brand-50'} ${m.status === 'falhou' ? 'ring-1 ring-red-200' : ''}`}>
                    {m.direcao === 'out' && <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">{AUTOR[m.autor] ?? m.autor}{m.template_nome ? ` · modelo ${m.template_nome}` : ''}</p>}
                    <Midia m={m} />
                    {m.texto && <p className="whitespace-pre-wrap text-gray-800">{m.texto}</p>}
                    {m.status === 'falhou' && <p className="text-[11px] text-red-600 mt-1">{m.erro}</p>}
                    <div className="flex items-center justify-end gap-1 mt-0.5 text-[10px] text-gray-400">{dia(m.created_at)} {hora(m.created_at)} <StatusEnvio m={m} /></div>
                  </div>
                </div>
              ))}
              {sugestao && (
                <div className="border border-violet-200 bg-white rounded-xl p-3 space-y-2">
                  <p className="text-xs font-medium text-violet-700 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Sugestão da IA (edite se quiser e aprove)</p>
                  <textarea value={sugestao.texto} onChange={(e) => setSugestao({ ...sugestao, texto: e.target.value })} rows={Math.min(8, sugestao.texto.split('\n').length + 1)} className="w-full text-sm border rounded-lg p-2" />
                  <div className="flex gap-2 justify-end">
                    <button onClick={descartarSugestao} className="text-sm px-3 py-1.5 border rounded-lg flex items-center gap-1"><X className="w-4 h-4" /> Descartar</button>
                    <button disabled={!!ocupado} onClick={aprovarSugestao} className="text-sm px-3 py-1.5 rounded-lg bg-violet-600 text-white flex items-center gap-1"><Check className="w-4 h-4" /> Aprovar e enviar</button>
                  </div>
                </div>
              )}
              <div ref={fimRef} />
            </div>

            <footer className="border-t p-3 space-y-2">
              {erro && <p className="text-xs text-red-600">{erro}</p>}
              <div className="flex gap-2">
                <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(texto) } }}
                  placeholder={atual.janela_aberta ? 'Responder como equipe… (Enter envia, Shift+Enter quebra linha)' : 'Fora da janela de 24h: a Meta só aceita modelo aprovado'}
                  disabled={!atual.janela_aberta} className="flex-1 text-sm border rounded-lg px-3 py-2 resize-none disabled:bg-gray-50" />
                <div className="flex flex-col gap-2">
                  <button disabled={!!ocupado || !texto.trim()} onClick={() => enviar(texto)} className="px-4 py-2 rounded-lg bg-brand-500 text-white text-sm flex items-center gap-1 disabled:opacity-50">
                    {ocupado === 'enviar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar
                  </button>
                  <button disabled={!!ocupado || !atual.janela_aberta} onClick={sugerir} className="px-3 py-2 rounded-lg border text-sm flex items-center gap-1 disabled:opacity-50">
                    {ocupado === 'sugerir' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Sugestão da IA
                  </button>
                </div>
              </div>
            </footer>
          </>
        )}
      </section>

      {/* Ficha resumida — a ficha completa continua sendo a do CRM Funil */}
      {atual && (
        <aside className="w-64 border-l p-4 space-y-3 shrink-0 hidden xl:block text-sm">
          <h2 className="font-semibold text-gray-900 flex items-center gap-1.5"><UserRound className="w-4 h-4" /> Ficha</h2>
          <dl className="space-y-2">
            <div><dt className="text-xs text-gray-500">Nome no WhatsApp</dt><dd>{atual.nome_whatsapp ?? '—'}</dd></div>
            <div><dt className="text-xs text-gray-500">Situação</dt><dd>{atual.aluno_status ?? atual.tipo}</dd></div>
            <div><dt className="text-xs text-gray-500">Instrumento</dt><dd>{atual.instrumento ?? '—'}</dd></div>
            <div><dt className="text-xs text-gray-500">Encaminhamentos pendentes</dt><dd>{atual.encaminhamentos_pendentes}</dd></div>
          </dl>
          <Link to={`/crm-funil?telefone=${atual.telefone.slice(-8)}`} className="block text-center text-sm px-3 py-2 border rounded-lg hover:bg-gray-50">Abrir no CRM Funil</Link>
        </aside>
      )}
    </div>
  )
}
