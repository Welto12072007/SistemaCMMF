import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, Send, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Modelo {
  nome: string; categoria: string; uso: string | null; corpo: string; variaveis: string[]; botoes: string[]
  status_meta: string; motivo_rejeicao: string | null; updated_at: string
}

const COR: Record<string, string> = {
  APPROVED: 'bg-emerald-50 text-emerald-700', PENDING: 'bg-amber-50 text-amber-700', REJECTED: 'bg-red-50 text-red-700',
  rascunho: 'bg-gray-100 text-gray-600', ERRO_ENVIO: 'bg-red-50 text-red-700', PAUSED: 'bg-orange-50 text-orange-700', DISABLED: 'bg-gray-200 text-gray-600',
}
const NOME_STATUS: Record<string, string> = {
  APPROVED: 'Aprovado', PENDING: 'Em análise', REJECTED: 'Rejeitado', rascunho: 'Rascunho', ERRO_ENVIO: 'Erro ao enviar', PAUSED: 'Pausado pela Meta', DISABLED: 'Desativado',
}

// Mostra {{1}} como {nome} para quem edita
const legivel = (m: Modelo) => m.corpo.replace(/\{\{(\d+)\}\}/g, (_, n) => `{${m.variaveis[Number(n) - 1] ?? n}}`)
const paraMeta = (texto: string, vars: string[]) => texto.replace(/\{([a-z_]+)\}/g, (s, v) => (vars.indexOf(v) >= 0 ? `{{${vars.indexOf(v) + 1}}}` : s))

export default function ModelosWhatsApp() {
  const [modelos, setModelos] = useState<Modelo[]>([])
  const [editando, setEditando] = useState<Record<string, string>>({})
  const [ocupado, setOcupado] = useState('')
  const [msg, setMsg] = useState('')

  async function carregar() {
    const { data } = await supabase.from('wa_templates').select('*').order('categoria', { ascending: false }).order('nome')
    setModelos((data ?? []) as Modelo[])
  }
  useEffect(() => { carregar() }, [])

  async function chamar(acao: 'enviar' | 'sincronizar', nomes?: string[]) {
    setOcupado(acao); setMsg('')
    const { data, error } = await supabase.functions.invoke('whatsapp-templates', { body: { acao, nomes } })
    setOcupado('')
    if (error) {
      const ctx = (error as { context?: Response }).context
      const b = ctx ? await ctx.json().catch(() => null) : null
      setMsg(b?.error ?? error.message)
    } else setMsg(acao === 'enviar' ? `${data?.resultado?.length ?? 0} modelo(s) enviados para a Meta analisar` : `${data?.sincronizados ?? 0} modelo(s) sincronizados`)
    carregar()
  }

  async function salvar(m: Modelo) {
    const corpo = paraMeta(editando[m.nome] ?? '', m.variaveis)
    const { error } = await supabase.from('wa_templates').update({ corpo, status_meta: 'rascunho', updated_at: new Date().toISOString() }).eq('nome', m.nome)
    if (error) { setMsg(error.message); return }
    const { [m.nome]: _, ...resto } = editando
    setEditando(resto); carregar()
  }

  const aprovados = modelos.filter((m) => m.status_meta === 'APPROVED').length

  return (
    <div className="space-y-4">
      <div className="bg-white border rounded-xl p-5 space-y-2">
        <h2 className="font-semibold text-gray-900">Modelos de mensagem (WhatsApp oficial)</h2>
        <p className="text-sm text-gray-600">
          Fora da janela de 24h (quando o contato não falou com a gente no último dia), a Meta só deixa enviar mensagens a partir de um modelo aprovado.
          Cada automação usa o seu modelo; dentro da janela, o sistema continua mandando o texto editável normal.
          Editar um modelo aprovado manda ele para nova análise.
        </p>
        <div className="flex items-center gap-2 pt-1">
          <button disabled={!!ocupado} onClick={() => chamar('enviar')} className="px-3 py-2 rounded-lg bg-brand-500 text-white text-sm flex items-center gap-1.5">
            {ocupado === 'enviar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar rascunhos para aprovação
          </button>
          <button disabled={!!ocupado} onClick={() => chamar('sincronizar')} className="px-3 py-2 rounded-lg border text-sm flex items-center gap-1.5">
            {ocupado === 'sincronizar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Atualizar status
          </button>
          <span className="text-sm text-gray-500 ml-auto">{aprovados} de {modelos.length} aprovados</span>
        </div>
        {msg && <p className="text-sm text-gray-700">{msg}</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {modelos.map((m) => (
          <div key={m.nome} className="bg-white border rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium text-sm text-gray-900">{m.nome}</p>
                <p className="text-xs text-gray-500">{m.categoria === 'MARKETING' ? 'Marketing' : 'Utilidade'} · usado por: {m.uso ?? '—'}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${COR[m.status_meta] ?? 'bg-gray-100'}`}>{NOME_STATUS[m.status_meta] ?? m.status_meta}</span>
            </div>
            {m.motivo_rejeicao && <p className="text-xs text-red-600">Motivo: {m.motivo_rejeicao}</p>}
            {m.nome in editando ? (
              <>
                <textarea rows={8} className="w-full border rounded-lg p-2 text-sm" value={editando[m.nome]} onChange={(e) => setEditando({ ...editando, [m.nome]: e.target.value })} />
                <p className="text-xs text-gray-500">Variáveis: {m.variaveis.map((v) => `{${v}}`).join(' ')} — não comece nem termine o texto com uma variável.</p>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => { const { [m.nome]: _, ...r } = editando; setEditando(r) }} className="text-xs px-2 py-1 border rounded">Cancelar</button>
                  <button onClick={() => salvar(m)} className="text-xs px-2 py-1 rounded bg-gray-900 text-white flex items-center gap-1"><Save className="w-3.5 h-3.5" /> Salvar (volta para rascunho)</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm whitespace-pre-wrap text-gray-700 bg-gray-50 rounded-lg p-3">{legivel(m)}</p>
                {m.botoes.length > 0 && <div className="flex gap-1.5">{m.botoes.map((b) => <span key={b} className="text-xs border rounded px-2 py-0.5">{b}</span>)}</div>}
                <div className="flex justify-end gap-2">
                  {['rascunho', 'REJECTED', 'ERRO_ENVIO'].includes(m.status_meta) && (
                    <button onClick={() => chamar('enviar', [m.nome])} className="text-xs px-2 py-1 border rounded">Enviar este</button>
                  )}
                  <button onClick={() => setEditando({ ...editando, [m.nome]: legivel(m) })} className="text-xs px-2 py-1 border rounded">Editar</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
