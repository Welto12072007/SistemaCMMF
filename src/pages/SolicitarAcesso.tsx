import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Link } from 'react-router-dom'
import logoHorizontal from '@/assets/logos/cmmf-logo-horizontal-branco.png'
import { Mail, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react'

// Admin client for creating users (same pattern as Configuracoes)
import { createClient } from '@supabase/supabase-js'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://oykrtlkksqekvjiiqafy.supabase.co'
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY || ''
const adminClient = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

type Step = 'form' | 'success' | 'error'

export default function SolicitarAcesso() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<Step>('form')
  const [errorMsg, setErrorMsg] = useState('')
  const [nomeUsuario, setNomeUsuario] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    setLoading(true)

    try {
      // 1. Validar email via RPC
      const { data, error } = await supabase.rpc('validar_email_acesso', {
        p_email: email.trim().toLowerCase(),
      })

      if (error) {
        setErrorMsg('Erro ao verificar email. Tente novamente.')
        setLoading(false)
        return
      }

      if (!data?.ok) {
        if (data?.motivo === 'ja_cadastrado') {
          setErrorMsg('Este email já possui acesso ao sistema. Use "Esqueci minha senha" na tela de login.')
        } else {
          setErrorMsg('Email não encontrado no cadastro da escola. Verifique se digitou corretamente ou entre em contato com a secretaria.')
        }
        setLoading(false)
        return
      }

      if (!adminClient) {
        setErrorMsg('Configuração do sistema incompleta. Entre em contato com a administração.')
        setLoading(false)
        return
      }

      const { role, nome, ref_id } = data
      setNomeUsuario(nome?.split(' ')[0] || '')

      // 2. Criar usuário no Supabase Auth
      const tempPassword = crypto.randomUUID()
      const { data: created, error: errCreate } = await adminClient.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password: tempPassword,
        email_confirm: true,
        user_metadata: { nome, role },
      })

      if (errCreate) {
        // Se o usuário já existe no Auth mas não tem perfil ativo, enviar reset
        if (errCreate.message?.includes('already been registered')) {
          await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
            redirectTo: `${window.location.origin}/definir-senha`,
          })
          setStep('success')
          setLoading(false)
          return
        }
        setErrorMsg('Erro ao criar acesso: ' + errCreate.message)
        setLoading(false)
        return
      }

      if (!created?.user) {
        setErrorMsg('Erro inesperado ao criar conta.')
        setLoading(false)
        return
      }

      // 3. Criar perfil
      await supabase.from('perfis').insert({
        user_id: created.user.id,
        nome: nome,
        email: email.trim().toLowerCase(),
        role: role,
        professor_id: role === 'professor' ? ref_id : null,
        ativo: true,
      })

      // 4. Enviar email de redefinição de senha (funciona como convite)
      await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/definir-senha`,
      })

      setStep('success')
    } catch (err: any) {
      setErrorMsg('Erro inesperado. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0C3549] via-[#155A76] to-[#2183a8] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src={logoHorizontal} alt="CMMF" className="h-16 mx-auto mb-4" />
          <p className="text-white/60 text-sm italic">"Criando harmonia, transformando vidas."</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {step === 'success' ? (
            <div className="text-center">
              <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 mb-2">
                Email enviado{nomeUsuario ? `, ${nomeUsuario}` : ''}!
              </h1>
              <p className="text-sm text-gray-500 mb-6">
                Enviamos um link para <strong>{email}</strong>. Clique no link do email para definir sua senha e acessar o sistema.
              </p>
              <p className="text-xs text-gray-400 mb-6">
                Não recebeu? Verifique a pasta de spam ou tente novamente em alguns minutos.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-sm text-brand-500 hover:text-brand-600 font-medium"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar para login
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-brand-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Mail className="w-6 h-6 text-brand-600" />
                </div>
                <h1 className="text-xl font-bold text-gray-900">Solicitar Acesso</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Informe o email cadastrado na escola para criar seu acesso ao sistema.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Seu email cadastrado
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-sm"
                    required
                    autoFocus
                  />
                </div>

                {errorMsg && (
                  <div className="flex items-start gap-2 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-brand-500 text-white py-3 rounded-lg font-medium hover:bg-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Verificando...' : 'Solicitar acesso'}
                </button>
              </form>

              <Link
                to="/login"
                className="flex items-center justify-center gap-2 text-sm text-brand-500 hover:text-brand-600 mt-4"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar para login
              </Link>
            </>
          )}
        </div>

        <p className="text-center text-white/40 text-xs mt-6">
          © {new Date().getFullYear()} Centro de Música Murilo Finger
        </p>
      </div>
    </div>
  )
}
