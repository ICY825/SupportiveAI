import { FloorPlanningPage } from '../features/floor-planning/pages/FloorPlanningPage'

/**
 * Application shell (visual conventions from docs/wireframe).
 * Only the Floor Planning module exists so far; other pilot modules are not built.
 */
export function App() {
  return (
    <div className="app-shell">
      <nav className="app-nav" aria-label="Modules">
        <a className="app-logo" href="#/floor-planning" title="Vin Smart Future">
          <img src={`${import.meta.env.BASE_URL}logo.webp`} alt="Vin Smart Future" />
        </a>
        <a className="app-nav-item is-active" href="#/floor-planning" title="Quy hoạch văn phòng · Floor Planning">
          ▣
        </a>
      </nav>
      <div className="app-content">
        <FloorPlanningPage />
      </div>
    </div>
  )
}
