import { useCallback, useEffect, useMemo, useState } from 'react'
import { FolderKanban, Loader2, Plus, Trash2, UploadCloud, Users2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  ModuloNaoInstaladoError, areasOrdenadas, carregarContexto, rotuloArea,
  type GestaoAtribuicao, type GestaoContexto, type GestaoProjeto, type GestaoTipoReuniao,
} from '@/lib/gestao'
import { Toast } from '@/components/gestao/ui'

const campo = 'w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30'
const secao = 'bg-white rounded-xl border p-5'

type Aba = 'areas' | 'gerentes' | 'projetos' | 'reunioes' | 'pessoas'

export default function GestaoConfiguracoes() {
  const [ctx, setCtx] = useState<GestaoContexto | null>(null)
  const [projetos, setProjetos] = useState<GestaoProjeto[]>([])
  const [tipos, setTipos] = useState<GestaoTipoReuniao[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [aba, setAba] = useState<Aba>('areas')

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const contexto = await carregarContexto()
      setCtx(contexto)
      const [proj, tip] = await Promise.all([
        supabase.from('gestao_projetos').select('id, nome, descricao, area_id, ativo, arquivado_em').is('arquivado_em', null).order('nome'),
        supabase.from('gestao_tipos_reuniao').select('id, nome, cor, posicao, arquivado_em').is('arquivado_em', null).order('posicao'),
      ])
      if (proj.error) throw new Error(proj.error.message)
      if (tip.error) throw new Error(tip.error.message)
      setProjetos((proj.data ?? []) as GestaoProjeto[])
      setTipos((tip.data ?? []) as GestaoTipoReuniao[])
    } catch (e) {
      setErro(e instanceof ModuloNaoInstaladoError ? 'O módulo Gestão ainda não foi instalado neste banco.' : (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void carregar() }, [carregar])

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  if (erro) return <div className="p-6"><div className="bg-red-50 text-red-700 text-sm rounded-lg p-4">{erro}</div></div>
  if (!ctx) return null

  const ABAS: { id: Aba; label: string; icon: typeof FolderKanban }[] = [
    { id: 'areas', label: 'Áreas', icon: FolderKanban },
    { id: 'gerentes', label: 'Gerentes', icon: Users2 },
    { id: 'projetos', label: 'Projetos', icon: FolderKanban },
    { id: 'reunioes', label: 'Tipos de reunião', icon: FolderKanban },
    { id: 'pessoas', label: 'Importar pessoas', icon: UploadCloud },
  ]

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Configurações do Módulo Gestão</h1>
        <p className="text-sm text-gray-500">Áreas, gerentes, projetos, tipos de reunião e pessoas avulsas.</p>
      </div>

      <div className="flex gap-1 border-b overflow-x-auto">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap flex items-center gap-1.5 ${
              aba === a.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <a.icon className="w-4 h-4" />{a.label}
          </button>
        ))}
      </div>

      {aba === 'areas' && <AbaAreas ctx={ctx} recarregar={carregar} avisar={setToast} />}
      {aba === 'gerentes' && <AbaGerentes ctx={ctx} recarregar={carregar} avisar={setToast} />}
      {aba === 'projetos' && <AbaProjetos ctx={ctx} projetos={projetos} recarregar={carregar} avisar={setToast} />}
      {aba === 'reunioes' && <AbaTiposReuniao tipos={tipos} recarregar={carregar} avisar={setToast} />}
      {aba === 'pessoas' && <AbaImportarPessoas recarregar={carregar} avisar={setToast} />}

      {toast && <Toast mensagem={toast} onClose={() => setToast(null)} />}
    </div>
  )
}

// ── Áreas ─────────────────────────────────────────────────────────────────

