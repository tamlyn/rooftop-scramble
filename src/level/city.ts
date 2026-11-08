import * as THREE from 'three';
import { LevelBuilder, type Level, type Section, type Style } from './builder';
import { SECTION_WIDTH } from '../config';

const W = SECTION_WIDTH;
const HW = W / 2;
const WALL = 8;

const ASPHALT = 0x5f6478;
const SIDEWALK = 0xd9d0c1;
const PAVING = 0xe8d9bd;
const DIRT = 0xc79a6b;
const GRASS = 0x8fd16a;
const STONE = 0xb7b0a6;
const WATER = 0x3fa9e0;
const WHITE = 0xfff6e0;
const BOUNCE = 0xff5fa2;

const COLOURS = [0xff8a7a, 0x7fdcc0, 0x7cc4ff, 0xffd86b, 0xc3a6f0, 0xffb38a, 0x3cc9b5, 0xff9ec7, 0xa8e06b];
const CONTAINER_COLOURS = [0xe8553e, 0x2f8fd8, 0x3cb371, 0xf2b134, 0x8a5cd6];

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
  return new THREE.Color(color).lerp(new THREE.Color(0x6e6a80), 0.45).getHex();
}

function building(color: number): Style {
  return { color, top: roofOf(color), windows: true };
}

const flat = (color: number): Style => ({ color, outline: false });

function bld(s: Section, x0: number, x1: number, d0: number, d1: number, h: number, color = pick(COLOURS)) {
  s.box(x0, x1, d0, d1, 0, h, building(color));
  // Roof trim is decoration only so it never blocks a ledge grab.
  s.box(x0 - 0.15, x1 + 0.15, d0 - 0.15, d1 + 0.15, h - 0.35, h - 0.05, { color: roofOf(roofOf(color)), collide: false });
}

function ground(s: Section, d0: number, d1: number, color = ASPHALT) {
  s.box(-HW - WALL, HW + WALL, d0, d1, -1, 0, flat(color));
}

function street(s: Section, d0: number, d1: number) {
  ground(s, d0, d1);
  s.box(-HW, -HW + 3, d0, d1, 0, 0.2, flat(SIDEWALK));
  s.box(HW - 3, HW, d0, d1, 0, 0.2, flat(SIDEWALK));
  for (let d = d0 + 2; d < d1 - 3; d += 7) s.box(-0.15, 0.15, d, d + 3, 0, 0.02, { color: WHITE, outline: false, collide: false });
}

/** Tall boundary buildings. Too high to climb, so they keep everyone on the course. */
function facade(s: Section, side: -1 | 1, d0: number, d1: number) {
  const x0 = side < 0 ? -HW - WALL : HW;
  const x1 = side < 0 ? -HW : HW + WALL;
  facadeSpan(s, x0, x1, d0, d1);
}

function facadeSpan(s: Section, x0: number, x1: number, d0: number, d1: number, alongX = false) {
  let at = alongX ? x0 : d0;
  const end = alongX ? x1 : d1;
  while (at < end - 0.01) {
    const len = Math.min(end - at, 9 + rand() * 9);
    const h = 17 + Math.floor(rand() * 4) * 3.2;
    if (alongX) bld(s, at, at + len, d0, d1, h);
    else bld(s, x0, x1, at, at + len, h);
    at += len;
  }
}

function crate(s: Section, x: number, d: number, y = 0, size = 1.2) {
  s.box(x - size / 2, x + size / 2, d - size / 2, d + size / 2, y, y + size, { color: 0xd49a5a, top: 0xe8b77d });
}

function container(s: Section, x0: number, x1: number, d0: number, d1: number, levels: number) {
  for (let i = 0; i < levels; i++) s.box(x0, x1, d0, d1, i * 2.6, (i + 1) * 2.6, { color: pick(CONTAINER_COLOURS) });
}

function bouncePad(s: Section, x0: number, x1: number, d0: number, d1: number, h: number, base = 0xffffff) {
  s.box(x0, x1, d0, d1, 0, h - 0.3, { color: base });
  s.box(x0, x1, d0, d1, h - 0.3, h, { color: BOUNCE, kind: 'bounce' });
}

