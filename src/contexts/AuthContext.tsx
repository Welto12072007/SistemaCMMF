import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
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
}

interface AuthContextType {
  user: User | null
  perfil: Perfil | null
  loading: boolean
  passwordRecovery: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  hasRole: (...roles: UserRole[]) => boolean
  clearPasswordRecovery: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadPerfil(session.user.id)
      } else {
        setLoading(false)
      }
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
    if (error) return { error: error.message }
    return { error: null }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setPerfil(null)
  }

  function hasRole(...roles: UserRole[]) {
    return perfil ? roles.includes(perfil.role) : false
  }

  function clearPasswordRecovery() {
    setPasswordRecovery(false)
  }

  return (
    <AuthContext.Provider value={{ user, perfil, loading, passwordRecovery, signIn, signOut, hasRole, clearPasswordRecovery }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
