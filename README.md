# BossDB Explorer

A static Angular app that explores public [BossDB](https://bossdb.org) volumetric neuroscience data directly from the browser: collection > experiment > channel, then 2D slices drawn to a canvas. No custom backend. An independent portfolio project, not affiliated with JHU APL.

## Layout

```
src/app/
  boss/       data layer: models, BossApi (all network access), cutout.ts (pure geometry + URLs)
  explorer/   ExplorerStore (drill-down state as signals), selection.ts (URL hash), metadata panel
  viewer/     SliceViewer: JPEG cutouts drawn to a canvas, debounced + cancellable
  ui/         Combobox: searchable dropdown (ARIA combobox)
  lib/        small pure helpers: Lru cache, number formatting
```

Rules of thumb: anything that touches the network lives in `BossApi`; geometry and formatting stay pure and tested; `ExplorerStore` owns state and ordering (including ignoring stale responses); components render and forward events.

## Boss API notes

- **JPEG cutouts stack z-slices vertically.** `Accept: image/jpeg` returns one image that is X wide and (Y x Z) tall (row = z * Y + y), uint8 image channels only. An XY request (Z = 1) and an XZ request (Y = 1) are ordinary images. A YZ request (X = 1) is a 1-pixel-wide column that reads as a Y-wide, Z-tall image without moving any pixels (`joinStacks`).
- **JPEG caps a side at 65,535 px**, so a large YZ request fails server-side (HTTP 500). `splitForJpeg` splits requests along z so each stack stays under `MAX_STACK_PX`.
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

1. Synchronised XY / XZ / YZ panels with a shared crosshair.
2. Resolution-level selector; contrast and gamma controls.
3. Three.js 3D view from a decoded sub-volume.

Data access uses the public read token (`Authorization: Token public`).
