/** Building blocks shared by the town courses: palettes, buildings, street furniture and the distant skyline. */
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { SIGNS, Section, type LevelBuilder, type Style } from './builder';
import type { Surface } from './surfaces';
import { SHOP_H, WINDOW_H } from './kit';
import { SECTION_WIDTH } from '../config';

export const W = SECTION_WIDTH;
export const HW = W / 2;
export const WALL = 8;

export const ASPHALT = 0x74767e;
export const SIDEWALK = 0xe6ded0;
export const KERB = 0xcfcac2;
export const COBBLE = 0xd8cdbd;
export const DIRT = 0xcdb08a;
export const GRASS = 0x9ab85e;
export const STONE = 0xd6cbbd;
export const WHITE = 0xfff4dc;
export const BOUNCE = 0xff5fa2;
export const INK = 0x3b3550;
export const METAL = 0x33373f;
export const WOOD = 0xc98b55;
export const LEAF = 0x6a9e4a;

// Mostly quiet stone and stucco, with a few dusty colours so neighbours stay distinct, leaving saturated colour to
// the shopfronts, awnings, runners and items.
const WALLS = [0xf3e7cf, 0xeddcbc, 0xe2cba6, 0xf6f1e7, 0xe4ddd0, 0xe9c4a6, 0xc9d6b8, 0xbfd3d0, 0xeed8a4, 0xe6cfc0];
const BRICKS = [0xb86a4f, 0xa85c45, 0xc4805f];
const SHOPS = [0x3a5f80, 0x8a2e3b, 0x3a6a56, 0x4a4e5c, 0x7a4a30, 0xa8432f, 0x4f7a84];
export const ROOFS = [0x5c6676, 0x4d6188, 0x6f9a8c, 0x9e5a43];
// Pane brightness varies slightly so a facade's windows don't read as one repeated sticker.
const GLASS_TINTS = [0xffffff, 0xf3ece0, 0xdfe6ee, 0xf6e6dc, 0xd0d8e0, 0xe8e8e8];
export const CONTAINER_COLORS = [0xe8553e, 0x2f8fd8, 0x3cb371, 0xf2b134, 0x8a5cd6];
const FLAGS = [0xff5a5f, 0xffd23f, 0x3cc9b5, 0xff9ec7, 0x7cc4ff, WHITE];

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rand = rng(7);

/** Restarts the shared random sequence, so a course looks the same whichever courses were built before it. */
export function reseed(seed: number) {
  rand = rng(seed);
  signCounter = 0;
}

export const random = () => rand();
export const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

export function roofOf(color: number): number {
  return new THREE.Color(color).lerp(new THREE.Color(0xa8a297), 0.7).getHex();
}

export function lighten(color: number, amount = 0.55): number {
  return new THREE.Color(color).lerp(new THREE.Color(WHITE), amount).getHex();
}

export function darken(color: number, amount = 0.3): number {
  return new THREE.Color(color).multiplyScalar(1 - amount).getHex();
}

export const flat = (color: number, topSurface: Surface = 'plain', sides?: Surface): Style => ({ color, bevel: false, topSurface, sides });
export const deco = (color: number, extra: Partial<Style> = {}): Style => ({ color, collide: false, ...extra });

/** Direction from a building towards the course, in section coordinates (x, d). */
export type Facing = [number, number];

/** One building's palette and trimmings, picked once so its pieces agree with each other. */
interface Look {
  color: number;
  wall: Surface;
  trim: number;
  shop: number;
  door: number;
  frame: number;
  shutters: number | null;
  flowers: boolean;
  balconies: boolean;
  quoins: boolean;
}

function look(color?: number): Look {
  const shop = pick(SHOPS);
  const brick = rand() < 0.25;
  const wall = color ?? (brick ? pick(BRICKS) : pick(WALLS));
  return {
    color: wall,
    wall: brick ? 'brick' : 'plaster',
    // Brick gets stone dressings; stucco gets a paler shade of itself.
    trim: brick ? 0xeee4d2 : lighten(wall, 0.4),
    shop,
    door: darken(pick(SHOPS), 0.15),
    frame: rand() < 0.75 ? 0xfaf3e6 : darken(shop, 0.2),
    shutters: rand() < 0.45 ? darken(pick(SHOPS), 0.1) : null,
    flowers: rand() < 0.5,
    balconies: rand() < 0.35,
    quoins: rand() < 0.45,
  };
}

