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
