import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, PhoneForwarded, AlertTriangle, Calendar, Phone } from 'lucide-react'
import type { Contato } from '@/types'

export default function Followup() {
  const [contatos, setContatos] = useState<Contato[]>([])

  useEffect(() => {
    loadFollowups()
  }, [])

  async function loadFollowups() {
    const { data } = await supabase
      .from('alunos')
      .select('*')
      .in('status', ['lead', 'qualificado', 'Em Follow-up', 'Primeiro Contato', 'Aguardando Experimental'])
      .order('created_at', { ascending: true })
    if (data) setContatos(data)
  }

  const followupEnviado = contatos.filter((c) => c.followup_enviado).length
  const hoje = new Date().toISOString().split('T')[0]
  const followupsHoje = 0

  const statusColor: Record<string, string> = {
    lead: 'bg-blue-100 text-blue-800',
    qualificado: 'bg-yellow-100 text-yellow-800',
    'Em Follow-up': 'bg-purple-100 text-purple-800',
    experimental_agendada: 'bg-brand-50 text-brand-800',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Follow-up</h1>
          <p className="text-gray-500">Acompanhe os contatos que precisam de retorno</p>
        </div>
        <button className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2.5 rounded-lg hover:bg-brand-600 transition-colors">
          <Plus className="w-4 h-4" />
          Novo Follow-up
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-2 mb-2">
            <PhoneForwarded className="w-4 h-4 text-blue-600" />
            <span className="text-sm text-gray-500">Aguardando Follow-up</span>
          </div>
          <p className="text-3xl font-bold">{contatos.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span className="text-sm text-gray-500">Follow-up já Enviado</span>
          </div>
          <p className="text-3xl font-bold">{followupEnviado}</p>
          <p className="text-xs text-gray-400 mt-1">Já houve tentativa anterior</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-green-600" />
            <span className="text-sm text-gray-500">Follow-ups Hoje</span>
          </div>
          <p className="text-3xl font-bold">{followupsHoje}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50">
          <h3 className="font-semibold text-gray-900">Contatos para Follow-up</h3>
        </div>
        <table className="w-full">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Contato</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Instrumento</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Data</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Origem</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {contatos.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <p className="text-sm font-medium">{c.nome}</p>
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {c.telefone}
                  </p>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{c.instrumento_interesse || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{c.origem || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${statusColor[c.status ?? ''] ?? 'bg-gray-100 text-gray-800'}`}>
                    {c.status || '—'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button className="text-xs bg-brand-500 text-white px-3 py-1.5 rounded-lg hover:bg-brand-600 transition-colors">
                    Follow-up
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {contatos.length === 0 && (
          <div className="text-center py-10 text-gray-400">
            Nenhum contato para follow-up
          </div>
        )}
      </div>
    </div>
  )
}
