import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, BellRing, Check, CheckCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtDataHora, type GestaoNotificacao } from '@/lib/gestao'

const CHAVE_PUSH = 'gestao_notif_push_ativo'

const ICONE_TIPO: Record<GestaoNotificacao['tipo'], string> = {
  confirmar: '📅',
  nao_confirmada: '⚠️',
  aviso: 'ℹ️',
  remarcada: '🔁',
  cancelada: '❌',
  ata: '📝',
}

/** Sino de notificações do módulo Gestão — some sozinho se o usuário não tiver membro vinculado. */
export default function NotificacoesSino() {
  const [membroId, setMembroId] = useState<string | null>(null)
  const [notificacoes, setNotificacoes] = useState<GestaoNotificacao[]>([])
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

  if (!membroId) return null

  const naoLidas = notificacoes.filter((n) => !n.lida_em)

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
    const ids = naoLidas.map((n) => n.id)
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
            {notificacoes.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-gray-400">Nenhuma notificação por aqui.</p>
            )}
            {notificacoes.map((n) => (
              <div
                key={n.id}
                onClick={() => marcarLida(n)}
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
