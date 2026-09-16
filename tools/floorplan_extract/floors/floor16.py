"""Extraction config for Floor 16 (260710_VSF_Layout tang 16.pdf).

Everything floor-specific lives here. The extractor itself (extract_floor.py)
is generic: another floor gets its own config module in this folder.

Every mapping below was decided by visually inspecting the PDF and reading
its CAD layer names / markup annotations. Nothing is inferred beyond what the
drawing shows; unresolved items are marked UNKNOWN on purpose.
"""

FLOOR = {
    "id": "floor-16",
    "level": 16,
    "buildingId": "building-technopark",  # not stated in the PDF; confirmed by the team (Technopark)
    "name": "Tầng 16",
    "sourceTitle": "MẶT BẰNG CẢI TẠO TẦNG 16",
    "sourceScale": "1/150",
    "sourcePdf": "docs/references/260710_VSF_Layout tang 16.pdf",
}

# Grid lines: the drawing dimension chains give 90500 mm between grid K and A
# and 56000 mm between grid 7 and 1. Used to derive mm-per-point.
GRID_SPAN_X = ("K", "A", 90500)
GRID_SPAN_Y = ("7", "1", 56000)
GRID_COLUMNS = list("KJIHGFEDCBA")  # left -> right on the sheet
GRID_ROWS = ["7", "6", "5", "4", "4.1", "3", "2", "1"]  # top -> bottom

# CAD layer (suffix after the last "$") -> render group + classification.
# Groups are what the web map draws. Layers mapped to None are not exported.
LAYERS = {
    # structure / envelope
    "KT-Betong": ("structure", "STRUCTURAL", "Concrete columns / core walls (hatched)"),
    "KT-Hatch": ("structure", "STRUCTURAL", "Core wall hatching"),
    "KT-Tuong": ("walls", "STRUCTURAL", "Walls"),
    "A-WALL-INT": ("walls", "STRUCTURAL", "Interior walls"),
    "KT-Thietbi": ("facade", "STRUCTURAL", "Facade / slab edge outline"),
    "KT-CuaKinh": ("facade", "STRUCTURAL", "Curtain wall glazing"),
    "KT-IMPT": ("facade", "STRUCTURAL", "Facade mullions / misc. architectural marks"),
    "KT-Thang": ("core", "STRUCTURAL", "Stairs"),
    "KT-NetKhuat": ("core", "STRUCTURAL", "Hidden lines (lift shafts / voids)"),
    # partitions & openings
    "A-FURN WALL GYP": ("partitions", "STRUCTURAL", "Gypsum partitions"),
    "KT-Netthay": ("partitions", "UNKNOWN", "Visible-line details (partition ends, room fittings)"),
    "KT-NetManh": ("partitions", "UNKNOWN", "Heavy-line details"),
    "KT-Cua": ("doors", "STRUCTURAL", "Doors"),
    "A-DOOR": ("doors", "STRUCTURAL", "Doors"),
    "A-GENM": ("doors", "UNKNOWN", "Arc details near openings (layer purpose not stated)"),
    # furniture & fittings
    "": ("furniture", "FURNITURE", "Un-layered blocks (desks, chairs, tables)"),
    "A-FURN": ("furniture", "FURNITURE", "Furniture"),
    "FF-FURN": ("furniture", "FURNITURE", "Furniture"),
    "A-PATT": ("furniture", "UNKNOWN", "Pattern details"),
    "KT-Others": ("fixtures", "UNKNOWN", "Misc. fixtures (appears to include sanitary / pantry items)"),
    "KT-Kyhieu": ("fixtures", "UNKNOWN", "Symbols"),
    "PHUONG-AN-2": ("fixtures", "UNKNOWN", "'Phương án 2' marks (option-2 layer; meaning not stated)"),
    # reference
    "A-GRID": ("grid", "STRUCTURAL", "Structural grid"),
    "A-SYMBOLS": ("grid", "STRUCTURAL", "Grid bubbles"),
    "A-DIMS": ("dimensions", "UNKNOWN", "Dimension chains"),
    # not exported
    "A-TREE": None,  # decorative planting symbols (~27k strokes); visible in source overlay
    "A-TEXT": None,  # text background masks
    "A-SHBD": None,  # sheet border
}

