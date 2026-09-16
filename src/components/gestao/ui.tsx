import { useEffect } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import { COR_CHIP, SITUACAO, fmtDataCurta, type GestaoPrioridade, type GestaoStatus, type SituacaoPrazo } from '@/lib/gestao'

const chip = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap'

export function StatusChip({ status }: { status: GestaoStatus | undefined }) {
  if (!status) return null
  return <span className={`${chip} ${COR_CHIP[status.cor ?? 'gray'] ?? COR_CHIP.gray}`}>{status.nome}</span>
}

/** Baixa e Média ficam discretas; só Alta e Crítica chamam atenção. */
export function PrioridadeChip({ prioridade }: { prioridade: GestaoPrioridade | undefined }) {
  if (!prioridade) return null
  if (prioridade.peso < 3) return <span className={`${chip} text-gray-500`}>{prioridade.nome}</span>
  return <span className={`${chip} ${COR_CHIP[prioridade.cor ?? 'gray'] ?? COR_CHIP.gray}`}>{prioridade.nome}</span>
}

export function PrazoChip({ situacao, prazo }: { situacao: SituacaoPrazo; prazo: string | null }) {
  const cfg = SITUACAO[situacao]
  const mostrarData = prazo && situacao !== 'sem_prazo' && situacao !== 'cancelada'
  return (
    <span className={`${chip} ${cfg.classe}`}>
      {cfg.label}
      {mostrarData && <span className="opacity-70 tabular-nums">· {fmtDataCurta(prazo)}</span>}
    </span>
  )
}

export function BarraProgresso({ valor }: { valor: number }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={`${valor}% concluído`}>
      <span className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <span
          className={`block h-full rounded-full ${valor >= 100 ? 'bg-emerald-500' : 'bg-brand-500'}`}
          style={{ width: `${Math.min(100, Math.max(0, valor))}%` }}
        />
      </span>
      <span className="text-xs text-gray-500 tabular-nums w-8">{valor}%</span>
    </span>
  )
}

export function Toast({ mensagem, onClose }: { mensagem: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [mensagem, onClose])

  return (
    <div role="status" className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 bg-gray-900 text-white text-sm rounded-lg shadow-lg px-4 py-2.5">
      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
      {mensagem}
      <button onClick={onClose} className="ml-2 text-white/60 hover:text-white" aria-label="Fechar aviso">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
