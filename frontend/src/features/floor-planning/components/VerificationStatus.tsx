import type { VerificationState } from '../domain/spatial'
import { VERIFICATION } from '../labels'

/**
 * Extraction verification state as glyph + text (never colour alone).
 * `compact` shows the short wording for dense lists.
 */
export function VerificationStatus({ state, compact = false }: { state: VerificationState; compact?: boolean }) {
  const v = VERIFICATION[state]
  return (
    <span className="fp-status-chip" data-verification={state} title={`${v.label}. ${v.hint}`}>
      <span className="fp-status-glyph" aria-hidden="true">
        {v.glyph}
      </span>
      {compact ? v.short : v.label}
    </span>
  )
}
