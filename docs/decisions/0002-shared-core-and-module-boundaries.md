# ADR 0002 — Shared core, one frontend, and the boundary between the four modules

**Status:** Accepted
**Date:** 2026-09-18
**Amends:** [ADR 0001](0001-floor-planning-web-stack-and-floor-data.md) §1 (frontend stack — now
covers all four modules, not only floor planning)
**Source:** GitHub issues
[#1](https://github.com/ICY825/SupportiveAI/issues/1) and
[#2](https://github.com/ICY825/SupportiveAI/issues/2), answered by @CongDuc02 and @hthanhson

## Context

Three branches had grown apart while the four modules were built in parallel, and each had made a
different answer to the same questions.

Two backends existed. `lystiger` carried a pydantic-only scaffold — no database, no migrations,
`int` identifiers, `is_active`, `title`. `duc/mail-tracking` carried a working core: four alembic
migrations, `core/permissions.py`, the `platform/` services, `shared/{employee,department,location}`
as real SQLAlchemy models with uuid identifiers, `status`, `job_title`, roles, and thirteen test
files. `feature/locker` had built roughly 1,800 lines of module-2 backend on the first of those.

Two frontends existed, in the same `frontend/` directory and unable to share one `package.json`:
module 3 on Next.js 14 App Router with React 18, everything else on Vite with React 19.

Module 1 could not proceed at all. Its screen was finished; without a backend it had nowhere to read
or write who sits where.

## Decision

### 1. `duc/mail-tracking` is the canonical core

The superseded scaffold is deleted rather than merged. The two disagree about identity itself —
`int` against uuid, `is_active` against `status` — so a merge would have produced a schema neither
side believed in.

@CongDuc02 supplied the argument that settled it: the superseded contract declared `email` as a
required `EmailStr`, while module 3's recipient matching is built on the opposite premise — email
may be empty, and `email_source` plus `looks_like_upn()` exist to catch the case where HR pastes an
AD account into the mailbox column. CR-001 §3.5 calls that the most dangerous silent failure in the
system: the mail is never delivered and the system still reports success. Requiring `EmailStr`
deletes that defence.

The scaffold's `app/api/v1/endpoints/` plus `shared/contracts/` layout was also horizontal, which
`repository-structure.md` §1.2 — the document's self-declared most important decision — rejects.

Everything deleted remains reachable on the `lystiger` branch, and the uncommitted ORM draft found
in the working tree is preserved on `archive/orm-draft-20260915`.

### 2. One Vite application for all four modules

Module 3 moves off Next.js. Every one of its pages was already `'use client'` with no server
component, server action or server-side fetch, so the Next surface was thirteen import lines across
ten files. Module 1, by contrast, is ~13,800 lines with ~7,900 lines of tests, a 3.2 MB lazily
loaded dataset, SVG hit-testing, and `window`/`localStorage` throughout; server rendering buys it
nothing and costs hydration bugs.

Routing is **hash-based** (`react-router`'s `HashRouter`). The floor plan already published deep
links of the form `#/floor-planning?floor=…&view=…&select=…`, and the navigation rail already used
`#/…` anchors; a hash router keeps every one of them working untouched and means the server only
ever sees `/`, so serving the build needs no SPA rewrite rules. The price is cosmetic — module 3's
URLs gain a `#`, so a printed parcel-bench QR code must read `/#/station?t=…`.

Single origin is preserved without CORS: `server.proxy` in `vite.config.ts` during development, and
`FRONTEND_DIST` in the backend serving `dist/` in production, replacing Next's `rewrites()`.

### 3. Sign-in covers the whole application

Every module reads staff data — who sits where, whose locker, whose parcel — so the sign-in that
arrived with module 3 now guards all of them. The parcel-bench screen `/station` stays public by
design: most employees have no account and must confirm a parcel on the spot (mail-tracking.md
§7.2), and `/login` cannot sit behind the guard it serves.

This was reconsidered once. An earlier revision guarded only `/mail/*` and let the floor plan render
anonymously from its bundled geometry, to keep the pilot's most-demoed screen open. It was rejected
for coherence: a visitor who can see every desk and occupant but not the parcel list has met an
accident of which module was written first, not a policy.

### 4. The extracted dataset is the truth for geometry; the database holds assignments

Desks, rooms, obstacles and coordinates live in `data/floors/`, generated deterministically by
`tools/floorplan_extract` and carrying the source PDF's sha256. The database records only who sits
where, from when. Re-running the extractor for a new drawing therefore needs no data migration.

The dataset moved out of `frontend/src/features/floor-planning/data/floors/` to `data/floors/` at
the repository root, because the backend must read the same file and cannot reach inside `frontend/`.

### 5. The backend never invents a seat

The extractor emits only what it is confident about. Consequently a seat code absent from the
dataset does not exist: assigning to one is an error, never an instruction to create it. The seat
service reads the dataset to enforce this.

The key is the extractor's `workstation_id` (`ws-16-001`), never the display code `F16-D-367` —
that code is derived from zone ordering, so it changes when the ordering changes, and the seating
usability review §8 had already flagged it as the identifier to reconsider.

Because `workstation_id` has no foreign key — what it references is a file — @CongDuc02 required
two compensations, both implemented: `layout_version` recorded on every assignment, and
`GET /api/seats/floors/{id}/reconcile`, which reports `missing-seat` and `old-layout` rows and
changes nothing, since releasing someone's seat over a drawing change is a person's decision.

### 6. Employees join by `employee.id`

Modules reference staff by the uuid primary key. `employee_code` remains a display and import key,
never a foreign key.

### 7. Seat and locker keep separate tables, and share functions instead

Both owners voted to split. A seat is regenerable from a drawing and has no state of its own; a
locker is a physical object with its own lifecycle — broken, key lost, under maintenance. A shared
`resource` table would leave more than half its columns permanently null for one side or the other,
and would couple two modules that `repository-structure.md` §1.2 wants stoppable independently.

What they share lives in `modules/resource_allocation/common/` as plain functions: the column shape
(`<resource>`, `employee_id`, `assigned_at`, `released_at`), the rule that `released_at IS NULL`
means current, and the interval logic. Seeing both as one list later is a `UNION`, not a migration.

### 8. KPI logging uses `platform/audit`, with a shared action vocabulary

Module 1 proposed keeping its own log. @CongDuc02 rejected that, correctly: `AuditLog` already
carries `entity_type, entity_id, action, actor_id, from_state, to_state, occurred_at, note, data`,
and week-6 reporting compares all four modules with one formula. A per-module log shape turns that
report into a data-merging exercise, which is exactly what README §11 warns about.

The shared values for `action` are **`accept`** (took the suggestion as offered), **`override`**
(there was a suggestion, the user changed it) and **`manual`** (no suggestion; done from scratch).
Adding a fourth means changing all four modules.

## Consequences

- Alembic stays a single linear chain. Seat took `0005`; locker takes `0006`. A gap would have left
  two heads if locker also branched from `0004`.
- Module 2's backend must be rebuilt on this core. Its frontend already forked from the Vite
  application, so only the server side is affected.
- Module 4 has no owner in either thread. Its `app/ai/*` draft was deleted with the scaffold it
  depended on and is recoverable from `lystiger`.
- `frontend/src/features/floor-planning/domain/allocation.ts` still models a `Seat` entity with
  status, seat type, department and verification, none of which decision 4 backs. Either that model
  narrows to what the dataset plus the assignment table can answer, or a `seat` table becomes a
  separate decision.
- The floor plan's own `?floor=…&view=…&select=…` query lives inside the same hash the router reads.
  The two coexist today; anyone changing the router must keep that true.
