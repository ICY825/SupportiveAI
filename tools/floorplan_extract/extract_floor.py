#!/usr/bin/env python3
"""Vector extraction: CAD-exported floor plan PDF -> structured floor dataset (JSON).

Usage:
    python extract_floor.py floor16            # uses floors/floor16.py

The PDF must be a vector export (this one is ZWCAD -> PDFlib with optional
content groups named after CAD layers). No OCR / computer vision is used.

Coordinates in every output file are PDF user-space points with a top-left
origin (the same space as the source raster), so the source overlay aligns
1:1. `mmPerPt` converts to real-world millimetres.

Outputs (floor data only, no UI code):
    <out>/<floor>.layout.json        base geometry per render group, grid, text labels
    <out>/<floor>.zones.json         zones + rooms taken from markup annotations
    <out>/<floor>.workstations.json  desk clusters + workstations (rule-based)
    <out>/<floor>.objects.json       facilities and UNKNOWN objects
    <out>/<floor>.display-areas.json floor-specific UI focus metadata
    <out>/<floor>.extraction.json    extraction report (counts, rules, hidden items)
    <public>/floor-sources/<floor>.webp   source raster for the overlay
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import importlib
import json
import math
import sys
from pathlib import Path

import pymupdf
from PIL import Image

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent

Pt = tuple[float, float]


# ---------------------------------------------------------------- geometry utils

def fmt(v: float) -> str:
    """Base-layer coordinate: 0.1 pt (~10 mm on this sheet) is ample for display."""
    s = f"{v:.1f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def r2(v: float) -> float:
    return round(v, 2)


def point_in_poly(pt: Pt, poly: list[Pt]) -> bool:
    x, y = pt
    inside = False
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def poly_area(poly: list[Pt]) -> float:
    return abs(sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1]
                   for i in range(len(poly)))) / 2


def seg_point_dist(p: Pt, a: Pt, b: Pt) -> float:
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L))
    return math.dist(p, (ax + t * dx, ay + t * dy))


def poly_dist(p: list[Pt], q: list[Pt]) -> float:
    best = math.inf
    for P, Q in ((p, q), (q, p)):
        for v in P:
            for i in range(len(Q)):
                best = min(best, seg_point_dist(v, Q[i], Q[(i + 1) % len(Q)]))
    return best


def bbox_of(points: list[Pt]) -> list[float]:
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return [r2(min(xs)), r2(min(ys)), r2(max(xs)), r2(max(ys))]


def item_points(seg) -> list[Pt]:
    op = seg[0]
    if op == "l":
        return [(seg[1].x, seg[1].y), (seg[2].x, seg[2].y)]
    if op == "c":
        return [(p.x, p.y) for p in seg[1:5]]
    if op == "re":
        r = seg[1]
        return [(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)]
    if op == "qu":
        q = seg[1]
        return [(q.ul.x, q.ul.y), (q.ur.x, q.ur.y), (q.lr.x, q.lr.y), (q.ll.x, q.ll.y)]
    return []


def layer_key(name: str | None) -> str:
    return (name or "").split("$")[-1]


def bezier_point(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: float) -> Pt:
    omt = 1.0 - t
    return (
        omt**3 * p0[0] + 3 * omt**2 * t * p1[0] + 3 * omt * t**2 * p2[0] + t**3 * p3[0],
        omt**3 * p0[1] + 3 * omt**2 * t * p1[1] + 3 * omt * t**2 * p2[1] + t**3 * p3[1],
    )


def line_intersect(p: Pt, d_p: Pt, q: Pt, d_q: Pt) -> Pt | None:
    det = d_p[0] * (-d_q[1]) - d_p[1] * (-d_q[0])
    if abs(det) < 1e-6:
        return None
    dx, dy = q[0] - p[0], q[1] - p[1]
    s = (dx * (-d_q[1]) - dy * (-d_q[0])) / det
    return (p[0] + s * d_p[0], p[1] + s * d_p[1])


# ---------------------------------------------------------------- grid

def grid_from(page, drawings, cfg, texts):
    """Grid line positions from A-GRID strokes, named via grid bubble text."""
    xs, ys = [], []
    for d in drawings:
        if layer_key(d.get("layer")) != "A-GRID":
            continue
        for s in d["items"]:
            if s[0] != "l":
                continue
            a, b = s[1], s[2]
            if abs(a.x - b.x) < 0.05 and abs(a.y - b.y) > 2:
                xs.append(a.x)
            elif abs(a.y - b.y) < 0.05 and abs(a.x - b.x) > 2:
                ys.append(a.y)

    def cluster(vals):
        vals = sorted(vals)
        out = []
        for v in vals:
            if out and v - out[-1][-1] < 0.6:
                out[-1].append(v)
            else:
                out.append([v])
        return [sum(c) / len(c) for c in out if len(c) >= 3]

    cx, cy = cluster(xs), cluster(ys)

    def nearest(vals, v):
        return min(vals, key=lambda g: abs(g - v))

    columns, rows = [], []
    for name in cfg.GRID_COLUMNS:
        t = [c for c in texts if c["text"] == name and c["h"] < 12]
        if t:
            columns.append({"name": name, "x": r2(nearest(cx, t[0]["cx"]))})
    for name in cfg.GRID_ROWS:
        t = [c for c in texts if c["text"] == name and c["h"] < 12 and c["cx"] < 100]
        if t:
            rows.append({"name": name, "y": r2(nearest(cy, t[0]["cy"]))})
    col = {c["name"]: c["x"] for c in columns}
    row = {r["name"]: r["y"] for r in rows}
    a, b, mm = cfg.GRID_SPAN_X
    mm_x = mm / abs(col[b] - col[a])
    a, b, mm = cfg.GRID_SPAN_Y
    mm_y = mm / abs(row[b] - row[a])
    return columns, rows, mm_x, mm_y


def grid_ref(pt: Pt, columns, rows) -> str:
    def bay(vals, key, v, name):
        vals = sorted(vals, key=lambda g: g[key])
        if v <= vals[0][key]:
            return f"<{vals[0][name]}"
        for i in range(len(vals) - 1):
            if vals[i][key] <= v <= vals[i + 1][key]:
                return f"{vals[i][name]}-{vals[i + 1][name]}"
        return f">{vals[-1][name]}"

    return f"{bay(columns, 'x', pt[0], 'name')} / {bay(rows, 'y', pt[1], 'name')}"


# ---------------------------------------------------------------- extraction

def extract(cfg, pdf_path: Path, out_dir: Path, public_dir: Path):
    floor = cfg.FLOOR
    fid = floor["id"]
    stem = fid.replace("-", "")  # floor16
    doc = pymupdf.open(pdf_path)
    page = doc[0]
    W, H = page.rect.width, page.rect.height
    pdf_sha = hashlib.sha256(pdf_path.read_bytes()).hexdigest()

    # --- source raster with annotations, as the reviewer sees the PDF
    public_dir.mkdir(parents=True, exist_ok=True)
    zoom = 3.0
    pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), annots=True)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    raster_path = public_dir / f"{fid}.webp"
    img.save(raster_path, "WEBP", quality=82, method=6)

    # --- annotations (read before deleting them from the working copy)
    annots = {}
    for a in page.annots():
        nm = a.info.get("id") or ""
        verts = a.vertices if a.type[1] == "Polygon" else None
        annots[nm] = {
            "nm": nm,
            "type": a.type[1],
            "opacity": a.opacity,
            "rect": [a.rect.x0, a.rect.y0, a.rect.x1, a.rect.y1],
            "vertices": [(v[0], v[1]) for v in verts] if verts else None,
            "content": a.info.get("content") or "",
            "stroke": a.colors.get("stroke"),
            "fill": a.colors.get("fill"),
        }
    for a in list(page.annots()):
        page.delete_annot(a)

    # --- text
    texts = []
    for b in page.get_text("rawdict")["blocks"]:
        for ln in b.get("lines", []):
            t = "".join(c["c"] for s in ln["spans"] for c in s["chars"]).strip()
            if not t:
                continue
            x0, y0, x1, y1 = ln["bbox"]
            size = max((s["size"] for s in ln["spans"]), default=1)
            texts.append({"text": t, "cx": (x0 + x1) / 2, "cy": (y0 + y1) / 2, "h": y1 - y0,
                          "bbox": [x0, y0, x1, y1], "dir": ln["dir"], "size": size})

    drawings = page.get_drawings()
    columns, rows, mm_x, mm_y = grid_from(page, drawings, cfg, texts)
    mm_per_pt = (mm_x + mm_y) / 2

    # --- base geometry per render group
    groups: dict[str, list[str]] = collections.defaultdict(list)
    group_meta: dict[str, dict] = {}
    seen: set = set()
    skipped_layers = collections.Counter()
    unmapped_layers = collections.Counter()
    for d in drawings:
        key = layer_key(d.get("layer"))
        if key not in cfg.LAYERS:
            unmapped_layers[key] += 1
            continue
        spec = cfg.LAYERS[key]
        if spec is None:
            skipped_layers[key] += 1
            continue
        g, cls, desc = spec
        meta = group_meta.setdefault(g, {"id": g, "classification": set(), "cadLayers": set()})
        meta["classification"].add(cls)
        meta["cadLayers"].add(key or "(no layer)")
        out = groups[g]
        for s in d["items"]:
            op = s[0]
            pts = item_points(s)
            if op == "l":
                (ax, ay), (bx, by) = pts
                if abs(ax - bx) + abs(ay - by) < 0.12:
                    continue
                k = (g, fmt(ax), fmt(ay), fmt(bx), fmt(by))
                k2 = (g, k[3], k[4], k[1], k[2])
                if k in seen or k2 in seen:
                    continue
                seen.add(k)
                out.append(f"M{k[1]} {k[2]}L{k[3]} {k[4]}")
            elif op == "c":
                k = (g, "c") + tuple(fmt(v) for p in pts for v in p)
                if k in seen:
                    continue
                seen.add(k)
                (ax, ay), (b1x, b1y), (b2x, b2y), (ex, ey) = pts
                out.append(f"M{fmt(ax)} {fmt(ay)}C{fmt(b1x)} {fmt(b1y)} {fmt(b2x)} {fmt(b2y)} {fmt(ex)} {fmt(ey)}")
            elif op in ("re", "qu"):
                k = (g, "p") + tuple(fmt(v) for p in pts for v in p)
                if k in seen:
                    continue
                seen.add(k)
                out.append("M" + "L".join(f"{fmt(x)} {fmt(y)}" for x, y in pts) + "Z")

    group_order = ["facade", "structure", "core", "walls", "partitions", "doors", "fixtures",
                   "furniture", "grid", "dimensions"]
    layers_out = []
    for g in group_order:
        if g not in groups:
            continue
        meta = group_meta[g]
        cls = sorted(meta["classification"])
        layers_out.append({
            "id": g,
            "classification": cls[0] if len(cls) == 1 else "UNKNOWN",
            "classifications": cls,
            "cadLayers": sorted(meta["cadLayers"]),
            "d": "".join(groups[g]),
        })

    # --- text labels for the map (skip desk dimension labels, grid & dimension numbers)
    grid_names = set(cfg.GRID_COLUMNS) | set(cfg.GRID_ROWS)
    label_out = []
    label_seen = set()
    for t in texts:
        if t["text"] in grid_names or t["text"] in ("1200x600",) or t["text"].isdigit():
            continue
        k = (t["text"], round(t["cx"]), round(t["cy"]))
        if k in label_seen:
            continue
        label_seen.add(k)
        angle = math.degrees(math.atan2(t["dir"][1], t["dir"][0]))
        label_out.append({"text": t["text"], "x": r2(t["cx"]), "y": r2(t["cy"]),
                          "size": r2(t["size"]), "angle": round(angle, 1)})

    # --- zones & rooms from annotations
    used_annots = set()

    def annot_geometry(nm):
        a = annots[nm]
        if a["vertices"]:
            poly = a["vertices"]
            # Acrobat polygons repeat the first vertex near the end; drop exact/near duplicates
            clean = []
            for p in poly:
                if not clean or math.dist(clean[-1], p) > 0.5:
                    clean.append(p)
            if len(clean) > 3 and math.dist(clean[0], clean[-1]) < 3:
                clean.pop()
            return clean, "polygon annotation vertices"
        x0, y0, x1, y1 = a["rect"]
        return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], "highlight annotation rectangle"

    def label_parts(nm):
        if not nm:
            return None, None
        raw = " ".join(annots[nm]["content"].split())
        figure = None
        if raw.endswith(")") and "(" in raw:
            inner = raw[raw.rfind("(") + 1:-1]
            if inner.isdigit():
                figure = int(inner)
        return raw, figure

    def hexcolor(c):
        return "#" + "".join(f"{round(v * 255):02x}" for v in c) if c else None

    zones = []
    for z in cfg.ZONES:
        a = annots[z["annot"]]
        used_annots.add(z["annot"])
        if z["labelAnnot"]:
            used_annots.add(z["labelAnnot"])
        poly, gsrc = annot_geometry(z["annot"])
        raw, figure = label_parts(z["labelAnnot"])
        cx = sum(p[0] for p in poly) / len(poly)
        cy = sum(p[1] for p in poly) / len(poly)
        labelled = z["name"] is not None
        # A name the team supplied is not a name the drawing carries. Keep the
        # zone usable (it has a department, so it is a WORKSPACE_ZONE) but do
        # not claim the sheet verified it.
        team_named = labelled and z.get("nameSource") == "team"
        if z["labelAnnot"]:
            lr = annots[z["labelAnnot"]]["rect"]
            anchor, anchor_src = ((lr[0] + lr[2]) / 2, (lr[1] + lr[3]) / 2), "source label position"
        else:
            bb = bbox_of(poly)
            anchor, anchor_src = ((bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2), "zone bbox centre"
        zones.append({
            "id": z["id"],
            "floorId": fid,
            "type": "WORKSPACE_ZONE" if labelled else "UNKNOWN",
            "name": z["name"],
            "departmentCode": z.get("departmentCode"),
            "verification": ("UNVERIFIED" if team_named else "SOURCE_VERIFIED") if labelled else "UNKNOWN",
            "polygon": [[r2(x), r2(y)] for x, y in poly],
            "bbox": bbox_of(poly),
            "labelAnchor": [r2(anchor[0]), r2(anchor[1])],
            "labelAnchorSource": anchor_src,
            "areaM2": round(poly_area(poly) * mm_per_pt * mm_per_pt / 1e6, 1),
            "gridRef": grid_ref((cx, cy), columns, rows),
            "sourceColor": hexcolor(a["fill"] or a["stroke"]),
            "sourceLabel": raw,
            "sourceLabelFigure": figure,
            "source": {
                "kind": "pdf-annotation",
                "nameSource": z.get("nameSource", "pdf-annotation"),
                "annotationId": z["annot"],
                "annotationType": a["type"],
                "labelAnnotationId": z["labelAnnot"],
                "geometry": gsrc,
            },
            "notes": ([] if labelled else ["Highlighted on the source drawing without a label; purpose UNKNOWN."])
            + (["Figure in parentheses on the source label; its meaning (headcount, planned seats, other) is not stated."]
               if figure is not None else []),
        })

    rooms = []
    for r in cfg.ROOMS:
        if r.get("annot"):
            used_annots.add(r["annot"])
        if r.get("labelAnnot"):
            used_annots.add(r["labelAnnot"])

        if r.get("wallBbox"):
            x0, y0, x1, y1 = r["wallBbox"]
            poly = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
            gsrc = "smallest closed shape enclosing the CAD label" if r.get("sourceText") else "highlight annotation rectangle"
        elif r.get("annot"):
            poly, gsrc = annot_geometry(r["annot"])
        else:
            continue

        cx = sum(p[0] for p in poly) / len(poly)
        cy = sum(p[1] for p in poly) / len(poly)
        containing = [z["id"] for z in zones if point_in_poly((cx, cy), [tuple(p) for p in z["polygon"]])]

        if r.get("sourceText"):
            src = {"kind": "pdf-text", "text": r["sourceText"], "geometry": gsrc}
            notes = []
        else:
            src = {
                "kind": "pdf-annotation",
                "annotationId": r.get("annot"),
                "labelAnnotationId": r.get("labelAnnot"),
                "geometry": gsrc,
            }
            notes = [
                "Source label names an occupant. Occupant NOT imported: assignment data is out of scope and must come from HR/Admin."
            ]

        rooms.append({
            "id": r["id"],
            "floorId": fid,
            "zoneId": containing[0] if len(containing) == 1 else None,
            "type": "ROOM",
            "name": r["name"],
            "verification": "SOURCE_VERIFIED",
            "polygon": [[r2(x), r2(y)] for x, y in poly],
            "bbox": bbox_of(poly),
            "areaM2": round(poly_area(poly) * mm_per_pt * mm_per_pt / 1e6, 1),
            "gridRef": grid_ref((cx, cy), columns, rows),
            "source": src,
            "notes": notes,
        })

    ignored_annots = []
    for nm, a in annots.items():
        if nm in used_annots or a["type"] == "Popup":
            continue
        ignored_annots.append({"annotationId": nm, "type": a["type"], "opacity": a["opacity"],
                               "bbox": bbox_of([(a["rect"][0], a["rect"][1]), (a["rect"][2], a["rect"][3])]),
                               "reason": "hidden (opacity 0) markup, not rendered in the source view"
                               if a["opacity"] == 0 else "not mapped in floor config"})

    def zone_of(pt):
        hits = [z["id"] for z in zones if point_in_poly(pt, [tuple(p) for p in z["polygon"]])]
        return hits

    # --- workstation detection
    rule = cfg.WORKSTATION_RULE
    furn_layers = {k for k, v in cfg.LAYERS.items() if v and v[0] == "furniture"}
    quads = {}
    prims = []
    for d in drawings:
        key = layer_key(d.get("layer"))
        for s in d["items"]:
            pts = item_points(s)
            if s[0] in ("re", "qu"):
                e1, e2 = math.dist(pts[0], pts[1]), math.dist(pts[1], pts[2])
                lo, hi = sorted([e1, e2])
                if rule["deskShortPt"][0] < lo < rule["deskShortPt"][1] and rule["deskLongPt"][0] < hi < rule["deskLongPt"][1]:
                    c = (sum(p[0] for p in pts) / 4, sum(p[1] for p in pts) / 4)
                    quads.setdefault((round(c[0] * 2), round(c[1] * 2)), (pts, c))
                    continue
            if key in furn_layers and pts:
                bb = bbox_of(pts)
                if max(bb[2] - bb[0], bb[3] - bb[1]) < 4.6:
                    prims.append((s[0], bb))

    desk_labels = [t for t in texts if t["text"] == rule["deskLabel"]]
    desks = {}
    for t in desk_labels:
        c = (t["cx"], t["cy"])
        hits = [q for q in quads.values() if abs(q[1][0] - c[0]) < 7 and abs(q[1][1] - c[1]) < 7 and point_in_poly(c, q[0])]
        if hits:
            q = min(hits, key=lambda q: math.dist(q[1], c))
            desks[(round(q[1][0] * 2), round(q[1][1] * 2))] = q
    unlabelled_desk_quads = [q for k, q in quads.items() if k not in desks]

    # chair symbols: union small furniture primitives that touch
    par = list(range(len(prims)))

    def find(i):
        while par[i] != i:
            par[i] = par[par[i]]
            i = par[i]
        return i

    tol = 0.5
    gridmap = collections.defaultdict(list)
    for i, (_, b) in enumerate(prims):
        for gx in range(int((b[0] - tol) // 1), int((b[2] + tol) // 1) + 1):
            for gy in range(int((b[1] - tol) // 1), int((b[3] + tol) // 1) + 1):
                for j in gridmap[(gx, gy)]:
                    c = prims[j][1]
                    if b[0] - tol <= c[2] and c[0] <= b[2] + tol and b[1] - tol <= c[3] and c[1] <= b[3] + tol:
                        ri, rj = find(i), find(j)
                        if ri != rj:
                            par[ri] = rj
                gridmap[(gx, gy)].append(i)
    comp = collections.defaultdict(list)
    for i in range(len(prims)):
        comp[find(i)].append(i)
    chairs = []
    lo, hi = rule["chairSizePt"]
    for members in comp.values():
        bb = [min(prims[i][1][0] for i in members), min(prims[i][1][1] for i in members),
              max(prims[i][1][2] for i in members), max(prims[i][1][3] for i in members)]
        if len(members) >= rule["chairMinPrimitives"] and lo <= bb[2] - bb[0] <= hi and lo <= bb[3] - bb[1] <= hi:
            chairs.append({"c": ((bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2), "bbox": [r2(v) for v in bb]})

    desk_list = []
    chair_use = collections.Counter()
    for pts, c in desks.values():
        e1 = (pts[1][0] - pts[0][0], pts[1][1] - pts[0][1])
        e2 = (pts[2][0] - pts[1][0], pts[2][1] - pts[1][1])
        l1, l2 = math.hypot(*e1), math.hypot(*e2)
        if l1 >= l2:
            u, L, v, Wd = (e1[0] / l1, e1[1] / l1), l1, (e2[0] / l2, e2[1] / l2), l2
        else:
            u, L, v, Wd = (e2[0] / l2, e2[1] / l2), l2, (e1[0] / l1, e1[1] / l1), l1
        found = []
        for ci, ch in enumerate(chairs):
            dx, dy = ch["c"][0] - c[0], ch["c"][1] - c[1]
            along = dx * u[0] + dy * u[1]
            normal = dx * v[0] + dy * v[1]
            if abs(along) <= L * rule["chairLateralFraction"] and Wd / 2 + rule["chairGapPt"][0] <= abs(normal) <= Wd / 2 + rule["chairGapPt"][1]:
                found.append(ci)
        for ci in found:
            chair_use[ci] += 1
        angle = math.degrees(math.atan2(u[1], u[0])) % 180
        desk_list.append({"pts": pts, "c": c, "chairs": found, "angle": angle})

    # clusters: connected components of touching desks
    n = len(desk_list)
    cpar = list(range(n))

    def cfind(i):
        while cpar[i] != i:
            cpar[i] = cpar[cpar[i]]
            i = cpar[i]
        return i

    for i in range(n):
        for j in range(i + 1, n):
            if math.dist(desk_list[i]["c"], desk_list[j]["c"]) > 14:
                continue
            if poly_dist(desk_list[i]["pts"], desk_list[j]["pts"]) <= rule["clusterTouchPt"]:
                cpar[cfind(i)] = cfind(j)
    comps = collections.defaultdict(list)
    for i in range(n):
        comps[cfind(i)].append(i)

    def reading_order(c):
        return (round(c[1] / 20), c[0])

    cluster_list = []
    for members in comps.values():
        cx = sum(desk_list[i]["c"][0] for i in members) / len(members)
        cy = sum(desk_list[i]["c"][1] for i in members) / len(members)
        cluster_list.append({"members": members, "c": (cx, cy)})
    cluster_list.sort(key=lambda k: reading_order(k["c"]))

    # stable IDs: reuse IDs from a previous run when geometry still matches
    ws_path = out_dir / f"{stem}.workstations.json"
    prev_ws, prev_cl = [], []
    if ws_path.exists():
        prev = json.loads(ws_path.read_text(encoding="utf-8"))
        prev_ws, prev_cl = prev.get("workstations", []), prev.get("clusters", [])
    lvl = floor["level"]

    def reuse(prev, center, taken, tol_pt):
        for p in prev:
            if p["id"] not in taken and math.dist(tuple(p["center"]), center) <= tol_pt:
                return p["id"]
        return None

    def next_id(prefix, width, taken):
        k = 1
        while f"{prefix}{k:0{width}d}" in taken:
            k += 1
        return f"{prefix}{k:0{width}d}"

    taken_cl: set = set()
    taken_ws: set = set()
    clusters_out, ws_out = [], []
    ordered_desks = []
    for cl in cluster_list:
        mem = sorted(cl["members"], key=lambda i: reading_order_local(desk_list[i]["c"], cl["c"]))
        cl["members"] = mem
        cid = reuse(prev_cl, cl["c"], taken_cl, 1.5)
        cl["id"] = cid
        if cid:
            taken_cl.add(cid)
        for i in mem:
            wid = reuse(prev_ws, desk_list[i]["c"], taken_ws, 1.0)
            desk_list[i]["id"] = wid
            if wid:
                taken_ws.add(wid)
            ordered_desks.append(i)
    for cl in cluster_list:
        if not cl["id"]:
            cl["id"] = next_id(f"cluster-{lvl}-", 2, taken_cl)
            taken_cl.add(cl["id"])
    for i in ordered_desks:
        if not desk_list[i].get("id"):
            desk_list[i]["id"] = next_id(f"ws-{lvl}-", 3, taken_ws)
            taken_ws.add(desk_list[i]["id"])

    class_counts = collections.Counter()
    for cl in cluster_list:
        member_zone_sets = [zone_of(desk_list[i]["c"]) for i in cl["members"]]
        flat = collections.Counter(z for zs in member_zone_sets for z in zs)
        single = {tuple(zs) for zs in member_zone_sets}
        cluster_zone = member_zone_sets[0][0] if len(single) == 1 and len(member_zone_sets[0]) == 1 else None
        pts_all = [p for i in cl["members"] for p in desk_list[i]["pts"]]
        ws_ids = []
        for i in cl["members"]:
            dk = desk_list[i]
            zs = zone_of(dk["c"])
            ok = len(dk["chairs"]) == 1 and chair_use[dk["chairs"][0]] == 1
            classification = "WORKSTATION" if ok else "UNKNOWN"
            class_counts[classification] += 1
            reasons = [f"'{rule['deskLabel']}' desk outline with dimension label"]
            if ok:
                reasons.append("exactly one chair symbol on a long edge, not shared with another desk")
            else:
                reasons.append(f"chair count on long edges = {len(dk['chairs'])} (or shared) -> not confident")
            notes = []
            if len(zs) > 1:
                notes.append("Desk centre lies inside more than one source zone; zone membership UNKNOWN.")
            ch = chairs[dk["chairs"][0]] if len(dk["chairs"]) == 1 else None
            ws_out.append({
                "id": dk["id"],
                "floorId": fid,
                "clusterId": cl["id"],
                "zoneId": zs[0] if len(zs) == 1 else None,
                "classification": classification,
                "verification": "EXTRACTED" if ok else "UNKNOWN",
                "polygon": [[r2(x), r2(y)] for x, y in dk["pts"]],
                "center": [r2(dk["c"][0]), r2(dk["c"][1])],
                "rotationDeg": round(dk["angle"], 1),
                "bbox": bbox_of(dk["pts"]),
                "chair": {"center": [r2(ch["c"][0]), r2(ch["c"][1])], "bbox": ch["bbox"]} if ch else None,
                "gridRef": grid_ref(dk["c"], columns, rows),
                "source": {
                    "kind": "pdf-vector",
                    "deskLabel": rule["deskLabel"],
                    "nominalSizeMm": [1200, 600],
                    "rule": "; ".join(reasons),
                },
                "notes": notes,
            })
            ws_ids.append(dk["id"])
        clusters_out.append({
            "id": cl["id"],
            "floorId": fid,
            "zoneId": cluster_zone,
            "zoneIds": sorted(flat),
            "verification": "EXTRACTED",
            "center": [r2(cl["c"][0]), r2(cl["c"][1])],
            "bbox": bbox_of(pts_all),
            "gridRef": grid_ref(cl["c"], columns, rows),
            "workstationIds": ws_ids,
            "notes": ([] if cluster_zone or not flat else ["Cluster desks fall in different zones."])
            + (["Cluster lies outside every source zone."] if not flat else []),
        })

    # --- facilities / unknown objects from CAD labels
    small_shapes = []
    for d in drawings:
        for s in d["items"]:
            if s[0] in ("re", "qu"):
                pts = item_points(s)
                bb = bbox_of(pts)
                if max(bb[2] - bb[0], bb[3] - bb[1]) < 30:
                    small_shapes.append(pts)
    objects_out = []
    obj_seen = set()
    obj_counter = collections.Counter()
    for spec in cfg.FACILITY_LABELS:
        for t in texts:
            if spec["match"] not in t["text"]:
                continue
            k = (spec["kind"], round(t["cx"]), round(t["cy"]))
            if k in obj_seen:
                continue
            obj_seen.add(k)
            c = (t["cx"], t["cy"])
            tw, th = t["bbox"][2] - t["bbox"][0], t["bbox"][3] - t["bbox"][1]
            containing = [p for p in small_shapes if point_in_poly(c, p)
                          and bbox_of(p)[2] - bbox_of(p)[0] >= tw * 0.9 and bbox_of(p)[3] - bbox_of(p)[1] >= th * 0.9]
            if containing:
                poly = min(containing, key=poly_area)
                gsrc = "smallest closed shape enclosing the CAD label"
            else:
                x0, y0, x1, y1 = t["bbox"]
                poly = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
                gsrc = "CAD label bounding box only (object outline not identified)"
            obj_counter[spec["kind"]] += 1
            oid = f"{'fac' if spec['classification'] == 'FACILITY' else 'obj'}-{lvl}-{spec['kind'].replace('_', '-')}-{obj_counter[spec['kind']]:02d}"
            zs = zone_of(c)
            objects_out.append({
                "id": oid,
                "floorId": fid,
                "zoneId": zs[0] if len(zs) == 1 else None,
                "kind": spec["kind"],
                "name": spec["name"],
                "classification": spec["classification"],
                "verification": "EXTRACTED" if containing and spec["classification"] == "FACILITY" else "UNVERIFIED"
                if spec["classification"] == "FACILITY" else "UNKNOWN",
                "polygon": [[r2(x), r2(y)] for x, y in poly],
                "bbox": bbox_of(poly),
                "gridRef": grid_ref(c, columns, rows),
                "source": {"kind": "pdf-text", "text": t["text"], "geometry": gsrc},
                "notes": [] if spec["classification"] == "FACILITY" else ["Only a dimension label is present; object type UNKNOWN."],
            })
    objects_out.sort(key=lambda o: o["id"])

    # --- concrete columns & core walls from KT-Betong
    betong_lines = []
    for d in drawings:
        if layer_key(d.get("layer")) == "KT-Betong":
            for it in d["items"]:
                if it[0] == "l":
                    p1, p2 = it[1], it[2]
                    betong_lines.append(((p1.x, p1.y), (p2.x, p2.y)))

    n_betong = len(betong_lines)
    b_parent = list(range(n_betong))

    def b_find(i):
        while b_parent[i] != i:
            b_parent[i] = b_parent[b_parent[i]]
            i = b_parent[i]
        return i

    b_tol = 5.0
    b_grid = collections.defaultdict(list)
    b_boxes = [(min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)) for (x1, y1), (x2, y2) in betong_lines]
    for i, b in enumerate(b_boxes):
        gx0, gx1 = int(b[0] // b_tol), int(b[2] // b_tol)
        gy0, gy1 = int(b[1] // b_tol), int(b[3] // b_tol)
        for gx in range(gx0 - 1, gx1 + 2):
            for gy in range(gy0 - 1, gy1 + 2):
                for j in b_grid[(gx, gy)]:
                    bj = b_boxes[j]
                    if not (b[2] < bj[0] - b_tol or b[0] > bj[2] + b_tol or b[3] < bj[1] - b_tol or b[1] > bj[3] + b_tol):
                        ri, rj = b_find(i), b_find(j)
                        if ri != rj:
                            b_parent[ri] = rj
        for gx in range(gx0, gx1 + 1):
            for gy in range(gy0, gy1 + 1):
                b_grid[(gx, gy)].append(i)

    b_comps = collections.defaultdict(list)
    for i in range(n_betong):
        b_comps[b_find(i)].append(i)

    columns_raw = []
    for members in b_comps.values():
        minx = min(b_boxes[i][0] for i in members)
        miny = min(b_boxes[i][1] for i in members)
        maxx = max(b_boxes[i][2] for i in members)
        maxy = max(b_boxes[i][3] for i in members)
        w, h = maxx - minx, maxy - miny
        if w * h < 50.0:
            continue
        cx, cy = (minx + maxx) / 2, (miny + maxy) / 2
        columns_raw.append({"bbox": [minx, miny, maxx, maxy], "c": (cx, cy), "w": w, "h": h})

    columns_raw.sort(key=lambda col: reading_order(col["c"]))

    columns_out = []
    for idx, col in enumerate(columns_raw, 1):
        minx, miny, maxx, maxy = col["bbox"]
        cx, cy = col["c"]
        cid = f"col-{lvl}-{idx:02d}"
        gr = grid_ref((cx, cy), columns, rows)
        poly = [[r2(minx), r2(miny)], [r2(maxx), r2(miny)], [r2(maxx), r2(maxy)], [r2(minx), r2(maxy)]]
        columns_out.append({
            "id": cid,
            "floorId": fid,
            "kind": "column",
            "category": "solid",
            "name": f"Cột bê tông ({gr})",
            "verification": "EXTRACTED",
            "polygon": poly,
            "bbox": [r2(minx), r2(miny), r2(maxx), r2(maxy)],
            "center": [r2(cx), r2(cy)],
            "gridRef": gr,
            "source": {
                "kind": "pdf-vector",
                "geometry": "clustered lines from KT-Betong CAD layer",
            },
            "notes": [],
        })

    # --- concrete core walls from KT-Hatch
    core_wall_rule = getattr(cfg, "CORE_WALL_RULE", {
        "hatchLayer": "KT-Hatch",
        "hTolPt": 1.5,
        "minLines": 1000,
        "names": [
            "Lõi bê tông Tây 01 (Thang máy & Thang bộ)",
            "Lõi bê tông Tây 02 (Cụm thang máy trung tâm)",
            "Lõi bê tông Đông 01 (Cụm thang máy Bắc)",
            "Lõi bê tông Đông 02 (Cụm thang máy & Thang bộ Nam)",
        ],
        "safeBounds": {
            f"wall-{lvl}-02": {"maxX": 507.17, "maxY": 366.35},
            f"wall-{lvl}-03": {"minY": 370.58},
            f"wall-{lvl}-04": {"maxY": 632.37},
        },
    })
    hatch_layer = core_wall_rule.get("hatchLayer", "KT-Hatch")
    h_tol = core_wall_rule.get("hTolPt", 1.5)
    min_lines = core_wall_rule.get("minLines", 1000)
    core_names = core_wall_rule.get("names", [])
    safe_bounds = core_wall_rule.get("safeBounds", {})

    hatch_lines = []
    for d in drawings:
        if layer_key(d.get("layer")) == hatch_layer:
            for it in d["items"]:
                if it[0] == "l":
                    p1, p2 = it[1], it[2]
                    hatch_lines.append(((p1.x, p1.y), (p2.x, p2.y)))

    n_hatch = len(hatch_lines)
    h_parent = list(range(n_hatch))

    def h_find(i):
        while h_parent[i] != i:
            h_parent[i] = h_parent[h_parent[i]]
            i = h_parent[i]
        return i

    h_grid = collections.defaultdict(list)
    h_boxes = [(min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)) for (x1, y1), (x2, y2) in hatch_lines]
    for i, b in enumerate(h_boxes):
        gx0, gx1 = int(b[0] // h_tol), int(b[2] // h_tol)
        gy0, gy1 = int(b[1] // h_tol), int(b[3] // h_tol)
        for gx in range(gx0 - 1, gx1 + 2):
            for gy in range(gy0 - 1, gy1 + 2):
                for j in h_grid[(gx, gy)]:
                    bj = h_boxes[j]
                    if not (b[2] < bj[0] - h_tol or b[0] > bj[2] + h_tol or b[3] < bj[1] - h_tol or b[1] > bj[3] + h_tol):
                        ri, rj = h_find(i), h_find(j)
                        if ri != rj:
                            h_parent[ri] = rj
        for gx in range(gx0, gx1 + 1):
            for gy in range(gy0, gy1 + 1):
                h_grid[(gx, gy)].append(i)

    h_comps = collections.defaultdict(list)
    for i in range(n_hatch):
        h_comps[h_find(i)].append(i)

    core_raw = []
    for members in h_comps.values():
        if len(members) < min_lines:
            continue
        minx = min(h_boxes[i][0] for i in members)
        miny = min(h_boxes[i][1] for i in members)
        maxx = max(h_boxes[i][2] for i in members)
        maxy = max(h_boxes[i][3] for i in members)
        cx, cy = (minx + maxx) / 2, (miny + maxy) / 2
        core_raw.append({"bbox": [minx, miny, maxx, maxy], "c": (cx, cy)})

    core_raw.sort(key=lambda col: reading_order(col["c"]))

    walls_out = []
    for idx, wall in enumerate(core_raw, 1):
        minx, miny, maxx, maxy = wall["bbox"]
        wid = f"wall-{lvl}-{idx:02d}"
        limits = safe_bounds.get(wid, {})
        if "minX" in limits:
            minx = max(minx, limits["minX"])
        if "maxX" in limits:
            maxx = min(maxx, limits["maxX"])
        if "minY" in limits:
            miny = max(miny, limits["minY"])
        if "maxY" in limits:
            maxy = min(maxy, limits["maxY"])
        minx, miny, maxx, maxy = r2(minx), r2(miny), r2(maxx), r2(maxy)
        cx, cy = (minx + maxx) / 2, (miny + maxy) / 2
        gr = grid_ref((cx, cy), columns, rows)
        name = core_names[idx - 1] if idx <= len(core_names) else f"Lõi bê tông {idx:02d}"
        poly = [[minx, miny], [maxx, miny], [maxx, maxy], [minx, maxy]]
        walls_out.append({
            "id": wid,
            "floorId": fid,
            "kind": "wall",
            "category": "solid",
            "name": f"{name} ({gr})",
            "verification": "EXTRACTED",
            "polygon": poly,
            "bbox": [minx, miny, maxx, maxy],
            "center": [r2(cx), r2(cy)],
            "gridRef": gr,
            "source": {
                "kind": "pdf-vector",
                "geometry": f"clustered core wall hatching from {hatch_layer} CAD layer",
            },
            "notes": [],
        })

    # --- door swing clearance sectors from A-DOOR and KT-Cua
    door_layers = {"A-DOOR", "KT-Cua"}
    door_curves = []
    for d in drawings:
        layer = layer_key(d.get("layer"))
        if layer in door_layers:
            for it in d["items"]:
                if it[0] == "c":
                    p0 = (it[1].x, it[1].y)
                    p1 = (it[2].x, it[2].y)
                    p2 = (it[3].x, it[3].y)
                    p3 = (it[4].x, it[4].y)
                    if math.dist(p0, p3) > 5.0:
                        door_curves.append((layer, p0, p1, p2, p3))

    unique_door_arcs = []
    for c in door_curves:
        p0, p3 = c[1], c[4]
        if not any((math.dist(p0, u[1]) < 0.5 and math.dist(p3, u[4]) < 0.5) or
                   (math.dist(p0, u[4]) < 0.5 and math.dist(p3, u[1]) < 0.5) for u in unique_door_arcs):
            unique_door_arcs.append(c)

    unique_door_arcs.sort(key=lambda u: reading_order((min(u[1][0], u[4][0]), min(u[1][1], u[4][1]))))

    doors_out = []
    for idx, (d_layer, p0, p1, p2, p3) in enumerate(unique_door_arcs, 1):
        v0 = (p1[0] - p0[0], p1[1] - p0[1])
        n0 = (-v0[1], v0[0])
        v3 = (p3[0] - p2[0], p3[1] - p2[1])
        n3 = (-v3[1], v3[0])
        C = line_intersect(p0, n0, p3, n3)
        if not C:
            c1, c2 = (p0[0], p3[1]), (p3[0], p0[1])
            pm = bezier_point(p0, p1, p2, p3, 0.5)
            C = c1 if abs(math.dist(c1, p0) - math.dist(c1, pm)) < abs(math.dist(c2, p0) - math.dist(c2, pm)) else c2

        radius_pt = math.dist(C, p0)
        radius_mm = round(radius_pt * mm_per_pt)
        arc_pts = [bezier_point(p0, p1, p2, p3, s / 6.0) for s in range(7)]
        poly_pts = [C] + arc_pts
        poly = [[r2(x), r2(y)] for x, y in poly_pts]
        did = f"door-{lvl}-{idx:02d}"
        dclrid = f"door-clr-{lvl}-{idx:02d}"
        gr = grid_ref(C, columns, rows)
        doors_out.append({
            "id": dclrid,
            "doorId": did,
            "floorId": fid,
            "kind": "door-clearance",
            "category": "clearance",
            "name": f"Khoảng quét mở cửa {idx:02d} ({radius_mm}mm)",
            "verification": "EXTRACTED",
            "polygon": poly,
            "bbox": bbox_of(poly_pts),
            "hinge": [r2(C[0]), r2(C[1])],
            "center": [r2(C[0]), r2(C[1])],
            "radiusMm": radius_mm,
            "gridRef": gr,
            "source": {
                "kind": "pdf-vector",
                "geometry": f"door swing arc from {d_layer} CAD layer",
            },
            "notes": [],
        })

    obstacles_out = columns_out + walls_out + doors_out

    # --- write
    out_dir.mkdir(parents=True, exist_ok=True)
    generated = {
        "generator": "tools/floorplan_extract/extract_floor.py",
        "sourcePdf": floor["sourcePdf"],
        "sourcePdfSha256": pdf_sha,
    }

    def write(name, payload):
        (out_dir / name).write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    write(f"{stem}.layout.json", {
        **generated,
        "floor": {**floor, "coordinateSpace": "pdf-points-top-left", "width": r2(W), "height": r2(H),
                  "mmPerPt": round(mm_per_pt, 4)},
        "sourceRaster": {"path": f"floor-sources/{fid}.webp", "width": img.width, "height": img.height,
                         "pxPerPt": zoom, "includesAnnotations": True},
        "grid": {"columns": columns, "rows": rows},
        "layers": layers_out,
        "labels": label_out,
    })
    write(f"{stem}.zones.json", {**generated, "zones": zones, "rooms": rooms})
    write(f"{stem}.display-areas.json", {**generated, "displayAreas": getattr(cfg, "DISPLAY_AREAS", [])})
    # The overview is deliberately derived data: it carries enough stable
    # geometry for a floor picker/overview to paint before the heavy SVG layer
    # paths, obstacle detail and extraction report are requested.
    overview_zones = [
        {
            "id": zone["id"],
            "name": zone.get("name"),
            "departmentCode": zone.get("departmentCode"),
            "polygon": zone["polygon"],
            "bbox": zone["bbox"],
        }
        for zone in zones
    ]
    write(f"{stem}.overview.json", {
        **generated,
        "floor": {**floor, "coordinateSpace": "pdf-points-top-left", "width": r2(W), "height": r2(H),
                  "mmPerPt": round(mm_per_pt, 4)},
        "floorBounds": [0, 0, r2(W), r2(H)],
        "displayAreas": getattr(cfg, "DISPLAY_AREAS", []),
        "zones": overview_zones,
        "workstations": [
            {
                "id": workstation["id"],
                "floorId": workstation["floorId"],
                "clusterId": workstation["clusterId"],
                "zoneId": workstation["zoneId"],
                "center": workstation["center"],
                "bbox": workstation["bbox"],
                "rotationDeg": workstation["rotationDeg"],
            }
            for workstation in ws_out
        ],
    })
    write(f"{stem}.workstations.json", {**generated, "rule": rule, "clusters": clusters_out, "workstations": ws_out})
    write(f"{stem}.objects.json", {**generated, "objects": objects_out})
    write(f"{stem}.obstacles.json", {**generated, "obstacles": obstacles_out})

    ws_by_zone = collections.Counter(w["zoneId"] or "(none)" for w in ws_out if w["classification"] == "WORKSTATION")
    report = {
        **generated,
        "pdf": {
            "producer": doc.metadata.get("producer"),
            "creator": doc.metadata.get("creator"),
            "pages": doc.page_count,
            "rasterImages": len(page.get_images()),
            "vectorPathObjects": len(drawings),
            "textLines": len(texts),
            "annotations": len(annots),
        },
        "scale": {"mmPerPtX": round(mm_x, 3), "mmPerPtY": round(mm_y, 3)},
        "layers": {g["id"]: {"cadLayers": g["cadLayers"], "classification": g["classification"],
                             "pathBytes": len(g["d"])} for g in layers_out},
        "skippedCadLayers": dict(skipped_layers),
        "unmappedCadLayers": dict(unmapped_layers),
        "desks": {
            "deskLabels": len(desk_labels),
            "deskShapesMatchingSize": len(quads),
            "uniqueLabelledDesks": len(desk_list),
            "desksWithoutLabel": len(unlabelled_desk_quads),
            "note": "Each desk block is drawn twice in the PDF (duplicate geometry and label); de-duplicated by centre.",
        },
        "chairSymbolsDetected": len(chairs),
        "chairsPairedToDesks": sum(1 for v in chair_use.values() if v == 1),
        "classificationCounts": dict(class_counts),
        "clusters": len(clusters_out),
        "workstationsByZone": dict(sorted(ws_by_zone.items())),
        "zoneLabelFigures": {z["id"]: z["sourceLabelFigure"] for z in zones},
        "objects": dict(obj_counter),
        "obstacles": {
            "columns": len(columns_out),
            "walls": len(walls_out),
            "doorClearances": len(doors_out),
            "total": len(obstacles_out),
        },
        "ignoredAnnotations": ignored_annots,
    }
    write(f"{stem}.extraction.json", report)
    return report


def reading_order_local(c, origin):
    return (round((c[1] - origin[1]) / 3), c[0])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("floor", help="config module in floors/, e.g. floor16")
    ap.add_argument("--out", default=None, help="dataset output dir")
    ap.add_argument("--public", default=str(REPO / "frontend/public/floor-sources"))
    args = ap.parse_args()
    sys.path.insert(0, str(HERE))
    cfg = importlib.import_module(f"floors.{args.floor}")
    fid = cfg.FLOOR["id"]
    out = Path(args.out) if args.out else REPO / f"data/floors/{fid}"
    report = extract(cfg, REPO / cfg.FLOOR["sourcePdf"], out, Path(args.public))
    summary = {k: report[k] for k in ("scale", "desks", "chairSymbolsDetected", "classificationCounts", "clusters",
                                      "workstationsByZone", "zoneLabelFigures", "objects", "obstacles", "unmappedCadLayers")}
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
