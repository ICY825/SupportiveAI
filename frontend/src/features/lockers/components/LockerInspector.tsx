import { useRef, useEffect, useState } from 'react'
import type { LockerItem, LockerStats } from '../types'
import { STATUS_META } from '../lockersData'
import { DeskStatusBadge } from '../../floor-planning/components/desk-inspector/DeskStatusBadge'

interface LockerInspectorProps {
  locker: LockerItem | null
  stats?: LockerStats
  zoneSummary?: { label: string; totalCompartments: number }[]
  locationLabel?: string
  onRecallLocker: (lockerId: string) => void
  onAssignLocker: (
    lockerId: string,
    info?: {
      employeeName?: string
      employeeCode?: string
      employeeEmail?: string
      jobTitle?: string
      department?: string
      assignedDate?: string
      notes?: string
    },
  ) => void
  onUpdateLocker?: (
    lockerId: string,
    payload: {
      employeeName: string
      employeeCode?: string
      employeeEmail?: string
      jobTitle?: string
      department?: string
      assignedDate?: string
      notes?: string
    },
  ) => void
  onMarkBroken?: (lockerId: string, reason: string) => void
  onRemindLocker: (lockerId: string) => void
  onSelectCompartment?: (compartmentId: string) => void
  onSelectCabinet?: (cabinetId: string) => void
  onClose: () => void
}

function getTodayDateISO(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatDateToDisplay(dateStr?: string | null): string {
  if (!dateStr) return ''
  const trimmed = dateStr.trim()
  if (trimmed.includes('-')) {
    const datePart = trimmed.split('T')[0]
    const parts = datePart.split('-')
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        const [yyyy, mm, dd] = parts
        return `${dd.padStart(2, '0')}/${mm.padStart(2, '0')}/${yyyy}`
      }
      if (parts[2].length === 4) {
        const [dd, mm, yyyy] = parts
        return `${dd.padStart(2, '0')}/${mm.padStart(2, '0')}/${yyyy}`
      }
    }
  }
  return trimmed
}

function parseDateToISO(dateStr?: string | null): string {
  if (!dateStr) return ''
  const trimmed = dateStr.trim()
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/')
    if (parts.length === 3) {
      if (parts[2].length === 4) {
        const [dd, mm, yyyy] = parts
        return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
      }
      if (parts[0].length === 4) {
        const [yyyy, mm, dd] = parts
        return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
      }
    }
  }
  if (trimmed.includes('-')) {
    const datePart = trimmed.split('T')[0]
    const parts = datePart.split('-')
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        const [yyyy, mm, dd] = parts
        return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
      }
      if (parts[2].length === 4) {
        const [dd, mm, yyyy] = parts
        return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
      }
    }
  }
  return ''
}

const DESK_STATUS_MAP: Record<LockerItem['status'], 'occupied' | 'available' | 'conflict' | 'unavailable'> = {
  in_use: 'occupied',
  available: 'available',
  recall: 'conflict',
  broken: 'unavailable',
}

function formatLockType(lockType?: string | null): string {
  if (!lockType) return 'Khóa cơ (Chìa)'
  const normalized = lockType.toLowerCase().trim()
  switch (normalized) {
    case 'mechanical_key':
      return 'Khóa cơ (Chìa)'
    case 'electronic':
      return 'Khóa điện tử'
    case 'electronic_pin':
      return 'Khóa điện tử (Mã PIN)'
    case 'mechanical':
      return 'Khóa cơ'
    case 'smart_card':
      return 'Khóa thẻ từ (Smart card)'
    case 'rfid':
      return 'Khóa thẻ từ (RFID)'
    case 'key':
      return 'Khóa chìa'
    case 'combination':
      return 'Khóa số xoay'
    case 'padlock':
      return 'Khóa móc'
    default:
      return lockType
  }
}



