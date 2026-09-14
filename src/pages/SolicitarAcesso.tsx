import { useState } from 'react'
import { Link } from 'react-router-dom'
import logoHorizontal from '@/assets/logos/cmmf-logo-horizontal-branco.png'
import { Mail, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react'

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
      // Validação, criação de usuário e envio de email ficam todos no servidor
      // (a chave de serviço nunca chega ao navegador)
      const resp = await fetch('/api/solicitar-acesso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          redirectTo: `${window.location.origin}/definir-senha`,
        }),
      })
      const data = await resp.json()

      if (!resp.ok) {
        setErrorMsg(data.error || 'Erro ao verificar email. Tente novamente.')
        setLoading(false)
        return
      }

      if (!data.ok) {
        if (data.motivo === 'ja_cadastrado') {
          setErrorMsg('Este email já possui acesso ao sistema. Use "Esqueci minha senha" na tela de login.')
        } else {
          setErrorMsg('Email não encontrado no cadastro da escola. Verifique se digitou corretamente ou entre em contato com a secretaria.')
        }
        setLoading(false)
        return
      }

      setNomeUsuario(data.nome?.split(' ')[0] || '')
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
