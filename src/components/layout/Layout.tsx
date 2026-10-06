import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import NotificacoesSino from '@/components/gestao/NotificacoesSino'

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="min-h-screen">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <NotificacoesSino />
      <main className={`p-6 transition-all duration-300 ${collapsed ? 'ml-16' : 'ml-64'}`}>
        <Outlet />
      </main>
    </div>
  )
}

