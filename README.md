# BossDB Explorer

A static Angular app that explores public [BossDB](https://bossdb.org) volumetric neuroscience data directly from the browser: collection > experiment > channel, then 2D slices drawn to a canvas. No custom backend. An independent portfolio project, not affiliated with JHU APL.

## Layout

```
src/app/
  boss/
    boss.models.ts        types for collection data (CoordFrame, Experiment, Channel)
    boss-api.service.ts   all network access (JSON metadata + JPEG cutouts), caching
    cutout.ts             pure helpers: plane axes, centred windows, cutout URLs
    cutout.spec.ts        unit tests for the helpers
  app.ts / app.html       shell (shows that the API is reachable)
```

Rule of thumb: anything that touches the network lives in `BossApi`; anything that is just geometry lives in `cutout.ts` and stays pure and tested; components only render.

## Commands

```
npm install
npm start          # dev server on http://localhost:4200
npm test           # unit tests (Vitest)
npm run build      # production build in dist/bossdb-explorer
```

Angular 22 needs Node 22.22.3+ or 24.15+.

## Roadmap

1. Port the prototype UI into components: searchable combobox, metadata panel, slice viewer.
2. Synchronised XY / XZ / YZ panels with a shared crosshair.
3. Resolution-level selector; contrast and gamma controls.
4. Three.js 3D view from a decoded sub-volume.

Data access uses the public read token (`Authorization: Token public`).
