import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { SEARCH_KIND_LABEL, searchItems, type SearchItem } from '../search/searchIndex'
import { DeskStatusIcon } from './desk-inspector/DeskStatusBadge'
import { isMac } from './keyboard'

interface FloorSearchProps {
  index: SearchItem[]
  /** workspace view searches people too */
  includesPeople: boolean
  onPick: (item: SearchItem) => void
}

/** Combobox (WAI-ARIA 1.2 pattern) over the floor's search index. Ctrl/⌘ K focuses it. */
export function FloorSearch({ index, includesPeople, onPick }: FloorSearchProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const results = useMemo(() => searchItems(index, query), [index, query])
  const showList = open && query.trim().length > 0
  const shortcut = isMac() ? '⌘K' : 'Ctrl K'

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [])

  const pick = (item: SearchItem) => {
    setOpen(false)
    setQuery('')
    onPick(item)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!results.length) return
      setOpen(true)
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length)
    } else if (e.key === 'Enter') {
      const item = results[active]
      if (showList && item) {
        e.preventDefault()
        pick(item)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (query) {
        setQuery('')
      } else {
        inputRef.current?.blur()
      }
      setOpen(false)
    }
  }

  const optionId = (i: number) => `${listId}-opt-${i}`

  return (
    <div className="fp-search" ref={rootRef}>
      <svg className="fp-search-icon" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="m10.5 10.5 3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-label="Tìm kiếm trên mặt bằng"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results.length ? optionId(active) : undefined}
        placeholder={includesPeople ? 'Tìm bàn, nhân sự…' : 'Tìm vị trí, thiết bị…'}
        value={query}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {!query && (
        <kbd className="fp-search-kbd" aria-hidden="true">
          {shortcut}
        </kbd>
      )}
      <div className="fp-search-pop" hidden={!showList}>
        <ul id={listId} role="listbox" aria-label="Kết quả tìm kiếm">
          {results.map((item, i) => (
            <li
              key={item.key}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'is-active' : undefined}
              onPointerDown={(e) => e.preventDefault()}
              onPointerMove={() => setActive(i)}
              onClick={() => pick(item)}
            >
              <span className="fp-search-kind">{SEARCH_KIND_LABEL[item.kind]}</span>
              <span className="fp-search-main">
                <span className="fp-search-title">{item.title}</span>
                <span className="fp-search-sub">
                  {item.deskStatus && (
                    <span className="fp-search-status" data-desk-status={item.deskStatus}>
                      <DeskStatusIcon status={item.deskStatus} size={10} />
                    </span>
                  )}
                  {item.subtitle}
                </span>
              </span>
            </li>
          ))}
        </ul>
        {results.length === 0 && <p className="fp-search-empty">Không tìm thấy kết quả cho “{query.trim()}”</p>}
      </div>
    </div>
  )
}
