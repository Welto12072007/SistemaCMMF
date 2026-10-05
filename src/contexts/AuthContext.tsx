import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { registrarLog, resetLogUserCache } from '@/lib/logger'
import { PERMISSOES_PADRAO_POR_ROLE, ROLES_CUSTOMIZAVEIS } from '@/lib/permissoes'
import type { User } from '@supabase/supabase-js'

export type UserRole = 'admin' | 'recepcao' | 'professor' | 'aluno'

export interface Perfil {
  id: string
  user_id: string
  nome: string
  email: string
  role: UserRole
  professor_id?: string
  telefone?: string
  avatar_url?: string
  ativo: boolean
  permissoes?: string[] | null
}

interface AuthContextType {
  user: User | null
  perfil: Perfil | null
  loading: boolean
  passwordRecovery: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  hasRole: (...roles: UserRole[]) => boolean
  hasAcesso: (modulo: string) => boolean
  clearPasswordRecovery: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  useEffect(() => {
    // Detectar se a URL tem hash de recovery — se sim, não liberar loading até onAuthStateChange processar
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const isRecoveryUrl = hashParams.get('type') === 'recovery'

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadPerfil(session.user.id)
      } else if (!isRecoveryUrl) {
        setLoading(false)
      }
      // Se isRecoveryUrl, loading fica true até onAuthStateChange processar o token
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true)
      }
      setUser(session?.user ?? null)
      if (session?.user) {
        loadPerfil(session.user.id)
      } else {
        setPerfil(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadPerfil(userId: string) {
    const { data } = await supabase
      .from('perfis')
      .select('*')
      .eq('user_id', userId)
      .single()
    setPerfil(data)
    setLoading(false)
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      await registrarLog({ action: 'login', entity: 'auth', details: { email }, level: 'warning', status: 'erro' })
      return { error: error.message }
    }
    await registrarLog({ action: 'login', entity: 'auth', details: { email } })
    return { error: null }
  }

  async function signOut() {
    await registrarLog({ action: 'logout', entity: 'auth' })
    await supabase.auth.signOut()
    setPerfil(null)
    resetLogUserCache()
  }

  function hasRole(...roles: UserRole[]) {
    return perfil ? roles.includes(perfil.role) : false
  }

  // Admin sempre tem acesso total; só papéis customizáveis (ver ROLES_CUSTOMIZAVEIS) são restringíveis por módulo —
  // professor/aluno mantêm o acesso fixo de sempre, controlado só pelo Guard de role
  function hasAcesso(modulo: string) {
    if (!perfil) return false
    if (perfil.role === 'admin') return true
    if (!ROLES_CUSTOMIZAVEIS.includes(perfil.role)) return true
    if (Array.isArray(perfil.permissoes)) return perfil.permissoes.includes(modulo)
    return PERMISSOES_PADRAO_POR_ROLE[perfil.role]?.includes(modulo) ?? false
  }

  function clearPasswordRecovery() {
    setPasswordRecovery(false)
  }

  return (
    <AuthContext.Provider value={{ user, perfil, loading, passwordRecovery, signIn, signOut, hasRole, hasAcesso, clearPasswordRecovery }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
