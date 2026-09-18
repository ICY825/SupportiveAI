import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

export interface MenuItem<T extends string> {
  id: T
  label: string
  danger?: boolean
  /** draw a divider above this item */
  separated?: boolean
}

interface OverflowMenuProps<T extends string> {
  label: string
  items: MenuItem<T>[]
  onSelect: (id: T) => void
}

/** Menu button (WAI-ARIA menu pattern) for secondary and destructive actions. */
export function OverflowMenu<T extends string>({ label, items, onSelect }: OverflowMenuProps<T>) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (!open) return
    itemRefs.current[0]?.focus()
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const close = (refocus: boolean) => {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const nodes = itemRefs.current.filter((n): n is HTMLButtonElement => n !== null)
    const i = nodes.indexOf(document.activeElement as HTMLButtonElement)
    const move = (next: number) => {
      e.preventDefault()
      nodes[(next + nodes.length) % nodes.length]?.focus()
    }
    if (e.key === 'ArrowDown') move(i + 1)
    else if (e.key === 'ArrowUp') move(i - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(nodes.length - 1)
    else if (e.key === 'Escape') {
      // close only the menu, not the surrounding panel
      e.preventDefault()
      e.stopPropagation()
      close(true)
    } else if (e.key === 'Tab') close(false)
  }

  return (
    <div className="fp-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="fp-icon-btn"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            setOpen(true)
          }
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="3.5" cy="8" r="1.3" fill="currentColor" />
          <circle cx="8" cy="8" r="1.3" fill="currentColor" />
          <circle cx="12.5" cy="8" r="1.3" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={label} className="fp-menu-list" onKeyDown={onMenuKeyDown}>
          {items.map((item, i) => (
            <div key={item.id} role="none">
              {item.separated && <div role="separator" className="fp-menu-sep" />}
              <button
                ref={(el) => {
                  itemRefs.current[i] = el
                }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={item.danger ? 'is-danger' : undefined}
                onClick={() => {
                  close(true)
                  onSelect(item.id)
                }}
              >
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
