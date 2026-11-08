import * as THREE from 'three';
import { LevelBuilder, type Level, type Section } from './builder';
import { addClouds } from './clouds';
import { BOUNCE, GRASS, INK, LEAF, METAL, WHITE, WOOD, arch, bld, deco, finishLine, foliage, neighbourhood, random, reseed, skyline, tree } from './town';

/**
 * Rooftop Run: the whole race happens on the roofs. The street is out of bounds, so every alley is a jump, and
 * the quickest lines climb walls, take the high roofs and dive across the widest gaps.
 */

/** Anyone below roof level has fallen into the street. */
const KILL_HEIGHT = 5;

const TAR = 0xa39e97;
const GRAVEL = 0xcfc4b3;

function roof(s: Section, x0: number, x1: number, d0: number, d1: number, h: number, color?: number) {
  bld(s, x0, x1, d0, d1, h, { allSides: true, color });
}

/** A low, solid air-conditioning unit to vault. */
function acUnit(s: Section, x: number, d: number, y: number, along = false) {
  const [hx, hd] = along ? [0.6, 0.85] : [0.85, 0.6];
  s.box(x - hx, x + hx, d - hd, d + hd, y, y + 1.1, { color: 0xd9dde6, sides: 'corrugated', top: 0xb8bfcc });
  s.decor(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 16), x, y + 1.13, d, INK);
}

function chimneyStack(s: Section, x: number, d: number, y: number) {
  s.box(x - 0.6, x + 0.6, d - 0.45, d + 0.45, y, y + 1.8, { color: 0xc4775a, sides: 'brick', top: 0x6b4a3a });
  for (const ox of [-0.3, 0.3]) s.decor(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 10), x + ox, y + 2.05, d, 0xd9734e);
}

/** A glass roof light, low enough to hop. */
function skylight(s: Section, x0: number, x1: number, d0: number, d1: number, y: number) {
  s.box(x0, x1, d0, d1, y, y + 0.45, { color: 0xe9e2d4, top: 0x8fc7e8 });
  s.box(x0 + 0.15, x1 - 0.15, d0 + 0.15, d1 - 0.15, y + 0.45, y + 0.5, deco(0xb5e0f5, { bevel: false }));
}

/** Rooftop stairwell: a small brick hut that's climbable from any side. */
function hut(s: Section, x0: number, x1: number, d0: number, d1: number, y: number, facing: [number, number]) {
  s.box(x0, x1, d0, d1, y, y + 2.8, { color: 0xc4775a, sides: 'brick', top: TAR });
  s.box(x0 - 0.15, x1 + 0.15, d0 - 0.15, d1 + 0.15, y + 2.8, y + 3.05, deco(0xe6e2dc));
  const [fx, fd] = facing;
  const x = fx > 0 ? x1 : fx < 0 ? x0 : (x0 + x1) / 2;
  const d = fd > 0 ? d1 : fd < 0 ? d0 : (d0 + d1) / 2;
  s.instance('door', x, y, d, facing, 0x3f7fa8);
  s.instance('doorFrame', x, y, d, facing, 0xe6e2dc);
}

/** A wooden water tower on stilts. The tank is a grapple anchor rather than a platform. */
function waterTower(s: Section, x: number, d: number, y: number) {
  for (const [lx, ld] of [
    [-0.9, -0.9],
    [0.9, -0.9],
    [-0.9, 0.9],
    [0.9, 0.9],
  ]) {
    s.decor(new THREE.CylinderGeometry(0.09, 0.09, 3, 6), x + lx, y + 1.5, d + ld, INK);
  }
  s.decor(new THREE.CylinderGeometry(1.4, 1.4, 2.6, 16), x, y + 4.3, d, WOOD);
  for (const ry of [3.3, 5.3]) s.decor(new THREE.TorusGeometry(1.42, 0.05, 4, 20).rotateX(Math.PI / 2), x, y + ry, d, INK);
  s.decor(new THREE.ConeGeometry(1.6, 1.1, 16), x, y + 6.15, d, 0x8a5a3c);
  s.anchor(x, d, y + 8);
}

/** Springy mattress raised on a frame, so you jump onto it rather than walking over it. */
function trampoline(s: Section, x0: number, x1: number, d0: number, d1: number, y: number) {
  s.box(x0, x1, d0, d1, y, y + 0.9, { color: 0x3f7fa8 });
  s.box(x0 + 0.1, x1 - 0.1, d0 + 0.1, d1 - 0.1, y + 0.9, y + 1.2, { color: BOUNCE, kind: 'bounce' });
}

