import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Users, DollarSign, CreditCard, BookOpen } from 'lucide-react'
import type { Matricula } from '@/types'

export default function Matriculas() {
  const [matriculas, setMatriculas] = useState<Matricula[]>([])

  useEffect(() => {
    loadMatriculas()
  }, [])

  async function loadMatriculas() {
    const { data } = await supabase
      .from('matriculas')
      .select('*, contato:contatos(*), professor:professores(*), plano:planos(*)')
      .order('data_matricula', { ascending: false })
    if (data) setMatriculas(data)
  }

  const totalTaxas = matriculas.reduce((sum, m) => sum + (m.taxa_matricula || 0), 0)
  const totalPlanos = matriculas.reduce((sum, m) => sum + (m.valor_plano || 0), 0)
  const faturamento = totalTaxas + totalPlanos

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Matrículas</h1>
          <p className="text-gray-500">Gerencie as matrículas dos alunos</p>
        </div>
        <button className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2.5 rounded-lg hover:bg-brand-600 transition-colors">
          <Plus className="w-4 h-4" />
          Nova Matrícula
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-4 h-4 text-blue-600" />
            <span className="text-sm text-gray-500">Total de Matrículas</span>
          </div>
          <p className="text-2xl font-bold">{matriculas.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="w-4 h-4 text-green-600" />
            <span className="text-sm text-gray-500">Taxas de Matrícula</span>
          </div>
          <p className="text-2xl font-bold">R$ {totalTaxas.toLocaleString('pt-BR')}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-brand-600" />
            <span className="text-sm text-gray-500">Primeiro Mês</span>
          </div>
          <p className="text-2xl font-bold">R$ {totalPlanos.toLocaleString('pt-BR')}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <span className="text-sm text-gray-500">Faturamento Total</span>
          <p className="text-2xl font-bold text-brand-600">R$ {faturamento.toLocaleString('pt-BR')}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Aluno</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Data</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Plano</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Instrumento</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Professor</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Taxa</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Valor Plano</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Pagamento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {matriculas.map((m) => (
              <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-sm font-medium">{m.contato?.nome ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {new Date(m.data_matricula).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{m.plano?.nome ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{m.instrumento}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{m.professor?.nome ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-700">R$ {m.taxa_matricula}</td>
                <td className="px-4 py-3 text-sm text-gray-700">R$ {m.valor_plano}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{m.forma_pagamento}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {matriculas.length === 0 && (
          <div className="text-center py-10 text-gray-400">
            Nenhuma matrícula encontrada
          </div>
        )}
      </div>
    </div>
  )
}
