import { createSlice } from '@reduxjs/toolkit'
export type tabState = 'chat' | 'platform' | 'calendar' | 'settings' | 'onboarding'
const defaultTab: tabState = 'chat'
type tabSliceState = {
  selectedTab: tabState
}
const initialState: tabSliceState = {
  selectedTab: defaultTab
}

const tabSlice = createSlice({
  name: 'tab',
  initialState,
  reducers: {
    setSelectedTab: (state, action: { payload: tabState }) => {
      state.selectedTab = action.payload
    }
  }
})
export const { setSelectedTab } = tabSlice.actions
export default tabSlice.reducer
