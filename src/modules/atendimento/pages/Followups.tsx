import { useEffect, useState } from 'react'
import { Check, Loader2, Plus, SkipForward, Trash2, X, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { acaoFollowup, descreverPrazo, GATILHOS, type Followup, type Gatilho, type Passo, type Prova, type Regua, type TipoPasso } from '../lib/crm'

type Aba = 'hoje' | 'reguas' | 'provas'
const TIPOS: TipoPasso[] = ['retomada', 'prova', 'oportunidade', 'encerramento']
const COR_TIPO: Record<TipoPasso, string> = {
  retomada: 'bg-sky-50 text-sky-700', prova: 'bg-violet-50 text-violet-700', oportunidade: 'bg-emerald-50 text-emerald-700', encerramento: 'bg-gray-100 text-gray-600',
}
const campo = 'border rounded-lg px-3 py-2 text-sm'

function preencher(msg: string, f: Followup) {
  return msg.split('[nome]').join(f.nome.split(/[ (]/)[0] ?? '').split('[modalidade]').join((f.instrumento ?? 'música').toLowerCase()).split('[prova]').join('‹prova do Banco de Provas›')
}

export default function Followups() {
  const [aba, setAba] = useState<Aba>('hoje')
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Follow-up</h1>
        <p className="text-gray-500 text-sm">O relógio de cada régua conta a partir do silêncio do cliente (ou do evento). Qualquer resposta do cliente tira ele da régua.</p>
      </div>
      <div className="flex gap-2">
        {([['hoje', 'Follow-ups de hoje'], ['reguas', 'Réguas'], ['provas', 'Banco de Provas']] as [Aba, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setAba(k)} className={`px-4 py-2 rounded-lg text-sm ${aba === k ? 'bg-brand-500 text-white' : 'bg-white border text-gray-700'}`}>{l}</button>
        ))}
      </div>
      {aba === 'hoje' && <Hoje />}
      {aba === 'reguas' && <Reguas />}
      {aba === 'provas' && <Provas />}
    </div>
  )
}

