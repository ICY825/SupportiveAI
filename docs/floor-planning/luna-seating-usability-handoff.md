# Handoff: make the seating view answer the question people arrive with

Prepared 17 September 2026 for the `lystiger` branch, from a walkthrough of the live app performed as an administration employee with no technical background.

**The task attempted:** rotate desks in Khu vực F to make space for two new starters.

**The outcome:** failed. After ten minutes the tester still did not know whether it was possible. **Rated 5 / 10** — safe and careful, but built for someone who already knows the answer and wants to execute it, not for someone arriving with a question.

This slice closes that gap. Nothing here is a rewrite; the parts are all present and mostly good.

## 1. What already works — do not regress it

Worth stating, because the fixes below touch the same screens.

- Four clicks from landing to Khu vực F, with a breadcrumb that stays correct.
- The area opens readable: desk numbers and occupant initials visible at 100%, no manual zoom.
- The desk panel is genuinely informative — occupant, employee code, rotation, position in metres, validity.
- `Về vị trí gốc` appears only once something has moved.
- `Lưu bố trí` stays disabled while anything is invalid.
- Leaving with unsaved work asks first.

The tester said outright they trusted the tool. Keep that.

## 2. Answer the question, not just provide the tools

This is the whole reason for the 5.

Khu vực F is **16 seats, 16 occupied, 0 free**. That was on screen the entire session, in the side panel, and it is the complete answer to "can I fit two more people here". Nothing connected it to the task, so the tester learned it by rotating desks one at a time until everything collided.

Add, in the area panel:

- when the focused area has no free seats, say so as a statement rather than a zero in a grid — *"Khu vực F đã kín. Không còn chỗ trống."*
- and point somewhere useful: *"Gần nhất: Khu vực C · 4 chỗ trống"*, computed from the same desk index the counts already use, ranked by free count.

No new data is needed. `desks` and `buildWorkspaceDisplayAreas` already hold everything.

This one item is most of the difference between 5 and 8.

## 3. Do not offer a rotation that cannot succeed

The tester rotated desk 367 to 180° — collision with 368. To 270° — collision with 368 again. In a packed row no angle fits, and the button offers all of them equally.

`validatePlacement` can already answer this. For the selected desk, evaluate the three other quarter rotations up front and:

- disable `Xoay 90°` when none of them is valid, with a reason — *"Hàng bàn đã kín, không xoay được tại chỗ"*;
- otherwise leave it enabled and let the user cycle as today.

Four validations for one selected desk, recomputed on selection. Cheap, and it turns a trial-and-error loop into an answer.

## 4. Bound the obstacle highlight

At 180° the top half of the floor plan filled with red diagonal stripes. It was the concrete lift-and-stair core, highlighted in full. The tester's first thought was that they had broken something.

`EditLayer.tsx:101–119` hatches the entire colliding obstacle polygon at 0.45 opacity. Some obstacles are small columns; the core is enormous.

Clip the highlight to where the collision actually is — intersect the obstacle polygon with the offending placement's bbox expanded by a margin (a metre is plenty), and keep a thin outline on the rest of it. The user needs to see *what* they hit and *where*, not the full extent of a structural element.

## 5. Write the refusals in office language

Verbatim from the session:

```text
Không gian ghế va chạm (Lõi bê tông Đông 02 (Cụm thang máy & Thang bộ Nam) (C-B / 3-2))
```

Brackets inside brackets, an obstacle id and a CAD grid reference. The tester needed: *"Ghế sẽ chạm lõi thang máy."*

Rework `PLACEMENT_ISSUE` so the sentence is plain and the identifiers move behind a details affordance or a `title`. Keep the precision — it matters when someone escalates — just stop leading with it.

## 6. Make the desk itself clickable

The first click landed on the desk surface and nothing happened. Only the small round occupant marker selects a desk. On an isometric projection the desk tops are small, slanted, and not where a person aims.

The desk group already carries `data-workstation-id`; the marker is simply on top. Make the desk prism a hit target in edit mode too, and confirm the pointer cursor appears over it.

## 7. Keep `+ Thêm bàn` reachable while editing

`+ Thêm bàn` sits in the header until `Chỉnh sửa bố trí` is pressed, at which point the header becomes undo / redo / Hủy / Lưu and the button disappears.

The tester's task was *make space for two people*, which is adding two desks and rearranging to fit them. Those are one job, split across two modes, and the split is invisible until you are in the wrong one.

Keep the control available in edit mode. A desk added there is a draft placement like any other and goes through the same save.

## 8. One desk, three letters

On screen at the same moment, for the same desk:

| Shown | Means |
| --- | --- |
| `Khu vực F` | display area, A–F |
| `F16-D-367` | seat code; D is the department zone's index letter |
| `Zone B` | the building wing, from `DEPARTMENT_WING_ZONES` |

All three are legitimate and none is labelled. The tester could not say which was real.

Do not remove any of them. Label them: the wing as *"Khu B · cánh toà nhà"*, and the area as the area. If the seat code's letter cannot be explained in the space available, it is the one to reconsider — it is derived from zone ordering, which is an implementation detail with no meaning to the reader.

## 9. Warn before a desk leaves the department

Three taps of the arrow key pushed desk 367 outside the department and put a red border around the whole map. Nothing signalled the boundary was close.

The department polygon is known. Either stop the nudge at the edge, or flag the last valid step — the point is that the user should meet the boundary before crossing it.

## 10. Scope

In: items 2 through 9.

Out:
- the initial *"Đang tải dữ liệu tầng 16…"* delay — that is the 2.77 MB payload, and it is agy's handoff;
- anything about rooms or authored desks beyond keeping `+ Thêm bàn` reachable;
- the verification view.

## 11. Order

1. §2, the capacity answer. Largest effect, no new data, touches one panel.
2. §4 and §5, the two things that alarmed rather than informed.
3. §3, rotation pre-validation.
4. §6 and §7, the two interaction gaps.
5. §8 and §9, labelling and the edge warning.

## 12. Tests

1. A full area states that it is full, and names an area with free seats.
2. An area with free seats shows the count and no "nearest" pointer.
3. The rotate control is disabled, with a reason, when no quarter rotation validates.
4. An obstacle highlight is bounded near the placement, not the full polygon.
5. Every placement issue renders a sentence with no nested parentheses; identifiers survive in the title.
6. Clicking the desk body selects it in both view and edit mode.
7. `+ Thêm bàn` is present in edit mode and its desk saves with the draft.
8. Nudging toward the department edge stops or warns before the placement becomes invalid.

## 13. Note on the tree

Your authored-entities work is finished but uncommitted, and it spans the dataset, the domain and the page. Run the gates and commit before starting this slice, so a bisect has somewhere to land.

`agy` is on the payload work in `tools/floorplan_extract/`, `src/features/lockers/` and the floor loader. No overlap with anything above, except that §2's "nearest area with free seats" and their per-layer loading both read `layout.layers` — coordinate only if you touch the loader, which you should not need to.
