import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { MessageCircle, Briefcase, Calendar, Settings } from 'lucide-react'
import logo from '../../assets/logo.png'
import { useDispatch } from 'react-redux'
import { setSelectedTab, tabState } from '@renderer/app/store/tabSlice/slice.tab.js'
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
  const dispatch = useDispatch()

  return (
    <div className="w-screen h-screen overflow-hidden text-secondary font-poppins flex">
      {/* Sidebar */}
      <div className="h-full bg-[#323300] flex flex-col w-[8%] text-secondary">
        {/* Logo */}
        <div className="p-4 h-[55px] flex items-center justify-center cursor-pointer transition-all">
          <img src={logo} alt="Logo" className="w-6 h-6" />
        </div>

        {/* Nav items */}
        <div className="flex flex-col gap-1 flex-1 pt-2">
          {NAV_ITEMS.map(({ icon, path, label }) => {
            const isActive = location.pathname === path
            return (
              <button
                key={path}
                onClick={() => {
                  navigate(path)
                  dispatch(setSelectedTab(path.replace('/', '') as tabState))
                }}
                title={label}
                className="p-4 h-[45px] flex items-center justify-center cursor-pointer transition-all relative group"
                style={{
                  color: isActive ? '#bfbdb8' : 'rgba(191,189,184,0.4)',
                  background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
                  borderLeft: isActive ? '2px solid rgba(191,189,184,0.5)' : '2px solid transparent'
                }}
              >
                {icon}
              </button>
            )
          })}
        </div>
      </div>

      {/* Main content area */}
      <div className="p-0 h-full w-full overflow-hidden">{children ?? <Outlet />}</div>
    </div>
  )
}
