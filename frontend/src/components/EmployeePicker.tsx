/**
 * Ô tìm nhân sự ở màn hình soát (mail-tracking.md §5.2).
 *
 * Yêu cầu từ tài liệu: **gõ 2–3 ký tự ra gợi ý, chọn được bằng bàn phím
 * không cần chuột.** HC xử lý cả lô liên tục, phải rời tay khỏi bàn phím
 * mỗi dòng thì màn hình soát thành cái nút cổ chai của cả quy trình.
 *
 * Danh sách ứng viên do matcher xếp hạng (§4.3) được truyền vào qua
 * `suggestions` và hiện SẴN khi chưa gõ gì — phần lớn trường hợp HC chỉ
 * cần bấm mũi tên xuống rồi Enter.
 */

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { searchEmployees } from '@/api/employees';
import type { EmployeeBrief, MatchCandidate } from '@/api/types';

const MIN_CHARS = 2;
const DEBOUNCE_MS = 220;
const MENU_MAX_HEIGHT = 230;
const MENU_MIN_WIDTH = 260;
const MENU_GAP = 4;
const VIEWPORT_MARGIN = 8;

export interface PickerChoice {
  employeeId: string;
  fullName: string;
}

/**
 * Toạ độ của menu trong viewport. Menu phải nằm ngoài cây DOM của bảng vì
 * `Card` đặt `overflow: hidden` để bo góc — để nguyên trong ô thì danh sách
 * gợi ý bị thẻ cắt mất, chỉ còn thấy một hai dòng đầu.
 */
interface MenuPosition {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

export function EmployeePicker({
  suggestions = [],
  onPick,
  placeholder = 'Gõ tên hoặc mã nhân viên…',
  autoFocus,
}: {
  suggestions?: MatchCandidate[];
  onPick: (choice: PickerChoice) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [term, setTerm] = useState('');
  const [found, setFound] = useState<EmployeeBrief[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menu, setMenu] = useState<MenuPosition | null>(null);
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const trimmed = term.trim();
  const searchMode = trimmed.length >= MIN_CHARS;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!searchMode) {
      setFound([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      searchEmployees(trimmed)
        .then((rows) => {
          if (!cancelled) setFound(rows);
        })
        .catch(() => {
          if (!cancelled) setFound([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, searchMode]);

  // Chưa gõ gì thì hiện ứng viên matcher đã xếp hạng; gõ rồi thì hiện kết
  // quả tìm kiếm. Hai nguồn không trộn vào nhau để thứ tự xếp hạng của
  // matcher không bị pha loãng.
  const options = useMemo(() => {
    if (searchMode) {
      return found.map((e) => ({
        employeeId: e.id,
        fullName: e.full_name,
        code: e.employee_code,
        hint: '',
      }));
    }
    return suggestions.map((c) => ({
      employeeId: c.employee_id,
      fullName: c.full_name,
      code: c.employee_code,
      hint:
        c.sender_history > 0
          ? `đã nhận ${c.sender_history} lần từ người gửi này`
          : `độ giống ${Math.round(c.score * 100)}%`,
    }));
  }, [searchMode, found, suggestions]);

  useEffect(() => setActive(0), [options.length, searchMode]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (boxRef.current?.contains(target)) return;
      // Menu nằm ở portal nên không thuộc boxRef — phải kiểm tra riêng,
      // không thì kéo thanh cuộn của menu là nó tự đóng.
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const showList = open && options.length > 0;

  // Menu bám theo ô nhập: tính lại mỗi khi cuộn hoặc đổi kích thước, vì
  // `position: fixed` không tự đi theo trang như `absolute`.
  useLayoutEffect(() => {
    if (!showList) {
      setMenu(null);
      return;
    }
    function place() {
      const input = inputRef.current;
      if (!input) return;
      const r = input.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom - MENU_GAP - VIEWPORT_MARGIN;
      const spaceAbove = r.top - MENU_GAP - VIEWPORT_MARGIN;
      // Dòng cuối bảng nằm sát đáy màn hình thì lật menu lên trên.
      const flip = spaceBelow < 150 && spaceAbove > spaceBelow;
      const room = Math.max(flip ? spaceAbove : spaceBelow, 120);
      const width = Math.max(r.width, MENU_MIN_WIDTH);
      const left = Math.max(
        VIEWPORT_MARGIN,
        Math.min(r.left, window.innerWidth - width - VIEWPORT_MARGIN),
      );
      setMenu({
        left,
        width,
        maxHeight: Math.min(MENU_MAX_HEIGHT, room),
        ...(flip
          ? { bottom: window.innerHeight - r.top + MENU_GAP }
          : { top: r.bottom + MENU_GAP }),
      });
    }
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [showList, options.length]);

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onPick({ employeeId: option.employeeId, fullName: option.fullName });
    setTerm('');
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      // Chỉ chặn Enter khi thật sự đang có gợi ý để chọn — nếu không thì
      // Enter phải rơi xuống form như bình thường.
      if (open && options.length > 0) {
        event.preventDefault();
        choose(active);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  const menuNode =
    mounted && showList && menu
      ? createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            style={{
              position: 'fixed',
              zIndex: 1000,
              left: menu.left,
              top: menu.top,
              bottom: menu.bottom,
              width: menu.width,
              margin: 0,
              padding: 4,
              listStyle: 'none',
              background: '#fff',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: '0 8px 22px rgba(28,27,26,.12)',
              maxHeight: menu.maxHeight,
              overflowY: 'auto',
            }}
          >
            {options.map((option, index) => (
              <li
                key={option.employeeId}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(e) => {
                  // `preventDefault` để ô nhập không mất focus trước khi
                  // `onPick` chạy — mất focus là menu đóng, bấm thành hụt.
                  e.preventDefault();
                  choose(index);
                }}
                style={{
                  padding: '6px 8px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  background: index === active ? 'var(--pill-danger-bg)' : 'transparent',
                }}
              >
                <div style={{ fontSize: 12.5 }}>
                  {option.fullName} <span className="small muted">· {option.code}</span>
                </div>
                {option.hint && (
                  <div className="small muted" style={{ fontSize: 11 }}>
                    {option.hint}
                  </div>
                )}
              </li>
            ))}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        className="field"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${listId}-${active}` : undefined}
        value={term}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        style={{ height: 30, fontSize: 12.5 }}
      />
      {open && searchMode && searching && options.length === 0 && (
        <p className="small muted" style={{ margin: '4px 2px 0' }}>
          Đang tìm…
        </p>
      )}
      {open && searchMode && !searching && options.length === 0 && (
        <p className="small muted" style={{ margin: '4px 2px 0' }}>
          Không tìm thấy ai khớp “{trimmed}”.
        </p>
      )}
      {menuNode}
    </div>
  );
}
