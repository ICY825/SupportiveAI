import type { FormEvent, KeyboardEvent, ChangeEvent } from 'react'

export interface LockerCreateFormData {
  zone: string
  compartment_start: number | string
  compartment_count: number | string
  lock_type: string
  notes: string
}

export interface LockerCreatePanelProps {
  formData: LockerCreateFormData
  onFormDataChange: (field: keyof LockerCreateFormData, value: string | number) => void
  draftRotation: number
  onDraftRotationChange: (value: number) => void
  createError: string | null
  isSubmitting: boolean
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  onCancel: () => void
}

export function LockerCreatePanel({
  formData,
  onFormDataChange,
  draftRotation,
  onDraftRotationChange,
  createError,
  isSubmitting,
  onSubmit,
  onCancel,
}: LockerCreatePanelProps) {

  const handleRotationInput = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    const num = Number(val)
    onDraftRotationChange(Number.isFinite(num) ? num : 0)
  }

  const handleZoneInput = (e: ChangeEvent<HTMLInputElement>) => {
    onFormDataChange('zone', e.target.value)
  }

  const handleCompartmentCountInput = (e: ChangeEvent<HTMLInputElement>) => {
    onFormDataChange('compartment_count', e.target.value)
  }

  const handleCompartmentStartInput = (e: ChangeEvent<HTMLInputElement>) => {
    onFormDataChange('compartment_start', e.target.value)
  }

  const handleLockTypeInput = (e: ChangeEvent<HTMLSelectElement>) => {
    onFormDataChange('lock_type', e.target.value)
  }

  const handleNotesInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onFormDataChange('notes', e.target.value)
  }

  const handleFormKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter') {
      const startStr = String(formData.compartment_start ?? '').trim()
      if (startStr === '') {
        e.preventDefault()
      }
    }
  }

  const handleCompartmentStartKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const val = String(formData.compartment_start ?? '').trim()
      if (val === '') {
        e.preventDefault()
        e.currentTarget.reportValidity?.()
      }
    }
  }

  return (
    <aside className="fp-desk-inspector" aria-label="Tạo tủ locker mới">
      <style>{`
        @keyframes lockerSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
      <header className="fp-di-head">
        <div className="fp-di-head-main">
          <p className="fp-di-kicker">Thiết lập & Cấu hình</p>
          <h2 className="fp-mono-title">Tạo tủ mới</h2>
        </div>
        <div className="fp-di-head-tools">
          <button
            type="button"
            className="fp-icon-btn"
            aria-label="Đóng (Hủy tạo tủ)"
            title="Đóng (Esc)"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      <form
        onSubmit={onSubmit}
        onKeyDown={handleFormKeyDown}
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
      >
        <div className="fp-di-scroll">
          <div className="fp-di-body">
            {createError && (
              <div
                style={{
                  padding: '10px 12px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '6px',
                  color: '#dc2626',
                  fontSize: '12px',
                  lineHeight: 1.4,
                }}
              >
                {createError}
              </div>
            )}

            {/* Điều khiển góc xoay (độ) 0..360 */}
            <div className="fp-di-section">
              <label
                htmlFor="locker-draft-rotation"
                className="fp-di-heading"
                style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--fp-text-1, #1e293b)' }}
              >
                Góc xoay (độ) từ 0 đến 360
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  id="locker-draft-rotation"
                  type="range"
                  min="0"
                  max="360"
                  step="5"
                  name="draft_rotation"
                  aria-label="Góc xoay (độ) từ 0 đến 360"
                  disabled={isSubmitting}
                  value={draftRotation}
                  onChange={handleRotationInput}
                  style={{
                    flex: 1,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  }}
                />
                <span
                  style={{
                    minWidth: '40px',
                    textAlign: 'right',
                    fontSize: '13px',
                    fontWeight: 600,
                    fontFamily: 'var(--font-mono, monospace)',
                    color: 'var(--fp-text-1, #1e293b)',
                  }}
                >
                  {draftRotation}°
                </span>
              </div>
            </div>

            {/* Khu vực (Zone) */}
            <div className="fp-di-section">
              <h3 className="fp-di-heading">
                Khu vực (Zone) <span style={{ color: '#ef4444' }}>*</span>
              </h3>
              <input
                type="text"
                name="zone"
                required
                disabled={isSubmitting}
                value={formData.zone}
                onChange={handleZoneInput}
                placeholder="Nhập khu vực (Zone)..."
                style={{
                  width: '100%',
                  height: '32px',
                  padding: '0 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--line, #cbd5e1)',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                  backgroundColor: '#ffffff',
                }}
              />
            </div>

            {/* Số ngăn & Ngăn bắt đầu */}
            <div className="fp-di-section" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <h3 className="fp-di-heading">
                  Số ngăn <span style={{ color: '#ef4444' }}>*</span>
                </h3>
                <input
                  type="number"
                  min="1"
                  name="compartment_count"
                  required
                  disabled={isSubmitting}
                  value={formData.compartment_count}
                  onChange={handleCompartmentCountInput}
                  style={{
                    width: '100%',
                    height: '32px',
                    padding: '0 8px',
                    borderRadius: '6px',
                    border: '1px solid var(--line, #cbd5e1)',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                    backgroundColor: '#ffffff',
                  }}
                />
              </div>
              <div>
                <h3 className="fp-di-heading">
                  Ngăn bắt đầu <span style={{ color: '#ef4444' }}>*</span>
                </h3>
                <input
                  type="number"
                  min="0"
                  name="compartment_start"
                  required
                  disabled={isSubmitting}
                  value={formData.compartment_start}
                  onChange={handleCompartmentStartInput}
                  onKeyDown={handleCompartmentStartKeyDown}
                  style={{
                    width: '100%',
                    height: '32px',
                    padding: '0 8px',
                    borderRadius: '6px',
                    border: '1px solid var(--line, #cbd5e1)',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                    backgroundColor: '#ffffff',
                  }}
                />
              </div>
            </div>

            {/* Loại khóa (lock_type) */}
            <div className="fp-di-section">
              <h3 className="fp-di-heading">Loại khóa</h3>
              <select
                name="lock_type"
                disabled={isSubmitting}
                value={formData.lock_type}
                onChange={handleLockTypeInput}
                style={{
                  width: '100%',
                  height: '32px',
                  padding: '0 8px',
                  borderRadius: '6px',
                  border: '1px solid var(--line, #cbd5e1)',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                  backgroundColor: '#ffffff',
                }}
              >
                <option value="key">Khóa chìa (key)</option>
                <option value="electronic">Khóa điện tử (electronic)</option>
                <option value="mechanical">Khóa cơ (mechanical)</option>
                <option value="smart_card">Thẻ từ (smart_card)</option>
                <option value="padlock">Khóa móc (padlock)</option>
              </select>
            </div>

            {/* Ghi chú */}
            <div className="fp-di-section">
              <h3 className="fp-di-heading">Ghi chú</h3>
              <textarea
                name="notes"
                rows={3}
                disabled={isSubmitting}
                value={formData.notes}
                onChange={handleNotesInput}
                placeholder="Ghi chú về tủ..."
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--line, #cbd5e1)',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                  backgroundColor: '#ffffff',
                }}
              />
            </div>
          </div>
        </div>

        {/* Action footer */}
        <footer className="fp-di-actions">
          <div className="fp-di-actions-row">
            <button
              type="button"
              className="fp-btn"
              disabled={isSubmitting}
              onClick={onCancel}
              style={{ minWidth: '80px', justifyContent: 'center' }}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="fp-btn is-primary"
              disabled={isSubmitting}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {isSubmitting ? (
                <>
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      border: '2px solid #ffffff',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      animation: 'lockerSpin 1s linear infinite',
                    }}
                  />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <span>Lưu tủ</span>
              )}
            </button>
          </div>
        </footer>
      </form>
    </aside>
  )
}

export default LockerCreatePanel
