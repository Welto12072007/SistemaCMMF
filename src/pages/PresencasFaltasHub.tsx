import { useState } from 'react'
import { ClipboardCheck, UserX } from 'lucide-react'
import Faltas from './Faltas'
import FaltasProfessor from './FaltasProfessor'

type Tab = 'alunos' | 'professores'

export default function PresencasFaltasHub() {
  const [aba, setAba] = useState<Tab>('alunos')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Presenças & Faltas</h1>
        <p className="text-sm text-gray-500 mt-1">Controle de presença de alunos e ausências de professores</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setAba('alunos')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            aba === 'alunos'
              ? 'border-brand-500 text-brand-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <ClipboardCheck className="w-4 h-4" />
          Alunos
        </button>
        <button
          onClick={() => setAba('professores')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            aba === 'professores'
              ? 'border-brand-500 text-brand-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <UserX className="w-4 h-4" />
          Professores
        </button>
      </div>

      <div>
        {aba === 'alunos' && <Faltas />}
        {aba === 'professores' && <FaltasProfessor />}
      </div>
    </div>
  )
}