function tree(s: Section, x: number, d: number, y = 0) {
  s.box(x - 0.3, x + 0.3, d - 0.3, d + 0.3, y, y + 2.6, { color: 0x9b6a43 });
  s.decor(new THREE.IcosahedronGeometry(1.8, 1), x, y + 3.6, d, 0x5cbf5a);
}

function lamp(s: Section, x: number, d: number) {
  s.decor(new THREE.CylinderGeometry(0.12, 0.15, 5, 8), x, 2.5, d, 0x45506a);
  s.decor(new THREE.SphereGeometry(0.45, 12, 8), x, 5.2, d, 0xfff2a8);
}

function arch(s: Section, d: number, color: number, stripe: number) {
  s.box(-HW + 3, -HW + 4, d - 0.5, d + 0.5, 0, 7, { color, collide: false });
  s.box(HW - 4, HW - 3, d - 0.5, d + 0.5, 0, 7, { color, collide: false });
  s.box(-HW + 3, HW - 3, d - 0.3, d + 0.3, 7, 8.6, { color, collide: false });
  for (let x = -HW + 3; x < HW - 3; x += 2) s.box(x, x + 1, d - 0.35, d + 0.35, 7, 8.6, { color: stripe, collide: false, outline: false });
}

function pigeonStatue(s: Section, x: number, y: number, d: number) {
  const grey = 0x9aa3b5;
  s.decor(new THREE.SphereGeometry(1.1, 16, 12).scale(1, 0.9, 1.4), x, y + 1.1, d, grey);
  s.decor(new THREE.SphereGeometry(0.65, 16, 12), x, y + 2.3, d - 1.0, grey);
  s.decor(new THREE.ConeGeometry(0.22, 0.6, 8).rotateX(-Math.PI / 2), x, y + 2.25, d - 1.75, 0xffb347);
  s.decor(new THREE.SphereGeometry(0.16, 8, 6), x - 0.38, y + 2.45, d - 1.45, 0xffffff, false);
  s.decor(new THREE.SphereGeometry(0.16, 8, 6), x + 0.38, y + 2.45, d - 1.45, 0xffffff, false);
}

