import * as THREE from 'three';
import { LevelBuilder, SIGNS, type Level, type Section, type Style } from './builder';
import type { Surface } from './surfaces';
import { SHOP_H, WINDOW_H } from './kit';
import { SECTION_WIDTH } from '../config';

const W = SECTION_WIDTH;
const HW = W / 2;
const WALL = 8;

const ASPHALT = 0x8a8496;
const SIDEWALK = 0xe9dfcc;
const KERB = 0xd2cbc2;
const COBBLE = 0xe6d2b4;
const DIRT = 0xd9ad78;
const GRASS = 0x8fd36a;
const STONE = 0xd6cbbd;
const WHITE = 0xfff4dc;
const BOUNCE = 0xff5fa2;
const INK = 0x3b3550;
const METAL = 0x4a5068;
const WOOD = 0xc98b55;
const LEAF = 0x62c25a;

// A warm pastel street with richer shopfront accents, so the course reads as one place rather than a paint chart.
const WALLS = [0xf4a582, 0xf7d488, 0x9ed9c5, 0x93c4e6, 0xeba9c4, 0xc9b6e4, 0xf3e4c4, 0x80c9b2, 0xe8866e];
const SHOPS = [0x3f7fa8, 0xc4566c, 0x3f8f68, 0x7d5cb0, 0xd9624f, 0x46689e, 0xd99436];
const ROOFS = [0xc8644a, 0x8a5a8c, 0x5a6f9a, 0xb5573f];
const GLASS_TINTS = [0xffffff, 0xffe2c4, 0xdce8ff, 0xffd4dc, 0xe2ffd8];
const CONTAINER_COLOURS = [0xe8553e, 0x2f8fd8, 0x3cb371, 0xf2b134, 0x8a5cd6];
const FLAGS = [0xff5a5f, 0xffd23f, 0x3cc9b5, 0xff9ec7, 0x7cc4ff, WHITE];

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(7);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

function roofOf(color: number): number {
  return new THREE.Color(color).lerp(new THREE.Color(0x6e6a90), 0.5).getHex();
}

function lighten(color: number, amount = 0.55): number {
  return new THREE.Color(color).lerp(new THREE.Color(WHITE), amount).getHex();
}

function darken(color: number, amount = 0.3): number {
  return new THREE.Color(color).multiplyScalar(1 - amount).getHex();
}

const flat = (color: number, topSurface: Surface = 'plain', sides?: Surface): Style => ({ color, bevel: false, topSurface, sides });
const deco = (color: number, extra: Partial<Style> = {}): Style => ({ color, collide: false, ...extra });

/** Direction from a building towards the course, in section coordinates (x, d). */
type Facing = [number, number];

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

