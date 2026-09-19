// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import { sessionLayoutStore } from '../workspace/layoutDraft'
import { useFloorLayout } from '../workspace/useFloorLayout'

const readFloorLayout = vi.hoisted(() => vi.fn())
const session = vi.hoisted(() => ({ value: null as unknown }))

vi.mock('@/api/layout', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/layout')>()),
  readFloorLayout,
}))

vi.mock('@/shared/auth', () => ({
  useOptionalSession: () => session.value,
}))

const FLOOR = 'floor-16'

const emptyLayout = {
  floor_id: FLOOR,
  current_layout_version: 'layout-2',
  placements: [],
  stale: 0,
}

beforeEach(() => {
  readFloorLayout.mockReset()
  session.value = null
})

describe('useFloorLayout', () => {
  it('stays on the page store with no session, and says so', () => {
    const { result } = renderHook(() => useFloorLayout(FLOOR))

    expect(result.current.status).toBe('session')
    expect(result.current.ready).toBe(true)
    expect(result.current.store).toBe(sessionLayoutStore)
    expect(readFloorLayout).not.toHaveBeenCalled()
  })

  it('waits while the session is still being verified', () => {
    // Otherwise the editor mounts against the page store, then has to be torn
    // down and rebuilt one tick later when the cached employee arrives.
    session.value = { employee: null, ready: false }
    const { result } = renderHook(() => useFloorLayout(FLOOR))

    expect(result.current.ready).toBe(false)
    expect(readFloorLayout).not.toHaveBeenCalled()
  })

  it('loads the floor and hands over a server-backed store', async () => {
    session.value = { employee: { id: 'admin-1' }, ready: true }
    readFloorLayout.mockResolvedValue(emptyLayout)

    const { result } = renderHook(() => useFloorLayout(FLOOR))

    await waitFor(() => expect(result.current.status).toBe('server'))
    expect(readFloorLayout).toHaveBeenCalledWith(FLOOR)
    expect(result.current.store).not.toBe(sessionLayoutStore)
    expect(result.current.ready).toBe(true)
  })

  it('reports how many saved placements follow an older drawing', async () => {
    session.value = { employee: { id: 'admin-1' }, ready: true }
    readFloorLayout.mockResolvedValue({ ...emptyLayout, stale: 3 })

    const { result } = renderHook(() => useFloorLayout(FLOOR))

    await waitFor(() => expect(result.current.stale).toBe(3))
  })

  it('falls back to the page store when the server refuses, and keeps the reason', async () => {
    session.value = { employee: { id: 'admin-1' }, ready: true }
    readFloorLayout.mockRejectedValue(new ApiError(403, 'permission_denied', 'Không có quyền'))

    const { result } = renderHook(() => useFloorLayout(FLOOR))

    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(result.current.store).toBe(sessionLayoutStore)
    expect(result.current.error).toBe('Không có quyền')
    expect(result.current.ready).toBe(true)
  })

  it('asks for nothing until a floor is chosen', () => {
    session.value = { employee: { id: 'admin-1' }, ready: true }
    const { result } = renderHook(() => useFloorLayout(undefined))

    expect(result.current.store).toBe(sessionLayoutStore)
    expect(readFloorLayout).not.toHaveBeenCalled()
  })
})
