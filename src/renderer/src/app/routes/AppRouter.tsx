import { DesktopWindow } from '@renderer/app/layout/DesktopWindow'
import { store } from '@renderer/app/store/store'
import { Provider } from 'react-redux'
import { Route, Routes, HashRouter, Navigate } from 'react-router-dom'
import { AgentNameScreen } from '@renderer/app/onboarding/AgentName.Screen'

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
          <OnboardingGuard>
          <Routes>
            <Route path="/onboarding" element={<DesktopWindow />}>
                <Route index element={<AgentNameScreen />} />
            </Route>
          </Routes>
          </OnboardingGuard>
        </HashRouter>
      </Provider>
    </>
  )
}