/** Walks positions along one face of a footprint: `at(a)` maps a distance along it to (x, d). */
function faceOf(x0: number, x1: number, d0: number, d1: number, [fx, fd]: Facing) {
  const alongX = fx === 0;
  const [a0, a1] = alongX ? [x0, x1] : [d0, d1];
  const wall = fx > 0 ? x1 : fx < 0 ? x0 : fd > 0 ? d1 : d0;
  const at = (a: number, out = 0): [number, number] => (alongX ? [a, wall + fd * out] : [wall + fx * out, a]);
  return { a0, a1, len: a1 - a0, at };
}

let signCounter = 0;

interface BuildingOptions {
  color?: number;
  /** The face that looks onto the course. Defaults to whichever x side faces the middle. */
  front?: Facing;
  /** Boundary buildings: only the front is ever seen, and the roof is out of reach. */
  tall?: boolean;
  /** Free-standing buildings seen from every side, such as those on the rooftop course. */
  allSides?: boolean;
}

/**
 * A building: one plain collision box, dressed with a shopfront, real windows, ledges, quoins and a cornice or
 * pitched roof. The dressing never collides, so ledge grabs only ever see the box.
 */
export function bld(s: Section, x0: number, x1: number, d0: number, d1: number, h: number, o: BuildingOptions = {}) {
  const L = look(o.color);
  const front: Facing = o.front ?? [x0 + x1 < 0 ? 1 : -1, 0];
  const faces: Facing[] = o.tall ? [front] : o.allSides ? [front, [-front[0], -front[1]], [0, -1], [0, 1]] : [front, [0, -1], [0, 1]];
  const roof = roofOf(L.color);
  s.box(x0, x1, d0, d1, 0, h, { color: 0, hidden: true });

  const ground = Math.min(h, 3.4);
  s.box(x0, x1, d0, d1, 0, ground, deco(L.shop, { sides: 'planks', top: roof, topSurface: 'paving' }));
  shopfront(s, x0, x1, d0, d1, front, L);

  if (h > 5.5) {
    s.box(x0 - 0.1, x1 + 0.1, d0 - 0.1, d1 + 0.1, 3.4, 3.7, deco(L.trim));
    s.box(x0, x1, d0, d1, 3.7, h, deco(L.color, { sides: L.wall, top: roof, topSurface: 'paving' }));
    for (let y = 3.7 + 3.2; y < h - 1.5; y += 3.2) s.box(x0 - 0.06, x1 + 0.06, d0 - 0.06, d1 + 0.06, y - 0.1, y + 0.06, deco(L.trim));
    for (const face of faces) windowsOn(s, x0, x1, d0, d1, face, h, L);
    if (L.quoins) quoins(s, x0, x1, d0, d1, front, h, L);
  }

  if (o.tall && rand() < 0.55) {
    const across = front[0] !== 0 ? x1 - x0 : d1 - d0;
    const rise = across * 0.38;
    s.box(x0 - 0.15, x1 + 0.15, d0 - 0.15, d1 + 0.15, h - 0.35, h, deco(L.trim));
    s.gableRoof(x0, x1, d0, d1, h, rise, pick(ROOFS), L.color, front[1] !== 0);
    const { a0, a1, at } = faceOf(x0, x1, d0, d1, front);
    for (let a = a0 + 2 + rand() * 3; a < a1 - 1.5; a += 5 + rand() * 6) {
      const [x, d] = at(a, -across * 0.3);
      s.instance('chimney', x, h + rise * 0.45, d, front, 0xffffff);
    }
  } else {
    s.box(x0 - 0.3, x1 + 0.3, d0 - 0.3, d1 + 0.3, h - 0.45, h + 0.02, deco(L.trim, { top: roof, topSurface: 'paving' }));
    if (h > 5.5) {
      for (const face of faces) {
        const { a0, a1, at } = faceOf(x0, x1, d0, d1, face);
        for (let a = a0 + 0.3; a < a1 - 0.2; a += 0.45) {
          const [x, d] = at(a);
          s.instance('dentil', x, h - 0.58, d, face, L.trim);
        }
      }
    }
    if (o.tall) roofClutter(s, x0, x1, d0, d1, h + 0.02);
  }
}

function windowsOn(s: Section, x0: number, x1: number, d0: number, d1: number, face: Facing, h: number, L: Look) {
  const { a0, len, at } = faceOf(x0, x1, d0, d1, face);
  const width = L.shutters !== null ? 3.0 : 2.4;
  const count = Math.floor((len - 0.6) / width);
  if (count < 1) return;
  const spacing = len / count;
  for (let floor = 3.7; floor + 2.9 < h; floor += 3.2) {
    const y = floor + 0.55 + WINDOW_H / 2;
    for (let i = 0; i < count; i++) {
      const [x, d] = at(a0 + spacing * (i + 0.5));
      s.instance('windowFrame', x, y, d, face, L.frame);
      s.instance('windowGlass', x, y, d, face, pick(GLASS_TINTS));
      s.instance('windowTrim', x, y, d, face, L.trim);
      if (L.shutters !== null) s.instance('shutters', x, y, d, face, L.shutters);
      if (L.balconies && floor > 6 && rand() < 0.3) s.instance('balcony', x, y, d, face, METAL);
      else if (L.flowers && rand() < 0.6) s.instance('flowerBox', x, y, d, face, 0xffffff);
    }
  }
}

