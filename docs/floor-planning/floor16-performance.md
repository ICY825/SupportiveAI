# Floor 16 loading evidence

> **Historical record.** Written on the date below and not maintained since.
> For how the module works now, read [`engine-architecture.md`](engine-architecture.md)
> and [`persistence.md`](persistence.md); [`README.md`](README.md) explains the split.

Measured 18 September 2026 from the production build with Chromium at 1440×900. The browser used a 150 ms latency and 200 KiB/s download profile. API calls were stubbed so the measurement covers the static floor-planning payload and renderer, not backend availability.

Evidence is recorded in [`floor16-performance.json`](../../output/playwright/floor16-performance.json). The representative browser flow also inspected Khu vực D around desks 205–206; [`handoff-area-d.png`](../../output/playwright/handoff-area-d.png) is the captured state.

## Observed behavior

- First paint: 676 ms; first meaningful contentful paint: 4,804 ms.
- Workstation interactivity: 6,234 ms from navigation start.
- Four long tasks totalled 701 ms; the largest was 240 ms.
- The browser loaded 894,674 bytes of JS/CSS transfer. The largest resource was the application chunk at 840,580 bytes transfer / 847,901 bytes gzip on disk.
- Floor-specific assets were 38,881 bytes transfer, but the 2,907,237-byte layout JSON is embedded in the main application chunk by the current production build. This means the large geometry still participates in the initial application transfer.
- The full source floor data is 3,246,667 bytes uncompressed: layout 2,907,237; workstations 258,649; obstacles 63,929; other generated files 15,791; display-area metadata 1,061.
- The overview rendered 4,043 SVG descendants for 154 desks. At 144% overview zoom it entered MEDIUM detail and rendered 132 paths. Khu vực D fitted to 721 descendants, 9 paths, 321 polygons, plus 20 muted context furniture groups.
- Switching from the department overview to Khu vực D took approximately 210 ms in this run.

The browser flow also confirmed that a pending desk preview includes desk and chair geometry, an invalid click on desk 206 stayed at the aimed cell, the caption and accessible label named the conflict, and Escape removed the pending desk without adding a furniture group.

## Recommendation

Do not start a renderer rewrite from these numbers. The next bounded performance slice should separate the heavy layout artifact from the floor loader's first meaningful view:

1. generate a lightweight overview artifact containing floor bounds, display areas, department geometry, and only the low-detail structural paths needed for the first paint;
2. load workstations and the overview artifact first so the focused workspace can become interactive;
3. defer full layout paths, obstacle detail, and extraction metadata until the user enters verification or a close-detail view;
4. repeat this same throttled measurement and compare first contentful paint, workstation interactivity, and long-task time.

The current handoff slice stops at this recommendation. No payload architecture was changed based on unmeasured assumptions.
