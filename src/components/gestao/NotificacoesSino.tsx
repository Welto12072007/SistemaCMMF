import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BellRing, Check, CheckCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { fmtDataHora, type GestaoNotificacao } from '@/lib/gestao'

const CHAVE_PUSH = 'gestao_notif_push_ativo'
const CHAVE_LIDOS = 'sino_itens_lidos'

interface EventoSino { id: string; titulo: string; data_inicio: string; hora_inicio: string | null; tipo: string }
interface ComunicadoSino { id: string; titulo: string; mensagem: string; criado_em: string }
interface PagamentoSino { id: string; chave: string; titulo: string; texto: string; atrasado: boolean; link: string }
interface PessoalSino { id: string; titulo: string; mensagem: string | null; link: string | null; lida_em: string | null; created_at: string }

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function fmtDia(d: string) {
  const [, m, dia] = d.split('-')
  return `${dia}/${m}`
}

const ICONE_TIPO: Record<GestaoNotificacao['tipo'], string> = {
  confirmar: '📅',
  nao_confirmada: '⚠️',
  aviso: 'ℹ️',
  remarcada: '🔁',
  cancelada: '❌',
  ata: '📝',
}

/** Sino: avisos da Gestão (se for membro), próximos eventos da agenda e comunicados recentes. */
export default function NotificacoesSino() {
  const { perfil, hasRole } = useAuth()
  const navigate = useNavigate()
  const [pessoais, setPessoais] = useState<PessoalSino[]>([])
  const [pagamentos, setPagamentos] = useState<PagamentoSino[]>([])
  const [membroId, setMembroId] = useState<string | null>(null)
  const [notificacoes, setNotificacoes] = useState<GestaoNotificacao[]>([])
  const [eventos, setEventos] = useState<EventoSino[]>([])
  const [comunicados, setComunicados] = useState<ComunicadoSino[]>([])
  const [lidos, setLidos] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(CHAVE_LIDOS) ?? '[]') as string[]) } catch { return new Set() }
  })
  const [aberto, setAberto] = useState(false)
  const [pushAtivo, setPushAtivo] = useState(() => localStorage.getItem(CHAVE_PUSH) === '1')
  const caixaRef = useRef<HTMLDivElement>(null)

  const carregar = useCallback(async (membro: string) => {
    const { data, error } = await supabase
      .from('gestao_notificacoes')
      .select('id, membro_id, reuniao_id, tipo, titulo, mensagem, lida_em, created_at')
      .eq('membro_id', membro)
      .order('created_at', { ascending: false })
      .limit(20)
    if (!error) setNotificacoes((data ?? []) as GestaoNotificacao[])
  }, [])

  // Descobre se o usuário tem membro no módulo Gestão (some para quem não tem)
  useEffect(() => {
    let cancelado = false
    supabase.rpc('gestao_meu_membro_id').then(({ data, error }) => {
      if (cancelado || error) return
      const id = data as string | null
      if (id) { setMembroId(id); void carregar(id) }
    })
    return () => { cancelado = true }
  }, [carregar])

  // Pagamentos: aluno vê as próprias pendências; equipe vê o total em atraso
  useEffect(() => {
    if (!perfil?.email) return
    void (async () => {
      if (hasRole('aluno')) {
        const { data: al } = await supabase.from('alunos').select('id').eq('email', perfil.email).maybeSingle()
        if (!al) return
        const { data } = await supabase
          .from('mensalidades')
          .select('id, referencia, valor, desconto, data_vencimento, status')
          .eq('aluno_id', al.id)
          .in('status', ['pendente', 'atrasado'])
          .order('data_vencimento')
          .limit(6)
        setPagamentos((data ?? []).map((m) => {
          const atrasado = m.status === 'atrasado'
          const valor = fmtBRL(Number(m.valor) - Number(m.desconto ?? 0))
          return {
            id: m.id,
            chave: `pag:${m.id}:${m.status}`,
            titulo: atrasado ? `Mensalidade em atraso (${m.referencia})` : `Mensalidade pendente (${m.referencia})`,
            texto: `${atrasado ? 'Venceu em' : 'Vence em'} ${fmtDia(m.data_vencimento)} · ${valor}`,
            atrasado,
            link: '/portal-aluno?tab=pagamentos',
          }
        }))
      } else if (hasRole('admin', 'recepcao')) {
        const { count } = await supabase.from('mensalidades').select('id', { count: 'exact', head: true }).eq('status', 'atrasado')
        if (count) {
          setPagamentos([{
            id: 'inadimplentes',
            chave: `pag:inadimplentes:${count}`,
            titulo: `${count} mensalidade(s) em atraso`,
            texto: 'Veja em Mensalidades / Cobrança.',
            atrasado: true,
            link: '/mensalidades',
          }])
        }
      }
    })()
    // hasRole muda a cada render, por isso fica fora das deps
  }, [perfil?.email, perfil?.role])

  // Notificações pessoais (ex.: reposição agendada) — RLS limita ao e-mail do usuário
  useEffect(() => {
    if (!perfil?.email) return
    const email = perfil.email.toLowerCase()
    void supabase
      .from('notificacoes_usuario')
      .select('id, titulo, mensagem, link, lida_em, created_at')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setPessoais((data ?? []) as PessoalSino[]))
    const canal = supabase
      .channel(`notificacoes_usuario_${email}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificacoes_usuario', filter: `email=eq.${email}` },
        (payload) => setPessoais((atual) => [payload.new as PessoalSino, ...atual].slice(0, 20)),
      )
      .subscribe()
    return () => { void supabase.removeChannel(canal) }
  }, [perfil?.email])

  // Próximos eventos (14 dias) e comunicados (30 dias) — a RLS já filtra por perfil
  useEffect(() => {
    const hoje = new Date()
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const ate = new Date(hoje.getTime() + 14 * 86400000)
    const desde = new Date(hoje.getTime() - 30 * 86400000).toISOString()
    void supabase
      .from('eventos_agenda')
      .select('id, titulo, data_inicio, hora_inicio, tipo')
      .eq('visivel_aluno', true)
      .is('gestao_reuniao_id', null)
      .gte('data_inicio', iso(hoje))
      .lte('data_inicio', iso(ate))
      .order('data_inicio')
      .limit(10)
      .then(({ data }) => setEventos((data ?? []) as EventoSino[]))
    void supabase
      .from('gestao_comunicados')
      .select('id, titulo, mensagem, criado_em')
      .gte('criado_em', desde)
      .order('criado_em', { ascending: false })
      .limit(10)
      .then(({ data }) => setComunicados((data ?? []) as ComunicadoSino[]))
  }, [])

  // Realtime: nova notificação chega ao vivo, sem precisar atualizar a página
  useEffect(() => {
    if (!membroId) return
    const canal = supabase
      .channel(`gestao_notificacoes_${membroId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gestao_notificacoes', filter: `membro_id=eq.${membroId}` },
        (payload) => {
          const nova = payload.new as GestaoNotificacao
          setNotificacoes((atual) => [nova, ...atual].slice(0, 20))
          if (pushAtivo && 'Notification' in window && Notification.permission === 'granted') {
            new Notification(nova.titulo, { body: nova.mensagem, icon: '/favicon.ico', tag: nova.id })
          }
        },
      )
      .subscribe()
    return () => { void supabase.removeChannel(canal) }
  }, [membroId, pushAtivo])

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [])

  const naoLidasGestao = notificacoes.filter((n) => !n.lida_em)
  const naoLidasPessoais = pessoais.filter((n) => !n.lida_em)
  const itensNovos = [
    ...pagamentos.map((p) => p.chave),
    ...eventos.map((e) => `ev:${e.id}`),
    ...comunicados.map((c) => `com:${c.id}`),
  ].filter((k) => !lidos.has(k))
  const naoLidas = { length: naoLidasGestao.length + naoLidasPessoais.length + itensNovos.length }

  function marcarItem(k: string) {
    if (lidos.has(k)) return
    const prox = new Set(lidos).add(k)
    setLidos(prox)
    localStorage.setItem(CHAVE_LIDOS, JSON.stringify(Array.from(prox)))
  }

  // Marca como lido e leva à tela do assunto
  function abrirItem(k: string, link: string) {
    marcarItem(k)
    setAberto(false)
    navigate(link)
  }

  async function abrirPessoal(n: PessoalSino) {
    setAberto(false)
    if (n.link) navigate(n.link)
    if (n.lida_em) return
    setPessoais((atual) => atual.map((x) => (x.id === n.id ? { ...x, lida_em: new Date().toISOString() } : x)))
    await supabase.from('notificacoes_usuario').update({ lida_em: new Date().toISOString() }).eq('id', n.id)
  }

  async function ativarPush() {
    if (!('Notification' in window)) { alert('Seu navegador não suporta notificações.') ; return }
    const permissao = await Notification.requestPermission()
    if (permissao === 'granted') {
      localStorage.setItem(CHAVE_PUSH, '1')
      setPushAtivo(true)
      new Notification('Notificações ativadas 🎉', { body: 'Você vai receber os avisos do módulo Gestão por aqui.' })
    } else {
      alert('Permissão negada. Para ativar depois, libere notificações para este site nas configurações do navegador.')
    }
  }

  function desativarPush() {
    localStorage.setItem(CHAVE_PUSH, '0')
    setPushAtivo(false)
  }

  async function marcarLida(n: GestaoNotificacao) {
    if (n.lida_em) return
    setNotificacoes((atual) => atual.map((x) => (x.id === n.id ? { ...x, lida_em: new Date().toISOString() } : x)))
    await supabase.from('gestao_notificacoes').update({ lida_em: new Date().toISOString() }).eq('id', n.id)
  }

  async function marcarTodasLidas() {
    const prox = new Set([...lidos, ...pagamentos.map((p) => p.chave), ...eventos.map((e) => `ev:${e.id}`), ...comunicados.map((c) => `com:${c.id}`)])
    setLidos(prox)
    localStorage.setItem(CHAVE_LIDOS, JSON.stringify(Array.from(prox)))
    const idsPessoais = naoLidasPessoais.map((n) => n.id)
    if (idsPessoais.length > 0) {
      setPessoais((atual) => atual.map((x) => (x.lida_em ? x : { ...x, lida_em: new Date().toISOString() })))
      await supabase.from('notificacoes_usuario').update({ lida_em: new Date().toISOString() }).in('id', idsPessoais)
    }
    const ids = naoLidasGestao.map((n) => n.id)
    if (ids.length === 0) return
    setNotificacoes((atual) => atual.map((x) => (x.lida_em ? x : { ...x, lida_em: new Date().toISOString() })))
    await supabase.from('gestao_notificacoes').update({ lida_em: new Date().toISOString() }).in('id', ids)
  }

  async function confirmarReuniao(n: GestaoNotificacao) {
    if (!n.reuniao_id) return
    const { error } = await supabase.rpc('gestao_confirmar_reuniao', { p_reuniao_id: n.reuniao_id })
    if (error) { alert('Erro ao confirmar: ' + error.message); return }
    await marcarLida(n)
  }

  return (
    <div ref={caixaRef} className="fixed top-4 right-5 z-50">
      <button
        onClick={() => setAberto((v) => !v)}
        className="relative w-11 h-11 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center text-gray-600 hover:text-brand-600 hover:border-brand-200 transition-colors"
        title="Notificações"
      >
        {naoLidas.length > 0 ? <BellRing className="w-5 h-5 text-brand-600" /> : <Bell className="w-5 h-5" />}
        {naoLidas.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {naoLidas.length > 9 ? '9+' : naoLidas.length}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 mt-2 w-96 max-w-[90vw] bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="font-semibold text-gray-800 text-sm">Notificações</span>
            {naoLidas.length > 0 && (
              <button onClick={marcarTodasLidas} className="text-xs text-brand-600 hover:underline flex items-center gap-1">
                <CheckCheck className="w-3.5 h-3.5" /> Marcar todas como lidas
              </button>
            )}
          </div>

          {!pushAtivo ? (
            <button
              onClick={ativarPush}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-brand-700 bg-brand-50 hover:bg-brand-100 border-b border-gray-100"
            >
              <BellRing className="w-4 h-4 flex-shrink-0" />
              Ativar notificações do navegador para receber avisos personalizados em tempo real
            </button>
          ) : (
            <button
              onClick={desativarPush}
              className="w-full flex items-center gap-2 px-4 py-2 text-xs text-gray-500 hover:bg-gray-50 border-b border-gray-100"
            >
              <Check className="w-3.5 h-3.5 flex-shrink-0 text-emerald-600" /> Notificações do navegador ativadas · desativar
            </button>
          )}

          <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
            {notificacoes.length === 0 && eventos.length === 0 && comunicados.length === 0 && pagamentos.length === 0 && pessoais.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-gray-400">Nenhuma notificação por aqui.</p>
            )}
            {pessoais.map((n) => (
              <div key={n.id} onClick={() => void abrirPessoal(n)} className={`px-4 py-3 text-sm cursor-pointer ${n.lida_em ? 'bg-white' : 'bg-brand-50/60'} hover:bg-gray-50`}>
                <div className="flex items-start gap-2">
                  <span className="text-base leading-none mt-0.5">🔔</span>
                  <div className="flex-1 min-w-0">
                    <p className={`${n.lida_em ? 'font-medium text-gray-700' : 'font-semibold text-gray-900'} truncate`}>{n.titulo}</p>
                    {n.mensagem && <p className="text-gray-500 text-xs mt-0.5 whitespace-pre-line">{n.mensagem}</p>}
                    <p className="text-gray-400 text-[11px] mt-1">{fmtDataHora(n.created_at)}</p>
                  </div>
                  {!n.lida_em && <span className="w-2 h-2 rounded-full bg-brand-500 mt-1.5 flex-shrink-0" />}
                </div>
              </div>
            ))}
            {pagamentos.map((p) => {
              const novo = !lidos.has(p.chave)
              return (
                <div key={p.chave} onClick={() => abrirItem(p.chave, p.link)} className={`px-4 py-3 text-sm cursor-pointer ${novo ? 'bg-brand-50/60' : 'bg-white'} hover:bg-gray-50`}>
                  <div className="flex items-start gap-2">
                    <span className="text-base leading-none mt-0.5">{p.atrasado ? '🔴' : '💳'}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`${novo ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'} truncate`}>{p.titulo}</p>
                      <p className="text-gray-500 text-xs mt-0.5">{p.texto}</p>
                    </div>
                    {novo && <span className="w-2 h-2 rounded-full bg-brand-500 mt-1.5 flex-shrink-0" />}
                  </div>
                </div>
              )
            })}
            {eventos.map((e) => {
              const k = `ev:${e.id}`
              const novo = !lidos.has(k)
              return (
                <div key={k} onClick={() => abrirItem(k, '/agenda')} className={`px-4 py-3 text-sm cursor-pointer ${novo ? 'bg-brand-50/60' : 'bg-white'} hover:bg-gray-50`}>
                  <div className="flex items-start gap-2">
                    <span className="text-base leading-none mt-0.5">🗓️</span>
                    <div className="flex-1 min-w-0">
                      <p className={`${novo ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'} truncate`}>{e.titulo}</p>
                      <p className="text-gray-500 text-xs mt-0.5">
                        {e.tipo === 'feriado' || e.tipo === 'recesso' ? 'Sem aula · ' : 'Próximo evento · '}
                        {fmtDia(e.data_inicio)}{e.hora_inicio ? ` às ${e.hora_inicio.slice(0, 5)}` : ''}
                      </p>
                    </div>
                    {novo && <span className="w-2 h-2 rounded-full bg-brand-500 mt-1.5 flex-shrink-0" />}
                  </div>
                </div>
              )
            })}
            {comunicados.map((c) => {
              const k = `com:${c.id}`
              const novo = !lidos.has(k)
              return (
                <div key={k} onClick={() => abrirItem(k, '/gestao/comunicados')} className={`px-4 py-3 text-sm cursor-pointer ${novo ? 'bg-brand-50/60' : 'bg-white'} hover:bg-gray-50`}>
                  <div className="flex items-start gap-2">
                    <span className="text-base leading-none mt-0.5">📢</span>
                    <div className="flex-1 min-w-0">
                      <p className={`${novo ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'} truncate`}>{c.titulo}</p>
                      <p className="text-gray-500 text-xs mt-0.5 whitespace-pre-line">{c.mensagem}</p>
                      <p className="text-gray-400 text-[11px] mt-1">{fmtDataHora(c.criado_em)}</p>
                    </div>
                    {novo && <span className="w-2 h-2 rounded-full bg-brand-500 mt-1.5 flex-shrink-0" />}
                  </div>
                </div>
              )
            })}
            {notificacoes.map((n) => (
              <div
                key={n.id}
                onClick={() => { void marcarLida(n); setAberto(false); navigate('/gestao/reunioes') }}
                className={`px-4 py-3 text-sm cursor-pointer ${n.lida_em ? 'bg-white' : 'bg-brand-50/60'} hover:bg-gray-50`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-base leading-none mt-0.5">{ICONE_TIPO[n.tipo] ?? '🔔'}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`${n.lida_em ? 'font-medium text-gray-700' : 'font-semibold text-gray-900'} truncate`}>{n.titulo}</p>
                    <p className="text-gray-500 text-xs mt-0.5 whitespace-pre-line">{n.mensagem}</p>
                    <p className="text-gray-400 text-[11px] mt-1">{fmtDataHora(n.created_at)}</p>
                    {n.tipo === 'confirmar' && n.reuniao_id && !n.lida_em && (
                      <button
                        onClick={(e) => { e.stopPropagation(); void confirmarReuniao(n) }}
                        className="mt-2 text-xs font-medium text-white bg-brand-500 hover:bg-brand-600 rounded-md px-2.5 py-1"
                      >
                        Confirmar presença
                      </button>
                    )}
                  </div>
                  {!n.lida_em && <span className="w-2 h-2 rounded-full bg-brand-500 mt-1.5 flex-shrink-0" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