/** Narrow scaffold boards across a gap: no jump needed, but no room to swerve either. */
function plank(s: Section, x0: number, x1: number, d0: number, d1: number, y: number) {
  s.box(x0, x1, d0, d1, y - 0.2, y, { color: WOOD, sides: 'planks', topSurface: 'planks' });
  const alongD = d1 - d0 > x1 - x0;
  for (const side of [0, 1]) {
    const x = alongD ? (side ? x1 : x0) : (x0 + x1) / 2;
    const d = alongD ? (d0 + d1) / 2 : side ? d1 : d0;
    const len = alongD ? d1 - d0 : x1 - x0;
    const rail = alongD ? new THREE.BoxGeometry(0.06, 0.06, len) : new THREE.BoxGeometry(len, 0.06, 0.06);
    s.decor(rail, x, y + 0.9, d, 0xe8553e);
  }
}

/** Washing strung across an alley, purely for looks. */
function washingLine(s: Section, x0: number, x1: number, d: number, y: number) {
  const len = x1 - x0;
  s.decor(new THREE.CylinderGeometry(0.015, 0.015, len, 4).rotateZ(Math.PI / 2), (x0 + x1) / 2, y, d, WHITE);
  const colors = [0xff5a5f, 0xffd23f, 0x7cc4ff, 0xffffff, 0x9ed9c5, 0xff9ec7];
  for (let x = x0 + 0.6; x < x1 - 0.6; x += 0.9 + random() * 0.6) {
    const w = 0.4 + random() * 0.35;
    const h = 0.5 + random() * 0.4;
    s.decor(new THREE.BoxGeometry(w, h, 0.03), x, y - h / 2, d, colors[Math.floor(random() * colors.length)]);
  }
}

/** Painted tar or gravel on top of a roof, so the running surface reads differently from the walls. */
function deck(s: Section, x0: number, x1: number, d0: number, d1: number, y: number, color = TAR) {
  s.box(x0 + 0.5, x1 - 0.5, d0 + 0.5, d1 - 0.5, y, y + 0.04, deco(color, { bevel: false, topSurface: 'asphalt' }));
}

/** An advertising hoarding standing in the street whose walkway is a stepping stone across it. */
function billboard(s: Section, x0: number, x1: number, d0: number, d1: number, y: number) {
  for (const x of [x0 + 0.6, x1 - 0.6]) s.box(x - 0.25, x + 0.25, d0 + 0.3, d0 + 0.8, 0, y, deco(METAL));
  s.box(x0, x1, d0, d1, y - 0.25, y, { color: METAL, top: 0x9aa3b5 });
  s.box(x0, x1, d0 + 0.4, d0 + 0.6, y + 0.4, y + 4, deco(0xf3ead8));
  s.poster('billboard', (x0 + x1) / 2, y + 2.2, d0 + 0.39, [0, -1], x1 - x0 - 0.4, (x1 - x0 - 0.4) / 1.5);
  s.poster('billboard', (x0 + x1) / 2, y + 2.2, d0 + 0.61, [0, 1], x1 - x0 - 0.4, (x1 - x0 - 0.4) / 1.5);
}

function launch(lb: LevelBuilder) {
  lb.straight(96, (s) => {
    // Start roof.
    roof(s, -14, 14, -12, 20, 12, 0xcfd8dc);
    deck(s, -14, 14, -12, 20, 12);
    arch(s, 1, WHITE, INK, 12, 12);
    s.checkpoint(0, 12);
    for (const [x, d] of [
      [-6, 4],
      [0, 4],
      [6, 4],
      [-9, 8],
      [-3, 8],
      [3, 8],
    ]) {
      s.start(x, d, 12);
    }
    chimneyStack(s, -11, -6, 12);
    acUnit(s, 11, 15, 12);
    for (const x of [-7, 0, 7]) s.item(x, 16, 12);
    washingLine(s, -14, 14, 22, 11);

    // Left: a run of roofs at about the same height, one alley at a time.
    roof(s, -14, -5, 24, 44, 12);
    acUnit(s, -9.5, 34, 12);
    roof(s, -14, -5, 48, 64, 11);
    chimneyStack(s, -11, 56, 11);
    s.item(-9.5, 52, 11);

    // Middle: a taller block. Jump at its wall from the start roof and climb, then run it end to end.
    roof(s, -3, 3, 24, 62, 16);
    deck(s, -3, 3, 24, 62, 16, GRAVEL);
    s.item(0, 44, 16);

    // Right: lower roofs and a trampoline that throws you up onto the far block.
    roof(s, 5, 14, 24, 40, 10);
    skylight(s, 8, 11, 29, 34, 10);
    roof(s, 5, 14, 44, 64, 10);
    trampoline(s, 7, 12, 57, 60.5, 10);
    s.item(9.5, 50, 10);

    // All routes meet on one wide roof.
    roof(s, -14, 14, 68, 94, 13);
    deck(s, -14, 14, 68, 94, 13);
    waterTower(s, -9, 84, 13);
    hut(s, 6, 10, 76, 80, 13, [-1, 0]);
    s.item(0, 80, 13);
    washingLine(s, -14, -5, 66, 15);

    s.route([
      [-9.5, 12, 20],
      [-9.5, 12, 30],
      [-11.5, 12, 40],
      [-9.5, 11, 50],
      [-8, 11, 62],
      [-6, 13, 72],
      [0, 13, 94],
    ]);
    s.route([
      [0, 12, 19],
      [0, 16, 26],
      [0, 16, 60],
      [0, 13, 72],
      [0, 13, 94],
    ]);
    s.route([
      [9.5, 12, 20],
      [9.5, 10, 26],
      [9.5, 10, 42],
      [9.5, 10, 52],
      [9.5, 11.2, 58.5],
      [9.5, 13, 72],
      [3, 13, 94],
    ]);
    s.checkpoint(96, 13);
  });
}

