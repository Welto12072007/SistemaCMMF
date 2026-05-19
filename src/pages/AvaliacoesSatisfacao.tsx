import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Star, Search, TrendingUp, MessageSquare, User } from 'lucide-react'

interface Avaliacao {
  id: string
  nome_aluno: string | null
  email: string | null
  telefone: string | null
  nota: number | null
  comentario: string | null
  dados: Record<string, unknown>
  fonte: string
  created_at: string
}

function Estrelas({ nota }: { nota: number | null }) {
  if (!nota) return <span className="text-gray-400 text-sm">—</span>
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={14}
          className={n <= nota ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}
        />
      ))}
    </div>
  )
}

export default function AvaliacoesSatisfacao() {
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    loadAvaliacoes()
  }, [])

  async function loadAvaliacoes() {
    setLoading(true)
    const { data } = await supabase
      .from('avaliacoes_satisfacao')
      .select('*')
      .order('created_at', { ascending: false })
    setAvaliacoes(data ?? [])
    setLoading(false)
  }

  const lista = avaliacoes.filter((a) => {
    if (!busca) return true
    const q = busca.toLowerCase()
    return (
      a.nome_aluno?.toLowerCase().includes(q) ||
      a.comentario?.toLowerCase().includes(q) ||
      a.email?.toLowerCase().includes(q)
    )
  })

  const mediaNotas =
    avaliacoes.filter((a) => a.nota).length > 0
      ? (
          avaliacoes.filter((a) => a.nota).reduce((s, a) => s + (a.nota ?? 0), 0) /
          avaliacoes.filter((a) => a.nota).length
        ).toFixed(1)
      : null

  const distribuicao = [5, 4, 3, 2, 1].map((n) => ({
    nota: n,
    total: avaliacoes.filter((a) => a.nota === n).length,
  }))

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Avaliações de Satisfação</h1>
          <p className="text-gray-500 text-sm mt-0.5">Respostas recebidas via Google Forms</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar..."
              className="pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
          <div className="bg-blue-100 p-2 rounded-lg">
            <MessageSquare size={20} className="text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{avaliacoes.length}</p>
            <p className="text-gray-500 text-sm">Respostas total</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
          <div className="bg-yellow-100 p-2 rounded-lg">
            <Star size={20} className="text-yellow-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{mediaNotas ?? '—'}</p>
            <p className="text-gray-500 text-sm">Nota média</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4">
          <p className="text-sm font-medium text-gray-600 mb-2 flex items-center gap-1">
            <TrendingUp size={14} /> Distribuição
          </p>
          <div className="space-y-1">
            {distribuicao.map(({ nota, total }) => (
              <div key={nota} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-4">{nota}★</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-yellow-400 h-2 rounded-full transition-all"
                    style={{
                      width:
                        avaliacoes.length > 0
                          ? `${(total / avaliacoes.length) * 100}%`
                          : '0%',
                    }}
                  />
                </div>
                <span className="text-xs text-gray-400 w-4">{total}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Carregando...</div>
        ) : lista.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Star size={32} className="mx-auto mb-2 opacity-30" />
            <p>Nenhuma avaliação recebida ainda</p>
            <p className="text-xs mt-1">As respostas do Google Forms aparecerão aqui automaticamente</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Data</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Aluno</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Nota</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Comentário</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lista.map((av) => (
                  <tr key={av.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(av.created_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <User size={12} className="text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {av.nome_aluno || <span className="text-gray-400 italic">Anônimo</span>}
                          </p>
                          {av.email && <p className="text-xs text-gray-400">{av.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Estrelas nota={av.nota} />
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      {av.comentario ? (
                        <p className="text-gray-700 line-clamp-2">{av.comentario}</p>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {av.dados && Object.keys(av.dados).length > 0 && (
                        <details className="cursor-pointer">
                          <summary className="text-xs text-blue-600 hover:underline">
                            Ver todas as respostas ({Object.keys(av.dados).length})
                          </summary>
                          <div className="mt-2 space-y-1 bg-gray-50 rounded p-2 max-w-sm">
                            {Object.entries(av.dados).map(([k, v]) => (
                              <div key={k} className="text-xs">
                                <span className="font-medium text-gray-600">{k}:</span>{' '}
                                <span className="text-gray-800">{String(v)}</span>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
