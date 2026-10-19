import { HOME, MAX_ZOOM, MIN_ZOOM, clampView, zoomAbout } from './zoom';

const frame = { width: 800, height: 600 };
const stage = { width: 800, height: 600 };

describe('zoomAbout', () => {
  it('zooms about the centre when the point is the centre', () => {
    expect(zoomAbout(HOME, 2, 0, 0, frame, stage)).toEqual({ zoom: 2, x: 0, y: 0 });
  });

  it('keeps the point under the cursor fixed', () => {
    const v = zoomAbout(HOME, 2, 200, -100, frame, stage);
    // The image point under (200, -100) at 1x is at offset (200, -100) from the image centre; at 2x it must still be there.
    expect(200 - v.x).toBeCloseTo(2 * 200);
    expect(-100 - v.y).toBeCloseTo(2 * -100);
  });

  it('stops at the largest and smallest zoom', () => {
    expect(zoomAbout(HOME, 1000, 0, 0, frame, stage).zoom).toBe(MAX_ZOOM);
    expect(zoomAbout({ zoom: 4, x: 0, y: 0 }, 0.1, 0, 0, frame, stage).zoom).toBe(MIN_ZOOM);
  });

  it('returns to the centre when zoomed back out to 1x', () => {
    const zoomed = zoomAbout(HOME, 4, 300, 200, frame, stage);
    expect(zoomAbout(zoomed, 1, 300, 200, frame, stage)).toEqual(HOME);
  });
});

describe('clampView', () => {
  it('lets a zoomed image be dragged only until its edge meets the screen edge', () => {
    // At 2x the image is 1600 wide on an 800 screen: 400 either way.
    expect(clampView({ zoom: 2, x: 999, y: -999 }, frame, stage)).toEqual({ zoom: 2, x: 400, y: -300 });
  });

  it('keeps an image that is smaller than the screen on an axis centred on that axis', () => {
    const narrow = { width: 300, height: 600 };
    expect(clampView({ zoom: 1, x: 50, y: 50 }, narrow, stage)).toEqual(HOME);
    expect(clampView({ zoom: 2, x: 500, y: 0 }, narrow, stage).x).toBe(0);
  });

  it('allows no drag at 1x for an image that exactly fills the screen', () => {
    expect(clampView({ zoom: 1, x: 10, y: 10 }, frame, stage)).toEqual(HOME);
  });
});
