/** Date display for the office (Asia/Ho_Chi_Minh), independent of the viewer's machine timezone. */
const TZ = 'Asia/Ho_Chi_Minh'

const dateFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

const dayNumber = (d: Date) => Date.parse(`${dayKeyFmt.format(d)}T00:00:00Z`) / 86_400_000

export const formatDate = (iso: string) => dateFmt.format(new Date(iso))

export const formatTime = (iso: string) => timeFmt.format(new Date(iso))

/** "Hôm nay", "Hôm qua", "Ngày mai" or dd/mm/yyyy. */
export function formatDay(iso: string, now: Date): string {
  const diff = dayNumber(new Date(iso)) - dayNumber(now)
  if (diff === 0) return 'Hôm nay'
  if (diff === -1) return 'Hôm qua'
  if (diff === 1) return 'Ngày mai'
  return formatDate(iso)
}

/** "Hôm nay, 08:14" or "12/09/2026, 08:14". */
export const formatDateTime = (iso: string, now: Date) => `${formatDay(iso, now)}, ${formatTime(iso)}`

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}
