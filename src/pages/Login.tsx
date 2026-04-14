import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import logoHorizontal from '@/assets/logos/cmmf-logo-horizontal-branco.png'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await signIn(email, password)
    if (error) {
      setError('Email ou senha incorretos')
    }
    setLoading(false)
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    setResetLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/definir-senha`,
    })
    setResetLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setResetSent(true)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0C3549] via-[#155A76] to-[#2183a8] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src={logoHorizontal}
            alt="CMMF"
            className="h-16 mx-auto mb-4"
          />
          <p className="text-white/60 text-sm italic">"Criando harmonia, transformando vidas."</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold text-gray-900">Entrar no Sistema</h1>
            <p className="text-sm text-gray-500 mt-1">Acesse sua conta CMMF</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm pr-12"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.59 6.59m7.532 7.532l3.29 3.29M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-500 text-white py-3 rounded-lg font-medium hover:bg-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <button
            onClick={() => { setShowReset(true); setResetSent(false); setError('') }}
            className="w-full text-center text-sm text-brand-500 hover:text-brand-600 mt-4"
          >
            Esqueci minha senha
          </button>
        </div>

        {/* Modal Esqueci minha senha */}
        {showReset && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowReset(false)}>
            <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              {resetSent ? (
                <div className="text-center">
                  <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900 mb-2">Email enviado!</h2>
                  <p className="text-sm text-gray-500 mb-4">Verifique sua caixa de entrada para redefinir a senha.</p>
                  <button onClick={() => setShowReset(false)} className="px-4 py-2 bg-brand-500 text-white rounded-lg text-sm hover:bg-brand-600">
                    Fechar
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="text-lg font-bold text-gray-900 mb-1">Recuperar senha</h2>
                  <p className="text-sm text-gray-500 mb-4">Informe seu email para receber o link de recuperação.</p>
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm"
                      required
                    />
                    <div className="flex gap-3">
                      <button type="button" onClick={() => setShowReset(false)} className="flex-1 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg border">
                        Cancelar
                      </button>
                      <button type="submit" disabled={resetLoading} className="flex-1 px-4 py-2.5 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50">
                        {resetLoading ? 'Enviando...' : 'Enviar link'}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        )}

        <p className="text-center text-white/40 text-xs mt-6">
          © {new Date().getFullYear()} Centro de Música Murilo Finger
        </p>
      </div>
    </div>
  )
}
