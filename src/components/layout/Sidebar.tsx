import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  PhoneForwarded,
  Send,
  BarChart3,
  CalendarClock,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useState } from 'react'
import logoIcon from '../../assets/logos/cmmf-icon-branco.png'
import logoHorizontal from '../../assets/logos/cmmf-logo-horizontal-branco.png'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/contatos', label: 'Contatos', icon: Users },
  { to: '/aulas-experimentais', label: 'Aulas Experimentais', icon: GraduationCap },
  { to: '/matriculas', label: 'Matrículas', icon: BookOpen },
  { to: '/followup', label: 'Follow-up', icon: PhoneForwarded },
  { to: '/horarios', label: 'Horários', icon: CalendarClock },
  { to: '/disparos', label: 'Disparos', icon: Send },
  { to: '/relatorios', label: 'Relatórios', icon: BarChart3 },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-sidebar-bg text-white flex flex-col transition-all duration-300 z-50 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Logo */}
      <div className="flex items-center justify-center px-3 py-4 border-b border-white/10">
        {collapsed ? (
          <img
            src={logoIcon}
            alt="CMMF"
            className="w-10 h-10 object-contain"
          />
        ) : (
          <img
            src={logoHorizontal}
            alt="CMMF - Centro de Música Murilo Finger"
            className="w-full h-10 object-contain"
          />
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4">
        <p className={`text-xs text-white/40 uppercase tracking-wider mb-3 ${collapsed ? 'text-center' : 'px-3'}`}>
          {collapsed ? '•••' : 'Menu Principal'}
        </p>
        <ul className="space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-brand-500 text-white'
                      : 'text-white/70 hover:bg-sidebar-hover hover:text-white'
                  } ${collapsed ? 'justify-center' : ''}`
                }
                title={label}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span className="text-sm">{label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Settings + Footer */}
      <div className="px-2 pb-4 border-t border-white/10 pt-4">
        <NavLink
          to="/configuracoes"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
              isActive
                ? 'bg-brand-500 text-white'
                : 'text-white/70 hover:bg-sidebar-hover hover:text-white'
            } ${collapsed ? 'justify-center' : ''}`
          }
          title="Configurações"
        >
          <Settings className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="text-sm">Configurações</span>}
        </NavLink>

        {!collapsed && (
          <p className="text-xs text-white/30 italic text-center mt-4 px-3">
            "Criando harmonia, transformando vidas."
          </p>
        )}
      </div>

      {/* Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-8 bg-sidebar-bg border border-white/20 rounded-full w-6 h-6 flex items-center justify-center hover:bg-sidebar-hover transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3 text-white/70" />
        ) : (
          <ChevronLeft className="w-3 h-3 text-white/70" />
        )}
      </button>
    </aside>
  )
}
