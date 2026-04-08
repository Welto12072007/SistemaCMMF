import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Send,
  Users,
  UserCheck,
  Search,
  X,
  CheckSquare,
  Square,
  Filter,
  MessageSquare,
  Loader2,
} from 'lucide-react'

interface Destinatario {
  id: string
  nome: string
  telefone: string
  instrumento_interesse?: string
  status?: string
  selected: boolean
}

type Grupo =
  | 'todos'
  | 'alunos_ativos'
  | 'ex_alunos'
  | 'leads'
  | 'aguardando_pagamento'
  | 'instrumento'

const GRUPOS: { key: Grupo; label: string; desc: string }[] = [
  { key: 'todos', label: 'Todos os contatos', desc: 'Enviar para toda a base' },
  { key: 'alunos_ativos', label: 'Alunos ativos', desc: 'Matriculados com plano ativo' },
  { key: 'ex_alunos', label: 'Ex-alunos', desc: 'Status concluido ou perdido' },
  { key: 'leads', label: 'Leads novos', desc: 'Leads que ainda não agendaram' },
  { key: 'aguardando_pagamento', label: 'Aguardando pagamento', desc: 'Experimental agendada, sem pagar' },
  { key: 'instrumento', label: 'Por instrumento', desc: 'Filtrar por instrumento de interesse' },
]

const INSTRUMENTOS = [
  'Violão',
  'Guitarra',
  'Piano',
  'Teclado',
  'Bateria',
  'Baixo',
  'Canto',
  'Ukulele',
  'Violino',
  'Cavaquinho',
]

