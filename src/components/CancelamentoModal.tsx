import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { registrarLog } from '@/lib/logger'
import { X, Calculator, AlertCircle, CheckCircle2, FileDown, Loader2 } from 'lucide-react'
import jsPDF from 'jspdf'

interface AlunoDetalhe {
  id: string
  nome: string
  cpf: string | null
  telefone: string | null
  email: string | null
  responsavel_financeiro: string | null
  instrumento_interesse: string | null
  modalidade_preferida: string | null
  valor_plano: number | null
  data_matricula: string | null
  asaas_subscription_id: string | null
}

interface Calculo {
  ok: boolean
  error?: string
  dias_aviso_previo: number
  dentro_periodo_minimo: boolean
  meses_desde_matricula: number
  valor_por_aula: number
  multa: number
  aviso_previo: number
  valores_ja_pagos: number
  creditos_descontos: number
  saldo_final: number
}

const MOTIVOS = [
  'evasao', 'termino', 'trancamento', 'problema_financeiro',
  'insatisfacao', 'mudanca_cidade', 'outro',
]
const MOTIVO_LABELS: Record<string, string> = {
  evasao: 'Evasão', termino: 'Término', trancamento: 'Trancamento',
  problema_financeiro: 'Problema Financeiro', insatisfacao: 'Insatisfação',
  mudanca_cidade: 'Mudança de Cidade', outro: 'Outro',
}

