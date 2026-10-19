import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, MessageSquare } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Encaminhamento {
  id: string; telefone: string; nome_contato: string | null; tipo: string; descricao: string | null; status: string
  responsavel: string | null; prazo: string | null; created_at: string; resolvido_em: string | null
}

export default function Encaminhamentos() {
  const [lista, setLista] = useState<Encaminhamento[]>([])
  const [tipos, setTipos] = useState<Record<string, string>>({})
  const [verResolvidos, setVerResolvidos] = useState(false)

  async function carregar() {
    const [e, t] = await Promise.all([
      supabase.from('encaminhamentos').select('*').eq('status', verResolvidos ? 'resolvido' : 'pendente')
        .order(verResolvidos ? 'resolvido_em' : 'created_at', { ascending: !verResolvidos }).limit(200),
      supabase.from('encaminhamento_tipos').select('tipo, nome'),
    ])
    setLista((e.data ?? []) as Encaminhamento[])
    setTipos(Object.fromEntries((t.data ?? []).map((x) => [x.tipo, x.nome])))
  }
  useEffect(() => { carregar() }, [verResolvidos])

  async function resolver(e: Encaminhamento) {
    const { data: u } = await supabase.auth.getUser()
    await supabase.from('encaminhamentos').update({ status: 'resolvido', resolvido_em: new Date().toISOString(), resolvido_por: u.user?.id, atendido_por: u.user?.email }).eq('id', e.id)
    carregar()
  }

  const atrasado = (e: Encaminhamento) => e.prazo && new Date(e.prazo) < new Date()

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Encaminhamentos</h1>
          <p className="text-gray-500 text-sm">Cada assunto que sai da IA tem um responsável, um prazo e uma baixa. Responsáveis e números de aviso ficam em Configurações &gt; IA.</p>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={verResolvidos} onChange={(e) => setVerResolvidos(e.target.checked)} /> Ver resolvidos</label>
      </div>
      <div className="bg-white border rounded-xl">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-gray-500 border-b"><th className="px-4 py-2">Contato</th><th>Resumo da IA</th><th>Responsável</th><th /></tr></thead>
          <tbody>
            {lista.map((e) => (
              <tr key={e.id} className="border-b align-top">
                <td className="px-4 py-3">
                  <p className="font-medium">{e.nome_contato || e.telefone}</p>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-800">{tipos[e.tipo] ?? e.tipo}</span>
                </td>
                <td className="py-3 pr-4 text-gray-700 max-w-lg">{e.descricao}</td>
                <td className="py-3 whitespace-nowrap">
                  {e.responsavel ?? '—'}
                  <p className={`text-xs ${atrasado(e) && !verResolvidos ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                    {verResolvidos ? `resolvido ${e.resolvido_em ? new Date(e.resolvido_em).toLocaleString('pt-BR') : ''}` : e.prazo ? `prazo ${new Date(e.prazo).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : `desde ${new Date(e.created_at).toLocaleDateString('pt-BR')}`}
                  </p>
                </td>
                <td className="py-3 pr-4">
                  <div className="flex gap-1.5 justify-end">
                    <Link to={`/conversas?telefone=${e.telefone}`} className="text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" /> Abrir conversa</Link>
                    {!verResolvidos && <button onClick={() => resolver(e)} className="text-xs px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Resolvido</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {lista.length === 0 && <p className="text-sm text-gray-400 text-center py-10">{verResolvidos ? 'Nada resolvido ainda.' : 'Nenhum encaminhamento pendente.'}</p>}
      </div>
    </div>
  )
}
