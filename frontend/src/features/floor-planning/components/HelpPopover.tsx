import { useEffect, useId, useRef, useState } from 'react'
import { isMac, isTypingTarget } from './keyboard'

/** "?" button with the map's controls and shortcuts. Also opens with the ? key. */
export function HelpPopover() {
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const mod = isMac() ? '⌘' : 'Ctrl'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !isTypingTarget(e.target) && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === 'Escape' && open) {
        e.preventDefault()
        e.stopImmediatePropagation()
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    const onPointerDown = (e: PointerEvent) => {
      if (open && !rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    // capture: close the popover before page-level Escape handling clears the selection
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  const rows: [string[], string][] = [
    [['Kéo chuột'], 'Di chuyển bản đồ'],
    [['Cuộn chuột'], 'Phóng to / thu nhỏ'],
    [['Nhấp'], 'Chọn khu vực, bàn, thiết bị'],
    [['←', '↑', '→', '↓'], 'Chuyển sang bàn gần nhất (khi bản đồ đang được chọn)'],
    [['Esc'], 'Bỏ chọn, đóng bảng thông tin'],
    [[mod, 'K'], 'Tìm kiếm'],
    [['?'], 'Mở / đóng trợ giúp này'],
  ]

  return (
    <div className="fp-help" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="fp-help-btn"
        aria-label="Trợ giúp và phím tắt"
        title="Trợ giúp và phím tắt (?)"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
      >
        ?
      </button>
      {open && (
        <div ref={panelRef} className="fp-help-panel" role="dialog" aria-labelledby={titleId} tabIndex={-1}>
          <h2 id={titleId}>Thao tác trên mặt bằng</h2>
          <dl>
            {rows.map(([keys, action]) => (
              <div key={action}>
                <dt>
                  {keys.map((k) => (
                    <kbd key={k}>{k}</kbd>
                  ))}
                </dt>
                <dd>{action}</dd>
              </div>
            ))}
          </dl>
          <h3>Chế độ xem</h3>
          <p>
            <strong>Xác minh mặt bằng</strong>: đối chiếu dữ liệu trích xuất với bản vẽ gốc.
          </p>
          <p>
            <strong>Bố trí chỗ ngồi</strong>: trạng thái bàn, nhân sự và thiết bị (hiện là dữ liệu minh họa).
          </p>
        </div>
      )}
    </div>
  )
}
