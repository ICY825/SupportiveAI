# Luna handoff: assigning an employee to a seat

> **Historical record.** Written on the date below and not maintained since.
> For how the module works now, read [`engine-architecture.md`](engine-architecture.md)
> and [`persistence.md`](persistence.md); [`README.md`](README.md) explains the split.

Prepared 17 September 2026 for the `lystiger` branch. Three other agents are editing this working tree; section 9 says which files are yours and which are not. Read it before you start.

## 1. Outcome

An administrator can put a named employee in a seat, take them out of it, and move them to a different seat, from the desk inspector on the floor plan. The change is visible immediately: the desk turns `occupied`, the person's name appears in the inspector, and the status counts update.

The change goes through one replaceable store, so that swapping in the existing backend endpoints later is a single object, not a rewrite.

This slice does not connect to the backend. It makes the interaction real and gives the API exactly one seam to arrive at.

## 2. What already exists

Do not rebuild any of this.

- `domain/allocation.ts` — the full model: `Seat`, `Employee`, `Assignment` (time-bounded, with `type: 'permanent' | 'temporary' | 'reservation'`), `Department`, `Device`, `FloorAllocationData`, and `AllocationSource` with `kind: 'demo' | 'api'`.
- `domain/desk.ts` — `deriveDeskStatus` and `buildDeskIndex`. Status is derived from seat state plus active assignments, never stored. An assignment change is enough to change what the map draws; nothing else needs updating.
- `allocation/demoAllocation.ts` — deterministic demo fixtures generated from the physical workstations.
- `components/desk-inspector/deskActions.ts` — the action vocabulary is already written, including `'assign-employee'` (`Gán nhân sự`), `'reassign'` (`Đổi chỗ`) and `'release-seat'` (`Giải phóng chỗ ngồi`), with `PRIMARY_ACTIONS` mapping them per status.
- `components/desk-inspector/DeskInspector.tsx` — a complete inspector that renders those actions and, on click, shows `"<action>" chưa được kết nối API`.
- Backend: `POST /seats/{id}/assign`, `POST /seats/{id}/release`, `GET /resources/history`, `POST /seats/recommend`, against SQLAlchemy models with a real `ResourceAssignment` table.

## 3. Two facts that shape the work

### `DeskInspector` is currently dead code

It renders inside `FloorMapView`, which mounts only when `view === 'verification'`. But its guard chain starts at `FloorPlanningPage.tsx:303`:

```ts
const workspace = view === 'workspace'
const allocation = useMemo(() => (workspace ? createDemoAllocation(dataset, now) : undefined), …)
const selectedDesk = workspace && selected?.kind === 'workstation' ? desks.get(selected.id) : undefined
```

Inside a component that only exists in verification mode, `workspace` is always `false`. So `allocation` is `undefined`, `selectedDesk` is `undefined`, and the inspector never renders for a user. Only the tests reach it.

Do not fix this by showing allocation data in the verification view. `domain/allocation.ts` states that allocation is shown only in workspace mode with a visible demo label, and that rule is correct — the verification view exists to compare the app against the source drawing, and people are not in the drawing.

The workspace view uses its own `CompactInspector`, defined inline in `SpatialWorkspace.tsx`. That is where an administrator actually sees a desk, and that is where the actions have to appear.

### The demo fixtures have no bench

`createDemoAllocation` creates an employee only when a desk needs one. Every generated person already has a seat, so there is nobody to assign. You have to add unseated employees before the feature has anything to do.

## 4. Scope

In:

- an `AllocationStore` seam and a pure mutation model over it;
- assign an employee to an empty seat;
- release the occupant of a seat;
- move an occupant from one seat to another;
- a searchable employee picker;
- validation with stated reasons, shared and pure;
- a demo bench of unseated employees;
- wiring the actions into the workspace inspector.

Out, and do not start any of them:

- reservations, and anything under `'change-reservation'` / `'cancel-reservation'`;
- conflict resolution (`'resolve-conflict'`);
- `'mark-unavailable'` / `'reopen-seat'` — that is the seat-status slice, and it is the honest form of "delete a desk";
- `'delete-desk'`, `'view-history'`, `'view-audit-log'`;
- any HTTP call, any backend change, any employee-directory API;
- reviving `DeskInspector` as the workspace panel;
- touching the 2.5D renderer or the layout editor.

## 5. The seam

Mirror `LayoutStore`, and inherit the lesson it just had to learn.

