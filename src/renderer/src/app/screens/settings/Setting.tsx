import { AppWrapper } from '@renderer/app/layout/AppWrapper.js'
import { useEffect, useState } from 'react'

export const Setting = () => {
  const [agentName] = useState<string>(() => localStorage.getItem('agent_name') || 'Agent')
  const agentEmail =
    localStorage.getItem('user_email') ||
    `${agentName.toLowerCase().replace(/\s+/g, '')}.agent@whatshire.co.za`

  const [ownerEmail, setOwnerEmail] = useState<string>(
    () => localStorage.getItem('owner_email') || ''
  )
  const [ownerPhone, setOwnerPhone] = useState<string>(
    () => localStorage.getItem('owner_phone') || ''
  )
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const isActivated = Boolean(ownerEmail.trim() && ownerPhone.trim())
  const [isConnected, setIsConnected] = useState<boolean>(false)
  const [isConnecting, setIsConnecting] = useState<boolean>(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const userId = localStorage.getItem('client_uuid') || agentEmail

  useEffect(() => {
    let isMounted = true
    const checkCalendarAuth = async () => {
      try {
        if (window.calendarAuth) {
          const status = await window.calendarAuth.checkStatus(userId)
          if (isMounted) {
            setIsConnected(status.authenticated)
          }
        }
      } catch (err) {
        console.error('Error checking Google Calendar auth status:', err)
      }
    }
    checkCalendarAuth()
    return () => {
      isMounted = false
    }
  }, [])

  const handleSaveCommunication = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanOwnerEmail = ownerEmail.trim()
    const cleanOwnerPhone = ownerPhone.trim()
    localStorage.setItem('owner_email', cleanOwnerEmail)
    localStorage.setItem('owner_phone', cleanOwnerPhone)

    if (window.agent?.initMapping) {
      await window.agent.initMapping({
        agentEmail,
        userId,
        userEmail: cleanOwnerEmail,
        userPhone: cleanOwnerPhone,
        agentName
      })
    }

    setSaveMessage('Your contact details saved successfully!')
    setTimeout(() => setSaveMessage(null), 3000)
  }

  const handleConnect = async () => {
    setIsConnecting(true)
    setAuthError(null)
    try {
      if (!window.calendarAuth) {
        throw new Error('CalendarAuth IPC API not available')
      }
      const res = await window.calendarAuth.connect(userId)
      if (res.success) {
        setIsConnected(true)
      } else {
        setAuthError(res.error || 'Failed to connect Google Calendar')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setAuthError(msg)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    setIsConnecting(true)
    setAuthError(null)
    try {
      if (window.calendarAuth) {
        await window.calendarAuth.disconnect(userId)
        setIsConnected(false)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setAuthError(msg)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleResetOnboarding = async () => {
    const confirmed = window.confirm(
      'Reset this desktop and return to onboarding? Your local agent name, email, contact details, and client ID will be cleared.'
    )
    if (!confirmed) return

 
    try {
      if (isConnected && window.calendarAuth) await window.calendarAuth.disconnect(userId)
    } catch (err) {
      console.warn('Could not disconnect calendar during reset:', err)
    }

     localStorage.clear()

    window.windowControls.close()
  }

  return (
    <AppWrapper>
      <div
        style={{
          padding: '20px'
        }}
      >
        <h1>Settings</h1>
        <p className="text-[12px] font-light">
          {agentName || 'Agent'} activation status:{' '}
          <span
            className={`font-semibold text-[10px] ${isActivated ? 'text-green-300' : 'text-red-400'}`}
          >
            {isActivated ? 'Activated' : 'Not Activated'}
          </span>
        </p>
        <p className="text-[10px] text-gray-400">
          {!isActivated
            ? 'Add your personal email and WhatsApp number so the agent can reach you.'
            : 'Your contact details are set — the agent can reach you via email and WhatsApp.'}
        </p>

        {/* Agent Profile Card */}
        <div
          style={{
            padding: '10px'
          }}
          className="mt-4 p-4  flex flex-col gap-2"
        >
          <div className="flex items-center gap-3 ">
            <div className="w-9 h-9 rounded-full bg-[#ecee81]/20 border border-[#ecee81]/30 flex items-center justify-center text-[#aeaf74] font-bold text-[15px]">
              {agentName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-[13px] font-semibold text-secondary leading-tight">{agentName}</p>
              <p className="text-[10px] text-secondary/50 uppercase tracking-wide">AI Agent</p>
            </div>
          </div>
          <div style={{ paddingTop: '6px' }} className="  pt-2 flex flex-col gap-1.5 text-[11px]">
            <div className="flex items-center gap-2 text-secondary/60">
              <span className="text-secondary/40 w-12 shrink-0">Email</span>
              <span className="text-[#88894d] font-medium truncate">{agentEmail}</span>
            </div>
            <div className="flex items-center gap-2 text-secondary/60">
              <span className="text-secondary/40 w-12 shrink-0">Phone</span>
              <span className="text-[#88894d] font-medium">
                {localStorage.getItem('user_phone') || '0836882908'}
              </span>
            </div>
          </div>
        </div>

        {/* Google Calendar Section */}
        <div
          style={{
            padding: '10px'
          }}
          className="flex flex-col text-[13px] gap-2 pt-4"
        >
          <p className="font-semibold">Google Calendar</p>

          {authError && <p className="text-red-400 text-[11px] mt-1">{authError}</p>}

          <div className="mt-2">
            {!isConnected ? (
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                style={{
                  padding: '8px 14px',
                  fontSize: '12px'
                }}
                className="bg-[#514f35] text-white rounded-sm hover:bg-[#3a3826] disabled:opacity-50 cursor-pointer"
              >
                {isConnecting ? 'Opening Auth Window...' : 'Connect Google Calendar'}
              </button>
            ) : (
              <button
                onClick={handleDisconnect}
                disabled={isConnecting}
                style={{
                  padding: '8px 14px',
                  fontSize: '12px'
                }}
                className="bg-red-800 text-white rounded-sm hover:bg-red-900 disabled:opacity-50 cursor-pointer"
              >
                {isConnecting ? 'Disconnecting...' : 'Disconnect Calendar'}
              </button>
            )}
          </div>
        </div>

        <form onSubmit={handleSaveCommunication}>
          <div
            style={{
              padding: '10px'
            }}
            className="flex flex-col text-[13px] pt-4"
          >
            <p className="font-semibold">Your Contact Details</p>
            <p className="text-[11px] text-gray-400 mt-1">
              How the agent can reach you — your personal email and WhatsApp number.
            </p>
            <div
              style={{
                marginTop: '15px'
              }}
              className="flex flex-col gap-2"
            >
              <label htmlFor="ownerEmail" className="text-[12px]">
                Your Email Address
              </label>
              <input
                style={{
                  width: '250px',
                  padding: '6px'
                }}
                type="email"
                placeholder="e.g. yourname@gmail.com"
                id="ownerEmail"
                name="ownerEmail"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                className="border-b focus:outline-none border-gray-500 bg-transparent text-white px-2 py-1"
                required
              />
            </div>
            <div
              style={{
                marginTop: '20px'
              }}
              className="flex flex-col gap-2"
            >
              <label htmlFor="ownerPhone" className="text-[12px]">
                Your WhatsApp Number
              </label>
              <input
                style={{
                  width: '250px',
                  padding: '6px'
                }}
                type="tel"
                placeholder="e.g. +27831234567"
                id="ownerPhone"
                name="ownerPhone"
                value={ownerPhone}
                onChange={(e) => setOwnerPhone(e.target.value)}
                className="border-b focus:outline-none border-gray-500 bg-transparent text-white px-2 py-1"
                required
              />
            </div>
            {saveMessage && (
              <p className="text-green-400 text-[11px] mt-2 font-medium">{saveMessage}</p>
            )}
            <button
              type="submit"
              style={{
                marginTop: '20px',
                padding: '8px 16px',
                fontSize: '12px',
                width: '120px'
              }}
              className="bg-[#514f35] text-white rounded-sm hover:bg-[#3a3826] cursor-pointer font-medium"
            >
              Save Details
            </button>
          </div>
        </form>

        <div
          style={{
            padding: '10px'
          }}
          className="flex flex-col gap-3 text-[12px]  pt-4"
        >
          <div className="mt-3">
            <button
              style={{ padding: '8px' }}
              type="button"
              onClick={handleResetOnboarding}
              className="bg-red-900/70 text-white rounded-sm hover:bg-red-800 px-3 py-2 text-[12px] cursor-pointer"
            >
              Reset Onboarding
            </button>
          </div>
        </div>
      </div>
    </AppWrapper>
  )
}
