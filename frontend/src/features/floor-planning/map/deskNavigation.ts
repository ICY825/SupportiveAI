import type { Point } from '../domain/spatial'

export type Direction = 'up' | 'down' | 'left' | 'right'

/** Unit step per direction, in the plane the caller works in. */
export const DIRECTION_VECTOR: Record<Direction, Point> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

export const ARROW_DIRECTION: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

/**
 * Nearest item in a direction on the floor plane (y grows downward).
 * Candidates must lie within a 60° cone; sideways distance costs double so
 * the move follows rows and columns of desks.
 */
export function nearestInDirection<T extends { id: string; center: Point }>(
  from: Point,
  direction: Direction,
  candidates: T[],
  excludeId?: string,
): T | undefined {
  const [dx, dy] = DIRECTION_VECTOR[direction]
  let best: T | undefined
  let bestScore = Infinity
  for (const c of candidates) {
    if (c.id === excludeId) continue
    const vx = c.center[0] - from[0]
    const vy = c.center[1] - from[1]
    const along = vx * dx + vy * dy
    if (along <= 0.5) continue
    const across = Math.abs(vx * dy - vy * dx)
    if (across > along * Math.tan(Math.PI / 3)) continue
    const score = along + across * 2
    if (score < bestScore) {
      bestScore = score
      best = c
    }
  }
  return best
}
