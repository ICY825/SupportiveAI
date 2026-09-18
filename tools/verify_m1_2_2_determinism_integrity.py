#!/usr/bin/env python3
"""
Comprehensive Verification Harness for Challenger M1-2-2:
1. Extraction Determinism (byte-for-byte SHA256 reproducibility across multiple extraction runs and isolated output directories)
2. Full Dataset Integrity (obstacle counts: 128 total [34 columns, 4 core walls, 90 door clearances], 382 workstations, 61 clusters)
3. Schema, ID uniqueness, geometry validity, and extraction report cross-consistency.
"""

import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DATASET_DIR = REPO_ROOT / "data/floors/floor-16"

EXPECTED_JSON_FILES = [
    "floor16.layout.json",
    "floor16.zones.json",
    "floor16.workstations.json",
    "floor16.objects.json",
    "floor16.obstacles.json",
    "floor16.extraction.json",
]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def run_cmd(cmd: list[str]) -> subprocess.CompletedProcess:
    res = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"COMMAND FAILED: {' '.join(cmd)}")
        print(f"STDOUT: {res.stdout}")
        print(f"STDERR: {res.stderr}")
        raise RuntimeError(f"Command {' '.join(cmd)} exited with {res.returncode}")
    return res


def test_determinism():
    print("=" * 80)
    print("TEST SUITE 1: EXTRACTION DETERMINISM VERIFICATION")
    print("=" * 80)

    # Step 1: Record initial checksums
    initial_hashes = {}
    for fname in EXPECTED_JSON_FILES:
        fpath = DATASET_DIR / fname
        assert fpath.exists(), f"File {fpath} does not exist!"
        initial_hashes[fname] = sha256_file(fpath)
        print(f"Initial SHA256 [{fname}]: {initial_hashes[fname]}")

    # Step 2: Run extraction using python3 tools/floorplan_extract/extract_floor.py floor16
    print("\nRunning Run 1: python3 tools/floorplan_extract/extract_floor.py floor16 ...")
    run_cmd(["python3", "tools/floorplan_extract/extract_floor.py", "floor16"])

    run1_hashes = {}
    for fname in EXPECTED_JSON_FILES:
        fpath = DATASET_DIR / fname
        run1_hashes[fname] = sha256_file(fpath)
        if run1_hashes[fname] != initial_hashes[fname]:
            raise AssertionError(
                f"Determinism failure on Run 1 for {fname}:\n  Initial: {initial_hashes[fname]}\n  Run 1:   {run1_hashes[fname]}"
            )
    print("Run 1: All 6 JSON files matched initial checksums byte-for-byte.")

    # Step 3: Run extraction using uv run --with pymupdf --with pillow python3 tools/floorplan_extract/extract_floor.py floor16
    print("\nRunning Run 2: uv run --with pymupdf --with pillow python3 tools/floorplan_extract/extract_floor.py floor16 ...")
    run_cmd([
        "uv", "run", "--with", "pymupdf", "--with", "pillow",
        "python3", "tools/floorplan_extract/extract_floor.py", "floor16"
    ])

    run2_hashes = {}
    for fname in EXPECTED_JSON_FILES:
        fpath = DATASET_DIR / fname
        run2_hashes[fname] = sha256_file(fpath)
        if run2_hashes[fname] != initial_hashes[fname]:
            raise AssertionError(
                f"Determinism failure on Run 2 for {fname}:\n  Initial: {initial_hashes[fname]}\n  Run 2:   {run2_hashes[fname]}"
            )
    print("Run 2 (uv runner): All 6 JSON files matched initial checksums byte-for-byte.")

    # Step 4: Run extraction to an isolated temp output directory
    scratch_dir = REPO_ROOT / "tools/scratch_extract_determinism_test"
    if scratch_dir.exists():
        shutil.rmtree(scratch_dir)
    scratch_dir.mkdir(parents=True, exist_ok=True)

    try:
        print(f"\nRunning Run 3: Extraction to isolated directory {scratch_dir} ...")
        res = run_cmd([
            "python3", "tools/floorplan_extract/extract_floor.py", "floor16",
            "--out", str(scratch_dir)
        ])
        print(f"Run 3 completed with returncode {res.returncode}")
        print("Run 3 stdout:\n", res.stdout)
        if res.stderr:
            print("Run 3 stderr:\n", res.stderr)
        existing_files = list(scratch_dir.iterdir()) if scratch_dir.exists() else []
        print("Files in scratch_dir:", [f.name for f in existing_files])

        for fname in EXPECTED_JSON_FILES:
            isolated_path = scratch_dir / fname
            assert isolated_path.exists(), f"Isolated output missing {fname}"
            isolated_hash = sha256_file(isolated_path)
            if isolated_hash != initial_hashes[fname]:
                raise AssertionError(
                    f"Determinism failure in isolated directory for {fname}:\n  Expected: {initial_hashes[fname]}\n  Got:      {isolated_hash}"
                )
        print("Run 3 (isolated target): All 6 JSON files matched byte-for-byte.")
    finally:
        if scratch_dir.exists():
            shutil.rmtree(scratch_dir)

    # Step 5: Verify git diff on dataset directory is clean
    res = run_cmd(["git", "diff", "--exit-code", str(DATASET_DIR)])
    print("Git diff check on dataset directory: CLEAN (0 bytes changed).")
    print("SUITE 1 RESULT: 100% DETERMINISTIC PASS\n")


