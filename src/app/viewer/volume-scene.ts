import { InjectionToken } from '@angular/core';
import type { Data3DTexture, LineSegments, Mesh } from 'three';
import type { Axis } from '../boss/cutout';

/** What the Angular component needs from the 3D scene. Kept small so it can be faked in tests. */
export interface SceneVolume {
  data: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
  depth: number;
  /** Physical box proportions (longest side = 1). */
  size: [number, number, number];
}

export interface VolumeSceneApi {
  setVolume(v: SceneVolume): void;
  /** Position a slice plane (perpendicular to `axis`) at a voxel index and show or hide it. */
  setPlane(axis: Axis, index: number, visible: boolean): void;
  setLook(contrast: number, brightness: number): void;
  resetView(): void;
  dispose(): void;
}

export type SceneFactory = (canvas: HTMLCanvasElement) => Promise<VolumeSceneApi>;

export const VOLUME_SCENE = new InjectionToken<SceneFactory>('VOLUME_SCENE', {
  providedIn: 'root',
  factory: () => createVolumeScene,
});

// Each plane samples the 3D texture at its own world position. Image y points down, hence 0.5 - y.
const VERT = /* glsl */ `
uniform vec3 uSize;
varying vec3 vTex;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vTex = vec3(w.x / uSize.x + 0.5, 0.5 - w.y / uSize.y, w.z / uSize.z + 0.5);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
uniform sampler3D uVol;
uniform float uContrast;
uniform float uBrightness;
varying vec3 vTex;
void main() {
  if (any(lessThan(vTex, vec3(-0.001))) || any(greaterThan(vTex, vec3(1.001)))) discard;
  float v = texture(uVol, vTex).r;
  v = clamp((v - 0.5) * uContrast + 0.5 + uBrightness, 0.0, 1.0);
  gl_FragColor = vec4(vec3(v), 1.0);
}`;

/** Three.js is loaded on demand so it stays out of the initial bundle. */
export async function createVolumeScene(canvas: HTMLCanvasElement): Promise<VolumeSceneApi> {
  const THREE = await import('three');
  const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 20);
  const home = new THREE.Vector3(1.1, 0.8, 1.5);
  const render = () => renderer.render(scene, camera);

  const controls = new OrbitControls(camera, canvas);
  controls.addEventListener('change', render);

  const uniforms = {
    uVol: { value: null as Data3DTexture | null },
    uSize: { value: new THREE.Vector3(1, 1, 1) },
    uContrast: { value: 1 },
    uBrightness: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide });
  const geometry = new THREE.PlaneGeometry(1, 1);
  const planes: Record<Axis, Mesh> = {
    x: new THREE.Mesh(geometry, material), // YZ plane
    y: new THREE.Mesh(geometry, material), // XZ plane
    z: new THREE.Mesh(geometry, material), // XY plane
  };
  planes.x.rotation.y = Math.PI / 2;
  planes.y.rotation.x = -Math.PI / 2;
  for (const m of Object.values(planes)) scene.add(m);

  let texture: Data3DTexture | undefined;
  let box: LineSegments | undefined;
  let dims: [number, number, number] = [1, 1, 1];
  let size: [number, number, number] = [1, 1, 1];

  const host = canvas.parentElement ?? canvas;
  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  const api: VolumeSceneApi = {
    setVolume(v) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const max = gl.getParameter(gl.MAX_3D_TEXTURE_SIZE) as number;
      if (Math.max(v.width, v.height, v.depth) > max) {
        throw new Error(`This GPU supports 3D textures up to ${max} voxels per side`);
      }
      texture?.dispose();
      texture = new THREE.Data3DTexture(v.data, v.width, v.height, v.depth);
      texture.format = THREE.RedFormat;
      texture.type = THREE.UnsignedByteType;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.unpackAlignment = 1;
      texture.needsUpdate = true;

      dims = [v.width, v.height, v.depth];
      size = v.size;
      uniforms.uVol.value = texture;
      uniforms.uSize.value.set(...size);
      planes.x.scale.set(size[2], size[1], 1);
      planes.y.scale.set(size[0], size[2], 1);
      planes.z.scale.set(size[0], size[1], 1);

      if (box) {
        scene.remove(box);
        box.geometry.dispose();
      }
      box = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(...size)),
        new THREE.LineBasicMaterial({ color: 0x8899bb }),
      );
      scene.add(box);
      api.resetView();
    },
    setPlane(axis, index, visible) {
      const mesh = planes[axis];
      mesh.visible = visible;
      if (axis === 'x') mesh.position.x = ((index + 0.5) / dims[0] - 0.5) * size[0];
      if (axis === 'y') mesh.position.y = (0.5 - (index + 0.5) / dims[1]) * size[1];
      if (axis === 'z') mesh.position.z = ((index + 0.5) / dims[2] - 0.5) * size[2];
      render();
    },
    setLook(contrast, brightness) {
      uniforms.uContrast.value = contrast;
      uniforms.uBrightness.value = brightness;
      render();
    },
    resetView() {
      camera.position.copy(home);
      controls.target.set(0, 0, 0);
      controls.update();
      render();
    },
    dispose() {
      observer.disconnect();
      controls.dispose();
      texture?.dispose();
      box?.geometry.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
  return api;
}
