import { FloorPlanningPage } from '../features/floor-planning/pages/FloorPlanningPage'
import { AppNav } from './AppNav'

/** Application shell. Only the floor planning module exists so far. */
export function App() {
  return (
    <div className="app-shell">
      <AppNav activeId="floor-planning" />
      <div className="app-content">
        <FloorPlanningPage />
      </div>
    </div>
  )
}
