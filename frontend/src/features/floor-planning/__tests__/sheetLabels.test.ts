import { describe, expect, it } from 'vitest'
import { FLOORS } from '../data/registry'
import { isSheetAnnotation } from '../map/sheetLabels'
describe('sheet title-block labels', () => {
  it('hides the floor-16 sheet title, scale and file-name field, and keeps floor content labels', async () => {
    const ds = await FLOORS.find((f) => f.id === 'floor-16')!.load()
    const hidden = ds.layout.labels.filter(isSheetAnnotation).map((l) => l.text)
    expect(hidden.sort()).toEqual([
      'ĐẢM BẢO THU ÂM',
      'MẶT BẰNG CẢI TẠO TẦNG 16',
      'PHÒNG CÁCH ÂM TƯỜNG TRẦN SÀN',
      'TÊN FILE / FILE NAME:',
      'TỈ LỆ: 1/150',
    ].sort())
    const kept = ds.layout.labels.filter((l) => !isSheetAnnotation(l)).map((l) => l.text)
    expect(kept).toContain('MÁY IN')
  })
})
