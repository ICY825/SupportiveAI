import type { DeskRecord, DeskStatus } from '../domain/desk'
import type { EntityRef, FloorDataset } from '../domain/spatial'
import { DESK_STATUS, UNLABELED_ZONE, objectName } from '../labels'

export type SearchKind = 'desk' | 'person' | 'zone' | 'room' | 'workstation' | 'cluster' | 'object'

export const SEARCH_KIND_LABEL: Record<SearchKind, string> = {
  desk: 'Bàn',
  person: 'Nhân sự',
  zone: 'Khu vực',
  room: 'Phòng',
  workstation: 'Vị trí làm việc',
  cluster: 'Cụm bàn',
  object: 'Thiết bị',
}

/** order among equally good matches */
const KIND_RANK: Record<SearchKind, number> = { desk: 0, person: 1, zone: 2, room: 3, workstation: 4, object: 5, cluster: 6 }

export interface SearchItem {
  key: string
  kind: SearchKind
  /** what selecting the result selects on the map */
  target: EntityRef
  title: string
  subtitle: string
  deskStatus?: DeskStatus
  /** folded text of fields that can match, title first */
  fields: string[]
}

/** Lowercase without Vietnamese diacritics, so "mat bang" matches "Mặt bằng". */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
}

const zoneLabel = (ds: FloorDataset, zoneId: string | null) =>
  zoneId ? (ds.zones.find((z) => z.id === zoneId)?.name ?? UNLABELED_ZONE) : 'Ngoài các khu vực'

/**
 * Everything findable on one floor. The verification view indexes physical
 * entities only; pass `desks` (workspace view) to add seats and people.
 */
export function buildSearchIndex(ds: FloorDataset, desks?: ReadonlyMap<string, DeskRecord>): SearchItem[] {
  const items: SearchItem[] = []
  const add = (item: Omit<SearchItem, 'fields'>, extra: (string | undefined | null)[] = []) =>
    items.push({ ...item, fields: [item.title, ...extra].filter((f): f is string => Boolean(f)).map(fold) })

  for (const z of ds.zones) {
    add({ key: `zone:${z.id}`, kind: 'zone', target: { kind: 'zone', id: z.id }, title: z.name ?? UNLABELED_ZONE, subtitle: `Lưới ${z.gridRef}` }, [z.id])
  }
  for (const r of ds.rooms) {
    add({ key: `room:${r.id}`, kind: 'room', target: { kind: 'room', id: r.id }, title: r.name, subtitle: zoneLabel(ds, r.zoneId) }, [r.id])
  }
  for (const o of ds.objects) {
    add(
      { key: `object:${o.id}`, kind: 'object', target: { kind: 'object', id: o.id }, title: objectName(o), subtitle: zoneLabel(ds, o.zoneId) },
      [o.name, o.id],
    )
  }
  for (const c of ds.clusters) {
    add({ key: `cluster:${c.id}`, kind: 'cluster', target: { kind: 'cluster', id: c.id }, title: c.id, subtitle: `${c.workstationIds.length} vị trí · ${zoneLabel(ds, c.zoneId)}` })
  }

  for (const w of ds.workstations) {
    const desk = desks?.get(w.id)
    const target: EntityRef = { kind: 'workstation', id: w.id }
    if (!desk) {
      add({ key: `ws:${w.id}`, kind: 'workstation', target, title: w.id, subtitle: zoneLabel(ds, w.zoneId) })
      continue
    }
    const status = DESK_STATUS[desk.status].label
    add(
      { key: `desk:${w.id}`, kind: 'desk', target, title: desk.seat.code, subtitle: `${zoneLabel(ds, w.zoneId)} · ${status}`, deskStatus: desk.status },
      [w.id],
    )
    const people = [...desk.occupants.map((p) => ({ p, role: 'Bàn' })), ...(desk.reservation ? [{ p: desk.reservation, role: 'Đặt trước bàn' }] : [])]
    for (const { p, role } of people) {
      add(
        {
          key: `person:${p.assignment.id}`,
          kind: 'person',
          target,
          title: p.employee.name,
          subtitle: [p.employee.jobTitle, `${role} ${desk.seat.code}`].filter(Boolean).join(' · '),
          deskStatus: desk.status,
        },
        [p.employee.employeeCode, p.department?.name, p.employee.team],
      )
    }
  }
  return items
}

/**
 * Every query word must appear somewhere in the item. Ranked by how the query
 * matches the title: exact, prefix, last word (a Vietnamese given name, so
 * "minh" ranks "Nguyễn Văn Minh" above "Đặng Minh Khoa"), any word, anywhere.
 */
export function searchItems(index: SearchItem[], query: string, limit = 8): SearchItem[] {
  const words = fold(query).trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const phrase = words.join(' ')
  const scored: { item: SearchItem; score: number }[] = []
  for (const item of index) {
    const haystack = item.fields.join(' ')
    if (!words.every((w) => haystack.includes(w))) continue
    const title = item.fields[0]
    const lastWord = title.split(/\s+/).at(-1) ?? ''
    const score =
      title === phrase
        ? 0
        : title.startsWith(phrase)
          ? 1
          : words.length === 1 && lastWord.startsWith(phrase)
            ? 2
            : item.fields.some((f) => f.startsWith(phrase) || f.split(/[\s\-/·&]+/).some((part) => part.startsWith(words[0])))
              ? 3
              : 4
    scored.push({ item, score })
  }
  scored.sort(
    (a, b) =>
      a.score - b.score || KIND_RANK[a.item.kind] - KIND_RANK[b.item.kind] || a.item.title.localeCompare(b.item.title, 'vi'),
  )
  return scored.slice(0, limit).map((s) => s.item)
}
