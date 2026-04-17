import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import {
  CalendarClock,
  Save,
  X,
  ChevronDown,
  RefreshCw,
  Check,
  Ban,
  Clock,
  Trash2,
} from 'lucide-react'

interface Professor {
  id: string
  nome: string
  instrumentos?: string[]
  ativo?: boolean
}

interface Horario {
  id: string
  professor_id: string
  dia_semana: string
  hora_inicio: string
  status: string
  aluno_nome: string | null
}

type Status = 'disponivel' | 'ocupado' | 'indisponivel'

const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

const STATUS_STYLES: Record<Status, string> = {
  disponivel: 'bg-emerald-100 border-emerald-300 text-emerald-600',
  ocupado: 'bg-sky-100 border-sky-300 text-sky-800',
  indisponivel: 'bg-gray-50 border-gray-200 text-gray-300',
}

const STATUS_STYLES_SELECTED: Record<Status, string> = {
  disponivel: 'bg-emerald-200 border-emerald-500 text-emerald-700 ring-2 ring-emerald-400',
  ocupado: 'bg-sky-200 border-sky-500 text-sky-900 ring-2 ring-sky-400',
  indisponivel: 'bg-gray-200 border-gray-400 text-gray-500 ring-2 ring-gray-400',
}

const STATUS_LABEL: Record<Status, string> = {
  disponivel: 'Disponível',
  ocupado: 'Ocupado',
  indisponivel: 'Indisponível',
}

