import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Astroid, MessageCircle, Briefcase, Calendar, Settings } from 'lucide-react'

type Props = {
  children?: React.ReactNode
}

interface NavItem {
  icon: React.ReactNode
  path: string
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { icon: <MessageCircle size={18} />, path: '/chat', label: 'Chat' },
  { icon: <Briefcase size={18} />, path: '/platform', label: 'Platform' },
  { icon: <Calendar size={18} />, path: '/calendar', label: 'Calendar' },
  { icon: <Settings size={18} />, path: '/settings', label: 'Settings' }
]

export const AppWrapper = ({ children }: Props) => {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <div className="w-screen h-screen overflow-hidden text-text font-poppins flex">
  
      <div className="h-full bg-tertiary flex flex-col w-[8%] text-secondary">
        <div className="p-4 h-[55px] flex items-center justify-center cursor-pointer transition-all">
          <Astroid className="text-text/65" size={20} />
        </div>
        <div className="flex flex-col gap-1 flex-1 pt-2">
          {NAV_ITEMS.map(({ icon, path, label }) => {
            const isActive = location.pathname === path
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                title={label}
                className="p-4 h-[45px] flex items-center justify-center cursor-pointer transition-all relative group"
                style={{
                  color: isActive ? '#bfbdb8' : 'rgba(191,189,184,0.4)',
                  background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
                  borderLeft: isActive ? '2px solid rgba(191,189,184,0.5)' : '2px solid transparent'
                }}
              >
                {icon}
                {/* Tooltip */}
                <span
                  className="absolute left-full ml-2 px-2 py-1 text-[10px] rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50"
                  style={{ background: '#323300', color: '#bfbdb8', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  {label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="p-0 h-full w-full overflow-hidden">
        {children ?? <Outlet />}
      </div>
    </div>
  )
}
