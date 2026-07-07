import { useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { X, CreditCard, Smartphone, DollarSign, Calculator, AlertCircle, CheckCircle } from 'lucide-react'

export interface AlunoCobrancaInicial {
  id: string
  nome: string
  instrumento_interesse: string | null
  taxa_matricula: number
  desconto_matricula: number
  valor_plano: number
  plano_frequencia: number   // aulas por semana
  data_matricula: string | null
  dia_inicio_aulas: number | null
  dia_vencimento: number | null
  cobranca_inicial_status: string
  asaas_customer_id: string | null
  mensalidade_id?: string | null
  cobranca_valor?: number | null
  cobranca_status?: string | null
}

interface Props {
  aluno: AlunoCobrancaInicial
  onClose: () => void
  onSaved: () => void
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Calcula a mensalidade proporcional pelo número de aulas restantes no mês */
function calcProporacional(valorPlano: number, aulasSemanais: number, diaInicio: number): number {
  const hoje = new Date()
  const anoRef = diaInicio > hoje.getDate() ? hoje.getFullYear() : hoje.getFullYear()
  const mesRef = hoje.getMonth()  // mês corrente (0-based)
  const diasNoMes = new Date(anoRef, mesRef + 1, 0).getDate()
  const diasRestantes = diasNoMes - diaInicio + 1
  const semanasRestantes = Math.ceil(diasRestantes / 7)
  const aulasRestantes = Math.max(1, semanasRestantes * aulasSemanais)
  const aulasNoMes = 4 * aulasSemanais
  const valorPorAula = valorPlano / aulasNoMes
  return Math.round(valorPorAula * aulasRestantes * 100) / 100
}

/** Próximo dia de vencimento a partir de hoje */
function proximoVencimento(dia: number | null): string {
  const hoje = new Date()
  const diaVenc = dia ?? 5
  let data = new Date(hoje.getFullYear(), hoje.getMonth(), diaVenc)
  if (data < hoje) {
    data = new Date(hoje.getFullYear(), hoje.getMonth() + 1, diaVenc)
  }
  return data.toISOString().slice(0, 10)
}

/** Data de início da assinatura recorrente (1º dia do mês seguinte) */
function proxMesAssinatura(vencimento: string): string {
  const d = new Date(vencimento + 'T12:00:00')
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 5) // dia 5 do mês seguinte
  return next.toISOString().slice(0, 10)
}

export default function CobrancaInicialModal({ aluno, onClose, onSaved }: Props) {
  const diaInicio = aluno.dia_inicio_aulas ?? new Date().getDate()
  const aulasSemanais = Math.max(1, aluno.plano_frequencia ?? 1)

  // Cálculos base
  const valorMatricula = Math.max(0, (aluno.taxa_matricula ?? 0) - (aluno.desconto_matricula ?? 0))
  const valorProporcional = calcProporacional(aluno.valor_plano ?? 0, aulasSemanais, diaInicio)
  const valorIntegral = aluno.valor_plano ?? 0

  const [tipoMensalidade, setTipoMensalidade] = useState<'proporcional' | 'integral' | 'personalizado'>('proporcional')
  const [valorPersonalizado, setValorPersonalizado] = useState('')
  const [incluirMatricula, setIncluirMatricula] = useState((aluno.taxa_matricula ?? 0) > 0)
  const [vencimento, setVencimento] = useState(proximoVencimento(aluno.dia_vencimento))
  const [dataAssinatura, setDataAssinatura] = useState(proxMesAssinatura(proximoVencimento(aluno.dia_vencimento)))
  const [metodo, setMetodo] = useState<'asaas' | 'manual'>('asaas')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(false)

  const valorMensalidade = useMemo(() => {
    if (tipoMensalidade === 'proporcional') return valorProporcional
    if (tipoMensalidade === 'integral') return valorIntegral
    return parseFloat(valorPersonalizado.replace(',', '.')) || 0
  }, [tipoMensalidade, valorPersonalizado, valorProporcional, valorIntegral])

  const valorTotal = useMemo(() => {
    return (incluirMatricula ? valorMatricula : 0) + valorMensalidade
  }, [incluirMatricula, valorMatricula, valorMensalidade])

  const items = useMemo(() => {
    const arr = []
    if (incluirMatricula && valorMatricula > 0) {
      arr.push({ tipo: 'matricula', descricao: 'Taxa de matrícula', valor: valorMatricula })
    }
    if (valorMensalidade > 0) {
      arr.push({
        tipo: tipoMensalidade === 'proporcional' ? 'proporcional' : 'mensalidade',
        descricao: tipoMensalidade === 'proporcional'
          ? `Mensalidade proporcional (${diaInicio}/${new Date().getMonth() + 1})`
          : 'Mensalidade integral',
        valor: valorMensalidade,
      })
    }
    return arr
  }, [incluirMatricula, valorMatricula, valorMensalidade, tipoMensalidade, diaInicio])

  async function confirmar() {
    if (valorTotal <= 0) { setErro('Valor total deve ser maior que zero.'); return }
    setSalvando(true)
    setErro('')

    try {
      // 1. Criar registro de cobrança inicial no banco
      const { data: rpcData, error: rpcErr } = await supabase.rpc('criar_cobranca_inicial', {
        p_aluno_id:   aluno.id,
        p_valor:      valorTotal,
        p_vencimento: vencimento,
        p_items:      items,
        p_metodo:     metodo,
      })
      if (rpcErr) throw new Error(rpcErr.message)
      if (!rpcData?.ok) throw new Error(rpcData?.error ?? 'Erro ao criar cobrança')

      const mensalidadeId = rpcData.mensalidade_id

      // 2. Se automático, gerar cobrança Asaas
      if (metodo === 'asaas') {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token ?? ''

        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/asaas-create-charge`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              mensalidade_id: mensalidadeId,
              billing_type: 'PIX',
            }),
          }
        )
        const chargeResult = await resp.json()
        if (!chargeResult.ok && !chargeResult.sem_cpf) {
          // Não bloquear — cobrança foi criada no sistema, só falhou o Asaas
          console.warn('Asaas charge failed:', chargeResult)
        }
      }

      setSucesso(true)
      setTimeout(() => { onSaved(); onClose() }, 1800)
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  if (sucesso) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl p-8 text-center max-w-sm w-full">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="font-semibold text-gray-900 text-lg">Cobrança inicial criada!</p>
          <p className="text-sm text-gray-500 mt-1">
            {metodo === 'asaas' ? 'Link de pagamento gerado no Asaas.' : 'Registrada para cobrança manual.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg my-4">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">Cobrança Inicial</h2>
            <p className="text-sm text-gray-500">{aluno.nome} · {aluno.instrumento_interesse ?? '—'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Matrícula */}
          {(aluno.taxa_matricula ?? 0) > 0 && (
            <div className="bg-gray-50 rounded-lg p-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={incluirMatricula}
                  onChange={e => setIncluirMatricula(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600"
                />
                <div className="flex-1">
                  <span className="font-medium text-gray-900 text-sm">Taxa de matrícula</span>
                  {(aluno.desconto_matricula ?? 0) > 0 && (
                    <span className="ml-2 text-xs text-gray-400 line-through">{fmt(aluno.taxa_matricula)}</span>
                  )}
                </div>
                <span className="font-semibold text-gray-900">{fmt(valorMatricula)}</span>
              </label>
            </div>
          )}

          {/* Tipo de mensalidade */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Primeira mensalidade</p>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:border-indigo-300 has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50">
                <input type="radio" name="tipo" value="proporcional" checked={tipoMensalidade === 'proporcional'}
                  onChange={() => setTipoMensalidade('proporcional')} className="accent-indigo-600" />
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-900">Valor proporcional</span>
                  <p className="text-xs text-gray-400">
                    Início dia {diaInicio}/{new Date().getMonth() + 1} · {aulasSemanais}×/sem ·
                    {' '}{Math.ceil((new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - diaInicio + 1) / 7) * aulasSemanais} aulas
                  </p>
                </div>
                <span className="font-semibold text-indigo-700">{fmt(valorProporcional)}</span>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:border-indigo-300 has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50">
                <input type="radio" name="tipo" value="integral" checked={tipoMensalidade === 'integral'}
                  onChange={() => setTipoMensalidade('integral')} className="accent-indigo-600" />
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-900">Valor integral</span>
                  <p className="text-xs text-gray-400">Mensalidade completa do mês</p>
                </div>
                <span className="font-semibold text-gray-700">{fmt(valorIntegral)}</span>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:border-indigo-300 has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50">
                <input type="radio" name="tipo" value="personalizado" checked={tipoMensalidade === 'personalizado'}
                  onChange={() => setTipoMensalidade('personalizado')} className="accent-indigo-600" />
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-900">Valor personalizado</span>
                </div>
                {tipoMensalidade === 'personalizado' && (
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-gray-500">R$</span>
                    <input
                      autoFocus
                      type="number"
                      value={valorPersonalizado}
                      onChange={e => setValorPersonalizado(e.target.value)}
                      className="w-24 text-right px-2 py-1 border rounded text-sm font-semibold"
                      placeholder="0,00"
                      step="0.01"
                    />
                  </div>
                )}
              </label>
            </div>
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Vencimento da cobrança</label>
              <input type="date" value={vencimento} onChange={e => {
                setVencimento(e.target.value)
                setDataAssinatura(proxMesAssinatura(e.target.value))
              }}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Início da recorrência</label>
              <input type="date" value={dataAssinatura} onChange={e => setDataAssinatura(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
              <p className="text-xs text-gray-400 mt-0.5">Próx. cobrança automática</p>
            </div>
          </div>

          {/* Método */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Forma de cobrança</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMetodo('asaas')}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors ${
                  metodo === 'asaas' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Smartphone className={`w-5 h-5 ${metodo === 'asaas' ? 'text-indigo-600' : 'text-gray-400'}`} />
                <span className="text-sm font-medium text-gray-800">Gerar automaticamente</span>
                <span className="text-xs text-gray-400 text-center">Link de pagamento Asaas</span>
              </button>
              <button
                onClick={() => setMetodo('manual')}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors ${
                  metodo === 'manual' ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <DollarSign className={`w-5 h-5 ${metodo === 'manual' ? 'text-amber-600' : 'text-gray-400'}`} />
                <span className="text-sm font-medium text-gray-800">Cobrar manualmente</span>
                <span className="text-xs text-gray-400 text-center">Dinheiro, Pix, cartão</span>
              </button>
            </div>
          </div>

          {/* Resumo */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Resumo da cobrança</p>
            {items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-600">{item.descricao}</span>
                <span className="font-medium">{fmt(item.valor)}</span>
              </div>
            ))}
            <div className="flex justify-between text-base font-bold pt-2 border-t">
              <span>Total</span>
              <span className="text-indigo-700">{fmt(valorTotal)}</span>
            </div>
          </div>

          {metodo === 'asaas' && !aluno.asaas_customer_id && (
            <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Aluno sem CPF cadastrado — será criado como cliente genérico no Asaas.</span>
            </div>
          )}

          {erro && (
            <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{erro}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 rounded-lg">
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={salvando || valorTotal <= 0}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {salvando ? (
              <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <CreditCard className="w-4 h-4" />
            )}
            {metodo === 'asaas' ? 'Gerar Cobrança' : 'Registrar Manual'}
          </button>
        </div>
      </div>
    </div>
  )
}
