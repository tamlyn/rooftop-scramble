import * as THREE from 'three';
import { LevelBuilder, type Level, type Section } from './builder';
import { addClouds } from './clouds';
import { BOUNCE, INK, WHITE, arch, deco, finishLine, lighten, random, reseed, darken } from './town';

/**
 * Sky Circuit: a toy obstacle course floating above the clouds. There's no ground at all, so the fastest line is
 * whichever one dares the narrow beams, the climbing walls and the long drops.
 */

const KILL_HEIGHT = -14;
const RAINBOW = [0xff5a5f, 0xff9f43, 0xffd23f, 0x5fd068, 0x4fa8ff, 0x9b6bff];
const THICKNESS = 1.2;

/** A downward-pointing, darkening wedge under a floating block, so it reads as an island rather than a slab. */
function underside(s: Section, x0: number, x1: number, d0: number, d1: number, y: number, color: number) {
  const depth = Math.min(6, 1 + Math.max(x1 - x0, d1 - d0) * 0.25);
  const g = new THREE.ConeGeometry(Math.SQRT1_2, depth, 4, 1).rotateY(Math.PI / 4).rotateX(Math.PI).toNonIndexed();
  g.scale((x1 - x0) * 0.92, 1, (d1 - d0) * 0.92);
  const p = g.attributes.position;
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const k = 0.45 + 0.55 * (p.getY(i) / depth + 0.5);
    colors.set([k, k, k], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  s.decor(g, (x0 + x1) / 2, y - THICKNESS - depth / 2, (d0 + d1) / 2, color);
}

/** A floating block whose top is at `y`. */
function pad(s: Section, x0: number, x1: number, d0: number, d1: number, y: number, color: number, under = true) {
  s.box(x0, x1, d0, d1, y - THICKNESS, y, { color, top: lighten(color, 0.35) });
  if (under) underside(s, x0, x1, d0, d1, y, darken(color, 0.15));
}

/** A striped rainbow deck running along d. */
function rainbow(s: Section, x0: number, x1: number, d0: number, d1: number, y: number) {
  s.box(x0, x1, d0, d1, y - THICKNESS, y, { color: 0, hidden: true });
  const w = (x1 - x0) / RAINBOW.length;
  RAINBOW.forEach((color, i) => {
    s.box(x0 + i * w, x0 + (i + 1) * w, d0, d1, y - THICKNESS, y, deco(color, { top: lighten(color, 0.25) }));
  });
  underside(s, x0, x1, d0, d1, y, 0xe8e0ff);
}

/** A rainbow deck running along x, for crossings and the turn. */
function rainbowAcross(s: Section, x0: number, x1: number, d0: number, d1: number, y: number) {
  s.box(x0, x1, d0, d1, y - THICKNESS, y, { color: 0, hidden: true });
  const w = (d1 - d0) / RAINBOW.length;
  RAINBOW.forEach((color, i) => {
    s.box(x0, x1, d0 + i * w, d0 + (i + 1) * w, y - THICKNESS, y, deco(color, { top: lighten(color, 0.25) }));
  });
  underside(s, x0, x1, d0, d1, y, 0xe8e0ff);
}

/** A sheer block to climb, banded so its height is easy to judge. */
function wall(s: Section, x0: number, x1: number, d0: number, d1: number, y0: number, y1: number, color: number) {
  s.box(x0, x1, d0, d1, y0, y1, { color, top: lighten(color, 0.4) });
  for (let y = y0 + 1; y < y1 - 0.3; y += 1) s.box(x0 - 0.05, x1 + 0.05, d0 - 0.05, d1 + 0.05, y - 0.08, y + 0.08, deco(lighten(color, 0.5), { bevel: false }));
}

function bouncer(s: Section, x0: number, x1: number, d0: number, d1: number, y: number) {
  s.box(x0, x1, d0, d1, y, y + 0.7, { color: WHITE });
  s.box(x0 + 0.15, x1 - 0.15, d0 + 0.15, d1 - 0.15, y + 0.7, y + 1, { color: BOUNCE, kind: 'bounce' });
}

/** Spinning-top shaped stepping stone. */
function stone(s: Section, x: number, d: number, y: number, r: number, color: number) {
  pad(s, x - r, x + r, d - r, d + r, y, color);
}

/** Floating gems for decoration, kept clear of the course. */
function gems(s: Section, count: number, y0: number, y1: number) {
  for (let i = 0; i < count; i++) {
    const side = random() < 0.5 ? -1 : 1;
    const x = side * (20 + random() * 25);
    const d = random() * s.length;
    const color = RAINBOW[Math.floor(random() * RAINBOW.length)];
    const g = new THREE.OctahedronGeometry(0.6 + random() * 0.9).scale(1, 1.4, 1).rotateY(random() * 3);
    s.decor(g, x, y0 + random() * (y1 - y0), d, color);
  }
}

/** Far-off islands, for a sense of a wider sky world. `sides` keeps them clear of later sections. */
function islands(s: Section, count: number, sides: number[] = [-1, 1]) {
  for (let i = 0; i < count; i++) {
    const side = sides[Math.floor(random() * sides.length)];
    const x = side * (60 + random() * 80);
    const d = random() * s.length;
    const r = 4 + random() * 8;
    const y = -10 + random() * 40;
    const color = RAINBOW[Math.floor(random() * RAINBOW.length)];
    s.box(x - r, x + r, d - r, d + r, y - 2, y, deco(lighten(color, 0.3), { top: 0x8fd36a, topSurface: 'grass' }));
    underside(s, x - r, x + r, d - r, d + r, y + THICKNESS - 2, darken(color, 0.1));
  }
}

function launch(lb: LevelBuilder) {
  lb.straight(96, (s) => {
    rainbow(s, -12, 12, -12, 16, 0);
    arch(s, 1, WHITE, INK, 0, 11);
    s.checkpoint(0, 0);
    for (const [x, d] of [
      [-6, 4],
      [0, 4],
      [6, 4],
      [-9, 8],
      [-3, 8],
      [3, 8],
    ]) {
      s.start(x, d, 0);
    }
    for (const x of [-7, 0, 7]) s.item(x, 13);

    // Three ways over the first void: a narrow beam, stepping stones, or a wide deck with a wall in the way.
    pad(s, -12, -10.5, 20, 48, 0, 0xffd23f);
    for (const [d, y] of [
      [22, 0.5],
      [27.5, 1.5],
      [33, 2.5],
      [38.5, 1.5],
      [44, 0.5],
    ]) {
      stone(s, -1, d, y, 1.6, RAINBOW[Math.floor(d) % RAINBOW.length]);
    }
    rainbow(s, 5, 12, 20, 48, 0);
    wall(s, 5, 12, 32, 34, 0, 3.5, 0x4fa8ff);
    s.item(8.5, 26);
    s.item(-1, 33, 2.5);

    // A climbing wall across the whole course. Bounce pads at either end are the quick way up.
    rainbow(s, -12, 12, 50, 66, 0);
    wall(s, -12, 12, 66, 70, 0, 6, 0x9b6bff);
    bouncer(s, -11, -7, 60, 64, 0);
    bouncer(s, 7, 11, 60, 64, 0);
    s.item(0, 58);
    rainbow(s, -12, 12, 70, 96, 6);
    s.item(-6, 84, 6);
    s.item(6, 84, 6);
    s.anchor(0, 50, 7);

    gems(s, 14, -4, 16);
    islands(s, 3, [1]);

    s.route([
      [-11.25, 0, 16],
      [-11.25, 0, 30],
      [-11.25, 0, 46],
      [-9, 0, 56],
      [-9, 1, 62],
      [-9, 6, 74],
      [0, 6, 96],
    ]);
    s.route([
      [-1, 0.5, 22],
      [-1, 1.5, 27.5],
      [-1, 2.5, 33],
      [-1, 1.5, 38.5],
      [-1, 0.5, 44],
      [0, 0, 56],
      [0, 6, 72],
      [0, 6, 96],
    ]);
    s.route([
      [8.5, 0, 20],
      [8.5, 0, 30],
      [8.5, 3.5, 33],
      [8.5, 0, 46],
      [9, 0, 56],
      [9, 1, 62],
      [9, 6, 74],
      [0, 6, 96],
    ]);
    s.checkpoint(96, 6);
  });
}

function bend(lb: LevelBuilder) {
  lb.turn(1, (s) => {
    // The rainbow sweeps round the outside; the inside corner is a chain of hops that cuts the bend.
    rainbow(s, 6, 14, 0, 30, 6);
    rainbowAcross(s, -18, 14, 22, 30, 6);
    for (const [x, d, y] of [
      [0, 5, 6],
      [-5, 10, 7],
      [-10, 14, 7.5],
      [-15, 17, 7],
    ]) {
      stone(s, x, d, y, 1.7, RAINBOW[Math.abs(x) % RAINBOW.length]);
    }
    s.item(10, 14, 6);
    s.item(-6, 26, 6);
    s.anchor(-4, 4, 13);
    gems(s, 6, 0, 18);
    s.route([
      [10, 6, 6],
      [10, 6, 26],
      [-18, 6, 26],
    ]);
    s.route([
      [0, 6, 5],
      [-5, 7, 10],
      [-10, 7.5, 14],
      [-15, 7, 17],
      [-16, 6, 25],
    ]);
    s.checkpoint(undefined, 6);
  });
}

function gauntlet(lb: LevelBuilder) {
  lb.straight(96, (s) => {
    rainbow(s, -10, 10, 0, 18, 6);

    // A tower too tall to climb from a standstill: take a run at it, or wall-jump up the chimney in its middle.
    const tower = 0xff9f43;
    wall(s, -10, -1.5, 18, 30, 6, 13, tower);
    wall(s, 1.5, 10, 18, 30, 6, 13, tower);
    pad(s, -1.5, 1.5, 18, 30, 6, darken(tower, 0.2), false);
    s.box(-10, 10, 30, 34, 12, 13, { color: tower, top: lighten(tower, 0.4) });
    // Round the outside instead: beams either side.
    for (const side of [-1, 1]) {
      const [a, b] = side < 0 ? [-16.5, -14] : [14, 16.5];
      pad(s, a, b, 10, 34, 6, 0x5fd068);
      pad(s, side < 0 ? -16.5 : 10, side < 0 ? -10 : 16.5, 4, 10, 6, 0x5fd068, false);
    }
    s.item(0, 14, 6);

    // Off the high road with a long drop, then stepping stones up to the summit stairs.
    rainbow(s, -16.5, 16.5, 34, 50, 6);
    for (const x of [-6, 6]) {
      for (const [d, y] of [
        [55, 7],
        [60.5, 8],
        [66, 9],
      ]) {
        stone(s, x, d, y, 1.8, RAINBOW[(Math.abs(x) + d) % RAINBOW.length]);
      }
    }
    s.anchor(0, 60, 15);
    s.anchor(0, 76, 18);
    s.item(-6, 44, 6);
    s.item(6, 44, 6);

    for (let i = 0; i < 5; i++) {
      const y = 10 + i * 1.5;
      pad(s, -10, 10, 71 + i * 3, 74 + i * 3, y, RAINBOW[i], i === 0);
    }
    rainbow(s, -10, 10, 86, 96, 16);
    gems(s, 16, 0, 26);
    islands(s, 3);

    const summit: [number, number, number][] = [
      [-6, 7, 55],
      [-6, 8, 60.5],
      [-6, 9, 66],
      [-6, 10, 72.5],
      [-4, 16, 88],
      [0, 16, 96],
    ];
    s.route([[-13, 6, 7], [-15.25, 6, 12], [-15.25, 6, 33], [-8, 6, 44], ...summit]);
    s.route([[-5, 6, 14], [-5, 13, 20], [-5, 13, 33], [-6, 6, 44], ...summit]);
    s.route([[13, 6, 7], [15.25, 6, 12], [15.25, 6, 33], [8, 6, 44], ...summit.map(([x, y, d]): [number, number, number] => [-x, y, d])]);
    s.checkpoint(96, 16);
  });
}

function finish(lb: LevelBuilder) {
  lb.straight(80, (s) => {
    // The drop: dive just before landing to roll out of it, or detour down the steps at the side.
    rainbow(s, -12, 12, 6, 80, 4);
    s.box(-18, 12, 0, 1, 15, 16, { color: 0xff9f43, top: lighten(0xff9f43, 0.4) });
    for (let i = 0; i < 5; i++) {
      pad(s, -18, -13, 1 + i * 2.4, 3.4 + i * 2.4, 13.8 - i * 2.2, RAINBOW[i], false);
    }
    s.anchor(0, 42, 14);
    for (const x of [-7, 0, 7]) s.item(x, 24, 4);
    arch(s, 66, WHITE, INK, 4, 11);
    finishLine(s, 66, 4, 12);
    gems(s, 10, 0, 22);

    s.route([
      [-15.5, 16, 0.5],
      [-15.5, 13.8, 2.2],
      [-15.5, 11.6, 4.6],
      [-15.5, 9.4, 7],
      [-15.5, 7.2, 9.4],
      [-15.5, 5, 11.8],
      [-9, 4, 16],
      [0, 4, 66],
    ]);
    s.checkpoint(66, 4);
  });
}

export function buildSky(): Level {
  reseed(23);
  const lb = new LevelBuilder();
  lb.killHeight = KILL_HEIGHT;
  launch(lb);
  bend(lb);
  gauntlet(lb);
  finish(lb);
  const level = lb.build();
  // A sea of cloud far below, and a few drifting overhead.
  addClouds(level, { count: 90, y: [-34, -22], margin: 140, scale: 2.2 });
  addClouds(level, { count: 25, y: [40, 70], margin: 100 });
  return level;
}
