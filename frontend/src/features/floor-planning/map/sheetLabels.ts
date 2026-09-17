import type { MapLabel } from '../domain/spatial'

/**
 * Drawing title-block text (sheet title, scale, file-name field) sits on the
 * paper, not in the building. It is kept in the generated data but not drawn
 * on the digital map. The source raster still shows it.
 */
const SHEET_ANNOTATIONS = [
  /^MẶT BẰNG /i,
  /^T[ỈỶ] L[ỆÊ]\s*:/i,
  /^TÊN FILE/i,
  /^FILE NAME/i,
  /^PHÒNG CÁCH ÂM/i,
  /^ĐẢM BẢO THU ÂM/i,
]

export const isSheetAnnotation = (label: MapLabel) => SHEET_ANNOTATIONS.some((re) => re.test(label.text.trim()))