# Markup annotations (Acrobat) keyed by annotation NM (unique id in the PDF).
# Visible polygon/highlight annotations are the department zones drawn by the
# reviewer. Hidden (opacity 0) annotations are recorded but not imported.
ZONES = [
    {
        "annot": "2dc72558-690f-4e57-90b8-80c59e7d2376",  # Highlight, pink
        "labelAnnot": "60ed3a51-2ee5-456d-9deb-e44ebac05350",
        "id": "zone-16-vinfast-kdo2o",
        "name": "VINFAST-KDO2O",
    },
    {
        "annot": "1d4aa329-ec31-4a94-881c-4123e9939b80",  # Highlight, yellow
        "labelAnnot": "8de8e662-a678-48ce-8635-75ed8c702052",
        "id": "zone-16-kd-vh-gsm",
        "name": "KINH DOANH & VẬN HÀNH GSM",
    },
    {
        "annot": "36779c41-a897-4fac-8bae-c17ee8ed462a",  # Polygon, cyan, opacity .57
        "labelAnnot": "e54c1caa-f7f4-4171-9406b8aca574f12a",
        "id": "zone-16-bds-smart-city",
        "name": "BẤT ĐỘNG SẢN - SMART CITY",
    },
    {
        "annot": "2944a7d6-ba06-4c53-9c2207190c80996c",  # Polygon, blue, opacity .8
        "labelAnnot": "9d6438ab-d794-4c2e-9823-b9401376379a",
        "id": "zone-16-ai-platform",
        "name": "MÔ HÌNH & NỀN TẢNG AI",
    },
    {
        "annot": "6d509fd4-5823-409f-8af9-f5cd9f0b4f7a",  # Highlight, lavender, no label
        "labelAnnot": None,
        "id": "zone-16-unlabeled-01",
        "name": None,  # UNKNOWN: highlighted on the source without any label
    },
]

# Room-level annotations: highlight + red text box "Phòng CBLĐ <person name>".
# Only the room type is imported. The occupant name is assignment data and is
# deliberately NOT imported (Phase 2, requires HR verification).
ROOMS = [
    {
        "annot": "0ffade2d-bcfa-4d95-af38-fc6ec56b85a5",
        "labelAnnot": "6018f180-d5bf-4a60-a51e-bac2d346227f",
        "id": "room-16-cbld-01",
        "name": "Phòng CBLĐ",
        "wallBbox": [117.07, 141.55, 171.65, 184.39],
    },
    {
        "annot": "36453438-913e-41c0-8122-ffcc637e52c1",
        "labelAnnot": "dfaa3272-e795-4440-be1b-b6d62da83eb3",
        "id": "room-16-cbld-02",
        "name": "Phòng CBLĐ",
        "wallBbox": [339.41, 415.65, 381.17, 469.79],
    },
    {
        "id": "room-16-acoustic-01",
        "name": "Phòng cách âm",
        "wallBbox": [117.07, 184.39, 210.10, 240.98],
        "sourceText": "PHÒNG CÁCH ÂM TƯỜNG TRẦN SÀN",
    },
]

# CAD text labels that denote facility / infrastructure objects.
FACILITY_LABELS = [
    {"match": "MÁY IN", "kind": "printer", "name": "Máy in (printer)", "classification": "FACILITY"},
    {"match": "Tủ rack", "kind": "network_rack", "name": "Tủ rack (600x800)mm-32U", "classification": "FACILITY"},
    {"match": "Tủ điện", "kind": "electrical_panel", "name": "Tủ điện", "classification": "FACILITY"},
    {"match": "VRV", "kind": "hvac", "name": "Điều hòa âm trần VRV (80,000BTU)", "classification": "FACILITY"},
    {"match": "Máng cáp", "kind": "cable_tray", "name": "Máng cáp (W200-H50)mm", "classification": "FACILITY"},
    {"match": "2400x400", "kind": "unknown_2400x400", "name": "Object labelled 2400x400", "classification": "UNKNOWN"},
]

# Workstation detection rule parameters (PDF points; 1 pt ~ 105.8 mm here).
WORKSTATION_RULE = {
    "deskLabel": "1200x600",
    "deskShortPt": (5.3, 6.1),
    "deskLongPt": (10.9, 11.8),
    "chairSizePt": (3.2, 8.2),
    "chairMinPrimitives": 15,
    "chairGapPt": (0.5, 6.5),  # distance beyond the desk's long edge
    "chairLateralFraction": 0.3,  # chair centre within +-30% of desk length from desk centre
    "clusterTouchPt": 0.8,
}

# Concrete core wall extraction parameters (from KT-Hatch)
CORE_WALL_RULE = {
    "hatchLayer": "KT-Hatch",
    "hTolPt": 1.5,
    "minLines": 1000,
    "names": [
        "Lõi bê tông Tây 01 (Thang máy & Thang bộ)",
        "Lõi bê tông Tây 02 (Cụm thang máy trung tâm)",
        "Lõi bê tông Đông 01 (Cụm thang máy Bắc)",
        "Lõi bê tông Đông 02 (Cụm thang máy & Thang bộ Nam)",
    ],
    # Safe coordinate boundaries (prevent bleeding beyond structural face into flush desks)
    "safeBounds": {
        "wall-16-02": {"maxX": 507.17, "maxY": 366.35},
        "wall-16-03": {"minY": 370.58},
        "wall-16-04": {"maxY": 632.37},
    },
}