export function LockerInspector({
  locker,
  stats,
  zoneSummary,
  locationLabel,
  onRecallLocker,
  onAssignLocker,
  onUpdateLocker,
  onMarkBroken,
  onRemindLocker,
  onSelectCompartment,
  onSelectCabinet: _onSelectCabinet,
  onClose,
}: LockerInspectorProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [collapsed] = useState(false)

  // State cho form cấp phát / báo hỏng ngăn trống
  const [actionMode, setActionMode] = useState<'assign' | 'broken'>('assign')
  const [empName, setEmpName] = useState('')
  const [empCode, setEmpCode] = useState('')
  const [empTitle, setEmpTitle] = useState('')
  const [empDept, setEmpDept] = useState('')
  const [empEmail, setEmpEmail] = useState('')
  const [empAssignedDate, setEmpAssignedDate] = useState(getTodayDateISO())
  const [brokenReason, setBrokenReason] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  // State cho form chỉnh sửa nhân sự của ngăn đang sử dụng
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editCode, setEditCode] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editDept, setEditDept] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editAssignedDate, setEditAssignedDate] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: 0 })
    setActionMode('assign')
    setEmpName('')
    setEmpCode('')
    setEmpTitle('')
    setEmpDept('')
    setEmpEmail('')
    setEmpAssignedDate(getTodayDateISO())
    setBrokenReason('')
    setFormError(null)

    // Reset edit mode và form khi locker.id thay đổi
    setIsEditing(false)
    setEditName('')
    setEditCode('')
    setEditTitle('')
    setEditDept('')
    setEditEmail('')
    setEditAssignedDate('')
    setEditNotes('')
    setEditError(null)
  }, [locker?.id])

  const handleStartEdit = () => {
    if (!locker) return
    setIsEditing(true)
    setEditName(locker.employeeName || '')
    setEditCode(locker.employeeCode || '')
    setEditTitle(locker.jobTitle || '')
    setEditDept(locker.department || '')
    setEditEmail(locker.employeeEmail || '')
    setEditAssignedDate(parseDateToISO(locker.assignedDate))
    setEditNotes(locker.notes || '')
    setEditError(null)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditError(null)
  }

  const handleSaveEdit = () => {
    if (!locker) return
    const trimmedName = editName.trim()
    if (!trimmedName) {
      setEditError('Vui lòng nhập tên nhân sự.')
      return
    }
    const payload = {
      employeeName: trimmedName,
      employeeCode: editCode.trim() || undefined,
      employeeEmail: editEmail.trim() || undefined,
      jobTitle: editTitle.trim() || undefined,
      department: editDept.trim() || undefined,
      assignedDate: editAssignedDate ? formatDateToDisplay(editAssignedDate) : undefined,
      notes: editNotes.trim() || undefined,
    }
    onUpdateLocker?.(locker.id, payload)
    setIsEditing(false)
  }

  // When no locker is selected: render FloorDetailsPanel splitting image overview
  if (!locker) {
    const total = stats?.total ?? 18
    const inUse = stats?.inUse ?? 13
    const available = stats?.available ?? 3
    const recall = stats?.recall ?? 1
    const broken = stats?.broken ?? 1

    return (
      <aside className="fp-panel" aria-label="Tổng quan tủ locker">
        <header className="fp-panel-head">
          <h1>Quản lý tủ locker</h1>
          <p className="fp-head-meta">{locationLabel || 'Tòa nhà: Technopark · Tầng 16'}</p>
        </header>

        <dl className="fp-stats">
          <div>
            <dt>Tổng số ngăn</dt>
            <dd>{total}</dd>
          </div>
          <div>
            <dt>Đang dùng</dt>
            <dd>{inUse}</dd>
          </div>
          <div>
            <dt>Còn trống</dt>
            <dd>{available}</dd>
          </div>
          <div>
            <dt>Cần thu hồi / Hỏng</dt>
            <dd>{recall + broken}</dd>
          </div>
        </dl>

        <details className="fp-section" open>
          <summary>
            <h3>Phân bổ theo khu vực</h3>
          </summary>
          <dl>
            {zoneSummary && zoneSummary.length > 0 ? (
              zoneSummary.map((zone) => (
                <div className="fp-row" key={zone.label}>
                  <dt>{zone.label}</dt>
                  <dd>{`${zone.label} (${zone.totalCompartments} ngăn)`}</dd>
                </div>
              ))
            ) : (
              <div className="fp-row">
                <dt>Chưa có tủ</dt>
                <dd>0 ngăn</dd>
              </div>
            )}
          </dl>
        </details>

      </aside>
    )
  }

  const mappedStatus = DESK_STATUS_MAP[locker.status]
  const isCompartmentSelected = Boolean(
    locker.compartments?.some((c) => c.id === locker.id) ||
    (!locker.compartments || locker.compartments.length <= 1),
  )
  const isAvailableCompartment = isCompartmentSelected && locker.status === 'available'
  const compartments = locker.compartments || []
  const availableComps = compartments.filter((c) => c.status === 'available')
  const recallComps = compartments.filter((c) => c.status === 'recall')
  const inUseComps = compartments.filter((c) => c.status === 'in_use')
  const firstAvailComp = availableComps[0]
  const firstRecallComp = recallComps[0]

  return (
    <aside
      className="fp-desk-inspector"
      aria-label={`Chi tiết tủ ${locker.code}`}
      data-desk-status={mappedStatus}
      data-collapsed={collapsed || undefined}
    >
      {/* Header matching DeskInspector */}
      <header className="fp-di-head locker-di-head">
        <div className="fp-di-head-main">
          <p className="fp-di-kicker locker-di-kicker">
            {isCompartmentSelected
              ? locker.cabinetCode
                ? `Ngăn tủ · Cụm ${locker.cabinetCode}`
                : 'Ngăn tủ locker'
              : 'Cụm tủ locker'}
          </p>
          <div className="locker-di-title-row">
            <h2 className="fp-mono-title locker-di-title">{locker.code}</h2>
            <DeskStatusBadge status={mappedStatus} />
          </div>
        </div>

        <div className="fp-di-head-tools">
          <button
            type="button"
            className="fp-icon-btn"
            aria-label="Đóng bảng thông tin"
            title="Đóng (Esc)"
            onClick={onClose}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      {/* Scrollable Body matching DeskInspector */}
      <div className="fp-di-scroll" ref={scrollRef}>
        <div className="fp-di-body" key={locker.id}>
          {/* Form nhập thông tin cấp phát hoặc đánh dấu hỏng khi click vào NGĂN TRỐNG */}
          {isAvailableCompartment ? (
            <div className="fp-di-section" style={{ borderBottom: '1px solid var(--line, #e2ded7)', paddingBottom: '14px' }}>
              <div
                style={{
                  display: 'flex',
                  gap: '4px',
                  marginBottom: '12px',
                  background: '#f1f5f9',
                  padding: '3px',
                  borderRadius: '7px',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActionMode('assign')
                    setFormError(null)
                  }}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    fontSize: '12px',
                    fontWeight: actionMode === 'assign' ? 600 : 500,
                    borderRadius: '5px',
                    border: 'none',
                    background: actionMode === 'assign' ? '#ffffff' : 'transparent',
                    color: actionMode === 'assign' ? '#1e293b' : '#64748b',
                    boxShadow: actionMode === 'assign' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Cấp phát nhân sự
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActionMode('broken')
                    setFormError(null)
                  }}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    fontSize: '12px',
                    fontWeight: actionMode === 'broken' ? 600 : 500,
                    borderRadius: '5px',
                    border: 'none',
                    background: actionMode === 'broken' ? '#ffffff' : 'transparent',
                    color: actionMode === 'broken' ? '#dc2626' : '#64748b',
                    boxShadow: actionMode === 'broken' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Đánh dấu là hỏng
                </button>
              </div>

              {actionMode === 'assign' ? (
                <div>
                  <h3 className="fp-di-heading" style={{ margin: '0 0 8px 0' }}>Thông tin nhân sự cấp phát</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div>
                      <label
                        htmlFor="locker-assign-emp-name"
                        style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}
                      >
                        Tên nhân sự <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        id="locker-assign-emp-name"
                        type="text"
                        value={empName}
                        onChange={(e) => {
                          setEmpName(e.target.value)
                          if (formError) setFormError(null)
                        }}
                        placeholder="Nhập họ và tên nhân viên..."
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          height: '32px',
                          padding: '0 10px',
                          fontSize: '13px',
                          border: formError && !empName.trim() ? '1px solid #ef4444' : '1px solid #cbd5e1',
                          borderRadius: '6px',
                          outline: 'none',
                          backgroundColor: '#ffffff',
                        }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <label
                          htmlFor="locker-assign-emp-code"
                          style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}
                        >
                          Mã nhân viên
                        </label>
                        <input
                          id="locker-assign-emp-code"
                          type="text"
                          value={empCode}
                          onChange={(e) => setEmpCode(e.target.value)}
                          placeholder="Ví dụ: NV-0824..."
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            height: '32px',
                            padding: '0 10px',
                            fontSize: '13px',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            outline: 'none',
                            backgroundColor: '#ffffff',
                          }}
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="locker-assign-emp-title"
                          style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}
                        >
                          Chức danh
                        </label>
                        <input
                          id="locker-assign-emp-title"
                          type="text"
                          value={empTitle}
                          onChange={(e) => setEmpTitle(e.target.value)}
                          placeholder="Ví dụ: Kỹ sư AI..."
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            height: '32px',
                            padding: '0 10px',
                            fontSize: '13px',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            outline: 'none',
                            backgroundColor: '#ffffff',
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="locker-assign-emp-dept"
                        style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}
                      >
                        Bộ phận / Phòng ban
                      </label>
                      <input
                        id="locker-assign-emp-dept"
                        type="text"
                        value={empDept}
                        onChange={(e) => setEmpDept(e.target.value)}
                        placeholder="Ví dụ: Khối AI & Công nghệ..."
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          height: '32px',
                          padding: '0 10px',
                          fontSize: '13px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          outline: 'none',
                          backgroundColor: '#ffffff',
                        }}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="locker-assign-emp-email"
                        style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}
                      >
                        Email
                      </label>
                      <input
                        id="locker-assign-emp-email"
                        type="email"
                        value={empEmail}
                        onChange={(e) => setEmpEmail(e.target.value)}
                        placeholder="Ví dụ: dungnt@vinai.io..."
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          height: '32px',
                          padding: '0 10px',
                          fontSize: '13px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          outline: 'none',
                          backgroundColor: '#ffffff',
                        }}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="locker-assign-date"
                        style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}
                      >
                        Ngày cấp phát
                      </label>
                      <input
                        id="locker-assign-date"
                        type="date"
                        value={empAssignedDate}
                        onChange={(e) => setEmpAssignedDate(e.target.value)}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          height: '32px',
                          padding: '0 10px',
                          fontSize: '13px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          outline: 'none',
                          backgroundColor: '#ffffff',
                          color: '#1e293b',
                        }}
                      />
                    </div>

                    {formError && (
                      <p style={{ margin: 0, fontSize: '12px', color: '#ef4444' }}>
                        {formError}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <h3 className="fp-di-heading" style={{ margin: '0 0 4px 0', color: '#dc2626' }}>Mô tả hư hỏng</h3>
                  <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#64748b' }}>
                    Đánh dấu ngăn này tạm ngừng sử dụng để kỹ thuật xử lý.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div>
                      <label
                        htmlFor="locker-broken-reason"
                        style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}
                      >
                        Hỏng gì? (Chi tiết hư hỏng) <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        id="locker-broken-reason"
                        type="text"
                        value={brokenReason}
                        onChange={(e) => {
                          setBrokenReason(e.target.value)
                          if (formError) setFormError(null)
                        }}
                        placeholder="Ví dụ: Kẹt ổ khóa, hỏng cánh cửa..."
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          height: '32px',
                          padding: '0 10px',
                          fontSize: '13px',
                          border: formError && !brokenReason.trim() ? '1px solid #ef4444' : '1px solid #cbd5e1',
                          borderRadius: '6px',
                          outline: 'none',
                          backgroundColor: '#ffffff',
                        }}
                      />
                    </div>

                    {/* Quick select tags */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
                      {['Kẹt ổ khóa', 'Mất chìa khóa', 'Hỏng bản lề', 'Kẹt cánh cửa'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            setBrokenReason(preset)
                            if (formError) setFormError(null)
                          }}
                          style={{
                            fontSize: '11px',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            border: '1px solid #e2e8f0',
                            backgroundColor: brokenReason === preset ? '#fee2e2' : '#f8fafc',
                            color: brokenReason === preset ? '#b91c1c' : '#475569',
                            cursor: 'pointer',
                          }}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>

                    {formError && (
                      <p style={{ margin: 0, fontSize: '12px', color: '#ef4444' }}>
                        {formError}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* Sub-compartments: CHỈ hiển thị khi xem toàn bộ cụm tủ cha, BỎ khi click vào ngăn trống */}
          {!isCompartmentSelected && locker.compartments && locker.compartments.length > 0 && (
            <div className="fp-di-section">
              <h3 className="fp-di-heading">Danh sách ngăn trong cụm ({locker.compartments.length} ngăn)</h3>
              <p style={{ fontSize: '11px', color: 'var(--fp-text-2, #64748b)', margin: '0 0 8px 0' }}>
                Bấm vào ngăn để xem chi tiết hoặc cấp phát riêng:
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                {locker.compartments.map((comp) => {
                  const compMeta = STATUS_META[comp.status]
                  const isCur = comp.id === locker.id
                  return (
                    <button
                      key={comp.id}
                      type="button"
                      onClick={() => onSelectCompartment?.(comp.id)}
                      style={{
                        padding: '6px',
                        borderRadius: '5px',
                        border: isCur ? '1.5px solid var(--ink, #1c1b1a)' : '1px solid var(--line, #e2ded7)',
                        background: isCur ? 'var(--canvas-2, #f6f4f1)' : '#ffffff',
                        textAlign: 'center',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '2px',
                        outline: 'none',
                      }}
                      title={`Ngăn ${comp.code}: ${compMeta.label}${comp.employeeName ? ` - ${comp.employeeName}` : ''}`}
                    >
                      <span style={{ fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono, monospace)' }}>
                        {comp.code}
                      </span>
                      <span
                        className={`status-dot ${comp.status}`}
                        style={{ width: '6px', height: '8px' }}
                      />
                      <span style={{ fontSize: '9px', color: 'var(--fp-text-2, #57524b)' }}>
                        {compMeta.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Nhân sự sử dụng (khi đã có người dùng) */}
          {locker.employeeName ? (
            <div className="fp-di-section locker-person-section">
              <div className="locker-person-section-header">
                <h3 className="fp-di-heading locker-person-heading">Nhân sự sử dụng</h3>
                {!isEditing && (
                  <button
                    type="button"
                    className="fp-icon-btn locker-edit-btn"
                    aria-label="Chỉnh sửa thông tin nhân sự"
                    title="Chỉnh sửa thông tin nhân sự"
                    onClick={handleStartEdit}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
                      <path
                        d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5.25 12.75l-3.25.75.75-3.25L11.5 2.5z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )}
              </div>

              {!isEditing ? (
                <div className="locker-person-card">
                  <div className="fp-di-person locker-person-hero">
                    <span className="fp-avatar is-lg" aria-hidden="true">
                      {locker.employeeName.charAt(0)}
                    </span>
                    <div className="fp-di-person-text locker-person-hero-details">
                      <p className="fp-di-person-name locker-person-name">{locker.employeeName}</p>
                      <p className="fp-di-person-org locker-person-org">
                        {[locker.jobTitle, locker.department].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>

                  {/* Chi tiết bổ sung thông tin nhân sự */}
                  <dl className="fp-di-props locker-person-props">
                    {locker.employeeCode && (
                      <div className="locker-prop-row">
                        <dt>Mã nhân viên</dt>
                        <dd><span className="fp-mono" style={{ fontWeight: 600 }}>{locker.employeeCode}</span></dd>
                      </div>
                    )}
                    {locker.jobTitle && (
                      <div className="locker-prop-row">
                        <dt>Chức danh</dt>
                        <dd>{locker.jobTitle}</dd>
                      </div>
                    )}
                    {locker.department && (
                      <div className="locker-prop-row">
                        <dt>Bộ phận</dt>
                        <dd>{locker.department}</dd>
                      </div>
                    )}
                    {locker.employeeEmail && (
                      <div className="locker-prop-row">
                        <dt>Email</dt>
                        <dd style={{ wordBreak: 'break-all' }}>{locker.employeeEmail}</dd>
                      </div>
                    )}
                    {locker.assignedDate && (
                      <div className="locker-prop-row">
                        <dt>Ngày cấp phát</dt>
                        <dd>{locker.assignedDate}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div>
                    <label
                      htmlFor="locker-edit-emp-name"
                      style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}
                    >
                      Tên nhân sự <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      id="locker-edit-emp-name"
                      type="text"
                      value={editName}
                      onChange={(e) => {
                        setEditName(e.target.value)
                        if (editError) setEditError(null)
                      }}
                      placeholder="Nhập họ và tên nhân viên..."
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        height: '32px',
                        padding: '0 10px',
                        fontSize: '13px',
                        border: editError && !editName.trim() ? '1px solid #ef4444' : '1px solid #cbd5e1',
                        borderRadius: '6px',
                        outline: 'none',
                        backgroundColor: '#ffffff',
                      }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label
                        htmlFor="locker-edit-emp-code"
                        style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}
                      >
                        Mã nhân viên
                      </label>
                      <input
                        id="locker-edit-emp-code"
                        type="text"
                        value={editCode}
                        onChange={(e) => setEditCode(e.target.value)}
                        placeholder="Ví dụ: NV-0824..."
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          height: '32px',
                          padding: '0 10px',
                          fontSize: '13px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          outline: 'none',
                          backgroundColor: '#ffffff',
                        }}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="locker-edit-emp-title"
                        style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}
                      >
                        Chức danh
                      </label>
                      <input
                        id="locker-edit-emp-title"
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="Ví dụ: Kỹ sư AI..."
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          height: '32px',
                          padding: '0 10px',
                          fontSize: '13px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          outline: 'none',
                          backgroundColor: '#ffffff',
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="locker-edit-emp-dept"
                      style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}
                    >
                      Bộ phận / Phòng ban
                    </label>
                    <input
                      id="locker-edit-emp-dept"
                      type="text"
                      value={editDept}
                      onChange={(e) => setEditDept(e.target.value)}
                      placeholder="Ví dụ: Khối AI & Công nghệ..."
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        height: '32px',
                        padding: '0 10px',
                        fontSize: '13px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        outline: 'none',
                        backgroundColor: '#ffffff',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="locker-edit-emp-email"
                      style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}
                    >
                      Email
                    </label>
                    <input
                      id="locker-edit-emp-email"
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="Ví dụ: dungnt@vinai.io..."
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        height: '32px',
                        padding: '0 10px',
                        fontSize: '13px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        outline: 'none',
                        backgroundColor: '#ffffff',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="locker-edit-emp-date"
                      style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}
                    >
                      Ngày cấp phát
                    </label>
                    <input
                      id="locker-edit-emp-date"
                      type="date"
                      value={editAssignedDate}
                      onChange={(e) => setEditAssignedDate(e.target.value)}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        height: '32px',
                        padding: '0 10px',
                        fontSize: '13px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        outline: 'none',
                        backgroundColor: '#ffffff',
                        color: '#1e293b',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="locker-edit-notes"
                      style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}
                    >
                      Ghi chú
                    </label>
                    <textarea
                      id="locker-edit-notes"
                      rows={3}
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Ghi chú bổ sung..."
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '6px 10px',
                        fontSize: '13px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        outline: 'none',
                        backgroundColor: '#ffffff',
                        color: '#1e293b',
                        fontFamily: 'inherit',
                        resize: 'vertical',
                      }}
                    />
                  </div>

                  {editError && (
                    <p style={{ margin: 0, fontSize: '12px', color: '#ef4444' }}>
                      {editError}
                    </p>
                  )}

                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <button
                      type="button"
                      className="fp-btn is-primary"
                      style={{ flex: 1, justifyContent: 'center' }}
                      onClick={handleSaveEdit}
                    >
                      Lưu thay đổi
                    </button>
                    <button
                      type="button"
                      className="fp-btn"
                      style={{ flex: 1, justifyContent: 'center' }}
                      onClick={handleCancelEdit}
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : !isAvailableCompartment ? (
            /* Tình trạng sử dụng: BỎ khi click vào ngăn trống, chỉ hiện khi xem cụm tủ hoặc ngăn hỏng */
            <div className="fp-di-section">
              <h3 className="fp-di-heading">Tình trạng sử dụng</h3>
              <p className="fp-di-muted" style={{ margin: 0 }}>
                {locker.status === 'broken'
                  ? 'Ngăn tủ đang báo hỏng, tạm ngừng sử dụng để kỹ thuật xử lý.'
                  : availableComps.length > 0
                    ? `Cụm tủ gồm ${compartments.length} ngăn, hiện còn ${availableComps.length} ngăn trống sẵn sàng cấp phát.`
                    : `Tất cả ${compartments.length} ngăn trong cụm tủ đều đang được sử dụng.`}
              </p>
            </div>
          ) : null}

          {/* Properties Section: VẪN CÓ THÔNG TIN & CẤU HÌNH THEO YÊU CẦU */}
          <div className="fp-di-section">
            <h3 className="fp-di-heading">Thông tin vị trí & cấu hình</h3>
            <dl className="fp-di-props">
              <div>
                <dt>Vị trí vật lý</dt>
                <dd><span className="fp-mono">{locker.physicalLocation}</span></dd>
              </div>
              <div>
                <dt>Loại khóa</dt>
                <dd style={{ fontWeight: 600 }}>{formatLockType(locker.lockType)}</dd>
              </div>
              {locker.recallDueDate ? (
                <div>
                  <dt>Hạn thu hồi</dt>
                  <dd style={{ fontWeight: 600 }}>{locker.recallDueDate}</dd>
                </div>
              ) : locker.assignedDate ? (
                <div>
                  <dt>Ngày cấp phát</dt>
                  <dd>{locker.assignedDate}</dd>
                </div>
              ) : null}
              {locker.notes && (
                <div>
                  <dt>Ghi chú</dt>
                  <dd>{locker.notes}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* SupportiveAI Recommendation */}

        </div>
      </div>

      {/* Action footer: cấp phát và thu hồi theo từng NGĂN TỦ */}
      <footer className="fp-di-actions">
        {isCompartmentSelected ? (
          /* Đang xem một ngăn tủ cụ thể */
          locker.status === 'recall' ? (
            <div className="fp-di-actions-row">
              <button
                type="button"
                className="fp-btn is-primary"
                style={{ flex: 1, justifyContent: 'center' }}
                aria-label="Thu hồi tủ"
                onClick={() => onRecallLocker(locker.id)}
              >
                Thu hồi ngăn
              </button>
              <button
                type="button"
                className="fp-btn"
                onClick={() => onRemindLocker(locker.id)}
              >
                Nhắc trả
              </button>
            </div>
          ) : locker.status === 'available' ? (
            /* Khi xem ngăn trống: Nút hành động tương ứng với tab Cấp phát hoặc Đánh dấu hỏng */
            actionMode === 'assign' ? (
              <div className="fp-di-actions-row">
                <button
                  type="button"
                  className="fp-btn is-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => {
                    const trimmedName = empName.trim()
                    if (!trimmedName) {
                      setFormError('Vui lòng nhập tên nhân sự để cấp phát.')
                      return
                    }
                    onAssignLocker(locker.id, {
                      employeeName: trimmedName,
                      employeeCode: empCode.trim() || undefined,
                      employeeEmail: empEmail.trim() || undefined,
                      jobTitle: empTitle.trim() || undefined,
                      department: empDept.trim() || undefined,
                      assignedDate: empAssignedDate ? formatDateToDisplay(empAssignedDate) : undefined,
                    })
                  }}
                >
                  + Cấp phát ngăn này
                </button>
              </div>
            ) : (
              <div className="fp-di-actions-row">
                <button
                  type="button"
                  className="fp-btn"
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    backgroundColor: '#dc2626',
                    color: '#ffffff',
                    borderColor: '#dc2626',
                    fontWeight: 600,
                  }}
                  onClick={() => {
                    const trimmedReason = brokenReason.trim()
                    if (!trimmedReason) {
                      setFormError('Vui lòng nhập chi tiết hư hỏng.')
                      return
                    }
                    onMarkBroken?.(locker.id, trimmedReason)
                  }}
                >
                  Xác nhận báo hỏng
                </button>
              </div>
            )
          ) : locker.status === 'broken' ? (
            <div className="fp-di-actions-row">
              <button
                type="button"
                className="fp-btn is-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => onRecallLocker(locker.id)}
              >
                Xác nhận sửa xong
              </button>
            </div>
          ) : (
            <div className="fp-di-actions-row">
              <button
                type="button"
                className="fp-btn is-primary"
                style={{ flex: 1, justifyContent: 'center' }}
                aria-label="Thu hồi tủ"
                onClick={() => onRecallLocker(locker.id)}
              >
                Thu hồi ngăn
              </button>
              <button
                type="button"
                className="fp-btn"
                onClick={() => onRemindLocker(locker.id)}
              >
                Nhắc nhở
              </button>
            </div>
          )
        ) : (
          /* Đang xem cả cụm tủ */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
            {availableComps.length > 0 ? (
              <div className="fp-di-actions-row">
                <button
                  type="button"
                  className="fp-btn is-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => onAssignLocker(firstAvailComp.id)}
                  title={`Cấp phát nhanh ngăn trống ${firstAvailComp.code}`}
                >
                  + Cấp phát ngăn ({firstAvailComp.code})
                </button>
              </div>
            ) : (
              <div className="fp-di-actions-row">
                <button
                  type="button"
                  className="fp-btn is-primary"
                  style={{ width: '100%', justifyContent: 'center', opacity: 0.6, cursor: 'not-allowed' }}
                  disabled
                  title="Tất cả các ngăn trong cụm tủ này đã được cấp phát"
                >
                  Hết ngăn trống
                </button>
              </div>
            )}

            {recallComps.length > 0 ? (
              <div className="fp-di-actions-row">
                <button
                  type="button"
                  className="fp-btn"
                  style={{ flex: 1, justifyContent: 'center' }}
                  aria-label="Thu hồi tủ"
                  onClick={() => onRecallLocker(firstRecallComp.id)}
                  title={`Thu hồi ngăn ${firstRecallComp.code}`}
                >
                  Thu hồi ngăn ({firstRecallComp.code})
                </button>
                <button
                  type="button"
                  className="fp-btn"
                  onClick={() => onRemindLocker(firstRecallComp.id)}
                >
                  Nhắc trả
                </button>
              </div>
            ) : inUseComps.length > 0 && availableComps.length === 0 ? (
              <div className="fp-di-actions-row">
                <button
                  type="button"
                  className="fp-btn"
                  style={{ flex: 1, justifyContent: 'center' }}
                  aria-label="Thu hồi tủ"
                  onClick={() => onRecallLocker(inUseComps[0].id)}
                  title={`Thu hồi ngăn ${inUseComps[0].code}`}
                >
                  Thu hồi ngăn ({inUseComps[0].code})
                </button>
                <button
                  type="button"
                  className="fp-btn"
                  onClick={() => onRemindLocker(inUseComps[0].id)}
                >
                  Nhắc nhở
                </button>
              </div>
            ) : null}
          </div>
        )}
      </footer>
    </aside>
  )
}