function quoins(s: Section, x0: number, x1: number, d0: number, d1: number, face: Facing, h: number, L: Look) {
  const { a0, a1, at } = faceOf(x0, x1, d0, d1, face);
  const color = lighten(L.color, 0.45);
  let k = 0;
  for (let y = 3.9; y < h - 0.7; y += 0.44, k++) {
    const scale = k % 2 ? 1.35 : 1;
    const inset = 0.33 * scale - 0.06;
    for (const a of [a0 + inset, a1 - inset]) {
      const [x, d] = at(a, -0.27);
      s.instance('quoin', x, y, d, face, color, new THREE.Vector3(scale, 1, 1));
    }
  }
}

function shopfront(s: Section, x0: number, x1: number, d0: number, d1: number, face: Facing, L: Look) {
  const { a0, a1, len, at } = faceOf(x0, x1, d0, d1, face);
  if (len < 3.5) return;
  const bays = Math.max(1, Math.floor(len / 4.8));
  const bay = len / bays;
  const pilasterColor = lighten(L.shop, 0.3);
  for (let i = 0; i <= bays; i++) {
    const [x, d] = at(THREE.MathUtils.clamp(a0 + i * bay, a0 + 0.28, a1 - 0.28));
    s.instance('pilaster', x, 0, d, face, pilasterColor);
  }
  const windowY = SHOP_H / 2 + 0.14 + 0.62;
  for (let i = 0; i < bays; i++) {
    const start = a0 + i * bay;
    const end = start + bay;
    const hasDoor = bay >= 4.6;
    const windowAt = hasDoor ? start + 0.4 + 1.44 : (start + end) / 2;
    if (bay >= 3.4) {
      const [x, d] = at(windowAt);
      s.instance('shopFrame', x, windowY, d, face, L.shop);
      s.instance('shopGlass', x, windowY, d, face, pick(GLASS_TINTS));
    }
    if (hasDoor) {
      const [x, d] = at(end - 0.4 - 0.7);
      s.instance('door', x, 0, d, face, L.door);
      s.instance('doorFrame', x, 0, d, face, L.trim);
    }
  }

  // Fascia board above the windows, and a hand-painted sign hanging off a bracket at one end.
  const [fx, fd] = face;
  const [ax0, ad0] = at(a0 + 0.3);
  const [ax1, ad1] = at(a1 - 0.3, 0.25);
  s.box(Math.min(ax0, ax1), Math.max(ax0, ax1), Math.min(ad0, ad1), Math.max(ad0, ad1), 2.95, 3.65, deco(darken(L.shop, 0.25)));
  if (len > 5) hangingSign(s, at, a0 + 1.1, face, SIGNS[signCounter++ % SIGNS.length]);
  if (rand() < 0.5) awningOn(s, x0, x1, d0, d1, [fx, fd], L.shop);
}

/** A double-sided board hanging from a wall bracket, square to the street so runners see it coming. */
function hangingSign(s: Section, at: (a: number, out?: number) => [number, number], a: number, face: Facing, image: string) {
  const [fx, fd] = face;
  const along: Facing = [-fd, fx];
  const [wx, wd] = at(a);
  const [ox, od] = at(a, 1.6);
  s.box(Math.min(wx, ox) - 0.04, Math.max(wx, ox) + 0.04, Math.min(wd, od) - 0.04, Math.max(wd, od) + 0.04, 4.05, 4.15, deco(METAL));
  const [bx0, bd0] = at(a, 0.35);
  const [bx1, bd1] = at(a, 1.55);
  const half = 0.05;
  s.box(Math.min(bx0, bx1) - (fx === 0 ? half : 0), Math.max(bx0, bx1) + (fx === 0 ? half : 0), Math.min(bd0, bd1) - (fd === 0 ? half : 0), Math.max(bd0, bd1) + (fd === 0 ? half : 0), 3.12, 3.98, deco(0x6b4a35));
  const [cx, cd] = at(a, 0.95);
  for (const sign of [1, -1]) {
    const nx = along[0] * sign;
    const nd = along[1] * sign;
    s.poster(image, cx + nx * (half + 0.005), 3.55, cd + nd * (half + 0.005), [nx, nd], 1.1, 0.74);
  }
  for (const off of [0.5, 1.4]) {
    const [px, pd] = at(a, off);
    s.decor(new THREE.CylinderGeometry(0.015, 0.015, 0.08, 4), px, 4.01, pd, METAL);
  }
}

