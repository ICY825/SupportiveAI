import type { EntityKind, EntityRef } from '../domain/spatial'

const KINDS: EntityKind[] = ['zone', 'room', 'cluster', 'workstation', 'object']

export interface FloorUrlState {
  floorId: string | null
  selected: EntityRef | null
}

/** `#/floor-planning?floor=floor-16&select=workstation:ws-16-001` — shareable while validating. */
export function parseHash(hash: string): FloorUrlState {
  const q = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : ''
  const params = new URLSearchParams(q)
  const sel = params.get('select')
  let selected: EntityRef | null = null
  if (sel && sel.includes(':')) {
    const [kind, id] = [sel.slice(0, sel.indexOf(':')), sel.slice(sel.indexOf(':') + 1)]
    if ((KINDS as string[]).includes(kind) && id) selected = { kind: kind as EntityKind, id }
  }
  return { floorId: params.get('floor'), selected }
}

export function buildHash(state: FloorUrlState): string {
  const params = new URLSearchParams()
  if (state.floorId) params.set('floor', state.floorId)
  if (state.selected) params.set('select', `${state.selected.kind}:${state.selected.id}`)
  const q = params.toString()
  return `#/floor-planning${q ? `?${q}` : ''}`
}
