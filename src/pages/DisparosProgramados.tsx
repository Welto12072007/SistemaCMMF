import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getLabelGrupoBase } from '@/lib/crmSegmentos'
import { MEDIA_ACCEPT, uploadDisparoMedia, listDisparoMedia, deleteDisparoMedia } from '@/lib/disparosMedia'
import type { MediaType } from '@/lib/disparosMedia'
import type { CRMSegmento, GrupoBaseSegmento } from '@/lib/crmSegmentos'
import {
  Calendar,
  Plus,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Clock,
  Send,
  Users,
  Gift,
  CreditCard,
  Star,
  MessageSquare,
  AlertTriangle,
  RefreshCw,
  PartyPopper,
  ClipboardList,
  Megaphone,
  Tag,
  Bell,
  Copy,
  Zap,
  History,
  Search,
  CheckCircle2,
  XCircle,
  SkipForward,
} from 'lucide-react'

interface DisparoProgramado {
  id: string
  nome: string
  tipo: string
  mensagem: string
  media_url?: string
  media_type?: string
  grupo_alvo: string
  ativo: boolean
  dia_disparo?: number
  dia_semana?: number | null
  recorrencia?: string
  data_unica?: string | null
  hora_disparo: string
  ultimo_disparo?: string
  total_enviados: number
  disparar_agora?: boolean
  observacoes?: string | null
}

const TIPO_ICONS: Record<string, typeof Gift> = {
  aniversario: Gift,
  vencimento: CreditCard,
  boas_vindas: Users,
  avaliacao_google: Star,
  personalizado: MessageSquare,
  cobranca_atraso: AlertTriangle,
  reativacao: RefreshCw,
  convite_evento: PartyPopper,
  pesquisa_satisfacao: ClipboardList,
  comunicado: Megaphone,
  promocao: Tag,
  lembrete_aula: Bell,
}

const TIPO_COLORS: Record<string, string> = {
  aniversario: 'bg-pink-100 text-pink-700',
  vencimento: 'bg-blue-100 text-blue-700',
  boas_vindas: 'bg-green-100 text-green-700',
  avaliacao_google: 'bg-yellow-100 text-yellow-700',
  personalizado: 'bg-purple-100 text-purple-700',
  cobranca_atraso: 'bg-red-100 text-red-700',
  reativacao: 'bg-amber-100 text-amber-700',
  convite_evento: 'bg-indigo-100 text-indigo-700',
  pesquisa_satisfacao: 'bg-cyan-100 text-cyan-700',
  comunicado: 'bg-slate-100 text-slate-700',
  promocao: 'bg-orange-100 text-orange-700',
  lembrete_aula: 'bg-teal-100 text-teal-700',
}

const TIPO_LABELS: Record<string, string> = {
  aniversario: 'Aniversário',
  vencimento: 'Vencimento',
  boas_vindas: 'Boas-vindas',
  avaliacao_google: 'Avaliação Google',
  personalizado: 'Personalizado',
  cobranca_atraso: 'Cobrança em atraso',
  reativacao: 'Reativação ex-aluno',
  convite_evento: 'Convite/Evento',
  pesquisa_satisfacao: 'Pesquisa NPS',
  comunicado: 'Comunicado geral',
  promocao: 'Promoção/Campanha',
  lembrete_aula: 'Lembrete de aula',
}

const DIAS_SEMANA = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']

const GRUPO_LABELS: Record<string, string> = {
  todos: 'Todos os contatos',
  alunos_ativos: 'Alunos ativos',
  leads: 'Leads',
  ex_alunos: 'Ex-alunos',
}

type Tab = 'disparos' | 'historico'