```ts
export type AllocationMutation =
  | {
      kind: 'assign'
      id: string
      seatId: string
      employeeId: string
      type: AssignmentType
      validFrom: string
      validTo: string | null
      at: string
      actor: string
    }
  | { kind: 'release'; id: string; assignmentId: string; at: string; actor: string }

export interface AllocationStore {
  read(floorId: string): AllocationMutation[] | null
  /**
   * Appends `mutations` to the floor's log. Never replaces it.
   *
   * LayoutStore had to be corrected from replace to merge after saving one
   * editing area silently dropped another. An append-only log cannot have that
   * defect, and it is the shape the backend already stores: ResourceAssignment
   * rows with assigned_at / returned_at, not a current-state blob.
   */
  append(floorId: string, mutations: readonly AllocationMutation[]): Promise<void>
}
```

Apply them purely, the way `applyPlacements` applies layout drafts:

```ts
export function applyAllocationMutations(
  base: FloorAllocationData,
  mutations: readonly AllocationMutation[],
): FloorAllocationData
```

Rules for the apply function:

- `assign` appends an `Assignment`. It does not touch `Seat.status` — status is derived, and writing it would create the second source of truth this model exists to avoid.
- `release` sets `validTo = at` on the named assignment. It never deletes one. `isActive` in `domain/desk.ts` already reads that correctly, and history is the point.
- The function is pure and returns `base` unchanged, same object identity, when `mutations` is empty — the renderer memoises on identity.
- A mutation naming a seat or employee the dataset no longer has is skipped, the same way `mergeStoredPlacements` refuses ids the dataset dropped.

Session-only persistence is fine and already the precedent. Say so in the UI, the way `LAYOUT_EDIT.persistenceNote` does.

## 6. Rules that must not be broken

**A move is one batch.** Assigning someone who already holds an active non-reservation assignment must release the old one in the same `append` call. Two calls can half-apply, and the result is a person sitting at two desks — which `deriveDeskStatus` will not flag, because it counts occupants per seat, not seats per person. This is the most dangerous failure mode in the slice.

**Do not create a conflict from the UI.** Assigning to a seat that already has an active occupant is refused. `Đổi chỗ` is the explicit path, and it releases the sitting occupant first. The `conflict` status stays what it is today: something the data can arrive in, not something an administrator can cause with one click.

**Refuse an unusable seat.** No assignment to a seat whose status is `OUT_OF_SERVICE` or `INACTIVE`.

**Validation is pure and shared**, like `validatePlacement`:

```ts
export function validateAssignment(
  candidate: { seatId: string; employeeId: string },
  context: { seats: readonly Seat[]; assignments: readonly Assignment[]; now: Date },
): { valid: boolean; reasons: AssignmentIssue[] }
```