function highStreet(lb: LevelBuilder) {
  lb.straight(84, (s) => {
    ground(s, -12, 0);
    street(s, 0, 84);
    s.box(-HW - WALL, HW + WALL, -12, -4, 0, 20, building(0xc3a6f0));
    facade(s, -1, -4, 84);
    facade(s, 1, -4, 84);
    arch(s, 1, 0xffffff, 0x2a2238);
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
    s.box(-3, 3, 38, 50, 0, 3.2, { color: 0xffb627, top: 0xf0f0f0, windows: true });
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
    s.box(-HW, HW + WALL, 0, W + WALL, -1, 0, flat(PAVING));
    facadeSpan(s, HW, HW + WALL, 0, W);
    facadeSpan(s, -HW - WALL, HW + WALL, W, W + WALL, true);

    s.box(-4, 4, 14, 22, 0, 0.8, { color: STONE, top: WATER });
    s.box(-1.5, 1.5, 17, 20, 0.8, 4.8, { color: STONE, top: 0xd8d2c8 });
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
    s.box(-HW - WALL, HW + WALL, 29, 30, -4, 0.15, flat(STONE));
    s.box(-HW - WALL, HW + WALL, 40, 41, -4, 0.15, flat(STONE));
    s.box(-HW - WALL, HW + WALL, 30, 40, -5, -4, flat(STONE));
    s.box(-HW - WALL, HW + WALL, 30, 40, -4, -1.3, { color: WATER, outline: false, collide: false });

    // Street bridge.
    s.box(4, 12, 27, 43, -0.6, 0.5, { color: STONE, top: 0xcfc8bc });
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
    s.box(10, HW, 0, 12, 9.6, 10, { color: 0xd8a03a });
    for (const [x, d] of [
      [10.3, 0.3],
      [10.3, 11.7],
      [17.7, 11.7],
    ]) {
      s.box(x - 0.2, x + 0.2, d - 0.2, d + 0.2, 0, 9.6, { color: 0x8c95a8 });
    }
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
    s.box(-2, 0, 44, 46, 0, 22, { color: 0xf2b134 });
    s.box(-14, 14, 44.5, 45.5, 20, 21, { color: 0xf2b134, collide: false });
    s.anchor(-10, 45, 12);
    s.anchor(8, 45, 12);

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
    s.box(-HW - WALL, pond.x0, 0, W + WALL, -1, 0, flat(GRASS));
    s.box(pond.x1, HW, 0, W + WALL, -1, 0, flat(GRASS));
    s.box(pond.x0, pond.x1, pond.d1, W + WALL, -1, 0, flat(GRASS));
    s.box(pond.x0, pond.x1, 0, pond.d0, -1, 0, flat(GRASS));
    s.box(pond.x0, pond.x1, pond.d0, pond.d1, -4, -3, flat(STONE));
    s.box(pond.x0, pond.x1, pond.d0, pond.d1, -3, -1.3, { color: WATER, outline: false, collide: false });
    for (const [x, d] of [
      [6, 4],
      [9, 6.5],
      [12, 9],
      [14.5, 12],
    ]) {
      s.box(x - 0.8, x + 0.8, d - 0.8, d + 0.8, -3, 0.3, { color: STONE, top: 0xd8d2c8 });
    }

    facadeSpan(s, -HW - WALL, -HW, 0, W);
    facadeSpan(s, -HW - WALL, HW + WALL, W, W + WALL, true);

    // Bouncy castle.
    bouncePad(s, -8, 0, 14, 22, 2, 0xffd86b);
    for (const [x, d] of [
      [-8, 14],
      [0, 14],
      [-8, 22],
      [0, 22],
    ]) {
      s.box(x - 0.6, x + 0.6, d - 0.6, d + 0.6, 0, 3.5, { color: 0x7cc4ff, collide: false });
    }

    for (const [x, d] of [
      [-12, 6],
      [-13, 28],
      [-4, 30],
      [8, 28],
    ]) {
      tree(s, x, d);
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
    s.box(-HW - 60, HW + 60, 8, 18, -1, 0, flat(ASPHALT));
    for (let x = -HW - 50; x < HW + 50; x += 7) s.box(x, x + 3, 12.85, 13.15, 0, 0.02, { color: WHITE, outline: false, collide: false });
    s.box(-HW - 1, -HW, 8, 18, 0, 30, { color: 0, hidden: true });
    s.box(HW, HW + 1, 8, 18, 0, 30, { color: 0, hidden: true });
    s.box(-HW - 60, -HW - WALL, 18, 26, 0, 20, building(0xffb38a));
    s.box(HW + WALL, HW + 60, 18, 26, 0, 20, building(0x7fdcc0));
    facadeSpan(s, -HW - 60, -HW - WALL, 0, 8, true);
    facadeSpan(s, HW + WALL, HW + 60, 0, 8, true);
    facade(s, -1, 18, 98);
    facade(s, 1, 18, 98);
    s.carLane(11, 15, 26, 0xff5050);
    s.carLane(15, 13, 31, 0x2f8fd8, true);

    // Footbridge over the traffic.
    s.box(-4, 4, 4, 6, 0, 5, { color: 0x8c95a8, top: 0xb3bccc });
    s.box(-4, 4, 6, 20, 4.6, 5, { color: 0x8c95a8, top: 0xb3bccc });
    s.box(-4, 4, 20, 22, 0, 5, { color: 0x8c95a8, top: 0xb3bccc });

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
    s.box(15, 16, 38, 42, 10, 15, { color: 0x45506a });
    s.box(12, 18, 39.5, 40.5, 12, 15, { color: 0xffd86b, collide: false });
    s.anchor(-2, 40, 11);
    s.item(14, 64, 8);
    for (const x of [-5, 0, 5]) s.item(x, 30);
    crate(s, -2, 50);
    crate(s, 3, 58);
    crate(s, 3, 58, 1.2);

    arch(s, 86, 0xffffff, 0x2a2238);
    for (let x = -HW; x < HW; x += 2) {
      s.box(x, x + 1, 85.5, 86.5, 0, 0.03, { color: 0x222222, outline: false, collide: false });
      s.box(x + 1, x + 2, 85.5, 86.5, 0, 0.03, { color: 0xffffff, outline: false, collide: false });
    }
    s.box(-HW - WALL, HW + WALL, 98, 106, 0, 20, building(0xff9ec7));
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
  return lb.build();
}