export default function DisparosProgramados() {
  const [disparos, setDisparos] = useState<DisparoProgramado[]>([])
  const [segmentos, setSegmentos] = useState<CRMSegmento[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<DisparoProgramado | null>(null)
  const [tab, setTab] = useState<Tab>('disparos')

  useEffect(() => {
    loadDisparos()
    void loadSegmentos()
  }, [])

  async function loadSegmentos() {
    const { data } = await supabase
      .from('crm_segmentos')
      .select('*')
      .eq('ativo', true)
      .order('nome')

    const parsed: CRMSegmento[] = (data || []).map((s: any) => ({
      id: s.id,
      nome: s.nome,
      descricao: s.descricao || '',
      grupoBase: s.grupo_base as GrupoBaseSegmento,
      instrumento: s.instrumento || '',
      apenasComTelefone: Boolean(s.apenas_com_telefone),
      ativo: Boolean(s.ativo),
      createdAt: s.created_at,
    }))

    setSegmentos(parsed)
  }

  function formatarGrupo(grupoAlvo: string) {
    if (GRUPO_LABELS[grupoAlvo]) return GRUPO_LABELS[grupoAlvo]
    if (grupoAlvo.startsWith('segmento:')) {
      const segmentoId = grupoAlvo.replace('segmento:', '')
      const seg = segmentos.find((s) => s.id === segmentoId)
      if (!seg) return 'Segmento personalizado'
      const base = getLabelGrupoBase(seg.grupoBase)
      const filtroInstrumento = seg.instrumento ? ` | ${seg.instrumento}` : ''
      return `${seg.nome} (${base}${filtroInstrumento})`
    }
    return grupoAlvo
  }

  async function loadDisparos() {
    const { data } = await supabase
      .from('disparos_programados')
      .select('*')
      .order('created_at', { ascending: true })
    if (data) setDisparos(data)
  }

  async function toggleAtivo(id: string, ativo: boolean) {
    await supabase.from('disparos_programados').update({ ativo: !ativo }).eq('id', id)
    loadDisparos()
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este disparo programado?')) return
    await supabase.from('disparos_programados').delete().eq('id', id)
    loadDisparos()
  }

  async function handleDuplicate(d: DisparoProgramado) {
    const novo = {
      nome: `${d.nome} (cópia)`,
      tipo: d.tipo,
      mensagem: d.mensagem,
      media_url: d.media_url || null,
      media_type: d.media_type || null,
      grupo_alvo: d.grupo_alvo,
      dia_disparo: d.dia_disparo ?? null,
      dia_semana: d.dia_semana ?? null,
      recorrencia: d.recorrencia || 'mensal',
      data_unica: d.data_unica ?? null,
      hora_disparo: d.hora_disparo,
      ativo: false,
      observacoes: d.observacoes ?? null,
    }
    const { error } = await supabase.from('disparos_programados').insert(novo)
    if (error) {
      console.error('[Disparos] duplicate error:', error)
      alert('Erro ao duplicar:\n' + error.message)
      return
    }
    loadDisparos()
  }

  async function handleDispararAgora(d: DisparoProgramado) {
    if (!confirm(`Disparar AGORA o disparo "${d.nome}" para ${formatarGrupo(d.grupo_alvo)}?\n\nO n8n vai processar na próxima execução (em até 2 horas).`)) return
    const { error } = await supabase
      .from('disparos_programados')
      .update({ disparar_agora: true, ativo: true })
      .eq('id', d.id)
    if (error) {
      alert('Erro ao agendar disparo:\n' + error.message)
      return
    }
    alert('Disparo agendado! Será processado na próxima execução do n8n.')
    loadDisparos()
  }

  async function handleSave(form: Partial<DisparoProgramado>) {
    if (editing) {
      await supabase.from('disparos_programados').update(form).eq('id', editing.id)
    } else {
      await supabase.from('disparos_programados').insert(form)
    }
    setShowForm(false)
    setEditing(null)
    loadDisparos()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Disparos Programados</h1>
          <p className="text-gray-500">Mensagens automáticas recorrentes</p>
        </div>
        {tab === 'disparos' && (
          <button
            onClick={() => { setEditing(null); setShowForm(true) }}
            className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2.5 rounded-lg hover:bg-brand-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Novo Disparo
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 flex gap-2">
        <button
          onClick={() => setTab('disparos')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'disparos' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          <span className="flex items-center gap-2"><Calendar className="w-4 h-4" /> Configuração</span>
        </button>
        <button
          onClick={() => setTab('historico')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'historico' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          <span className="flex items-center gap-2"><History className="w-4 h-4" /> Histórico</span>
        </button>
      </div>

      {tab === 'historico' ? (
        <HistoricoView formatarGrupo={formatarGrupo} />
      ) : (
      <>
      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {disparos.map((d) => {
          const Icon = TIPO_ICONS[d.tipo] || MessageSquare
          return (
            <div
              key={d.id}
              className={`bg-white rounded-xl shadow-sm border p-5 transition-opacity ${!d.ativo ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${TIPO_COLORS[d.tipo] || 'bg-gray-100 text-gray-700'}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{d.nome}</h3>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TIPO_COLORS[d.tipo] || 'bg-gray-100 text-gray-700'}`}>
                      {TIPO_LABELS[d.tipo] || d.tipo}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => toggleAtivo(d.id, d.ativo)}
                  title={d.ativo ? 'Desativar' : 'Ativar'}
                >
                  {d.ativo ? (
                    <ToggleRight className="w-8 h-8 text-green-500" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-gray-300" />
                  )}
                </button>
              </div>

              <p className="text-sm text-gray-600 mb-3 line-clamp-2">{d.mensagem}</p>

              <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {formatarGrupo(d.grupo_alvo)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {d.hora_disparo?.slice(0, 5) || '09:00'}
                </span>
                {d.recorrencia === 'semanal' && d.dia_semana !== null && d.dia_semana !== undefined && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {DIAS_SEMANA[d.dia_semana]}
                  </span>
                )}
                {d.recorrencia === 'mensal' && d.dia_disparo && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Dia {d.dia_disparo}
                  </span>
                )}
                {d.recorrencia === 'unico' && d.data_unica && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(d.data_unica + 'T12:00').toLocaleDateString('pt-BR')}
                  </span>
                )}
                {d.recorrencia === 'diario' && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Diário
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Send className="w-3 h-3" />
                  {d.total_enviados} enviados
                </span>
                {d.disparar_agora && (
                  <span className="flex items-center gap-1 text-orange-600 font-medium">
                    <Zap className="w-3 h-3" /> Aguardando disparo
                  </span>
                )}
              </div>

              {d.ultimo_disparo && (
                <p className="text-xs text-gray-400 mb-3">
                  Último disparo: {new Date(d.ultimo_disparo).toLocaleDateString('pt-BR')} às {new Date(d.ultimo_disparo).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}

              <div className="flex items-center gap-2 pt-2 border-t flex-wrap">
                <button
                  onClick={() => { setEditing(d); setShowForm(true) }}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand-600 px-2 py-1 rounded"
                >
                  <Pencil className="w-3 h-3" /> Editar
                </button>
                <button
                  onClick={() => handleDuplicate(d)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 px-2 py-1 rounded"
                  title="Criar cópia inativa"
                >
                  <Copy className="w-3 h-3" /> Duplicar
                </button>
                <button
                  onClick={() => handleDispararAgora(d)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-orange-600 px-2 py-1 rounded"
                  title="Forçar disparo na próxima execução do n8n"
                >
                  <Zap className="w-3 h-3" /> Disparar agora
                </button>
                <button
                  onClick={() => handleDelete(d.id)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 px-2 py-1 rounded ml-auto"
                >
                  <Trash2 className="w-3 h-3" /> Excluir
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {disparos.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Nenhum disparo programado</p>
        </div>
      )}

      </>
      )}

      {/* Form Modal */}
      {showForm && (
        <DisparoForm
          disparo={editing}
          segmentos={segmentos}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null) }}
        />
      )}
    </div>
  )
}

function DisparoForm({
  disparo,
  segmentos,
  onSave,
  onClose,
}: {
  disparo: DisparoProgramado | null
  segmentos: CRMSegmento[]
  onSave: (data: Partial<DisparoProgramado>) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    nome: disparo?.nome ?? '',
    tipo: disparo?.tipo ?? 'personalizado',
    mensagem: disparo?.mensagem ?? '',
    media_url: disparo?.media_url ?? '',
    media_type: disparo?.media_type ?? '',
    grupo_alvo: disparo?.grupo_alvo ?? 'alunos_ativos',
    recorrencia: disparo?.recorrencia ?? 'mensal',
    dia_disparo: disparo?.dia_disparo?.toString() ?? '',
    dia_semana: disparo?.dia_semana?.toString() ?? '',
    data_unica: disparo?.data_unica ?? '',
    hora_disparo: disparo?.hora_disparo?.slice(0, 5) ?? '09:00',
    ativo: disparo?.ativo ?? true,
    observacoes: disparo?.observacoes ?? '',
  })
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [mediaLibrary, setMediaLibrary] = useState<Array<{ name: string; path: string; url: string }>>([])
  const [mediaError, setMediaError] = useState('')

  useEffect(() => {
    if (!form.media_type) {
      setMediaLibrary([])
      return
    }
    void loadMediaLibrary(form.media_type as MediaType)
  }, [form.media_type])

  async function loadMediaLibrary(type: MediaType) {
    try {
      const items = await listDisparoMedia(supabase, type)
      setMediaLibrary(items)
      setMediaError('')
    } catch {
      setMediaLibrary([])
      setMediaError('Não foi possível carregar biblioteca de mídia.')
    }
  }

  async function handleUploadMedia(file: File | null) {
    if (!file || !form.media_type) return

    setUploadingMedia(true)
    setMediaError('')

    try {
      const result = await uploadDisparoMedia(supabase, form.media_type as MediaType, file)
      setForm({ ...form, media_url: result.url })
      await loadMediaLibrary(form.media_type as MediaType)
    } catch {
      setMediaError('Falha no upload. Verifique permissões do bucket.')
    } finally {
      setUploadingMedia(false)
    }
  }

  async function handleDeleteMedia(path: string) {
    try {
      await deleteDisparoMedia(supabase, path)
      if (form.media_url.includes(path)) {
        setForm({ ...form, media_url: '' })
      }
      await loadMediaLibrary(form.media_type as MediaType)
    } catch {
      setMediaError('Falha ao excluir mídia da biblioteca.')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">
          {disparo ? 'Editar Disparo' : 'Novo Disparo Programado'}
        </h2>
        <div className="space-y-3">
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="Nome do disparo"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
          />
          <select
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={form.tipo}
            onChange={(e) => setForm({ ...form, tipo: e.target.value })}
          >
            <option value="aniversario">Aniversário</option>
            <option value="vencimento">Lembrete de Vencimento</option>
            <option value="cobranca_atraso">Cobrança em Atraso</option>
            <option value="boas_vindas">Boas-vindas</option>
            <option value="reativacao">Reativação Ex-aluno</option>
            <option value="convite_evento">Convite/Evento</option>
            <option value="pesquisa_satisfacao">Pesquisa NPS</option>
            <option value="avaliacao_google">Avaliação Google</option>
            <option value="comunicado">Comunicado Geral</option>
            <option value="promocao">Promoção/Campanha</option>
            <option value="lembrete_aula">Lembrete de Aula</option>
            <option value="personalizado">Personalizado</option>
          </select>
          <textarea
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="Mensagem (use {nome} para personalizar)"
            rows={4}
            value={form.mensagem}
            onChange={(e) => setForm({ ...form, mensagem: e.target.value })}
          />
          <p className="text-xs text-gray-400">Variáveis: {'{nome}'}, {'{instrumento}'}, {'{telefone}'}, {'{professor}'}, {'{referencia_mes}'}, {'{data_evento}'}</p>
          <select
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={form.grupo_alvo}
            onChange={(e) => setForm({ ...form, grupo_alvo: e.target.value })}
          >
            <option value="todos">Todos os contatos</option>
            <option value="alunos_ativos">Alunos ativos</option>
            <option value="leads">Leads</option>
            <option value="ex_alunos">Ex-alunos</option>
            {segmentos.length > 0 && <option disabled>──────────</option>}
            {segmentos.map((s) => (
              <option key={s.id} value={`segmento:${s.id}`}>
                Segmento: {s.nome}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Recorrência</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.recorrencia}
                onChange={(e) => setForm({ ...form, recorrencia: e.target.value, dia_disparo: '', dia_semana: '', data_unica: '' })}
              >
                <option value="mensal">Mensal (dia fixo)</option>
                <option value="semanal">Semanal (dia da semana)</option>
                <option value="diario">Diário</option>
                <option value="unico">Único (data específica)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Horário</label>
              <input
                type="time"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.hora_disparo}
                onChange={(e) => setForm({ ...form, hora_disparo: e.target.value })}
              />
            </div>
          </div>

          {form.recorrencia === 'mensal' && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">Dia do mês (1-31)</label>
              <input
                type="number"
                min="1"
                max="31"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="Ex: 7"
                value={form.dia_disparo}
                onChange={(e) => setForm({ ...form, dia_disparo: e.target.value })}
              />
            </div>
          )}

          {form.recorrencia === 'semanal' && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">Dia da semana</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.dia_semana}
                onChange={(e) => setForm({ ...form, dia_semana: e.target.value })}
              >
                <option value="">Selecione...</option>
                {DIAS_SEMANA.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
          )}

          {form.recorrencia === 'unico' && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">Data específica</label>
              <input
                type="date"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.data_unica}
                onChange={(e) => setForm({ ...form, data_unica: e.target.value })}
              />
            </div>
          )}
          <select
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={form.media_type}
            onChange={(e) => setForm({ ...form, media_type: e.target.value })}
          >
            <option value="">Sem mídia</option>
            <option value="image">Imagem</option>
            <option value="video">Vídeo</option>
            <option value="audio">Áudio</option>
            <option value="document">Documento</option>
          </select>
          {form.media_type && (
            <div className="space-y-2">
              <input
                type="file"
                accept={MEDIA_ACCEPT[form.media_type as MediaType]}
                className="text-xs"
                onChange={(e) => handleUploadMedia(e.target.files?.[0] || null)}
              />
              {uploadingMedia && <p className="text-xs text-gray-500">Enviando arquivo...</p>}
              {mediaError && <p className="text-xs text-red-500">{mediaError}</p>}
              {form.media_url && (
                <div className="flex items-center justify-between bg-gray-50 border rounded-lg px-3 py-2">
                  <span className="text-xs text-gray-700 truncate">Mídia selecionada</span>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, media_url: '' })}
                    className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200"
                  >
                    Remover
                  </button>
                </div>
              )}
              {mediaLibrary.length > 0 && (
                <div className="max-h-24 overflow-y-auto space-y-1">
                  {mediaLibrary.slice(0, 8).map((item) => (
                    <div key={item.path} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, media_url: item.url })}
                        className="flex-1 text-left text-xs px-2 py-1 rounded bg-gray-50 hover:bg-gray-100"
                        title={item.url}
                      >
                        Usar: {item.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteMedia(item.path)}
                        className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200"
                      >
                        Excluir
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <textarea
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="Observações internas (não enviadas)"
            rows={2}
            value={form.observacoes}
            onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
          />
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            Cancelar
          </button>
          <button
            onClick={() => {
              if (!form.nome || (!form.mensagem && !form.media_url)) return
              onSave({
                ...form,
                dia_disparo: form.dia_disparo ? parseInt(form.dia_disparo) : undefined,
                dia_semana: form.dia_semana !== '' ? parseInt(form.dia_semana) : null,
                data_unica: form.data_unica || null,
                media_url: form.media_url || undefined,
                media_type: form.media_type || undefined,
                observacoes: form.observacoes || null,
              } as any)
            }}
            className="px-4 py-2 text-sm text-white rounded-lg bg-brand-500 hover:bg-brand-600"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

// =====================================================================
// Histórico de Disparos
// =====================================================================

interface HistoricoAgg {
  disparo_id: string
  nome: string
  tipo: string
  enviados_30d: number
  falhas_30d: number
  pulados_30d: number
  ultimo_em: string | null
}

interface LogRow {
  id: string
  disparo_id: string | null
  disparo_nome: string | null
  destinatario_id: string | null
  destinatario_nome: string | null
  destinatario_telefone: string | null
  status: 'enviado' | 'falhou' | 'pulado'
  erro: string | null
  enviado_em: string
}

const STATUS_LABELS: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  enviado: { label: 'Enviado', cls: 'bg-green-100 text-green-700', Icon: CheckCircle2 },
  falhou: { label: 'Falhou', cls: 'bg-red-100 text-red-700', Icon: XCircle },
  pulado: { label: 'Pulado', cls: 'bg-gray-100 text-gray-600', Icon: SkipForward },
}

function HistoricoView({ formatarGrupo: _formatarGrupo }: { formatarGrupo: (g: string) => string }) {
  void _formatarGrupo
  const [agg, setAgg] = useState<HistoricoAgg[]>([])
  const [logs, setLogs] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroDisparoId, setFiltroDisparoId] = useState<string>('')
  const [filtroStatus, setFiltroStatus] = useState<string>('')
  const [filtroBusca, setFiltroBusca] = useState<string>('')

  useEffect(() => {
    void loadAll()
  }, [filtroDisparoId, filtroStatus])

  async function loadAll() {
    setLoading(true)
    const aggResp = await supabase
      .from('vw_disparos_historico')
      .select('*')
      .order('ultimo_em', { ascending: false, nullsFirst: false })

    let q = supabase
      .from('disparos_programados_log')
      .select('*')
      .order('enviado_em', { ascending: false })
      .limit(500)

    if (filtroDisparoId) q = q.eq('disparo_id', filtroDisparoId)
    if (filtroStatus) q = q.eq('status', filtroStatus)

    const logsResp = await q

    setAgg((aggResp.data as HistoricoAgg[]) || [])
    setLogs((logsResp.data as LogRow[]) || [])
    setLoading(false)
  }

  const totals = agg.reduce(
    (acc, a) => ({
      enviados: acc.enviados + (a.enviados_30d || 0),
      falhas: acc.falhas + (a.falhas_30d || 0),
      pulados: acc.pulados + (a.pulados_30d || 0),
    }),
    { enviados: 0, falhas: 0, pulados: 0 }
  )

  const logsFiltrados = logs.filter((l) => {
    if (!filtroBusca.trim()) return true
    const q = filtroBusca.toLowerCase()
    return (
      (l.disparo_nome || '').toLowerCase().includes(q) ||
      (l.destinatario_nome || '').toLowerCase().includes(q) ||
      (l.destinatario_telefone || '').includes(q)
    )
  })

  return (
    <div className="space-y-6">
      {/* KPIs 30d */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <p className="text-xs text-gray-500 uppercase">Enviados (30d)</p>
          <p className="text-3xl font-bold text-green-600">{totals.enviados}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <p className="text-xs text-gray-500 uppercase">Falhas (30d)</p>
          <p className="text-3xl font-bold text-red-600">{totals.falhas}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <p className="text-xs text-gray-500 uppercase">Pulados (30d)</p>
          <p className="text-3xl font-bold text-gray-600">{totals.pulados}</p>
        </div>
      </div>

      {/* Tabela agregada por disparo */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Resumo por disparo (últimos 30 dias)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Nome</th>
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-right">Enviados</th>
                <th className="px-4 py-3 text-right">Falhas</th>
                <th className="px-4 py-3 text-right">Pulados</th>
                <th className="px-4 py-3 text-left">Último em</th>
                <th className="px-4 py-3 text-right">Logs</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {agg.map((a) => {
                const Icon = TIPO_ICONS[a.tipo] || MessageSquare
                return (
                  <tr key={a.disparo_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded ${TIPO_COLORS[a.tipo] || 'bg-gray-100'}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        {a.nome}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{TIPO_LABELS[a.tipo] || a.tipo}</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-600">{a.enviados_30d}</td>
                    <td className="px-4 py-3 text-right text-red-600">{a.falhas_30d}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{a.pulados_30d}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {a.ultimo_em
                        ? new Date(a.ultimo_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setFiltroDisparoId(a.disparo_id)}
                        className="text-xs text-brand-600 hover:underline"
                      >
                        Ver logs
                      </button>
                    </td>
                  </tr>
                )
              })}
              {agg.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    Nenhum envio registrado nos últimos 30 dias.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Filtros + Logs detalhados */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-5 py-4 border-b flex flex-wrap items-center gap-3 justify-between">
          <h2 className="font-semibold text-gray-900">Logs detalhados (últimos 500)</h2>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar nome/telefone…"
                value={filtroBusca}
                onChange={(e) => setFiltroBusca(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              className="text-sm border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Todos status</option>
              <option value="enviado">Enviado</option>
              <option value="falhou">Falhou</option>
              <option value="pulado">Pulado</option>
            </select>
            {filtroDisparoId && (
              <button
                onClick={() => setFiltroDisparoId('')}
                className="text-xs text-gray-500 hover:text-red-600 px-2 py-1.5"
                title="Remover filtro de disparo"
              >
                Limpar disparo
              </button>
            )}
            <button
              onClick={loadAll}
              className="text-sm flex items-center gap-1 text-gray-500 hover:text-brand-600 px-2 py-1.5"
              title="Recarregar"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Quando</th>
                <th className="px-4 py-3 text-left">Disparo</th>
                <th className="px-4 py-3 text-left">Destinatário</th>
                <th className="px-4 py-3 text-left">Telefone</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Erro</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logsFiltrados.map((l) => {
                const st = STATUS_LABELS[l.status] || STATUS_LABELS.enviado!
                const Icon = st.Icon
                return (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(l.enviado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-4 py-2.5 text-gray-900">{l.disparo_nome || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-700">{l.destinatario_nome || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{l.destinatario_telefone || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${st.cls}`}>
                        <Icon className="w-3 h-3" />
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-red-600 max-w-xs truncate" title={l.erro || ''}>
                      {l.erro || ''}
                    </td>
                  </tr>
                )
              })}
              {logsFiltrados.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    Nenhum log encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