Reasons are structured, not strings — follow `PLACEMENT_ISSUE` in `labels.ts` for how they become Vietnamese text. At minimum: `seat-unavailable`, `seat-occupied`, `employee-seated-elsewhere` (carrying the other seat's code), `unknown-employee`, `unknown-seat`.

## 7. The demo bench

Add unseated employees to `createDemoAllocation`, deterministically, using the existing `newEmployee` helper and the existing `rand` hashing so the fixture stays reproducible.

- roughly eight per department, ids shaped `emp-bench-<deptId>-<n>`;
- no assignment, no laptop;
- they must not change any seat, any assignment, or any desk status. The 116-desk counts and every existing test must stay exactly as they are — adding people with no assignments cannot move a status, so verify that rather than assuming it.

They carry the same demo labelling as everything else in that file. Nothing here is real.

## 8. Interaction

Entry: the actions already named in `deskActions.ts`, shown in the workspace inspector for the selected desk.

- `available` → **Gán nhân sự**
- `occupied` → **Đổi chỗ**, and **Giải phóng chỗ ngồi** in the overflow

Picking a person: a searchable list in the inspector, not a modal. Filter on name and `employeeCode`. Each row shows the name, the code, the department, and — this matters — the seat they currently hold, if any, so the administrator can see before confirming that this is a move rather than a fresh seating.

Confirming: one action, applied immediately, with an undo affordance rather than a confirmation dialog. Releasing a seat is reversible in this model (it sets `validTo`), so a dialog buys nothing and costs a click on the most common action in the flow.

Refusals are stated, never silent. When validation fails, name the reason where the button is, in the same voice `PlacementStatus` uses for an invalid placement.

Copy goes in `labels.ts` next to `LAYOUT_EDIT`, as a single `SEAT_ASSIGNMENT` object. Do not inline Vietnamese strings in components; nothing else in this feature does.

## 9. File ownership

Three other agents are in this tree right now.

Yours, nobody else is in them:

- `frontend/src/features/floor-planning/allocation/` — `demoAllocation.ts`, and a new `allocationStore.ts`
- `frontend/src/features/floor-planning/domain/assignment.ts` — new, for `validateAssignment`
- `frontend/src/features/floor-planning/components/desk-inspector/` — including a new employee picker
- `frontend/src/features/floor-planning/pages/FloorPlanningPage.tsx`
- new test files under `__tests__/`

Additive only, coordinate before saving:

- `labels.ts` — append a `SEAT_ASSIGNMENT` block, change nothing else in the file.

**Do not touch.** These are being actively edited and your edits will be lost or will destroy theirs:

- `workspace/SpatialWorkspace.tsx`, `workspace/AreaMinimap.tsx`, `workspace/scene.ts` — codex, locator map
- `workspace/WorkspaceScene.tsx`, `workspace/workspace.css` — agy, coloured sections

This creates one dependency you cannot resolve yourself: the actions have to appear in `CompactInspector`, which lives inside `SpatialWorkspace.tsx`.

Do everything else first. Build the store, the mutations, the validation, the bench, the picker, and the tests, all against the seam, with the picker as a standalone component that takes its data as props. Leave the mount as a final, separately reviewable patch: give `CompactInspector` an actions footer and pass the handlers down. When codex lands, that patch is under twenty lines.

Do not swap `CompactInspector` for `DeskInspector`. Whether the workspace should adopt the richer inspector — and what to do about it being dead code — is a decision for after this slice, not a thing to settle while two people are editing the file.

## 10. Contract gaps with the backend

Record these in your implementation report. They are why this slice stops at the seam, and somebody has to resolve them before the API arrives.

```text
frontend Assignment        backend ResourceAssignment
  validFrom / validTo        assigned_at / returned_at  (no future dating)
  type: permanent |          no type column
        temporary |
        reservation
  employeeId: string         employee_id: int
  seatId: string             resource_id: int
```

Concretely:

- the backend cannot express a reservation or a future-dated assignment, so `type` has nowhere to go;
- seat identity is `ws-16-065` on one side and an autoincrement integer on the other, with `Resource.code` as the only plausible bridge;
- the backend seeds Floor 19 from a wireframe while the frontend renders Floor 16 from CAD extraction — they describe different floors.

Design the store against the *frontend* model, which is the richer one, and let the adapter lose what the backend cannot hold. Do not degrade the frontend model to match the table.

## 11. Tests

1. `applyAllocationMutations` returns the same object when given no mutations.
2. An `assign` turns a desk from `available` to `occupied`, and the count of `available` drops by exactly one.
3. A `release` turns `occupied` back to `available` and leaves the assignment in place with `validTo` set.
4. A move emits both mutations in one `append` call, and the employee holds exactly one active assignment afterwards.
5. Assigning to an occupied seat is refused with `seat-occupied`, and no mutation is appended.
6. Assigning to an `OUT_OF_SERVICE` seat is refused with `seat-unavailable`.
7. Assigning someone who is seated elsewhere, without the move batch, is refused with `employee-seated-elsewhere` naming the other seat's code.
8. Mutations referencing a seat or employee absent from the dataset are skipped, not thrown on.
9. The bench adds unseated employees and changes no desk status — assert the full status histogram before and after.
10. The picker filters on both name and employee code, and shows the current seat for someone who has one.
11. The store appends rather than replaces: two separate `append` calls both survive.

Test the mutation and validation layers directly, without rendering, the way `layoutPersistence.test.ts` tests the editor. Reserve rendered tests for the picker and the inspector footer.

## 12. Gates

`vitest run`, `tsc -b`, `oxlint`, `vite build`, `git diff --check`. Every existing test must stay green — in particular the 116-desk count and the status histogram assertions in `FloorPlanningPage.workspace.test.tsx`.

## 13. Stop conditions

Stop when an administrator can seat, unseat and move a person, and the store has a single, documented commit boundary.

Do not, in this slice: call the backend, change the backend, add reservations, resolve conflicts, add seat-status editing, revive `DeskInspector`, or make allocation data visible in the verification view.

## 14. Open questions

These belong to Admin/HR, not to the implementation. Keep them visible in the report.

```text
who may assign a seat, and does it need approval?
can a person hold two seats legitimately (e.g. two sites)?
is a release effective immediately, or at end of day?
does an assignment need a reason or ticket reference?
source label MÔ HÌNH & NỀN TẢNG AI (145) versus 116 extracted desks — still unresolved,
and it blocks any capacity number this feature would produce
```
