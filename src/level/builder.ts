import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { World, type SurfaceKind } from '../physics';
import { SECTION_WIDTH } from '../config';
import { toonGradient } from '../toon';

export interface Style {
  color: number;
  top?: number;
  windows?: boolean;
  outline?: boolean;
  kind?: SurfaceKind;
  collide?: boolean;
  hidden?: boolean;
}

export interface Checkpoint {
  point: THREE.Vector3;
  dir: THREE.Vector3;
  right: THREE.Vector3;
  halfWidth: number;
  spawn: THREE.Vector3;
  heading: number;
}

export interface CarLane {
  from: THREE.Vector3;
  to: THREE.Vector3;
  speed: number;
  gap: number;
  color: number;
}

export interface Level {
  world: World;
  group: THREE.Group;
  checkpoints: Checkpoint[];
  /** routes[i] lists alternative waypoint paths for reaching checkpoint i. Route 0 always stays near street level. */
  routes: THREE.Vector3[][][];
  itemBoxes: THREE.Vector3[];
  anchors: THREE.Vector3[];
  starts: { pos: THREE.Vector3; heading: number }[];
  carLanes: CarLane[];
}

const WINDOW_PERIOD_X = 3.5;
const WINDOW_PERIOD_Y = 3.2;
const OUTLINE = 0.07;
const PLAIN_UV = 0.01;

let windowTexture: THREE.Texture | null = null;
function getWindowTexture(): THREE.Texture {
  if (windowTexture) return windowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#4d5f8c';
  g.fillRect(30, 30, 68, 68);
  g.fillStyle = '#8fb3e0';
  g.fillRect(30, 30, 68, 18);
  g.fillStyle = '#e6e1d6';
  g.fillRect(24, 98, 80, 8);
  windowTexture = new THREE.CanvasTexture(c);
  windowTexture.wrapS = windowTexture.wrapT = THREE.RepeatWrapping;
  windowTexture.colorSpace = THREE.SRGBColorSpace;
  windowTexture.anisotropy = 4;
  return windowTexture;
}

function colorize(geom: THREE.BufferGeometry, color: THREE.Color, topColor?: THREE.Color) {
  const count = geom.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const normals = geom.attributes.normal;
  for (let i = 0; i < count; i++) {
    const c = topColor && normals.getY(i) > 0.9 ? topColor : color;
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function plainUVs(geom: THREE.BufferGeometry) {
  const uv = geom.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, PLAIN_UV, PLAIN_UV);
}

/** Tile whole windows across each side face; top and bottom stay plain. */
function windowUVs(geom: THREE.BufferGeometry, sx: number, sy: number, sz: number) {
  const uv = geom.attributes.uv;
  const tiles = (len: number, period: number) => Math.max(1, Math.round(len / period));
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z with four vertices each.
  const faces: [number, number][] = [
    [tiles(sz, WINDOW_PERIOD_X), tiles(sy, WINDOW_PERIOD_Y)],
    [tiles(sz, WINDOW_PERIOD_X), tiles(sy, WINDOW_PERIOD_Y)],
    [0, 0],
    [0, 0],
    [tiles(sx, WINDOW_PERIOD_X), tiles(sy, WINDOW_PERIOD_Y)],
    [tiles(sx, WINDOW_PERIOD_X), tiles(sy, WINDOW_PERIOD_Y)],
  ];
  for (let f = 0; f < 6; f++) {
    const [tu, tv] = faces[f];
    const faceLen = f < 2 ? sz : f < 4 ? sx : sx;
    const faceTooSmall = faceLen < 2 || sy < 2.5;
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      if (tu === 0 || faceTooSmall) uv.setXY(i, PLAIN_UV, PLAIN_UV);
      else uv.setXY(i, uv.getX(i) * tu, uv.getY(i) * tv);
    }
  }
}

