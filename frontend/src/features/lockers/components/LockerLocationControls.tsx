import type { ChangeEvent, CSSProperties, ReactNode } from 'react'

export const DEFAULT_LOCKER_SITES: readonly string[] = ['Bắc', 'Trung', 'Nam']

export interface LockerLocationControlsProps {
  sites?: string[] | readonly string[]
  availableBuildings: string[] | readonly string[]
  availableFloors: string[] | readonly string[]
  selectedSite: string
  selectedBuilding: string
  selectedFloor: string
  onSiteChange: (site: string) => void
  onBuildingChange: (building: string) => void
  onFloorChange: (floor: string) => void
  disabled?: boolean
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

export function LockerLocationControls({
  sites,
  availableBuildings,
  availableFloors,
  selectedSite,
  selectedBuilding,
  selectedFloor,
  onSiteChange,
  onBuildingChange,
  onFloorChange,
  disabled = false,
  className,
  style,
  children,
}: LockerLocationControlsProps) {
  const sitesList = sites !== undefined ? sites : DEFAULT_LOCKER_SITES
  const isSiteDisabled = Boolean(disabled)
  const isBuildingDisabled = Boolean(disabled) || availableBuildings.length <= 1
  const isFloorDisabled = Boolean(disabled) || availableFloors.length <= 1

  const handleSiteChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    onSiteChange(value)
  }

  const handleBuildingChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    onBuildingChange(value)
  }

  const handleFloorChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    onFloorChange(value)
  }

  const rootClassName = className
    ? `locker-location-filters ${className}`
    : 'locker-location-filters'

  const rootStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    maxWidth: '100%',
    minWidth: 0,
    gap: '8px',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: '2px 8px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    ...style,
  }

  return (
    <div className={rootClassName} style={rootStyle}>
      {/* Site filter */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
        <span
          style={{
            fontSize: '11px',
            color: '#64748b',
            fontWeight: 600,
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
        >
          Site:
        </span>
        <select
          value={selectedSite}
          onChange={handleSiteChange}
          disabled={isSiteDisabled}
          aria-label="Chọn khu vực (Site)"
          style={{
            height: '26px',
            padding: '0 6px',
            fontSize: '12px',
            backgroundColor: isSiteDisabled ? '#f8fafc' : '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '5px',
            color: '#1e293b',
            cursor: isSiteDisabled ? 'default' : 'pointer',
            maxWidth: '100%',
            minWidth: 0,
          }}
        >
          {sitesList.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          {sitesList.length === 0 && <option value="">--</option>}
        </select>
      </div>

      {/* Tòa */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
        <span
          style={{
            fontSize: '11px',
            color: '#64748b',
            fontWeight: 600,
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
        >
          Tòa:
        </span>
        <select
          value={selectedBuilding}
          onChange={handleBuildingChange}
          disabled={isBuildingDisabled}
          aria-label="Chọn tòa"
          style={{
            height: '26px',
            padding: '0 6px',
            fontSize: '12px',
            backgroundColor: isBuildingDisabled ? '#f8fafc' : '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '5px',
            color: '#1e293b',
            cursor: isBuildingDisabled ? 'default' : 'pointer',
            maxWidth: '100%',
            minWidth: 0,
          }}
        >
          {availableBuildings.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
          {availableBuildings.length === 0 && <option value="">--</option>}
        </select>
      </div>

      {/* Tầng */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
        <span
          style={{
            fontSize: '11px',
            color: '#64748b',
            fontWeight: 600,
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
        >
          Tầng:
        </span>
        <select
          value={selectedFloor}
          onChange={handleFloorChange}
          disabled={isFloorDisabled}
          aria-label="Chọn tầng"
          style={{
            height: '26px',
            padding: '0 6px',
            fontSize: '12px',
            backgroundColor: isFloorDisabled ? '#f8fafc' : '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '5px',
            color: '#1e293b',
            cursor: isFloorDisabled ? 'default' : 'pointer',
            maxWidth: '100%',
            minWidth: 0,
          }}
        >
          {availableFloors.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
          {availableFloors.length === 0 && <option value="">--</option>}
        </select>
      </div>

      {children}
    </div>
  )
}