function look(color = pick(WALLS)): Look {
  const shop = pick(SHOPS);
  return {
    color,
    wall: rand() < 0.3 ? 'brick' : 'plaster',
    trim: lighten(color, 0.7),
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
}

/**
 * A building: one plain collision box, dressed with a shopfront, real windows, ledges, quoins and a cornice or
 * pitched roof. The dressing never collides, so ledge grabs only ever see the box.
 */
function bld(s: Section, x0: number, x1: number, d0: number, d1: number, h: number, o: BuildingOptions = {}) {
  const L = look(o.color);
  const front: Facing = o.front ?? [x0 + x1 < 0 ? 1 : -1, 0];
  const faces: Facing[] = o.tall ? [front] : [front, [0, -1], [0, 1]];
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
  const pilasterColour = lighten(L.shop, 0.3);
  for (let i = 0; i <= bays; i++) {
    const [x, d] = at(THREE.MathUtils.clamp(a0 + i * bay, a0 + 0.28, a1 - 0.28));
    s.instance('pilaster', x, 0, d, face, pilasterColour);
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

function awningOn(s: Section, x0: number, x1: number, d0: number, d1: number, [fx, fd]: Facing, colour: number) {
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
    const c = k % 2 ? WHITE : colour;
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
function roofClutter(s: Section, x0: number, x1: number, d0: number, d1: number, h: number) {
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

/** A lumpy, faceted foliage blob, lighter on top, like hand-modelled stylised trees. */
function foliage(radius: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, 1);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.multiplyScalar(0.85 + hash3(Math.round(v.x * 100), Math.round(v.y * 100), Math.round(v.z * 100)) * 0.3);
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
function strut(s: Section, a: [number, number, number], b: [number, number, number], r: number, color: number) {
  const A = new THREE.Vector3(a[0], a[1], -a[2]);
  const B = new THREE.Vector3(b[0], b[1], -b[2]);
  const dir = B.clone().sub(A);
  const g = new THREE.CylinderGeometry(r, r, dir.length(), 6);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  const mid = A.add(B).multiplyScalar(0.5);
  s.decor(g.translate(mid.x, mid.y, mid.z), 0, 0, 0, color);
}

/** Open steel framework around a box: corner posts, rings and cross-bracing, like a crane mast or scaffold. */
function lattice(s: Section, x0: number, x1: number, d0: number, d1: number, y0: number, y1: number, color: number, step = 2) {
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

function ground(s: Section, d0: number, d1: number, color = ASPHALT, surface: Surface = 'asphalt') {
  s.box(-HW - WALL, HW + WALL, d0, d1, -1, 0, flat(color, surface));
}

function street(s: Section, d0: number, d1: number) {
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

function zebra(s: Section, d: number) {
  for (let x = -HW + 3.6; x < HW - 3.6; x += 1.4) s.box(x, x + 0.7, d, d + 3, 0, 0.02, deco(WHITE, { bevel: false }));
}

/** A string of triangular flags across the street, high enough to clear every rooftop route. */
function bunting(s: Section, d: number, y: number, sag = 1.4) {
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
function facade(s: Section, side: -1 | 1, d0: number, d1: number) {
  const x0 = side < 0 ? -HW - WALL : HW;
  const x1 = side < 0 ? -HW : HW + WALL;
  facadeSpan(s, x0, x1, d0, d1, [-side, 0]);
}

function facadeSpan(s: Section, x0: number, x1: number, d0: number, d1: number, facing: Facing, alongX = false) {
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

function crate(s: Section, x: number, d: number, y = 0, size = 1.2) {
  s.box(x - size / 2, x + size / 2, d - size / 2, d + size / 2, y, y + size, { color: 0xd49a5a, top: 0xe8b77d, sides: 'planks', topSurface: 'planks' });
}

function container(s: Section, x0: number, x1: number, d0: number, d1: number, levels: number) {
  for (let i = 0; i < levels; i++) {
    const color = pick(CONTAINER_COLOURS);
    s.box(x0, x1, d0, d1, i * 2.6, (i + 1) * 2.6, { color, top: lighten(color, 0.25), sides: 'corrugated' });
  }
}

/** Trampolines on legs, or a solid inflatable when it's tall enough to be a bouncy castle. */
function bouncePad(s: Section, x0: number, x1: number, d0: number, d1: number, h: number, base?: number) {
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

function tree(s: Section, x: number, d: number, y = 0) {
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

function bush(s: Section, x: number, d: number, r = 0.9) {
  s.decor(foliage(r), x, r * 0.55, d, 0x58b552);
}

function lamp(s: Section, x: number, d: number) {
  const facing: Facing = [x < 0 ? 1 : -1, 0];
  s.instance('lampPost', x, 0.2, d, facing, 0xffffff);
  s.instance('lampGlass', x, 0.2, d, facing, 0xffffff);
}

function arch(s: Section, d: number, color: number, stripe: number) {
  for (const x of [-HW + 3.5, HW - 3.5]) {
    s.box(x - 0.7, x + 0.7, d - 0.7, d + 0.7, 0, 0.6, deco(STONE, { sides: 'stone' }));
    s.box(x - 0.5, x + 0.5, d - 0.5, d + 0.5, 0.6, 7, deco(color));
    s.box(x - 0.65, x + 0.65, d - 0.65, d + 0.65, 6.6, 7, deco(stripe));
  }
  s.box(-HW + 2.8, HW - 2.8, d - 0.35, d + 0.35, 7, 8.6, deco(color));
  for (let x = -HW + 3; x < HW - 3; x += 2) s.box(x, x + 1, d - 0.4, d + 0.4, 7.15, 8.45, deco(stripe, { bevel: false }));
  for (const x of [-HW + 3.5, HW - 3.5]) s.decor(new THREE.SphereGeometry(0.45, 16, 10), x, 9.0, d, 0xffd23f);
}

function pigeonStatue(s: Section, x: number, y: number, d: number) {
  const grey = 0x9aa3b5;
  s.decor(new THREE.SphereGeometry(1.1, 20, 14).scale(1, 0.9, 1.4), x, y + 1.1, d, grey);
  s.decor(new THREE.SphereGeometry(0.65, 20, 14), x, y + 2.3, d - 1.0, grey);
  s.decor(new THREE.ConeGeometry(0.22, 0.6, 10).rotateX(-Math.PI / 2), x, y + 2.25, d - 1.75, 0xffb347);
  s.decor(new THREE.SphereGeometry(0.16, 10, 8), x - 0.38, y + 2.45, d - 1.45, 0xffffff);
  s.decor(new THREE.SphereGeometry(0.16, 10, 8), x + 0.38, y + 2.45, d - 1.45, 0xffffff);
}

function lilyPads(s: Section, x0: number, x1: number, d0: number, d1: number, y: number, count: number) {
  for (let i = 0; i < count; i++) {
    const x = x0 + 0.6 + rand() * (x1 - x0 - 1.2);
    const d = d0 + 0.6 + rand() * (d1 - d0 - 1.2);
    const r = 0.3 + rand() * 0.25;
    s.decor(new THREE.CylinderGeometry(r, r, 0.04, 14, 1, false, 0.4, Math.PI * 2 - 0.4).rotateY(rand() * 6), x, y + 0.02, d, 0x5fae4e);
    if (rand() < 0.35) s.decor(new THREE.ConeGeometry(0.1, 0.16, 6), x, y + 0.12, d, 0xff9ec7);
  }
}

/** A white ring where water laps against something standing in it. */
function foamRing(s: Section, x: number, d: number, y: number, radius: number) {
  s.decor(new THREE.TorusGeometry(radius, 0.09, 4, 20).rotateX(Math.PI / 2).scale(1, 0.4, 1), x, y + 0.02, d, 0xffffff);
}

function bus(s: Section, x0: number, x1: number, d0: number, d1: number) {
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
function skyline(lb: LevelBuilder) {
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
  const colours = [0xa9b8e0, 0xc4b3dd, 0x9fc8d8, 0xd9b8c8, 0xb8c9e8, 0xe6c8a8];
  for (let placed = 0, tries = 0; placed < 70 && tries < 2000; tries++) {
    const x = min.x - 150 + rand() * (max.x - min.x + 300);
    const z = min.z - 150 + rand() * (max.z - min.z + 300);
    const half = 5 + rand() * 6;
    const dist = distanceToCourse(x, z);
    const m = half + 6;
    if (dist > 170 || !lb.world.isFree(x - m, -50, z - m, x + m, 200, z + m)) continue;
    const h = 24 + rand() * 40 + Math.max(0, 90 - dist) * 0.3;
    const color = pick(colours);
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


function highStreet(lb: LevelBuilder) {
  lb.straight(84, (s) => {
    ground(s, -12, 0);
    street(s, 0, 84);
    bld(s, -HW - WALL, HW + WALL, -12, -4, 20, { color: 0xc9b6e4, front: [0, 1], tall: true });
    facade(s, -1, -4, 84);
    facade(s, 1, -4, 84);
    arch(s, 1, WHITE, INK);
    zebra(s, 10);
    bunting(s, 26, 13.5);
    bunting(s, 52, 13.5);
    bunting(s, 76, 13.5);
    s.checkpoint(0);
    for (const [x, d] of [
      [-6, 4],
      [0, 4],
      [6, 4],
      [-9, 8],
      [-3, 8],
      [3, 8],
    ]) {
      s.start(x, d);
    }

    // Left: low rooftops, each a jump away from the next.
    bld(s, -HW, -9, 16, 30, 4);
    bld(s, -HW, -9, 34, 46, 5.5);
    bld(s, -HW, -9, 49, 62, 6.5);
    bld(s, -HW, -9, 67, 80, 5);
    s.box(-16, -14, 55, 57, 6.5, 7.5, { color: 0xc9d1e0 });
    s.item(-13, 40, 5.5);

    // Right: tall shops reached by bouncing off market stalls.
    bld(s, 9, HW, 14, 40, 9);
    bld(s, 9, HW, 40, 62, 9.5);
    bld(s, 9, HW, 66, 80, 7);
    bouncePad(s, 6, 9, 18, 22, 1.2);
    bouncePad(s, 6, 9, 30, 34, 1.2);
    s.item(13, 30, 9);
    s.anchor(13, 50, 13);

    // Street: barriers, a parked bus and crates.
    s.box(-8, 2, 24, 24.6, 0, 1, { color: 0xff5050, top: 0xffffff });
    bus(s, -3, 3, 38, 50);
    crate(s, 3.5, 58);
    crate(s, 4.7, 58);
    crate(s, 4.1, 58, 1.2);
    for (const x of [-6, -2, 2, 6]) s.item(x, 30);
    for (const x of [-4, 0, 4]) s.item(x, 70);
    for (const d of [10, 30, 50, 70]) {
      lamp(s, -14.5, d);
      lamp(s, 14.5, d + 10);
    }

    s.route([
      [-5, 0, 14],
      [-6, 0, 34],
      [-6, 0, 56],
      [0, 0, 84],
    ]);
    s.route([
      [-12, 0, 12],
      [-13, 4, 22],
      [-13, 5.5, 40],
      [-13, 6.5, 56],
      [-13, 5, 74],
      [-8, 0, 84],
    ]);
    s.route([
      [5, 0, 12],
      [7.5, 1.2, 20],
      [13, 9, 26],
      [13, 9.5, 50],
      [13, 7, 74],
      [8, 0, 84],
    ]);
    s.checkpoint();
  });
}

function fountainSquare(lb: LevelBuilder) {
  lb.turn(1, (s) => {
    s.box(-HW, HW + WALL, 0, W + WALL, -1, 0, flat(COBBLE, 'cobbles'));
    facadeSpan(s, HW, HW + WALL, 0, W, [-1, 0]);
    facadeSpan(s, -HW - WALL, HW + WALL, W, W + WALL, [0, -1], true);

    // Fountain: walkable at rim height, with a basin of water inside the rim.
    s.box(-4, 4, 14, 22, 0, 0.8, { color: 0, hidden: true });
    for (const [x0, x1, d0, d1] of [
      [-4, 4, 14, 14.6],
      [-4, 4, 21.4, 22],
      [-4, -3.4, 14.6, 21.4],
      [3.4, 4, 14.6, 21.4],
    ]) {
      s.box(x0, x1, d0, d1, 0, 0.8, deco(STONE, { sides: 'stone', top: 0xe8dfd2 }));
    }
    s.box(-3.4, 3.4, 14.6, 21.4, 0, 0.3, deco(STONE, { bevel: false }));
    s.water(-3.4, 3.4, 14.6, 21.4, 0.62);
    s.box(-1.5, 1.5, 17, 20, 0.8, 4.8, { color: STONE, top: 0xe8dfd2, sides: 'stone' });
    s.box(-1.5, 1.5, 17, 20, 0.3, 0.8, deco(STONE, { sides: 'stone' }));
    s.box(-1.8, 1.8, 16.7, 20.3, 4.5, 4.8, deco(0xe8dfd2));
    pigeonStatue(s, 0, 4.8, 19.6);
    s.item(0, 17.8, 4.8);

    for (const [x, d] of [
      [12, 6],
      [12, 30],
      [-12, 31],
      [6, 31],
    ]) {
      tree(s, x, d);
    }
    s.box(-13, -9, 8, 9, 0, 0.5, { color: 0x9b6a43 });
    s.item(-8, 12);
    s.item(7, 10);
    s.item(-6, 26);

    s.route([
      [-6, 0, 6],
      [-12, 0, 14],
      [-18, 0, 18],
    ]);
    s.checkpoint();
  });
}

function canalStreet(lb: LevelBuilder) {
  lb.straight(84, (s) => {
    street(s, 0, 29);
    street(s, 41, 84);
    facade(s, -1, WALL, 84);
    facade(s, 1, WALL, 84);
    s.box(-HW - WALL, HW + WALL, 29, 30, -4, 0.15, flat(STONE, 'stone', 'stone'));
    s.box(-HW - WALL, HW + WALL, 40, 41, -4, 0.15, flat(STONE, 'stone', 'stone'));
    s.box(-HW - WALL, HW + WALL, 30, 40, -5, -4, flat(STONE));
    s.water(-HW - WALL, HW + WALL, 30, 40, -1.3);

    // Street bridge.
    s.box(4, 12, 27, 43, -0.6, 0.5, { color: STONE, top: 0xe2d8ca, sides: 'stone', topSurface: 'cobbles' });
    for (const d of [32, 38]) {
      s.box(4.6, 11.4, d - 0.8, d + 0.8, -4, -0.6, deco(STONE, { sides: 'stone' }));
    }
    s.box(4, 4.4, 29, 41, 0.5, 1.5, { color: 0xffffff });
    s.box(11.6, 12, 29, 41, 0.5, 1.5, { color: 0xffffff });
    s.anchor(-2, 35, 8);

    // Left: rooftops linked by a wobbly plank, or a very long jump.
    bld(s, -HW, -8, 6, 30, 5);
    s.box(-14, -13, 30, 40, 4.7, 5, { color: 0xb0814f });
    bld(s, -HW, -8, 40, 60, 3.5);
    bld(s, -HW, -8, 63, 84, 6);
    s.item(-13, 50, 3.5);
    s.item(-13, 18, 5);

    // Right: a tall block with an outside staircase up to the high road.
    bld(s, 12, HW, 0, 27, 12);
    bld(s, 12, HW, 43, 84, 10);
    for (let i = 0; i < 20; i++) {
      s.box(9, 12, 46 + i * 0.8, 46 + (i + 1) * 0.8, 0, 0.5 * (i + 1), { color: 0x8c95a8, top: 0xb3bccc });
    }
    s.box(9, 12, 62, 64, 0, 10, { color: 0x8c95a8, top: 0xb3bccc });
    s.anchor(15, 52, 13);

    for (const x of [-4, 0, 4]) s.item(x, 52);
    zebra(s, 76);
    bunting(s, 12, 16.5);
    bunting(s, 70, 16.5);
    crate(s, -2, 66);
    crate(s, -3.2, 66);
    crate(s, 2, 74);

    s.route([
      [6, 0, 10],
      [8, 0.5, 28],
      [8, 0.5, 42],
      [2, 0, 60],
      [0, 0, 84],
    ]);
    s.route([
      [-12, 0, 2],
      [-13.5, 5, 10],
      [-13.5, 5, 29],
      [-13.5, 5, 39.5],
      [-13, 3.5, 50],
      [-13, 6, 70],
      [-10, 0, 84],
    ]);
    s.route([
      [6, 0, 10],
      [8, 0.5, 30],
      [8, 0.5, 42],
      [10.5, 0, 45],
      [10.5, 10, 62],
      [15, 10, 70],
      [15, 10, 84],
    ]);
    s.checkpoint();
  });
}

function buildingSite(lb: LevelBuilder) {
  lb.straight(84, (s) => {
    ground(s, 0, 84, DIRT);
    facade(s, -1, 0, 84);
    facade(s, 1, 0, 84);

    // High road: scaffold off the staircase block, then container stacks.
    s.box(10, HW, 0, 12, 9.6, 10, { color: 0xd8a03a, sides: 'planks', topSurface: 'planks' });
    for (const [x, d] of [
      [10.3, 0.3],
      [10.3, 11.7],
      [17.7, 11.7],
    ]) {
      s.box(x - 0.2, x + 0.2, d - 0.2, d + 0.2, 0, 9.6, { color: 0x8c95a8 });
    }
    strut(s, [10.3, 0.5, 0.3], [10.3, 9.4, 11.7], 0.06, 0x8c95a8);
    strut(s, [10.3, 0.5, 11.7], [17.7, 9.4, 11.7], 0.06, 0x8c95a8);
    container(s, 10, 15, 16, 22, 3);
    container(s, 9, 14, 26, 32, 2);
    container(s, 9, 14, 36, 42, 2);
    container(s, 9, 14, 46, 52, 3);
    container(s, 9, 14, 56, 62, 2);
    container(s, 9, 14, 66, 72, 1);
    s.item(12.5, 19, 7.8);
    bouncePad(s, 4, 7, 43, 46, 0.6);

    // Ground: pipes to hurdle and a container wall with one gap.
    s.box(-HW, 6, 12, 13, 0, 1, { color: 0x9aa3b5, top: 0xc9d1e0 });
    container(s, -HW, 0, 36, 39, 1);
    container(s, 6, 9, 36, 39, 1);
    for (const x of [-10, -4, 2]) s.item(x, 22);

    // Crane with grapple points hanging off the jib.
    const craneYellow = 0xf2b134;
    s.box(-2, 0, 44, 46, 0, 22, { color: 0, hidden: true });
    s.box(-2.6, 0.6, 43.4, 46.6, 0, 0.8, deco(0xb7b0a6, { sides: 'stone' }));
    lattice(s, -2, 0, 44, 46, 0.8, 20, craneYellow, 2.4);
    s.box(-2.2, 0.2, 43.8, 46.2, 20, 22, deco(craneYellow, { sides: 'corrugated' }));
    s.box(-0.4, 1.2, 45.2, 46.6, 20.4, 21.8, deco(0x6fb7e0));
    s.box(-14, 14, 44.6, 44.75, 20.2, 20.35, deco(craneYellow));
    s.box(-14, 14, 45.25, 45.4, 20.2, 20.35, deco(craneYellow));
    s.box(-14, 14, 44.9, 45.1, 21.6, 21.75, deco(craneYellow));
    for (let x = -14; x < 14; x += 1.4) {
      strut(s, [x, 20.3, 44.7], [x + 0.7, 21.65, 45], 0.05, craneYellow);
      strut(s, [x + 0.7, 21.65, 45], [x + 1.4, 20.3, 44.7], 0.05, craneYellow);
      strut(s, [x, 20.3, 45.3], [x + 0.7, 21.65, 45], 0.05, craneYellow);
      strut(s, [x + 0.7, 21.65, 45], [x + 1.4, 20.3, 45.3], 0.05, craneYellow);
    }
    s.box(10, 14.5, 44.3, 45.7, 18.8, 20.2, deco(0x9a948c, { sides: 'stone' }));
    for (const x of [-10, 8]) {
      strut(s, [x, 20.2, 45], [x, 12.8, 45], 0.04, INK);
      s.anchor(x, 45, 12);
    }

    // Left: bounce up onto stacks, then through a half-built tower.
    bouncePad(s, -6, -3, 24, 27, 0.6);
    container(s, -12, -7, 28, 34, 3);
    container(s, -12, -7, 38, 44, 2);
    for (const y of [3.5, 7]) s.box(-HW, -4, 48, 76, y - 0.4, y, { color: 0xcfc8bc, top: 0xe0dad0 });
    for (const [x, d] of [
      [-17.5, 48.5],
      [-4.5, 48.5],
      [-17.5, 75.5],
      [-4.5, 75.5],
      [-11, 62],
    ]) {
      s.box(x - 0.5, x + 0.5, d - 0.5, d + 0.5, 0, 6.6, { color: 0xb7b0a6 });
    }
    s.item(-10, 62, 7);
    s.item(-12, 58, 3.5);

    s.route([
      [0, 0, 6],
      [-4, 0, 12],
      [-6, 0, 24],
      [3, 0, 37.5],
      [3, 0, 48],
      [-8, 0, 64],
      [-6, 0, 84],
    ]);
    s.route([
      [14, 10, 4],
      [13, 10, 11],
      [12, 7.8, 19],
      [11.5, 5.2, 29],
      [11.5, 5.2, 39],
      [11.5, 7.8, 49],
      [11.5, 5.2, 59],
      [11.5, 2.6, 69],
      [6, 0, 84],
    ]);
    s.route([
      [-4, 0, 10],
      [-4.5, 0, 25.5],
      [-9.5, 7.8, 31],
      [-9.5, 5.2, 41],
      [-8, 7, 56],
      [-8, 7, 74],
      [-8, 0, 84],
    ]);
    s.checkpoint();
  });
}

function park(lb: LevelBuilder) {
  lb.turn(-1, (s) => {
    // Ground with a pond cut out of the inside corner.
    const pond = { x0: 4, x1: 16, d0: 2, d1: 14 };
    s.box(-HW - WALL, pond.x0, 0, W + WALL, -1, 0, flat(GRASS, 'grass'));
    s.box(pond.x1, HW, 0, W + WALL, -1, 0, flat(GRASS, 'grass'));
    s.box(pond.x0, pond.x1, pond.d1, W + WALL, -1, 0, flat(GRASS, 'grass'));
    s.box(pond.x0, pond.x1, 0, pond.d0, -1, 0, flat(GRASS, 'grass'));
    s.box(pond.x0, pond.x1, pond.d0, pond.d1, -4, -3, flat(STONE));
    s.water(pond.x0 + 0.35, pond.x1 - 0.35, pond.d0 + 0.35, pond.d1 - 0.35, -1.3);
    // Stone banks hide the thin edge of the lawn.
    for (const [x0, x1, d0, d1] of [
      [pond.x0, pond.x1, pond.d0, pond.d0 + 0.35],
      [pond.x0, pond.x1, pond.d1 - 0.35, pond.d1],
      [pond.x0, pond.x0 + 0.35, pond.d0, pond.d1],
      [pond.x1 - 0.35, pond.x1, pond.d0, pond.d1],
    ]) {
      s.box(x0, x1, d0, d1, -1.6, 0.08, deco(STONE, { sides: 'stone', top: 0xe2d8ca }));
    }
    lilyPads(s, pond.x0, pond.x1, pond.d0, pond.d1, -1.3, 9);
    for (const [x, d] of [
      [6, 4],
      [9, 6.5],
      [12, 9],
      [14.5, 12],
    ]) {
      s.box(x - 0.8, x + 0.8, d - 0.8, d + 0.8, -3, 0.3, { color: STONE, top: 0xe2d8ca, sides: 'stone' });
      foamRing(s, x, d, -1.3, 1.15);
    }

    facadeSpan(s, -HW - WALL, -HW, 0, W, [1, 0]);
    facadeSpan(s, -HW - WALL, HW + WALL, W, W + WALL, [0, -1], true);

    // Bouncy castle.
    bouncePad(s, -8, 0, 14, 22, 2, 0xffd86b);
    for (const [x, d] of [
      [-8, 14],
      [0, 14],
      [-8, 22],
      [0, 22],
    ]) {
      s.box(x - 0.6, x + 0.6, d - 0.6, d + 0.6, 0, 3.5, deco(0x7cc4ff));
      s.decor(new THREE.ConeGeometry(0.75, 1.1, 12), x, 4.05, d, 0xff5a5f);
    }

    for (const [x, d] of [
      [-12, 6],
      [-13, 28],
      [-4, 30],
      [8, 28],
    ]) {
      tree(s, x, d);
    }
    for (const [x, d, r] of [
      [-16, 10, 1.1],
      [-15, 22, 0.9],
      [-10, 33, 1.0],
      [2, 33, 0.8],
      [14, 31, 1.1],
      [17, 3, 0.8],
      [3, 1.5, 0.7],
    ]) {
      bush(s, x, d, r);
    }
    s.item(-4, 6);
    s.item(10, 20);
    s.item(-12, 18, 0);

    s.route([
      [-2, 0, 8],
      [3, 0, 17],
      [18, 0, 18],
    ]);
    s.route([
      [5, 0, 1],
      [6, 0.3, 4],
      [9, 0.3, 6.5],
      [12, 0.3, 9],
      [14.5, 0.3, 12],
      [18, 0, 18],
    ]);
    s.checkpoint();
  });
}

function finishBoulevard(lb: LevelBuilder) {
  lb.straight(98, (s) => {
    street(s, 0, 8);
    street(s, 18, 98);
    // Cross street: open to the sides, with invisible walls so nobody wanders off.
    s.box(-HW - 60, HW + 60, 8, 18, -1, 0, flat(ASPHALT, 'asphalt'));
    for (let x = -HW - 50; x < HW + 50; x += 7) s.box(x, x + 3, 12.85, 13.15, 0, 0.02, deco(WHITE, { bevel: false }));
    s.box(-HW - 1, -HW, 8, 18, 0, 30, { color: 0, hidden: true });
    s.box(HW, HW + 1, 8, 18, 0, 30, { color: 0, hidden: true });
    facadeSpan(s, -HW - 60, -HW - WALL, 18, 26, [0, -1], true);
    facadeSpan(s, HW + WALL, HW + 60, 18, 26, [0, -1], true);
    facadeSpan(s, -HW - 60, -HW - WALL, 0, 8, [0, 1], true);
    facadeSpan(s, HW + WALL, HW + 60, 0, 8, [0, 1], true);
    facade(s, -1, 18, 98);
    facade(s, 1, 18, 98);
    s.carLane(11, 15, 26, 0xff5050);
    s.carLane(15, 13, 31, 0x2f8fd8, true);

    // Footbridge over the traffic.
    const towerStyle: Style = { color: 0xc4775a, top: 0xc98b55, sides: 'brick', topSurface: 'planks' };
    s.box(-4, 4, 4, 6, 0, 5, towerStyle);
    s.box(-4, 4, 6, 20, 4.6, 5, { color: 0x3f7fa8, top: 0xc98b55, topSurface: 'planks' });
    s.box(-4, 4, 20, 22, 0, 5, towerStyle);
    s.box(-4.2, 4.2, 6, 20, 4.2, 4.6, deco(0x335f80));
    for (const x of [-3.9, 3.9]) {
      s.box(x - 0.06, x + 0.06, 6, 20, 5.85, 5.95, deco(0x335f80));
      for (let d = 6.5; d < 20; d += 1) s.box(x - 0.04, x + 0.04, d - 0.04, d + 0.04, 5, 5.9, deco(0x335f80));
    }

    // Left rooftops climbing towards the finish.
    bld(s, -HW, -8, 24, 38, 6);
    bld(s, -HW, -8, 42, 56, 8);
    bld(s, -HW, -8, 60, 72, 10);
    bld(s, -HW, -8, 75, 82, 5);
    s.item(-13, 30, 6);

    // Right: awnings, a rooftop run and a billboard grapple point.
    bld(s, 10, HW, 22, 50, 10);
    bld(s, 10, HW, 54, 76, 8);
    bouncePad(s, 7, 10, 30, 34, 1.2);
    s.box(15, 16, 38, 42, 10, 15, { color: METAL, sides: 'corrugated' });
    s.box(12.1, 17.9, 39.5, 40.5, 11.6, 15.4, deco(0xf3ead8));
    s.poster('billboard', 15, 13.5, 39.49, [0, -1], 5.4, 3.6);
    s.poster('billboard', 15, 13.5, 40.51, [0, 1], 5.4, 3.6);
    s.box(12.1, 17.9, 39.2, 40.8, 11.4, 11.6, deco(METAL));
    for (const x of [12.8, 15, 17.2]) s.decor(new THREE.ConeGeometry(0.25, 0.3, 8).rotateX(Math.PI), x, 15.6, 39.3, 0xfff2c0);
    s.anchor(-2, 40, 11);
    s.item(14, 64, 8);
    for (const x of [-5, 0, 5]) s.item(x, 30);
    crate(s, -2, 50);
    crate(s, 3, 58);
    crate(s, 3, 58, 1.2);

    arch(s, 86, WHITE, INK);
    for (let x = -HW; x < HW; x += 2) {
      s.box(x, x + 1, 85.5, 86.5, 0, 0.03, deco(INK, { bevel: false }));
      s.box(x + 1, x + 2, 85.5, 86.5, 0, 0.03, deco(WHITE, { bevel: false }));
    }
    bunting(s, 40, 14);
    bunting(s, 66, 14);
    bunting(s, 90, 12);
    bld(s, -HW - WALL, HW + WALL, 98, 106, 20, { color: 0xeba9c4, front: [0, -1], tall: true });
    ground(s, 98, 106);

    s.route([
      [0, 0, 3],
      [6, 0, 25],
      [-2, 0, 50],
      [0, 0, 86],
    ]);
    s.route([
      [0, 0, 2],
      [0, 5, 7],
      [0, 5, 19],
      [-12, 6, 27],
      [-12, 8, 46],
      [-12, 10, 64],
      [-12, 5, 78],
      [-6, 0, 86],
    ]);
    s.route([
      [5, 0, 24],
      [8.5, 1.2, 31],
      [14, 10, 36],
      [14, 10, 48],
      [14, 8, 62],
      [8, 0, 86],
    ]);
    s.checkpoint(86);
  });
}

export function buildCity(): Level {
  const lb = new LevelBuilder();
  highStreet(lb);
  fountainSquare(lb);
  canalStreet(lb);
  buildingSite(lb);
  park(lb);
  finishBoulevard(lb);
  skyline(lb);
  return lb.build();
}