export class LevelBuilder {
  readonly world = new World();
  readonly checkpoints: Checkpoint[] = [];
  readonly routes: THREE.Vector3[][][] = [];
  pendingRoutes: THREE.Vector3[][] = [];
  readonly itemBoxes: THREE.Vector3[] = [];
  readonly anchors: THREE.Vector3[] = [];
  readonly starts: { pos: THREE.Vector3; heading: number }[] = [];
  readonly carLanes: CarLane[] = [];
  private solidGeoms: THREE.BufferGeometry[] = [];
  private outlineGeoms: THREE.BufferGeometry[] = [];
  private cursor = { x: 0, z: 0, turns: 0 };

  addBox(min: THREE.Vector3, max: THREE.Vector3, style: Style) {
    const sx = max.x - min.x;
    const sy = max.y - min.y;
    const sz = max.z - min.z;
    if (sx <= 0 || sy <= 0 || sz <= 0) return;
    const cx = (min.x + max.x) / 2;
    const cy = (min.y + max.y) / 2;
    const cz = (min.z + max.z) / 2;
    if (style.collide !== false) this.world.add(min.clone(), max.clone(), style.kind ?? 'solid');
    if (style.hidden) return;

    const geom = new THREE.BoxGeometry(sx, sy, sz);
    colorize(geom, new THREE.Color(style.color), style.top !== undefined ? new THREE.Color(style.top) : undefined);
    if (style.windows) windowUVs(geom, sx, sy, sz);
    else plainUVs(geom);
    geom.translate(cx, cy, cz);
    this.solidGeoms.push(geom);

    if (style.outline !== false) {
      const hull = new THREE.BoxGeometry(sx + OUTLINE * 2, sy + OUTLINE * 2, sz + OUTLINE * 2);
      hull.translate(cx, cy, cz);
      this.outlineGeoms.push(stripToPosition(hull));
    }
  }

  /** Arbitrary decorative geometry, already positioned in world space. Never collides. */
  addDecor(geom: THREE.BufferGeometry, color: number, outline = true) {
    const g = geom.index ? geom.toNonIndexed() : geom;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    colorize(g, new THREE.Color(color));
    plainUVs(g);
    this.solidGeoms.push(g);
    if (outline) {
      const hull = stripToPosition(g.clone());
      const pos = hull.attributes.position;
      const nrm = g.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        pos.setXYZ(i, pos.getX(i) + nrm.getX(i) * OUTLINE, pos.getY(i) + nrm.getY(i) * OUTLINE, pos.getZ(i) + nrm.getZ(i) * OUTLINE);
      }
      this.outlineGeoms.push(hull);
    }
  }

  straight(length: number, build: (s: Section) => void) {
    const s = new Section(this, this.cursor.x, this.cursor.z, this.cursor.turns, length);
    build(s);
    const end = s.toWorld(0, length);
    this.cursor = { x: end.x, z: end.z, turns: this.cursor.turns };
  }

  /** A square plaza whose exit is on the left (`dir` = 1) or right (`dir` = -1) side. */
  turn(dir: 1 | -1, build: (s: Section) => void) {
    const W = SECTION_WIDTH;
    const s = new Section(this, this.cursor.x, this.cursor.z, this.cursor.turns, W, dir);
    build(s);
    const exit = s.toWorld((-dir * W) / 2, W / 2);
    this.cursor = { x: exit.x, z: exit.z, turns: (this.cursor.turns + dir + 4) % 4 };
  }

  build(): Level {
    const group = new THREE.Group();
    const solid = new THREE.Mesh(
      mergeGeometries(this.solidGeoms.map((g) => (g.index ? g.toNonIndexed() : g))),
      new THREE.MeshToonMaterial({ vertexColors: true, map: getWindowTexture(), gradientMap: toonGradient() }),
    );
    solid.castShadow = true;
    solid.receiveShadow = true;
    group.add(solid);
    const outline = new THREE.Mesh(
      mergeGeometries(this.outlineGeoms),
      new THREE.MeshBasicMaterial({ color: 0x2a2238, side: THREE.BackSide }),
    );
    group.add(outline);
    return {
      world: this.world,
      group,
      checkpoints: this.checkpoints,
      routes: this.routes,
      itemBoxes: this.itemBoxes,
      anchors: this.anchors,
      starts: this.starts,
      carLanes: this.carLanes,
    };
  }
}

