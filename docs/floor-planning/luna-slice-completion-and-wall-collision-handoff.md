# Handoff: finish the derived-sections slices, then make walls real

Prepared 19 September 2026 for the `lystiger/dev` branch. Continues
[`luna-derived-areas-and-override-handoff.md`](luna-derived-areas-and-override-handoff.md),
which is still the specification for slices A and B — read it first. This
document covers three things that came out of reviewing the work in progress:
what is left to finish, one decision that is now settled, and the slice that
follows.

Read [`engine-architecture.md`](engine-architecture.md) and
[`persistence.md`](persistence.md) for how the module works today. The dated
handoffs in this folder are frozen history.

## 1. Where the work actually is

Slices A and B are implemented. The implementation is sound — this section is
not a criticism of it, it is the list of what has to happen before it can be
called done.

Measured on 19 September 2026:

```text
branch             lystiger/experiment          ← wrong branch, see 1.1
committed          nothing; 29 files uncommitted
frontend vitest    54 failed | 376 passed (430), 11 files failing
backend pytest     403 passed, 8 skipped
tsc -b             clean
migration guard    passes against Postgres
dev database       at 0007 — already applied for you, see 1.4
```

What is already right and should not be redone: `DISPLAY_AREAS` is deleted,
`floor16.display-areas.json` is gone, ADR 0003 is written, the override is
properly enforced (confirmation dialog, required reason, persisted, shown
afterwards), and `severity` is attached non-enumerably so existing fixtures
still match. The five new tests in `derivedAreas.test.ts` and
`placementOverride.test.ts` pass and cover the invariants that matter most.

### 1.1 Move it to `lystiger/dev`

All 29 files are on `lystiger/experiment`. Section 5 of the previous handoff
puts both slices on `lystiger/dev`, because the top-down renderer experiment
needs them on both sides of the comparison or it measures two variables at once.

Nothing is committed, so this is cheap:

```bash
git stash -u
git checkout lystiger/dev
git stash pop
```

### 1.2 The 54 failing tests

They are not product defects. Every one is an old test asserting the contract
the slices deliberately replaced. They still have to be rewritten — a red suite
cannot demonstrate that removing the authored path worked, which is the whole
point of §3.6 of the previous handoff.

| File | Failing | Why |
| --- | --- | --- |
| `placement.test.ts` | 11 | asserts `valid === false` for obstacle and room conflicts, which now return `valid: true, requiresOverride: true` |
| `FloorPlanningPage.workspace.test.tsx` | 8 | reaches for desks that moved to different sections |
| `adversarialM2.test.ts` | 7 | same contract change as `placement.test.ts` |
| `placementBoundaryTolerance.test.ts` | 6 | same |
| `challenger_m2_2.test.ts` | 6 | same |
| `workspaceScene.test.ts` | 6 | asserts curated display-area metadata and "seven disjoint display areas" |
| `areaFraming.test.ts` | 3 | frames areas that no longer exist under those ids |
| `layoutEditor.test.tsx` | 3 | asserts Save is disabled on a column collision |
| `challenger_m3_1.test.tsx` | 2 | section membership |
| `challenger_m3_2.test.tsx` | 1 | section membership |
| `floor16.dataset.test.ts` | 1 | display-area artifact |

Rewrite them to the new contract. Where a test asserted "refused", it should now
assert "requires an override, and is refused without one" — do not simply delete
the assertion. One crash to be aware of rather than puzzle over:
`placement.test.ts:350` throws `Cannot read properties of undefined (reading
'scope')` because it looks up the curated id `ai-area-d`, which no longer exists.

### 1.3 Tests still missing

The previous handoff enumerated eight tests for slice A (§3.5) and seven for
slice B (§4.4). Five exist. The gap that matters most is **§4.4.6**, the
acceptance case:

> The two facade desks on Floor 16 — the ones that exist in the real office and
> cannot be represented today — can be created, moved, saved, reloaded and seen
> to carry their conflict.

That is the reason the slice exists. Without it, nothing proves the feature
works end to end.

### 1.4 The migration was applied for you

`0007_layout_override` was written and verified but had never been run against
the development database, so the first override save would have returned 500 —
the same failure `layout_placement` itself caused on 19 September. It has been
applied; the dev database is at `0007` with `override_reason` and
`override_conflicts` present.

This is a recurring failure and it is worth the habit: after writing a
migration, run `alembic upgrade head` and say in the report that you did.
Writing a migration is not the same as having one.

## 2. Decision: nothing extracted is hard

A question was raised during review — should a desk sitting inside a concrete
column be refused outright, rather than merely overridable? **The answer is no.
Leave the behaviour exactly as implemented.** Everything extracted stays
overridable.

The reasoning is not "columns are badly extracted". They are extracted well:
34 of them from the dedicated `KT-Betong` CAD layer, 29 of the 34 exactly the
same size, each named by grid reference, with no unmapped CAD layers.

The reasoning is **coverage**. `validatePlacement` only ever consults
`context.obstacles`, and the whole of that is:

```text
34  concrete columns
 4  core-wall blobs
90  inferred door swing sectors
```

Ordinary walls and partitions are not obstacles at all. They are drawn from the
`walls` and `partitions` base layers and never collision-tested;
`sceneWallSegments` feeds only the align-to-wall hint at `layoutDraft.ts:382`.

So a hard tier on columns would refuse a desk on a pillar while accepting one
placed in the middle of a wall. That is not a safety rule, it is an
inconsistency that would teach users the warnings are arbitrary. Warn on
everything extracted until the model of the building is complete enough for a
refusal to mean something.

The only hard failures remain: overlapping another desk or chair, outside the
floor plate, non-positive dimensions. They are true regardless of what the
drawing got right.

