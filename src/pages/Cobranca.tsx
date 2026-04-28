import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Scale, AlertTriangle, FileText, Send, Search, RefreshCw, CheckCircle2, Clock, Download, Settings } from 'lucide-react'

interface MensalidadeAtualizada {
  id: string
  aluno_id: string
  aluno_nome: string
  cpf: string | null
  telefone: string | null
  referencia: string
  data_vencimento: string
  status: string
  status_cobranca: 'cobranca_interna' | 'encaminhado_juridico' | 'acordo' | 'quitado'
  dias_atraso: number
  valor_base: number
  multa: number
  juros: number
  total_atualizado: number
  disparos_enviados: number
  ultimo_disparo_em: string | null
}

interface Encaminhamento {
  id: string
  aluno_id: string
  encaminhado_em: string
  status: string
  valor_devido_total: number
  qtd_mensalidades: number
  dossie: any
  enviado_advogada_em: string | null
}

interface Config {
  multa_pct: number
  juros_mes_pct: number
  dias_disparo_1: number
  dias_disparo_2: number
  dias_juridico: number
  max_mensalidades_juridico: number
  advogada_nome: string
  advogada_telefone: string
}

const STATUS_COBRANCA_BADGE: Record<string, string> = {
  cobranca_interna: 'bg-yellow-100 text-yellow-800',
  encaminhado_juridico: 'bg-red-100 text-red-800',
  acordo: 'bg-blue-100 text-blue-800',
  quitado: 'bg-green-100 text-green-800',
}

const STATUS_COBRANCA_LABEL: Record<string, string> = {
  cobranca_interna: 'Cobrança Interna',
  encaminhado_juridico: 'Jurídico',
  acordo: 'Acordo',
  quitado: 'Quitado',
}

