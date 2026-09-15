import { FloorPlanningPage } from '../features/floor-planning/pages/FloorPlanningPage'

/**
 * Application shell (visual conventions from docs/wireframe).
 * Only the floor planning module exists so far; other pilot modules are not built.
 */
export function App() {
  return (
    <div className="app-shell">
      <nav className="app-nav" aria-label="Phân hệ">
        <a className="app-logo" href="#/floor-planning" title="Vin Smart Future">
          <img src={`${import.meta.env.BASE_URL}logo.webp`} alt="Vin Smart Future" />
        </a>
        <a className="app-nav-item is-active" href="#/floor-planning" title="Mặt bằng văn phòng" aria-label="Mặt bằng văn phòng" aria-current="page">
          ▣
        </a>
      </nav>
      <div className="app-content">
        <FloorPlanningPage />
      </div>
    </div>
  )
}
