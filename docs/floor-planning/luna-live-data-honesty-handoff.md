# Handoff: make the seating view tell the truth when it is talking to the server

Prepared 18 September 2026 for the `lystiger/dev` branch, from a read of what
`d5de693`, `6337739` and `064e991` actually shipped.

**The situation:** the map now reads and writes real seat assignments. Everything
in the happy path works — sign in, see who sits where, search the staff
directory, seat someone, release them. What has not been faced is **what the
screen does when the server disagrees**, and **what it claims to know that it
does not**.

Three of the four items below are defects in code that is already on `main`, not
new features. One of them, §2, cannot be hit without a session, which is exactly
why it survived the tests.

## 1. What already works — do not regress it

- Live data replaces the demo fixtures on sign-in, and the "dữ liệu minh họa"
  badge disappears on its own because it keys off `source.kind`.
- The seat id the UI uses is translated to `workstation_id` in exactly one
  place, `allocation/apiAllocationStore.ts`. Keep it that way.
- Assignments carry the id the server issued, so release addresses a row that
  exists.
- The picker searches the real staff directory, debounced, and discards answers
  that arrive after a newer keystroke.
- Backend refuses a seat code the drawing does not contain, and says why.

## 2. Undo posts an id the server has never seen

The clearest defect. Reproduce it signed in: seat someone, then press undo.

`SpatialWorkspace.tsx:410` records the inverse of every batch. For an `assign`,
`inverseAllocationMutations` (`allocation/allocationStore.ts:162`) builds a
`release` whose `assignmentId` is `mutation.id` — the **local** id that
`planAssignment` invented, of the form `asg-<seat>-<employee>-<timestamp>`.

With the demo store that is correct: the local id is the only id there is. With
the API store it is wrong, because the row on the server carries a uuid the
backend issued. Undo therefore sends

```text
POST /api/seats/assignments/asg-seat-ws-16-001-emp-3-1758…/release
```

and gets a 404. The screen, meanwhile, has already drawn the desk as free.

Two ways to fix it, and the choice matters:

1. **Re-plan the inverse from live state.** After the refetch that follows a
   write, look up the assignment by `workstation_id` and use its real id. Honest,
   and keeps undo working across a reload.
2. **Drop undo in live mode.** Hide the control when `allocationStore` is the API
   one. Cheap, and defensible — the server has `release`, which is the real undo,
   and a local undo stack over a shared database is a lie the moment two people
   edit the same floor.

I lean to (2) for this slice and (1) only if someone asks for it. Undo over
shared state promises something a single-user buffer cannot deliver: two admins
on the same floor, and one's undo silently reverses the other's work.

## 3. A refused write disappears

`SpatialWorkspace.tsx:412` and `:424`:

```ts
void allocationStore.append(dataset.layout.floor.id, mutations).then(() => onAllocationCommitted?.())
```

No `catch`. `createApiAllocationStore` rethrows after calling `onError`, and the
page never passes `onError` — grep it, there is no call site. So a 409 (seat
taken by someone else since the page loaded), a 403, or a dropped connection
becomes an unhandled rejection in the console, while the optimistic local state
keeps showing the change as though it succeeded.

What it should do:

- revert to the state before the batch, or refetch, which is simpler and already
  wired through `onAllocationCommitted`;
- say what happened in the desk panel, in the same place the assignment notices
  already appear (`SEAT_ASSIGNMENT.assigned`, `…released`), using the message the
  backend sent — those messages are written for the reader, e.g. *"Chỗ ngồi
  ws-16-001 đang được cấp cho Lưu Hải Nam"*.

The 409 is not hypothetical. Two admins planning the same floor is the normal
case for this module, and the partial unique index means the second one loses.

## 4. Stop asserting seat facts we do not have

`allocation/liveAllocation.ts:49-50` gives every seat `status: 'ACTIVE'` and
`seatType: 'FIXED'`. Nothing in the dataset or the database says either. The desk
panel then prints them as fact.

This is the same mistake the file's own header warns against — devices, presence
and department were deliberately left empty there, and then status and seat type
were filled in anyway because the types demanded a value.

Fix the types, not the data: make `status` and `seatType` optional on `Seat`, and
have the panel omit the row when the answer is unknown. A blank is honest; a
wrong value invites someone to plan around it.

Related, and bigger: `domain/allocation.ts:27` still models `departmentId`,
`capabilities`, `verifiedBy` and `verifiedAt` on `Seat`, none of which any
endpoint answers. Either the model narrows to what the dataset plus
`seat_assignment` can answer, or a `seat` table becomes a real decision —
ADR 0002 §4 left that open on purpose. Decide it before adding a fifth field
nobody fills.

## 5. `reconcile` has no screen