function corner(lb: LevelBuilder) {
  lb.turn(-1, (s) => {
    roof(s, -14, -1, 2, 17, 13);
    deck(s, -14, -1, 2, 17, 13, GRAVEL);
    chimneyStack(s, -8, 10, 13);

    // The inside corner: the quick way round, cluttered with skylights and air-con.
    roof(s, 3, 18, 2, 17, 12);
    deck(s, 3, 18, 2, 17, 12);
    skylight(s, 6, 9, 5, 9, 12);
    skylight(s, 12, 15, 5, 9, 12);
    acUnit(s, 8, 13, 12, true);
    acUnit(s, 14, 13.5, 12, true);
    s.item(10.5, 11, 12);

    roof(s, -14, -1, 21, 34, 14);
    // A roof garden on the outside of the bend.
    roof(s, 3, 18, 21, 34, 13);
    s.box(4, 17, 22, 33, 13, 13.3, { color: GRASS, top: GRASS, topSurface: 'grass' });
    tree(s, 7, 30, 13.3);
    tree(s, 14, 25, 13.3);
    s.decor(foliage(0.8), 10, 13.6, 23, LEAF);
    washingLine(s, -1, 3, 9, 15);

    s.route([
      [6, 12, 4],
      [10, 12, 10],
      [18, 12, 12],
    ]);
    s.checkpoint(undefined, 12);
  });
}

function bigRoad(lb: LevelBuilder) {
  lb.straight(92, (s) => {
    roof(s, -14, -4, 4, 26, 12);
    roof(s, 4, 14, 4, 26, 12);
    roof(s, -4, 4, 4, 16, 12);
    deck(s, -14, 14, 4, 26, 12);
    // A diving board: climb the tower and you can clear the road in one jump-and-dive.
    roof(s, -4, 4, 16, 26, 16);
    s.item(0, 10, 12);

    // The road: wide enough that a plain running jump falls short.
    s.road([-80, 29], [80, 29], 14, 24, 0xff5050);
    s.road([80, 35], [-80, 35], 12, 30, 0x2f8fd8);
    // Left: scaffold boards straight across. Right: a billboard to hop via.
    plank(s, -11.6, -10.4, 26, 38, 12);
    billboard(s, 6, 14, 30, 34, 12);
    s.anchor(0, 32, 20);

    roof(s, -14, 14, 38, 60, 12);
    deck(s, -14, 14, 38, 60, 12);
    acUnit(s, -6, 50, 12);
    acUnit(s, 6, 47, 12);
    chimneyStack(s, 0, 56, 12);
    for (const x of [-8, 0, 8]) s.item(x, 44, 12);

    // The far side climbs: straight up the tower, or a staircase of side roofs.
    roof(s, -6, 6, 64, 90, 18);
    deck(s, -6, 6, 64, 90, 18, GRAVEL);
    roof(s, -14, -8, 62, 74, 14);
    roof(s, -14, -8, 74, 90, 16);
    roof(s, 8, 14, 62, 90, 15);
    hut(s, 9, 13, 70, 73, 15, [0, -1]);
    s.item(-11, 68, 14);
    washingLine(s, -14, 14, 61, 15);

    s.route([
      [-11, 12, 20],
      [-11, 12, 27],
      [-11, 12, 37],
      [-11, 12, 56],
      [-11, 14, 66],
      [-11, 16, 78],
      [-4, 18, 84],
      [0, 18, 92],
    ]);
    s.route([
      [0, 12, 14],
      [0, 16, 20],
      [0, 16, 26],
      [0, 12, 44],
      [0, 12, 60],
      [0, 18, 66],
      [0, 18, 92],
    ]);
    s.route([
      [10, 12, 20],
      [10, 12, 30.5],
      [10, 12, 33.5],
      [10, 12, 42],
      [-11, 12, 58],
      [-11, 14, 66],
      [-11, 16, 78],
      [-4, 18, 84],
      [0, 18, 92],
    ]);
    s.checkpoint(92, 18);
  });
}

