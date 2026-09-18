import { useState } from 'react'
import { HashRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import { FloorPlanningPage } from '../features/floor-planning/pages/FloorPlanningPage'
import { LockerManagementPage } from '../features/lockers/pages/LockerManagementPage'
import { MailShell } from '../features/mail/MailShell'
import BatchDetailPage from '../features/mail/pages/BatchDetailPage'
import BatchesPage from '../features/mail/pages/BatchesPage'
import ConfirmPage from '../features/mail/pages/ConfirmPage'
import ItemsPage from '../features/mail/pages/ItemsPage'
import PendingMatchPage from '../features/mail/pages/PendingMatchPage'
import ReportsPage from '../features/mail/pages/ReportsPage'
import StationPage from '../features/mail/pages/StationPage'
import StationSignPage from '../features/mail/pages/StationSignPage'
import { SessionProvider } from '../shared/auth'
import { AppNav } from './AppNav'
import LoginPage from './LoginPage'
import { RequireSession } from './RequireSession'

const SETTINGS_KEY = 'vsf.map.settingsOpen'

function initialSettingsOpen(): boolean {
  try {
    return window.localStorage.getItem(SETTINGS_KEY) === '1'
  } catch {
    return false
  }
}

function activeModuleFor(pathname: string): string {
  if (pathname.startsWith('/lockers')) return 'lockers'
  if (pathname.startsWith('/mail')) return 'parcels'
  return 'floor-planning'
}

interface ShellProps {
  settingsOpen: boolean
  settingsApplicable: boolean
  onSettingsOpenChange: (open: boolean) => void
}

/**
 * The navigation rail plus whatever module is open. Wraps every signed-in
 * screen; `/login`, `/station` and `/confirm` sit outside it on purpose — see
 * routes below.
 */
function AppShell({ settingsOpen, settingsApplicable, onSettingsOpenChange }: ShellProps) {
  const activeModule = activeModuleFor(useLocation().pathname)

  return (
    <div className="app-shell">
      <AppNav
        activeId={activeModule}
        settingsOpen={settingsOpen}
        settingsAvailable={activeModule === 'floor-planning' && settingsApplicable}
        onToggleSettings={() => onSettingsOpenChange(!settingsOpen)}
      />
      <div className="app-content">
        <Outlet />
      </div>
    </div>
  )
}

/** Application shell and route table. */
export function App() {
  const [settingsOpen, setSettingsOpen] = useState(initialSettingsOpen)
  const [settingsApplicable, setSettingsApplicable] = useState(false)

  const changeSettingsOpen = (open: boolean) => {
    setSettingsOpen(open)
    try {
      window.localStorage.setItem(SETTINGS_KEY, open ? '1' : '0')
    } catch {
      // preference just isn't remembered
    }
  }

  return (
    <HashRouter>
      <SessionProvider>
        <Routes>
          {/*
           * The only three routes outside the sign-in guard.
           *
           * `/station` is the QR screen at the parcel bench: most employees
           * have no account and must confirm on the spot, so it must never ask
           * for one. `/confirm` is the link in the notification email, for the
           * same people — the token in the link says who they are. `/login`
           * cannot sit behind the guard either, or signing in would require
           * being signed in.
           */}
          <Route path="/station" element={<StationPage />} />
          <Route path="/confirm" element={<ConfirmPage />} />
          <Route path="/login" element={<LoginPage />} />

          {/*
           * Everything else needs a session. The four modules read staff data —
           * who sits where, whose locker, whose parcel — so the sign-in that
           * module 3 arrived with now covers all of them rather than being an
           * accident of which module was written first.
           */}
          <Route element={<RequireSession />}>
            <Route
              element={
                <AppShell
                  settingsOpen={settingsOpen}
                  settingsApplicable={settingsApplicable}
                  onSettingsOpenChange={changeSettingsOpen}
                />
              }
            >
              <Route
                path="/floor-planning"
                element={
                  <FloorPlanningPage
                    settingsOpen={settingsOpen}
                    onSettingsOpenChange={changeSettingsOpen}
                    onSettingsApplicableChange={setSettingsApplicable}
                  />
                }
              />
              <Route path="/lockers" element={<LockerManagementPage />} />

              <Route path="/mail" element={<MailShell />}>
                <Route index element={<Navigate to="/mail/batches" replace />} />
                <Route path="batches" element={<BatchesPage />} />
                <Route path="batches/:id" element={<BatchDetailPage />} />
                <Route path="pending-match" element={<PendingMatchPage />} />
                <Route path="items" element={<ItemsPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="station-sign" element={<StationSignPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/floor-planning" replace />} />
            </Route>
          </Route>
        </Routes>
      </SessionProvider>
    </HashRouter>
  )
}
