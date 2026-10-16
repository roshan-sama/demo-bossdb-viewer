# BossDB Explorer

A static Angular app that explores public [BossDB](https://bossdb.org) volumetric neuroscience data directly from the browser: collection > experiment > channel, then 2D slices drawn to a canvas. No custom backend. An independent portfolio project, not affiliated with JHU APL. See [SOURCES.md](SOURCES.md) for where each claim came from and how far to trust it.

## Layout

```
src/app/
  boss/       data layer: models, BossApi (all network access), VolumeLoader, cutout.ts (pure geometry + URLs)
  explorer/   ExplorerStore (drill-down state as signals), selection.ts (URL hash), metadata panel
  viewer/     SliceViewer (2D canvas), VolumeViewer + volume-scene (Three.js, loaded on demand)
  ui/         Combobox: searchable dropdown (ARIA combobox)
  lib/        small pure helpers: Lru cache, formatting, stack/volume assembly, bounded concurrency
```

Rules of thumb: anything that touches the network lives in `BossApi`; geometry and formatting stay pure and tested; `ExplorerStore` owns state and ordering (including ignoring stale responses); components render and forward events.

## Boss API notes

- **JPEG cutouts stack z-slices vertically.** `Accept: image/jpeg` returns one image that is X wide and (Y x Z) tall (row = z * Y + y), uint8 image channels only. An XY request (Z = 1) and an XZ request (Y = 1) are ordinary images. A YZ request (X = 1) is a 1-pixel-wide column that reads as a Y-wide, Z-tall image without moving any pixels (`joinStacks`).
- **JPEG caps a side at 65,535 px**, so a large YZ request fails server-side (HTTP 500). `splitForJpeg` splits requests along z so each stack stays under `MAX_STACK_PX`.
- **A stack is already a volume.** Because rows are ordered z * Y + y, the concatenated chunks form a C-order (z, y, x) uint8 array. `stacksToVolume` keeps one channel and the result uploads straight into a Three.js `Data3DTexture` (JPEG is lossy, which is fine for viewing).
- Other documented formats: `application/blosc` (blosc-compressed C-order array) and `application/blosc-python` (Python clients only). A browser would need a WASM blosc decoder for those.

## Commands

```
npm install
npm start          # dev server on http://localhost:4200
npm test           # unit tests (Vitest)
npm run build      # production build in dist/bossdb-explorer
```

Angular 22 needs Node 22.22.3+ or 24.15+.

## Roadmap

Done: drill-down, slice viewer (XY/XZ/YZ), 3D volume block with orthogonal slice planes.

1. Ray-marched volume rendering (opacity ramp, maximum-intensity mode).
2. Link the 3D block to the slice viewer's crosshair; synchronised XY/XZ/YZ panels.
3. Resolution-level selector.

Data access uses the public read token (`Authorization: Token public`).