function roofGarden(lb: LevelBuilder) {
  lb.turn(1, (s) => {
    roof(s, -18, 14, 1, 34, 18, 0xf3e7cf);
    s.box(-17, 13, 2, 33, 18, 18.3, { color: GRASS, top: GRASS, topSurface: 'grass' });
    // A pond and planters to weave between.
    s.box(-6, 4, 12, 22, 18.3, 18.7, { color: 0, hidden: true });
    for (const [x0, x1, d0, d1] of [
      [-6, 4, 12, 12.4],
      [-6, 4, 21.6, 22],
      [-6, -5.6, 12.4, 21.6],
      [3.6, 4, 12.4, 21.6],
    ]) {
      s.box(x0, x1, d0, d1, 18.3, 18.8, deco(0xd6cbbd, { sides: 'stone', top: 0xe2d8ca }));
    }
    s.box(-5.6, 3.6, 12.4, 21.6, 18.3, 18.45, deco(0xd6cbbd, { bevel: false }));
    s.water(-5.6, 3.6, 12.4, 21.6, 18.62);
    for (const [x, d] of [
      [-12, 8],
      [8, 28],
      [-12, 28],
      [9, 8],
    ]) {
      tree(s, x, d, 18.3);
    }
    for (const [x, d] of [
      [-14, 18],
      [0, 28],
      [10, 18],
    ]) {
      s.box(x - 1, x + 1, d - 1, d + 1, 18.3, 19.1, { color: 0xd9734e, sides: 'brick', top: 0x7a4b3a });
      s.decor(foliage(0.9), x, 19.6, d, LEAF);
    }
    s.item(-4, 6, 18.3);
    s.item(4, 30, 18.3);
    s.route([
      [0, 18.3, 6],
      [-8, 18.3, 10],
      [-18, 18.3, 18],
    ]);
    s.checkpoint(undefined, 18.3);
  });
}

function finish(lb: LevelBuilder) {
  lb.straight(100, (s) => {
    // Down the steps of roofs towards the finish, each gap a bit wider than the last.
    roof(s, -14, 14, 4, 24, 16);
    deck(s, -14, 14, 4, 24, 16);
    acUnit(s, -6, 14, 16);
    acUnit(s, 6, 12, 16);
    s.item(0, 18, 16);

    roof(s, -14, -2, 29, 46, 14);
    deck(s, -14, -2, 29, 46, 14, GRAVEL);
    roof(s, 2, 14, 29, 44, 12);
    trampoline(s, 5, 11, 40.5, 44, 12);
    chimneyStack(s, -8, 38, 14);
    washingLine(s, -14, 14, 26.5, 17);

    // A wide street. Plank from the left, trampoline from the right, or a running dive straight over.
    s.road([-80, 49], [80, 49], 13, 26, 0xffb627);
    plank(s, -9, -7.8, 46, 54, 14);
    roof(s, -14, 14, 54, 72, 12);
    deck(s, -14, 14, 54, 72, 12);
    waterTower(s, 9, 62, 12);
    hut(s, -12, -8, 62, 66, 12, [1, 0]);
    for (const x of [-6, 0, 6]) s.item(x, 58, 12);

    roof(s, -14, 14, 77, 108, 10, 0xe2cba6);
    deck(s, -14, 14, 77, 108, 10);
    s.anchor(0, 74.5, 16);
    arch(s, 92, WHITE, INK, 10, 12);
    finishLine(s, 92, 10, 14);

    s.route([
      [-8, 16, 20],
      [-8, 14, 32],
      [-8.4, 14, 45],
      [-8.4, 14, 54],
      [-4, 12, 70],
      [0, 10, 80],
      [0, 10, 92],
    ]);
    s.route([
      [8, 16, 20],
      [8, 12, 32],
      [8, 13.2, 42],
      [6, 12, 58],
      [2, 12, 70],
      [0, 10, 80],
      [0, 10, 92],
    ]);
    s.checkpoint(92, 10);
  });
}

export function buildRooftops(): Level {
  reseed(11);
  const lb = new LevelBuilder();
  lb.killHeight = KILL_HEIGHT;
  launch(lb);
  corner(lb);
  bigRoad(lb);
  roofGarden(lb);
  finish(lb);
  neighbourhood(lb, 50, 10, [9.6, 22]);
  skyline(lb);
  const level = lb.build();
  addClouds(level, { count: 40, y: [50, 80], margin: 80 });
  return level;
}
