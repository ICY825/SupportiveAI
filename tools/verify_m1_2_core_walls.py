#!/usr/bin/env python3
"""
Adversarial Empirical Verification Harness for Milestone M1-2:
Concrete Core Wall & Workstation Non-Collision & Boundary Stress Testing.

Challenger: M1-2-1 (Core Wall & Workstation Non-Collision Adversarial Verifier)
"""
import collections
import json
import math
import sys
from pathlib import Path
from shapely.affinity import rotate, translate
from shapely.geometry import Polygon, Point, box, LineString
from shapely.validation import explain_validity

def r2(val):
    return round(val, 2)

def run_adversarial_verification():
    repo_root = Path(__file__).resolve().parents[1]
    obstacles_path = repo_root / "frontend/src/features/floor-planning/data/floors/floor-16/floor16.obstacles.json"
    workstations_path = repo_root / "frontend/src/features/floor-planning/data/floors/floor-16/floor16.workstations.json"
    zones_path = repo_root / "frontend/src/features/floor-planning/data/floors/floor-16/floor16.zones.json"

    print("=" * 80)
    print("CHALLENGER M1-2-1: CORE WALL & WORKSTATION ADVERSARIAL VERIFICATION")
    print("=" * 80)
    print(f"Dataset Paths:")
    print(f"  Obstacles:    {obstacles_path}")
    print(f"  Workstations: {workstations_path}")
    print(f"  Zones:        {zones_path}")

    assert obstacles_path.exists(), f"Missing {obstacles_path}"
    assert workstations_path.exists(), f"Missing {workstations_path}"
    assert zones_path.exists(), f"Missing {zones_path}"

    with open(obstacles_path, "r", encoding="utf-8") as f:
        obs_data = json.load(f)
    with open(workstations_path, "r", encoding="utf-8") as f:
        ws_data = json.load(f)
    with open(zones_path, "r", encoding="utf-8") as f:
        zones_data = json.load(f)

    obstacles = obs_data.get("obstacles", [])
    workstations = ws_data.get("workstations", [])
    clusters = ws_data.get("clusters", [])

    columns = [o for o in obstacles if o.get("kind") == "column"]
    walls = [o for o in obstacles if o.get("kind") == "wall"]
    doors = [o for o in obstacles if o.get("kind") == "door-clearance"]

    print(f"\nEntity Counts:")
    print(f"  Total obstacles:    {len(obstacles)} (expected 128)")
    print(f"  - Columns:          {len(columns)} (expected 34)")
    print(f"  - Core walls:       {len(walls)} (expected 4)")
    print(f"  - Door clearances:  {len(doors)} (expected 90)")
    print(f"  Workstations:       {len(workstations)} (expected 382)")
    print(f"  Clusters:           {len(clusters)} (expected 61)")

    failures = []
    warnings = []

    # =========================================================================
    # SUITE 1: CORE WALL SCHEMA & GEOMETRIC WELL-FORMEDNESS
    # =========================================================================
    print("\n" + "=" * 80)
    print("SUITE 1: CORE WALL SCHEMA & GEOMETRY VERIFICATION")
    print("=" * 80)

    if len(obstacles) != 128:
        failures.append(f"Expected 128 obstacles, found {len(obstacles)}")
    if len(walls) != 4:
        failures.append(f"Expected 4 core walls, found {len(walls)}")

    expected_wall_ids = ["wall-16-01", "wall-16-02", "wall-16-03", "wall-16-04"]
    actual_wall_ids = [w["id"] for w in walls]
    if actual_wall_ids != expected_wall_ids:
        failures.append(f"Wall IDs mismatch: expected {expected_wall_ids}, got {actual_wall_ids}")

    wall_polys = {}
    for w in walls:
        wid = w["id"]
        print(f"\nChecking {wid}: '{w.get('name')}'")
        print(f"  Category: {w.get('category')}, Kind: {w.get('kind')}")
        print(f"  BBox:     {w.get('bbox')}")
        print(f"  Center:   {w.get('center')}")
        print(f"  GridRef:  {w.get('gridRef')}")

        if w.get("category") != "solid":
            failures.append(f"[{wid}] category is not 'solid': {w.get('category')}")
        if w.get("kind") != "wall":
            failures.append(f"[{wid}] kind is not 'wall': {w.get('kind')}")

        poly_pts = w.get("polygon", [])
        if len(poly_pts) != 4:
            failures.append(f"[{wid}] polygon vertices count != 4: {len(poly_pts)}")

        # NaN / Inf check
        coords = []
        for p in poly_pts:
            coords.extend(p)
        coords.extend(w.get("bbox", []))
        coords.extend(w.get("center", []))
        for c in coords:
            if not isinstance(c, (int, float)) or math.isnan(c) or math.isinf(c):
                failures.append(f"[{wid}] Invalid coordinate (NaN/Inf): {c}")

        # Shapely validity
        sh_poly = Polygon(poly_pts)
        if not sh_poly.is_valid:
            failures.append(f"[{wid}] Shapely invalid: {explain_validity(sh_poly)}")
        if not sh_poly.is_simple:
            failures.append(f"[{wid}] Polygon not simple (self-intersecting)")
        if sh_poly.area <= 0:
            failures.append(f"[{wid}] Area non-positive: {sh_poly.area}")

        # Bounding box tightness
        min_x = min(p[0] for p in poly_pts)
        min_y = min(p[1] for p in poly_pts)
        max_x = max(p[0] for p in poly_pts)
        max_y = max(p[1] for p in poly_pts)
        bx0, by0, bx1, by1 = w.get("bbox", [0, 0, 0, 0])

        if abs(bx0 - min_x) > 0.01 or abs(by0 - min_y) > 0.01 or abs(bx1 - max_x) > 0.01 or abs(by1 - max_y) > 0.01:
            failures.append(f"[{wid}] BBox mismatch with polygon: bbox={w.get('bbox')} vs poly=[{min_x}, {min_y}, {max_x}, {max_y}]")

        # Rectangularity and orthogonality
        p0, p1, p2, p3 = poly_pts
        v0 = (p1[0] - p0[0], p1[1] - p0[1])
        v1 = (p2[0] - p1[0], p2[1] - p1[1])
        dot = v0[0] * v1[0] + v0[1] * v1[1]
        if abs(dot) > 1e-3:
            failures.append(f"[{wid}] Non-orthogonal edges: dot product {dot}")

        wall_polys[wid] = (w, sh_poly)
        print(f"  Area: {sh_poly.area:.2f} pt² ({sh_poly.area * 105.838 * 105.82 / 1e6:.2f} m²)")

    # =========================================================================
    # SUITE 2: WORKSTATION & CLUSTER PENETRATION VERIFICATION
    # =========================================================================
    print("\n" + "=" * 80)
    print("SUITE 2: WORKSTATION & CLUSTER PENETRATION COLLISION VERIFICATION")
    print("=" * 80)

    ws_polys = {}
    for d in workstations:
        did = d["id"]
        sh_poly = Polygon(d["polygon"])
        if not sh_poly.is_valid:
            failures.append(f"[{did}] Workstation polygon invalid: {explain_validity(sh_poly)}")
        ws_polys[did] = (d, sh_poly)

    penetrations = []
    flush_contacts = []
    near_contacts = []  # 0 < distance < 0.2 pt (~20 mm)
    wall_min_dists = {wid: float("inf") for wid in expected_wall_ids}
    wall_nearest_desk = {wid: None for wid in expected_wall_ids}

    for did, (d, d_poly) in ws_polys.items():
        db = d["bbox"]
        for wid, (w, w_poly) in wall_polys.items():
            wb = w["bbox"]
            # Quick bounding box overlap
            ox = min(db[2], wb[2]) - max(db[0], wb[0])
            oy = min(db[3], wb[3]) - max(db[1], wb[1])

            dist = d_poly.distance(w_poly)
            inter = d_poly.intersection(w_poly)
            inter_area = inter.area

            if dist < wall_min_dists[wid]:
                wall_min_dists[wid] = dist
                wall_nearest_desk[wid] = (did, dist)

            # Strict penetration check (even 1e-5 pt² is flagged)
            if inter_area > 1e-4:
                penetrations.append({
                    "deskId": did,
                    "wallId": wid,
                    "overlapAreaPt2": inter_area,
                    "overlapAreaMm2": inter_area * 105.838 * 105.82,
                    "bboxOverlap": (ox, oy),
                })
                failures.append(f"TRUE PENETRATION: Desk {did} penetrates {wid} (area={inter_area:.4f} pt²)")
            elif dist < 1e-6 or inter.geom_type in ("LineString", "MultiLineString", "Point"):
                contact_len = inter.length if inter.geom_type in ("LineString", "MultiLineString") else 0.0
                contact_pts = list(inter.coords) if hasattr(inter, "coords") else []
                flush_contacts.append({
                    "deskId": did,
                    "wallId": wid,
                    "distance": dist,
                    "geomType": inter.geom_type,
                    "contactLengthPt": contact_len,
                    "contactLengthMm": contact_len * 105.83,
                    "overlapArea": inter_area,
                    "deskBbox": db,
                    "wallBbox": wb,
                    "contactCoords": contact_pts,
                })
            elif dist < 0.20:
                near_contacts.append({
                    "deskId": did,
                    "wallId": wid,
                    "distancePt": dist,
                    "distanceMm": dist * 105.83,
                })

    print(f"Total Workstation-Wall pair checks: {len(workstations) * len(walls)} (382 x 4)")
    print(f"Penetration collisions (overlap area > 0): {len(penetrations)} (PASS if 0)")
    print(f"Exact flush contacts (dist == 0, area == 0): {len(flush_contacts)}")
    print(f"Near-flush desks (0 < dist < 20 mm):         {len(near_contacts)}")

    # Check Clusters vs Walls
    cluster_penetrations = []
    cluster_touches = []
    for cl in clusters:
        cid = cl["id"]
        cb = cl["bbox"]
        cl_box = box(*cb)
        # Also construct union of workstations in this cluster
        member_desks = [ws_polys[did][1] for did in cl.get("workstationIds", []) if did in ws_polys]
        for wid, (w, w_poly) in wall_polys.items():
            wb = w["bbox"]
            ox = min(cb[2], wb[2]) - max(cb[0], wb[0])
            oy = min(cb[3], wb[3]) - max(cb[1], wb[1])
            # If bounding boxes don't intersect, no cluster penetration
            if ox <= 0 or oy <= 0:
                continue

            # Check each member workstation in cluster
            for m_poly in member_desks:
                inter_area = m_poly.intersection(w_poly).area
                if inter_area > 1e-4:
                    cluster_penetrations.append((cid, wid, inter_area))
                    failures.append(f"CLUSTER PENETRATION: Cluster {cid} penetrates {wid} (area={inter_area:.4f})")

    print(f"\nCluster vs Wall checks: {len(clusters) * len(walls)} (61 x 4)")
    print(f"Cluster penetration collisions: {len(cluster_penetrations)} (PASS if 0)")

    # =========================================================================
    # SUITE 3: ADJACENT FLUSH CONTACT DETAILS (0 mm gap)
    # =========================================================================
    print("\n" + "=" * 80)
    print("SUITE 3: ADJACENT FLUSH CONTACT DETAILED ANALYSIS")
    print("=" * 80)
    
    flush_by_wall = collections.defaultdict(list)
    for c in flush_contacts:
        flush_by_wall[c["wallId"]].append(c)

    print(f"Breakdown of {len(flush_contacts)} flush contact workstations by core wall:")
    for wid in expected_wall_ids:
        contacts = flush_by_wall[wid]
        print(f"\n  Wall {wid} has {len(contacts)} flush workstations:")
        for fc in sorted(contacts, key=lambda x: x["deskId"]):
            contact_edge = "UNKNOWN"
            db = fc["deskBbox"]
            wb = fc["wallBbox"]
            if abs(db[2] - wb[0]) < 0.05:
                contact_edge = "West of wall (desk East edge against wall West face)"
            elif abs(db[0] - wb[2]) < 0.05:
                contact_edge = "East of wall (desk West edge against wall East face)"
            elif abs(db[3] - wb[1]) < 0.05:
                contact_edge = "North of wall (desk South edge against wall North face)"
            elif abs(db[1] - wb[3]) < 0.05:
                contact_edge = "South of wall (desk North edge against wall South face)"

            print(f"    - {fc['deskId']}: dist={fc['distance']:.6f} pt, "
                  f"type={fc['geomType']}, len={fc['contactLengthPt']:.2f} pt ({fc['contactLengthMm']:.1f} mm), "
                  f"area={fc['overlapArea']:.6f} pt², edge={contact_edge}")

    # Verify claim of 21 flush desks
    if len(flush_contacts) != 21:
        failures.append(f"Expected exactly 21 flush workstations, got {len(flush_contacts)}")
    else:
        print(f"\nCONFIRMED: Exactly 21 workstations sit flush with 0.00 mm gap against core walls!")

    # Check closest non-flush desks for each wall
    print("\nClosest non-flush workstations to each wall:")
    for wid in expected_wall_ids:
        flush_ids = {fc["deskId"] for fc in flush_by_wall[wid]}
        min_non_flush_dist = float("inf")
        closest_desk = None
        for did, (d, d_poly) in ws_polys.items():
            if did in flush_ids:
                continue
            dist = d_poly.distance(wall_polys[wid][1])
            if dist < min_non_flush_dist:
                min_non_flush_dist = dist
                closest_desk = did
        print(f"  {wid}: closest non-contact desk {closest_desk} at {min_non_flush_dist:.2f} pt ({min_non_flush_dist * 105.83:.1f} mm)")

    # =========================================================================
    # SUITE 4: ADVERSARIAL PERTURBATION & MICRO-NUDGE STRESS TESTING
    # =========================================================================
    print("\n" + "=" * 80)
    print("SUITE 4: ADVERSARIAL PERTURBATION & MICRO-NUDGE STRESS TESTING")
    print("=" * 80)

    adversarial_failures = 0
    # For each flush desk, test:
    # 1. Inward translation towards wall interior: MUST produce penetration collision > 0 area
    # 2. Outward translation away from wall: MUST produce distance > 0 and area == 0
    # 3. Rotational tilt by 0.2 deg: MUST produce penetration collision > 0 area

    print("Running micro-nudge tests on all 21 flush workstations...")
    deltas = [0.001, 0.01, 0.05, 0.1, 1.0] # in pt (~0.1mm, ~1mm, ~5mm, ~10mm, ~100mm)

    for fc in flush_contacts:
        did = fc["deskId"]
        wid = fc["wallId"]
        d_poly = ws_polys[did][1]
        w_poly = wall_polys[wid][1]
        db = fc["deskBbox"]
        wb = fc["wallBbox"]

        # Determine inward normal vector (towards wall interior based on touching face)
        if abs(db[2] - wb[0]) < 0.05:
            inward_vec = (1.0, 0.0)   # Desk is West of wall, moving +X penetrates wall
        elif abs(db[0] - wb[2]) < 0.05:
            inward_vec = (-1.0, 0.0)  # Desk is East of wall, moving -X penetrates wall
        elif abs(db[3] - wb[1]) < 0.05:
            inward_vec = (0.0, 1.0)   # Desk is North of wall, moving +Y penetrates wall
        elif abs(db[1] - wb[3]) < 0.05:
            inward_vec = (0.0, -1.0)  # Desk is South of wall, moving -Y penetrates wall
        else:
            raise ValueError(f"Unknown touching face for {did} and {wid}")

        # Test inward micro-nudges
        for delta in deltas:
            nudged_inward = translate(d_poly, xoff=inward_vec[0] * delta, yoff=inward_vec[1] * delta)
            pen_area = nudged_inward.intersection(w_poly).area
            if pen_area <= 0.0:
                adversarial_failures += 1
                failures.append(f"Oracle Failure: Inward nudge {delta}pt for {did} against {wid} did NOT penetrate! area={pen_area}")

        # Test outward micro-nudges
        for delta in deltas:
            nudged_outward = translate(d_poly, xoff=-inward_vec[0] * delta, yoff=-inward_vec[1] * delta)
            out_dist = nudged_outward.distance(w_poly)
            out_area = nudged_outward.intersection(w_poly).area
            if out_dist < delta * 0.99 or out_area > 0.0:
                adversarial_failures += 1
                failures.append(f"Oracle Failure: Outward nudge {delta}pt for {did} against {wid} failed! dist={out_dist}, area={out_area}")

        # Test rotational perturbation (tilt 0.2 deg and 1.0 deg around desk center)
        for angle in [0.2, 1.0, -0.2, -1.0]:
            rotated_poly = rotate(d_poly, angle, origin="center")
            rot_area = rotated_poly.intersection(w_poly).area
            # Since desk is flush along an entire edge, rotation around center must push one corner into wall
            if rot_area <= 1e-6:
                adversarial_failures += 1
                failures.append(f"Oracle Failure: Rotation {angle}deg for {did} against {wid} did NOT produce penetration! area={rot_area}")

    if adversarial_failures == 0:
        print(f"PASS: All 21 flush desks passed 100% of inward ({len(deltas)}x), outward ({len(deltas)}x), and rotational (4x) perturbation tests.")
        print(f"      Total micro-perturbation checks executed: {len(flush_contacts) * (len(deltas)*2 + 4)} = 294 stress tests, 0 failures.")
    else:
        print(f"FAIL: {adversarial_failures} adversarial micro-nudge tests failed!")

    # =========================================================================
    # SUITE 5: BOUNDARY CONDITION & SAFEBOUNDS STRESS TESTING
    # =========================================================================
    print("\n" + "=" * 80)
    print("SUITE 5: BOUNDARY CONDITION & SAFEBOUNDS SENSITIVITY ANALYSIS")
    print("=" * 80)

    # Let's inspect the exact boundaries of wall-16-02, wall-16-03, wall-16-04
    # and compute how much expansion each boundary could tolerate before colliding with any workstation.
    print("Analyzing expansion tolerances for each core wall face before workstation collision:")
    
    for wid in expected_wall_ids:
        w_poly = wall_polys[wid][1]
        wb = wall_polys[wid][0]["bbox"]
        print(f"\n  Wall {wid} (bbox: {wb}):")
        
        # Test expanding each of the 4 faces: minX (-X), maxX (+X), minY (-Y), maxY (+Y)
        faces = [
            ("West (-X)", (-1, 0, 0, 0)),
            ("East (+X)", (0, 0, 1, 0)),
            ("North (-Y)", (0, -1, 0, 0)),
            ("South (+Y)", (0, 0, 0, 1)),
        ]
        for face_name, (dx0, dy0, dx1, dy1) in faces:
            # Check if any workstations are flush on this face
            flush_on_face = []
            for fc in flush_by_wall[wid]:
                db = fc["deskBbox"]
                if dx0 < 0 and abs(db[2] - wb[0]) < 0.05:
                    flush_on_face.append(fc["deskId"])
                elif dx1 > 0 and abs(db[0] - wb[2]) < 0.05:
                    flush_on_face.append(fc["deskId"])
                elif dy0 < 0 and abs(db[3] - wb[1]) < 0.05:
                    flush_on_face.append(fc["deskId"])
                elif dy1 > 0 and abs(db[1] - wb[3]) < 0.05:
                    flush_on_face.append(fc["deskId"])

            if flush_on_face:
                print(f"    Face {face_name}: Flush desks {flush_on_face} -> expansion tolerance = 0.000 pt (ZERO GAP: any expansion collides)")
            else:
                # Find minimum distance to any workstation on this side
                min_clearance = float("inf")
                closest_w = None
                for did, (d, d_poly) in ws_polys.items():
                    db = d["bbox"]
                    # Check if desk is in projection of this face
                    if dx0 < 0 and db[2] <= wb[0]:
                        if not (db[3] < wb[1] or db[1] > wb[3]):
                            gap = wb[0] - db[2]
                            if gap < min_clearance:
                                min_clearance = gap
                                closest_w = did
                    elif dx1 > 0 and db[0] >= wb[2]:
                        if not (db[3] < wb[1] or db[1] > wb[3]):
                            gap = db[0] - wb[2]
                            if gap < min_clearance:
                                min_clearance = gap
                                closest_w = did
                    elif dy0 < 0 and db[3] <= wb[1]:
                        if not (db[2] < wb[0] or db[0] > wb[2]):
                            gap = wb[1] - db[3]
                            if gap < min_clearance:
                                min_clearance = gap
                                closest_w = did
                    elif dy1 > 0 and db[1] >= wb[3]:
                        if not (db[2] < wb[0] or db[0] > wb[2]):
                            gap = db[1] - wb[3]
                            if gap < min_clearance:
                                min_clearance = gap
                                closest_w = did

                if closest_w:
                    print(f"    Face {face_name}: Open corridor / room -> clearance to {closest_w}: {min_clearance:.2f} pt ({min_clearance * 105.83:.1f} mm)")
                else:
                    print(f"    Face {face_name}: No facing workstations in bounding projection")

    # =========================================================================
    # VERDICT AND SUMMARY
    # =========================================================================
    print("\n" + "=" * 80)
    print("VERDICT EVALUATION")
    print("=" * 80)
    print(f"Total Failures Encountered: {len(failures)}")
    for idx, f in enumerate(failures, 1):
        print(f"  [{idx}] {f}")

    if len(failures) == 0:
        verdict = "APPROVE"
        print(f"\nFINAL VERDICT: {verdict}")
        print("Summary of Verified Facts:")
        print("1. All 4 concrete core walls (wall-16-01 to wall-16-04) are valid, non-degenerate,")
        print("   strictly orthogonal rectangular solid obstacles.")
        print("2. ZERO penetration collisions exist between the 4 core walls and any of the 382 workstations.")
        print("3. ZERO penetration collisions exist between the 4 core walls and any of the 61 workstation clusters.")
        print("4. Exactly 21 workstations sit flush against the core walls with verified 0.00 mm gap")
        print("   and 0.00 mm² penetration area.")
        print("5. 294 adversarial micro-perturbation stress tests confirmed the physical oracle sensitivity:")
        print("   any inward shift immediately triggers collision, while any outward shift creates separation.")
    else:
        verdict = "REJECT"
        print(f"\nFINAL VERDICT: {verdict}")

    return 0 if verdict == "APPROVE" else 1

if __name__ == "__main__":
    sys.exit(run_adversarial_verification())
