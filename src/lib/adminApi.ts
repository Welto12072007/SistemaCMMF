import { supabase } from './supabase'

async function callAdminApi<T = any>(action: string, payload?: Record<string, unknown>): Promise<T> {
  const { data: session } = await supabase.auth.getSession()
  const token = session?.session?.access_token
  if (!token) throw new Error('Sessão expirada. Faça login novamente.')

  const resp = await fetch('/api/admin-users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, payload }),
  })
  const body = await resp.json()
  if (!resp.ok) throw new Error(body.error || 'Erro ao chamar API de administração')
  return body
}

export function adminListUsers() {
  return callAdminApi<{ users: { id: string; last_sign_in_at: string | null }[] }>('listUsers')
}

export function adminCreateUser(email: string, nome: string, role: string) {
  return callAdminApi<{ user: { id: string } }>('createUser', { email, nome, role })
}

export function adminDeleteUser(userId: string) {
  return callAdminApi<{ ok: true }>('deleteUser', { userId })
}

export function adminGenerateLink(email: string, redirectTo: string) {
  return callAdminApi<{ action_link: string | null }>('generateLink', { email, redirectTo })
}

// Convite com token próprio (V87) — só é consumido quando a pessoa SUBMETE a nova senha,
// nunca ao abrir o link (imune a scanners de email que "clicam" no link antes da pessoa).
async function callConviteApi<T = any>(action: string, payload?: Record<string, unknown>): Promise<T> {
  const { data: session } = await supabase.auth.getSession()
  const token = session?.session?.access_token
  if (!token) throw new Error('Sessão expirada. Faça login novamente.')

  const resp = await fetch('/api/convite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, payload }),
  })
  const body = await resp.json()
  if (!resp.ok) throw new Error(body.error || 'Erro ao gerar convite')
  return body
}

export function criarConviteSenha(email: string, nome: string) {
  return callConviteApi<{ link: string; email_enviado: boolean; motivo_falha: string | null }>('criar', {
    email,
    nome,
    origin: window.location.origin,
  })
}

// Confirmação é pública (a pessoa ainda não tem sessão) — não passa pelo callConviteApi autenticado
export async function confirmarConviteSenha(token: string, password: string) {
  const resp = await fetch('/api/convite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'confirmar', payload: { token, password } }),
  })
  const body = await resp.json()
  if (!resp.ok) throw new Error(body.error || 'Erro ao definir senha')
  return body as { ok: true }
}
