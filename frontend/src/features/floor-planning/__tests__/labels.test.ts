import { beforeAll, describe, expect, it } from 'vitest'
import { FLOORS } from '../data/registry'
import type { FloorDataset } from '../domain/spatial'
import { generated, objectName, placementIssueText, placementIssueTitle } from '../labels'


let ds: FloorDataset

beforeAll(async () => {
  ds = await FLOORS.find((f) => f.id === 'floor-16')!.load()
})

describe('Vietnamese display text', () => {
  it('translates every generated note, rule and geometry text shown for floor-16', () => {
    const entities = [...ds.zones, ...ds.rooms, ...ds.clusters, ...ds.workstations, ...ds.objects]
    const texts = new Set<string>()
    for (const e of entities) {
      e.notes.forEach((n) => texts.add(n))
      const source = 'source' in e ? e.source : undefined
      for (const t of [source?.rule, source?.geometry, source?.annotationType]) if (t) texts.add(t)
    }
    const untranslated = [...texts].filter((t) => generated(t) === t)
    expect(untranslated).toEqual([])
  })

  it('names every floor-16 object kind', () => {
    for (const o of ds.objects) expect(objectName(o)).not.toMatch(/labelled|\(printer\)/)
  })

  it('formats desk and chair overlap messages with desk code', () => {
    expect(placementIssueText({ type: 'overlap', entityId: 'ws-01' }, () => 'WS-01')).toBe('Chồng lấn bàn WS-01')
    expect(placementIssueText({ type: 'overlap', entityId: 'ws-01', target: 'chair' }, () => 'WS-01')).toBe(
      'Không gian ghế chồng lấn bàn WS-01',
    )
  })

  it('formats outside boundary issues', () => {
    expect(placementIssueText({ type: 'outside-boundary' }, () => '')).toBe('Ngoài phạm vi bố trí')
    expect(placementIssueText({ type: 'outside-boundary', target: 'chair' }, () => '')).toBe(
      'Không gian ghế ngoài phạm vi bố trí',
    )
  })

  it('formats outside room boundary with room name or generic fallback', () => {
    expect(
      placementIssueText({ type: 'outside-room-boundary', roomName: 'Phòng cách âm' }, () => ''),
    ).toBe('Bàn nằm ngoài ranh giới phòng')
    expect(placementIssueText({ type: 'outside-room-boundary' }, () => '')).toBe('Bàn nằm ngoài ranh giới phòng')
    expect(
      placementIssueText({ type: 'outside-room-boundary', roomName: 'Phòng họp', target: 'chair' }, () => ''),
    ).toBe('Ghế nằm ngoài ranh giới phòng')
  })

  it('formats outside department zone with zone name or generic fallback', () => {
    expect(
      placementIssueText({ type: 'outside-department-zone', zoneName: 'MÔ HÌNH AI' }, () => ''),
    ).toBe('Bàn nằm ngoài phạm vi khu vực')
    expect(placementIssueText({ type: 'outside-department-zone' }, () => '')).toBe('Bàn nằm ngoài phạm vi khu vực')
    expect(
      placementIssueText({ type: 'outside-department-zone', zoneName: 'MÔ HÌNH AI', target: 'chair' }, () => ''),
    ).toBe('Ghế nằm ngoài phạm vi khu vực')
  })

  it('formats obstacle collision and door clearance conflict with details', () => {
    expect(
      placementIssueText(
        { type: 'obstacle-collision', obstacleId: 'col-1', obstacleKind: 'column', obstacleName: 'Cột C1' },
        () => '',
      ),
    ).toBe('Bàn sẽ chạm cột kết cấu')
    expect(
      placementIssueText(
        { type: 'obstacle-collision', obstacleId: 'col-1', obstacleKind: 'column' },
        () => '',
      ),
    ).toBe('Bàn sẽ chạm cột kết cấu')
    expect(
      placementIssueText(
        { type: 'obstacle-collision', obstacleId: 'wall-1', obstacleKind: 'wall' },
        () => '',
      ),
    ).toBe('Bàn sẽ chạm lõi thang máy')
    expect(
      placementIssueText(
        {
          type: 'obstacle-collision',
          obstacleId: 'col-1',
          obstacleKind: 'column',
          obstacleName: 'Cột C1',
          target: 'chair',
        },
        () => '',
      ),
    ).toBe('Ghế sẽ chạm cột kết cấu')
    expect(
      placementIssueText(
        { type: 'clearance-conflict', obstacleId: 'door-1', obstacleKind: 'door-clearance', obstacleName: 'Cửa thoát hiểm' },
        () => '',
      ),
    ).toBe('Bàn sẽ chạm khoảng mở cửa')
    expect(
      placementIssueText(
        { type: 'clearance-conflict', obstacleId: 'door-1', obstacleKind: 'door-clearance', target: 'chair' },
        () => '',
      ),
    ).toBe('Ghế sẽ chạm khoảng mở cửa')
    const obstacle = { type: 'obstacle-collision' as const, obstacleId: 'col-1', obstacleKind: 'column' as const, obstacleName: 'Cột C1' }
    expect(placementIssueTitle(obstacle, () => '')).toContain('Cột C1')
    expect(placementIssueTitle(obstacle, () => '')).toContain('col-1')
  })
})
