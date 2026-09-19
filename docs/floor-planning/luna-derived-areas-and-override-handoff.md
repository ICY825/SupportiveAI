# Handoff: derived sections, and letting reality overrule the drawing

Prepared 19 September 2026 for the `lystiger/dev` branch, after the payload
split, the server-side layout store and the documentation split landed.

Read [`engine-architecture.md`](engine-architecture.md) and
[`persistence.md`](persistence.md) first — they describe the module as it is
now and are kept true. The dated handoffs in this folder are frozen history and
do not describe current behaviour.

This handoff exists because of a scaling review before Floor 16 is repeated
across the other seven VSF floors. It carries two decisions that were taken by
the product owner and are **not derivable from the code**. They are recorded in
section 2 as decisions, not as recommendations.

## 1. Starting state

`lystiger/dev` at `4d7b466`. Gates on that commit:

```text
cd frontend
npx vitest run     43 files, 425 tests passed
npx tsc -b         clean
npx oxlint .       exit 0, 17 warnings (pre-existing react rules), 0 errors
npx vite build     succeeded; entry chunk 567.39 kB raw / 171.93 kB gzip
cd backend
.venv/bin/pytest   402 passed, 8 skipped
```

**The working tree is dirty and the changes are yours.**
`workspace/SpatialWorkspace.tsx` and `__tests__/FloorPlanningPage.workspace.test.tsx`
carry your split into `useSpatialWorkspaceRuntime` + `SpatialWorkspaceContent`
and the department-picker catalog. They were deliberately left uncommitted and
unmodified. Commit or discard them before starting; do not let this work absorb
them silently.

`lystiger/experiment` exists, cut from the same commit. **Nothing in this
handoff belongs on that branch** — see section 5.

## 2. The two decisions

These were taken on 19 September 2026 after reviewing Floor 16 against the real
office. Treat them as given.

### 2.1 A section is derived, never drawn

Sections stop being authored geometry. `DISPLAY_AREAS` in
`tools/floorplan_extract/floors/floor16.py` is deleted at the end of slice A,
and no floor config ever gains one again.

**Why.** The six AI areas are hand-measured bboxes in PDF points. Three of the
five zones on Floor 16 have none at all, so `displayAreas.ts`
`buildWorkspaceDisplayAreasForScope` falls back to one area per zone — which is
why BẤT ĐỘNG SẢN - SMART CITY presents 143 desks as a single "Khu vực A". Eight
floors times five departments of hand-measured rectangles is not a plan, and
every re-extraction invalidates them.

Target size is **about 20 desks per section**. That number is not arbitrary: the
seven existing AI sections average 22, so it is the size the team already chose
by hand.

### 2.2 The drawing can be wrong, and a person outranks it

A placement that conflicts only with extracted geometry is **saveable**, with
the conflict recorded and shown. It is no longer refused.

**Why.** Desks move in the real office without the admin room being told. On
Floor 16 there are two tables against the angled facade at the north end of the
AI area that physically exist and cannot be represented at all today. The PDF is
a record of what was drawn, not of what is there.

This extends a rule the project already holds rather than inventing one. ADR
0002 §5 already says of a re-extraction that it

> changes nothing, since releasing someone's seat over a drawing change is a
> person's decision.

The same principle, applied to geometry instead of occupancy.

**Severity is decided by source confidence, not by object class.** This is the
part most likely to be got wrong, so it is stated explicitly:

| Tier | Condition | Behaviour |
| --- | --- | --- |
| Hard | Outside the floor plate; overlaps another desk or chair; non-positive dimensions | Refuse. True regardless of what the drawing got right. |
| Hard | Conflicts with geometry whose `verification` is `SOURCE_VERIFIED` | Refuse. |
| Overridable | Conflicts with geometry whose `verification` is `EXTRACTED` or `UNVERIFIED` | Save, with an override record and the conflict visible. |

Do **not** tier by object kind. All 128 obstacles on Floor 16 are `EXTRACTED`,
including all 34 columns and all 4 walls, and 90 of the 128 are inferred
door-swing sectors rather than physical objects. Treating "column" as
unoverridable and "department zone" as overridable would make inferred geometry
stricter than annotated geometry, which is backwards.

