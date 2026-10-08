import { useEffect, useMemo, useState } from 'react'
import { X, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { valorDoSlot, professorCompareceu, ROTULO_TIPO_FALTA, type ProfValores } from '@/lib/pagamentoProfessor'

interface Props {
  prof: ProfValores & { id: string; nome: string }
  mes: number
  ano: number
  onClose: () => void
}

interface Pres {
  id: string
  aluno_nome: string | null
  instrumento: string | null
  data: string
  hora_inicio: string | null
  horario_id: string | null
  presente: boolean
  tipo_falta: string | null
}
interface Repo { id: string; aluno_nome: string | null; instrumento: string | null; data_reposicao: string; hora_reposicao: string | null; data_falta: string | null }
interface Extra { id: string; descricao: string; valor: number }

const fmtMoeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (iso: string) => iso.split('-').reverse().join('/')

export default function ExtratoProfessorModal({ prof, mes, ano, onClose }: Props) {
  const [pres, setPres] = useState<Pres[]>([])
  const [repos, setRepos] = useState<Repo[]>([])
  const [extras, setExtras] = useState<Extra[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const ini = `${ano}-${String(mes).padStart(2, '0')}-01`
    const fim = `${ano}-${String(mes).padStart(2, '0')}-${new Date(ano, mes, 0).getDate()}`
    Promise.all([
      supabase.from('presencas')
        .select('id,aluno_nome,instrumento,data,hora_inicio,horario_id,presente,tipo_falta')
        .eq('professor_id', prof.id).gte('data', ini).lte('data', fim)
        .order('data').order('hora_inicio'),
      supabase.from('reposicoes')
        .select('id,aluno_nome,instrumento,data_reposicao,hora_reposicao,data_falta')
        .eq('professor_id', prof.id).eq('status', 'realizada')
        .gte('data_reposicao', ini).lte('data_reposicao', fim)
        .order('data_reposicao'),
      supabase.from('extras_professor')
        .select('id,descricao,valor').eq('professor_id', prof.id)
        .eq('mes', mes).eq('ano', ano).eq('aprovado', true),
    ]).then(([a, b, c]) => {
      setPres((a.data ?? []) as Pres[])
      setRepos((b.data ?? []) as Repo[])
      setExtras(((c.data ?? []) as any[]).map(e => ({ ...e, valor: Number(e.valor) })))
      setLoading(false)
    })
  }, [prof.id, mes, ano])

  const { linhas, resumoAlunos, totalAulas, totalRepos, totalExtras } = useMemo(() => {
    const slotKey = (p: Pres) => p.horario_id ? `${p.data}_${p.horario_id}` : `${p.data}_${p.hora_inicio ?? 'x'}`
    const slots = new Map<string, { total: number; compareceu: boolean; primeiro: string }>()
    pres.forEach(p => {
      const s = slots.get(slotKey(p)) ?? { total: 0, compareceu: false, primeiro: p.id }
      s.total++
      if (professorCompareceu(p.presente, p.tipo_falta)) s.compareceu = true
      slots.set(slotKey(p), s)
    })

    const linhas = pres.map(p => {
      const s = slots.get(slotKey(p))!
      const situacao = p.presente ? 'Presente' : (ROTULO_TIPO_FALTA[p.tipo_falta ?? ''] ?? 'Falta')
      let conta = ''
      let valor = 0
      if (!s.compareceu) {
        conta = p.tipo_falta === 'cancelou_professor' ? 'Não (cancelada pelo professor)' : 'Não (paga na reposição)'
      } else if (s.primeiro === p.id) {
        conta = 'Sim'
        valor = valorDoSlot(prof, s.total)
      } else {
        conta = 'Sim (mesma turma)'
      }
      return { ...p, situacao, conta, valor }
    })

    const alunos = new Map<string, { presentes: number; semAviso: number; comAviso: number; canceladas: number; repos: number }>()
    const get = (n: string) => alunos.get(n) ?? { presentes: 0, semAviso: 0, comAviso: 0, canceladas: 0, repos: 0 }
    pres.forEach(p => {
      const n = p.aluno_nome ?? '—'
      const a = get(n)
      if (p.presente) a.presentes++
      else if (p.tipo_falta === 'falta_injustificada') a.semAviso++
      else if (p.tipo_falta === 'falta_justificada') a.comAviso++
      else a.canceladas++
      alunos.set(n, a)
    })
    repos.forEach(r => {
      const n = r.aluno_nome ?? '—'
      const a = get(n)
      a.repos++
      alunos.set(n, a)
    })

    return {
      linhas,
      resumoAlunos: [...alunos.entries()].sort((x, y) => x[0].localeCompare(y[0])),
      totalAulas: linhas.reduce((s, l) => s + l.valor, 0),
      totalRepos: repos.length * prof.valor_hora_aula,
      totalExtras: extras.reduce((s, e) => s + e.valor, 0),
    }
  }, [pres, repos, extras, prof])

  function exportar() {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas.map(l => ({
      Data: fmtData(l.data), Hora: l.hora_inicio?.slice(0, 5) ?? '', Aluno: l.aluno_nome ?? '',
      Instrumento: l.instrumento ?? '', Situação: l.situacao, Contabiliza: l.conta, Valor: l.valor,
    }))), 'Aulas')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(repos.map(r => ({
      'Data reposição': fmtData(r.data_reposicao), Hora: r.hora_reposicao?.slice(0, 5) ?? '', Aluno: r.aluno_nome ?? '',
      'Falta original': r.data_falta ? fmtData(r.data_falta) : '', Valor: prof.valor_hora_aula,
    }))), 'Reposições')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumoAlunos.map(([n, a]) => ({
      Aluno: n, Presentes: a.presentes, 'Falta sem aviso': a.semAviso, 'Falta com aviso': a.comAviso,
      Canceladas: a.canceladas, 'Reposições realizadas': a.repos,
    }))), 'Por aluno')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(extras.map(e => ({ Descrição: e.descricao, Valor: e.valor }))), 'Extras')
    XLSX.writeFile(wb, `extrato-${prof.nome.replace(/\s+/g, '_')}-${ano}-${String(mes).padStart(2, '0')}.xlsx`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-gray-900">Extrato — {prof.nome} ({String(mes).padStart(2, '0')}/{ano})</h2>
          <div className="flex items-center gap-2">
            <button onClick={exportar} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
              <Download size={14} /> Excel
            </button>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={16} /></button>
          </div>
        </div>

        <div className="overflow-y-auto p-4 space-y-6 text-sm">
          {loading ? <p className="text-gray-500">Carregando…</p> : (
            <>
              <section>
                <h3 className="font-semibold text-gray-700 mb-2">Por aluno (conferência de aulas do mês)</h3>
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-gray-500 border-b">
                    <th className="py-1">Aluno</th><th className="text-right">Presentes</th><th className="text-right">Falta s/ aviso</th>
                    <th className="text-right">Falta c/ aviso</th><th className="text-right">Canceladas</th><th className="text-right">Reposições</th>
                  </tr></thead>
                  <tbody>
                    {resumoAlunos.map(([n, a]) => (
                      <tr key={n} className="border-b border-gray-50">
                        <td className="py-1">{n}</td><td className="text-right">{a.presentes}</td><td className="text-right">{a.semAviso}</td>
                        <td className="text-right">{a.comAviso}</td><td className="text-right">{a.canceladas}</td><td className="text-right">{a.repos}</td>
                      </tr>
                    ))}
                    {resumoAlunos.length === 0 && <tr><td colSpan={6} className="py-2 text-gray-400">Sem registros no mês.</td></tr>}
                  </tbody>
                </table>
              </section>

              <section>
                <h3 className="font-semibold text-gray-700 mb-2">Aulas registradas</h3>
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-gray-500 border-b">
                    <th className="py-1">Data</th><th>Hora</th><th>Aluno</th><th>Situação</th><th>Contabiliza?</th><th className="text-right">Valor</th>
                  </tr></thead>
                  <tbody>
                    {linhas.map(l => (
                      <tr key={l.id} className="border-b border-gray-50">
                        <td className="py-1">{fmtData(l.data)}</td><td>{l.hora_inicio?.slice(0, 5) ?? ''}</td>
                        <td>{l.aluno_nome}</td><td>{l.situacao}</td><td>{l.conta}</td>
                        <td className="text-right">{l.valor > 0 ? fmtMoeda(l.valor) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section>
                <h3 className="font-semibold text-gray-700 mb-2">Reposições realizadas no mês</h3>
                {repos.length === 0 ? <p className="text-xs text-gray-400">Nenhuma.</p> : (
                  <table className="w-full text-xs">
                    <tbody>
                      {repos.map(r => (
                        <tr key={r.id} className="border-b border-gray-50">
                          <td className="py-1">{fmtData(r.data_reposicao)} {r.hora_reposicao?.slice(0, 5) ?? ''}</td>
                          <td>{r.aluno_nome}</td>
                          <td className="text-gray-400">falta de {r.data_falta ? fmtData(r.data_falta) : '—'}</td>
                          <td className="text-right">{fmtMoeda(prof.valor_hora_aula)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              <section>
                <h3 className="font-semibold text-gray-700 mb-2">Honorários extras aprovados</h3>
                {extras.length === 0 ? <p className="text-xs text-gray-400">Nenhum.</p> : (
                  <table className="w-full text-xs">
                    <tbody>
                      {extras.map(e => (
                        <tr key={e.id} className="border-b border-gray-50">
                          <td className="py-1">{e.descricao}</td><td className="text-right">{fmtMoeda(e.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              <div className="border-t pt-3 text-right space-y-0.5">
                <p>Aulas: <b>{fmtMoeda(totalAulas)}</b></p>
                <p>Reposições: <b>{fmtMoeda(totalRepos)}</b></p>
                <p>Extras: <b>{fmtMoeda(totalExtras)}</b></p>
                <p className="text-base">Total: <b>{fmtMoeda(totalAulas + totalRepos + totalExtras)}</b></p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
