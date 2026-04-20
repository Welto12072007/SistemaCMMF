import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
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
  hora_disparo: string
  ultimo_disparo?: string
  total_enviados: number
}

const TIPO_ICONS: Record<string, typeof Gift> = {
  aniversario: Gift,
  vencimento: CreditCard,
  boas_vindas: Users,
  avaliacao_google: Star,
  personalizado: MessageSquare,
}

const TIPO_COLORS: Record<string, string> = {
  aniversario: 'bg-pink-100 text-pink-700',
  vencimento: 'bg-blue-100 text-blue-700',
  boas_vindas: 'bg-green-100 text-green-700',
  avaliacao_google: 'bg-yellow-100 text-yellow-700',
  personalizado: 'bg-purple-100 text-purple-700',
}

const TIPO_LABELS: Record<string, string> = {
  aniversario: 'Aniversário',
  vencimento: 'Vencimento',
  boas_vindas: 'Boas-vindas',
  avaliacao_google: 'Avaliação Google',
  personalizado: 'Personalizado',
}

const GRUPO_LABELS: Record<string, string> = {
  todos: 'Todos os contatos',
  alunos_ativos: 'Alunos ativos',
  leads: 'Leads',
  ex_alunos: 'Ex-alunos',
}

export default function DisparosProgramados() {
  const [disparos, setDisparos] = useState<DisparoProgramado[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<DisparoProgramado | null>(null)

  useEffect(() => {
    loadDisparos()
  }, [])

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
        <button
          onClick={() => { setEditing(null); setShowForm(true) }}
          className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2.5 rounded-lg hover:bg-brand-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Disparo
        </button>
      </div>

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
                  {GRUPO_LABELS[d.grupo_alvo] || d.grupo_alvo}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {d.hora_disparo?.slice(0, 5) || '09:00'}
                </span>
                {d.dia_disparo && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Dia {d.dia_disparo}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Send className="w-3 h-3" />
                  {d.total_enviados} enviados
                </span>
              </div>

              {d.ultimo_disparo && (
                <p className="text-xs text-gray-400 mb-3">
                  Último disparo: {new Date(d.ultimo_disparo).toLocaleDateString('pt-BR')} às {new Date(d.ultimo_disparo).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}

              <div className="flex items-center gap-2 pt-2 border-t">
                <button
                  onClick={() => { setEditing(d); setShowForm(true) }}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand-600 px-2 py-1 rounded"
                >
                  <Pencil className="w-3 h-3" /> Editar
                </button>
                <button
                  onClick={() => handleDelete(d.id)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 px-2 py-1 rounded"
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

      {/* Form Modal */}
      {showForm && (
        <DisparoForm
          disparo={editing}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null) }}
        />
      )}
    </div>
  )
}

function DisparoForm({
  disparo,
  onSave,
  onClose,
}: {
  disparo: DisparoProgramado | null
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
    dia_disparo: disparo?.dia_disparo?.toString() ?? '',
    hora_disparo: disparo?.hora_disparo?.slice(0, 5) ?? '09:00',
    ativo: disparo?.ativo ?? true,
  })

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
            <option value="boas_vindas">Boas-vindas</option>
            <option value="avaliacao_google">Avaliação Google</option>
            <option value="personalizado">Personalizado</option>
          </select>
          <textarea
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="Mensagem (use {nome} para personalizar)"
            rows={4}
            value={form.mensagem}
            onChange={(e) => setForm({ ...form, mensagem: e.target.value })}
          />
          <p className="text-xs text-gray-400">Variáveis: {'{nome}'}, {'{instrumento}'}, {'{telefone}'}</p>
          <select
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={form.grupo_alvo}
            onChange={(e) => setForm({ ...form, grupo_alvo: e.target.value })}
          >
            <option value="todos">Todos os contatos</option>
            <option value="alunos_ativos">Alunos ativos</option>
            <option value="leads">Leads</option>
            <option value="ex_alunos">Ex-alunos</option>
          </select>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Horário</label>
              <input
                type="time"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.hora_disparo}
                onChange={(e) => setForm({ ...form, hora_disparo: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Dia do mês (opcional)</label>
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
          </div>
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="URL da mídia (opcional)"
            value={form.media_url}
            onChange={(e) => setForm({ ...form, media_url: e.target.value })}
          />
          {form.media_url && (
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.media_type}
              onChange={(e) => setForm({ ...form, media_type: e.target.value })}
            >
              <option value="">Tipo de mídia</option>
              <option value="image">Imagem</option>
              <option value="video">Vídeo</option>
              <option value="audio">Áudio</option>
              <option value="document">Documento</option>
            </select>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            Cancelar
          </button>
          <button
            onClick={() => {
              if (!form.nome || !form.mensagem) return
              onSave({
                ...form,
                dia_disparo: form.dia_disparo ? parseInt(form.dia_disparo) : undefined,
                media_url: form.media_url || undefined,
                media_type: form.media_type || undefined,
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
