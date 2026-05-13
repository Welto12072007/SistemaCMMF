import { lazy, Suspense } from 'react'

const Contatos = lazy(() => import('./Contatos'))

export default function ContatosHub() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-gray-400 text-sm">Carregando...</div>}>
      <Contatos />
    </Suspense>
  )
}
