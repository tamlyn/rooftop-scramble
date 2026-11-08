import * as THREE from 'three';

export type Surface =
  | 'plain'
  | 'windows'
  | 'corrugated'
  | 'plaster'
  | 'brick'
  | 'cobbles'
  | 'rooftiles'
  | 'planks'
  | 'stone'
  | 'asphalt'
  | 'paving'
  | 'grass';

interface SurfaceSpec {
  /** Size of one texture tile in metres. */
  w: number;
  h: number;
  /** Fit whole tiles to each face (windows) rather than tiling in world space (paving). */
  fit: boolean;
  /** Hand-painted texture in public/textures; otherwise painted procedurally below. */
  image?: string;
}

const SIZE = 512;

export const SURFACES: Record<Surface, SurfaceSpec> = {
  plain: { w: 1, h: 1, fit: false },
  windows: { w: 3.5, h: 3.2, fit: true },
  corrugated: { w: 1.6, h: 2.6, fit: true },
  plaster: { w: 4, h: 4, fit: false, image: 'plaster' },
  brick: { w: 2.6, h: 2.6, fit: false, image: 'brick' },
  cobbles: { w: 3.2, h: 3.2, fit: false, image: 'cobbles' },
  rooftiles: { w: 2.4, h: 2.4, fit: false, image: 'rooftiles' },
  planks: { w: 1.2, h: 1.2, fit: true, image: 'planks' },
  stone: { w: 3.4, h: 3.4, fit: false, image: 'stone' },
  asphalt: { w: 9, h: 9, fit: false, image: 'asphalt' },
  paving: { w: 3.6, h: 3.6, fit: false, image: 'paving' },
  grass: { w: 4, h: 4, fit: false, image: 'grass' },
};

const ORDER = Object.keys(SURFACES) as Surface[];
export const surfaceLayer = (s: Surface) => ORDER.indexOf(s);

type Ctx = CanvasRenderingContext2D;

/** Grey levels on the mask: white is tinted by the box colour, black keeps the painted colour as-is. */
const TINT = '#fff';
const KEEP = '#000';
const shade = (v: number) => `rgb(${v * 255},${v * 255},${v * 255})`;

function rect(c: Ctx, m: Ctx, colour: string, mask: string, x: number, y: number, w: number, h: number) {
  c.fillStyle = colour;
  c.fillRect(x, y, w, h);
  m.fillStyle = mask;
  m.fillRect(x, y, w, h);
}

/** Procedural layers, painted on a 256-unit grid and scaled up. */
const painters: Partial<Record<Surface, (c: Ctx, m: Ctx) => void>> = {
  // Only the distant skyline uses painted windows; course buildings get real geometry.
  windows: (c, m) => {
    rect(c, m, shade(0.85), TINT, 68, 34, 120, 16);
    rect(c, m, '#fff4dc', KEEP, 78, 50, 100, 140);
    const g = c.createLinearGradient(0, 57, 0, 183);
    g.addColorStop(0, '#2c3b66');
    g.addColorStop(1, '#6f8fc0');
    c.fillStyle = g;
    c.fillRect(86, 57, 84, 126);
    rect(c, m, '#fff4dc', KEEP, 78, 116, 100, 8);
    rect(c, m, shade(0.88), TINT, 66, 194, 124, 12);
  },
  corrugated: (c) => {
    for (let x = 0; x < 256; x += 32) {
      const g = c.createLinearGradient(x, 0, x + 32, 0);
      g.addColorStop(0, shade(0.74));
      g.addColorStop(0.5, shade(1));
      g.addColorStop(1, shade(0.74));
      c.fillStyle = g;
      c.fillRect(x, 0, 32, 256);
    }
    c.fillStyle = shade(0.62);
    c.fillRect(0, 0, 256, 14);
    c.fillRect(0, 242, 256, 14);
  },
};

function canvas(fill: string): Ctx {
  const el = document.createElement('canvas');
  el.width = el.height = SIZE;
  const g = el.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = fill;
  g.fillRect(0, 0, SIZE, SIZE);
  return g;
}

/** Copies a layer into the array texture; canvas rows run top-down but texture v runs bottom-up. */
function writeLayer(data: Uint8Array, layer: number, rgb: Uint8ClampedArray, mask: Uint8ClampedArray | null, gain = 1) {
  const base = layer * SIZE * SIZE * 4;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const src = (y * SIZE + x) * 4;
      const dst = base + ((SIZE - 1 - y) * SIZE + x) * 4;
      data[dst] = Math.min(255, rgb[src] * gain);
      data[dst + 1] = Math.min(255, rgb[src + 1] * gain);
      data[dst + 2] = Math.min(255, rgb[src + 2] * gain);
      data[dst + 3] = mask ? mask[src] : 255;
    }
  }
}

function loadImageLayer(tex: THREE.DataArrayTexture, data: Uint8Array, layer: number, name: string) {
  const img = new Image();
  img.onload = () => {
    const g = canvas('#fff');
    g.drawImage(img, 0, 0, SIZE, SIZE);
    const rgb = g.getImageData(0, 0, SIZE, SIZE).data;
    // Normalise brightness so every texture tints its box colour by about the same amount.
    let sum = 0;
    for (let i = 0; i < rgb.length; i += 4) sum += rgb[i] * 0.3 + rgb[i + 1] * 0.59 + rgb[i + 2] * 0.11;
    const mean = sum / (rgb.length / 4) / 255;
    writeLayer(data, layer, rgb, null, 0.9 / mean);
    tex.needsUpdate = true;
  };
  img.src = `${import.meta.env.BASE_URL}textures/${name}.jpg`;
}

/**
 * Material for the merged level mesh. Each vertex carries (u, v, layer) into a texture array whose alpha
 * says how much the vertex colour tints each texel, so one draw call covers every painted surface.
 */
export function createLevelMaterial(): THREE.MeshStandardMaterial {
  const data = new Uint8Array(SIZE * SIZE * 4 * ORDER.length).fill(255);
  const tex = new THREE.DataArrayTexture(data, SIZE, SIZE, ORDER.length);
  ORDER.forEach((name, layer) => {
    const spec = SURFACES[name];
    if (spec.image) {
      loadImageLayer(tex, data, layer, spec.image);
      return;
    }
    const c = canvas('#fff');
    const m = canvas(TINT);
    c.scale(SIZE / 256, SIZE / 256);
    m.scale(SIZE / 256, SIZE / 256);
    painters[name]?.(c, m);
    writeLayer(data, layer, c.getImageData(0, 0, SIZE, SIZE).data, m.getImageData(0, 0, SIZE, SIZE).data);
  });
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.surfaces = { value: tex };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 surface;\nvarying vec3 vSurface;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvSurface = surface;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform highp sampler2DArray surfaces;\nvarying vec3 vSurface;')
      .replace(
        '#include <color_fragment>',
        `vec4 surf = texture(surfaces, vec3(vSurface.xy, floor(vSurface.z + 0.5)));
        diffuseColor.rgb *= mix(surf.rgb, surf.rgb * vColor.rgb, surf.a);`,
      );
  };
  material.customProgramCacheKey = () => 'level-surfaces';
  return material;
}
