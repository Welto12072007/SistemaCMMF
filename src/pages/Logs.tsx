import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ScrollText, Search, Filter, User, Clock } from 'lucide-react'

interface LogItem {
  id: string
  user_nome?: string
  action: string
  entity?: string
  entity_id?: string
  details?: Record<string, unknown>
  created_at?: string
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  create: { label: 'Criou', color: 'bg-green-100 text-green-700' },
  update: { label: 'Atualizou', color: 'bg-blue-100 text-blue-700' },
  delete: { label: 'Excluiu', color: 'bg-red-100 text-red-700' },
  login: { label: 'Login', color: 'bg-purple-100 text-purple-700' },
  logout: { label: 'Logout', color: 'bg-gray-100 text-gray-700' },
  send_message: { label: 'Enviou mensagem', color: 'bg-cyan-100 text-cyan-700' },
  sync: { label: 'Sincronizou', color: 'bg-yellow-100 text-yellow-700' },
}

export default function Logs() {
  const [logs, setLogs] = useState<LogItem[]>([])
  const [busca, setBusca] = useState('')
  const [filtroAction, setFiltroAction] = useState('Todas')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadLogs()
  }, [])

  async function loadLogs() {
    setLoading(true)
    const { data } = await supabase
      .from('system_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
    if (data) setLogs(data)
    setLoading(false)
  }

  const filtered = logs.filter((l) => {
    if (busca && !l.user_nome?.toLowerCase().includes(busca.toLowerCase()) && !l.entity?.toLowerCase().includes(busca.toLowerCase())) return false
    if (filtroAction !== 'Todas' && l.action !== filtroAction) return false
    return true
  })

  const uniqueActions = [...new Set(logs.map(l => l.action))]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-brand-500" />
            Controle de Logs
          </h1>
          <p className="text-gray-500">Registro de atividades do sistema</p>
        </div>
        <button
          onClick={loadLogs}
          className="text-sm bg-brand-500 text-white px-4 py-2 rounded-lg hover:bg-brand-600 transition-colors"
        >
          Atualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <span className="text-sm text-gray-500">Total de Logs</span>
          <p className="text-xl font-bold mt-1">{logs.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <span className="text-sm text-gray-500">Hoje</span>
          <p className="text-xl font-bold mt-1">
            {logs.filter(l => l.created_at && new Date(l.created_at).toDateString() === new Date().toDateString()).length}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <span className="text-sm text-gray-500">Usuários Ativos</span>
          <p className="text-xl font-bold mt-1">
            {new Set(logs.map(l => l.user_nome).filter(Boolean)).size}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <span className="text-sm text-gray-500">Ações Distintas</span>
          <p className="text-xl font-bold mt-1">{uniqueActions.length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por usuário ou entidade..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm"
          />
        </div>
        <select value={filtroAction} onChange={(e) => setFiltroAction(e.target.value)} className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm">
          <option>Todas</option>
          {uniqueActions.map(a => (
            <option key={a} value={a}>{ACTION_LABELS[a]?.label || a}</option>
          ))}
        </select>
      </div>

      <p className="text-sm text-gray-500 flex items-center gap-1">
        <Filter className="w-3.5 h-3.5" />
        {filtered.length} log(s)
      </p>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Data/Hora</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Usuário</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Ação</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Entidade</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Detalhes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((l) => {
              const actionInfo = ACTION_LABELS[l.action] || { label: l.action, color: 'bg-gray-100 text-gray-700' }
              return (
                <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {l.created_at ? new Date(l.created_at).toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                      }) : '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-gray-400" />
                      <span className="font-medium text-gray-900">{l.user_nome || 'Sistema'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${actionInfo.color}`}>
                      {actionInfo.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{l.entity || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">
                    {l.details ? JSON.stringify(l.details).slice(0, 80) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <ScrollText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Nenhum log registrado</p>
            <p className="text-sm mt-1">As atividades do sistema aparecerão aqui</p>
          </div>
        )}
      </div>
    </div>
  )
}
