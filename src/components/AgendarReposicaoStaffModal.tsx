import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export interface RepAgendar {
  id: string
  aluno_nome: string
  instrumento?: string | null
  professor_id?: string | null
  professor_nome?: string | null
  professor_reposicao_id?: string | null
  data_reposicao?: string | null
  hora_reposicao?: string | null
}

interface Prof { id: string; nome: string; instrumentos: string[] | null }

interface Props {
  rep: RepAgendar
  onClose: () => void
  onDone: () => void
}

export default function AgendarReposicaoStaffModal({ rep, onClose, onDone }: Props) {
  const [profs, setProfs] = useState<Prof[]>([])
  const [professorId, setProfessorId] = useState(rep.professor_reposicao_id ?? rep.professor_id ?? '')
  const [data, setData] = useState(rep.data_reposicao ?? '')
  const [hora, setHora] = useState(rep.hora_reposicao?.slice(0, 5) ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('professores').select('id, nome, instrumentos').eq('ativo', true).order('nome')
      .then(({ data }) => setProfs((data ?? []) as Prof[]))
  }, [])

  // Original primeiro, depois quem ensina o instrumento, depois os demais
  const ordenados = useMemo(() => {
    const instr = (rep.instrumento ?? '').toLowerCase()
    const peso = (p: Prof) => p.id === rep.professor_id ? 0
      : (instr && (p.instrumentos ?? []).some(i => i.toLowerCase() === instr)) ? 1 : 2
    return [...profs].sort((a, b) => peso(a) - peso(b) || a.nome.localeCompare(b.nome))
  }, [profs, rep.professor_id, rep.instrumento])

  const trocando = !!professorId && !!rep.professor_id && professorId !== rep.professor_id

  async function salvar() {
    if (!data || !hora) return
    setSaving(true)
    const { data: res, error } = await supabase.rpc('reposicao_staff_agendar', {
      p_reposicao_id: rep.id,
      p_data: data,
      p_hora: hora,
      p_professor_id: professorId || null,
    })
    setSaving(false)
    if (error) { alert(`Erro ao agendar:\n${error.message}`); return }
    const r = res as { ok: boolean; mensagem: string }
    if (!r?.ok) { alert(r?.mensagem || 'Não foi possível agendar.'); return }
    alert(r.mensagem)
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{rep.data_reposicao ? 'Reagendar' : 'Agendar'} reposição</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-gray-600">
          Aluno: <strong>{rep.aluno_nome}</strong>{rep.instrumento ? ` • ${rep.instrumento}` : ''}
        </p>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Professor</label>
          <select
            value={professorId}
            onChange={e => setProfessorId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            {ordenados.map(p => (
              <option key={p.id} value={p.id}>
                {p.nome}{p.id === rep.professor_id ? ' (professor da aula - padrão)' : ''}
              </option>
            ))}
          </select>
          {trocando && (
            <p className="mt-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg p-2">
              Troca de professor: o novo professor precisa aceitar antes de valer. Quem der a aula recebe por ela;
              o professor original não recebe esta reposição.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data <span className="text-red-500">*</span></label>
            <input type="date" value={data} onChange={e => setData(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Horário <span className="text-red-500">*</span></label>
            <input type="time" value={hora} onChange={e => setHora(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
          <button
            onClick={salvar}
            disabled={saving || !data || !hora}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
          >
            {saving ? 'Salvando...' : trocando ? 'Enviar ao professor' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
