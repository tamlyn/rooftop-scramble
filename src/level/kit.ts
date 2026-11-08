import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { chamferedBox, triangulate } from './chamfer';

/**
 * Small architectural and street pieces, each built once and instanced hundreds of times. Pieces that sit on
 * a wall are authored facing +z with the wall plane at z = 0. Vertex colours carry fixed detail; the
 * per-instance colour tints the rest.
 */

interface Part {
  geom: THREE.BufferGeometry;
  color: number;
}

/** A chamfered box as standalone, flat-shaded geometry. */
export function block(w: number, h: number, d: number, x = 0, y = 0, z = 0, bevel = Math.min(0.04, Math.min(w, h, d) * 0.3)): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  chamferedBox(new THREE.Vector3(w / 2, h / 2, d / 2), bevel, (pts, n) => {
    for (const k of triangulate(pts, n)) {
      pos.push(pts[k].x + x, pts[k].y + y, pts[k].z + z);
      nrm.push(n.x, n.y, n.z);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}

function paint(geom: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const g = geom.index ? geom.toNonIndexed() : geom;
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  const c = new THREE.Color(color);
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export function assemble(parts: Part[]): THREE.BufferGeometry {
  return mergeGeometries(parts.map((p) => paint(p.geom, p.color)));
}

const WHITE = 0xffffff;
const METAL = 0x3a3f52;
const GOLD = 0xf2c14e;

export const WINDOW_W = 1.25;
export const WINDOW_H = 1.85;
const FRAME = 0.1;
export const SHOP_W = 2.6;
export const SHOP_H = 2.0;

function windowFrame(): THREE.BufferGeometry {
  const W = WINDOW_W;
  const H = WINDOW_H;
  const t = FRAME;
  return assemble([
    { geom: block(W + 2 * t, t, 0.14, 0, H / 2 + t / 2, 0.07), color: WHITE },
    { geom: block(W + 2 * t, t, 0.14, 0, -H / 2 - t / 2, 0.07), color: WHITE },
    { geom: block(t, H, 0.14, -W / 2 - t / 2, 0, 0.07), color: WHITE },
    { geom: block(t, H, 0.14, W / 2 + t / 2, 0, 0.07), color: WHITE },
    { geom: block(0.06, H, 0.07, 0, 0, 0.05, 0), color: WHITE },
    { geom: block(W, 0.07, 0.08, 0, 0.12, 0.05, 0), color: WHITE },
  ]);
}

function windowTrim(): THREE.BufferGeometry {
  const W = WINDOW_W;
  const H = WINDOW_H;
  const top = H / 2 + FRAME;
  return assemble([
    { geom: block(W + 0.55, 0.13, 0.3, 0, -top - 0.07, 0.15), color: WHITE },
    { geom: block(0.16, 0.16, 0.18, -W / 2 - 0.05, -top - 0.2, 0.09), color: WHITE },
    { geom: block(0.16, 0.16, 0.18, W / 2 + 0.05, -top - 0.2, 0.09), color: WHITE },
    { geom: block(W + 0.45, 0.24, 0.16, 0, top + 0.12, 0.08), color: WHITE },
    { geom: block(0.3, 0.36, 0.22, 0, top + 0.14, 0.11), color: WHITE },
  ]);
}

function shutters(): THREE.BufferGeometry {
  const H = WINDOW_H + 0.1;
  const parts: Part[] = [];
  for (const side of [-1, 1]) {
    const x = side * (WINDOW_W / 2 + FRAME + 0.34);
    parts.push({ geom: block(0.62, H, 0.07, x, 0, 0.035), color: WHITE });
    for (const y of [-H / 4, H / 4]) parts.push({ geom: block(0.44, H / 2 - 0.2, 0.05, x, y, 0.08), color: 0xdddddd });
  }
  return assemble(parts);
}

function flowerBox(): THREE.BufferGeometry {
  const y = -WINDOW_H / 2 - FRAME - 0.32;
  const parts: Part[] = [{ geom: block(WINDOW_W + 0.3, 0.32, 0.32, 0, y, 0.3), color: 0x9a5b3c }];
  const blooms = [0xff6b8b, 0xffd23f, 0xffffff, 0xff8fab, 0xb388ff];
  for (let i = 0; i < 7; i++) {
    const x = -WINDOW_W / 2 + (i + 0.5) * (WINDOW_W / 7);
    parts.push({ geom: new THREE.IcosahedronGeometry(0.15, 0).translate(x, y + 0.2, 0.3 + ((i % 2) - 0.5) * 0.1), color: 0x4f9d4a });
    parts.push({ geom: new THREE.IcosahedronGeometry(0.08, 0).translate(x + 0.04, y + 0.32, 0.36), color: blooms[i % blooms.length] });
  }
  return assemble(parts);
}

function balcony(): THREE.BufferGeometry {
  const w = WINDOW_W + 1.3;
  const depth = 0.9;
  const y = -WINDOW_H / 2 - FRAME - 0.08;
  const parts: Part[] = [
    { geom: block(w, 0.16, depth, 0, y, depth / 2), color: 0xd8d2c8 },
    { geom: block(w, 0.07, 0.07, 0, y + 0.95, depth - 0.04), color: WHITE },
    { geom: block(0.07, 0.07, depth, -w / 2 + 0.04, y + 0.95, depth / 2), color: WHITE },
    { geom: block(0.07, 0.07, depth, w / 2 - 0.04, y + 0.95, depth / 2), color: WHITE },
    { geom: block(0.2, 0.25, 0.5, -w / 2 + 0.3, y - 0.2, 0.25), color: 0xd8d2c8 },
    { geom: block(0.2, 0.25, 0.5, w / 2 - 0.3, y - 0.2, 0.25), color: 0xd8d2c8 },
  ];
  // Railings are too thin for chamfers to show, so skip them and save triangles.
  for (let x = -w / 2 + 0.04; x <= w / 2; x += 0.22) parts.push({ geom: block(0.04, 0.9, 0.04, x, y + 0.5, depth - 0.04, 0), color: WHITE });
  for (const side of [-1, 1]) {
    for (let z = 0.2; z < depth - 0.1; z += 0.22) parts.push({ geom: block(0.04, 0.9, 0.04, side * (w / 2 - 0.04), y + 0.5, z, 0), color: WHITE });
  }
  return assemble(parts);
}

function shopFrame(): THREE.BufferGeometry {
  const W = SHOP_W;
  const H = SHOP_H;
  const t = 0.14;
  return assemble([
    { geom: block(W + 2 * t, t, 0.18, 0, H / 2 + t / 2, 0.09), color: WHITE },
    { geom: block(W + 2 * t, t, 0.2, 0, -H / 2 - t / 2, 0.1), color: WHITE },
    { geom: block(t, H, 0.18, -W / 2 - t / 2, 0, 0.09), color: WHITE },
    { geom: block(t, H, 0.18, W / 2 + t / 2, 0, 0.09), color: WHITE },
    { geom: block(0.07, H, 0.08, -W / 6, 0, 0.05), color: WHITE },
    { geom: block(0.07, H, 0.08, W / 6, 0, 0.05), color: WHITE },
    { geom: block(W, 0.07, 0.08, 0, H / 2 - 0.45, 0.05), color: WHITE },
    // Stall riser under the window, slightly darker.
    { geom: block(W + 2 * t, 0.62, 0.16, 0, -H / 2 - t - 0.31, 0.08), color: 0xcccccc },
  ]);
}

function door(): THREE.BufferGeometry {
  const parts: Part[] = [{ geom: block(1.1, 2.3, 0.08, 0, 1.15, 0.04), color: WHITE }];
  for (const y of [0.55, 1.15]) {
    for (const x of [-0.24, 0.24]) parts.push({ geom: block(0.36, 0.5, 0.05, x, y, 0.09), color: 0xe4e4e4 });
  }
  return assemble(parts);
}

function doorFrame(): THREE.BufferGeometry {
  return assemble([
    { geom: block(0.14, 2.5, 0.18, -0.62, 1.25, 0.09), color: WHITE },
    { geom: block(0.14, 2.5, 0.18, 0.62, 1.25, 0.09), color: WHITE },
    { geom: block(1.38, 0.2, 0.22, 0, 2.5, 0.11), color: WHITE },
    { geom: new THREE.SphereGeometry(0.06, 10, 8).translate(0.38, 1.05, 0.16), color: GOLD },
    { geom: block(0.5, 0.06, 0.04, 0, 1.5, 0.12), color: GOLD },
  ]);
}

function pilaster(): THREE.BufferGeometry {
  return assemble([
    { geom: block(0.52, 0.32, 0.32, 0, 0.16, 0.16), color: 0xdddddd },
    { geom: block(0.38, 2.8, 0.22, 0, 1.7, 0.11), color: WHITE },
    { geom: block(0.56, 0.3, 0.34, 0, 3.25, 0.17), color: 0xdddddd },
  ]);
}

function lampPost(): THREE.BufferGeometry {
  return assemble([
    { geom: block(0.5, 0.35, 0.5, 0, 0.175, 0), color: METAL },
    { geom: new THREE.CylinderGeometry(0.16, 0.2, 0.7, 10).translate(0, 0.7, 0), color: METAL },
    { geom: new THREE.CylinderGeometry(0.08, 0.11, 4.2, 10).translate(0, 3.1, 0), color: METAL },
    { geom: new THREE.TorusGeometry(0.14, 0.04, 6, 12).rotateX(Math.PI / 2).translate(0, 2.2, 0), color: METAL },
    { geom: new THREE.TorusGeometry(0.55, 0.045, 6, 16, Math.PI / 2).rotateY(Math.PI / 2).translate(0, 4.65, 0.55), color: METAL },
    { geom: new THREE.CylinderGeometry(0.06, 0.2, 0.12, 10).translate(0, 5.12, 0.55), color: METAL },
    { geom: new THREE.ConeGeometry(0.34, 0.32, 8).translate(0, 4.9, 1.1), color: METAL },
    { geom: new THREE.SphereGeometry(0.08, 8, 6).translate(0, 5.1, 1.1), color: GOLD },
    { geom: block(0.36, 0.06, 0.36, 0, 4.36, 1.1), color: METAL },
  ]);
}

function lampGlass(): THREE.BufferGeometry {
  return paint(new THREE.CylinderGeometry(0.2, 0.15, 0.36, 8).translate(0, 4.56, 1.1), WHITE);
}

function bench(): THREE.BufferGeometry {
  const wood = 0xc98b55;
  const parts: Part[] = [];
  for (const z of [-0.18, 0, 0.18]) parts.push({ geom: block(1.9, 0.07, 0.15, 0, 0.48, z), color: wood });
  for (const y of [0.72, 0.9]) parts.push({ geom: block(1.9, 0.14, 0.06, 0, y, -0.3), color: wood });
  for (const x of [-0.75, 0.75]) {
    parts.push({ geom: block(0.08, 0.46, 0.5, x, 0.23, 0), color: METAL });
    parts.push({ geom: block(0.08, 0.6, 0.08, x, 0.75, -0.3), color: METAL });
  }
  return assemble(parts);
}

function bollard(): THREE.BufferGeometry {
  return assemble([
    { geom: new THREE.CylinderGeometry(0.13, 0.16, 0.9, 10).translate(0, 0.45, 0), color: METAL },
    { geom: new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.9, 0), color: METAL },
    { geom: new THREE.TorusGeometry(0.15, 0.03, 6, 12).rotateX(Math.PI / 2).translate(0, 0.72, 0), color: GOLD },
  ]);
}

function hydrant(): THREE.BufferGeometry {
  const red = 0xe04848;
  return assemble([
    { geom: new THREE.CylinderGeometry(0.2, 0.24, 0.12, 12).translate(0, 0.06, 0), color: red },
    { geom: new THREE.CylinderGeometry(0.15, 0.17, 0.6, 12).translate(0, 0.42, 0), color: red },
    { geom: new THREE.SphereGeometry(0.17, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.72, 0), color: red },
    { geom: new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8).rotateZ(Math.PI / 2).translate(0, 0.5, 0), color: 0xc93a3a },
    { geom: new THREE.CylinderGeometry(0.04, 0.04, 0.1, 6).translate(0, 0.9, 0), color: GOLD },
  ]);
}

function quoin(): THREE.BufferGeometry {
  return paint(block(0.66, 0.4, 0.66, 0, 0, 0, 0.05), WHITE);
}

function dentil(): THREE.BufferGeometry {
  return paint(block(0.2, 0.22, 0.16, 0, 0, 0.08, 0.03), WHITE);
}

function chimney(): THREE.BufferGeometry {
  return assemble([
    { geom: block(0.9, 2.2, 0.7, 0, 1.1, 0), color: 0xb86b52 },
    { geom: block(1.1, 0.2, 0.9, 0, 2.2, 0), color: 0xd8d2c8 },
    { geom: new THREE.CylinderGeometry(0.13, 0.16, 0.45, 8).translate(-0.2, 2.5, 0), color: 0xd9734e },
    { geom: new THREE.CylinderGeometry(0.13, 0.16, 0.35, 8).translate(0.2, 2.45, 0), color: 0xd9734e },
  ]);
}

let glassTextures: { window: THREE.Texture; shop: THREE.Texture } | null = null;

/** Painted interiors so glass reads as rooms behind windows rather than flat blue panels. */
function paintGlass(): { window: THREE.Texture; shop: THREE.Texture } {
  if (glassTextures) return glassTextures;
  const make = (w: number, h: number, paint: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    paint(g);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const room = (g: CanvasRenderingContext2D, w: number, h: number) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#24305a');
    grad.addColorStop(0.6, '#3d5687');
    grad.addColorStop(1, '#5a77a8');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  };
  const glints = (g: CanvasRenderingContext2D, w: number, h: number) => {
    g.fillStyle = 'rgba(220,240,255,0.35)';
    g.beginPath();
    g.moveTo(w * 0.1, h);
    g.lineTo(w * 0.55, 0);
    g.lineTo(w * 0.75, 0);
    g.lineTo(w * 0.3, h);
    g.fill();
    g.fillStyle = 'rgba(220,240,255,0.2)';
    g.beginPath();
    g.moveTo(w * 0.4, h);
    g.lineTo(w * 0.85, 0);
    g.lineTo(w * 0.9, 0);
    g.lineTo(w * 0.45, h);
    g.fill();
  };
  const window = make(128, 192, (g) => {
    room(g, 128, 192);
    // Curtains gathered at each side; the instance colour tints them per window.
    for (const side of [0, 1]) {
      const x0 = side ? 128 : 0;
      const dir = side ? -1 : 1;
      g.fillStyle = '#f4ead8';
      g.beginPath();
      g.moveTo(x0, 0);
      g.lineTo(x0 + dir * 46, 0);
      g.quadraticCurveTo(x0 + dir * 20, 100, x0 + dir * 34, 192);
      g.lineTo(x0, 192);
      g.fill();
      g.strokeStyle = 'rgba(160,130,110,0.5)';
      g.lineWidth = 3;
      for (const f of [12, 24]) {
        g.beginPath();
        g.moveTo(x0 + dir * f, 0);
        g.quadraticCurveTo(x0 + dir * (f * 0.5), 100, x0 + dir * (f * 0.7), 192);
        g.stroke();
      }
    }
    g.fillStyle = '#f4ead8';
    g.fillRect(0, 0, 128, 14);
    glints(g, 128, 192);
  });
  const shop = make(256, 192, (g) => {
    room(g, 256, 192);
    // Shelves of colourful goods.
    const goods = ['#ff8a7a', '#ffd86b', '#7fdcc0', '#c3a6f0', '#ffb38a', '#7cc4ff'];
    for (let row = 0; row < 3; row++) {
      const y = 40 + row * 48;
      g.fillStyle = '#7a5a48';
      g.fillRect(0, y + 30, 256, 6);
      for (let x = 6; x < 250; x += 18 + ((x * 7) % 9)) {
        g.fillStyle = goods[(x + row * 3) % goods.length];
        const hh = 14 + ((x * 13 + row * 5) % 14);
        g.fillRect(x, y + 30 - hh, 12, hh);
      }
    }
    glints(g, 256, 192);
  });
  glassTextures = { window, shop };
  return glassTextures;
}

export type KitName =
  | 'windowFrame'
  | 'windowGlass'
  | 'windowTrim'
  | 'shutters'
  | 'flowerBox'
  | 'balcony'
  | 'shopFrame'
  | 'shopGlass'
  | 'door'
  | 'doorFrame'
  | 'pilaster'
  | 'lampPost'
  | 'lampGlass'
  | 'bench'
  | 'bollard'
  | 'hydrant'
  | 'quoin'
  | 'dentil'
  | 'chimney';

export interface Kit {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow: boolean;
}

const painted = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
const glass = (map: THREE.Texture) => new THREE.MeshStandardMaterial({ map, roughness: 0.1, metalness: 0.1 });

export function createKit(name: KitName): Kit {
  const kit = (geometry: THREE.BufferGeometry, castShadow = false, material: THREE.Material = painted()): Kit => ({ geometry, material, castShadow });
  switch (name) {
    case 'windowFrame':
      return kit(windowFrame());
    case 'windowGlass':
      return kit(new THREE.PlaneGeometry(WINDOW_W, WINDOW_H).translate(0, 0, 0.015), false, glass(paintGlass().window));
    case 'windowTrim':
      return kit(windowTrim(), true);
    case 'shutters':
      return kit(shutters());
    case 'flowerBox':
      return kit(flowerBox(), true);
    case 'balcony':
      return kit(balcony(), true);
    case 'shopFrame':
      return kit(shopFrame());
    case 'shopGlass':
      return kit(new THREE.PlaneGeometry(SHOP_W, SHOP_H).translate(0, 0, 0.015), false, glass(paintGlass().shop));
    case 'door':
      return kit(door());
    case 'doorFrame':
      return kit(doorFrame());
    case 'pilaster':
      return kit(pilaster());
    case 'lampPost':
      return kit(lampPost(), true);
    case 'lampGlass':
      return kit(lampGlass(), false, new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffc96b, emissiveIntensity: 2.2 }));
    case 'bench':
      return kit(bench(), true);
    case 'bollard':
      return kit(bollard(), true);
    case 'hydrant':
      return kit(hydrant(), true);
    case 'quoin':
      return kit(quoin());
    case 'dentil':
      return kit(dentil());
    case 'chimney':
      return kit(chimney(), true);
  }
}