function brl(v: number) {
  return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatBR(date: string | null) {
  if (!date) return '—'
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y}`
}

export default function Cobranca() {
  const [tab, setTab] = useState<'inadimplentes' | 'juridico' | 'config'>('inadimplentes')
  const [items, setItems] = useState<MensalidadeAtualizada[]>([])
  const [enc, setEnc] = useState<Encaminhamento[]>([])
  const [cfg, setCfg] = useState<Config | null>(null)
  const [loading, setLoading] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')
  const [rodando, setRodando] = useState(false)
  const [dossie, setDossie] = useState<Encaminhamento | null>(null)

  useEffect(() => {
    if (tab === 'inadimplentes') loadInadimplentes()
    else if (tab === 'juridico') loadJuridico()
    else loadConfig()
  }, [tab])

  async function loadInadimplentes() {
    setLoading(true)
    const { data, error } = await supabase
      .from('vw_mensalidades_atualizado')
      .select('*')
      .gt('dias_atraso', 0)
      .neq('status', 'pago')
      .order('dias_atraso', { ascending: false })
    if (error) console.error(error)
    setItems((data || []) as MensalidadeAtualizada[])
    setLoading(false)
  }

  async function loadJuridico() {
    setLoading(true)
    const { data, error } = await supabase
      .from('juridico_encaminhamentos')
      .select('*')
      .order('encaminhado_em', { ascending: false })
    if (error) console.error(error)
    setEnc((data || []) as Encaminhamento[])
    setLoading(false)
  }

  async function loadConfig() {
    const { data, error } = await supabase.from('cobranca_config').select('*').eq('id', 1).maybeSingle()
    if (error) console.error(error)
    setCfg(data as Config | null)
  }

  async function saveConfig() {
    if (!cfg) return
    const { error } = await supabase.from('cobranca_config').update(cfg).eq('id', 1)
    if (error) alert('Erro ao salvar: ' + error.message)
    else alert('Configurações salvas!')
  }

  async function rodarCobranca() {
    if (!confirm('Rodar cobrança automática agora? Isso enfileirará disparos para todos os inadimplentes que atingem os critérios.')) return
    setRodando(true)
    const { data, error } = await supabase.rpc('rodar_cobranca_inadimplentes')
    setRodando(false)
    if (error) {
      alert('Erro: ' + error.message)
      return
    }
    alert(`✅ ${data?.disparos_enfileirados || 0} disparos enfileirados\n⚖️ ${data?.encaminhados_juridico || 0} casos encaminhados ao jurídico`)
    loadInadimplentes()
  }

  async function encaminharAluno(aluno_id: string, nome: string) {
    if (!confirm(`Encaminhar ${nome} ao jurídico agora? Será gerado um dossiê com todas as mensalidades em aberto.`)) return
    const { data, error } = await supabase.rpc('encaminhar_juridico', { p_aluno_id: aluno_id, p_encaminhado_por: 'manual (admin)' })
    if (error) { alert('Erro: ' + error.message); return }
    if ((data as any)?.sucesso === false) { alert('Erro: ' + (data as any).erro); return }
    alert(`✅ Encaminhado! Dossiê gerado.\nValor total: ${brl((data as any).valor_total)}\nMensalidades: ${(data as any).qtd_mensalidades}`)
    loadInadimplentes()
  }

  async function alterarStatus(id: string, novoStatus: string) {
    const { error } = await supabase.rpc('marcar_mensalidade_status_cobranca', { p_id: id, p_status: novoStatus })
    if (error) { alert('Erro: ' + error.message); return }
    loadInadimplentes()
  }

  function exportarDossiePDF(e: Encaminhamento) {
    const d = e.dossie
    const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dossiê - ${d.aluno?.nome}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:24px auto;padding:0 16px;color:#222}
h1{color:#1e40af;border-bottom:2px solid #1e40af;padding-bottom:8px}
h2{color:#374151;margin-top:24px}
.row{display:flex;gap:16px;margin:8px 0}
.label{font-weight:600;min-width:160px;color:#6b7280}
table{width:100%;border-collapse:collapse;margin-top:8px}
th,td{border:1px solid #d1d5db;padding:8px;text-align:left;font-size:13px}
th{background:#f3f4f6}
.total{font-size:18px;font-weight:700;color:#dc2626;text-align:right;margin-top:12px}
</style></head><body>
<h1>Dossiê de Cobrança Jurídica</h1>
<p><strong>Encaminhado em:</strong> ${new Date(e.encaminhado_em).toLocaleString('pt-BR')}</p>
<p><strong>Advogada:</strong> Ana Clara Pinheiro Silva — +55 51 99850-0205</p>

<h2>Dados do Aluno</h2>
<div class="row"><span class="label">Nome:</span><span>${d.aluno?.nome || '—'}</span></div>
<div class="row"><span class="label">CPF:</span><span>${d.aluno?.cpf || '—'}</span></div>
<div class="row"><span class="label">Telefone/WhatsApp:</span><span>${d.aluno?.telefone || '—'}</span></div>
<div class="row"><span class="label">E-mail:</span><span>${d.aluno?.email || '—'}</span></div>
<div class="row"><span class="label">Endereço:</span><span>${d.aluno?.endereco || '—'}</span></div>
<div class="row"><span class="label">Data de matrícula:</span><span>${d.aluno?.data_matricula ? formatBR(d.aluno.data_matricula) : '—'}</span></div>

<h2>Plano Contratado</h2>
<div class="row"><span class="label">Instrumento:</span><span>${d.plano?.instrumento || '—'}</span></div>
<div class="row"><span class="label">Valor mensalidade:</span><span>${brl(d.plano?.valor_mensalidade || 0)}</span></div>
<div class="row"><span class="label">Forma de pagamento:</span><span>${d.plano?.forma_pagamento || '—'}</span></div>

<h2>Aulas Regulares</h2>
${(d.aulas_regulares || []).length > 0 ? `<table><tr><th>Dia</th><th>Horário</th><th>Instrumento</th><th>Professor</th></tr>
${(d.aulas_regulares || []).map((a: any) => `<tr><td>${a.dia_semana}</td><td>${a.hora_inicio}</td><td>${a.instrumento || '—'}</td><td>${a.professor}</td></tr>`).join('')}
</table>` : '<p>Sem aulas regulares cadastradas.</p>'}

<h2>Mensalidades em Aberto (${d.qtd_mensalidades})</h2>
<table><tr><th>Referência</th><th>Vencimento</th><th>Dias atraso</th><th>Valor original</th><th>Multa</th><th>Juros</th><th>Total</th></tr>
${(d.mensalidades_pendentes || []).map((m: any) => `<tr>
<td>${m.referencia ? formatBR(m.referencia) : '—'}</td>
<td>${m.data_vencimento ? formatBR(m.data_vencimento) : '—'}</td>
<td>${m.dias_atraso}</td>
<td>${brl(m.valor_original)}</td>
<td>${brl(m.multa)}</td>
<td>${brl(m.juros)}</td>
<td><strong>${brl(m.total)}</strong></td>
</tr>`).join('')}</table>
<p class="total">VALOR TOTAL DEVIDO: ${brl(d.valor_devido_total)}</p>
</body></html>`
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300) }
  }

  const filtered = useMemo(() => {
    return items.filter(i => {
      if (filtroStatus !== 'todos' && i.status_cobranca !== filtroStatus) return false
      if (busca && !i.aluno_nome.toLowerCase().includes(busca.toLowerCase())) return false
      return true
    })
  }, [items, filtroStatus, busca])

  const kpis = useMemo(() => ({
    total: items.length,
    valor: items.reduce((s, i) => s + (i.total_atualizado || 0), 0),
    juridico: items.filter(i => i.status_cobranca === 'encaminhado_juridico').length,
    interna: items.filter(i => i.status_cobranca === 'cobranca_interna').length,
  }), [items])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cobrança & Jurídico</h1>
          <p className="text-gray-500">Inadimplência com multa, juros e encaminhamento à advogada</p>
        </div>
        <button
          onClick={rodarCobranca}
          disabled={rodando}
          className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2.5 rounded-lg hover:bg-brand-600 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${rodando ? 'animate-spin' : ''}`} />
          {rodando ? 'Rodando...' : 'Rodar cobrança automática'}
        </button>
      </div>

      <div className="flex gap-1 border-b">
        {[
          { k: 'inadimplentes', label: 'Inadimplentes', icon: AlertTriangle },
          { k: 'juridico', label: 'Jurídico', icon: Scale },
          { k: 'config', label: 'Configurações', icon: Settings },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.k ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'inadimplentes' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border rounded-xl p-4"><div className="text-xs text-gray-500">Inadimplentes</div><div className="text-2xl font-bold">{kpis.total}</div></div>
            <div className="bg-white border rounded-xl p-4"><div className="text-xs text-gray-500">Valor a receber</div><div className="text-2xl font-bold text-red-600">{brl(kpis.valor)}</div></div>
            <div className="bg-white border rounded-xl p-4"><div className="text-xs text-gray-500">Em cobrança interna</div><div className="text-2xl font-bold text-yellow-700">{kpis.interna}</div></div>
            <div className="bg-white border rounded-xl p-4"><div className="text-xs text-gray-500">No jurídico</div><div className="text-2xl font-bold text-red-700">{kpis.juridico}</div></div>
          </div>

          <div className="flex gap-3 flex-wrap">
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
              <option value="todos">Todos os status</option>
              <option value="cobranca_interna">Cobrança interna</option>
              <option value="encaminhado_juridico">Jurídico</option>
              <option value="acordo">Acordo</option>
              <option value="quitado">Quitado</option>
            </select>
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar aluno..." className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm" />
            </div>
          </div>

          <div className="bg-white border rounded-xl overflow-x-auto">
            {loading ? <div className="p-8 text-center text-gray-500">Carregando...</div> : filtered.length === 0 ? <div className="p-8 text-center text-gray-500">Nenhum inadimplente.</div> : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                  <tr>
                    <th className="text-left p-3">Aluno</th>
                    <th className="text-left p-3">Referência</th>
                    <th className="text-left p-3">Vencimento</th>
                    <th className="text-right p-3">Dias atraso</th>
                    <th className="text-right p-3">Original</th>
                    <th className="text-right p-3">Multa</th>
                    <th className="text-right p-3">Juros</th>
                    <th className="text-right p-3">Total</th>
                    <th className="text-center p-3">Disparos</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-center p-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(m => (
                    <tr key={m.id} className="border-t hover:bg-gray-50">
                      <td className="p-3 font-medium">{m.aluno_nome}<div className="text-xs text-gray-500">{m.telefone || '—'}</div></td>
                      <td className="p-3">{formatBR(m.referencia)}</td>
                      <td className="p-3">{formatBR(m.data_vencimento)}</td>
                      <td className="p-3 text-right font-bold text-red-600">{m.dias_atraso}</td>
                      <td className="p-3 text-right">{brl(m.valor_base)}</td>
                      <td className="p-3 text-right text-orange-700">{brl(m.multa)}</td>
                      <td className="p-3 text-right text-orange-700">{brl(m.juros)}</td>
                      <td className="p-3 text-right font-bold">{brl(m.total_atualizado)}</td>
                      <td className="p-3 text-center">{m.disparos_enviados}</td>
                      <td className="p-3">
                        <select value={m.status_cobranca} onChange={e => alterarStatus(m.id, e.target.value)}
                          className={`text-xs px-2 py-1 rounded ${STATUS_COBRANCA_BADGE[m.status_cobranca]}`}>
                          {Object.entries(STATUS_COBRANCA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </td>
                      <td className="p-3 text-center">
                        {m.status_cobranca !== 'encaminhado_juridico' && m.status_cobranca !== 'quitado' && (
                          <button onClick={() => encaminharAluno(m.aluno_id, m.aluno_nome)}
                            className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                            title="Encaminhar ao jurídico">
                            <Scale className="w-3 h-3 inline" /> Jurídico
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'juridico' && (
        <div className="bg-white border rounded-xl overflow-x-auto">
          {loading ? <div className="p-8 text-center text-gray-500">Carregando...</div> : enc.length === 0 ? <div className="p-8 text-center text-gray-500">Nenhum caso encaminhado.</div> : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  <th className="text-left p-3">Aluno</th>
                  <th className="text-left p-3">CPF</th>
                  <th className="text-left p-3">Encaminhado em</th>
                  <th className="text-right p-3">Mensalidades</th>
                  <th className="text-right p-3">Valor total</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-center p-3">Dossiê</th>
                </tr>
              </thead>
              <tbody>
                {enc.map(e => (
                  <tr key={e.id} className="border-t hover:bg-gray-50">
                    <td className="p-3 font-medium">{e.dossie?.aluno?.nome || '—'}</td>
                    <td className="p-3">{e.dossie?.aluno?.cpf || '—'}</td>
                    <td className="p-3">{new Date(e.encaminhado_em).toLocaleString('pt-BR')}</td>
                    <td className="p-3 text-right">{e.qtd_mensalidades}</td>
                    <td className="p-3 text-right font-bold text-red-600">{brl(e.valor_devido_total)}</td>
                    <td className="p-3"><span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800">{e.status}</span></td>
                    <td className="p-3 text-center">
                      <div className="flex gap-1 justify-center">
                        <button onClick={() => setDossie(e)} className="text-xs px-2 py-1 bg-gray-200 rounded hover:bg-gray-300" title="Ver dossiê"><FileText className="w-3 h-3 inline" /> Ver</button>
                        <button onClick={() => exportarDossiePDF(e)} className="text-xs px-2 py-1 bg-brand-500 text-white rounded hover:bg-brand-600" title="Imprimir/PDF"><Download className="w-3 h-3 inline" /> PDF</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'config' && cfg && (
        <div className="bg-white border rounded-xl p-6 max-w-2xl space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm">Multa (%)<input type="number" step="0.01" value={cfg.multa_pct} onChange={e => setCfg({ ...cfg, multa_pct: parseFloat(e.target.value) })} className="mt-1 w-full border rounded px-3 py-2" /></label>
            <label className="block text-sm">Juros ao mês (%)<input type="number" step="0.01" value={cfg.juros_mes_pct} onChange={e => setCfg({ ...cfg, juros_mes_pct: parseFloat(e.target.value) })} className="mt-1 w-full border rounded px-3 py-2" /></label>
            <label className="block text-sm">1º disparo após (dias)<input type="number" value={cfg.dias_disparo_1} onChange={e => setCfg({ ...cfg, dias_disparo_1: parseInt(e.target.value) })} className="mt-1 w-full border rounded px-3 py-2" /></label>
            <label className="block text-sm">2º disparo após (dias)<input type="number" value={cfg.dias_disparo_2} onChange={e => setCfg({ ...cfg, dias_disparo_2: parseInt(e.target.value) })} className="mt-1 w-full border rounded px-3 py-2" /></label>
            <label className="block text-sm">Encaminhar ao jurídico após (dias)<input type="number" value={cfg.dias_juridico} onChange={e => setCfg({ ...cfg, dias_juridico: parseInt(e.target.value) })} className="mt-1 w-full border rounded px-3 py-2" /></label>
            <label className="block text-sm">Ou após N mensalidades em atraso<input type="number" value={cfg.max_mensalidades_juridico} onChange={e => setCfg({ ...cfg, max_mensalidades_juridico: parseInt(e.target.value) })} className="mt-1 w-full border rounded px-3 py-2" /></label>
            <label className="block text-sm col-span-2">Advogada (nome)<input value={cfg.advogada_nome} onChange={e => setCfg({ ...cfg, advogada_nome: e.target.value })} className="mt-1 w-full border rounded px-3 py-2" /></label>
            <label className="block text-sm">Telefone<input value={cfg.advogada_telefone} onChange={e => setCfg({ ...cfg, advogada_telefone: e.target.value })} className="mt-1 w-full border rounded px-3 py-2" /></label>
          </div>
          <button onClick={saveConfig} className="bg-brand-500 text-white px-4 py-2 rounded hover:bg-brand-600">Salvar configurações</button>
        </div>
      )}

      {dossie && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDossie(null)}>
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Dossiê - {dossie.dossie?.aluno?.nome}</h2>
              <button onClick={() => setDossie(null)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <pre className="text-xs bg-gray-50 p-4 rounded overflow-x-auto">{JSON.stringify(dossie.dossie, null, 2)}</pre>
            <div className="mt-4 flex gap-2">
              <button onClick={() => exportarDossiePDF(dossie)} className="bg-brand-500 text-white px-4 py-2 rounded hover:bg-brand-600 flex items-center gap-2"><Download className="w-4 h-4" /> Imprimir / PDF</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
