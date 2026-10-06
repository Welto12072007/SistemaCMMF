import { useCallback, useEffect, useState } from 'react'
import { Loader2, Megaphone, Send, Users, GraduationCap, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Toast } from '@/components/gestao/ui'

interface Comunicado {
  id: string
  titulo: string
  mensagem: string
  publico: string[]
  enviar_whatsapp: boolean
  total_destinatarios: number
  criado_por_nome: string | null
  criado_em: string
}

const PUBLICO_LABEL: Record<string, string> = { alunos: 'Alunos', professores: 'Professores' }

export default function Comunicados() {
  const { perfil, hasRole } = useAuth()
  const podeEnviar = hasRole('admin', 'recepcao')

  const [historico, setHistorico] = useState<Comunicado[]>([])
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const [titulo, setTitulo] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [alvoAlunos, setAlvoAlunos] = useState(true)
  const [alvoProfessores, setAlvoProfessores] = useState(false)
  const [enviarWhatsapp, setEnviarWhatsapp] = useState(true)

  const carregar = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('gestao_comunicados')
      .select('*')
      .order('criado_em', { ascending: false })
      .limit(50)
    setHistorico((data ?? []) as Comunicado[])
    setLoading(false)
  }, [])

  useEffect(() => { void carregar() }, [carregar])

  async function enviar() {
    if (!titulo.trim() || !mensagem.trim()) { alert('Preencha título e mensagem.'); return }
    if (!alvoAlunos && !alvoProfessores) { alert('Escolha pelo menos um público.'); return }

    setEnviando(true)
    try {
      const publico: string[] = []
      if (alvoAlunos) publico.push('alunos')
      if (alvoProfessores) publico.push('professores')

      let total = 0

      if (enviarWhatsapp) {
        const inserts: Record<string, unknown>[] = []

        if (alvoAlunos) {
          const { data: alunos } = await supabase.from('alunos').select('id, telefone').eq('status', 'ativo')
          for (const a of alunos ?? []) {
            if (!a.telefone) continue
            inserts.push({
              aluno_id: a.id,
              tipo: 'comunicado_interno',
              canal: 'whatsapp',
              mensagem: `📢 *${titulo}*\n\n${mensagem}`,
              telefone_destinatario: a.telefone,
              status: 'pendente',
            })
          }
        }

        if (alvoProfessores) {
          const { data: profs } = await supabase.from('professores').select('id, telefone').eq('ativo', true)
          for (const p of profs ?? []) {
            if (!p.telefone) continue
            inserts.push({
              tipo: 'comunicado_interno',
              canal: 'whatsapp',
              mensagem: `📢 *${titulo}*\n\n${mensagem}`,
              telefone_destinatario: p.telefone,
              status: 'pendente',
            })
          }
        }

        total = inserts.length
        if (total === 0) { alert('Nenhum destinatário com telefone cadastrado para o público escolhido.'); setEnviando(false); return }
        if (!confirm(`Enviar este comunicado por WhatsApp para ${total} destinatário(s)?`)) { setEnviando(false); return }

        const { error } = await supabase.from('disparos_pendentes').insert(inserts)
        if (error) throw new Error(error.message)
      }

      const { error: errHist } = await supabase.from('gestao_comunicados').insert({
        titulo,
        mensagem,
        publico,
        enviar_whatsapp: enviarWhatsapp,
        total_destinatarios: total,
        criado_por_nome: perfil?.nome ?? null,
      })
      if (errHist) throw new Error(errHist.message)

      setTitulo('')
      setMensagem('')
      setToast(enviarWhatsapp ? `Comunicado enviado para ${total} destinatário(s).` : 'Comunicado registrado no histórico.')
      void carregar()
    } catch (e) {
      alert('Erro ao enviar comunicado:\n' + (e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-brand-500" /> Comunicados
        </h1>
        <p className="text-sm text-gray-500">Avisos para alunos e professores, com envio opcional por WhatsApp.</p>
      </div>

      {podeEnviar && (
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título do comunicado"
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <textarea
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            placeholder="Escreva a mensagem..."
            rows={4}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={alvoAlunos} onChange={(e) => setAlvoAlunos(e.target.checked)} />
              <Users className="w-4 h-4 text-gray-500" /> Alunos (ativos)
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={alvoProfessores} onChange={(e) => setAlvoProfessores(e.target.checked)} />
              <GraduationCap className="w-4 h-4 text-gray-500" /> Professores
            </label>
            <label className="flex items-center gap-2 cursor-pointer ml-auto">
              <input type="checkbox" checked={enviarWhatsapp} onChange={(e) => setEnviarWhatsapp(e.target.checked)} />
              Enviar também por WhatsApp
            </label>
          </div>

          <div className="flex justify-end">
            <button
              onClick={enviar}
              disabled={enviando}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-60"
            >
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Enviar comunicado
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="text-sm font-semibold text-gray-700">Histórico</h2>
          <button onClick={carregar} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg" title="Atualizar">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
          </div>
        ) : historico.length === 0 ? (
          <p className="text-sm text-gray-500 px-5 py-6 text-center">Nenhum comunicado enviado ainda.</p>
        ) : (
          <ul className="divide-y">
            {historico.map((c) => (
              <li key={c.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-gray-800 text-sm">{c.titulo}</span>
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {new Date(c.criado_em).toLocaleString('pt-BR')}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{c.mensagem}</p>
                <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                  {c.publico.map((p) => (
                    <span key={p} className="px-2 py-0.5 bg-gray-100 rounded-full">{PUBLICO_LABEL[p] ?? p}</span>
                  ))}
                  {c.enviar_whatsapp && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full">WhatsApp · {c.total_destinatarios}</span>}
                  {c.criado_por_nome && <span>por {c.criado_por_nome}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {toast && <Toast mensagem={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