export default function Disparos() {
  const [contatos, setContatos] = useState<Destinatario[]>([])
  const [grupoAtivo, setGrupoAtivo] = useState<Grupo>('todos')
  const [instrumentoFiltro, setInstrumentoFiltro] = useState('')
  const [busca, setBusca] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<{ sucesso: number; erro: number } | null>(null)

  useEffect(() => {
    loadContatos()
  }, [])

  async function loadContatos() {
    const { data } = await supabase
      .from('alunos')
      .select('id, nome, telefone, instrumento_interesse, status')
      .order('nome')

    if (data) {
      setContatos(data.map((c) => ({ ...c, selected: false })))
    }
  }

  // Filter by group and search
  const filtrados = useMemo(() => {
    let lista = contatos

    switch (grupoAtivo) {
      case 'alunos_ativos':
        lista = lista.filter((c) => c.status === 'matriculado')
        break
      case 'ex_alunos':
        lista = lista.filter((c) => ['concluido', 'perdido', 'cancelado'].includes(c.status || ''))
        break
      case 'leads':
        lista = lista.filter((c) => ['lead', 'qualificado'].includes(c.status || ''))
        break
      case 'aguardando_pagamento':
        lista = lista.filter((c) => c.status === 'aguardando_pagamento')
        break
      case 'instrumento':
        if (instrumentoFiltro) {
          lista = lista.filter((c) =>
            c.instrumento_interesse?.toLowerCase().includes(instrumentoFiltro.toLowerCase())
          )
        }
        break
    }

    if (busca) {
      const term = busca.toLowerCase()
      lista = lista.filter(
        (c) => c.nome?.toLowerCase().includes(term) || c.telefone?.includes(term)
      )
    }

    return lista
  }, [contatos, grupoAtivo, instrumentoFiltro, busca])

  const selecionados = contatos.filter((c) => c.selected)

  function toggleAll(selected: boolean) {
    const filtradoIds = new Set(filtrados.map((f) => f.id))
    setContatos((prev) =>
      prev.map((c) => (filtradoIds.has(c.id) ? { ...c, selected } : c))
    )
  }

  function toggleOne(id: string) {
    setContatos((prev) => prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)))
  }

  function selectGroup() {
    const filtradoIds = new Set(filtrados.map((f) => f.id))
    setContatos((prev) => prev.map((c) => ({ ...c, selected: filtradoIds.has(c.id) })))
  }

  async function enviarDisparos() {
    if (!mensagem.trim() || selecionados.length === 0) return

    setEnviando(true)
    setResultado(null)

    let sucesso = 0
    let erro = 0

    for (const dest of selecionados) {
      try {
        const tel = dest.telefone.replace(/\D/g, '')
        const res = await fetch(
          `${import.meta.env.VITE_EVOLUTION_URL || 'https://api.centrodemusicamurilofinger.com'}/message/sendText/CentroMusica`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: import.meta.env.VITE_EVOLUTION_KEY || '',
            },
            body: JSON.stringify({
              number: tel,
              text: mensagem,
            }),
          }
        )
        if (res.ok) sucesso++
        else erro++
      } catch {
        erro++
      }
    }

    setResultado({ sucesso, erro })
    setEnviando(false)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Disparos de Mensagens</h1>
        <p className="text-gray-500">Envie mensagens para grupos ou contatos individuais</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Group Selection + Contacts */}
        <div className="lg:col-span-2 space-y-4">
          {/* Group Filters */}
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Selecionar público
            </h3>
            <div className="flex flex-wrap gap-2">
              {GRUPOS.map((g) => (
                <button
                  key={g.key}
                  onClick={() => {
                    setGrupoAtivo(g.key)
                    if (g.key !== 'instrumento') setInstrumentoFiltro('')
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    grupoAtivo === g.key
                      ? 'bg-brand-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title={g.desc}
                >
                  {g.label}
                </button>
              ))}
            </div>

            {grupoAtivo === 'instrumento' && (
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
                {INSTRUMENTOS.map((inst) => (
                  <button
                    key={inst}
                    onClick={() => setInstrumentoFiltro(inst)}
                    className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                      instrumentoFiltro === inst
                        ? 'bg-brand-500 text-white'
                        : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                    }`}
                  >
                    {inst}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Search + Select All */}
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por nome ou telefone..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                />
              </div>
              <button
                onClick={selectGroup}
                className="text-xs bg-brand-50 text-brand-700 px-3 py-2 rounded-lg hover:bg-brand-100 transition-colors whitespace-nowrap"
              >
                Selecionar grupo ({filtrados.length})
              </button>
              <button
                onClick={() => toggleAll(false)}
                className="text-xs bg-gray-100 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
              >
                Limpar
              </button>
            </div>

            {/* Contact List */}
            <div className="max-h-96 overflow-y-auto space-y-1">
              {filtrados.map((c) => (
                <div
                  key={c.id}
                  onClick={() => toggleOne(c.id)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    c.selected ? 'bg-brand-50 border border-brand-200' : 'hover:bg-gray-50'
                  }`}
                >
                  {c.selected ? (
                    <CheckSquare className="w-4 h-4 text-brand-500 flex-shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.nome || 'Sem nome'}</p>
                    <p className="text-xs text-gray-500">{c.telefone}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-xs text-gray-400">{c.instrumento_interesse || '—'}</span>
                  </div>
                </div>
              ))}
              {filtrados.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">
                  Nenhum contato encontrado
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right: Message Composer */}
        <div className="space-y-4">
          {/* Selected Summary */}
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <UserCheck className="w-4 h-4" />
              Destinatários
            </h3>
            <p className="text-2xl font-bold text-brand-600">{selecionados.length}</p>
            <p className="text-xs text-gray-500">contatos selecionados</p>

            {selecionados.length > 0 && selecionados.length <= 5 && (
              <div className="mt-3 space-y-1">
                {selecionados.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-700 truncate">{s.nome}</span>
                    <button
                      onClick={() => toggleOne(s.id)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Message */}
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Mensagem
            </h3>
            <textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="Digite a mensagem que será enviada..."
              rows={6}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">{mensagem.length} caracteres</p>

            <button
              onClick={enviarDisparos}
              disabled={enviando || selecionados.length === 0 || !mensagem.trim()}
              className="w-full mt-3 flex items-center justify-center gap-2 bg-brand-500 text-white px-4 py-2.5 rounded-lg hover:bg-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {enviando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Enviar para {selecionados.length} contato{selecionados.length !== 1 ? 's' : ''}
                </>
              )}
            </button>
          </div>

          {/* Result */}
          {resultado && (
            <div className="bg-white rounded-xl shadow-sm border p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Resultado do disparo</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-green-600">Enviados com sucesso</span>
                  <span className="font-bold text-green-600">{resultado.sucesso}</span>
                </div>
                {resultado.erro > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-red-500">Erros</span>
                    <span className="font-bold text-red-500">{resultado.erro}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