**An override is not a verification state.** `VerificationState` records where
geometry came from. An override records that a named person overruled the
drawing on a date for a reason. Keep them separate; do not downgrade an entity
to `UNVERIFIED` to express an override.

### 2.3 This amends ADR 0002 §4, and that has to be written down

ADR 0002 §4 says, in as many words:

> The extracted dataset is the truth for geometry; the database holds
> assignments.

Decision 2.2 narrows that: the dataset remains the truth for **what exists** —
which desks, rooms and obstacles the floor has — and stops being the final word
on **where a desk may stand**. A person with the floor in front of them can
overrule the drawing, and the database records that they did.

That is a real change to a decision with named stakeholders; @CongDuc02 is named
in §5 for requiring the compensations that made the no-foreign-key design
acceptable. Do not let it land as a side effect of a UI change.

**Before slice B merges**, write the amendment — either a revision of 0002 §4 or
a new ADR that supersedes it — stating the narrowed scope, why (desks move
without the admin room being told), and the compensations: the override carries
an actor, a reason and a timestamp; `reconcile` reports overrides separately
from drift; hard conflicts stay hard. Take it to the owners the way 0002 was
taken. If they decline, slice B stops and slice A still stands on its own.

## 3. Slice A — derived sections

### 3.1 What already exists

The extractor already divides the floor. `extract_floor.py` emits connected
components of touching desks as clusters, and `floor16.workstations.json`
carries 61 of them. Each has `id`, `zoneId`, `zoneIds`, `verification`,
`center`, `bbox`, `gridRef` and `workstationIds`.

```text
BẤT ĐỘNG SẢN - SMART CITY   143 desks  22 clusters  [10,10,10,9,9,8,8,6,6,6,6,6,6,6,6,6,6,5,4,4,4,2]
MÔ HÌNH & NỀN TẢNG AI       116 desks  21 clusters  [10,8,8,8,8,8,6,6,6,6,6,5,5,4,4,4,4,4,2,2,2]
VINFAST-KDO2O                46 desks   5 clusters  [10,9,9,9,9]
KINH DOANH & VẬN HÀNH GSM    38 desks   7 clusters  [6,6,6,6,6,4,4]
MÔ HÌNH & NỀN TẢNG AI (2)    38 desks   5 clusters  [8,8,8,8,6]
```

The missing layer is **grouping** those clusters into human-sized sections. It
is not an extraction problem and it needs no new data.

### 3.2 Required behaviour

1. A pure function over clusters. Given a department's clusters, it returns
   sections. No React, no dataset mutation, no I/O.
2. **Every desk lands in exactly one section.** No desk may be unreachable from
   the picker; that defect has happened before and the comment at
   `displayAreas.ts` `leftoverByZone` records it.
3. **A cluster is never split.** Desks that physically touch stay together.
   Cluster sizes are 2–10, so ~20 packs two to four whole clusters.
4. Sections are spatially contiguous — a section is neighbouring clusters, not
   the nearest ones by desk count.
5. A section never spans two departments.
6. **Ids derive from the sorted cluster ids they contain**, so a re-extraction
   that leaves a group intact leaves its id intact. An id that changes whenever
   any desk moves is worse than no id: saved placements and any future saved
   section preference would silently repoint.
7. Labels stay `Khu vực A/B/C…`, ordered deterministically by position, not by
   iteration order.
8. A person may rename a generated section later. A person may not draw its
   geometry. Renaming is out of scope for this slice — just do not design it
   out.

### 3.3 Constraints

Target ~20, do not hard-code a section count. BDS must arrive at its number from
the rule, not from a table saying "BDS → 7". A floor config that names section
counts is the same defect in a new place.

Do not turn a section into a `Zone`. `handoffs.md` §6.2 set that rule for display
areas and it still holds: a section is a UI grouping, not a business or physical
boundary, and it must not acquire `Zone` semantics or appear in `zones.json`.

