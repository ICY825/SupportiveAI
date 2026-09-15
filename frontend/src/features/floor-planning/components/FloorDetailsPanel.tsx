import type { ReactNode } from 'react'
import type { FloorAllocationData } from '../domain/allocation'
import type { EntityRef, FloorDataset, Point, VerificationState } from '../domain/spatial'
import type { ValidationIssue } from '../data/validateFloorDataset'

interface FloorDetailsPanelProps {
  dataset: FloorDataset
  selected: EntityRef | null
  onSelect: (ref: EntityRef | null) => void
  debug: boolean
  issues: ValidationIssue[]
  /** Phase 2. Undefined today: every allocation field renders "—". */
  allocation?: FloorAllocationData
}

const DASH = '—'

const VERIFICATION_TEXT: Record<VerificationState, string> = {
  SOURCE_VERIFIED: 'Taken directly from the source PDF',
  EXTRACTED: 'Derived from source vectors by rule — needs Admin confirmation',
  UNVERIFIED: 'Partially derived — outline or identity not confirmed',
  UNKNOWN: 'Cannot be determined from the source',
}

function Badge({ state }: { state: VerificationState }) {
  return (
    <span className="fp-badge" data-verification={state} title={VERIFICATION_TEXT[state]}>
      {state}
    </span>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fp-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Link({ to, onSelect, children }: { to: EntityRef; onSelect: (r: EntityRef) => void; children: ReactNode }) {
  return (
    <button type="button" className="fp-link" onClick={() => onSelect(to)}>
      {children}
    </button>
  )
}

const fmtPt = (p: Point, mmPerPt: number) =>
  `${p[0].toFixed(1)}, ${p[1].toFixed(1)} pt · ${Math.round(p[0] * mmPerPt)}, ${Math.round(p[1] * mmPerPt)} mm`

function Notes({ notes }: { notes: string[] }) {
  if (!notes.length) return null
  return (
    <ul className="fp-notes">
      {notes.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  )
}

/** Allocation rows: always "—" until Phase 2 data exists. Never computed from geometry. */
function AllocationRows({ allocation }: { allocation?: FloorAllocationData }) {
  const pending = allocation ? 'Not wired yet' : DASH
  return (
    <>
      <Row label="Verified seats">{pending}</Row>
      <Row label="Assigned employees">{pending}</Row>
      <Row label="Utilization">{pending}</Row>
    </>
  )
}

export function FloorDetailsPanel({ dataset, selected, onSelect, debug, issues, allocation }: FloorDetailsPanelProps) {
  const { layout } = dataset
  const floor = layout.floor
  const zoneName = (id: string | null) => {
    if (!id) return <span className="fp-unknown">None / UNKNOWN</span>
    const z = dataset.zones.find((k) => k.id === id)
    return (
      <Link to={{ kind: 'zone', id }} onSelect={onSelect}>
        {z?.name ?? `${id} (unlabeled)`}
      </Link>
    )
  }

  let body: ReactNode
  let raw: unknown = null

  if (!selected) {
    const ws = dataset.workstations.filter((w) => w.classification === 'WORKSTATION')
    const unknownCount =
      dataset.zones.filter((z) => z.verification === 'UNKNOWN').length +
      dataset.workstations.filter((w) => w.classification === 'UNKNOWN').length +
      dataset.objects.filter((o) => o.classification === 'UNKNOWN').length
    body = (
      <>
        <header className="fp-panel-head">
          <p className="fp-kicker">Floor</p>
          <h2>{floor.sourceTitle}</h2>
        </header>
        <dl>
          <Row label="Floor">{floor.level}</Row>
          <Row label="Building">{dataset.building.name ?? <span className="fp-unknown">UNKNOWN (not stated on PDF)</span>}</Row>
          <Row label="Source scale">{floor.sourceScale}</Row>
          <Row label="Zones">{dataset.zones.length}</Row>
          <Row label="Desk clusters">{dataset.clusters.length}</Row>
          <Row label="Physical workstations">
            {ws.length} <span className="fp-muted">extracted, unverified</span>
          </Row>
          <Row label="Facilities">{dataset.objects.filter((o) => o.classification === 'FACILITY').length}</Row>
          <Row label="UNKNOWN items">{unknownCount}</Row>
          <AllocationRows allocation={allocation} />
          <Row label="Source">{dataset.sourceName}</Row>
        </dl>
        <h3>Zones</h3>
        <ul className="fp-list">
          {dataset.zones.map((z) => (
            <li key={z.id}>
              <Link to={{ kind: 'zone', id: z.id }} onSelect={onSelect}>
                {z.name ?? 'Unlabeled zone'}
              </Link>
              <Badge state={z.verification} />
            </li>
          ))}
        </ul>
        <p className="fp-muted fp-small">
          Click a zone or workstation on the map. Seats, employees and utilization are intentionally empty until
          verified data is provided by Admin/HR.
        </p>
      </>
    )
    raw = { floor, extraction: dataset.extraction }
  } else if (selected.kind === 'zone') {
    const z = dataset.zones.find((k) => k.id === selected.id)
    if (z) {
      const ws = dataset.workstations.filter((w) => w.zoneId === z.id && w.classification === 'WORKSTATION')
      const clusters = dataset.clusters.filter((c) => c.zoneId === z.id)
      const objects = dataset.objects.filter((o) => o.zoneId === z.id)
      raw = z
      body = (
        <>
          <header className="fp-panel-head">
            <p className="fp-kicker">{z.type === 'WORKSPACE_ZONE' ? 'Workspace Zone' : 'Zone · UNKNOWN'}</p>
            <h2>{z.name ?? <span className="fp-unknown">Unlabeled zone</span>}</h2>
            <Badge state={z.verification} />
          </header>
          <dl>
            <Row label="Type">{z.type === 'WORKSPACE_ZONE' ? 'Workspace Zone' : <span className="fp-unknown">UNKNOWN</span>}</Row>
            <Row label="Floor">{floor.level}</Row>
            <Row label="Physical workstations">
              {ws.length} <span className="fp-muted">extracted from desk+chair symbols</span>
            </Row>
            <Row label="Desk clusters">{clusters.length}</Row>
            <AllocationRows allocation={allocation} />
            <Row label="Source label">{z.sourceLabel ?? <span className="fp-unknown">none</span>}</Row>
            {z.sourceLabelFigure !== null && (
              <Row label="Label figure">
                ({z.sourceLabelFigure}) <span className="fp-muted">meaning not stated on the drawing</span>
              </Row>
            )}
            <Row label="Approx. area">{z.areaM2} m² <span className="fp-muted">of the markup outline</span></Row>
            <Row label="Grid">{z.gridRef}</Row>
            <Row label="Source">
              {dataset.sourceName} · {z.source.annotationType} annotation
            </Row>
            {debug && <Row label="ID">{z.id}</Row>}
          </dl>
          {objects.length > 0 && (
            <>
              <h3>Facilities & objects</h3>
              <ul className="fp-list">
                {objects.map((o) => (
                  <li key={o.id}>
                    <Link to={{ kind: 'object', id: o.id }} onSelect={onSelect}>
                      {o.name}
                    </Link>
                    <Badge state={o.verification} />
                  </li>
                ))}
              </ul>
            </>
          )}
          <Notes notes={z.notes} />
        </>
      )
    }
  } else if (selected.kind === 'workstation') {
    const w = dataset.workstations.find((k) => k.id === selected.id)
    if (w) {
      raw = w
      body = (
        <>
          <header className="fp-panel-head">
            <p className="fp-kicker">Physical workstation</p>
            <h2>{w.id}</h2>
            <Badge state={w.verification} />
          </header>
          <dl>
            <Row label="Classification">{w.classification}</Row>
            <Row label="Floor">{floor.level}</Row>
            <Row label="Zone">{zoneName(w.zoneId)}</Row>
            <Row label="Cluster">
              <Link to={{ kind: 'cluster', id: w.clusterId }} onSelect={onSelect}>
                {w.clusterId}
              </Link>
            </Row>
            <Row label="Desk">{w.source.nominalSizeMm?.join(' × ')} mm (source label “{w.source.deskLabel}”)</Row>
            <Row label="Chair symbol">{w.chair ? 'Detected' : <span className="fp-unknown">Not detected</span>}</Row>
            <Row label="Seat">
              {DASH} <span className="fp-muted">workstation ≠ seat; needs Admin verification</span>
            </Row>
            <Row label="Assigned employee">{DASH}</Row>
            <Row label="Grid">{w.gridRef}</Row>
            <Row label="Rotation">{w.rotationDeg}°</Row>
            <Row label="Source position">
              {fmtPt(w.center, floor.mmPerPt)} <span className="fp-muted">from sheet top-left</span>
            </Row>
            <Row label="Source">{dataset.sourceName}</Row>
          </dl>
          <p className="fp-rule">
            <strong>Rule:</strong> {w.source.rule}
          </p>
          <Notes notes={w.notes} />
        </>
      )
    }
  } else if (selected.kind === 'cluster') {
    const c = dataset.clusters.find((k) => k.id === selected.id)
    if (c) {
      raw = c
      body = (
        <>
          <header className="fp-panel-head">
            <p className="fp-kicker">Desk cluster</p>
            <h2>{c.id}</h2>
            <Badge state={c.verification} />
          </header>
          <dl>
            <Row label="Floor">{floor.level}</Row>
            <Row label="Zone">{zoneName(c.zoneId)}</Row>
            <Row label="Physical workstations">{c.workstationIds.length}</Row>
            <AllocationRows allocation={allocation} />
            <Row label="Grid">{c.gridRef}</Row>
            <Row label="Source position">
              {fmtPt(c.center, floor.mmPerPt)} <span className="fp-muted">from sheet top-left</span>
            </Row>
          </dl>
          <h3>Workstations</h3>
          <ul className="fp-chips">
            {c.workstationIds.map((id) => (
              <li key={id}>
                <Link to={{ kind: 'workstation', id }} onSelect={onSelect}>
                  {id}
                </Link>
              </li>
            ))}
          </ul>
          <Notes notes={c.notes} />
        </>
      )
    }
  } else if (selected.kind === 'room') {
    const r = dataset.rooms.find((k) => k.id === selected.id)
    if (r) {
      raw = r
      body = (
        <>
          <header className="fp-panel-head">
            <p className="fp-kicker">Room</p>
            <h2>{r.name}</h2>
            <Badge state={r.verification} />
          </header>
          <dl>
            <Row label="Type">Room (CBLĐ office per source label)</Row>
            <Row label="Floor">{floor.level}</Row>
            <Row label="Zone">{zoneName(r.zoneId)}</Row>
            <Row label="Approx. area">{r.areaM2} m²</Row>
            <Row label="Occupant">{DASH}</Row>
            <Row label="Grid">{r.gridRef}</Row>
            <Row label="Source">{dataset.sourceName} · highlight annotation</Row>
            {debug && <Row label="ID">{r.id}</Row>}
          </dl>
          <Notes notes={r.notes} />
        </>
      )
    }
  } else if (selected.kind === 'object') {
    const o = dataset.objects.find((k) => k.id === selected.id)
    if (o) {
      raw = o
      body = (
        <>
          <header className="fp-panel-head">
            <p className="fp-kicker">{o.classification === 'FACILITY' ? 'Facility' : 'Object · UNKNOWN'}</p>
            <h2>{o.name}</h2>
            <Badge state={o.verification} />
          </header>
          <dl>
            <Row label="Classification">{o.classification}</Row>
            <Row label="Kind">{o.kind}</Row>
            <Row label="Floor">{floor.level}</Row>
            <Row label="Zone">{zoneName(o.zoneId)}</Row>
            <Row label="Geometry">{o.source.geometry}</Row>
            <Row label="Source text">“{o.source.text}”</Row>
            <Row label="Grid">{o.gridRef}</Row>
            {debug && <Row label="ID">{o.id}</Row>}
          </dl>
          <Notes notes={o.notes} />
        </>
      )
    }
  }

  if (!body) {
    body = <p className="fp-unknown">Entity {selected?.id} not found in this floor dataset.</p>
  }

  const selIssues = selected ? issues.filter((i) => i.entityId === selected.id) : issues

  return (
    <aside className="fp-panel" aria-label="Details">
      {selected && (
        <button type="button" className="fp-back" onClick={() => onSelect(null)}>
          ← Floor overview
        </button>
      )}
      {body}
      {debug && (
        <details className="fp-raw" open={selIssues.length > 0}>
          <summary>
            Debug data{selIssues.length ? ` · ${selIssues.length} validation issue${selIssues.length > 1 ? 's' : ''}` : ''}
          </summary>
          {selIssues.length > 0 && (
            <ul className="fp-issues">
              {selIssues.slice(0, 50).map((i, k) => (
                <li key={k} data-level={i.level}>
                  {i.entityId ? `${i.entityId}: ` : ''}
                  {i.message}
                </li>
              ))}
            </ul>
          )}
          <pre>{JSON.stringify(raw, null, 2)}</pre>
        </details>
      )}
    </aside>
  )
}