function fmt(v: number) {
  return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtData(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}
function hoje() {
  return new Date().toISOString().slice(0, 10)
}
function maisDias(base: string, dias: number) {
  const d = new Date(base + 'T12:00:00')
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

export default function CancelamentoModal({
  alunoId, onClose, onSaved,
}: { alunoId: string; onClose: () => void; onSaved: () => void }) {
  const [aluno, setAluno] = useState<AlunoDetalhe | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [etapa, setEtapa] = useState<'formulario' | 'conferencia' | 'sucesso'>('formulario')

  const [dataSolicitacao, setDataSolicitacao] = useState(hoje())
  const [dataEfetiva, setDataEfetiva] = useState(maisDias(hoje(), 15))
  const [motivo, setMotivo] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [creditos, setCreditos] = useState('0')
  const [vencimentoCobranca, setVencimentoCobranca] = useState(maisDias(hoje(), 15))

  const [calculando, setCalculando] = useState(false)
  const [calculo, setCalculo] = useState<Calculo | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [cancelamentoId, setCancelamentoId] = useState<string | null>(null)
  const [gerandoPdf, setGerandoPdf] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('alunos')
        .select('id, nome, cpf, telefone, email, responsavel_financeiro, instrumento_interesse, modalidade_preferida, valor_plano, data_matricula, asaas_subscription_id')
        .eq('id', alunoId)
        .single()
      setAluno(data as AlunoDetalhe)
      setCarregando(false)
    })()
  }, [alunoId])

  async function calcular() {
    setErro('')
    if (!motivo) { setErro('Selecione o motivo do cancelamento.'); return }
    if (dataEfetiva < dataSolicitacao) { setErro('A data efetiva não pode ser anterior à data da solicitação.'); return }
    setCalculando(true)
    const { data, error } = await supabase.rpc('calcular_cancelamento_matricula', {
      p_aluno_id: alunoId,
      p_data_solicitacao: dataSolicitacao,
      p_data_efetiva: dataEfetiva,
      p_creditos_descontos: parseFloat(creditos.replace(',', '.')) || 0,
    })
    setCalculando(false)
    if (error) { setErro(error.message); return }
    if (!data?.ok) { setErro(data?.error ?? 'Erro ao calcular'); return }
    setCalculo(data as Calculo)
    setEtapa('conferencia')
  }

  async function confirmar() {
    setSalvando(true)
    setErro('')
    const { data, error } = await supabase.rpc('programar_cancelamento_matricula', {
      p_aluno_id: alunoId,
      p_data_solicitacao: dataSolicitacao,
      p_data_efetiva: dataEfetiva,
      p_motivo: motivo,
      p_observacoes: observacoes || null,
      p_responsavel: (await supabase.auth.getUser()).data.user?.email ?? null,
      p_creditos_descontos: parseFloat(creditos.replace(',', '.')) || 0,
      p_vencimento_cobranca: vencimentoCobranca,
    })
    setSalvando(false)
    if (error || !data?.ok) {
      await registrarLog({ action: 'programar_cancelamento_matricula', entity: 'aluno', entity_id: alunoId, level: 'error', status: 'erro', details: { error: error?.message ?? data?.error } })
      setErro(error?.message ?? data?.error ?? 'Erro ao programar cancelamento'); return
    }
    await registrarLog({ action: 'programar_cancelamento_matricula', entity: 'aluno', entity_id: alunoId, details: { motivo, data_efetiva: dataEfetiva } })
    setCancelamentoId(data.cancelamento_id)
    setCalculo(data as Calculo)
    setEtapa('sucesso')
    await gerarEUploadPdf(data.cancelamento_id)
    onSaved()
  }

  async function gerarEUploadPdf(cancId: string) {
    if (!aluno || !calculo) return
    setGerandoPdf(true)
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' })
      let y = 50

      doc.setFontSize(14)
      doc.text('SOLICITAÇÃO DE CANCELAMENTO DE SERVIÇOS', 40, y)
      doc.setFontSize(9)
      y += 16
      doc.text('Centro de Música Murilo Finger — CNPJ 29.247.149/0001-51', 40, y)

      const linha = (label: string, valor: string) => {
        y += 18
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text(label, 40, y)
        doc.setFont('helvetica', 'normal')
        doc.text(valor, 220, y)
      }

      const secao = (titulo: string) => {
        y += 22
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.text(titulo, 40, y)
        doc.setLineWidth(0.5)
        doc.line(40, y + 3, 555, y + 3)
      }

      secao('DADOS DO ALUNO')
      linha('Nome:', aluno.nome)
      linha('CPF:', aluno.cpf ?? '—')
      linha('Telefone:', aluno.telefone ?? '—')
      linha('E-mail:', aluno.email ?? '—')
      linha('Responsável financeiro:', aluno.responsavel_financeiro ?? '—')

      secao('DADOS DA MATRÍCULA')
      linha('Plano:', aluno.modalidade_preferida ?? '—')
      linha('Instrumento/atividade:', aluno.instrumento_interesse ?? '—')
      linha('Data de início:', fmtData(aluno.data_matricula))
      linha('Mensalidade vigente:', fmt(aluno.valor_plano ?? 0))

      secao('DADOS DO CANCELAMENTO')
      linha('Data da solicitação:', fmtData(dataSolicitacao))
      linha('Data efetiva de saída:', fmtData(dataEfetiva))
      linha('Motivo:', MOTIVO_LABELS[motivo] ?? motivo)
      linha('Observações:', observacoes || '—')
      linha('Cumprimento dos 6 meses iniciais:', calculo.dentro_periodo_minimo ? 'NÃO cumprido (multa aplicável)' : 'Cumprido (sem multa)')

      secao('APURAÇÃO FINANCEIRA')
      linha('Multa contratual:', fmt(calculo.multa))
      linha('Aviso prévio (2 aulas):', fmt(calculo.aviso_previo))
      linha('Valores já pagos (informativo):', fmt(calculo.valores_ja_pagos))
      linha('Créditos/descontos:', fmt(calculo.creditos_descontos))
      linha('SALDO FINAL:', fmt(calculo.saldo_final))
      linha('Vencimento da cobrança:', fmtData(vencimentoCobranca))

      secao('CONTROLE INTERNO')
      linha('Responsável pelo atendimento:', (await supabase.auth.getUser()).data.user?.email ?? '—')
      linha('Data do registro:', new Date().toLocaleString('pt-BR'))
      linha('Nº de controle:', cancId)

      const nomeArquivo = `Solicitacao_de_Cancelamento_de_Servicos_${aluno.nome.replace(/[^a-zA-Z0-9]/g, '_')}_${dataEfetiva}.pdf`
      const blob = doc.output('blob')

      const path = `${cancId}/${nomeArquivo}`
      const { error: upErr } = await supabase.storage.from('cancelamentos').upload(path, blob, {
        contentType: 'application/pdf',
        upsert: true,
      })
      if (!upErr) {
        const { data: pub } = supabase.storage.from('cancelamentos').getPublicUrl(path)
        await supabase.from('cancelamentos_matricula').update({
          pdf_url: pub.publicUrl,
          pdf_nome_arquivo: nomeArquivo,
        }).eq('id', cancId)
        setPdfUrl(pub.publicUrl)
      }
      doc.save(nomeArquivo)
    } catch (e) {
      console.warn('[CancelamentoModal] erro ao gerar/enviar PDF:', e)
    } finally {
      setGerandoPdf(false)
    }
  }

  const valorPorAulaLabel = useMemo(() => calculo ? fmt(calculo.valor_por_aula) : '—', [calculo])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg my-4">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">Programar Cancelamento de Matrícula</h2>
            <p className="text-sm text-gray-500">{aluno?.nome ?? 'Carregando...'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {carregando ? (
          <div className="p-8 text-center text-gray-400">Carregando...</div>
        ) : (
          <div className="p-5 space-y-4">
            {etapa === 'formulario' && (
              <>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
                  O aluno continua ativo e pode frequentar normalmente as aulas até a data efetiva de saída.
                  O contrato prevê 15 dias de aviso prévio.
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Data da solicitação</label>
                    <input type="date" value={dataSolicitacao}
                      onChange={e => setDataSolicitacao(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Data efetiva de saída</label>
                    <input type="date" value={dataEfetiva}
                      onChange={e => { setDataEfetiva(e.target.value); setVencimentoCobranca(e.target.value) }}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Motivo *</label>
                  <select value={motivo} onChange={e => setMotivo(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">Selecione...</option>
                    {MOTIVOS.map(m => <option key={m} value={m}>{MOTIVO_LABELS[m]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Observações</label>
                  <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2}
                    className="w-full px-3 py-2 border rounded-lg text-sm resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Créditos/descontos (R$)</label>
                    <input type="number" step="0.01" value={creditos} onChange={e => setCreditos(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Vencimento da cobrança</label>
                    <input type="date" value={vencimentoCobranca} onChange={e => setVencimentoCobranca(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                </div>
                {erro && (
                  <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{erro}</span>
                  </div>
                )}
              </>
            )}

            {etapa === 'conferencia' && calculo && (
              <>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Calculator className="w-3.5 h-3.5" /> Composição do cálculo
                  </p>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Aviso prévio dado</span>
                    <span>{calculo.dias_aviso_previo} dia(s) {calculo.dias_aviso_previo < 15 ? '(menor que 15 dias)' : '(≥ 15 dias, ok)'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Dentro dos 6 meses iniciais</span>
                    <span>{calculo.dentro_periodo_minimo ? `Sim (mês ${calculo.meses_desde_matricula + 1})` : 'Não'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Valor por aula (base do cálculo)</span>
                    <span>{valorPorAulaLabel}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t">
                    <span className="text-gray-600">Multa contratual</span>
                    <span className="font-medium">{fmt(calculo.multa)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Aviso prévio (2 aulas)</span>
                    <span className="font-medium">{fmt(calculo.aviso_previo)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Valores já pagos (informativo)</span>
                    <span>{fmt(calculo.valores_ja_pagos)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Créditos/descontos</span>
                    <span>- {fmt(calculo.creditos_descontos)}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold pt-2 border-t">
                    <span>Saldo final (cobrança de encerramento)</span>
                    <span className="text-indigo-700">{fmt(calculo.saldo_final)}</span>
                  </div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                  A cobrança será criada como <strong>cobrança avulsa</strong> (nunca assinatura) no Asaas,
                  com vencimento em {fmtData(vencimentoCobranca)}, somente na data efetiva de saída — a
                  recorrência normal do aluno também será encerrada nessa data.
                </div>
                {erro && (
                  <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{erro}</span>
                  </div>
                )}
              </>
            )}

            {etapa === 'sucesso' && calculo && (
              <div className="text-center py-4 space-y-3">
                <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
                <p className="font-semibold text-gray-900">Cancelamento programado com sucesso!</p>
                <p className="text-sm text-gray-500">
                  {aluno?.nome} permanece ativo até {fmtData(dataEfetiva)}. Saldo de encerramento: {fmt(calculo.saldo_final)}.
                </p>
                {gerandoPdf ? (
                  <p className="text-xs text-gray-400 flex items-center justify-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Gerando PDF...
                  </p>
                ) : pdfUrl ? (
                  <a href={pdfUrl} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-indigo-700 hover:underline">
                    <FileDown className="w-4 h-4" /> Abrir PDF gerado
                  </a>
                ) : null}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-xl">
          {etapa === 'formulario' && (
            <>
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 rounded-lg">Cancelar</button>
              <button onClick={calcular} disabled={calculando || !aluno}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {calculando ? 'Calculando...' : 'Calcular'}
              </button>
            </>
          )}
          {etapa === 'conferencia' && (
            <>
              <button onClick={() => setEtapa('formulario')} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 rounded-lg">Voltar</button>
              <button onClick={confirmar} disabled={salvando}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {salvando ? 'Confirmando...' : 'Confirmar Cancelamento'}
              </button>
            </>
          )}
          {etapa === 'sucesso' && (
            <button onClick={onClose} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Fechar</button>
          )}
        </div>
      </div>
    </div>
  )
}
