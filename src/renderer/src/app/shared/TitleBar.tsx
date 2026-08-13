import { RootState } from '@renderer/app/store/store.js'
import { Minus, X } from 'lucide-react'
import { useSelector } from 'react-redux'
export const TitleBar = () => {
  const tab = useSelector((state: RootState) => state.tab.selectedTab)
  console.log('tab', tab === 'chat')
  const isOnboarding = tab === 'onboarding'
  const hasSessions = tab === 'chat'
  return (
    <div
      style={{ backgroundColor: hasSessions ? '#1c1d04' : '#2a2c01' }}
      className="w-full titlebar relative  "
    >
      {!isOnboarding && (
        <div className="absolute left-0 z-50  h-full top-0 w-[7.4%] bg-[#323300]"></div>
      )}
      {hasSessions && <div className="w-[29.10%] bg-[#2a2c01]  h-full"></div>}
      <p
        style={{ marginLeft: !isOnboarding ? '7.4%' : '0', padding: '10px' }}
        className="text-[14px] flex-1 text-center   text-secondary"
      >
        mini
      </p>
      <div style={{ padding: '10px' }} className="flex items-center window-controls   gap-4 ">
        <div className="   p-2">
          <button
            className="cursor-pointer"
            onClick={() => {
              window.windowControls.minimize()
            }}
          >
            <Minus className="transition-all hover:scale-80 scale-100" size={16} />
          </button>
        </div>

        <div className=" p-2">
          <button
            className="cursor-pointer"
            onClick={() => {
              window.windowControls.close()
            }}
          >
            <X className="transition-all hover:scale-80 scale-100" size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
