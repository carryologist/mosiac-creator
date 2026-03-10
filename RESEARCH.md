# LEGO Mosaic Creator — Technical Research

> Reference document for building a LEGO mosaic creator application.
> Covers LDraw file format, parts, colors, coordinate math, and BrickLink integration.

---

## Table of Contents

1. [LDraw File Format (.ldr)](#1-ldraw-file-format-ldr)
2. [LEGO Baseplates](#2-lego-baseplates)
3. [LEGO 1×1 Tiles / Plates](#3-lego-1×1-tiles--plates)
4. [LDraw Color System](#4-ldraw-color-system)
5. [LDraw Unit System & Positioning Math](#5-ldraw-unit-system--positioning-math)
6. [BrickLink Studio .io Format & LDraw Import](#6-bricklink-studio-io-format--ldraw-import)
7. [BrickLink API](#7-bricklink-api)

---

## 1. LDraw File Format (.ldr)

### 1.1 Overview

LDraw is a community-maintained open standard for describing LEGO models in plain text.
BrickLink Studio 2.0 uses an LDraw-compatible format internally (its `.io` files are
ZIP archives containing LDraw data plus metadata). Studio can also directly import/export
`.ldr` files.

File extensions:
| Extension | Meaning |
|-----------|---------|
| `.ldr`    | LDraw model file (single model or multi-step) |
| `.mpd`    | Multi-Part Document — bundles multiple `.ldr` sub-models in one file |
| `.dat`    | LDraw part definition file |

### 1.2 Line Types

Every line in an LDraw file starts with a **line-type number** (0–5):

| Type | Purpose | Format |
|------|---------|--------|
| 0    | Comment / meta-command | `0 <text>` or `0 !<META> <args>` |
| 1    | Part/sub-model reference | `1 <color> <x> <y> <z> <a> <b> <c> <d> <e> <f> <g> <h> <i> <part>` |
| 2    | Line (edge) | `2 <color> <x1> <y1> <z1> <x2> <y2> <z2>` |
| 3    | Triangle | `3 <color> <x1> <y1> <z1> <x2> <y2> <z2> <x3> <y3> <z3>` |
| 4    | Quadrilateral | `4 <color> ... (4 vertices)` |
| 5    | Optional line | `5 <color> ... (2 points + 2 control points)` |

For mosaic generation, we only need **type 0** (meta) and **type 1** (part references).

### 1.3 Type 1 — Part Reference (Critical for Mosaics)

```
1 <color> <x> <y> <z> <a> <b> <c> <d> <e> <f> <g> <h> <i> <part_file>
```

| Field | Description |
|-------|-------------|
| `1` | Line type identifier |
| `color` | LDraw color code (integer) |
| `x y z` | Position of the part's origin in LDU |
| `a b c d e f g h i` | 3×3 rotation/transformation matrix (row-major) |
| `part_file` | Part filename, e.g. `3024.dat` |

The transformation matrix is a 3×3 applied as:

```
| a b c |     | new_x |     | a b c | | x |     | px |
| d e f |  => | new_y |  =  | d e f | | y |  +  | py |
| g h i |     | new_z |     | g h i | | z |     | pz |
```

**Identity matrix (no rotation):**
```
a=1 b=0 c=0
d=0 e=1 f=0
g=0 h=0 i=1
```

So a typical unrotated part reference looks like:
```
1 <color> <x> <y> <z> 1 0 0 0 1 0 0 0 1 <part>.dat
```

### 1.4 Common Meta-Commands

```ldraw
0 FILE <filename>          // Start of a sub-model in an MPD
0 <model name>             // Model title (first comment line)
0 Name: <filename>         // Filename meta
0 Author: <name>           // Author meta
0 !LICENSE <license>       // License declaration
0 !LDRAW_ORG Unofficial_Model  // Organization tag
0 STEP                     // Step break (new building step)
0 NOFILE                   // End of sub-model in MPD
```

### 1.5 Minimal .ldr File Example

A single 1×1 red plate on a green 32×32 baseplate:

```ldraw
0 Mosaic Example
0 Name: mosaic.ldr
0 Author: MosaicCreator
0 !LICENSE Redistributable under CCAL version 2.0 : see CAreadme.txt

1 10 0 0 0 1 0 0 0 1 0 0 0 1 3811.dat
0 STEP
1 4 -150 -8 -150 1 0 0 0 1 0 0 0 1 3024.dat
0 STEP
```

Explanation:
- Line 1–4: Header comments / meta
- Line 5: Green (color 10) 32×32 baseplate at origin, identity rotation
- Line 6: Step separator
- Line 7: Red (color 4) 1×1 plate positioned on the baseplate
- Line 8: Step separator

### 1.6 Multi-Part Document (.mpd) Example

```ldraw
0 FILE main.ldr
0 Mosaic
0 Name: main.ldr
0 Author: MosaicCreator

1 16 0 0 0 1 0 0 0 1 0 0 0 1 baseplate_section.ldr
1 16 0 -8 0 1 0 0 0 1 0 0 0 1 tiles_section.ldr
0 NOFILE

0 FILE baseplate_section.ldr
0 Baseplate Section
1 10 0 0 0 1 0 0 0 1 0 0 0 1 3811.dat
0 NOFILE

0 FILE tiles_section.ldr
0 Tiles Section
1 4 -150 0 -150 1 0 0 0 1 0 0 0 1 3024.dat
1 0 -130 0 -150 1 0 0 0 1 0 0 0 1 3024.dat
0 NOFILE
```

### 1.7 Coordinate System

LDraw uses a **right-handed coordinate system** with Y pointing **down**:

```
        -Y (up)
         |
         |
         |_______ +X (right)
        /
       /
      +Z (toward viewer)
```

- **+X** = right
- **+Y** = down (gravity direction — stacking parts means decreasing Y)
- **+Z** = toward the viewer

This means placing parts on top of each other requires **subtracting** from Y.

---

## 2. LEGO Baseplates

### 2.1 Standard Baseplates

| Description | LEGO Part # | LDraw Part File | Size (studs) | Size (LDU) | Thickness |
|-------------|-------------|-----------------|--------------|-------------|-----------|
| Baseplate 32×32 | 3811 | `3811.dat` | 32×32 | 640×640 | ~8 LDU (thin) |
| Baseplate 48×48 | 4186 | `4186.dat` | 48×48 | 960×960 | ~8 LDU (thin) |
| Baseplate 16×16 | 3867 | `3867.dat` | 16×16 | 320×320 | ~8 LDU (thin) |
| Baseplate 32×32 (road/green) | 10700 (set) | `3811.dat` | 32×32 | 640×640 | ~8 LDU |
| Plate 16×16 | 91405 | `91405.dat` | 16×16 | 320×320 | 8 LDU (standard plate height) |
| Baseplate 8×16 | 3865 | `3865.dat` | 8×16 | 160×320 | ~8 LDU |

> **Note:** Classic thin baseplates (3811, 4186, 3867) are approximately 4 LDU thick (half a
> plate), but for mosaic positioning purposes, we treat the **top surface** as our Y=0 reference
> plane and simply place tiles/plates at Y = -8 (one plate height above).

### 2.2 Common Baseplate Colors

| LDraw Color Code | Color Name | Typical Use |
|------------------|------------|-------------|
| 10 | Bright Green | Classic green baseplate |
| 7 | Light Gray | Gray baseplate |
| 8 | Dark Gray | Dark gray baseplate |
| 1 | Blue | Blue baseplate (water) |
| 2 | Green | Green baseplate |
| 71 | Light Bluish Gray | Modern gray baseplate |
| 72 | Dark Bluish Gray | Modern dark baseplate |

### 2.3 Baseplate Origin

The LDraw origin of a baseplate is at its **geometric center**. So for a 32×32 baseplate:
- X range: -320 to +320 LDU (center at 0)
- Z range: -320 to +320 LDU (center at 0)
- Top stud surface at Y = 0 (approximately)

The **first stud** (top-left when viewed from above in standard orientation) is at:
- X = -310 LDU (= -320 + 10, since a stud center is 10 LDU from the edge)
- Z = -310 LDU

### 2.4 Mosaic Tiling with Multiple Baseplates

For mosaics larger than 32×32, place multiple baseplates side-by-side:

```
Baseplate 1 (0, 0):     position (0, 0, 0)
Baseplate 2 (1, 0):     position (640, 0, 0)
Baseplate 3 (0, 1):     position (0, 0, 640)
Baseplate 4 (1, 1):     position (640, 0, 640)
```

Formula for baseplate position in a grid:
```
x_pos = col * (plate_studs * 20)
z_pos = row * (plate_studs * 20)
```

---

## 3. LEGO 1×1 Tiles / Plates

### 3.1 Key Parts for Mosaics

| Description | LEGO Part # | LDraw File | Notes |
|-------------|-------------|------------|-------|
| Plate 1×1 | **3024** | `3024.dat` | Standard plate with stud on top |
| Tile 1×1 | **3070b** | `3070b.dat` | Smooth top (no stud) — preferred for mosaics |
| Round Plate 1×1 | **4073** | `4073.dat` | Round plate with stud |
| Round Tile 1×1 | **98138** | `98138.dat` | Round, smooth top |
| Plate 1×1 Round (flat bottom) | **6141** | `6141.dat` | Alternate round plate |

### 3.2 Dimensions in LDU

**1×1 Plate (3024):**
```
Width (X):  20 LDU  =  8.0 mm
Depth (Z):  20 LDU  =  8.0 mm
Height (Y):  8 LDU  =  3.2 mm  (plate height)
```

**1×1 Tile (3070b):**
```
Width (X):  20 LDU  =  8.0 mm
Depth (Z):  20 LDU  =  8.0 mm
Height (Y):  8 LDU  =  3.2 mm  (same as plate, but smooth top)
```

**1×1 Round Plate (4073):**
```
Diameter:   20 LDU  =  8.0 mm  (fits in a 1×1 grid cell)
Height (Y):  8 LDU  =  3.2 mm
```

### 3.3 Part Origin Points

Each LDraw part has its origin defined in the `.dat` file:

- **3024.dat** (1×1 Plate): Origin at the center of the part, bottom surface at Y=0, top at Y=-8
- **3070b.dat** (1×1 Tile): Origin at center, bottom at Y=0, top at Y=-8
- **4073.dat** (1×1 Round Plate): Origin at center, bottom at Y=0

> In LDraw, Y is inverted (negative = up), so the top surface of a plate at Y=0 has its
> upper face at Y = -8 in LDraw coordinates. When placing **on** the baseplate, tiles sit
> with their bottom at the baseplate's stud top level.

### 3.4 Tile vs Plate for Mosaics

| Attribute | Plate (3024) | Tile (3070b) |
|-----------|-------------|--------------|
| Has stud on top | Yes | No (smooth) |
| Visual appearance | Studded — classic LEGO look | Smooth — cleaner image |
| Availability | Very common, many colors | Common, most colors |
| Cost | Generally cheaper | Slightly more expensive |
| Mosaic look | Traditional LEGO mosaic | Photo-realistic, modern |

**Recommendation:** Use **3070b (tile)** for cleaner-looking mosaics. Use **3024 (plate)**
for classic LEGO-art style or when color availability is a concern.

---

## 4. LDraw Color System

### 4.1 Overview

LDraw uses integer color codes. These map to specific LEGO production colors. Each color has:
- An LDraw code (integer)
- A name
- An RGB hex value (for rendering)
- An edge color (for line rendering)
- A corresponding BrickLink color ID (different numbering)

### 4.2 Comprehensive Color Table

The following table includes **standard solid LEGO colors** commonly available for purchase,
suitable for mosaic creation.

#### Solid Colors

| LDraw Code | Color Name | RGB Hex | BrickLink Color ID | BrickLink Name | Available in 1×1 Tile |
|-----------|------------|---------|--------------------|-----------------|-----------------------|
| 0 | Black | `#1B2A34` | 11 | Black | ✅ |
| 1 | Blue | `#1E5AA8` | 7 | Blue | ✅ |
| 2 | Green | `#00852B` | 6 | Green | ✅ |
| 3 | Dark Turquoise | `#069D9F` | 39 | Dark Turquoise | ✅ |
| 4 | Red | `#B40000` | 5 | Red | ✅ |
| 5 | Dark Pink | `#D3359D` | 47 | Dark Pink | ✅ |
| 6 | Brown | `#543324` | 8 | Brown | ⚠️ (limited) |
| 7 | Light Gray | `#8A928D` | 9 | Light Gray | ⚠️ (retired) |
| 8 | Dark Gray | `#545955` | 10 | Dark Gray | ⚠️ (retired) |
| 9 | Light Blue | `#97CBD9` | 62 | Light Blue | ✅ |
| 10 | Bright Green | `#58AB41` | 36 | Bright Green | ✅ |
| 11 | Light Turquoise | `#00AAA4` | 40 | Light Turquoise | ✅ |
| 12 | Salmon | `#F06D61` | 25 | Salmon | ⚠️ (rare) |
| 13 | Pink | `#F6A9BB` | 23 | Pink | ✅ |
| 14 | Yellow | `#FAC80A` | 3 | Yellow | ✅ |
| 15 | White | `#F4F4F4` | 1 | White | ✅ |
| 17 | Light Green | `#BDC618` | 38 | Light Green | ✅ |
| 18 | Light Yellow | `#FFD67F` | 33 | Light Yellow | ✅ |
| 19 | Tan | `#E4CD9E` | 2 | Tan | ✅ |
| 22 | Purple | `#81007B` | 24 | Purple | ✅ |
| 25 | Orange | `#FE8A18` | 4 | Orange | ✅ |
| 26 | Magenta | `#923978` | 71 | Magenta | ✅ |
| 27 | Lime | `#A5CA18` | 34 | Lime | ✅ |
| 28 | Dark Tan | `#897D62` | 69 | Dark Tan | ✅ |
| 29 | Bright Pink | `#FF9ECD` | 104 | Bright Pink | ✅ |
| 68 | Very Light Orange | `#FDC383` | 96 | Very Light Orange | ⚠️ |
| 69 | Bright Reddish Lilac | `#8A12A8` | 227 | Bright Reddish Lilac | ⚠️ |
| 70 | Reddish Brown | `#5F3109` | 88 | Reddish Brown | ✅ |
| 71 | Light Bluish Gray | `#A0A5A9` | 86 | Light Bluish Gray | ✅ |
| 72 | Dark Bluish Gray | `#6C6E68` | 85 | Dark Bluish Gray | ✅ |
| 73 | Medium Blue | `#4C61DB` | 42 | Medium Blue | ✅ |
| 74 | Medium Green | `#73DCA1` | 37 | Medium Green | ⚠️ |
| 76 | Medium Dark Pink | `#F785B1` | 94 | Medium Dark Pink | ⚠️ |
| 77 | Light Pink | `#FECCCF` | 56 | Light Pink | ✅ |
| 78 | Light Nougat | `#F6D7B3` | 90 | Light Nougat | ✅ |
| 84 | Medium Nougat | `#E0A05F` | 150 | Medium Nougat | ✅ |
| 85 | Dark Purple | `#3F3691` | 89 | Dark Purple | ✅ |
| 86 | Dark Flesh | `#7C503A` | 91 | Dark Nougat | ✅ |
| 89 | Blue Violet | `#1C58A7` | 97 | Blue-Violet | ⚠️ |
| 92 | Nougat | `#BB805A` | 28 | Nougat | ✅ |
| 100 | Light Salmon | `#FEBABD` | 26 | Light Salmon | ⚠️ |
| 110 | Violet | `#26469A` | 43 | Violet | ✅ |
| 112 | Medium Violet | `#6874CA` | 73 | Medium Violet | ⚠️ |
| 115 | Medium Lime | `#C7D23C` | 35 | Medium Lime | ✅ |
| 118 | Aqua | `#B3D7D1` | 41 | Aqua | ✅ |
| 120 | Light Lime | `#D9E4A7` | 35 | Light Lime | ⚠️ |
| 150 | Medium Dark Flesh | `#CC8A69` | 150 | Medium Nougat | ⚠️ |
| 191 | Bright Light Orange | `#F8BB3D` | 110 | Bright Light Orange | ✅ |
| 212 | Bright Light Blue | `#9FC3E9` | 105 | Bright Light Blue | ✅ |
| 226 | Bright Light Yellow | `#FFF03A` | 103 | Bright Light Yellow | ✅ |
| 272 | Dark Blue | `#0A3463` | 63 | Dark Blue | ✅ |
| 288 | Dark Green | `#184632` | 80 | Dark Green | ✅ |
| 308 | Dark Brown | `#352100` | 120 | Dark Brown | ✅ |
| 320 | Dark Red | `#720012` | 59 | Dark Red | ✅ |
| 321 | Dark Azure | `#0091B5` | 153 | Dark Azure | ✅ |
| 322 | Medium Azure | `#3DB5C8` | 156 | Medium Azure | ✅ |
| 323 | Light Aqua | `#AADCD1` | 152 | Light Aqua | ✅ |
| 326 | Yellowish Green | `#E7F550` | 158 | Yellowish Green | ⚠️ |
| 330 | Olive Green | `#77774E` | 155 | Olive Green | ✅ |
| 335 | Sand Blue | `#5A7184` | 55 | Sand Blue | ✅ |
| 351 | Coral | `#FF6D77` | 220 | Coral | ✅ |
| 353 | Dark Coral | `#B52952` | - | Vibrant Coral | ⚠️ |
| 366 | Earth Orange | `#D09168` | 225 | Dark Nougat (alt) | ⚠️ |
| 373 | Sand Purple | `#845E84` | 54 | Sand Purple | ⚠️ |
| 378 | Sand Green | `#708E7C` | 48 | Sand Green | ✅ |
| 379 | Sand Blue | `#597184` | 55 | Sand Blue | ✅ |
| 450 | Fabuland Brown | `#D27744` | - | Fabuland Brown | ⚠️ |
| 462 | Medium Orange | `#F58624` | 31 | Medium Orange | ✅ |
| 484 | Dark Orange | `#91501C` | 68 | Dark Orange | ✅ |

#### Special / Transparent Colors (Optional for Mosaics)

| LDraw Code | Color Name | RGB Hex | Notes |
|-----------|------------|---------|-------|
| 16 | Main Color | (inherited) | Placeholder — inherits from parent |
| 24 | Edge Color | (inherited) | Placeholder — used for edges |
| 33 | Trans-Dark Blue | `#0020A0` | Transparent |
| 34 | Trans-Green | `#237841` | Transparent |
| 36 | Trans-Red | `#C91A09` | Transparent |
| 37 | Trans-Dark Pink | `#DF6695` | Transparent |
| 40 | Trans-Black | `#635F52` | Transparent (smoke) |
| 41 | Trans-Medium Blue | `#559AB7` | Transparent |
| 42 | Trans-Neon Green | `#C0FF00` | Transparent |
| 43 | Trans-Very Light Blue | `#C1DFF0` | Transparent |
| 44 | Trans-Light Purple | `#96709F` | Transparent |
| 46 | Trans-Yellow | `#F5CD2F` | Transparent |
| 47 | Trans-Clear | `#FCFCFC` | Transparent |

### 4.3 Recommended Mosaic Palette (Best Availability)

For mosaics, these colors are the most readily available and affordable in 1×1 tiles:

```
Black (0), White (15), Red (4), Blue (1), Yellow (14), Green (2),
Dark Bluish Gray (72), Light Bluish Gray (71), Orange (25), Tan (19),
Bright Green (10), Dark Turquoise (3), Dark Red (320), Dark Blue (272),
Dark Green (288), Brown (6), Reddish Brown (70), Dark Orange (484),
Bright Light Orange (191), Lime (27), Medium Azure (322),
Dark Azure (321), Sand Green (378), Sand Blue (335),
Bright Pink (29), Dark Pink (5), Medium Nougat (84),
Light Nougat (78), Nougat (92), Purple (22), Dark Purple (85),
Olive Green (330), Coral (351), Dark Brown (308), Light Aqua (323),
Bright Light Blue (212), Bright Light Yellow (226),
Medium Blue (73), Dark Tan (28), Magenta (26), Pink (13)
```

This gives a palette of **40 solid colors** with good market availability.

---

## 5. LDraw Unit System & Positioning Math

### 5.1 Unit Conversions

| Measure | LDU | Millimeters | Inches |
|---------|-----|-------------|--------|
| 1 LDU | 1 | 0.4 mm | 0.01575" |
| 1 stud pitch | 20 LDU | 8.0 mm | 0.315" |
| 1 plate height | 8 LDU | 3.2 mm | 0.126" |
| 1 brick height | 24 LDU | 9.6 mm | 0.378" |
| 1×1 footprint | 20 × 20 LDU | 8 × 8 mm | — |

### 5.2 Key Relationships

```
1 brick height  = 3 plate heights = 24 LDU
1 plate height  = 8 LDU
1 tile height   = 8 LDU (same as plate, just smooth on top)
1 stud spacing  = 20 LDU center-to-center
```

### 5.3 Positioning Tiles on a 32×32 Baseplate

The 32×32 baseplate (`3811.dat`) has its origin at the geometric center.

**Stud grid positions** on a 32×32 baseplate:

```
First stud  (row=0, col=0):   X = -310, Z = -310
Second stud (row=0, col=1):   X = -290, Z = -310
...
Last stud   (row=31, col=31): X = +310, Z = +310
```

**General formula for stud position on a 32×32 baseplate centered at origin:**

```
x = -310 + (col * 20)    // col = 0..31
z = -310 + (row * 20)    // row = 0..31
y = -8                    // one plate height above baseplate surface
```

Or equivalently:

```
x = (col - 15.5) * 20    // col = 0..31
z = (row - 15.5) * 20    // row = 0..31
y = -8
```

### 5.4 General Formula for Any Baseplate Size

For a baseplate of N×M studs centered at origin:

```
x = -(N * 10) + 10 + (col * 20)   // col = 0..(N-1)
z = -(M * 10) + 10 + (row * 20)   // row = 0..(M-1)
y = -8                              // plate/tile sitting on top
```

Simplification:

```
x = (col * 20) - (N - 1) * 10
z = (row * 20) - (M - 1) * 10
y = -8
```

### 5.5 Multi-Baseplate Positioning

For a mosaic that spans multiple 32×32 baseplates in a grid:

```
baseplate_x = bp_col * 640    // 32 studs × 20 LDU
baseplate_z = bp_row * 640

// Tile position within the global grid:
global_col = bp_col * 32 + local_col   // local_col = 0..31
global_row = bp_row * 32 + local_row

// LDraw coordinates:
tile_x = baseplate_x + (-310 + local_col * 20)
tile_z = baseplate_z + (-310 + local_row * 20)
tile_y = -8
```

### 5.6 Complete Positioning Example

A 3×3 mosaic of colored tiles on a 32×32 green baseplate:

```ldraw
0 3x3 Mosaic Example
0 Name: mosaic_3x3.ldr
0 Author: MosaicCreator

0 // Baseplate
1 10 0 0 0 1 0 0 0 1 0 0 0 1 3811.dat
0 STEP

0 // Row 0
1 4 -310 -8 -310 1 0 0 0 1 0 0 0 1 3070b.dat
1 15 -290 -8 -310 1 0 0 0 1 0 0 0 1 3070b.dat
1 4 -270 -8 -310 1 0 0 0 1 0 0 0 1 3070b.dat

0 // Row 1
1 15 -310 -8 -290 1 0 0 0 1 0 0 0 1 3070b.dat
1 0 -290 -8 -290 1 0 0 0 1 0 0 0 1 3070b.dat
1 15 -270 -8 -290 1 0 0 0 1 0 0 0 1 3070b.dat

0 // Row 2
1 4 -310 -8 -270 1 0 0 0 1 0 0 0 1 3070b.dat
1 15 -290 -8 -270 1 0 0 0 1 0 0 0 1 3070b.dat
1 4 -270 -8 -270 1 0 0 0 1 0 0 0 1 3070b.dat
0 STEP
```

This creates a 3×3 checkerboard of red (4), white (15), and black (0) tiles
in the top-left corner of the baseplate.

### 5.7 Y-Axis Stacking Reference

```
Y =   0   Baseplate top surface (stud tops)
Y =  -8   Top of first layer of plates/tiles (placed on baseplate)
Y = -16   Top of second layer
Y = -24   Top of third layer (= 1 brick height)
```

For a **wall-mounted vertical mosaic** (plates stacked vertically like bricks):
```
Each row = 1 plate height = 8 LDU in Y
Stud spacing horizontal = 20 LDU in X
```

---

## 6. BrickLink Studio .io Format & LDraw Import

### 6.1 Studio .io File Format

The `.io` file is a **ZIP archive** containing:
```
model.ldr          — The LDraw model data
thumbnail.png      — Preview thumbnail
settings.json      — Studio-specific settings (camera, rendering, etc.)
```

The `model.ldr` inside uses standard LDraw syntax with some Studio-specific meta-commands
prefixed with `0 !STUDIO`.

### 6.2 Importing LDraw Files into Studio

**Studio 2.0 directly imports `.ldr` and `.mpd` files:**

1. File → Import → LDraw File (`.ldr`, `.mpd`)
2. Studio will parse the LDraw syntax and render the model
3. Parts, colors, and positions are preserved
4. Some LDraw parts may need mapping to Studio's internal part library

**This is the recommended approach for our app:**
- Generate a standard `.ldr` file
- Users open it directly in BrickLink Studio 2.0
- Studio handles rendering, parts list, and BrickLink integration

### 6.3 Creating a .io File Programmatically

Since `.io` is just a ZIP, we can create one:

```python
import zipfile
import json

def create_studio_file(ldr_content: str, output_path: str):
    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('model.ldr', ldr_content)
        # Minimal settings
        settings = {
            "camera": {
                "position": [0, -500, -500],
                "target": [0, 0, 0],
                "up": [0, -1, 0]
            }
        }
        zf.writestr('settings.json', json.dumps(settings))
```

> **However**, generating plain `.ldr` is recommended over `.io` because:
> - `.ldr` is the stable, documented standard
> - Studio imports `.ldr` flawlessly
> - No need to reverse-engineer Studio's internal settings schema
> - `.ldr` is also compatible with LDView, LPub3D, and other LDraw tools

### 6.4 Studio-Specific Meta-Commands

If targeting Studio specifically, these meta-commands can be included:

```ldraw
0 !STUDIO_SETTING camera_position 0 -500 -500
0 !STUDIO_SETTING camera_target 0 0 0
```

These are optional and will be ignored by other LDraw viewers.

### 6.5 Compatibility Notes

| Feature | LDraw (.ldr) | Studio (.io) |
|---------|-------------|-------------|
| Part positioning | ✅ | ✅ |
| Colors | ✅ (LDraw codes) | ✅ (maps internally) |
| Steps | ✅ (`0 STEP`) | ✅ |
| Sub-models | ✅ (MPD) | ✅ |
| Flexible parts | ⚠️ Limited | ✅ |
| Minifig posing | ❌ | ✅ |
| Rendering settings | ❌ | ✅ |

For mosaics, `.ldr` is 100% sufficient — no Studio-specific features are needed.

---

## 7. BrickLink API

### 7.1 Overview

BrickLink provides a **RESTful API** for accessing catalog data, pricing, inventory, and orders.

- **Base URL:** `https://api.bricklink.com/api/store/v1`
- **Auth:** OAuth 1.0a (Consumer Key, Consumer Secret, Token, Token Secret)
- **Rate Limits:** Varies; generally 5000 requests/day for standard accounts
- **Registration:** https://www.bricklink.com/v3/api.page

### 7.2 Authentication

BrickLink uses **OAuth 1.0a** with all four credentials:

```
Consumer Key:    (from BrickLink API registration)
Consumer Secret: (from BrickLink API registration)
Token Value:     (from BrickLink API registration)
Token Secret:    (from BrickLink API registration)
```

All four are obtained by registering at the BrickLink API portal. No OAuth flow needed —
the tokens are provided directly (similar to Twitter's application-only auth).

**Example Auth Header:**
```
Authorization: OAuth oauth_consumer_key="...",
  oauth_token="...",
  oauth_signature_method="HMAC-SHA1",
  oauth_timestamp="...",
  oauth_nonce="...",
  oauth_version="1.0",
  oauth_signature="..."
```

### 7.3 Key Endpoints for Mosaic App

#### Get Item (Part) Details
```
GET /items/{type}/{no}
```
- `type`: `PART`, `SET`, `MINIFIG`, `BOOK`, `GEAR`, `CATALOG`, `INSTRUCTION`, `UNSORTED_LOT`, `ORIGINAL_BOX`
- `no`: Part number (e.g., `3070b`)

Example:
```
GET /items/PART/3070b
```

Response:
```json
{
  "meta": {"code": 200},
  "data": {
    "no": "3070b",
    "name": "Tile 1 x 1 with Groove",
    "type": "PART",
    "category_id": 37,
    "image_url": "...",
    "thumbnail_url": "...",
    "weight": 0.48,
    "dim_x": "8.00",
    "dim_y": "3.20",
    "dim_z": "8.00",
    "year_released": 1991,
    "is_obsolete": false
  }
}
```

#### Get Known Colors for a Part
```
GET /items/{type}/{no}/colors
```
Returns all colors a part is known to exist in — **critical for mosaic planning**.

Example:
```
GET /items/PART/3070b/colors
```

Response:
```json
{
  "data": [
    {"color_id": 11, "quantity": 0},
    {"color_id": 1, "quantity": 0},
    {"color_id": 5, "quantity": 0}
    // ...
  ]
}
```

#### Get Price Guide
```
GET /items/{type}/{no}/price?color_id={color_id}&guide_type={sold|stock}&new_or_used={N|U}&region={region}&currency_code={code}
```

Parameters:
| Param | Values | Description |
|-------|--------|-------------|
| `color_id` | BrickLink color ID | Filter by color |
| `guide_type` | `sold` or `stock` | Historical sales or current listings |
| `new_or_used` | `N` or `U` | Condition |
| `region` | `north_america`, `europe`, etc. | Regional filter |
| `currency_code` | `USD`, `EUR`, `GBP`, etc. | Currency |

Example:
```
GET /items/PART/3070b/price?color_id=11&guide_type=stock&new_or_used=N
```

Response:
```json
{
  "data": {
    "item": {"no": "3070b", "type": "PART"},
    "new_or_used": "N",
    "currency_code": "USD",
    "min_price": "0.0100",
    "max_price": "0.2500",
    "avg_price": "0.0398",
    "qty_avg_price": "0.0250",
    "unit_quantity": 12567,
    "total_quantity": 478923,
    "price_detail": [
      {"quantity": 500, "unit_price": "0.0100", "seller_country_code": "US", "shipping_available": true}
    ]
  }
}
```

#### Search for Stores with Specific Part/Color
```
GET /items/{type}/{no}/supersets
GET /items/{type}/{no}/subsets
```

#### Get Color List
```
GET /colors
```
Returns all BrickLink color definitions — useful for mapping to LDraw colors.

```
GET /colors/{color_id}
```
Returns details for a specific color.

### 7.4 BrickLink Color ID ↔ LDraw Color Code Mapping

BrickLink uses **different color IDs** from LDraw. Key mappings:

| BrickLink ID | BrickLink Name | LDraw Code |
|-------------|----------------|-----------|
| 1 | White | 15 |
| 2 | Tan | 19 |
| 3 | Yellow | 14 |
| 4 | Orange | 25 |
| 5 | Red | 4 |
| 6 | Green | 2 |
| 7 | Blue | 1 |
| 8 | Brown | 6 |
| 9 | Light Gray | 7 |
| 10 | Dark Gray | 8 |
| 11 | Black | 0 |
| 23 | Pink | 13 |
| 24 | Purple | 22 |
| 25 | Salmon | 12 |
| 28 | Nougat | 92 |
| 31 | Medium Orange | 462 |
| 33 | Light Yellow | 18 |
| 34 | Lime | 27 |
| 35 | Medium Lime | 115 |
| 36 | Bright Green | 10 |
| 37 | Medium Green | 74 |
| 38 | Light Green | 17 |
| 39 | Dark Turquoise | 3 |
| 40 | Light Turquoise | 11 |
| 41 | Aqua | 118 |
| 42 | Medium Blue | 73 |
| 43 | Violet | 110 |
| 47 | Dark Pink | 5 |
| 48 | Sand Green | 378 |
| 54 | Sand Purple | 373 |
| 55 | Sand Blue | 335 |
| 56 | Light Pink | 77 |
| 59 | Dark Red | 320 |
| 62 | Light Blue | 9 |
| 63 | Dark Blue | 272 |
| 68 | Dark Orange | 484 |
| 69 | Dark Tan | 28 |
| 71 | Magenta | 26 |
| 73 | Medium Violet | 112 |
| 80 | Dark Green | 288 |
| 85 | Dark Bluish Gray | 72 |
| 86 | Light Bluish Gray | 71 |
| 88 | Reddish Brown | 70 |
| 89 | Dark Purple | 85 |
| 90 | Light Nougat | 78 |
| 91 | Dark Nougat | 86 |
| 93 | Light Purple | — |
| 94 | Medium Dark Pink | 76 |
| 96 | Very Light Orange | 68 |
| 97 | Blue-Violet | 89 |
| 103 | Bright Light Yellow | 226 |
| 104 | Bright Pink | 29 |
| 105 | Bright Light Blue | 212 |
| 110 | Bright Light Orange | 191 |
| 120 | Dark Brown | 308 |
| 150 | Medium Nougat | 84 |
| 152 | Light Aqua | 323 |
| 153 | Dark Azure | 321 |
| 155 | Olive Green | 330 |
| 156 | Medium Azure | 322 |
| 158 | Yellowish Green | 326 |
| 220 | Coral | 351 |

### 7.5 Useful API Workflow for Mosaic App

1. **Determine available colors:** `GET /items/PART/3070b/colors` → list of color IDs
2. **Get pricing for each color:** `GET /items/PART/3070b/price?color_id={id}&guide_type=stock&new_or_used=N`
3. **Build a cost-optimized palette:** Filter colors by availability and price
4. **Generate parts list:** From the mosaic, count tiles per color
5. **Create a Wanted List:** BrickLink allows XML upload of wanted lists

### 7.6 BrickLink Wanted List XML Format

BrickLink supports uploading wanted lists via XML. This is useful for letting users
directly purchase parts:

```xml
<INVENTORY>
  <ITEM>
    <ITEMTYPE>P</ITEMTYPE>
    <ITEMID>3070b</ITEMID>
    <COLOR>11</COLOR>
    <MINQTY>150</MINQTY>
    <NOTIFY>N</NOTIFY>
  </ITEM>
  <ITEM>
    <ITEMTYPE>P</ITEMTYPE>
    <ITEMID>3070b</ITEMID>
    <COLOR>1</COLOR>
    <MINQTY>85</MINQTY>
    <NOTIFY>N</NOTIFY>
  </ITEM>
</INVENTORY>
```

| Field | Description |
|-------|-------------|
| `ITEMTYPE` | `P` for Part |
| `ITEMID` | Part number |
| `COLOR` | BrickLink color ID |
| `MINQTY` | Minimum quantity needed |
| `MAXPRICE` | Optional max price per unit |
| `NOTIFY` | `Y` or `N` — email notification |

This XML can be uploaded at: `https://www.bricklink.com/v2/wanted/upload.page`

### 7.7 Python Example — BrickLink API Client

```python
from requests_oauthlib import OAuth1Session
import json

class BrickLinkAPI:
    BASE_URL = "https://api.bricklink.com/api/store/v1"

    def __init__(self, consumer_key, consumer_secret, token, token_secret):
        self.session = OAuth1Session(
            consumer_key,
            client_secret=consumer_secret,
            resource_owner_key=token,
            resource_owner_secret=token_secret
        )

    def get_part_colors(self, part_no: str) -> list:
        """Get all available colors for a part."""
        resp = self.session.get(f"{self.BASE_URL}/items/PART/{part_no}/colors")
        return resp.json()["data"]

    def get_price(self, part_no: str, color_id: int, new: bool = True) -> dict:
        """Get price guide for a part in a specific color."""
        params = {
            "color_id": color_id,
            "guide_type": "stock",
            "new_or_used": "N" if new else "U",
            "currency_code": "USD"
        }
        resp = self.session.get(
            f"{self.BASE_URL}/items/PART/{part_no}/price",
            params=params
        )
        return resp.json()["data"]
```

---

## Appendix A: Quick Reference — LDraw Line for Mosaic Tile

```
1 {color} {x} {y} {z} 1 0 0 0 1 0 0 0 1 3070b.dat
```

Where:
- `{color}` = LDraw color code (see Section 4)
- `{x}` = `-310 + (col * 20)` for 32×32 baseplate
- `{y}` = `-8` (sitting on baseplate)
- `{z}` = `-310 + (row * 20)` for 32×32 baseplate

## Appendix B: Mosaic Size Reference

| Studs | Baseplates (32×32) | Physical Size (cm) | Tiles Needed |
|-------|-------------------|--------------------:|-------------:|
| 32×32 | 1×1 | 25.6 × 25.6 | 1,024 |
| 48×48 | 1×1 (48×48 BP) | 38.4 × 38.4 | 2,304 |
| 64×64 | 2×2 | 51.2 × 51.2 | 4,096 |
| 96×96 | 3×3 | 76.8 × 76.8 | 9,216 |
| 128×128 | 4×4 | 102.4 × 102.4 | 16,384 |

## Appendix C: Complete .ldr Generation Pseudocode

```python
def generate_ldr(mosaic_grid, palette, part_number="3070b"):
    """
    mosaic_grid: 2D array of LDraw color codes, shape (rows, cols)
    palette: not needed here — colors are already in the grid
    part_number: LDraw part to use for each pixel
    """
    rows, cols = mosaic_grid.shape
    baseplates_x = ceil(cols / 32)
    baseplates_z = ceil(rows / 32)

    lines = []
    lines.append("0 LEGO Mosaic")
    lines.append("0 Name: mosaic.ldr")
    lines.append("0 Author: MosaicCreator")
    lines.append("")

    # Place baseplates
    for bz in range(baseplates_z):
        for bx in range(baseplates_x):
            x = bx * 640
            z = bz * 640
            lines.append(f"1 71 {x} 0 {z} 1 0 0 0 1 0 0 0 1 3811.dat")

    lines.append("0 STEP")
    lines.append("")

    # Place tiles
    for row in range(rows):
        for col in range(cols):
            color = mosaic_grid[row][col]
            # Determine which baseplate this tile is on
            bp_x = col // 32
            bp_z = row // 32
            local_col = col % 32
            local_row = row % 32
            # Calculate position
            x = bp_x * 640 + (-310 + local_col * 20)
            z = bp_z * 640 + (-310 + local_row * 20)
            y = -8
            lines.append(
                f"1 {color} {x} {y} {z} 1 0 0 0 1 0 0 0 1 {part_number}.dat"
            )

    lines.append("0 STEP")
    lines.append("")

    return "\n".join(lines)
```

---

*Document compiled for the LEGO Mosaic Creator application.*
*LDraw is a trademark of the LDraw.org community. LEGO is a trademark of the LEGO Group.*
*BrickLink is a trademark of BrickLink, part of the LEGO Group.*