function Hoje() {
  const [lista, setLista] = useState<Followup[]>([])
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState('')

  async function carregar() {
    const fimDoDia = new Date(); fimDoDia.setHours(23, 59, 59, 999)
    const { data } = await supabase.from('vw_crm_followups').select('*').eq('status', 'ativa').lte('proximo_envio_em', fimDoDia.toISOString()).order('proximo_envio_em')
    setLista((data ?? []) as Followup[])
  }
  useEffect(() => { carregar() }, [])

  async function acao(a: 'enviar' | 'pular' | 'cancelar', id: string) {
    setOcupado(id); setErro('')
    try { await acaoFollowup(a, id) } catch (e) { setErro(e instanceof Error ? e.message : 'Erro') }
    setOcupado(null); carregar()
  }

  return (
    <div className="bg-white border rounded-xl">
      {erro && <p className="text-sm text-red-600 px-4 pt-3">{erro}</p>}
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-gray-500 border-b"><th className="px-4 py-2">Contato</th><th>Passo</th><th>Mensagem</th><th>Quando</th><th /></tr></thead>
        <tbody>
          {lista.map((f) => (
            <tr key={f.id} className="border-b align-top">
              <td className="px-4 py-3"><p className="font-medium">{f.nome}</p><p className="text-xs text-gray-500">{f.regua_nome}</p></td>
              <td className="py-3 whitespace-nowrap">Contato {f.passo_atual} de {f.total_passos}<br /><span className={`text-[11px] px-2 py-0.5 rounded-full ${COR_TIPO[f.passo_tipo]}`}>{f.passo_tipo}</span></td>
              <td className="py-3 pr-4 text-gray-700 max-w-md">{preencher(f.passo_mensagem ?? '', f)}</td>
              <td className="py-3 text-xs text-gray-500 whitespace-nowrap">{new Date(f.proximo_envio_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}{f.envio_automatico && <><br />automático</>}</td>
              <td className="py-3 pr-4">
                <div className="flex gap-1.5 justify-end">
                  <button disabled={ocupado === f.id} onClick={() => acao('enviar', f.id)} className="text-xs px-2.5 py-1.5 rounded-lg bg-brand-500 text-white flex items-center gap-1">{ocupado === f.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Enviar agora</button>
                  <button disabled={ocupado === f.id} onClick={() => acao('pular', f.id)} className="text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1"><SkipForward className="w-3.5 h-3.5" /> Pular</button>
                  <button disabled={ocupado === f.id} onClick={() => acao('cancelar', f.id)} title="Tirar da régua" className="text-xs px-2 py-1.5 rounded-lg border"><X className="w-3.5 h-3.5" /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {lista.length === 0 && <p className="text-sm text-gray-400 text-center py-10">Nenhum follow-up para hoje.</p>}
    </div>
  )
}

function Reguas() {
  const [reguas, setReguas] = useState<Regua[]>([])
  const [passos, setPassos] = useState<Record<string, Passo[]>>({})
  const [aberta, setAberta] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  async function carregar() {
    const [r, p] = await Promise.all([
      supabase.from('crm_reguas').select('*').order('ordem'),
      supabase.from('crm_regua_passos').select('*').order('ordem'),
    ])
    setReguas((r.data ?? []) as Regua[])
    const map: Record<string, Passo[]> = {}
    for (const x of (p.data ?? []) as Passo[]) (map[x.regua_id!] ??= []).push(x)
    setPassos(map)
  }
  useEffect(() => { carregar() }, [])

  async function salvarRegua(r: Regua) {
    await supabase.from('crm_reguas').update({ nome: r.nome, gatilho: r.gatilho, ativo: r.ativo, envio_automatico: r.envio_automatico }).eq('id', r.id)
    const lista = passos[r.id] ?? []
    const { data: atuais } = await supabase.from('crm_regua_passos').select('id').eq('regua_id', r.id)
    const manter = new Set(lista.filter((p) => p.id).map((p) => p.id))
    const remover = (atuais ?? []).map((x) => x.id).filter((id) => !manter.has(id))
    if (remover.length) await supabase.from('crm_regua_passos').delete().in('id', remover)
    // ordem temporária evita conflito de (regua_id, ordem) ao reordenar
    for (const [i, p] of lista.entries()) if (p.id) await supabase.from('crm_regua_passos').update({ ordem: 1000 + i }).eq('id', p.id)
    for (const [i, p] of lista.entries()) {
      const row = { regua_id: r.id, ordem: i + 1, horas: p.horas, referencia: p.referencia, tipo: p.tipo, mensagem: p.mensagem }
      if (p.id) await supabase.from('crm_regua_passos').update(row).eq('id', p.id)
      else await supabase.from('crm_regua_passos').insert(row)
    }
    setMsg(`"${r.nome}" salva. Passos alterados geram modelos novos em Configurações > Modelos WhatsApp (precisam de aprovação da Meta).`)
    carregar()
  }

  async function criar() {
    const { data } = await supabase.from('crm_reguas').insert({ nome: 'Nova régua', gatilho: 'manual', ativo: false, ordem: reguas.length + 1 }).select('*').single()
    if (data) { await carregar(); setAberta(data.id) }
  }

  async function excluir(r: Regua) {
    if (!confirm(`Excluir a régua "${r.nome}"? Quem estiver nela sai da régua.`)) return
    await supabase.from('crm_reguas').delete().eq('id', r.id)
    carregar()
  }

  const setP = (rid: string, i: number, patch: Partial<Passo>) => setPassos({ ...passos, [rid]: (passos[rid] ?? []).map((p, j) => (j === i ? { ...p, ...patch } : p)) })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        {msg ? <p className="text-sm text-gray-700">{msg}</p> : <span />}
        <button onClick={criar} className="px-3 py-2 rounded-lg bg-brand-500 text-white text-sm flex items-center gap-1"><Plus className="w-4 h-4" /> Criar régua</button>
      </div>
      {reguas.map((r) => (
        <div key={r.id} className="bg-white border rounded-xl">
          <button onClick={() => setAberta(aberta === r.id ? null : r.id)} className="w-full flex items-center justify-between px-5 py-4 text-left">
            <div>
              <p className="font-semibold text-gray-900">{r.nome}</p>
              <p className="text-xs text-gray-500">Começa em: {GATILHOS[r.gatilho]} · {(passos[r.id] ?? []).length} contatos · {r.envio_automatico ? 'envio automático' : 'equipe envia em "Follow-ups de hoje"'}</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${r.ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{r.ativo ? 'Ativa' : 'Desligada'}</span>
          </button>
          {aberta === r.id && (
            <div className="border-t px-5 py-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input className={`${campo} md:col-span-2`} value={r.nome} onChange={(e) => setReguas(reguas.map((x) => x.id === r.id ? { ...x, nome: e.target.value } : x))} />
                <select className={campo} value={r.gatilho} onChange={(e) => setReguas(reguas.map((x) => x.id === r.id ? { ...x, gatilho: e.target.value as Gatilho } : x))}>
                  {Object.entries(GATILHOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <div className="flex flex-col gap-1 text-sm">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={r.ativo} onChange={(e) => setReguas(reguas.map((x) => x.id === r.id ? { ...x, ativo: e.target.checked } : x))} /> Ativa</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={r.envio_automatico} onChange={(e) => setReguas(reguas.map((x) => x.id === r.id ? { ...x, envio_automatico: e.target.checked } : x))} /> Enviar sozinha (horário comercial)</label>
                </div>
              </div>
              {(passos[r.id] ?? []).map((p, i) => (
                <div key={p.id ?? `novo-${i}`} className="border rounded-lg p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">Contato {i + 1}</span>
                    <input type="number" min={1} className={`${campo} w-20`} value={p.horas} onChange={(e) => setP(r.id, i, { horas: Number(e.target.value) })} />
                    <span>horas</span>
                    <select className={campo} value={p.referencia} onChange={(e) => setP(r.id, i, { referencia: e.target.value as Passo['referencia'] })}>
                      <option value="inicio">depois do silêncio/evento</option><option value="antes_aula">antes da aula</option>
                    </select>
                    <select className={campo} value={p.tipo} onChange={(e) => setP(r.id, i, { tipo: e.target.value as TipoPasso })}>
                      {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <span className="text-xs text-gray-400">({descreverPrazo(p)})</span>
                    <button onClick={() => setPassos({ ...passos, [r.id]: (passos[r.id] ?? []).filter((_, j) => j !== i) })} className="ml-auto text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <textarea rows={2} className={`${campo} w-full`} value={p.mensagem} onChange={(e) => setP(r.id, i, { mensagem: e.target.value })} />
                </div>
              ))}
              <p className="text-xs text-gray-500">Use [nome], [modalidade] e [prova] no texto. Não termine a mensagem com um desses campos (regra da Meta). O passo "encerramento" marca o lead como perdido (ou libera a reserva).</p>
              <div className="flex gap-2">
                <button onClick={() => setPassos({ ...passos, [r.id]: [...(passos[r.id] ?? []), { ordem: (passos[r.id]?.length ?? 0) + 1, horas: 24, referencia: 'inicio', tipo: 'retomada', mensagem: 'Oi, [nome]! ' }] })} className="px-3 py-2 rounded-lg border text-sm flex items-center gap-1"><Plus className="w-4 h-4" /> Adicionar contato</button>
                <button onClick={() => salvarRegua(r)} className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm flex items-center gap-1"><Save className="w-4 h-4" /> Salvar régua</button>
                <button onClick={() => excluir(r)} className="ml-auto px-3 py-2 rounded-lg border border-red-200 text-red-600 text-sm">Excluir</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

const PROVA_VAZIA = { titulo: '', tipo: 'depoimento', perfil: '', instrumento: '', motivacao: '', conteudo: '' }

function Provas() {
  const [provas, setProvas] = useState<Prova[]>([])
  const [nova, setNova] = useState(PROVA_VAZIA)
  const [editando, setEditando] = useState<Prova | null>(null)

  async function carregar() {
    const { data } = await supabase.from('crm_provas').select('*').order('created_at')
    setProvas((data ?? []) as Prova[])
  }
  useEffect(() => { carregar() }, [])

  async function adicionar() {
    if (!nova.titulo.trim()) return
    await supabase.from('crm_provas').insert({ ...nova, perfil: nova.perfil || null, instrumento: nova.instrumento || null, motivacao: nova.motivacao || null })
    setNova(PROVA_VAZIA); carregar()
  }
  async function salvar() {
    if (!editando) return
    const { id, usos: _u, ...resto } = editando
    await supabase.from('crm_provas').update(resto).eq('id', id)
    setEditando(null); carregar()
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Depoimentos e histórias reais. No contato do tipo "prova" de cada régua, o sistema escolhe a que mais combina com o instrumento, o perfil e a motivação do lead. Provas sem texto (ou começando com "[") não são usadas.</p>
      <div className="bg-white border rounded-xl divide-y">
        {provas.map((p) => editando?.id === p.id ? (
          <div key={p.id} className="p-4 space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <input className={campo} value={editando.titulo} onChange={(e) => setEditando({ ...editando, titulo: e.target.value })} />
              <select className={campo} value={editando.tipo} onChange={(e) => setEditando({ ...editando, tipo: e.target.value })}>{['depoimento', 'historia', 'video', 'audio'].map((t) => <option key={t}>{t}</option>)}</select>
              <input className={campo} placeholder="Perfil" value={editando.perfil ?? ''} onChange={(e) => setEditando({ ...editando, perfil: e.target.value })} />
              <input className={campo} placeholder="Instrumento" value={editando.instrumento ?? ''} onChange={(e) => setEditando({ ...editando, instrumento: e.target.value })} />
              <input className={campo} placeholder="Motivação" value={editando.motivacao ?? ''} onChange={(e) => setEditando({ ...editando, motivacao: e.target.value })} />
            </div>
            <textarea rows={3} className={`${campo} w-full`} placeholder="Texto curto do depoimento (1 a 3 frases)" value={editando.conteudo} onChange={(e) => setEditando({ ...editando, conteudo: e.target.value })} />
            <div className="flex gap-2 justify-end">
              <label className="flex items-center gap-1 text-sm mr-auto"><input type="checkbox" checked={editando.ativo} onChange={(e) => setEditando({ ...editando, ativo: e.target.checked })} /> Ativa</label>
              <button onClick={() => setEditando(null)} className="text-sm px-3 py-1.5 border rounded-lg">Cancelar</button>
              <button onClick={salvar} className="text-sm px-3 py-1.5 rounded-lg bg-gray-900 text-white">Salvar</button>
            </div>
          </div>
        ) : (
          <button key={p.id} onClick={() => setEditando(p)} className="w-full text-left p-4 hover:bg-gray-50">
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm">{p.titulo}</p>
              <span className="text-xs text-gray-500">{p.tipo} · {p.perfil || 'todos'} · {p.instrumento || 'todos'} · usada {p.usos}x {!p.ativo && '· desativada'}</span>
            </div>
            <p className="text-sm text-gray-600 mt-1">{p.conteudo}</p>
          </button>
        ))}
      </div>
      <div className="bg-white border rounded-xl p-4 space-y-2">
        <h2 className="font-semibold text-sm">Cadastrar prova</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <input className={campo} placeholder="Título" value={nova.titulo} onChange={(e) => setNova({ ...nova, titulo: e.target.value })} />
          <select className={campo} value={nova.tipo} onChange={(e) => setNova({ ...nova, tipo: e.target.value })}>{['depoimento', 'historia', 'video', 'audio'].map((t) => <option key={t}>{t}</option>)}</select>
          <input className={campo} placeholder="Perfil (adulto, crianca...)" value={nova.perfil} onChange={(e) => setNova({ ...nova, perfil: e.target.value })} />
          <input className={campo} placeholder="Instrumento" value={nova.instrumento} onChange={(e) => setNova({ ...nova, instrumento: e.target.value })} />
          <input className={campo} placeholder="Motivação" value={nova.motivacao} onChange={(e) => setNova({ ...nova, motivacao: e.target.value })} />
        </div>
        <textarea rows={2} className={`${campo} w-full`} placeholder="Texto curto do depoimento" value={nova.conteudo} onChange={(e) => setNova({ ...nova, conteudo: e.target.value })} />
        <button onClick={adicionar} className="px-3 py-2 rounded-lg bg-brand-500 text-white text-sm flex items-center gap-1"><Plus className="w-4 h-4" /> Adicionar</button>
      </div>
    </div>
  )
}
