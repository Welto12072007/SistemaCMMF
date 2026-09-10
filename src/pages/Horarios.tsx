import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import {
  CalendarClock,
  Save,
  X,
  ChevronDown,
  Check,
  Ban,
  Clock,
  Trash2,
  MessageSquare,
  Send,
  Plus,
  Pencil,
} from 'lucide-react'

interface Professor {
  id: string
  nome: string
  instrumentos?: string[]
  ativo?: boolean
}

interface Aluno {
  id: string
  nome: string
  telefone: string | null
  instrumento_interesse?: string | null
  modalidade_preferida?: string | null
}

interface Horario {
  id: string
  professor_id: string
  dia_semana: string
  hora_inicio: string
  status: string
  aluno_nome: string | null
  instrumento?: string | null
  tipo?: string
  aluno_ids?: string[] | null
  capacidade?: number | null
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
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [editCell, setEditCell] = useState<Horario | null>(null)
  const [editStatus, setEditStatus] = useState<Status>('disponivel')
  const [editTipo, setEditTipo] = useState<'individual' | 'grupo'>('individual')
  const [editAlunoIds, setEditAlunoIds] = useState<string[]>([])
  const [editAlunoSearch, setEditAlunoSearch] = useState('')
  const [editShowSearch, setEditShowSearch] = useState(false)
  const [editCapacidade, setEditCapacidade] = useState(1)
  const [editGrupoUnmatchedNames, setEditGrupoUnmatchedNames] = useState<{nome: string; telefone: string}[]>([])
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [novoHorario, setNovoHorario] = useState<{ profId: string } | null>(null)
  const [novoDia, setNovoDia] = useState('Segunda')
  const [novaHora, setNovaHora] = useState('08:00')
  const [novoStatus, setNovoStatus] = useState<Status>('disponivel')
  const [novoTipo, setNovoTipo] = useState<'individual' | 'grupo'>('individual')
  const [novoAlunoIds, setNovoAlunoIds] = useState<string[]>([])
  const [novoAlunoSearch, setNovoAlunoSearch] = useState('')
  const [novoShowSearch, setNovoShowSearch] = useState(false)
  const [novoCapacidade, setNovoCapacidade] = useState(1)
  const [novoGrupoUnmatchedNames, setNovoGrupoUnmatchedNames] = useState<{nome: string; telefone: string}[]>([])
  const [novoSaving, setNovoSaving] = useState(false)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [lastClicked, setLastClicked] = useState<string | null>(null)
  const [disparoOpen, setDisparoOpen] = useState(false)
  const [disparoContatos, setDisparoContatos] = useState<{
    nome: string
    alunoId: string | null
    telefone: string | null
    instrumento?: string
    selected: boolean
    slot: string
  }[]>([])
  const [editingPhoneIdx, setEditingPhoneIdx] = useState<number | null>(null)
  const [editingPhoneValue, setEditingPhoneValue] = useState('')
  const [savingPhone, setSavingPhone] = useState(false)
  const [disparoMensagem, setDisparoMensagem] = useState('')
  const [disparoSending, setDisparoSending] = useState(false)
  const [disparoResultado, setDisparoResultado] = useState<{ enviados: number; erros: number } | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const disparoRef = useRef<HTMLDivElement>(null)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: profs }, { data: hrs }, { data: als }] = await Promise.all([
      supabase.from('professores').select('*').eq('ativo', true).order('nome'),
      supabase.from('horarios').select('*').order('hora_inicio'),
      supabase.from('alunos').select('id, nome, telefone, modalidade_preferida').in('status', ['ativo', 'aluno', 'agendado']).order('nome'),
    ])
    setProfessores(profs || [])
    setHorarios(hrs || [])
    setAlunos((als || []).filter(a => a.nome))
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

  // Save new slot
  const handleSaveNovo = async () => {
    if (!novoHorario) return
    setNovoSaving(true)
    let alunoNome: string | null = null
    let alunoIds: string[] | null = null
    if (novoStatus === 'ocupado') {
      if (novoAlunoIds.length > 0 || novoGrupoUnmatchedNames.length > 0) {
        const matchedNames = novoAlunoIds
          .map(id => alunos.find(a => a.id === id)?.nome || '')
          .filter(Boolean)
        alunoNome = [...matchedNames, ...novoGrupoUnmatchedNames.map(u => u.nome)].join('\n') || null
        alunoIds = novoAlunoIds.length > 0 ? novoAlunoIds : null
      } else if (novoAlunoSearch.trim()) {
        alunoNome = novoAlunoSearch.trim()
      }
    }
    // Resolve instrumento from first student
    let instrumento: string | null = null
    if (novoAlunoIds.length > 0) {
      const firstAluno = alunos.find(a => a.id === novoAlunoIds[0])
      instrumento = firstAluno?.instrumento_interesse || null
    }
    const { data, error } = await supabase.from('horarios').insert({
      professor_id: novoHorario.profId,
      dia_semana: novoDia,
      hora_inicio: novaHora + ':00',
      status: novoStatus,
      tipo: novoTipo,
      aluno_nome: alunoNome,
      aluno_ids: alunoIds,
      capacidade: novoTipo === 'grupo' ? novoCapacidade : 1,
      instrumento,
    }).select().single()
    if (error) {
      if (error.message.includes('horarios_unique_slot') || error.code === '23505') {
        alert(`Já existe um horário para este professor em ${novoDia} às ${novaHora}.\nEdite o horário existente ou escolha outro dia/hora.`)
      } else {
        alert('Erro ao criar horário: ' + error.message)
      }
    } else if (data) {
      setHorarios(prev => [...prev, data])
    }
    setNovoSaving(false)
    setNovoHorario(null)
  }

  // Delete slot
  const handleDelete = async () => {
    if (!editCell) return
    if (!confirm('Excluir este horário permanentemente?')) return
    await supabase.from('horarios').delete().eq('id', editCell.id)
    setHorarios(prev => prev.filter(h => h.id !== editCell.id))
    setEditCell(null)
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
    // Auto-detect tipo: old data may have comma-separated names without tipo set
    const hasMultipleNames = !h.tipo && !!h.aluno_nome && (
      h.aluno_nome.includes(',') || h.aluno_nome.includes('\n') ||
      // detect "A e B" pattern (Portuguese "and") — two multi-word names separated by " e "
      /\w{2,}\s+e\s+\w{2,}/.test(h.aluno_nome)
    )
    const detectedTipo: 'individual' | 'grupo' = (h.tipo as 'individual' | 'grupo') || (hasMultipleNames ? 'grupo' : 'individual')
    setEditTipo(detectedTipo)

    const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
    const splitNomesHorario = (nome: string): string[] => {
      const rawNomes = nome.split(/[,\n]/).map(n => n.trim()).filter(Boolean)
      return rawNomes.flatMap(n => {
        if (n.includes(' e ')) {
          const parts = n.split(/\s+e\s+/).map(p => p.trim()).filter(Boolean)
          if (parts.length >= 2 && parts.every(p => p.split(/\s+/).length >= 2)) return parts
        }
        return [n]
      })
    }
    const matchAluno = (nome: string): string | null => {
      const hn = normalize(nome)
      const hWords = hn.split(/\s+/).filter(w => w.length > 2)
      const found = alunos.find(a => normalize(a.nome) === hn) ||
        (hWords.length > 0 ? alunos.find(a => { const an = normalize(a.nome); return hWords.every(w => an.includes(w)) }) : undefined)
      return found ? found.id : null
    }

    let ids: string[] = h.aluno_ids ? [...h.aluno_ids] : []
    const unmatched: {nome: string; telefone: string}[] = []
    let detectedNameCount = 0

    const getPhoneForUnmatched = (nome: string): string => {
      const firstName = normalize(nome).split(/\s+/)[0] ?? ''
      if (firstName.length < 3) return ''
      return alunos.find(a => (normalize(a.nome).split(/\s+/)[0] ?? '') === firstName)?.telefone || ''
    }

    if (ids.length === 0 && h.aluno_nome) {
      // Old data: match names text → IDs
      const nomes = splitNomesHorario(h.aluno_nome)
      detectedNameCount = nomes.length
      for (const nome of nomes) {
        const id = matchAluno(nome)
        if (id) ids.push(id)
        else unmatched.push({ nome, telefone: getPhoneForUnmatched(nome) })
      }
    } else if (ids.length > 0 && h.aluno_nome && detectedTipo === 'grupo') {
      // New data: find names in aluno_nome not yet covered by existing IDs (e.g. typos)
      const nomes = splitNomesHorario(h.aluno_nome)
      detectedNameCount = nomes.length
      for (const nome of nomes) {
        const hn = normalize(nome)
        const hWords = hn.split(/\s+/).filter(w => w.length > 2)
        const coveredById = ids.some(id => {
          const a = alunos.find(a => a.id === id)
          if (!a) return false
          const an = normalize(a.nome)
          return an === hn || (hWords.length > 0 && hWords.every(w => an.includes(w)))
        })
        if (!coveredById) {
          const id = matchAluno(nome)
          if (id && !ids.includes(id)) ids.push(id)
          else if (!id) unmatched.push({ nome, telefone: getPhoneForUnmatched(nome) })
        }
      }
    }

    setEditAlunoIds(ids)
    setEditGrupoUnmatchedNames(unmatched)
    // Default capacidade for old group data (previously individual with capacidade=1)
    const defaultCap = detectedTipo === 'grupo' && !h.tipo && (!h.capacidade || h.capacidade <= 1) && detectedNameCount > 0
      ? detectedNameCount
      : (h.capacidade || (detectedTipo === 'grupo' ? 4 : 1))
    setEditCapacidade(defaultCap)
    // For individual: pre-fill search with existing nome so the field isn't blank
    setEditAlunoSearch(detectedTipo === 'individual' && ids.length === 0 ? (h.aluno_nome?.trim() || '') : '')
    setEditShowSearch(false)
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

    // Update local state
    setHorarios(prev => prev.map(h =>
      selected.has(h.id) ? { ...h, status: newStatus, aluno_nome: aluno } : h
    ))

    clearSelection()
    setBulkSaving(false)
  }

  const openDisparo = async () => {
    const occupiedSelected = horarios.filter(
      h => selected.has(h.id) && h.status === 'ocupado' && (h.aluno_ids?.length || h.aluno_nome)
    )
    if (occupiedSelected.length === 0) {
      alert('Nenhum horário com aluno selecionado. Selecione horários ocupados para enviar disparo.')
      return
    }
    // Aggregate: aluno nome -> { id, telefone, slots[] }
    const alunoMap = new Map<string, { id: string | null; telefone: string | null; instrumento: string; slots: string[] }>()

    for (const h of occupiedSelected) {
      const prof = professores.find(p => p.id === h.professor_id)
      const label = `${prof?.nome.split(' ')[0] || ''} - ${h.dia_semana} ${h.hora_inicio.slice(0, 5)}`

      if (h.aluno_ids && h.aluno_ids.length > 0) {
        // Direct ID lookup — no fuzzy matching needed
        for (const alunoId of h.aluno_ids) {
          const aluno = alunos.find(a => a.id === alunoId)
          if (!aluno) continue
          const nome = aluno.nome
          if (!alunoMap.has(nome)) alunoMap.set(nome, { id: alunoId, telefone: aluno.telefone || null, instrumento: aluno.instrumento_interesse || h.instrumento || '', slots: [label] })
          else alunoMap.get(nome)!.slots.push(label)
        }
      } else {
        // Fallback: split aluno_nome by \n or , (old comma-separated data) + fuzzy match
        const nomes = (h.aluno_nome || '').split(/[,\n]/).map(n => n.trim()).filter(Boolean)
        const normalize = (s: string) =>
          s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
        for (const nome of nomes) {
          const hn = normalize(nome)
          const hWords = hn.split(/\s+/).filter(w => w.length > 2)
          const exact = alunos.find(a => normalize(a.nome) === hn)
          const wordMatch = !exact && hWords.length > 0
            ? alunos.find(a => { const an = normalize(a.nome); return hWords.every(w => an.includes(w)) })
            : null
          const found = exact || wordMatch
          if (!alunoMap.has(nome)) alunoMap.set(nome, { id: found?.id || null, telefone: found?.telefone || null, instrumento: found?.instrumento_interesse || h.instrumento || '', slots: [label] })
          else alunoMap.get(nome)!.slots.push(label)
        }
      }
    }

    const contatos = Array.from(alunoMap.entries()).map(([nome, info]) => ({
      nome,
      alunoId: info.id,
      telefone: info.telefone,
      instrumento: info.instrumento,
      selected: !!info.telefone,
      slot: info.slots.join(', ')
    }))
    setDisparoContatos(contatos)
    setDisparoMensagem('')
    setDisparoResultado(null)
    setEditingPhoneIdx(null)
    setEditingPhoneValue('')
    setDisparoOpen(true)
  }

  const savePhone = async (idx: number) => {
    const tel = editingPhoneValue.trim()
    if (!tel) return
    const contato = disparoContatos[idx]
    if (!contato) return
    setSavingPhone(true)
    if (contato.alunoId) {
      const { error } = await supabase
        .from('alunos')
        .update({ telefone: tel })
        .eq('id', contato.alunoId)
      if (error) {
        alert('Erro ao salvar telefone:\n' + error.message)
        setSavingPhone(false)
        return
      }
    }
    setDisparoContatos(prev =>
      prev.map((c, i) => i === idx ? { ...c, telefone: tel, selected: true } : c)
    )
    setEditingPhoneIdx(null)
    setEditingPhoneValue('')
    setSavingPhone(false)
  }

  const interpolateDisparo = (texto: string, nome: string, instrumento: string) =>
    texto
      .replace(/\{nome\}/gi, nome.trim().split(/\s+/)[0] ?? nome)
      .replace(/\{nome_completo\}/gi, nome)
      .replace(/\{instrumento\}/gi, instrumento)

  const sendDisparo = async () => {
    const recipients = disparoContatos.filter(c => c.selected && c.telefone)
    if (!disparoMensagem.trim() || recipients.length === 0) return
    setDisparoSending(true)
    let enviados = 0
    let erros = 0
    for (const r of recipients) {
      try {
        const texto = interpolateDisparo(disparoMensagem, r.nome, r.instrumento ?? '')
        const resp = await fetch(
          'https://api.centrodemusicamurilofinger.com/message/sendText/CentroMusica',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': 'CentroMusica2026ApiKey' },
            body: JSON.stringify({ number: r.telefone, text: texto })
          }
        )
        if (resp.ok) enviados++
        else erros++
      } catch { erros++ }
    }
    setDisparoSending(false)
    setDisparoResultado({ enviados, erros })
  }

  const handleSave = async () => {
    if (!editCell) return
    setSaving(true)
    let alunoNome: string | null = null
    let alunoIds: string[] | null = null
    if (editStatus === 'ocupado') {
      if (editAlunoIds.length > 0) {
        const matchedNames = editAlunoIds
          .map(id => alunos.find(a => a.id === id)?.nome || '')
          .filter(Boolean)
        // Preserve unmatched names (typos/not yet registered) to avoid data loss
        // Fallback to editCell.aluno_nome if none matched (e.g. aluno status changed)
        alunoNome = [...matchedNames, ...editGrupoUnmatchedNames.map(u => u.nome)].join('\n') || editCell.aluno_nome
        alunoIds = editAlunoIds
      } else if (editAlunoSearch.trim()) {
        alunoNome = editAlunoSearch.trim()
      } else if (editCell.aluno_nome) {
        // Keep existing nome if nothing changed
        alunoNome = editCell.aluno_nome
        alunoIds = editCell.aluno_ids || null
      }
    }

    // Resolve instrumento from first student
    let instrumento: string | null = editCell.instrumento || null
    if (editAlunoIds.length > 0) {
      const firstAluno = alunos.find(a => a.id === editAlunoIds[0])
      if (firstAluno?.instrumento_interesse) instrumento = firstAluno.instrumento_interesse
    }

    const { error: saveError } = await supabase.from('horarios').update({
      status: editStatus,
      tipo: editTipo,
      aluno_nome: alunoNome,
      aluno_ids: alunoIds,
      capacidade: editTipo === 'grupo' ? editCapacidade : 1,
      instrumento: editStatus === 'ocupado' ? instrumento : null,
    }).eq('id', editCell.id)

    if (saveError) {
      alert('Erro ao salvar horário:\n' + saveError.message)
      setSaving(false)
      return
    }

    // Update local state
    setHorarios(prev => prev.map(h =>
      h.id === editCell.id
        ? { ...h, status: editStatus, tipo: editTipo, aluno_nome: alunoNome, aluno_ids: alunoIds, capacidade: editTipo === 'grupo' ? editCapacidade : 1, instrumento: editStatus === 'ocupado' ? instrumento : null }
        : h
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
      <div className="flex items-center gap-3">
        <CalendarClock className="w-8 h-8 text-brand-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quadro de Horários</h1>
          <p className="text-sm text-gray-500">
            {horarios.length} slots • {professores.length} professores
          </p>
        </div>
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
                  <button
                    onClick={() => {
                      setNovoHorario({ profId: prof.id })
                      setNovoDia('Segunda')
                      setNovaHora('08:00')
                      setNovoStatus('disponivel')
                      setNovoTipo('individual')
                      setNovoAlunoIds([])
                      setNovoAlunoSearch('')
                      setNovoShowSearch(false)
                      setNovoCapacidade(4)
                      setNovoGrupoUnmatchedNames([])
                    }}
                    className="flex items-center gap-1 bg-brand-500 hover:bg-brand-600 text-white px-2 py-0.5 rounded-lg text-xs font-medium transition-colors"
                    title="Adicionar novo horário"
                  >
                    <Plus className="w-3 h-3" />
                    Adicionar horário
                  </button>
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
                          const isGrupo = cell.tipo === 'grupo'
                          // Resolve names: for groups use aluno_nome (has all names incl. unmatched); fallback to aluno_ids lookup
                          const resolvedNames: string[] = (() => {
                            if (!isGrupo && st !== 'ocupado') return []
                            // Groups: aluno_nome always stores the full name list (linked + unmatched)
                            if (isGrupo && cell.aluno_nome) {
                              return cell.aluno_nome.split(/[,\n]/).map(n => { const parts = n.trim().split(' '); return parts[0] ?? '' }).filter(n => n.length > 0)
                            }
                            if (cell.aluno_ids && cell.aluno_ids.length > 0) {
                              return cell.aluno_ids
                                .map((id): string => { const nome = alunos.find(a => a.id === id)?.nome; return nome ? nome.split(' ')[0] ?? '' : '' })
                                .filter(n => n.length > 0)
                            }
                            return (cell.aluno_nome || '').split(/[,\n]/).map(n => { const parts = n.trim().split(' '); return parts[0] ?? '' }).filter(n => n.length > 0)
                          })()
                          const cap = cell.capacidade ?? (isGrupo ? 4 : 1)
                          const cellLabel = isGrupo
                            ? resolvedNames.length === 0
                              ? `Grupo (0/${cap})`
                              : resolvedNames.length === 1
                              ? `${resolvedNames[0]} (1/${cap})`
                              : resolvedNames.length === 2
                              ? `${resolvedNames[0]}, ${resolvedNames[1]}`
                              : `${resolvedNames[0]}, ${resolvedNames[1]} +${resolvedNames.length - 2}`
                            : st === 'ocupado'
                            ? (cell.aluno_ids?.length === 1
                                ? alunos.find(a => a.id === cell.aluno_ids![0])?.nome || cell.aluno_nome || 'Ocupado'
                                : cell.aluno_nome || 'Ocupado')
                            : ''
                          const cellTooltip = isGrupo
                            ? `Grupo (${resolvedNames.length}/${cap}): ${resolvedNames.join(', ') || 'sem alunos'} — duplo-clique para editar`
                            : st === 'ocupado'
                            ? `${cell.aluno_nome || 'Ocupado'} — duplo-clique para editar`
                            : st === 'indisponivel'
                            ? 'Indisponível'
                            : 'Disponível — duplo-clique para editar'
                          const cellStyle = isSelected
                            ? isGrupo
                              ? 'bg-purple-200 border-purple-500 text-purple-900 ring-2 ring-purple-400'
                              : STATUS_STYLES_SELECTED[st]
                            : isGrupo
                              ? 'bg-purple-100 border-purple-300 text-purple-800 hover:opacity-75'
                              : STATUS_STYLES[st] + ' hover:opacity-75'
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
                                className={`w-full h-7 px-1 rounded border text-[11px] font-medium truncate transition-all cursor-pointer select-none ${cellStyle}`}
                                title={cellTooltip}
                              >
                                {isSelected && <Check className="w-3 h-3 inline mr-0.5" />}
                                {cellLabel}
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
              onClick={() => {
                alert('Para marcar como ocupado, edite cada horário individualmente e vincule o aluno.')
              }}
              disabled={bulkSaving}
              className="flex items-center gap-1.5 bg-sky-600/50 text-white/70 px-3 py-1.5 rounded-lg text-sm font-medium cursor-not-allowed"
              title="Edite individualmente para vincular aluno"
            >
              <Clock className="w-3.5 h-3.5" />
              Ocupado
            </button>
          </div>

          <div className="h-6 w-px bg-gray-600" />

          <button
            onClick={openDisparo}
            disabled={bulkSaving}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            title="Enviar mensagem WhatsApp para alunos dos horários selecionados"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Disparo
          </button>

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

      {/* Disparo popup */}
      {disparoOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div ref={disparoRef} className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-violet-500" />
                <h3 className="font-semibold text-gray-900">Enviar Disparo WhatsApp</h3>
              </div>
              <button onClick={() => setDisparoOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Recipients */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Destinatários ({disparoContatos.filter(c => c.selected && c.telefone).length} selecionados)
                  </label>
                  <div className="flex gap-2 text-xs">
                    <button
                      onClick={() => setDisparoContatos(prev => prev.map(c => ({ ...c, selected: !!c.telefone })))}
                      className="text-brand-600 hover:underline"
                    >Todos</button>
                    <span className="text-gray-300">|</span>
                    <button
                      onClick={() => setDisparoContatos(prev => prev.map(c => ({ ...c, selected: false })))}
                      className="text-gray-500 hover:underline"
                    >Nenhum</button>
                  </div>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {disparoContatos.map((c, i) => (
                    <label
                      key={i}
                      className={`flex items-center gap-3 p-2 rounded-lg border transition-colors ${
                        c.telefone ? 'cursor-pointer' : 'cursor-default'
                      } ${
                        c.selected && c.telefone
                          ? 'border-violet-200 bg-violet-50'
                          : c.telefone
                          ? 'border-gray-200 hover:bg-gray-50'
                          : 'border-gray-100 bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={c.selected}
                        disabled={!c.telefone}
                        onChange={e => setDisparoContatos(prev =>
                          prev.map((x, j) => j === i ? { ...x, selected: e.target.checked } : x)
                        )}
                        className="rounded accent-violet-600"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{c.nome}</p>
                        <p className="text-xs text-gray-400 truncate">{c.slot}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {c.telefone ? (
                          <span className="text-xs text-gray-500 font-mono">{c.telefone}</span>
                        ) : editingPhoneIdx === i ? (
                          <div className="flex items-center gap-1" onClick={e => e.preventDefault()}>
                            <input
                              autoFocus
                              type="tel"
                              value={editingPhoneValue}
                              onChange={e => setEditingPhoneValue(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') savePhone(i); if (e.key === 'Escape') { setEditingPhoneIdx(null); setEditingPhoneValue('') } }}
                              placeholder="5555999990000"
                              className="w-36 border border-violet-300 rounded px-2 py-0.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-violet-400"
                            />
                            <button
                              onClick={() => savePhone(i)}
                              disabled={savingPhone || !editingPhoneValue.trim()}
                              className="text-xs px-2 py-0.5 bg-violet-600 text-white rounded hover:bg-violet-700 disabled:opacity-50"
                            >
                              {savingPhone ? '...' : 'OK'}
                            </button>
                            <button
                              onClick={() => { setEditingPhoneIdx(null); setEditingPhoneValue('') }}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={e => { e.preventDefault(); setEditingPhoneIdx(i); setEditingPhoneValue('') }}
                            className="flex items-center gap-1 text-xs text-amber-500 hover:text-amber-700"
                            title="Adicionar telefone"
                          >
                            <span>Sem telefone</span>
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Message */}
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
                  Mensagem
                </label>
                <textarea
                  value={disparoMensagem}
                  onChange={e => setDisparoMensagem(e.target.value)}
                  placeholder="Ex: Oi {nome}! Sua aula de {instrumento} está confirmada para amanhã 😊"
                  rows={4}
                  disabled={disparoSending || !!disparoResultado}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none"
                />
                <p className="text-xs text-gray-400 mt-0.5">
                  Variáveis: <code className="bg-gray-100 px-1 rounded">{'{nome}'}</code> · <code className="bg-gray-100 px-1 rounded">{'{nome_completo}'}</code> · <code className="bg-gray-100 px-1 rounded">{'{instrumento}'}</code>
                  <span className="float-right">{disparoMensagem.length} caracteres</span>
                </p>
                {/* Preview */}
                {disparoMensagem.includes('{') && disparoContatos.find(c => c.selected) && (() => {
                  const primeiro = disparoContatos.find(c => c.selected)!
                  return (
                    <div className="mt-1.5 p-2.5 bg-gray-50 border border-gray-200 rounded-lg">
                      <p className="text-xs text-gray-400 mb-1">Preview para <strong className="text-gray-600">{primeiro.nome}</strong>:</p>
                      <p className="text-xs text-gray-700 whitespace-pre-wrap">{interpolateDisparo(disparoMensagem, primeiro.nome, primeiro.instrumento ?? '')}</p>
                    </div>
                  )
                })()}
              </div>

              {/* Result */}
              {disparoResultado && (
                <div className={`rounded-lg p-3 text-sm font-medium ${
                  disparoResultado.erros === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                }`}>
                  ✅ Enviados: <strong>{disparoResultado.enviados}</strong>
                  {disparoResultado.erros > 0 && <> · ❌ Erros: <strong>{disparoResultado.erros}</strong></>}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setDisparoOpen(false)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
              >
                {disparoResultado ? 'Fechar' : 'Cancelar'}
              </button>
              {!disparoResultado && (
                <button
                  onClick={sendDisparo}
                  disabled={disparoSending || !disparoMensagem.trim() || disparoContatos.filter(c => c.selected && c.telefone).length === 0}
                  className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white px-4 py-1.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
                >
                  {disparoSending ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Enviar para {disparoContatos.filter(c => c.selected && c.telefone).length}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
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
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Tipo de Aula</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditTipo('individual')}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium border-2 transition-colors ${
                      editTipo === 'individual'
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    Individual
                  </button>
                  <button
                    onClick={() => setEditTipo('grupo')}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium border-2 transition-colors ${
                      editTipo === 'grupo'
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    Grupo
                  </button>
                </div>
              </div>
              <div>
                {editTipo === 'individual' ? (
                  <>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Aluno</label>
                    <div className="relative">
                      <input
                        value={editAlunoSearch || (editAlunoIds.length === 1 ? alunos.find(a => a.id === editAlunoIds[0])?.nome || '' : '')}
                        onChange={e => {
                          setEditAlunoSearch(e.target.value)
                          setEditAlunoIds([])
                          setEditShowSearch(true)
                          if (e.target.value.trim()) setEditStatus('ocupado')
                        }}
                        onFocus={() => setEditShowSearch(true)}
                        onBlur={() => setTimeout(() => setEditShowSearch(false), 150)}
                        placeholder="Buscar aluno cadastrado..."
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                        autoFocus
                      />
                      {editShowSearch && (editAlunoSearch || editCell?.aluno_nome) && (
                        <ul className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto mt-0.5">
                          {alunos
                            .filter(a => a.nome.toLowerCase().includes((editAlunoSearch || editCell?.aluno_nome || '').toLowerCase()))
                            .slice(0, 8)
                            .map(a => (
                              <li
                                key={a.id}
                                onMouseDown={(e) => {
                                  e.preventDefault()
                                  setEditAlunoIds([a.id])
                                  setEditAlunoSearch(a.nome)
                                  setEditShowSearch(false)
                                  setEditStatus('ocupado')
                                }}
                                className="px-3 py-2 hover:bg-brand-50 cursor-pointer text-sm flex items-center justify-between gap-2"
                              >
                                <span className="truncate">{a.nome}</span>
                                {a.telefone && <span className="text-xs text-gray-400 font-mono shrink-0">{a.telefone}</span>}
                              </li>
                            ))
                          }
                          {alunos.filter(a => a.nome.toLowerCase().includes((editAlunoSearch || '').toLowerCase())).length === 0 && (
                            <li className="px-3 py-2 text-sm text-gray-400">Nenhum aluno encontrado — o nome será salvo como texto</li>
                          )}
                        </ul>
                      )}
                    </div>
                    {editAlunoIds.length === 1 && (
                      <p className="text-xs text-emerald-600 mt-0.5">✓ Vinculado ao cadastro</p>
                    )}
                    {editAlunoIds.length === 0 && (editAlunoSearch || editCell?.aluno_nome) && (
                      <p className="text-xs text-amber-500 mt-0.5">⚠ Não vinculado — busque e selecione o aluno para vincular</p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-medium text-gray-600">Alunos do Grupo</label>
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <span>Vagas:</span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={editCapacidade}
                          onChange={e => setEditCapacidade(Math.max(1, +e.target.value))}
                          className="w-12 border border-gray-200 rounded px-1.5 py-0.5 text-center text-xs focus:ring-1 focus:ring-purple-400"
                        />
                        <span className="text-purple-600 font-medium">{editAlunoIds.length + editGrupoUnmatchedNames.length}/{editCapacidade}</span>
                      </div>
                    </div>
                    {/* Selected students */}
                    <div className="space-y-1 mb-2">
                      {editAlunoIds.map((id, idx) => {
                        const a = alunos.find(a => a.id === id)
                        return (
                          <div key={id} className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-lg px-2.5 py-1.5">
                            <div>
                              <span className="text-sm font-medium text-purple-900">{a?.nome || id}</span>
                              {a?.telefone && <span className="ml-2 text-xs text-gray-400 font-mono">{a.telefone}</span>}
                            </div>
                            <button onClick={() => setEditAlunoIds(prev => prev.filter((_, i) => i !== idx))}>
                              <X className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                            </button>
                          </div>
                        )
                      })}
                      {/* Unmatched names (sem vínculo) */}
                      {editGrupoUnmatchedNames.map((item, i) => (
                        <div key={`unmatched-${i}`} className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-sm text-amber-800 font-medium truncate">{item.nome}</span>
                            <span className="text-xs text-amber-500 shrink-0">não vinculado</span>
                          </div>
                          <button onClick={() => setEditGrupoUnmatchedNames(prev => prev.filter((_, j) => j !== i))}>
                            <X className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                          </button>
                        </div>
                      ))}
                      {Array.from({ length: Math.max(0, editCapacidade - editAlunoIds.length - editGrupoUnmatchedNames.length) }).map((_, i) => (
                        <div key={`empty-${i}`} className="border border-dashed border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-300 italic">
                          Vaga livre
                        </div>
                      ))}
                    </div>
                    {/* Add student search */}
                    {editAlunoIds.length < editCapacidade && (
                      <div className="relative">
                        <input
                          value={editAlunoSearch}
                          onChange={e => { setEditAlunoSearch(e.target.value); setEditShowSearch(true) }}
                          onFocus={() => setEditShowSearch(true)}
                          onBlur={() => setTimeout(() => setEditShowSearch(false), 150)}
                          placeholder="Adicionar aluno ao grupo..."
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          autoComplete="off"
                        />
                        {editShowSearch && editAlunoSearch && (
                          <ul className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg max-h-36 overflow-y-auto mt-0.5">
                            {alunos
                              .filter(a => a.nome.toLowerCase().includes(editAlunoSearch.toLowerCase()) && !editAlunoIds.includes(a.id))
                              .slice(0, 6)
                              .map(a => (
                                <li
                                  key={a.id}
                                  onMouseDown={(e) => {
                                    e.preventDefault()
                                    setEditAlunoIds(prev => [...prev, a.id])
                                    setEditAlunoSearch('')
                                    setEditShowSearch(false)
                                    setEditStatus('ocupado')
                                  }}
                                  className="px-3 py-1.5 hover:bg-purple-50 cursor-pointer text-sm flex items-center justify-between"
                                >
                                  <span>{a.nome}</span>
                                  {a.modalidade_preferida && (
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${a.modalidade_preferida === 'grupo' ? 'bg-purple-100 text-purple-600' : 'bg-blue-50 text-blue-500'}`}>
                                      {a.modalidade_preferida}
                                    </span>
                                  )}
                                </li>
                              ))
                            }
                            <li
                              onMouseDown={(e) => {
                                e.preventDefault()
                                setEditGrupoUnmatchedNames(prev => [...prev, { nome: editAlunoSearch.trim(), telefone: '' }])
                                setEditAlunoSearch('')
                                setEditShowSearch(false)
                                setEditStatus('ocupado')
                              }}
                              className="px-3 py-1.5 cursor-pointer text-sm text-brand-600 hover:bg-brand-50 border-t border-gray-100"
                            >
                              + Adicionar "{editAlunoSearch}" sem vínculo
                            </li>
                          </ul>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={handleDelete}
                className="flex items-center gap-1 text-red-500 hover:text-red-700 text-sm transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir
              </button>
              <div className="flex items-center gap-2">
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
        </div>
      )}

      {/* Novo Horário modal */}
      {novoHorario && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="font-semibold text-gray-900 text-sm">
                Novo Horário — {professores.find(p => p.id === novoHorario.profId)?.nome?.split(' ')[0]}
              </h3>
              <button onClick={() => setNovoHorario(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Dia da semana</label>
                  <select
                    value={novoDia}
                    onChange={e => setNovoDia(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  >
                    {DIAS_SEMANA.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Horário</label>
                  <input
                    type="time"
                    value={novaHora}
                    onChange={e => setNovaHora(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Status</label>
                <div className="flex gap-2">
                  {(['disponivel', 'ocupado', 'indisponivel'] as Status[]).map(st => (
                    <button
                      key={st}
                      onClick={() => setNovoStatus(st)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border-2 transition-colors ${
                        novoStatus === st
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
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Tipo de Aula</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setNovoTipo('individual')}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium border-2 transition-colors ${
                      novoTipo === 'individual'
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    Individual
                  </button>
                  <button
                    onClick={() => setNovoTipo('grupo')}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium border-2 transition-colors ${
                      novoTipo === 'grupo'
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    Grupo
                  </button>
                </div>
              </div>
              <div>
                {novoTipo === 'individual' ? (
                  <>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Aluno</label>
                    <div className="relative">
                      <input
                        value={novoAlunoSearch || (novoAlunoIds.length === 1 ? alunos.find(a => a.id === novoAlunoIds[0])?.nome || '' : '')}
                        onChange={e => {
                          setNovoAlunoSearch(e.target.value)
                          setNovoAlunoIds([])
                          setNovoShowSearch(true)
                          if (e.target.value.trim()) setNovoStatus('ocupado')
                        }}
                        onFocus={() => setNovoShowSearch(true)}
                        onBlur={() => setTimeout(() => setNovoShowSearch(false), 150)}
                        placeholder="Buscar aluno cadastrado..."
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                      />
                      {novoShowSearch && novoAlunoSearch && (
                        <ul className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto mt-0.5">
                          {alunos
                            .filter(a => a.nome.toLowerCase().includes(novoAlunoSearch.toLowerCase()))
                            .slice(0, 8)
                            .map(a => (
                              <li
                                key={a.id}
                                onMouseDown={(e) => {
                                  e.preventDefault()
                                  setNovoAlunoIds([a.id])
                                  setNovoAlunoSearch(a.nome)
                                  setNovoShowSearch(false)
                                  setNovoStatus('ocupado')
                                }}
                                className="px-3 py-2 hover:bg-brand-50 cursor-pointer text-sm flex items-center justify-between gap-2"
                              >
                                <span className="truncate">{a.nome}</span>
                                {a.telefone && <span className="text-xs text-gray-400 font-mono shrink-0">{a.telefone}</span>}
                              </li>
                            ))
                          }
                          {alunos.filter(a => a.nome.toLowerCase().includes(novoAlunoSearch.toLowerCase())).length === 0 && (
                            <li className="px-3 py-2 text-sm text-gray-400">Nenhum aluno encontrado</li>
                          )}
                        </ul>
                      )}
                    </div>
                    {novoAlunoIds.length === 1 && (
                      <p className="text-xs text-emerald-600 mt-0.5">✓ Vinculado ao cadastro</p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-medium text-gray-600">Alunos do Grupo</label>
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <span>Vagas:</span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={novoCapacidade}
                          onChange={e => setNovoCapacidade(Math.max(1, +e.target.value))}
                          className="w-12 border border-gray-200 rounded px-1.5 py-0.5 text-center text-xs focus:ring-1 focus:ring-purple-400"
                        />
                        <span className="text-purple-600 font-medium">{novoAlunoIds.length + novoGrupoUnmatchedNames.length}/{novoCapacidade}</span>
                      </div>
                    </div>
                    <div className="space-y-1 mb-2">
                      {novoAlunoIds.map((id, idx) => {
                        const a = alunos.find(a => a.id === id)
                        return (
                          <div key={id} className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-lg px-2.5 py-1.5">
                            <div>
                              <span className="text-sm font-medium text-purple-900">{a?.nome || id}</span>
                              {a?.telefone && <span className="ml-2 text-xs text-gray-400 font-mono">{a.telefone}</span>}
                            </div>
                            <button onClick={() => setNovoAlunoIds(prev => prev.filter((_, i) => i !== idx))}>
                              <X className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                            </button>
                          </div>
                        )
                      })}
                      {novoGrupoUnmatchedNames.map((item, i) => (
                        <div key={`unmatched-${i}`} className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-sm text-amber-800 font-medium truncate">{item.nome}</span>
                            <span className="text-xs text-amber-500 shrink-0">não vinculado</span>
                          </div>
                          <button onClick={() => setNovoGrupoUnmatchedNames(prev => prev.filter((_, j) => j !== i))}>
                            <X className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                          </button>
                        </div>
                      ))}
                      {Array.from({ length: Math.max(0, novoCapacidade - novoAlunoIds.length - novoGrupoUnmatchedNames.length) }).map((_, i) => (
                        <div key={`empty-${i}`} className="border border-dashed border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-300 italic">
                          Vaga livre
                        </div>
                      ))}
                    </div>
                    {novoAlunoIds.length + novoGrupoUnmatchedNames.length < novoCapacidade && (
                      <div className="relative">
                        <input
                          value={novoAlunoSearch}
                          onChange={e => { setNovoAlunoSearch(e.target.value); setNovoShowSearch(true) }}
                          onFocus={() => setNovoShowSearch(true)}
                          onBlur={() => setTimeout(() => setNovoShowSearch(false), 150)}
                          placeholder="Adicionar aluno ao grupo..."
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          autoComplete="off"
                        />
                        {novoShowSearch && novoAlunoSearch && (
                          <ul className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg max-h-36 overflow-y-auto mt-0.5">
                            {alunos
                              .filter(a => a.nome.toLowerCase().includes(novoAlunoSearch.toLowerCase()) && !novoAlunoIds.includes(a.id))
                              .slice(0, 6)
                              .map(a => (
                                <li
                                  key={a.id}
                                  onMouseDown={(e) => {
                                    e.preventDefault()
                                    setNovoAlunoIds(prev => [...prev, a.id])
                                    setNovoAlunoSearch('')
                                    setNovoShowSearch(false)
                                    setNovoStatus('ocupado')
                                  }}
                                  className="px-3 py-1.5 hover:bg-purple-50 cursor-pointer text-sm flex items-center justify-between"
                                >
                                  <span>{a.nome}</span>
                                  {a.modalidade_preferida && (
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${a.modalidade_preferida === 'grupo' ? 'bg-purple-100 text-purple-600' : 'bg-blue-50 text-blue-500'}`}>
                                      {a.modalidade_preferida}
                                    </span>
                                  )}
                                </li>
                              ))
                            }
                            <li
                              onMouseDown={(e) => {
                                e.preventDefault()
                                setNovoGrupoUnmatchedNames(prev => [...prev, { nome: novoAlunoSearch.trim(), telefone: '' }])
                                setNovoAlunoSearch('')
                                setNovoShowSearch(false)
                                setNovoStatus('ocupado')
                              }}
                              className="px-3 py-1.5 cursor-pointer text-sm text-brand-600 hover:bg-brand-50 border-t border-gray-100"
                            >
                              + Adicionar "{novoAlunoSearch}" sem vínculo
                            </li>
                          </ul>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setNovoHorario(null)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveNovo}
                disabled={novoSaving}
                className="flex items-center gap-1.5 bg-brand-500 text-white px-4 py-1.5 rounded-lg hover:bg-brand-600 transition-colors disabled:opacity-50 font-medium text-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                {novoSaving ? 'Salvando...' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
