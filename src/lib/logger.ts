import { supabase } from './supabase'

export type LogLevel = 'info' | 'warning' | 'error'
export type LogStatus = 'sucesso' | 'erro'

interface RegistrarLogInput {
  action: string
  entity?: string
  entity_id?: string
  details?: Record<string, unknown>
  level?: LogLevel
  status?: LogStatus
  origem?: string
}

let cachedUserNome: string | null | undefined

/** Grava um evento em system_logs (Controle de Logs). Nunca lança — falha silenciosa não pode travar a ação real. */
export async function registrarLog(input: RegistrarLogInput): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser()

    if (cachedUserNome === undefined && user) {
      const { data: perfil } = await supabase.from('perfis').select('nome').eq('user_id', user.id).maybeSingle()
      cachedUserNome = perfil?.nome ?? null
    }

    await supabase.from('system_logs').insert({
      user_id: user?.id ?? null,
      user_nome: cachedUserNome || user?.email || 'Sistema',
      action: input.action,
      entity: input.entity ?? null,
      entity_id: input.entity_id ?? null,
      details: input.details ?? null,
      level: input.level ?? 'info',
      status: input.status ?? 'sucesso',
      origem: input.origem ?? 'web',
    })
  } catch (e) {
    console.error('[logger] falha ao registrar log:', e)
  }
}

/** Chamar no logout (AuthContext) pra limpar o cache de nome entre sessões. */
export function resetLogUserCache(): void {
  cachedUserNome = undefined
}