export default function Horarios() {
  const [horarios, setHorarios] = useState<Horario[]>([])
  const [professores, setProfessores] = useState<Professor[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroProf, setFiltroProf] = useState<string>('todos')
  const [editCell, setEditCell] = useState<Horario | null>(null)
  const [editStatus, setEditStatus] = useState<Status>('disponivel')
  const [editAluno, setEditAluno] = useState('')
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkSaving, setBulkSaving] = useState(false)
  const [lastClicked, setLastClicked] = useState<string | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: profs }, { data: hrs }] = await Promise.all([
      supabase.from('professores').select('*').eq('ativo', true).order('nome'),
      supabase.from('horarios').select('*').order('hora_inicio'),
    ])
    setProfessores(profs || [])
    setHorarios(hrs || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Auto-refresh every 60s + on window focus
  useEffect(() => {
    const interval = setInterval(() => { fetchData() }, 60000)
    const onFocus = () => { fetchData() }
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [fetchData])

  // Professor name mapping (sheet nickname → DB full name)
  const sheetToDbName: Record<string, string> = {
    'Betto': 'Alberto Gabriel Maracheski (Betto)',
    'Fabi': 'Fabiana Cezar Renner',
    'Jeferson': 'Jeferson Coelho Rodrigues',
    'João': 'João Vitor Saft',
    'Lucas Cardoso': 'Lucas Cardoso da Silva',
    'Madu': 'Maria Eduarda Ermel Thoen (Madu)',
    'Neto Bateria': 'Olmiro Daniel Velho Neto (Neto)',
    'Uilian Dorneles': 'Uilian Dornelles',
    'Wesley Gonçalves': 'Wesley Goncalves da Silva Araujo',
    'Willian Fruscalso': 'Willian Batista Fruscalso',
  }

  const syncFromSheets = async () => {
    setSyncing(true)
    try {
      const resp = await fetch('https://cmmf.app.n8n.cloud/webhook/verificar-disponibilidade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'sync-all' }),
      })
      const data = await resp.json()
      if (!data.sucesso || !data.slots) throw new Error(data.erro || 'Erro ao sincronizar')

      // Build professor ID lookup from DB
      const profIdMap = new Map<string, string>()
      for (const p of professores) {
        profIdMap.set(p.nome, p.id)
      }

      // Match sheet slots to DB and batch upsert
      let updated = 0
      const updates: { id: string; status: string; aluno_nome: string | null }[] = []

      for (const slot of data.slots as { professor: string; dia_semana: string; hora_inicio: string; status: string; aluno_nome: string | null }[]) {
        const dbName = sheetToDbName[slot.professor] || slot.professor
        const profId = profIdMap.get(dbName)
        if (!profId) continue

        // Find matching horario in local data
        const match = horarios.find(h =>
          h.professor_id === profId &&
          h.dia_semana === slot.dia_semana &&
          h.hora_inicio.slice(0, 5) === slot.hora_inicio
        )
        if (!match) continue

        // Only update if different
        const newAluno = slot.status === 'ocupado' ? (slot.aluno_nome || null) : null
        if (match.status !== slot.status || match.aluno_nome !== newAluno) {
          updates.push({ id: match.id, status: slot.status, aluno_nome: newAluno })
        }
      }

      // Batch update to Supabase (chunks of 50)
      for (let i = 0; i < updates.length; i += 50) {
        const chunk = updates.slice(i, i + 50)
        await Promise.all(chunk.map(u =>
          supabase.from('horarios').update({
            status: u.status,
            aluno_nome: u.aluno_nome,
          }).eq('id', u.id)
        ))
        updated += chunk.length
      }

      setLastSync(new Date())
      await fetchData()
      alert(`Sincronização concluída! ${updated} alteração(ões) da planilha.`)
    } catch (err) {
      alert('Erro na sincronização: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSyncing(false)
    }
  }

  // Close popup on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setEditCell(null)
      }
    }
    if (editCell) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [editCell])

  // Build time slots from data
  const timeSlots = Array.from(new Set(horarios.map(h => h.hora_inicio.slice(0, 5)))).sort()

  // Build lookup: professor_id -> dia -> hora -> Horario
  const lookup = new Map<string, Map<string, Map<string, Horario>>>()
  for (const h of horarios) {
    if (!lookup.has(h.professor_id)) lookup.set(h.professor_id, new Map())
    const pmap = lookup.get(h.professor_id)!
    if (!pmap.has(h.dia_semana)) pmap.set(h.dia_semana, new Map())
    pmap.get(h.dia_semana)!.set(h.hora_inicio.slice(0, 5), h)
  }

  const getCell = (profId: string, dia: string, hora: string): Horario | undefined =>
    lookup.get(profId)?.get(dia)?.get(hora)

  const openEdit = (h: Horario) => {
    setEditCell(h)
    setEditStatus(h.status as Status)
    setEditAluno(h.aluno_nome || '')
  }

  // Multi-select: toggle cell with Shift support for range
  const toggleSelect = (h: Horario, profId: string, profSlots: Horario[], e: React.MouseEvent) => {
    const newSel = new Set(selected)

    if (e.shiftKey && lastClicked) {
      // Range select: select all slots between lastClicked and current within same professor
      const sorted = profSlots.sort((a, b) => {
        const dayDiff = DIAS_SEMANA.indexOf(a.dia_semana) - DIAS_SEMANA.indexOf(b.dia_semana)
        return dayDiff !== 0 ? dayDiff : a.hora_inicio.localeCompare(b.hora_inicio)
      })
      const idxA = sorted.findIndex(s => s.id === lastClicked)
      const idxB = sorted.findIndex(s => s.id === h.id)
      if (idxA >= 0 && idxB >= 0) {
        const [start, end] = [Math.min(idxA, idxB), Math.max(idxA, idxB)]
        for (let i = start; i <= end; i++) { const s = sorted[i]; if (s) newSel.add(s.id) }
      }
    } else {
      if (newSel.has(h.id)) newSel.delete(h.id)
      else newSel.add(h.id)
    }

    setLastClicked(h.id)
    setSelected(newSel)
  }

  const clearSelection = () => {
    setSelected(new Set())
    setLastClicked(null)
  }

  // Select all visible slots for a professor
  const selectAllProf = (profId: string) => {
    const profSlotIds = horarios.filter(h => h.professor_id === profId).map(h => h.id)
    const newSel = new Set(selected)
    const allSelected = profSlotIds.every(id => newSel.has(id))
    if (allSelected) {
      profSlotIds.forEach(id => newSel.delete(id))
    } else {
      profSlotIds.forEach(id => newSel.add(id))
    }
    setSelected(newSel)
  }

  // Select entire column (day) for a professor
  const selectDay = (profId: string, dia: string) => {
    const daySlotIds = horarios.filter(h => h.professor_id === profId && h.dia_semana === dia).map(h => h.id)
    const newSel = new Set(selected)
    const allSelected = daySlotIds.every(id => newSel.has(id))
    if (allSelected) {
      daySlotIds.forEach(id => newSel.delete(id))
    } else {
      daySlotIds.forEach(id => newSel.add(id))
    }
    setSelected(newSel)
  }

  // Select entire row (time) for a professor
  const selectTime = (profId: string, hora: string) => {
    const timeSlotIds = horarios.filter(h => h.professor_id === profId && h.hora_inicio.slice(0, 5) === hora).map(h => h.id)
    const newSel = new Set(selected)
    const allSelected = timeSlotIds.every(id => newSel.has(id))
    if (allSelected) {
      timeSlotIds.forEach(id => newSel.delete(id))
    } else {
      timeSlotIds.forEach(id => newSel.add(id))
    }
    setSelected(newSel)
  }

  // Bulk status change
  const bulkChangeStatus = async (newStatus: Status) => {
    if (selected.size === 0) return
    setBulkSaving(true)

    const selectedHorarios = horarios.filter(h => selected.has(h.id))
    const aluno = newStatus === 'ocupado' ? null : null

    // Build professor sheet name lookup
    const sheetNameMap: Record<string, string> = {
      'Alberto Gabriel Maracheski (Betto)': 'Betto',
      'Fabiana Cezar Renner': 'Fabi',
      'Jeferson Coelho Rodrigues': 'Jeferson',
      'João Vitor Saft': 'João',
      'Lucas Cardoso da Silva': 'Lucas Cardoso',
      'Maria Eduarda Ermel Thoen (Madu)': 'Madu',
      'Olmiro Daniel Velho Neto (Neto)': 'Neto Bateria',
      'Uilian Dornelles': 'Uilian Dorneles',
      'Wesley Goncalves da Silva Araujo': 'Wesley Gonçalves',
      'Willian Batista Fruscalso': 'Willian Fruscalso',
    }

    // Batch update Supabase (chunks of 50)
    for (let i = 0; i < selectedHorarios.length; i += 50) {
      const chunk = selectedHorarios.slice(i, i + 50)
      await Promise.all(chunk.map(h =>
        supabase.from('horarios').update({
          status: newStatus,
          aluno_nome: aluno,
        }).eq('id', h.id)
      ))
    }

    // Write-back to Google Sheets (fire-and-forget, in chunks)
    for (const h of selectedHorarios) {
      const prof = professores.find(p => p.id === h.professor_id)
      if (prof) {
        const sheetName = sheetNameMap[prof.nome] || prof.nome
        fetch('https://cmmf.app.n8n.cloud/webhook/verificar-disponibilidade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'update-cell',
            professor: sheetName,
            dia_semana: h.dia_semana,
            hora_inicio: h.hora_inicio.slice(0, 5),
            status: newStatus,
            aluno_nome: '',
          }),
        }).catch(() => {})
      }
    }

    // Update local state
    setHorarios(prev => prev.map(h =>
      selected.has(h.id) ? { ...h, status: newStatus, aluno_nome: aluno } : h
    ))

    clearSelection()
    setBulkSaving(false)
  }

  const handleSave = async () => {
    if (!editCell) return
    setSaving(true)
    const aluno = editStatus === 'ocupado' ? (editAluno.trim() || null) : null

    // 1. Update Supabase
    await supabase.from('horarios').update({
      status: editStatus,
      aluno_nome: aluno,
    }).eq('id', editCell.id)

    // 2. Write-back to Google Sheets via n8n webhook
    const prof = professores.find(p => p.id === editCell.professor_id)
    if (prof) {
      // Map full DB name → sheet name (apelido usado na planilha)
      const sheetNameMap: Record<string, string> = {
        'Alberto Gabriel Maracheski (Betto)': 'Betto',
        'Fabiana Cezar Renner': 'Fabi',
        'Jeferson Coelho Rodrigues': 'Jeferson',
        'João Vitor Saft': 'João',
        'Lucas Cardoso da Silva': 'Lucas Cardoso',
        'Maria Eduarda Ermel Thoen (Madu)': 'Madu',
        'Olmiro Daniel Velho Neto (Neto)': 'Neto Bateria',
        'Uilian Dornelles': 'Uilian Dorneles',
        'Wesley Goncalves da Silva Araujo': 'Wesley Gonçalves',
        'Willian Batista Fruscalso': 'Willian Fruscalso',
      }
      const sheetName = sheetNameMap[prof.nome] || prof.nome
      try {
        await fetch('https://cmmf.app.n8n.cloud/webhook/verificar-disponibilidade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'update-cell',
            professor: sheetName,
            dia_semana: editCell.dia_semana,
            hora_inicio: editCell.hora_inicio.slice(0, 5),
            status: editStatus,
            aluno_nome: aluno || '',
          }),
        })
      } catch {
        // Silently fail - Supabase is the source of truth
      }
    }

    // Update local state
    setHorarios(prev => prev.map(h =>
      h.id === editCell.id ? { ...h, status: editStatus, aluno_nome: aluno } : h
    ))
    setSaving(false)
    setEditCell(null)
  }

  // Stats
  const stats = { disponivel: 0, ocupado: 0, indisponivel: 0 }
  for (const h of horarios) {
    if (h.status in stats) stats[h.status as Status]++
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
      </div>
    )
  }

  const filteredProfs = professores.filter(p => filtroProf === 'todos' || p.id === filtroProf)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CalendarClock className="w-8 h-8 text-brand-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Quadro de Horários</h1>
            <p className="text-sm text-gray-500">
              {horarios.length} slots • {professores.length} professores
              {lastSync && <span className="ml-2 text-gray-400">• Última sync: {lastSync.toLocaleTimeString('pt-BR')}</span>}
            </p>
          </div>
        </div>
        <button
          onClick={syncFromSheets}
          disabled={syncing}
          className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 text-sm font-medium shadow-sm"
          title="Sincronizar dados da planilha Google Sheets para o sistema"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Sincronizando...' : 'Sincronizar da Planilha'}
        </button>
      </div>

      {/* Stats + Filter bar */}
      <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-200 border border-emerald-300" />
            Disponível: <strong>{stats.disponivel}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-blue-200 border border-blue-300" />
            Ocupado: <strong>{stats.ocupado}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-gray-200 border border-gray-300" />
            Indisponível: <strong>{stats.indisponivel}</strong>
          </span>
        </div>

        <div className="ml-auto relative">
          <select
            value={filtroProf}
            onChange={(e) => setFiltroProf(e.target.value)}
            className="appearance-none bg-gray-50 border border-gray-200 rounded-lg pl-3 pr-8 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          >
            <option value="todos">Todos os professores</option>
            {professores.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 absolute right-2 top-2.5 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Grids por professor */}
      <div className="space-y-6">
        {filteredProfs.map((prof) => {
          const profSlots = horarios.filter(h => h.professor_id === prof.id)
          const profTimeSlots = Array.from(new Set(profSlots.map(h => h.hora_inicio.slice(0, 5)))).sort()
          const profDays = DIAS_SEMANA.filter(d => profSlots.some(h => h.dia_semana === d))

          if (profSlots.length === 0) return null

          const profStats = { disponivel: 0, ocupado: 0, indisponivel: 0 }
          for (const h of profSlots) {
            if (h.status in profStats) profStats[h.status as Status]++
          }

          const profSelected = profSlots.filter(h => selected.has(h.id)).length
          const allProfSelected = profSelected === profSlots.length && profSlots.length > 0

          return (
            <div key={prof.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Professor header */}
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => selectAllProf(prof.id)}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      allProfSelected
                        ? 'bg-brand-500 border-brand-500 text-white'
                        : profSelected > 0
                        ? 'bg-brand-100 border-brand-400'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                    title={allProfSelected ? 'Desmarcar todos' : 'Selecionar todos os horários'}
                  >
                    {allProfSelected && <Check className="w-3 h-3" />}
                  </button>
                  <div>
                    <span className="font-semibold text-gray-900">{prof.nome}</span>
                    <span className="text-xs text-gray-400 ml-2">
                      {prof.instrumentos?.join(', ')}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  {profSelected > 0 && (
                    <span className="text-brand-600 font-semibold">{profSelected} selecionados</span>
                  )}
                  <span className="text-emerald-600">{profStats.disponivel} livres</span>
                  <span className="text-blue-600">{profStats.ocupado} ocupados</span>
                </div>
              </div>

              {/* Schedule grid */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-500 bg-gray-50 border-b border-r border-gray-200 w-[60px] sticky left-0 z-10">
                        Horário
                      </th>
                      {profDays.map(dia => (
                        <th
                          key={dia}
                          onClick={() => selectDay(prof.id, dia)}
                          className="px-1 py-2 text-center text-xs font-semibold text-gray-600 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 select-none"
                          title={`Selecionar toda ${dia}`}
                        >
                          {dia}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {profTimeSlots.map(hora => (
                      <tr key={hora} className="border-b border-gray-100">
                        <td
                          onClick={() => selectTime(prof.id, hora)}
                          className="px-2 py-0.5 font-mono text-[11px] text-gray-500 bg-gray-50 border-r border-gray-200 sticky left-0 z-10 cursor-pointer hover:bg-gray-100 select-none"
                          title={`Selecionar toda linha ${hora}`}
                        >
                          {hora}
                        </td>
                        {profDays.map(dia => {
                          const cell = getCell(prof.id, dia, hora)
                          if (!cell) {
                            return <td key={dia} className="px-1 py-1 border-r border-gray-100" />
                          }
                          const st = cell.status as Status
                          const isSelected = selected.has(cell.id)
                          return (
                            <td key={dia} className="px-0.5 py-0.5 border-r border-gray-100">
                              <button
                                onClick={(e) => {
                                  if (clickTimer.current) clearTimeout(clickTimer.current)
                                  clickTimer.current = setTimeout(() => {
                                    toggleSelect(cell, prof.id, profSlots, e)
                                    clickTimer.current = null
                                  }, 250)
                                }}
                                onDoubleClick={() => {
                                  if (clickTimer.current) {
                                    clearTimeout(clickTimer.current)
                                    clickTimer.current = null
                                  }
                                  openEdit(cell)
                                }}
                                className={`w-full h-7 px-1 rounded border text-[11px] font-medium truncate transition-all cursor-pointer select-none ${
                                  isSelected ? STATUS_STYLES_SELECTED[st] : STATUS_STYLES[st] + ' hover:opacity-75'
                                }`}
                                title={
                                  st === 'ocupado'
                                    ? `${cell.aluno_nome || 'Ocupado'} — clique para selecionar, duplo-clique para editar`
                                    : st === 'indisponivel'
                                    ? 'Indisponível — clique para selecionar'
                                    : 'Disponível — clique para selecionar, duplo-clique para editar'
                                }
                              >
                                {isSelected && <Check className="w-3 h-3 inline mr-0.5" />}
                                {st === 'ocupado'
                                  ? cell.aluno_nome || 'Ocupado'
                                  : st === 'indisponivel'
                                  ? ''
                                  : ''}
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>

      {/* Floating bulk action bar */}
      {selected.size > 0 && !editCell && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-gray-900 text-white rounded-2xl shadow-2xl px-5 py-3 flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4">
          <span className="text-sm font-medium whitespace-nowrap">
            {selected.size} {selected.size === 1 ? 'horário selecionado' : 'horários selecionados'}
          </span>

          <div className="h-6 w-px bg-gray-600" />

          <div className="flex items-center gap-2">
            <button
              onClick={() => bulkChangeStatus('disponivel')}
              disabled={bulkSaving}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              title="Marcar como disponível"
            >
              <Check className="w-3.5 h-3.5" />
              Disponível
            </button>
            <button
              onClick={() => bulkChangeStatus('indisponivel')}
              disabled={bulkSaving}
              className="flex items-center gap-1.5 bg-gray-600 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              title="Marcar como indisponível"
            >
              <Ban className="w-3.5 h-3.5" />
              Indisponível
            </button>
            <button
              onClick={() => bulkChangeStatus('ocupado')}
              disabled={bulkSaving}
              className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              title="Marcar como ocupado"
            >
              <Clock className="w-3.5 h-3.5" />
              Ocupado
            </button>
          </div>

          <div className="h-6 w-px bg-gray-600" />

          <button
            onClick={clearSelection}
            className="flex items-center gap-1 text-gray-400 hover:text-white text-sm transition-colors"
          >
            <X className="w-4 h-4" />
            Limpar
          </button>

          {bulkSaving && (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
          )}
        </div>
      )}

      {/* Edit popup */}
      {editCell && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div ref={popupRef} className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="font-semibold text-gray-900 text-sm">
                {professores.find(p => p.id === editCell.professor_id)?.nome} — {editCell.dia_semana} {editCell.hora_inicio.slice(0, 5)}
              </h3>
              <button onClick={() => setEditCell(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Status</label>
                <div className="flex gap-2">
                  {(['disponivel', 'ocupado', 'indisponivel'] as Status[]).map(st => (
                    <button
                      key={st}
                      onClick={() => setEditStatus(st)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border-2 transition-colors ${
                        editStatus === st
                          ? st === 'disponivel'
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                            : st === 'ocupado'
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-500 bg-gray-100 text-gray-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {STATUS_LABEL[st]}
                    </button>
                  ))}
                </div>
              </div>
              {editStatus === 'ocupado' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nome do Aluno</label>
                  <input
                    value={editAluno}
                    onChange={e => setEditAluno(e.target.value)}
                    placeholder="Nome do aluno"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    autoFocus
                  />
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setEditCell(null)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 bg-brand-500 text-white px-4 py-1.5 rounded-lg hover:bg-brand-600 transition-colors disabled:opacity-50 font-medium text-sm"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