Do not change cluster extraction. If clusters are wrong, that is a separate
finding — report it, do not fix it here.

### 3.4 Acceptable fallback

If the rule cannot produce sane sections for BDS — for instance if its 22
clusters are so spread that contiguous grouping yields one section of 60 and
five of 4 — **stop and report it**. Do not reintroduce authored geometry to
paper over it, and do not widen scope to change the extractor. A written finding
that says "geometry-only grouping does not work for this shape, here is the
evidence" is a successful outcome for this slice. Silently adding a curated
bbox back is not.

### 3.5 Tests

1. Every desk in a department appears in exactly one section.
2. No section contains desks from two departments.
3. No cluster is split across sections.
4. Section sizes cluster around 20 — assert a band, not an exact number, and
   state the band in the test name.
5. Running the function twice on the same input gives identical ids and order.
6. Removing one desk from one cluster does not change the ids of sections that
   did not contain it.
7. BDS's 143 desks produce more than one section. This is the regression that
   matters most; it is the defect the slice exists to remove.
8. Floor 16's section count and membership are recorded in a snapshot so a
   change in the rule is visible in review rather than silent.

### 3.6 Closing the slice

Delete `DISPLAY_AREAS` from `tools/floorplan_extract/floors/floor16.py`, stop
emitting `*.display-areas.json`, and remove the curated branch from
`buildWorkspaceDisplayAreasForScope`. Removing the authored path is what proves
the derived one works; leaving both in place means nobody finds out.

`validateDisplayAreaDefinitions` goes with it. Update
[`engine-architecture.md`](engine-architecture.md) §2 and
[`adding-a-floor.md`](adding-a-floor.md), which both currently describe the
artifact.

## 4. Slice B — severity and override

### 4.1 What blocks it today

`validatePlacement` returns `valid: false` for any reason at all
(`domain/placement.ts`, the final return), and three separate places refuse on
that single flag:

| Where | Refuses |
| --- | --- |
| `workspace/useLayoutEditor.ts` `save` | saving a draft while any placement is invalid |
| `workspace/EditPanel.tsx` `blocked` | enabling the save button |
| `workspace/SpatialWorkspace.tsx` `commitPendingDesk` | creating a new desk at all |

So a desk outside a department zone can be dragged and never committed. The data
model is not the limit — `SpatialPlacement` already carries free x/y, width,
depth, real rotation, chair and seated side, and `layout_placement` persists all
of it. The limit is policy.

### 4.2 Required behaviour

1. `PlacementIssue` gains a severity, derived per §2.2 from the `verification`
   of the geometry that produced the conflict. Do not add a hand-maintained list
   of which issue types are hard.
2. `PlacementValidation` distinguishes "cannot be saved" from "can be saved with
   an override". Keep `valid` meaning what it means today for hard issues so
   existing call sites stay correct, and add the softer state alongside rather
   than redefining the flag under them.
3. Saving a placement with only overridable conflicts requires an explicit act —
   the user confirms, and the confirmation carries a reason. It is never the
   default path and never silent.
4. The override is persisted with the placement: who, when, why, and which
   conflicts were outstanding. `layout_placement` already has `updated_by`;
   add the reason and the recorded conflicts. One migration, additive.
5. The UI states the conflict on a desk that carries an override, permanently —
   not only at the moment of saving. Someone opening the floor next month must
   see that this desk disagrees with the drawing and why.
6. `reconcile` reports overridden placements distinctly from stale ones. They
   are not drift; they are recorded decisions.
7. Creating a new desk follows the same rule as moving one. A single-desk
   creation tool that is stricter than the drag path is the same bug in a new
   place.

### 4.3 Constraints

Do not weaken the hard tier to make a case pass. If a desk genuinely overlaps
another desk, say so and refuse.

Do not reuse `VerificationState` to express an override — §2.2.

Do not change `boundaryTolerance` semantics. Hand-drawn zone edges still need
the slack documented in `PlacementContext`, and that is a separate concern from
overriding a conflict.

The override is a layout fact, not a seat fact. It belongs in the `layout`
module; `seat` holds no geometry and that must stay true.