function awningOn(s: Section, x0: number, x1: number, d0: number, d1: number, [fx, fd]: Facing, color: number) {
  const width = (fx !== 0 ? d1 - d0 : x1 - x0) - 1.4;
  if (width < 2.5) return;
  const x = fx > 0 ? x1 : fx < 0 ? x0 : (x0 + x1) / 2;
  const d = fd > 0 ? d1 : fd < 0 ? d0 : (d0 + d1) / 2;
  const angle = Math.atan2(fd, fx);
  const stripes = Math.max(3, Math.round(width / 0.7));
  const sw = width / stripes;
  const depth = 1.6;
  const tilt = 0.32;
  for (let k = 0; k < stripes; k++) {
    const z = -width / 2 + (k + 0.5) * sw;
    const c = k % 2 ? WHITE : color;
    const canopy = new THREE.BoxGeometry(depth, 0.06, sw).translate(depth / 2, 0, z).rotateZ(-tilt).rotateY(angle);
    s.decor(canopy, x, 2.92, d, c);
    // Scalloped valance: a half-disc hanging from each stripe.
    const scallop = new THREE.CylinderGeometry(sw / 2, sw / 2, 0.05, 10, 1, false, 0, Math.PI)
      .rotateZ(Math.PI / 2)
      .rotateY(Math.PI / 2)
      .translate(depth * Math.cos(tilt), -depth * Math.sin(tilt) - 0.02, z)
      .rotateY(angle);
    s.decor(scallop, x, 2.92, d, c);
  }
}

/** Air-con units, vents and the odd water tower on roofs nobody can reach, for a busier skyline. */
export function roofClutter(s: Section, x0: number, x1: number, d0: number, d1: number, h: number) {
  const at = (lo: number, hi: number) => lo + 1.5 + rand() * Math.max(0, hi - lo - 3);
  const count = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < count; i++) {
    const x = at(x0, x1);
    const d = at(d0, d1);
    const kind = rand();
    if (kind < 0.45) {
      s.box(x - 0.7, x + 0.7, d - 0.55, d + 0.55, h, h + 1, deco(0xd9dde6, { sides: 'corrugated', top: 0xb8bfcc }));
      s.decor(new THREE.CylinderGeometry(0.35, 0.35, 0.08, 14), x, h + 1.02, d, INK);
    } else if (kind < 0.75) {
      s.decor(new THREE.CylinderGeometry(0.22, 0.22, 1.6, 10), x, h + 0.8, d, 0x8f97b0);
      s.decor(new THREE.ConeGeometry(0.38, 0.35, 10), x, h + 1.75, d, 0x8f97b0);
    } else {
      for (const [lx, ld] of [
        [-0.8, -0.8],
        [0.8, -0.8],
        [-0.8, 0.8],
        [0.8, 0.8],
      ]) {
        s.decor(new THREE.CylinderGeometry(0.07, 0.07, 2, 5), x + lx, h + 1, d + ld, INK);
      }
      s.decor(planked(new THREE.CylinderGeometry(1.2, 1.2, 2.2, 14)), x, h + 3.1, d, WOOD);
      s.decor(new THREE.ConeGeometry(1.35, 0.9, 14), x, h + 4.65, d, 0x8a5a3c);
    }
  }
}