`GET /api/seats/floors/{id}/reconcile` exists, is tested, and nothing calls it.
It reports assignments pointing at desks the current drawing no longer has
(`missing-seat`) or assigned under an older drawing (`old-layout`).

It only matters after a re-extraction, so it does not need to be beautiful. A
line in the floor header when `stale.length > 0`, naming the count and linking to
a list, is enough. Without it the answer sits in an endpoint nobody will think to
curl at the moment it starts mattering.

## 6. Out of scope here, but it is the next slice

Every write sends `decision: 'manual'`, hard-coded in
`allocation/apiAllocationStore.ts`, because the map never suggests a seat. The
vocabulary agreed in ADR 0002 §8 is `accept` / `override` / `manual`, and
`accept` and `override` are only meaningful once something proposes a seat.

Which means **Đề 1's headline KPI currently has no numerator**. README §11 asks
for "tỷ lệ gợi ý chỗ ngồi được chấp nhận không sửa". Today that ratio is zero
over zero, and it will stay that way through the pilot unless a suggestion exists
to accept or override.

That is a design slice, not a bug fix: what does the system propose when someone
new joins a department — nearest free seat inside the department zone, nearest to
the team, respecting the wing? Worth its own handoff and its own argument.

## 7. Scope

In: §2, §3, §4, §5.

Out:

- the seat-suggestion engine of §6 — next slice, and it needs a decision first;
- the `Seat` model narrowing beyond making two fields optional — that is ADR
  territory;
- anything in `features/mail` or `features/lockers`;
- backend changes. Every endpoint this slice needs already exists.

## 8. Order

1. §3, the swallowed failure. It is the one that loses a user's work silently,
   and fixing it gives §2 somewhere to report from.
2. §2, undo. Decide (1) or (2) first, in writing, before touching code.
3. §4, the invented fields. Small, and it stops the lie spreading to a fifth
   field.
4. §5, the reconcile notice.

## 9. Tests

1. A 409 from the server leaves the desk showing its real occupant, not the
   optimistic one, and the reason appears in the desk panel.
2. A network failure on assign does the same, with a generic message.
3. Undo, in whichever direction §2 is decided: either it releases the row the
   server actually created, or the control is not offered at all in live mode.
4. A seat with no known status renders no status row, rather than "ACTIVE".
5. `reconcile` returning `stale` renders the notice; returning `[]` renders
   nothing.
6. The demo path keeps every behaviour it has today — that is what the existing
   40 test files are for; they must stay green untouched.

Gates: `npx vitest run`, `npx tsc -b`, `npx oxlint`, `npx vite build`, and
`git diff --check`.

## 10. File ownership

Free: `allocation/*`, `components/desk-inspector/*`, `labels.ts`, new tests.

Coordinate: `workspace/SpatialWorkspace.tsx` — it is the biggest file in the
module and everything lands there eventually. `pages/FloorPlanningPage.tsx` —
whoever holds the floor picker.

Do not touch: `data/floors/**` and `tools/floorplan_extract/` (generated),
`backend/app/modules/resource_allocation/seat/` (this slice needs nothing new
from it), anything under `features/mail` or `features/lockers`.

## 11. Open questions

```text
undo in live mode — re-plan from server state, or drop the control?
two admins on one floor — last write wins, or lock the floor while editing?
does a seat have a status at all, or only an assignment? (ADR 0002 §4)
```

The second one is worth asking the facilities owner before building anything:
the answer decides whether §3 is a message or a whole conflict-resolution flow.

### A note on `SeatStatus`, since it keeps coming up

`domain/allocation.ts:16` has `'ACTIVE' | 'INACTIVE' | 'RESERVED' |
'OUT_OF_SERVICE'`, and `validateAssignment` refuses to seat anyone on the last
two. No requirement asked for it. It exists because ADR 0001 §4 created `Seat`
speculatively and because the shared wireframe palette has an `unavailable`
colour; the only code that ever sets it is `demoAllocation.ts:211,227`, which
breaks one desk so the grey chip is visible.

Do not build a maintenance record for it. The single consequence worth caring
about is the capacity answer — *"Khu vực F đã kín. Không còn chỗ trống"* is
wrong if some of those desks cannot be used at all — and that only bites if
unusable desks actually exist.

So ask Hương one question, in these words:

```text
Trong thực tế có chỗ ngồi nào không dùng được không — hỏng ghế, mất điện,
đang sửa? Nếu có thì hiện giờ ai biết và ghi ở đâu?
```

"Hiếm, không ai ghi" → delete the concept: drop `status` from the live seat,
remove the `unavailable` branch, and the count is honest because every desk in
the drawing is a desk someone can sit at. "Có, HC giữ một danh sách" → it is a
column on a future `seat` table and a separate decision, not something to invent
here.
