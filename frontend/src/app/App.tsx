import { useState } from 'react'
import { FloorPlanningPage } from '../features/floor-planning/pages/FloorPlanningPage'
import { AppNav } from './AppNav'

const SETTINGS_KEY = 'vsf.map.settingsOpen'

function initialSettingsOpen(): boolean {
  try {
    return window.localStorage.getItem(SETTINGS_KEY) === '1'
  } catch {
    return false
  }
}

/** Application shell. Only the floor planning module exists so far. */
export function App() {
  const [settingsOpen, setSettingsOpen] = useState(initialSettingsOpen)

  const changeSettingsOpen = (open: boolean) => {
    setSettingsOpen(open)
    try {
      window.localStorage.setItem(SETTINGS_KEY, open ? '1' : '0')
    } catch {
      // preference just isn't remembered
    }
  }

  return (
    <div className="app-shell">
      <AppNav activeId="floor-planning" settingsOpen={settingsOpen} onToggleSettings={() => changeSettingsOpen(!settingsOpen)} />
      <div className="app-content">
        <FloorPlanningPage settingsOpen={settingsOpen} onSettingsOpenChange={changeSettingsOpen} />
      </div>
    </div>
  )
}