def test_dataset_integrity():
    print("=" * 80)
    print("TEST SUITE 2: FULL DATASET INTEGRITY VERIFICATION")
    print("=" * 80)

    obs_file = DATASET_DIR / "floor16.obstacles.json"
    ws_file = DATASET_DIR / "floor16.workstations.json"
    extract_file = DATASET_DIR / "floor16.extraction.json"
    zones_file = DATASET_DIR / "floor16.zones.json"
    objects_file = DATASET_DIR / "floor16.objects.json"
    layout_file = DATASET_DIR / "floor16.layout.json"

    with open(obs_file, "r", encoding="utf-8") as f:
        obs_json = json.load(f)
    with open(ws_file, "r", encoding="utf-8") as f:
        ws_json = json.load(f)
    with open(extract_file, "r", encoding="utf-8") as f:
        ext_json = json.load(f)
    with open(zones_file, "r", encoding="utf-8") as f:
        zones_json = json.load(f)
    with open(objects_file, "r", encoding="utf-8") as f:
        obj_json = json.load(f)
    with open(layout_file, "r", encoding="utf-8") as f:
        lay_json = json.load(f)

    obstacles = obs_json.get("obstacles", [])
    workstations = ws_json.get("workstations", [])
    clusters = ws_json.get("clusters", [])

    columns = [o for o in obstacles if o.get("kind") == "column"]
    walls = [o for o in obstacles if o.get("kind") == "wall"]
    doors = [o for o in obstacles if o.get("kind") == "door-clearance"]

    print(f"Total Obstacles:    {len(obstacles)} (Required: 128)")
    print(f"  - Columns:        {len(columns)} (Required: 34)")
    print(f"  - Core walls:     {len(walls)} (Required: 4)")
    print(f"  - DoorClearances: {len(doors)} (Required: 90)")
    print(f"Total Workstations: {len(workstations)} (Required: 382)")
    print(f"Total Clusters:     {len(clusters)} (Required: 61)")

    # 1. Exact count assertions
    assert len(obstacles) == 128, f"Expected 128 obstacles, got {len(obstacles)}"
    assert len(columns) == 34, f"Expected 34 columns, got {len(columns)}"
    assert len(walls) == 4, f"Expected 4 walls, got {len(walls)}"
    assert len(doors) == 90, f"Expected 90 door clearances, got {len(doors)}"
    assert len(workstations) == 382, f"Expected 382 workstations, got {len(workstations)}"
    assert len(clusters) == 61, f"Expected 61 clusters, got {len(clusters)}"

    # 2. Obstacle Schema & Category Verification
    for o in obstacles:
        oid = o["id"]
        kind = o["kind"]
        cat = o["category"]
        bbox = o["bbox"]
        poly = o["polygon"]
        center = o["center"]

        assert len(bbox) == 4, f"[{oid}] invalid bbox format: {bbox}"
        assert bbox[0] < bbox[2], f"[{oid}] bbox minX >= maxX: {bbox}"
        assert bbox[1] < bbox[3], f"[{oid}] bbox minY >= maxY: {bbox}"
        assert bbox[0] <= center[0] <= bbox[2], f"[{oid}] center X outside bbox"
        assert bbox[1] <= center[1] <= bbox[3], f"[{oid}] center Y outside bbox"
        assert len(poly) >= 3, f"[{oid}] polygon has < 3 vertices"

        if kind in ("column", "wall"):
            assert cat == "solid", f"[{oid}] {kind} category must be 'solid', got {cat}"
            assert len(poly) == 4, f"[{oid}] rectangular solid must have 4 vertices, got {len(poly)}"
        elif kind == "door-clearance":
            assert cat == "clearance", f"[{oid}] door-clearance category must be 'clearance', got {cat}"
            assert "doorId" in o, f"[{oid}] door-clearance missing doorId"
            assert "hinge" in o, f"[{oid}] door-clearance missing hinge"
            assert "radiusMm" in o, f"[{oid}] door-clearance missing radiusMm"
            assert o["radiusMm"] > 0, f"[{oid}] radiusMm non-positive"
        else:
            raise AssertionError(f"[{oid}] unexpected obstacle kind: {kind}")

    # 3. Workstation Schema Verification
    ws_ids = set()
    for ws in workstations:
        wid = ws["id"]
        assert wid not in ws_ids, f"Duplicate workstation ID: {wid}"
        ws_ids.add(wid)
        assert ws.get("classification") == "WORKSTATION", f"[{wid}] unexpected classification: {ws.get('classification')}"
        poly = ws["polygon"]
        assert len(poly) == 4, f"[{wid}] workstation polygon must have 4 points, got {len(poly)}"
        bbox = ws["bbox"]
        assert bbox[0] < bbox[2] and bbox[1] < bbox[3], f"[{wid}] invalid workstation bbox: {bbox}"

    # 4. Cluster Schema Verification
    cl_ids = set()
    total_desks_in_clusters = 0
    for cl in clusters:
        cid = cl["id"]
        assert cid not in cl_ids, f"Duplicate cluster ID: {cid}"
        cl_ids.add(cid)
        cl_ws = cl.get("workstationIds", [])
        assert len(cl_ws) > 0, f"[{cid}] cluster has no workstations"
        for member_id in cl_ws:
            assert member_id in ws_ids, f"[{cid}] cluster references unknown workstation {member_id}"
        total_desks_in_clusters += len(cl_ws)

    assert total_desks_in_clusters == 382, f"Sum of workstations in clusters ({total_desks_in_clusters}) != 382"

    # 5. Cross-Check with floor16.extraction.json
    print("\nCross-checking with floor16.extraction.json report metadata:")
    report_obs = ext_json["obstacles"]
    assert report_obs["total"] == 128, f"Report total obstacles mismatch: {report_obs['total']}"
    assert report_obs["columns"] == 34, f"Report columns mismatch: {report_obs['columns']}"
    assert report_obs["walls"] == 4, f"Report walls mismatch: {report_obs['walls']}"
    assert report_obs["doorClearances"] == 90, f"Report door clearances mismatch: {report_obs['doorClearances']}"

    report_desks = ext_json["desks"]
    assert report_desks["uniqueLabelledDesks"] == 382, f"Report uniqueLabelledDesks mismatch: {report_desks['uniqueLabelledDesks']}"
    assert report_desks["deskShapesMatchingSize"] == 382, f"Report deskShapesMatchingSize mismatch: {report_desks['deskShapesMatchingSize']}"
    assert ext_json["classificationCounts"]["WORKSTATION"] == 382, f"Report classification WORKSTATION mismatch"
    assert ext_json["clusters"] == 61, f"Report clusters count mismatch: {ext_json['clusters']}"

    # 6. Check Rooms and Zones
    rooms = zones_json.get("rooms", [])
    zones = zones_json.get("zones", [])
    print(f"Zones: {len(zones)}, Rooms: {len(rooms)}")
    assert len(zones) > 0, "No zones extracted"
    assert len(rooms) > 0, "No rooms extracted"

    # 7. Check Objects
    objects = obj_json.get("objects", [])
    print(f"Facilities / Objects: {len(objects)}")
    assert len(objects) == 15, f"Expected 15 objects, got {len(objects)}"

    # 8. Check Layout Layers
    layers = lay_json.get("layers", [])
    print(f"Layout Render Groups/Layers: {len(layers)}")
    assert len(layers) > 0, "No layers in layout.json"

    print("SUITE 2 RESULT: 100% DATASET INTEGRITY PASS\n")


if __name__ == "__main__":
    try:
        test_determinism()
        test_dataset_integrity()
        print("ALL VERIFICATIONS PASSED SUCCESSFULLY!")
        sys.exit(0)
    except Exception as e:
        print(f"\nVERIFICATION FAILED: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
