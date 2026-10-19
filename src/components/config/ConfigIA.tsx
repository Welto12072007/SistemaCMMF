import { useEffect, useState } from 'react'
import { Loader2, RotateCcw, Save, Send, Check, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Config {
  ligada: boolean; nome: string; apresentacao: string; modo_padrao: 'auto' | 'copiloto'; espera_seg: number; max_blocos: number
  modelo: string; temperatura: number; responder_fora_horario: boolean; mensagem_fora_horario: string; mensagem_erro: string
  semana_inicio: string; semana_fim: string; sabado_inicio: string; sabado_fim: string; endereco: string; link_mapa: string
  conhecimento_extra: string
}
interface Versao { id: number; versao: number; prompt: string; nota: string | null; ativo: boolean; criado_em: string }
interface TipoEnc { tipo: string; nome: string; responsavel: string; telefone_aviso: string | null; prazo_horas: number; ativo: boolean }
interface Exemplo { id: string; mensagem_cliente: string; sugestao_ia: string | null; resposta_enviada: string; aprovado: boolean }
interface Turno { role: 'user' | 'assistant'; content: string }

const campo = 'w-full border rounded-lg px-3 py-2 text-sm'
const rotulo = 'text-xs text-gray-500 block mb-1'

export default function ConfigIA() {
  const [cfg, setCfg] = useState<Config | null>(null)
  const [versoes, setVersoes] = useState<Versao[]>([])
  const [prompt, setPrompt] = useState('')
  const [nota, setNota] = useState('')
  const [tipos, setTipos] = useState<TipoEnc[]>([])
  const [exemplos, setExemplos] = useState<Exemplo[]>([])
  const [salvando, setSalvando] = useState('')
  const [msg, setMsg] = useState('')
  const [teste, setTeste] = useState<Turno[]>([])
  const [entrada, setEntrada] = useState('')
  const [testando, setTestando] = useState(false)

  async function carregar() {
    const [c, v, t, e] = await Promise.all([
      supabase.from('ia_config').select('*').eq('id', 1).single(),
      supabase.from('ia_prompt_versoes').select('*').order('versao', { ascending: false }),
      supabase.from('encaminhamento_tipos').select('*').order('ordem'),
      supabase.from('ia_exemplos').select('*').order('criado_em', { ascending: false }).limit(50),
    ])
    setCfg(c.data as Config)
    const vs = (v.data ?? []) as Versao[]
    setVersoes(vs)
    setPrompt(vs.find((x) => x.ativo)?.prompt ?? '')
    setTipos((t.data ?? []) as TipoEnc[])
    setExemplos((e.data ?? []) as Exemplo[])
  }
  useEffect(() => { carregar() }, [])

  const aviso = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 3000) }
  const set = <K extends keyof Config>(k: K, v: Config[K]) => cfg && setCfg({ ...cfg, [k]: v })

  async function salvarConfig() {
    if (!cfg) return
    setSalvando('cfg')
    const { data: u } = await supabase.auth.getUser()
    const { error } = await supabase.from('ia_config').update({ ...cfg, updated_at: new Date().toISOString(), updated_by: u.user?.id }).eq('id', 1)
    setSalvando(''); aviso(error ? `Erro: ${error.message}` : 'Configuração salva')
  }

  async function publicar() {
    if (!prompt.trim()) return
    setSalvando('prompt')
    const { data: u } = await supabase.auth.getUser()
    const prox = (versoes[0]?.versao ?? 0) + 1
    await supabase.from('ia_prompt_versoes').update({ ativo: false }).eq('ativo', true)
    const { error } = await supabase.from('ia_prompt_versoes').insert({ versao: prox, prompt, nota: nota || null, ativo: true, criado_por: u.user?.id })
    setSalvando(''); setNota(''); aviso(error ? `Erro: ${error.message}` : `Versão ${prox} publicada — a IA já usa este texto`)
    carregar()
  }

  async function restaurar(v: Versao) {
    await supabase.from('ia_prompt_versoes').update({ ativo: false }).eq('ativo', true)
    await supabase.from('ia_prompt_versoes').update({ ativo: true }).eq('id', v.id)
    aviso(`Versão ${v.versao} restaurada`); carregar()
  }

  async function salvarTipo(t: TipoEnc) {
    const { error } = await supabase.from('encaminhamento_tipos').update({ responsavel: t.responsavel, telefone_aviso: t.telefone_aviso || null, prazo_horas: t.prazo_horas, ativo: t.ativo }).eq('tipo', t.tipo)
    aviso(error ? `Erro: ${error.message}` : `${t.nome} salvo`)
  }

  async function testar() {
    if (!entrada.trim()) return
    const conversa: Turno[] = [...teste, { role: 'user', content: entrada.trim() }]
    setTeste(conversa); setEntrada(''); setTestando(true)
    const { data, error } = await supabase.functions.invoke('antonia', { body: { teste: { mensagens: conversa, prompt } } })
    setTestando(false)
    if (error || !data?.blocos) { setTeste([...conversa, { role: 'assistant', content: `[erro: ${error?.message ?? data?.error ?? 'sem resposta'}]` }]); return }
    setTeste([...conversa, ...(data.blocos as string[]).map((b) => ({ role: 'assistant' as const, content: b }))])
  }

  if (!cfg) return <div className="py-10 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>

  return (
    <div className="space-y-6">
      {msg && <div className="fixed bottom-6 right-6 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow z-50">{msg}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-6">
          <section className="bg-white border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Identidade e regras</h2>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.ligada} onChange={(e) => set('ligada', e.target.checked)} /> IA ligada (interruptor geral)</label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={rotulo}>Nome da assistente</label><input className={campo} value={cfg.nome} onChange={(e) => set('nome', e.target.value)} /></div>
              <div><label className={rotulo}>Modo padrão para contatos novos</label>
                <select className={campo} value={cfg.modo_padrao} onChange={(e) => set('modo_padrao', e.target.value as Config['modo_padrao'])}>
                  <option value="auto">Automático</option><option value="copiloto">Copiloto: equipe aprova</option>
                </select></div>
              <div><label className={rotulo}>Espera para juntar mensagens (s)</label><input type="number" className={campo} value={cfg.espera_seg} onChange={(e) => set('espera_seg', Number(e.target.value))} /></div>
              <div><label className={rotulo}>Máximo de blocos por resposta</label><input type="number" className={campo} value={cfg.max_blocos} onChange={(e) => set('max_blocos', Number(e.target.value))} /></div>
              <div><label className={rotulo}>Seg a sex</label><div className="flex gap-1"><input type="time" className={campo} value={cfg.semana_inicio.slice(0, 5)} onChange={(e) => set('semana_inicio', e.target.value)} /><input type="time" className={campo} value={cfg.semana_fim.slice(0, 5)} onChange={(e) => set('semana_fim', e.target.value)} /></div></div>
              <div><label className={rotulo}>Sábado</label><div className="flex gap-1"><input type="time" className={campo} value={cfg.sabado_inicio.slice(0, 5)} onChange={(e) => set('sabado_inicio', e.target.value)} /><input type="time" className={campo} value={cfg.sabado_fim.slice(0, 5)} onChange={(e) => set('sabado_fim', e.target.value)} /></div></div>
            </div>
            <div><label className={rotulo}>Frase de apresentação (primeiro contato)</label><textarea rows={2} className={campo} value={cfg.apresentacao} onChange={(e) => set('apresentacao', e.target.value)} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.responder_fora_horario} onChange={(e) => set('responder_fora_horario', e.target.checked)} /> Responder normalmente fora do horário de funcionamento</label>
            {!cfg.responder_fora_horario && <div><label className={rotulo}>Aviso fora do horário (enviado 1x por dia)</label><textarea rows={2} className={campo} value={cfg.mensagem_fora_horario} onChange={(e) => set('mensagem_fora_horario', e.target.value)} /></div>}
            <div><label className={rotulo}>Mensagem quando a IA falha</label><textarea rows={2} className={campo} value={cfg.mensagem_erro} onChange={(e) => set('mensagem_erro', e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={rotulo}>Endereço</label><input className={campo} value={cfg.endereco} onChange={(e) => set('endereco', e.target.value)} /></div>
              <div><label className={rotulo}>Modelo de IA</label><input className={campo} value={cfg.modelo} onChange={(e) => set('modelo', e.target.value)} /></div>
            </div>
            <button disabled={!!salvando} onClick={salvarConfig} className="px-4 py-2 rounded-lg bg-brand-500 text-white text-sm flex items-center gap-1.5"><Save className="w-4 h-4" /> Salvar configuração</button>
          </section>

          <section className="bg-white border rounded-xl p-5 space-y-3">
            <h2 className="font-semibold text-gray-900">Conhecimento</h2>
            <p className="text-xs text-gray-500">Planos e valores vêm da aba <b>Planos</b>, instrumentos e horários livres vêm do cadastro e da grade de horários. Escreva aqui só o que não existe em outro lugar do sistema (diferenciais, regras de matrícula, perguntas frequentes).</p>
            <textarea rows={8} className={campo} value={cfg.conhecimento_extra} onChange={(e) => set('conhecimento_extra', e.target.value)} />
            <button disabled={!!salvando} onClick={salvarConfig} className="px-4 py-2 rounded-lg border text-sm flex items-center gap-1.5"><Save className="w-4 h-4" /> Salvar conhecimento</button>
          </section>
        </div>

        <div className="space-y-6">
          <section className="bg-white border rounded-xl p-5 space-y-3">
            <h2 className="font-semibold text-gray-900">Prompt</h2>
            <p className="text-xs text-gray-500">Instruções de comportamento. As regras de segurança (não inventar horário, não confirmar sem o sistema, datas pelo calendário) ficam no código e valem mesmo se este texto mudar. O teste abaixo usa exatamente o que está escrito aqui, antes de publicar.</p>
            <textarea rows={16} className={`${campo} font-mono text-xs`} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            <div className="flex gap-2">
              <input className={campo} placeholder="O que mudou nesta versão? (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
              <button disabled={!!salvando} onClick={publicar} className="px-4 py-2 rounded-lg bg-brand-500 text-white text-sm whitespace-nowrap">Publicar nova versão</button>
            </div>
            <div className="divide-y border rounded-lg max-h-40 overflow-y-auto">
              {versoes.map((v) => (
                <div key={v.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>Versão {v.versao} · {new Date(v.criado_em).toLocaleString('pt-BR')} {v.nota && <span className="text-gray-500">— {v.nota}</span>}</span>
                  {v.ativo ? <span className="text-xs text-emerald-700">em uso</span> : <button onClick={() => restaurar(v)} className="text-xs flex items-center gap-1 text-gray-600 hover:text-gray-900"><RotateCcw className="w-3.5 h-3.5" /> Restaurar</button>}
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white border rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Testar o prompt</h2>
              <button onClick={() => setTeste([])} className="text-xs text-gray-500">Recomeçar conversa</button>
            </div>
            <p className="text-xs text-gray-500">Escreva como se fosse um cliente. Horários e planos são reais; nada é gravado nem enviado.</p>
            <div className="bg-gray-50 rounded-lg p-3 h-64 overflow-y-auto space-y-2">
              {teste.map((t, i) => (
                <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <p className={`max-w-[80%] text-sm rounded-xl px-3 py-2 whitespace-pre-wrap ${t.role === 'user' ? 'bg-brand-50' : 'bg-white shadow-sm'}`}>{t.content}</p>
                </div>
              ))}
              {testando && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
            </div>
            <div className="flex gap-2">
              <input className={campo} value={entrada} onChange={(e) => setEntrada(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && testar()} placeholder='Ex.: "Quanto custa a aula de violão?"' />
              <button disabled={testando} onClick={testar} className="px-3 py-2 rounded-lg bg-gray-900 text-white"><Send className="w-4 h-4" /></button>
            </div>
          </section>
        </div>
      </div>

      <section className="bg-white border rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">Encaminhamentos: quem cuida de cada assunto</h2>
        <p className="text-xs text-gray-500">Quando a IA passa um assunto para a equipe, o responsável recebe um aviso no número abaixo (vazio = número padrão de notificações) e a conversa sai da IA.</p>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-gray-500"><th className="py-1">Assunto</th><th>Responsável</th><th>Número de aviso</th><th>Prazo (h)</th><th>Ativo</th><th /></tr></thead>
          <tbody>
            {tipos.map((t, i) => (
              <tr key={t.tipo} className="border-t">
                <td className="py-1.5">{t.nome}</td>
                <td><input className="border rounded px-2 py-1 w-32" value={t.responsavel} onChange={(e) => setTipos(tipos.map((x, j) => j === i ? { ...x, responsavel: e.target.value } : x))} /></td>
                <td><input className="border rounded px-2 py-1 w-40" placeholder="5551..." value={t.telefone_aviso ?? ''} onChange={(e) => setTipos(tipos.map((x, j) => j === i ? { ...x, telefone_aviso: e.target.value.replace(/\D/g, '') } : x))} /></td>
                <td><input type="number" className="border rounded px-2 py-1 w-16" value={t.prazo_horas} onChange={(e) => setTipos(tipos.map((x, j) => j === i ? { ...x, prazo_horas: Number(e.target.value) } : x))} /></td>
                <td><input type="checkbox" checked={t.ativo} onChange={(e) => setTipos(tipos.map((x, j) => j === i ? { ...x, ativo: e.target.checked } : x))} /></td>
                <td><button onClick={() => salvarTipo(t)} className="text-xs px-2 py-1 border rounded">Salvar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="bg-white border rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">Respostas para aprender</h2>
        <p className="text-xs text-gray-500">Quando alguém edita uma sugestão do copiloto antes de enviar, a versão da equipe aparece aqui. Aprovadas, viram exemplo de como responder.</p>
        {exemplos.length === 0 && <p className="text-sm text-gray-400">Nenhuma ainda.</p>}
        {exemplos.map((e) => (
          <div key={e.id} className="border rounded-lg p-3 text-sm space-y-1">
            <p><span className="text-xs text-gray-500">Cliente:</span> {e.mensagem_cliente}</p>
            {e.sugestao_ia && <p className="text-gray-500 line-through">{e.sugestao_ia}</p>}
            <p><span className="text-xs text-gray-500">Equipe:</span> {e.resposta_enviada}</p>
            <div className="flex gap-2 justify-end">
              {!e.aprovado && <button onClick={async () => { await supabase.from('ia_exemplos').update({ aprovado: true }).eq('id', e.id); carregar() }} className="text-xs px-2 py-1 border rounded flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Aprovar</button>}
              {e.aprovado && <span className="text-xs text-emerald-700">aprovado</span>}
              <button onClick={async () => { await supabase.from('ia_exemplos').delete().eq('id', e.id); carregar() }} className="text-xs px-2 py-1 border rounded flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Excluir</button>
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
