import * as THREE from 'three';
import { LevelBuilder, type Level, type Style } from './builder';
import { addClouds } from './clouds';
import {
  ASPHALT,
  COBBLE,
  DIRT,
  GRASS,
  HW,
  INK,
  METAL,
  STONE,
  W,
  WALL,
  WHITE,
  arch,
  bld,
  bouncePad,
  bunting,
  bus,
  bush,
  container,
  crate,
  deco,
  facade,
  facadeSpan,
  finishLine,
  flat,
  foamRing,
  ground,
  lamp,
  lattice,
  lilyPads,
  pigeonStatue,
  reseed,
  skyline,
  street,
  strut,
  tree,
  zebra,
} from './town';

function highStreet(lb: LevelBuilder) {
  lb.straight(84, (s) => {
    ground(s, -12, 0);
    street(s, 0, 84);
    bld(s, -HW - WALL, HW + WALL, -12, -4, 20, { color: 0xdcdcd6, front: [0, 1], tall: true });
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
    finishLine(s, 86);
    bunting(s, 40, 14);
    bunting(s, 66, 14);
    bunting(s, 90, 12);
    bld(s, -HW - WALL, HW + WALL, 98, 106, 20, { color: 0xe9cdb4, front: [0, -1], tall: true });
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
  reseed(7);
  const lb = new LevelBuilder();
  highStreet(lb);
  fountainSquare(lb);
  canalStreet(lb);
  buildingSite(lb);
  park(lb);
  finishBoulevard(lb);
  skyline(lb);
  const level = lb.build();
  addClouds(level, { count: 40, y: [45, 75], margin: 80 });
  return level;
}
