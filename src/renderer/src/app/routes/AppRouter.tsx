import { DesktopWindow } from '@renderer/app/layout/DesktopWindow.js'
import { store } from '@renderer/app/store/store.js'
import { Provider } from 'react-redux'
import { Route, Routes, HashRouter, Navigate } from 'react-router-dom'
import { Chat } from '@renderer/app/screens/chat/Chat.js'
import { Calendar } from '@renderer/app/screens/calendar/Calendar.js'
import { Setting } from '@renderer/app/screens/settings/Setting.js'
import { Platform } from '@renderer/app/screens/platform/Platform.js'
import { AgentNameScreen } from '@renderer/app/onboarding/AgentName.Screen.js'
import { InboundEmailProcessor } from '@renderer/app/shared/InboundProcessor.js'

import React from 'react'

const OnboardingGuard = ({ children }: { children: React.ReactElement }) => {
  const hasOnboarded = localStorage.getItem('has_onboarded') === 'true'
  if (!hasOnboarded) {
    return <Navigate to="/onboarding" replace />
  }
  return children
}

export const AppRouter = () => {
  return (
    <>
      <Provider store={store}>
        <HashRouter>
          <InboundEmailProcessor />
          <Routes>
            <Route path="/onboarding" element={<DesktopWindow />}>
              <Route index element={<AgentNameScreen />} />
            </Route>
            <Route
              path="/"
              element={
                <OnboardingGuard>
                  <DesktopWindow />
                </OnboardingGuard>
              }
            >
              {/* Default → Chat */}
              <Route index element={<Navigate to="/chat" replace />} />
              <Route path="chat" element={<Chat />} />
              <Route path="platform" element={<Platform />} />
              <Route path="calendar" element={<Calendar />} />
              <Route path="settings" element={<Setting />} />
            </Route>
          </Routes>
        </HashRouter>
      </Provider>
    </>
  )
}
