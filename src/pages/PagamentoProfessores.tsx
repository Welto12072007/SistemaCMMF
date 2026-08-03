import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  DollarSign, Download, RefreshCw, CheckCircle, Clock,
  ChevronLeft, ChevronRight, Plus, Trash2, X, FileText,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── tipos ─────────────────────────────────────────────────────────────────

interface Professor {
  id: string
  nome: string
  tipo_professor: string | null
  valor_hora_aula: number
  bonificacao_grupo: Record<string, number> | null
  chave_pix: string | null
  pix_tipo: string | null
}

interface PresencaRaw {
  professor_id: string
  data: string
  horario_id: string | null
  hora_inicio: string | null
  presente: boolean
}

interface Extra {
  id: string
  professor_id: string
  mes: number
  ano: number
  descricao: string
  valor: number
  aprovado: boolean
}

interface Fechamento {
  id: string
  professor_id: string
  mes: number
  ano: number
  presencas_count: number
  valor_por_aula: number
  valor_aulas: number
  valor_extras: number
  valor_total: number
  status: 'pendente' | 'pago'
  observacoes: string | null
  pago_em: string | null
}

// ─── helpers ───────────────────────────────────────────────────────────────

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

// ─── componente principal ──────────────────────────────────────────────────

export default function PagamentoProfessores() {
  const hoje = new Date()
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [ano, setAno] = useState(hoje.getFullYear())
  const [loading, setLoading] = useState(true)

  const [professores, setProfessores] = useState<Professor[]>([])
  const [presencasRaw, setPresencasRaw] = useState<PresencaRaw[]>([])
  const [extras, setExtras] = useState<Extra[]>([])
  const [fechamentos, setFechamentos] = useState<Fechamento[]>([])

  // modal extra
  const [modalExtra, setModalExtra] = useState<Professor | null>(null)
  const [formExtra, setFormExtra] = useState({ descricao: '', valor: '' })

  // modal fechar pagamento
  const [modalFechar, setModalFechar] = useState<Professor | null>(null)
  const [obsFechar, setObsFechar] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { carregar() }, [mes, ano])

  async function carregar() {
    setLoading(true)
    const [{ data: profs }, { data: pres }, { data: ext }, { data: fech }] = await Promise.all([
      supabase
        .from('professores')
        .select('id,nome,tipo_professor,valor_hora_aula,bonificacao_grupo,chave_pix,pix_tipo')
        .eq('ativo', true)
        .order('nome'),

      // buscar presenças confirmadas no mês com detalhes para agrupar por slot
      supabase
        .from('presencas')
        .select('professor_id,data,horario_id,hora_inicio,presente')
        .eq('presente', true)
        .gte('data', `${ano}-${String(mes).padStart(2, '0')}-01`)
        .lte('data', `${ano}-${String(mes).padStart(2, '0')}-${new Date(ano, mes, 0).getDate()}`),

      supabase
        .from('extras_professor')
        .select('*')
        .eq('mes', mes)
        .eq('ano', ano),

      supabase
        .from('pagamentos_professor_mensal')
        .select('*')
        .eq('mes', mes)
        .eq('ano', ano),
    ])

    setProfessores((profs ?? []) as Professor[])
    setExtras((ext ?? []) as Extra[])
    setFechamentos((fech ?? []) as Fechamento[])
    setPresencasRaw((pres ?? []) as PresencaRaw[])

    setLoading(false)
  }

  // ─── derivados ────────────────────────────────────────────────────────

  const linhas = useMemo(() => {
    return professores.map(p => {
      // Agrupar presenças deste professor por slot (data+horario_id ou data+hora_inicio)
      const presProf = presencasRaw.filter(x => x.professor_id === p.id)
      const slots = new Map<string, number>() // key → contagem de alunos
      presProf.forEach(pr => {
        const key = pr.horario_id
          ? `${pr.data}_${pr.horario_id}`
          : `${pr.data}_${pr.hora_inicio ?? 'x'}`
        slots.set(key, (slots.get(key) ?? 0) + 1)
      })

      // Calcular valor por slot baseado no número de alunos
      const bonif = p.bonificacao_grupo ?? { '2': 20, '3': 25, '4': 30 }
      let valorAulas = 0
      let qtdAulasIndividual = 0
      let qtdAulasGrupo = 0

      slots.forEach((qtdAlunos) => {
        if (qtdAlunos <= 1) {
          // Individual: usa valor_hora_aula
          valorAulas += p.valor_hora_aula
          qtdAulasIndividual++
        } else {
          // Grupo: busca valor na bonificação, ou usa o maior definido
          const key = String(qtdAlunos)
          let valorSlot: number
          if (bonif[key] != null) {
            valorSlot = bonif[key] as number
          } else {
            // Se não há valor exato para esse tamanho, usa o maior definido
            const chaves = Object.keys(bonif).map(Number).filter(n => !isNaN(n)).sort((a, b) => b - a)
            const maiorKey = chaves.find(k => k <= qtdAlunos) ?? chaves[0]
            valorSlot = maiorKey != null ? (bonif[String(maiorKey)] as number) : p.valor_hora_aula
          }
          valorAulas += valorSlot
          qtdAulasGrupo++
        }
      })

      const qtdAulas = slots.size
      const extrasProf = extras.filter(e => e.professor_id === p.id && e.aprovado)
      const valorExtras = extrasProf.reduce((s, e) => s + e.valor, 0)
      const total = valorAulas + valorExtras
      const fechado = fechamentos.find(f => f.professor_id === p.id)
      return { prof: p, qtdAulas, qtdAulasIndividual, qtdAulasGrupo, valorExtras, valorAulas, total, extrasProf, fechado }
    })
  }, [professores, presencasRaw, extras, fechamentos])

  const totalGeral = linhas.reduce((s, l) => s + l.total, 0)
  const totalPago = linhas.filter(l => l.fechado?.status === 'pago').reduce((s, l) => s + l.total, 0)
  const totalPendente = totalGeral - totalPago

  // ─── ações ────────────────────────────────────────────────────────────

  async function adicionarExtra() {
    if (!modalExtra) return
    const valor = parseFloat(formExtra.valor.replace(',', '.'))
    if (!formExtra.descricao.trim() || isNaN(valor) || valor <= 0) return
    setSalvando(true)
    await supabase.from('extras_professor').insert({
      professor_id: modalExtra.id,
      mes, ano,
      descricao: formExtra.descricao.trim(),
      valor,
      aprovado: true,
    })
    setSalvando(false)
    setModalExtra(null)
    setFormExtra({ descricao: '', valor: '' })
    carregar()
  }

  async function removerExtra(id: string) {
    await supabase.from('extras_professor').delete().eq('id', id)
    carregar()
  }

  async function fecharPagamento() {
    if (!modalFechar) return
    const linha = linhas.find(l => l.prof.id === modalFechar.id)
    if (!linha) return
    setSalvando(true)

    const payload = {
      professor_id: modalFechar.id,
      mes, ano,
      presencas_count: linha.qtdAulas,
      valor_por_aula: modalFechar.valor_hora_aula,
      valor_aulas: linha.valorAulas,
      valor_extras: linha.valorExtras,
      valor_total: linha.total,
      status: 'pago',
      observacoes: obsFechar || null,
      pago_em: new Date().toISOString().split('T')[0],
    }

    await supabase
      .from('pagamentos_professor_mensal')
      .upsert(payload, { onConflict: 'professor_id,mes,ano' })

    setSalvando(false)
    setModalFechar(null)
    setObsFechar('')
    carregar()
  }

  async function reabrirPagamento(professorId: string) {
    await supabase
      .from('pagamentos_professor_mensal')
      .update({ status: 'pendente', pago_em: null })
      .eq('professor_id', professorId)
      .eq('mes', mes)
      .eq('ano', ano)
    carregar()
  }

  function exportarExcel() {
    const wb = XLSX.utils.book_new()
    const data = [
      ['Professor', 'Tipo', 'Aulas Total', 'Individual', 'Grupo', 'Valor Aulas', 'Extras', 'Total', 'Status', 'PIX'],
      ...linhas.map(l => [
        l.prof.nome,
        l.prof.tipo_professor ?? '',
        l.qtdAulas,
        l.qtdAulasIndividual,
        l.qtdAulasGrupo,
        l.valorAulas,
        l.valorExtras,
        l.total,
        l.fechado?.status === 'pago' ? 'Pago' : 'Pendente',
        l.prof.chave_pix ?? '',
      ]),
      [],
      ['', '', '', '', '', '', 'TOTAL', totalGeral, '', ''],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'Pagamentos')
    XLSX.writeFile(wb, `pagamentos-professores-${mes.toString().padStart(2, '0')}-${ano}.xlsx`)
  }

  function gerarPDF() {
    const doc = new jsPDF()
    doc.setFontSize(14)
    doc.text(`Pagamento de Professores — ${MESES[mes - 1]}/${ano}`, 14, 18)
    doc.setFontSize(10)
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 26)

    autoTable(doc, {
      startY: 32,
      head: [['Professor', 'Tipo', 'Aulas', 'Indiv.', 'Grupo', 'Valor', 'Extras', 'Total', 'Status', 'PIX']],
      body: linhas.map(l => [
        l.prof.nome,
        l.prof.tipo_professor ?? '',
        l.qtdAulas,
        l.qtdAulasIndividual,
        l.qtdAulasGrupo,
        fmtMoeda(l.valorAulas),
        fmtMoeda(l.valorExtras),
        fmtMoeda(l.total),
        l.fechado?.status === 'pago' ? 'Pago' : 'Pendente',
        l.prof.chave_pix ?? '—',
      ]),
      foot: [['', '', '', '', '', '', 'Total Geral', fmtMoeda(totalGeral), '', '']],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [37, 99, 235] },
      footStyles: { fontStyle: 'bold', fillColor: [243, 244, 246] },
    })

    doc.save(`pagamentos-${mes.toString().padStart(2, '0')}-${ano}.pdf`)
  }

  // ─── render ────────────────────────────────────────────────────────────

  function navMes(delta: number) {
    let nm = mes + delta
    let na = ano
    if (nm < 1) { nm = 12; na-- }
    if (nm > 12) { nm = 1; na++ }
    setMes(nm); setAno(na)
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => carregar()} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={gerarPDF} className="flex items-center gap-1.5 px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition">
            <FileText size={14} /> PDF
          </button>
          <button onClick={exportarExcel} className="flex items-center gap-1.5 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
            <Download size={14} /> Excel
          </button>
        </div>
      </div>

      {/* Navegação de mês */}
      <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3">
        <button onClick={() => navMes(-1)} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronLeft size={18} /></button>
        <h2 className="text-base font-semibold text-gray-800">{MESES[mes - 1]} {ano}</h2>
        <button onClick={() => navMes(1)} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronRight size={18} /></button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total a pagar</p>
          <p className="text-xl font-bold text-gray-900">{fmtMoeda(totalGeral)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Já pago</p>
          <p className="text-xl font-bold text-green-600">{fmtMoeda(totalPago)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Pendente</p>
          <p className="text-xl font-bold text-orange-500">{fmtMoeda(totalPendente)}</p>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 font-medium">Professor</th>
                <th className="px-4 py-3 font-medium text-center">Tipo</th>
                <th className="px-4 py-3 font-medium text-right">Aulas</th>
                <th className="px-4 py-3 font-medium text-right">Individual</th>
                <th className="px-4 py-3 font-medium text-right">Grupo</th>
                <th className="px-4 py-3 font-medium text-right">Valor Aulas</th>
                <th className="px-4 py-3 font-medium text-right">Extras</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-4 py-3 font-medium text-center">Status</th>
                <th className="px-4 py-3 font-medium">PIX</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {linhas.map(({ prof, qtdAulas, qtdAulasIndividual, qtdAulasGrupo, valorAulas, valorExtras, total, extrasProf, fechado }) => (
                <tr key={prof.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{prof.nome}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${prof.tipo_professor === 'A' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                      {prof.tipo_professor ?? '?'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{qtdAulas}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{qtdAulasIndividual}</td>
                  <td className="px-4 py-3 text-right text-blue-600 font-medium">{qtdAulasGrupo > 0 ? qtdAulasGrupo : '—'}</td>
                  <td className="px-4 py-3 text-right">{fmtMoeda(valorAulas)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <span className={valorExtras > 0 ? 'text-green-600 font-medium' : 'text-gray-400'}>
                        {fmtMoeda(valorExtras)}
                      </span>
                      <button
                        onClick={() => setModalExtra(prof)}
                        className="text-gray-400 hover:text-blue-600 transition"
                        title="Adicionar extra"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                    {/* lista de extras */}
                    {extrasProf.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {extrasProf.map(e => (
                          <div key={e.id} className="flex items-center justify-end gap-1 text-xs text-gray-500">
                            <span className="truncate max-w-[100px]">{e.descricao}</span>
                            <span className="text-green-600">{fmtMoeda(e.valor)}</span>
                            <button onClick={() => removerExtra(e.id)} className="text-red-400 hover:text-red-600">
                              <Trash2 size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtMoeda(total)}</td>
                  <td className="px-4 py-3 text-center">
                    {fechado?.status === 'pago' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700">
                        <CheckCircle size={11} /> Pago
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-yellow-50 text-yellow-700">
                        <Clock size={11} /> Pendente
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-[120px] truncate">
                    {prof.chave_pix ? (
                      <span title={prof.chave_pix}>{prof.pix_tipo ? `(${prof.pix_tipo}) ` : ''}{prof.chave_pix}</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {fechado?.status === 'pago' ? (
                      <button
                        onClick={() => reabrirPagamento(prof.id)}
                        className="text-xs text-gray-400 hover:text-gray-600 hover:underline"
                      >
                        Reabrir
                      </button>
                    ) : (
                      <button
                        onClick={() => { setModalFechar(prof); setObsFechar('') }}
                        className="text-xs text-green-600 font-medium hover:text-green-800 hover:underline"
                      >
                        Marcar pago
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50">
                <td colSpan={7} className="px-4 py-3 text-sm font-semibold text-right text-gray-600">Total geral:</td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtMoeda(totalGeral)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Modal: adicionar extra */}
      {modalExtra && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-gray-900">Trabalho extra — {modalExtra.nome}</h2>
              <button onClick={() => setModalExtra(null)} className="p-1 hover:bg-gray-100 rounded"><X size={16} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Descrição *</label>
                <input
                  value={formExtra.descricao}
                  onChange={e => setFormExtra(f => ({ ...f, descricao: e.target.value }))}
                  placeholder="Ex: Recital, gravação..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Valor (R$) *</label>
                <input
                  value={formExtra.valor}
                  onChange={e => setFormExtra(f => ({ ...f, valor: e.target.value }))}
                  placeholder="0,00"
                  type="text"
                  inputMode="decimal"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <button onClick={() => setModalExtra(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button
                onClick={adicionarExtra}
                disabled={salvando}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {salvando ? 'Salvando...' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: fechar pagamento */}
      {modalFechar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-gray-900">Confirmar pagamento</h2>
              <button onClick={() => setModalFechar(null)} className="p-1 hover:bg-gray-100 rounded"><X size={16} /></button>
            </div>
            <div className="p-4 space-y-3">
              {(() => {
                const l = linhas.find(x => x.prof.id === modalFechar.id)
                if (!l) return null
                return (
                  <>
                    <p className="text-sm text-gray-700">
                      <strong>{modalFechar.nome}</strong> — {l.qtdAulas} aulas ({l.qtdAulasIndividual} indiv. + {l.qtdAulasGrupo} grupo)
                    </p>
                    <p className="text-lg font-bold text-gray-900">Total: {fmtMoeda(l.total)}</p>
                    {modalFechar.chave_pix && (
                      <p className="text-sm text-blue-600">PIX: {modalFechar.chave_pix}</p>
                    )}
                  </>
                )
              })()}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Observação (opcional)</label>
                <textarea
                  value={obsFechar}
                  onChange={e => setObsFechar(e.target.value)}
                  rows={2}
                  placeholder="Ex: Pago via PIX em 15/06"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <button onClick={() => setModalFechar(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button
                onClick={fecharPagamento}
                disabled={salvando}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {salvando ? 'Salvando...' : 'Confirmar pago'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
