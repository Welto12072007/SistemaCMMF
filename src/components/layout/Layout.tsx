import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function Layout() {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="ml-64 p-6 transition-all duration-300">
        <Outlet />
      </main>
    </div>
  )
}