function AbaAreas({ ctx, recarregar, avisar }: { ctx: GestaoContexto; recarregar: () => void; avisar: (m: string) => void }) {
  const [nome, setNome] = useState('')
  const [parentId, setParentId] = useState('')
  const [instrumento, setInstrumento] = useState('')
  const [salvando, setSalvando] = useState(false)

  const ordenadas = useMemo(() => areasOrdenadas(ctx.areas), [ctx.areas])

  async function criar() {
    if (!nome.trim()) return
    setSalvando(true)
    const { error } = await supabase.from('gestao_areas').insert({
      nome: nome.trim(),
      parent_id: parentId || null,
      instrumento: instrumento.trim() || null,
    })
    setSalvando(false)
    if (error) { alert('Erro:\n' + error.message); return }
    setNome(''); setParentId(''); setInstrumento('')
    avisar('Área criada.')
    recarregar()
  }

  async function arquivar(id: string) {
    if (!confirm('Arquivar esta área? Ações e projetos ligados a ela continuam existindo.')) return
    const { error } = await supabase.from('gestao_areas').update({ arquivada_em: new Date().toISOString() }).eq('id', id)
    if (error) { alert('Erro:\n' + error.message); return }
    avisar('Área arquivada.')
    recarregar()
  }

  return (
    <div className="space-y-4">
      <div className={secao}>
        <h2 className="font-semibold text-gray-800 mb-3">Nova área</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome (ex: Violão)" className={campo} />
          <select value={parentId} onChange={(e) => setParentId(e.target.value)} className={`${campo} bg-white`}>
            <option value="">Área-mãe (opcional)</option>
            {ordenadas.map((a) => <option key={a.id} value={a.id}>{rotuloArea(a.id, ctx.areas)}</option>)}
          </select>
          <input value={instrumento} onChange={(e) => setInstrumento(e.target.value)} placeholder="Instrumento (opcional)" className={campo} />
        </div>
        <button
          onClick={criar}
          disabled={salvando || !nome.trim()}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />Criar área
        </button>
      </div>

      <div className={secao}>
        <h2 className="font-semibold text-gray-800 mb-3">Áreas ativas</h2>
        <ul className="divide-y">
          {ordenadas.map((a) => (
            <li key={a.id} className="py-2 flex items-center justify-between text-sm">
              <span className={a.parent_id ? 'pl-4 text-gray-700' : 'font-medium text-gray-800'}>
                {a.parent_id ? '— ' : ''}{a.nome}
                {a.instrumento && <span className="text-gray-400 ml-1">({a.instrumento})</span>}
              </span>
              <button onClick={() => arquivar(a.id)} className="text-gray-400 hover:text-red-600" aria-label={`Arquivar ${a.nome}`}>
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
          {ordenadas.length === 0 && <li className="py-2 text-sm text-gray-400">Nenhuma área cadastrada.</li>}
        </ul>
      </div>
    </div>
  )
}

// ── Gerentes (atribuições) ───────────────────────────────────────────────────

function AbaGerentes({ ctx, recarregar, avisar }: { ctx: GestaoContexto; recarregar: () => void; avisar: (m: string) => void }) {
  const [membroId, setMembroId] = useState('')
  const [areaId, setAreaId] = useState('')
  const [salvando, setSalvando] = useState(false)
  const perfilGerente = null as unknown // resolvido no submit

  const gerentes = ctx.atribuicoes.filter((at) => at.perfil?.chave === 'gerente' && at.escopo_tipo === 'area')

  async function atribuir() {
    if (!membroId || !areaId) return
    setSalvando(true)
    const { data: perfil, error: erroPerfil } = await supabase
      .from('gestao_perfis_acesso').select('id').eq('chave', 'gerente').single()
    if (erroPerfil || !perfil) { setSalvando(false); alert('Perfil "gerente" não encontrado.'); return }
    const { error } = await supabase.from('gestao_atribuicoes').insert({
      membro_id: membroId,
      perfil_acesso_id: perfil.id,
      escopo_tipo: 'area',
      escopo_id: areaId,
    })
    setSalvando(false)
    if (error) { alert('Erro:\n' + error.message); return }
    setMembroId(''); setAreaId('')
    avisar('Gerente atribuído.')
    recarregar()
  }

  async function remover(id: string) {
    if (!confirm('Remover esta atribuição de gerente?')) return
    const { error } = await supabase.from('gestao_atribuicoes').delete().eq('id', id)
    if (error) { alert('Erro:\n' + error.message); return }
    avisar('Atribuição removida.')
    recarregar()
  }

  void perfilGerente
  return (
    <div className="space-y-4">
      <div className={secao}>
        <h2 className="font-semibold text-gray-800 mb-3">Nomear gerente de área</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select value={membroId} onChange={(e) => setMembroId(e.target.value)} className={`${campo} bg-white`}>
            <option value="">Escolha a pessoa</option>
            {ctx.membros.filter((m) => m.ativo).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className={`${campo} bg-white`}>
            <option value="">Escolha a área</option>
            {areasOrdenadas(ctx.areas).map((a) => <option key={a.id} value={a.id}>{rotuloArea(a.id, ctx.areas)}</option>)}
          </select>
        </div>
        <button
          onClick={atribuir}
          disabled={salvando || !membroId || !areaId}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />Atribuir
        </button>
        <p className="text-xs text-gray-400 mt-2">Gerente de uma área vê e gerencia as ações dela e das subáreas.</p>
      </div>

      <div className={secao}>
        <h2 className="font-semibold text-gray-800 mb-3">Gerentes atuais</h2>
        <ul className="divide-y">
          {gerentes.map((at: GestaoAtribuicao) => (
            <li key={at.id} className="py-2 flex items-center justify-between text-sm">
              <span>
                <span className="font-medium text-gray-800">{ctx.membros.find((m) => m.id === at.membro_id)?.nome ?? '—'}</span>
                <span className="text-gray-400"> · {rotuloArea(at.escopo_id, ctx.areas)}</span>
              </span>
              <button onClick={() => remover(at.id)} className="text-gray-400 hover:text-red-600" aria-label="Remover">
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
          {gerentes.length === 0 && <li className="py-2 text-sm text-gray-400">Nenhum gerente de área nomeado ainda.</li>}
        </ul>
      </div>
    </div>
  )
}

// ── Projetos ──────────────────────────────────────────────────────────────

function AbaProjetos({ ctx, projetos, recarregar, avisar }: {
  ctx: GestaoContexto; projetos: GestaoProjeto[]; recarregar: () => void; avisar: (m: string) => void
}) {
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [areaId, setAreaId] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function criar() {
    if (!nome.trim()) return
    setSalvando(true)
    const { error } = await supabase.from('gestao_projetos').insert({
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      area_id: areaId || null,
    })
    setSalvando(false)
    if (error) { alert('Erro:\n' + error.message); return }
    setNome(''); setDescricao(''); setAreaId('')
    avisar('Projeto criado.')
    recarregar()
  }

  async function arquivar(id: string) {
    if (!confirm('Arquivar este projeto?')) return
    const { error } = await supabase.from('gestao_projetos').update({ arquivado_em: new Date().toISOString() }).eq('id', id)
    if (error) { alert('Erro:\n' + error.message); return }
    avisar('Projeto arquivado.')
    recarregar()
  }

  return (
    <div className="space-y-4">
      <div className={secao}>
        <h2 className="font-semibold text-gray-800 mb-3">Novo projeto</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome (ex: 6º Recital)" className={campo} />
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className={`${campo} bg-white`}>
            <option value="">Área (opcional)</option>
            {areasOrdenadas(ctx.areas).map((a) => <option key={a.id} value={a.id}>{rotuloArea(a.id, ctx.areas)}</option>)}
          </select>
          <input
            value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição (opcional)"
            className={`${campo} sm:col-span-2`}
          />
        </div>
        <button
          onClick={criar}
          disabled={salvando || !nome.trim()}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />Criar projeto
        </button>
      </div>

      <div className={secao}>
        <h2 className="font-semibold text-gray-800 mb-3">Projetos ativos</h2>
        <ul className="divide-y">
          {projetos.map((p) => (
            <li key={p.id} className="py-2 flex items-center justify-between text-sm">
              <span>
                <span className="font-medium text-gray-800">{p.nome}</span>
                {p.area_id && <span className="text-gray-400"> · {rotuloArea(p.area_id, ctx.areas)}</span>}
              </span>
              <button onClick={() => arquivar(p.id)} className="text-gray-400 hover:text-red-600" aria-label={`Arquivar ${p.nome}`}>
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
          {projetos.length === 0 && <li className="py-2 text-sm text-gray-400">Nenhum projeto cadastrado.</li>}
        </ul>
      </div>
    </div>
  )
}

// ── Tipos de reunião ──────────────────────────────────────────────────────

function AbaTiposReuniao({ tipos, recarregar, avisar }: { tipos: GestaoTipoReuniao[]; recarregar: () => void; avisar: (m: string) => void }) {
  const [nome, setNome] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function criar() {
    if (!nome.trim()) return
    setSalvando(true)
    const { error } = await supabase.from('gestao_tipos_reuniao').insert({ nome: nome.trim(), posicao: tipos.length })
    setSalvando(false)
    if (error) { alert('Erro:\n' + error.message); return }
    setNome('')
    avisar('Tipo de reunião criado.')
    recarregar()
  }

  async function arquivar(id: string) {
    if (!confirm('Arquivar este tipo de reunião?')) return
    const { error } = await supabase.from('gestao_tipos_reuniao').update({ arquivado_em: new Date().toISOString() }).eq('id', id)
    if (error) { alert('Erro:\n' + error.message); return }
    avisar('Tipo arquivado.')
    recarregar()
  }

  return (
    <div className="space-y-4">
      <div className={secao}>
        <p className="text-xs text-gray-400 mb-3">Preparação para a etapa de Reuniões (ainda não disponível na tela).</p>
        <div className="flex gap-3">
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome (ex: Gestão semanal)" className={campo} />
          <button
            onClick={criar}
            disabled={salvando || !nome.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />Criar
          </button>
        </div>
      </div>

      <div className={secao}>
        <ul className="divide-y">
          {tipos.map((t) => (
            <li key={t.id} className="py-2 flex items-center justify-between text-sm">
              <span className="font-medium text-gray-800">{t.nome}</span>
              <button onClick={() => arquivar(t.id)} className="text-gray-400 hover:text-red-600" aria-label={`Arquivar ${t.nome}`}>
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
          {tipos.length === 0 && <li className="py-2 text-sm text-gray-400">Nenhum tipo cadastrado.</li>}
        </ul>
      </div>
    </div>
  )
}

// ── Importar pessoas avulsas (CSV nome,email,cargo) ─────────────────────────

function AbaImportarPessoas({ recarregar, avisar }: { recarregar: () => void; avisar: (m: string) => void }) {
  const [csv, setCsv] = useState('')
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<{ novos: number; ignorados: number } | null>(null)

  async function importar() {
    const linhas = csv.split('\n').map((l) => l.trim()).filter(Boolean)
    const pessoas = linhas
      .map((linha) => linha.split(',').map((c) => c.trim()))
      .filter((cols) => cols[0])
      .map(([nome, email, cargo]) => ({ nome, email: email || null, cargo: cargo || 'Avulso' }))

    if (pessoas.length === 0) return
    setImportando(true)

    let novos = 0
    let ignorados = 0
    for (const p of pessoas) {
      const { error } = await supabase.from('gestao_membros').insert({
        nome: p.nome,
        cargo: p.cargo,
        origem: 'avulso',
      })
      if (error) ignorados += 1
      else novos += 1
    }

    setImportando(false)
    setResultado({ novos, ignorados })
    avisar(`${novos} pessoa(s) importada(s).`)
    recarregar()
  }

  return (
    <div className={secao}>
      <h2 className="font-semibold text-gray-800 mb-1">Importar pessoas avulsas</h2>
      <p className="text-xs text-gray-400 mb-3">
        Uma linha por pessoa: <code>nome, email (opcional), cargo (opcional)</code>. Só para quem não tem
        cadastro em Professores/Usuários — quem já tem entra sozinho, sem precisar disso.
      </p>
      <textarea
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        rows={6}
        placeholder={'Maria Souza, maria@exemplo.com, Coordenação\nJoão Lima,, Voluntário'}
        className={`${campo} font-mono text-xs`}
      />
      <button
        onClick={importar}
        disabled={importando || !csv.trim()}
        className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
      >
        {importando ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
        Importar
      </button>
      {resultado && (
        <p className="text-xs text-gray-500 mt-2">{resultado.novos} importada(s), {resultado.ignorados} com erro.</p>
      )}
    </div>
  )
}
