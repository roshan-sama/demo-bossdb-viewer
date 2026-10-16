import { TestBed } from '@angular/core/testing';
import { CoordFrame } from '../boss/boss.models';
import { VolumeLoader } from '../boss/volume-loader.service';
import { VOLUME_SCENE, SceneVolume, VolumeSceneApi } from './volume-scene';
import { VolumeViewer } from './volume-viewer';

const coord = {
  x_start: 0, x_stop: 1000, y_start: 0, y_stop: 800, z_start: 0, z_stop: 100,
  x_voxel_size: 4, y_voxel_size: 4, z_voxel_size: 40,
} as CoordFrame;

const tick = () => new Promise((r) => setTimeout(r, 10));

describe('VolumeViewer', () => {
  const calls: string[] = [];
  const volumes: SceneVolume[] = [];
  const regions: unknown[] = [];

  beforeEach(() => {
    calls.length = 0;
    volumes.length = 0;
    regions.length = 0;
    const scene: VolumeSceneApi = {
      setVolume: (v) => volumes.push(v),
      setPlane: (a, i, vis) => calls.push(`plane ${a} ${i} ${vis}`),
      setLook: (c, b) => calls.push(`look ${c} ${b}`),
      resetView: () => calls.push('reset'),
      dispose: () => calls.push('dispose'),
    };
    const loader = {
      load: async (_ref: unknown, region: unknown) => {
        regions.push(region);
        return { data: new Uint8Array(2 * 2 * 4), width: 2, height: 2, depth: 4, bytes: 1_048_576, requests: 2 };
      },
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: VolumeLoader, useValue: loader },
        { provide: VOLUME_SCENE, useValue: async () => scene },
      ],
    });
  });

  async function setup() {
    const fixture = TestBed.createComponent(VolumeViewer);
    fixture.componentRef.setInput('ref', { collection: 'c', experiment: 'e', channel: 'h' });
    fixture.componentRef.setInput('coord', coord);
    await fixture.whenStable();
    return fixture;
  }

  it('loads the default block centred in the dataset and hands the scene a physically scaled box', async () => {
    const fixture = await setup();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.bar button') as HTMLButtonElement).click();
    await tick();
    await fixture.whenStable();

    expect(regions).toEqual([{ x: [372, 628], y: [272, 528], z: [18, 82] }]);
    expect(volumes).toHaveLength(1);
    expect([volumes[0].width, volumes[0].height, volumes[0].depth]).toEqual([2, 2, 4]);
    // 2 x 2 x 4 voxels of 4 x 4 x 40 nm -> 8 x 8 x 160 nm -> longest side 1
    expect(volumes[0].size[2]).toBe(1);
    expect(volumes[0].size[0]).toBeCloseTo(0.05, 5);
    expect(el.querySelector('.meta')?.textContent).toContain('2×2×4 voxels · 1.0 MB over 2 requests');
    expect(el.querySelectorAll('input[type=range]').length).toBe(5); // 3 planes + contrast + brightness
  });

  it('moves a plane and updates the look through the scene', async () => {
    const fixture = await setup();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.bar button') as HTMLButtonElement).click();
    await tick();
    await fixture.whenStable();
    calls.length = 0;

    const zSlider = el.querySelectorAll('input[type=range]')[2] as HTMLInputElement; // XY plane (z)
    zSlider.value = '3';
    zSlider.dispatchEvent(new Event('input'));
    const contrast = el.querySelectorAll('input[type=range]')[3] as HTMLInputElement;
    contrast.value = '2';
    contrast.dispatchEvent(new Event('input'));

    expect(calls).toEqual(['plane z 3 true', 'look 2 0']);
  });

  it('shows an error when loading fails', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: VolumeLoader, useValue: { load: () => Promise.reject(new Error('HTTP 500')) } },
        { provide: VOLUME_SCENE, useValue: async () => ({}) },
      ],
    });
    const fixture = await setup();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.bar button') as HTMLButtonElement).click();
    await tick();
    await fixture.whenStable();
    expect(el.querySelector('.meta.err')?.textContent).toContain('HTTP 500');
  });
});