## 3. Slice C — walls become real, departments become labels

Do not start this until slices A and B are committed on `lystiger/dev` with the
gates passing. It is written here while the evidence is fresh.

### 3.1 The idea

Two changes that only make sense together:

1. **Walls and partitions become obstacles**, so a desk is validated against
   physical geometry.
2. **Department containment stops being a constraint** and becomes a label.

A department zone is a coloured shape someone drew on a PDF to record *whose
desks these are*. It was never a physical limit, and treating it as one is what
currently makes two real tables against the angled facade unrepresentable. A
wall is physical. Validate against the wall; let the department say who sits
there.

The effect on the acceptance case is worth stating plainly: after slice C those
two facade tables become **plainly valid** — no warning, no override, no reason
to type — because they do not cross a wall. That is a better outcome than
slice B gives them, and it is why slice C is worth doing rather than living with
accumulated overrides.

### 3.2 Why it is affordable

The segments already exist and are already extracted today for the
align-to-wall hint:

```text
walls        5,299 segments      0 curved subpaths
partitions     676 segments      4 curved subpaths
facade      30,421 segments    378 curved subpaths
structure   40,479 segments
```

Walls plus partitions is about 6,000 straight segments for the entire floor, and
`buildWorkspaceScene` already clips layers to the editing area, so a section
sees a fraction of that. `sourcePathSegments` in `scene.ts` already produces
them. A desk-versus-segment test is about fifteen lines and belongs beside the
existing separating-axis test in `placement.ts`.

### 3.3 Constraints

Start with `walls` and `partitions` only. **Leave `facade` and `structure`
out.** Facade is 30,421 segments with 378 curved subpaths that
`sourcePathSegments` skips by design, and structure is 40,479 segments that
duplicate the column obstacles already modelled. Adding them is a separate
decision with its own evidence.

Wall collision does **not** remove the override. The wall model will have its
own holes — four curved partition subpaths are skipped, facade is excluded, and
a wall with a door opening has a real gap in its segments. Conflicts against
wall geometry stay overridable for exactly the reasons in section 2.

Measure before and after. Segments per section after clipping, and validation
time for one drag across a populated section, against the ~210 ms area-switch
and 6,234 ms interactivity baselines in
[`floor16-performance.md`](floor16-performance.md). If a drag becomes visibly
slower, a bounding-box broad-phase over segments comes before any other
optimisation.

Demoting the department is a second ADR-level change, like the one in ADR 0003.
It narrows what a `Zone` means. Write it down before it lands; do not let it
arrive as a side effect of adding wall collision.

### 3.4 Tests

1. A desk crossing a wall segment reports a conflict.
2. A desk flush against a wall, not crossing it, does not.
3. A desk outside its department zone, crossing no wall, is **valid with no
   warning at all** — this is the facade case, and it is the point of the slice.
4. A desk in a doorway gap is not flagged by wall collision. Assert the
   behaviour deliberately rather than discovering it.
5. All 364 orthogonal desks on Floor 16 remain valid where they stand. This is
   the regression that matters most: if adding wall collision invalidates desks
   that exist in the real office, the segment extraction is wrong, not the
   desks.
6. Segment count per section is recorded in a test so a future extraction change
   that multiplies it is visible in review.

### 3.5 Acceptable fallback

If wall collision produces false positives on the existing 382 desks — for
instance because a wall is drawn as two parallel lines and a desk legitimately
sits between them — **stop and report the measurement**. Do not add tolerance
until the numbers say what tolerance is needed, and do not quietly exclude the
layers that misbehave. A written finding with counts is a successful outcome.

## 4. Verification gates

```text
cd frontend
npx vitest run
npx tsc -b
npx oxlint .
npx vite build
cd ../backend
.venv/bin/pytest
TEST_DATABASE_URL=postgresql+psycopg://supportive:supportive@localhost:5433/postgres .venv/bin/pytest tests/test_migrations.py
.venv/bin/alembic upgrade head
cd ..
git diff --check
```

Report the exact commands and results. For slice A, open the workspace at a
desktop viewport and check every department's section picker — BẤT ĐỘNG SẢN -
SMART CITY in particular. For slice C, exercise one drag in a populated section
and say whether it feels slower.

## 5. Definition of done

**For finishing A and B:**

- The work is committed on `lystiger/dev`, as two commits, slice A and slice B
  separately.
- `npx vitest run` passes. No test is deleted to make it pass; tests that
  asserted a refusal now assert that an override is required.
- The §4.4.6 acceptance test exists and passes: the two facade desks are
  created, moved, saved, reloaded, and carry their conflict and reason.
- Every gate in section 4 passes and the exact results are reported.

**For slice C:**

- Walls and partitions are obstacles; facade and structure are not.
- A desk outside its department zone that crosses no wall is valid with no
  warning.
- All 364 orthogonal Floor 16 desks remain valid in place.
- The department demotion is recorded in an ADR before it lands.
- Segment counts and drag timing are reported against the recorded baselines.

## 6. Follow-up findings, not scope

Recorded so they are not lost. Do not do these here.

- `LockerMap.tsx` still imports `floor16.layout.json` directly as a module,
  hardcoded to Floor 16, and keeps its own pan/zoom. It is the reason
  `vite.config.ts` still carries a per-floor chunking rule. It is also the
  natural first consumer of a shared top-down canvas.
- `frontend/src/api/layout.ts` exposes `reconcileFloorLayout`, and the backend
  exposes `DELETE /layouts/floors/{id}/entities/{id}`, neither of which has a
  caller. Both are tested. They want a UI — a staleness banner and a "reset to
  the drawing" action — or a decision to drop them.