### 4.4 Tests

1. A desk overlapping another desk is refused, with or without an override.
2. A desk outside the floor plate is refused.
3. A desk outside a department zone whose `verification` is `EXTRACTED` can be
   saved with an override and refused without one.
4. A conflict against `SOURCE_VERIFIED` geometry cannot be overridden.
5. An overridden placement round-trips through save, reload and re-edit with its
   reason and its recorded conflicts intact.
6. The two facade desks on Floor 16 — the ones that exist in the real office and
   cannot be represented today — can be created, moved, saved, reloaded and seen
   to carry their conflict. This is the acceptance case; if it does not work the
   slice is not done.
7. Every currently valid placement stays valid and saves by exactly the path it
   does today. No confirmation appears where none appeared before.

## 5. Where this work goes

**On `lystiger/dev`. Not on `lystiger/experiment`.**

The experiment branch is for replacing the isometric renderer with a shared
top-down canvas. Both renderers need derived sections and the override policy,
so building them on the experiment branch would make the comparison meaningless
— it would be new-rules-top-down against old-rules-isometric, with no way to
tell which variable moved the result — and would force a port back if the
experiment fails.

Land both slices on `lystiger/dev`, then merge `dev` into `experiment` before
any renderer comparison begins.

Do not combine slice A and slice B in one commit. They touch different layers
and need different evidence.

## 6. Files to inspect first

- `frontend/src/features/floor-planning/workspace/displayAreas.ts`
- `frontend/src/features/floor-planning/domain/placement.ts`
- `frontend/src/features/floor-planning/workspace/useLayoutEditor.ts`
- `frontend/src/features/floor-planning/workspace/EditPanel.tsx`
- `frontend/src/features/floor-planning/workspace/SpatialWorkspace.tsx`
- `frontend/src/features/floor-planning/domain/spatial.ts` (`VerificationState`, `FloorDisplayAreaDefinition`)
- `backend/app/modules/resource_allocation/layout/` (models, schemas, service)
- `tools/floorplan_extract/floors/floor16.py` (`DISPLAY_AREAS`, to be deleted)
- `data/floors/floor-16/floor16.workstations.json` (`clusters[]`)
- display-area, placement and layout-editor tests under `frontend/src/features/floor-planning/__tests__/`

## 7. Verification gates

Run the narrow tests for the slice first. Before handing work back:

```text
cd frontend
npx vitest run
npx tsc -b
npx oxlint .
npx vite build
cd ../backend
.venv/bin/pytest
TEST_DATABASE_URL=postgresql+psycopg://supportive:supportive@localhost:5433/postgres .venv/bin/pytest tests/test_migrations.py
cd ..
git diff --check
```

The `TEST_DATABASE_URL` run is not optional for slice B. Without it alembic is
never exercised — `conftest.py` builds the schema with `create_all` — and a
migration can be missing, wrong, or unapplied while the suite stays green. That
is exactly how `layout_placement` reached a running server and returned 500.

After migrating, apply it to the dev database (`alembic upgrade head`) and say
in the report that you did. Writing a migration is not the same as having one.

For slice A, unit tests are not sufficient on their own: open the workspace at a
representative desktop viewport and check every department's section picker,
BẤT ĐỘNG SẢN - SMART CITY in particular.

Report the exact commands and results.

## 8. Definition of done

- No authored section geometry exists anywhere in the repository.
- Every department on Floor 16 presents sections of roughly twenty desks,
  produced by rule, and every desk is reachable from the picker.
- Adding a floor requires extraction and a registry entry only — no section
  drawing, no floor-specific UI code.
- A desk that conflicts only with extracted geometry can be created, moved,
  saved, reloaded and seen to carry its conflict and its reason.
- A desk that overlaps another desk, or sits outside the floor plate, is still
  refused.
- ADR 0002 §4 has been amended or superseded in writing, and the owners have
  seen it — see §2.3. Slice B does not merge before this.
- Every gate above passes and the exact results are reported, including the
  Postgres migration run and the `alembic upgrade head` against the dev database.
