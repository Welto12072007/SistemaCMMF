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
  DollarSign,
  Library,
  Tv,
  FileText,
  ScrollText,
  UserCheck,
  LogOut,
  ClipboardCheck,
  CalendarCheck,
  Calendar,
} from 'lucide-react'
import { useAuth, type UserRole } from '@/contexts/AuthContext'
import logoIcon from '../../assets/icons/4.png.png'
import logoHorizontal from '../../assets/logos/cmmf-logo-horizontal-branco.png'

interface NavSection {
  title: string
  roles: UserRole[]
  items: { to: string; label: string; icon: typeof LayoutDashboard; roles: UserRole[] }[]
}

const sections: NavSection[] = [
  {
    title: 'Menu Principal',
    roles: ['admin', 'recepcao', 'professor', 'aluno'],
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'recepcao', 'professor'] },
      { to: '/contatos', label: 'Contatos', icon: Users, roles: ['admin', 'recepcao'] },
      { to: '/aulas-experimentais', label: 'Aulas Experimentais', icon: GraduationCap, roles: ['admin', 'recepcao'] },
      { to: '/usuarios', label: 'Usuários', icon: UserCheck, roles: ['admin', 'recepcao'] },
      { to: '/followup', label: 'Follow-up', icon: PhoneForwarded, roles: ['admin', 'recepcao'] },
      { to: '/horarios', label: 'Horários', icon: CalendarClock, roles: ['admin', 'recepcao', 'professor'] },
      { to: '/presencas', label: 'Presenças', icon: ClipboardCheck, roles: ['admin', 'recepcao', 'professor'] },
      { to: '/portal-aluno', label: 'Minhas Aulas', icon: Calendar, roles: ['aluno'] },
    ],
  },
  {
    title: 'Financeiro',
    roles: ['admin', 'recepcao'],
    items: [
      { to: '/financeiro', label: 'Financeiro', icon: DollarSign, roles: ['admin'] },
      { to: '/mensalidades', label: 'Mensalidades', icon: DollarSign, roles: ['admin', 'recepcao'] },
    ],
  },
  {
    title: 'Comunicação',
    roles: ['admin', 'recepcao'],
    items: [
      { to: '/disparos', label: 'Disparos', icon: Send, roles: ['admin', 'recepcao'] },
      { to: '/disparos-programados', label: 'Programados', icon: CalendarCheck, roles: ['admin'] },
      { to: '/relatorios', label: 'Relatórios', icon: BarChart3, roles: ['admin', 'recepcao'] },
    ],
  },
  {
    title: 'Conteúdo',
    roles: ['admin', 'recepcao', 'professor', 'aluno'],
    items: [
      { to: '/biblioteca', label: 'Biblioteca', icon: Library, roles: ['admin', 'recepcao', 'professor', 'aluno'] },
      { to: '/fingertv', label: 'FingerTV', icon: Tv, roles: ['admin', 'recepcao', 'professor', 'aluno'] },
      { to: '/material-apoio', label: 'Material de Apoio', icon: FileText, roles: ['admin', 'professor', 'aluno'] },
    ],
  },
  {
    title: 'Sistema',
    roles: ['admin'],
    items: [
      { to: '/logs', label: 'Controle de Logs', icon: ScrollText, roles: ['admin'] },
    ],
  },
]

interface SidebarProps {
  collapsed: boolean
  setCollapsed: (v: boolean) => void
}

export default function Sidebar({ collapsed, setCollapsed }: SidebarProps) {
  const { perfil, signOut, hasRole } = useAuth()
  const userRole = perfil?.role ?? 'aluno'

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
      <nav className="flex-1 px-2 py-4 overflow-y-auto">
        {sections.map((section) => {
          // Only show sections relevant to user's role
          if (!section.roles.includes(userRole)) return null
          const visibleItems = section.items.filter(item => item.roles.includes(userRole))
          if (visibleItems.length === 0) return null

          return (
            <div key={section.title} className="mb-4">
              <p className={`text-xs text-white/40 uppercase tracking-wider mb-2 ${collapsed ? 'text-center' : 'px-3'}`}>
                {collapsed ? '•' : section.title}
              </p>
              <ul className="space-y-0.5">
                {visibleItems.map(({ to, label, icon: Icon }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={to === '/'}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
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
            </div>
          )
        })}
      </nav>

      {/* Settings + Footer */}
      <div className="px-2 pb-4 border-t border-white/10 pt-4">
        {hasRole('admin') && (
          <NavLink
            to="/configuracoes"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
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
        )}

        <button
          onClick={signOut}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-white/50 hover:bg-red-500/20 hover:text-red-300 w-full mt-1 ${collapsed ? 'justify-center' : ''}`}
          title="Sair"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="text-sm">Sair</span>}
        </button>

        {!collapsed && perfil && (
          <div className="mt-3 px-3">
            <p className="text-xs text-white/50 truncate">{perfil.nome}</p>
            <p className="text-xs text-white/30 capitalize">{perfil.role}</p>
          </div>
        )}

        {!collapsed && (
          <p className="text-xs text-white/30 italic text-center mt-3 px-3">
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
