import {  useState } from 'react'
import {
  ChevronRight,
} from 'lucide-react'
export const AgentNameScreen = () => {
  const [agentName, setAgentName] = useState('')
  const cleanName = agentName.trim()
  const derivedEmail = cleanName ? `${cleanName}@whatshire.co.za` : ''
  const defaultPhone = '0836882908'

  const handleContinue = async () => {
    localStorage.setItem('agent_name', cleanName)
    localStorage.setItem('agent_email', derivedEmail)
    localStorage.setItem('agent_phone', defaultPhone)
    localStorage.setItem('has_onboarded', 'true')
  }

  return (
    <div className="w-screen h-screen p-4 text-text  relative bg-primary flex flex-col items-center justify-center gap-6">
      <div>
        <p className="text-[93px] lg:text-[120px] text-center font-semibold">Hi</p>
        <p className="text-[14px] text-center -mt-20">im very excited to work with you boss</p>
      </div>
      <div>
        <input
          type="text"
          placeholder="Give me a name"
          className="w-[400px] h-[50px] text-text focus:outline-none p-2 text-center bg-transparent text-[18px] placeholder:text-opacity-90 border-b border-text/30 focus:border-text transition-colors"
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
        />
      </div>

      {agentName.length > 3 && (
        <div className="absolute bottom-5 right-5 flex items-center justify-center gap-2">
          <button
            className="rounded-full h-11 w-11 bg-text text-primary border-white/15 border flex items-center justify-center gap-2 hover:scale-105 transition-transform"
            onClick={handleContinue}
          >
            <ChevronRight size={30} />
          </button>
        </div>
      )}
    </div>
  )
}