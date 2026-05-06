import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Send, Search, User, MessageSquare, AlertTriangle, CheckCircle2, Clock, X } from 'lucide-react'

interface Contato {
  id: string
  nome: string
  telefone?: string
  status?: string
  instrumento_interesse?: string
}

interface Historico {
  id: string
  para_nome: string
  para_telefone: string
  mensagem: string
  status: 'enviada' | 'erro'
  erro_detalhe?: string
  enviado_em: string
  enviado_por?: string
}

const EVOLUTION_BASE = 'https://api.centrodemusicamurilofinger.com'
const EVOLUTION_INSTANCE = 'CentroMusica'
const EVOLUTION_APIKEY = 'CentroMusica2026ApiKey'

function normalizarTelefone(tel: string): string {
  const digits = tel.replace(/\D/g, '')
  // Se não começa com 55, adiciona DDI Brasil
  if (!digits.startsWith('55') && digits.length >= 10) return '55' + digits
  return digits
}

export default function MensagemManual() {
  const [contatos, setContatos] = useState<Contato[]>([])
  const [busca, setBusca] = useState('')
  const [selecionado, setSelecionado] = useState<Contato | null>(null)
  const [telefoneCustom, setTelefoneCustom] = useState('')
  const [nomeCustom, setNomeCustom] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null)
  const [historico, setHistorico] = useState<Historico[]>([])
  const [confirmando, setConfirmando] = useState(false)

  useEffect(() => {
    loadContatos()
    loadHistorico()
  }, [])

  async function loadContatos() {
    const { data } = await supabase
      .from('alunos')
      .select('id, nome, telefone, status, instrumento_interesse')
      .order('nome')
    if (data) setContatos(data)
  }

  async function loadHistorico() {
    const { data } = await supabase
      .from('mensagens_manuais_log')
      .select('*')
      .order('enviado_em', { ascending: false })
      .limit(50)
    if (data) setHistorico(data)
  }

  const contatosFiltrados = contatos.filter(c => {
    if (!busca) return true
    const q = busca.toLowerCase()
    return c.nome?.toLowerCase().includes(q) || (c.telefone ?? '').includes(q)
  }).slice(0, 20)

  const telefoneFinal = selecionado?.telefone ?? telefoneCustom
  const nomeFinal = selecionado?.nome ?? nomeCustom

  async function enviarMensagem() {
    if (!telefoneFinal || !mensagem.trim()) return
    setEnviando(true)
    setFeedback(null)

    const numero = normalizarTelefone(telefoneFinal)
    let status: 'enviada' | 'erro' = 'enviada'
    let erroDetalhe: string | undefined

    try {
      const resp = await fetch(`${EVOLUTION_BASE}/message/sendText/${EVOLUTION_INSTANCE}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': EVOLUTION_APIKEY,
        },
        body: JSON.stringify({ number: numero, text: mensagem }),
      })
      if (!resp.ok) {
        const errBody = await resp.text()
        status = 'erro'
        erroDetalhe = `HTTP ${resp.status}: ${errBody}`
      }
    } catch (e: any) {
      status = 'erro'
      erroDetalhe = e?.message ?? 'Erro de rede'
    }

    // Registrar no log
    await supabase.from('mensagens_manuais_log').insert({
      para_nome: nomeFinal || numero,
      para_telefone: numero,
      mensagem: mensagem,
      status,
      erro_detalhe: erroDetalhe ?? null,
    })

    setEnviando(false)
    setConfirmando(false)

    if (status === 'enviada') {
      setFeedback({ tipo: 'ok', msg: `Mensagem enviada para ${nomeFinal || numero}` })
      setMensagem('')
    } else {
      setFeedback({ tipo: 'erro', msg: `Erro ao enviar: ${erroDetalhe}` })
    }

    loadHistorico()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <MessageSquare className="w-6 h-6 text-brand-600" />
          <h1 className="text-2xl font-bold text-gray-900">Mensagem Manual</h1>
        </div>
        <p className="text-gray-500 mt-1 text-sm">Envie mensagens WhatsApp diretamente para leads ou alunos via Antonia (Evolution API).</p>
        <div className="mt-2 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span><strong>Atenção:</strong> Mensagens são enviadas pelo número oficial do CMMF. Use apenas para fins legítimos e relacionados ao centro.</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Painel esquerdo: seleção de destinatário */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-800">1. Destinatário</h2>

          {/* Busca de contato */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Buscar contato cadastrado</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={busca}
                onChange={e => { setBusca(e.target.value); setSelecionado(null) }}
                placeholder="Nome ou telefone..."
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
            {busca && (
              <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                {contatosFiltrados.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-400">Nenhum contato encontrado</div>
                ) : (
                  contatosFiltrados.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setSelecionado(c); setBusca(''); setTelefoneCustom(''); setNomeCustom('') }}
                      className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2"
                    >
                      <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-medium text-gray-800">{c.nome}</div>
                        <div className="text-xs text-gray-400">{c.telefone ?? 'sem telefone'} {c.instrumento_interesse ? `· ${c.instrumento_interesse}` : ''}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Contato selecionado */}
          {selecionado && (
            <div className="flex items-center gap-3 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2">
              <User className="w-5 h-5 text-brand-500" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-800 text-sm">{selecionado.nome}</div>
                <div className="text-xs text-gray-500">{selecionado.telefone}</div>
              </div>
              <button onClick={() => setSelecionado(null)} className="p-1 hover:bg-brand-100 rounded">
                <X className="w-4 h-4 text-brand-600" />
              </button>
            </div>
          )}

          {/* Ou número manual */}
          {!selecionado && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <div className="flex-1 h-px bg-gray-200" /> ou informe manualmente <div className="flex-1 h-px bg-gray-200" />
              </div>
              <input
                type="text"
                value={nomeCustom}
                onChange={e => setNomeCustom(e.target.value)}
                placeholder="Nome (opcional)"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
              <input
                type="tel"
                value={telefoneCustom}
                onChange={e => setTelefoneCustom(e.target.value)}
                placeholder="Telefone com DDD (ex: 51999001234)"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
          )}
        </div>

        {/* Painel direito: mensagem */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-800">2. Mensagem</h2>
          <textarea
            value={mensagem}
            onChange={e => setMensagem(e.target.value)}
            rows={8}
            placeholder="Digite a mensagem que será enviada via WhatsApp..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 resize-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">{mensagem.length} caracteres</span>
            <div className="flex gap-2">
              <button
                onClick={() => setMensagem('')}
                disabled={!mensagem}
                className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-40"
              >
                Limpar
              </button>
              <button
                onClick={() => setConfirmando(true)}
                disabled={!telefoneFinal || !mensagem.trim() || enviando}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors"
              >
                <Send className="w-4 h-4" />
                Enviar WhatsApp
              </button>
            </div>
          </div>

          {/* Feedback */}
          {feedback && (
            <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${feedback.tipo === 'ok' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
              {feedback.tipo === 'ok' ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
              {feedback.msg}
            </div>
          )}
        </div>
      </div>

      {/* Histórico */}
      {historico.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" /> Últimas mensagens enviadas
            </h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Destinatário</th>
                <th className="px-4 py-2 text-left font-medium">Mensagem</th>
                <th className="px-4 py-2 text-left font-medium">Enviado em</th>
                <th className="px-4 py-2 text-center font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {historico.map(h => (
                <tr key={h.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <div className="font-medium text-gray-800">{h.para_nome}</div>
                    <div className="text-xs text-gray-400">{h.para_telefone}</div>
                  </td>
                  <td className="px-4 py-2 text-gray-600 max-w-xs">
                    <span title={h.mensagem}>{h.mensagem.length > 80 ? h.mensagem.slice(0, 80) + '…' : h.mensagem}</span>
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">
                    {new Date(h.enviado_em).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {h.status === 'enviada' ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full font-medium">
                        <CheckCircle2 className="w-3 h-3" /> Enviada
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded-full font-medium" title={h.erro_detalhe}>
                        <AlertTriangle className="w-3 h-3" /> Erro
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal confirmação */}
      {confirmando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="p-5 space-y-3">
              <div className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="w-5 h-5" />
                <h2 className="font-semibold">Confirmar envio</h2>
              </div>
              <p className="text-sm text-gray-700">
                Enviar mensagem para <strong>{nomeFinal || telefoneFinal}</strong> ({normalizarTelefone(telefoneFinal)}) pelo WhatsApp oficial?
              </p>
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 max-h-32 overflow-y-auto whitespace-pre-wrap">
                {mensagem}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 pb-5">
              <button onClick={() => setConfirmando(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button
                onClick={enviarMensagem}
                disabled={enviando}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {enviando ? 'Enviando...' : 'Confirmar envio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
