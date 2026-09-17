import { memo, useId } from 'react'
import type { BBox, Point, Zone } from '../domain/spatial'
import { SPATIAL_MINIMAP } from '../labels'
import type { WorkspaceDisplayArea } from './displayAreas'
import { points } from './scene'

export const AreaMinimap = memo(function AreaMinimap({
  window: win,
  departmentPolygons,
  zones,
  areas,
  activeAreaId,
  centerPoint,
  prompting = false,
}: {
  window: BBox
  departmentPolygons: readonly Point[][]
  zones: readonly Zone[]
  areas: readonly WorkspaceDisplayArea[]
  activeAreaId: string | null
  centerPoint: Point | null
  prompting?: boolean
}) {
  const [wx0, wy0, wx1, wy1] = win
  const mapId = useId().replace(/:/g, '')
  const centerX = (wx0 + wx1) / 2
  const centerY = (wy0 + wy1) / 2
  const extent = Math.max(wx1 - wx0, wy1 - wy0)
  const mapX0 = centerX - extent / 2
  const mapY0 = centerY - extent / 2
  const mapRadius = extent / 2

  return (
    <nav className="sw-minimap" aria-label={SPATIAL_MINIMAP.label} data-prompt={prompting ? 'true' : undefined}>
      <svg className="sw-minimap-plan" viewBox={`${mapX0} ${mapY0} ${extent} ${extent}`}>
        <defs>
          <radialGradient id={`${mapId}-sky`} cx="50%" cy="42%" r="72%">
            <stop offset="0" stopColor="#eaf6ff" />
            <stop offset="0.72" stopColor="#c6e0f1" />
            <stop offset="1" stopColor="#9dbfd6" />
          </radialGradient>
          <clipPath id={`${mapId}-clip`}>
            <circle cx={centerX} cy={centerY} r={mapRadius - 8} />
          </clipPath>
        </defs>
        <circle className="sw-minimap-radar-sky" cx={centerX} cy={centerY} r={mapRadius} fill={`url(#${mapId}-sky)`} />
        <g clipPath={`url(#${mapId}-clip)`}>
          <g className="sw-minimap-radar-grid" aria-hidden="true">
            <line x1={centerX} y1={mapY0} x2={centerX} y2={mapY0 + extent} />
            <line x1={mapX0} y1={centerY} x2={mapX0 + extent} y2={centerY} />
            <circle cx={centerX} cy={centerY} r={mapRadius * 0.48} />
          </g>
          {zones.map((zone) => <polygon key={zone.id} className="sw-minimap-zone" points={points(zone.polygon)} />)}
          {departmentPolygons.map((polygon, index) => <polygon key={index} className="sw-minimap-dept" points={points(polygon)} />)}
          <g className="sw-minimap-areas">
            {areas.map((area) => {
              const [x0, y0, x1, y1] = area.targetBBox
              const active = area.id === activeAreaId
              return (
                <g
                  key={area.id}
                  className={`sw-minimap-area${active ? ' is-active' : ''}`}
                  data-area-id={area.id}
                  aria-hidden="true"
                >
                  <title>{area.label}</title>
                  <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={2} />
                  <text x={(x0 + x1) / 2} y={(y0 + y1) / 2} textAnchor="middle" dy={4}>{area.short}</text>
                </g>
              )
            })}
          </g>
        </g>
        <circle className="sw-minimap-radar-ring" cx={centerX} cy={centerY} r={mapRadius - 5} />
        {centerPoint && (
          <g clipPath={`url(#${mapId}-clip)`}>
            <g className="sw-minimap-center" transform={`translate(${centerPoint[0]} ${centerPoint[1]})`} aria-hidden="true">
              <circle className="sw-minimap-center-ring" r={6} />
              <circle className="sw-minimap-center-dot" r={2.2} />
            </g>
          </g>
        )}
      </svg>
    </nav>
  )
})
