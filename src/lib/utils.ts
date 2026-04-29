import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Aplica máscara (XX) XXXXX-XXXX enquanto digita */
export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return digits.length ? `(${digits}` : ''
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

/** Normaliza para formato 55XXXXXXXXXXX (13 dígitos) para Antonia enviar mensagens */
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 11) return `55${digits}`
  if (digits.length === 13 && digits.startsWith('55')) return digits
  return digits
}

/** Formata 5551999999999 → (51) 99999-9999 para exibição */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return '—'
  const d = phone.replace(/\D/g, '')
  if (d.length === 13 && d.startsWith('55')) {
    return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
  }
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  }
  return phone
}

/** Aplica máscara 000.000.000-00 enquanto digita */
export function maskCPF(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

/** Aplica máscara 00.000.000/0000-00 enquanto digita */
export function maskCNPJ(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

/** Aplica máscara à chave PIX conforme o tipo */
export function maskPixKey(value: string, tipo: string): string {
  switch (tipo) {
    case 'cpf': return maskCPF(value)
    case 'cnpj': return maskCNPJ(value)
    case 'telefone': return maskPhone(value)
    case 'email':
    case 'aleatoria':
    default: return value
  }
}

/** Formata uma chave PIX já salva (só dígitos) para exibição conforme tipo */
export function formatPixKeyDisplay(chave: string | null | undefined, tipo: string | null | undefined): string {
  if (!chave) return '—'
  switch (tipo) {
    case 'cpf': return maskCPF(chave)
    case 'cnpj': return maskCNPJ(chave)
    case 'telefone': return formatPhoneDisplay(chave)
    default: return chave
  }
}

/** Remove máscara da chave PIX para salvar (CPF/CNPJ/telefone só dígitos; email/aleatória mantém) */
export function normalizePixKey(value: string, tipo: string): string {
  if (tipo === 'cpf' || tipo === 'cnpj') return value.replace(/\D/g, '')
  if (tipo === 'telefone') return normalizePhone(value)
  return value.trim()
}