/** Darkens alternate vertical strips of a cylinder so it reads as staves. */
function planked(geom: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geom.toNonIndexed();
  const p = g.attributes.position;
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const k = Math.floor(((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2)) * 14) % 2 ? 0.85 : 1;
    for (let j = 0; j < 3; j++) colors.set([k, k, k], (i + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/** A lumpy, smooth-shaded foliage puff, lighter on top, like hand-modelled stylised trees. */
export function foliage(radius: number): THREE.BufferGeometry {
  const ico = new THREE.IcosahedronGeometry(radius, 2);
  ico.deleteAttribute('uv');
  ico.deleteAttribute('normal');
  // Welding the icosahedron's separate faces lets the normals smooth across them; facets read as low-poly.
  const g = mergeVertices(ico);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.multiplyScalar(0.88 + hash3(Math.round(v.x * 100), Math.round(v.y * 100), Math.round(v.z * 100)) * 0.24);
    p.setXYZ(i, v.x, v.y * 0.85, v.z);
  }
  g.computeVertexNormals();
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = THREE.MathUtils.clamp((p.getY(i) / radius + 1) / 2, 0, 1);
    const k = 0.62 + t * 0.55;
    colors.set([k, k, k * 0.9], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** A thin rod between two points given as [x, y, d]. */
export function strut(s: Section, a: [number, number, number], b: [number, number, number], r: number, color: number) {
  const A = new THREE.Vector3(a[0], a[1], -a[2]);
  const B = new THREE.Vector3(b[0], b[1], -b[2]);
  const dir = B.clone().sub(A);
  const g = new THREE.CylinderGeometry(r, r, dir.length(), 6);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  const mid = A.add(B).multiplyScalar(0.5);
  s.decor(g.translate(mid.x, mid.y, mid.z), 0, 0, 0, color);
}

/** Open steel framework around a box: corner posts, rings and cross-bracing, like a crane mast or scaffold. */
export function lattice(s: Section, x0: number, x1: number, d0: number, d1: number, y0: number, y1: number, color: number, step = 2) {
  const corners: [number, number][] = [
    [x0, d0],
    [x1, d0],
    [x1, d1],
    [x0, d1],
  ];
  for (const [x, d] of corners) s.box(x - 0.12, x + 0.12, d - 0.12, d + 0.12, y0, y1, deco(color));
  let flip = false;
  for (let y = y0; y < y1 - 0.01; y += step, flip = !flip) {
    const top = Math.min(y + step, y1);
    for (let i = 0; i < 4; i++) {
      const [ax, ad] = corners[i];
      const [bx, bd] = corners[(i + 1) % 4];
      strut(s, [ax, top, ad], [bx, top, bd], 0.06, color);
      if (flip) strut(s, [ax, y, ad], [bx, top, bd], 0.05, color);
      else strut(s, [bx, y, bd], [ax, top, ad], 0.05, color);
    }
  }
}

export function ground(s: Section, d0: number, d1: number, color = ASPHALT, surface: Surface = 'asphalt') {
  s.box(-HW - WALL, HW + WALL, d0, d1, -1, 0, flat(color, surface));
}

export function street(s: Section, d0: number, d1: number) {
  ground(s, d0, d1);
  for (const side of [-1, 1]) {
    const inner = side * (HW - 3);
    s.box(Math.min(side * HW, inner), Math.max(side * HW, inner), d0, d1, 0, 0.2, { color: STONE, top: SIDEWALK, topSurface: 'paving', bevel: false });
    s.box(Math.min(inner, inner - side * 0.3), Math.max(inner, inner - side * 0.3), d0, d1, 0, 0.24, deco(KERB, { bevel: false }));
  }
  for (let d = d0 + 2; d < d1 - 3; d += 7) s.box(-0.15, 0.15, d, d + 3, 0, 0.02, deco(WHITE, { bevel: false }));
  for (let d = d0 + 6 + rand() * 8; d < d1 - 2; d += 14 + rand() * 10) {
    s.decor(new THREE.CylinderGeometry(0.45, 0.45, 0.04, 16), rand() < 0.5 ? -4 : 4, 0.02, d, 0x5a566a);
  }
  // Planters, benches and hydrants hug the walls, where they rarely get in anyone's way.
  for (let d = d0 + 4 + rand() * 6; d < d1 - 2; d += 7 + rand() * 7) {
    const side = rand() < 0.5 ? -1 : 1;
    const x = side * (HW - 0.55);
    const r = rand();
    if (r < 0.4) {
      s.box(x - 0.45, x + 0.45, d - 0.45, d + 0.45, 0.2, 0.95, deco(0xd9734e, { top: 0x7a4b3a, sides: 'brick' }));
      s.decor(foliage(0.6), x, 1.25, d, LEAF);
    } else if (r < 0.75) {
      s.instance('bench', x - side * 0.1, 0.2, d, [-side, 0], 0xffffff);
    } else {
      s.instance('hydrant', side * (HW - 2.4), 0.2, d, [-side, 0], 0xffffff);
    }
  }
}

export function zebra(s: Section, d: number) {
  for (let x = -HW + 3.6; x < HW - 3.6; x += 1.4) s.box(x, x + 0.7, d, d + 3, 0, 0.02, deco(WHITE, { bevel: false }));
}

/** A string of triangular flags across the street, high enough to clear every rooftop route. */
export function bunting(s: Section, d: number, y: number, sag = 1.4) {
  const segments = 18;
  const point = (t: number) => new THREE.Vector3(-HW + t * W, y - sag * (1 - (2 * t - 1) ** 2), 0);
  for (let k = 0; k < segments; k++) {
    const a = point(k / segments);
    const b = point((k + 1) / segments);
    const dir = b.clone().sub(a);
    const string = new THREE.CylinderGeometry(0.03, 0.03, dir.length(), 4)
      .rotateZ(Math.atan2(-dir.x, dir.y))
      .translate((a.x + b.x) / 2, (a.y + b.y) / 2, 0);
    s.decor(string, 0, 0, d, WHITE);
    const mid = a.clone().lerp(b, 0.5);
    const flag = new THREE.ConeGeometry(0.32, 0.6, 3).rotateX(Math.PI).scale(1, 1, 0.12).translate(mid.x, mid.y - 0.32, 0);
    s.decor(flag, 0, 0, d, FLAGS[k % FLAGS.length]);
  }
}

/** Tall boundary buildings. Too high to climb, so they keep everyone on the course. */
export function facade(s: Section, side: -1 | 1, d0: number, d1: number) {
  const x0 = side < 0 ? -HW - WALL : HW;
  const x1 = side < 0 ? -HW : HW + WALL;
  facadeSpan(s, x0, x1, d0, d1, [-side, 0]);
}

export function facadeSpan(s: Section, x0: number, x1: number, d0: number, d1: number, facing: Facing, alongX = false) {
  let at = alongX ? x0 : d0;
  const end = alongX ? x1 : d1;
  while (at < end - 0.01) {
    const len = Math.min(end - at, 9 + rand() * 9);
    const h = 17 + Math.floor(rand() * 4) * 3.2;
    const [bx0, bx1, bd0, bd1] = alongX ? [at, at + len, d0, d1] : [x0, x1, at, at + len];
    bld(s, bx0, bx1, bd0, bd1, h, { front: facing, tall: true });
    at += len;
  }
}

export function crate(s: Section, x: number, d: number, y = 0, size = 1.2) {
  s.box(x - size / 2, x + size / 2, d - size / 2, d + size / 2, y, y + size, { color: 0xd49a5a, top: 0xe8b77d, sides: 'planks', topSurface: 'planks' });
}

export function container(s: Section, x0: number, x1: number, d0: number, d1: number, levels: number) {
  for (let i = 0; i < levels; i++) {
    const color = pick(CONTAINER_COLORS);
    s.box(x0, x1, d0, d1, i * 2.6, (i + 1) * 2.6, { color, top: lighten(color, 0.25), sides: 'corrugated' });
  }
}

/** Trampolines on legs, or a solid inflatable when it's tall enough to be a bouncy castle. */
export function bouncePad(s: Section, x0: number, x1: number, d0: number, d1: number, h: number, base?: number) {
  if (base !== undefined) {
    s.box(x0, x1, d0, d1, 0, h - 0.3, { color: base });
  } else {
    s.box(x0, x1, d0, d1, 0, h - 0.3, { color: 0, hidden: true });
    s.box(x0 - 0.12, x1 + 0.12, d0 - 0.12, d1 + 0.12, h - 0.48, h - 0.26, deco(0x3f7fa8));
    for (const [x, d] of [
      [x0 + 0.2, d0 + 0.2],
      [x1 - 0.2, d0 + 0.2],
      [x0 + 0.2, d1 - 0.2],
      [x1 - 0.2, d1 - 0.2],
    ]) {
      s.decor(new THREE.CylinderGeometry(0.07, 0.09, h - 0.45, 8), x, (h - 0.45) / 2, d, METAL);
    }
  }
  s.box(x0, x1, d0, d1, h - 0.3, h, { color: BOUNCE, kind: 'bounce' });
}

export function tree(s: Section, x: number, d: number, y = 0) {
  s.box(x - 0.3, x + 0.3, d - 0.3, d + 0.3, y, y + 2.6, { color: 0, hidden: true });
  s.decor(new THREE.CylinderGeometry(0.18, 0.32, 3.2, 7), x, y + 1.6, d, 0x9b6a43);
  s.decor(new THREE.CylinderGeometry(0.06, 0.1, 1.2, 5).rotateZ(0.7), x + 0.35, y + 2.6, d, 0x9b6a43);
  for (const [ox, oy, oz, r] of [
    [0, 3.8, 0, 1.7],
    [1.0, 3.3, 0.4, 1.15],
    [-0.9, 3.4, -0.5, 1.2],
    [0.2, 4.8, -0.2, 1.1],
    [-0.3, 3.2, 0.9, 1.0],
  ]) {
    s.decor(foliage(r), x + ox, y + oy, d + oz, LEAF);
  }
}

export function bush(s: Section, x: number, d: number, r = 0.9) {
  s.decor(foliage(r), x, r * 0.55, d, 0x58b552);
}

export function lamp(s: Section, x: number, d: number) {
  const facing: Facing = [x < 0 ? 1 : -1, 0];
  s.instance('lampPost', x, 0.2, d, facing, 0xffffff);
  s.instance('lampGlass', x, 0.2, d, facing, 0xffffff);
}

export function arch(s: Section, d: number, color: number, stripe: number, y = 0, half = HW - 3.5) {
  for (const x of [-half, half]) {
    s.box(x - 0.7, x + 0.7, d - 0.7, d + 0.7, y, y + 0.6, deco(STONE, { sides: 'stone' }));
    s.box(x - 0.5, x + 0.5, d - 0.5, d + 0.5, y + 0.6, y + 7, deco(color));
    s.box(x - 0.65, x + 0.65, d - 0.65, d + 0.65, y + 6.6, y + 7, deco(stripe));
  }
  s.box(-half - 0.7, half + 0.7, d - 0.35, d + 0.35, y + 7, y + 8.6, deco(color));
  for (let x = -half + 0.5; x < half + 0.5; x += 2) s.box(x, x + 1, d - 0.4, d + 0.4, y + 7.15, y + 8.45, deco(stripe, { bevel: false }));
  for (const x of [-half, half]) s.decor(new THREE.SphereGeometry(0.45, 16, 10), x, y + 9.0, d, 0xffd23f);
}

/** A black-and-white chequered line painted across the course at distance `d`. */
export function finishLine(s: Section, d: number, y = 0, half = HW) {
  for (let x = -half; x < half; x += 2) {
    s.box(x, x + 1, d - 0.5, d + 0.5, y, y + 0.03, deco(INK, { bevel: false }));
    s.box(x + 1, x + 2, d - 0.5, d + 0.5, y, y + 0.03, deco(WHITE, { bevel: false }));
  }
}

export function pigeonStatue(s: Section, x: number, y: number, d: number) {
  const gray = 0x9aa3b5;
  s.decor(new THREE.SphereGeometry(1.1, 20, 14).scale(1, 0.9, 1.4), x, y + 1.1, d, gray);
  s.decor(new THREE.SphereGeometry(0.65, 20, 14), x, y + 2.3, d - 1.0, gray);
  s.decor(new THREE.ConeGeometry(0.22, 0.6, 10).rotateX(-Math.PI / 2), x, y + 2.25, d - 1.75, 0xffb347);
  s.decor(new THREE.SphereGeometry(0.16, 10, 8), x - 0.38, y + 2.45, d - 1.45, 0xffffff);
  s.decor(new THREE.SphereGeometry(0.16, 10, 8), x + 0.38, y + 2.45, d - 1.45, 0xffffff);
}

export function lilyPads(s: Section, x0: number, x1: number, d0: number, d1: number, y: number, count: number) {
  for (let i = 0; i < count; i++) {
    const x = x0 + 0.6 + rand() * (x1 - x0 - 1.2);
    const d = d0 + 0.6 + rand() * (d1 - d0 - 1.2);
    const r = 0.3 + rand() * 0.25;
    s.decor(new THREE.CylinderGeometry(r, r, 0.04, 14, 1, false, 0.4, Math.PI * 2 - 0.4).rotateY(rand() * 6), x, y + 0.02, d, 0x5fae4e);
    if (rand() < 0.35) s.decor(new THREE.ConeGeometry(0.1, 0.16, 6), x, y + 0.12, d, 0xff9ec7);
  }
}

/** A white ring where water laps against something standing in it. */
export function foamRing(s: Section, x: number, d: number, y: number, radius: number) {
  s.decor(new THREE.TorusGeometry(radius, 0.09, 4, 20).rotateX(Math.PI / 2).scale(1, 0.4, 1), x, y + 0.02, d, 0xffffff);
}

export function bus(s: Section, x0: number, x1: number, d0: number, d1: number) {
  s.box(x0, x1, d0, d1, 0, 3.2, { color: 0, hidden: true });
  s.box(x0, x1, d0, d1, 0.45, 3.2, deco(0xffb627, { top: 0xf3f0ea }));
  s.box(x0 - 0.04, x1 + 0.04, d0 + 0.6, d1 - 0.4, 1.8, 2.75, deco(0x4f6fa8, { bevel: false }));
  s.box(x0 - 0.04, x1 + 0.04, d0 - 0.04, d0 + 0.6, 1.5, 2.75, deco(0x4f6fa8, { bevel: false }));
  s.box(x0 - 0.03, x1 + 0.03, d0 + 0.2, d1 - 0.2, 1.1, 1.35, deco(0xe0675f, { bevel: false }));
  for (const x of [x0 + 0.3, x1 - 0.3]) {
    for (const d of [d0 + 2, d1 - 2.4]) {
      s.decor(new THREE.CylinderGeometry(0.5, 0.5, 0.45, 14).rotateZ(Math.PI / 2), x, 0.5, d, 0x2f2a3d);
    }
  }
}

/** Hazy towers well beyond the course so rooftops have a city behind them rather than empty sky. */
export function skyline(lb: LevelBuilder) {
  const path = lb.checkpoints.map((c) => c.point);
  const distanceToCourse = (x: number, z: number) => {
    let best = Infinity;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const t = THREE.MathUtils.clamp(((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz), 0, 1);
      best = Math.min(best, Math.hypot(x - a.x - abx * t, z - a.z - abz * t));
    }
    return best;
  };
  const min = new THREE.Vector3(Infinity, 0, Infinity);
  const max = new THREE.Vector3(-Infinity, 0, -Infinity);
  for (const p of path) {
    min.min(p);
    max.max(p);
  }
  const colors = [0xd8d2c4, 0xc9ccc8, 0xe4dccb, 0xbfc8cf, 0xd6c6b0, 0xe8e2d6];
  for (let placed = 0, tries = 0; placed < 70 && tries < 2000; tries++) {
    const x = min.x - 150 + rand() * (max.x - min.x + 300);
    const z = min.z - 150 + rand() * (max.z - min.z + 300);
    const half = 5 + rand() * 6;
    const dist = distanceToCourse(x, z);
    const m = half + 6;
    if (dist > 170 || !lb.world.isFree(x - m, -50, z - m, x + m, 200, z + m)) continue;
    const h = 24 + rand() * 40 + Math.max(0, 90 - dist) * 0.3;
    const color = pick(colors);
    lb.addBox(new THREE.Vector3(x - half, -1, z - half), new THREE.Vector3(x + half, h, z + half), {
      color,
      top: roofOf(color),
      sides: 'windows',
      collide: false,
    });
    lb.addBox(new THREE.Vector3(x - half - 0.4, h - 0.8, z - half - 0.4), new THREE.Vector3(x + half + 0.4, h + 0.3, z + half + 0.4), {
      color: lighten(color, 0.6),
      top: roofOf(color),
      collide: false,
    });
    placed++;
  }
}

/**
 * Ordinary city blocks filling the space around a raised course, separated from it by streets too wide to
 * jump, so the rooftops have a town below and around them.
 */
export function neighbourhood(lb: LevelBuilder, reach: number, clearance: number, heights: [number, number]) {
  const min = new THREE.Vector3(Infinity, 0, Infinity);
  const max = new THREE.Vector3(-Infinity, 0, -Infinity);
  for (const cp of lb.checkpoints) {
    min.min(cp.point);
    max.max(cp.point);
  }
  min.subScalar(reach);
  max.addScalar(reach);
  // A section at the origin facing -z, so (x, d) maps straight to world (x, -z).
  const world = new Section(lb, 0, 0, 0, 0);
  const lanes = lb.carLanes;
  const nearLane = (x: number, z: number, r: number) =>
    lanes.some(({ from, to }) => {
      const abx = to.x - from.x;
      const abz = to.z - from.z;
      const t = THREE.MathUtils.clamp(((x - from.x) * abx + (z - from.z) * abz) / (abx * abx + abz * abz), 0, 1);
      return Math.hypot(x - from.x - abx * t, z - from.z - abz * t) < r;
    });

  // Only the course itself needs clearing; neighbouring blocks may sit as close as the street grid allows.
  const course = lb.world.boxes.slice();
  const clear = (x0: number, z0: number, x1: number, z1: number) =>
    !course.some((b) => b.max.y > 0.5 && b.max.x > x0 && b.min.x < x1 && b.max.z > z0 && b.min.z < z1);

  const STEP = 22;
  for (let x = Math.floor(min.x / STEP) * STEP; x < max.x; x += STEP) {
    for (let z = Math.floor(min.z / STEP) * STEP; z < max.z; z += STEP) {
      const w = 11 + rand() * 5;
      const dz = 11 + rand() * 5;
      const x0 = x + (STEP - w) / 2;
      const z0 = z + (STEP - dz) / 2;
      const x1 = x0 + w;
      const z1 = z0 + dz;
      if (!clear(x0 - clearance, z0 - clearance, x1 + clearance, z1 + clearance)) continue;
      if (nearLane((x0 + x1) / 2, (z0 + z1) / 2, Math.max(w, dz) / 2 + 4)) continue;
      const h = heights[0] + Math.floor(rand() * ((heights[1] - heights[0]) / 3.2)) * 3.2;
      bld(world, x0, x1, -z1, -z0, h, { allSides: true });
    }
  }
  lb.addBox(new THREE.Vector3(min.x, -1, min.z), new THREE.Vector3(max.x, 0, max.z), flat(ASPHALT, 'asphalt'));
}