function stripToPosition(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  const src = g.index ? g.toNonIndexed() : g;
  out.setAttribute('position', src.attributes.position.clone());
  return out;
}

const RIGHT: [number, number][] = [
  [1, 0],
  [0, -1],
  [-1, 0],
  [0, 1],
];
const BACK: [number, number][] = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

/**
 * Authoring frame for one stretch of course. `x` runs across the course (-18 left to +18 right) and
 * `d` is distance travelled from the section's entry, so layouts read the same whichever way the section faces.
 */
export class Section {
  readonly heading: number;

  constructor(
    private lb: LevelBuilder,
    private ox: number,
    private oz: number,
    private turns: number,
    readonly length: number,
    readonly turnDir: 0 | 1 | -1 = 0,
  ) {
    this.heading = (turns * Math.PI) / 2;
  }

  toWorld(x: number, d: number, y = 0): THREE.Vector3 {
    const [rx, rz] = RIGHT[this.turns];
    const [bx, bz] = BACK[this.turns];
    return new THREE.Vector3(this.ox + rx * x - bx * d, y, this.oz + rz * x - bz * d);
  }

  box(x0: number, x1: number, d0: number, d1: number, y0: number, y1: number, style: Style) {
    const a = this.toWorld(x0, d0, y0);
    const b = this.toWorld(x1, d1, y1);
    this.lb.addBox(
      new THREE.Vector3(Math.min(a.x, b.x), y0, Math.min(a.z, b.z)),
      new THREE.Vector3(Math.max(a.x, b.x), y1, Math.max(a.z, b.z)),
      style,
    );
  }

  /** Decorative geometry authored around the local origin, placed at (x, y, d) and turned with the section. */
  decor(geom: THREE.BufferGeometry, x: number, y: number, d: number, color: number, outline = true) {
    const p = this.toWorld(x, d, y);
    geom.rotateY(this.heading);
    geom.translate(p.x, p.y, p.z);
    this.lb.addDecor(geom, color, outline);
  }

  item(x: number, d: number, y = 0) {
    this.lb.itemBoxes.push(this.toWorld(x, d, y + 1.3));
  }

  anchor(x: number, d: number, y: number) {
    this.lb.anchors.push(this.toWorld(x, d, y));
  }

  start(x: number, d: number) {
    this.lb.starts.push({ pos: this.toWorld(x, d, 0), heading: this.heading });
  }

  /** Waypoints as [x, y, d], leading to the next checkpoint declared. */
  route(points: [number, number, number][]) {
    this.lb.pendingRoutes.push(points.map(([x, y, d]) => this.toWorld(x, d, y)));
  }

  carLane(d: number, speed: number, gap: number, color: number, reverse = false) {
    const a = this.toWorld(-SECTION_WIDTH / 2 - 50, d);
    const b = this.toWorld(SECTION_WIDTH / 2 + 50, d);
    this.lb.carLanes.push({ from: reverse ? b : a, to: reverse ? a : b, speed, gap, color });
  }

  /** Gate line across the course at distance `d`. Defaults to the section's exit. */
  checkpoint(d?: number) {
    const W = SECTION_WIDTH;
    let point: THREE.Vector3;
    let dir: THREE.Vector3;
    let heading: number;
    if (this.turnDir !== 0 && d === undefined) {
      point = this.toWorld((-this.turnDir * W) / 2, W / 2);
      const inward = this.toWorld(-this.turnDir * W, W / 2);
      dir = inward.sub(point).normalize();
      heading = this.heading + (this.turnDir * Math.PI) / 2;
    } else {
      const at = d ?? this.length;
      point = this.toWorld(0, at);
      dir = this.toWorld(0, at + 1).sub(point);
      heading = this.heading;
    }
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    this.lb.checkpoints.push({
      point,
      dir,
      right,
      halfWidth: W / 2 + 4,
      spawn: point.clone().addScaledVector(dir, 2),
      heading,
    });
    this.lb.routes.push(this.lb.pendingRoutes);
    this.lb.pendingRoutes = [];
  }
}
