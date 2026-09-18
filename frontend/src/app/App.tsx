import { useEffect, useState } from 'react'
import { FloorPlanningPage } from '../features/floor-planning/pages/FloorPlanningPage'
import { LockerManagementPage } from '../features/lockers/pages/LockerManagementPage'
import { AppNav } from './AppNav'

const SETTINGS_KEY = 'vsf.map.settingsOpen'

function initialSettingsOpen(): boolean {
  try {
    return window.localStorage.getItem(SETTINGS_KEY) === '1'
  } catch {
    return false
  }
}

function getActiveModule(hash: string): string {
  if (hash.startsWith('#/lockers')) {
    return 'lockers'
  }
  return 'floor-planning'
}

/** Application shell. Handles navigation between Floor Planning and Locker Management. */
export function App() {
  const [settingsOpen, setSettingsOpen] = useState(initialSettingsOpen)
  const [settingsApplicable, setSettingsApplicable] = useState(false)
  const [activeModule, setActiveModule] = useState(() => getActiveModule(window.location.hash))

  useEffect(() => {
    const onHashChange = () => {
      setActiveModule(getActiveModule(window.location.hash))
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

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
      <AppNav
        activeId={activeModule}
        settingsOpen={settingsOpen}
        settingsAvailable={activeModule === 'floor-planning' && settingsApplicable}
        onToggleSettings={() => changeSettingsOpen(!settingsOpen)}
      />
      <div className="app-content">
        {activeModule === 'lockers' ? (
          <LockerManagementPage />
        ) : (
          <FloorPlanningPage
            settingsOpen={settingsOpen}
            onSettingsOpenChange={changeSettingsOpen}
            onSettingsApplicableChange={setSettingsApplicable}
          />
        )}
      </div>
    </div>
  )
}
