import * as THREE from 'three';
import { World, type SurfaceKind } from '../physics';
import { PLAYER_RADIUS, SECTION_WIDTH } from '../config';
import { SURFACES, createLevelMaterial, surfaceLayer, type Surface } from './surfaces';
import { chamferedBox, triangulate } from './chamfer';
import { createKit, type KitName } from './kit';

export interface Style {
  color: number;
  top?: number;
  /** Painted surface on the four side faces. */
  sides?: Surface;
  /** Painted surface on the top face. */
  topSurface?: Surface;
  /** Chamfered edges. Off for ground slabs, which would show seams between neighbours. */
  bevel?: boolean;
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
  /** What to teach on the way to this checkpoint, for tutorial courses. */
  lesson?: Lesson;
}

/** `text` may name controls as {move}, {forward}, {jump}, {dive} and {item}, filled in per player. */
export interface Lesson {
  title: string;
  text: string;
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
  /** routes[i] lists alternative waypoint paths for reaching checkpoint i. Route 0 is the safest, for CPU runners that keep getting stuck. */
  routes: THREE.Vector3[][][];
  itemBoxes: THREE.Vector3[];
  anchors: THREE.Vector3[];
  starts: { pos: THREE.Vector3; heading: number }[];
  carLanes: CarLane[];
  /** Runners who fall below this are out and respawn at their last checkpoint. */
  killHeight: number;
  /** Advances animated scenery such as water. */
  animate(time: number): void;
}

const MAX_BEVEL = 0.14;
const CELL = 48;
const UP = new THREE.Vector3(0, 1, 0);
const WHITE = new THREE.Color(0xffffff);
export const SIGNS = ['bakery', 'barber', 'chippy', 'pets', 'cafe', 'grocer', 'bikes', 'fries'].map((name) => `sign-${name}`);

/** Walls darken towards the ground, a cheap stand-in for large-scale ambient occlusion. */
function heightShade(y: number): number {
  return 0.72 + 0.28 * THREE.MathUtils.clamp(y / 9, 0, 1);
}

/** Accumulates every static triangle of the level into one vertex-coloured, texture-array-mapped mesh. */
class MeshWriter {
  private pos: number[] = [];
  private nrm: number[] = [];
  private col: number[] = [];
  private surf: number[] = [];

  vertex(p: THREE.Vector3, n: THREE.Vector3, c: THREE.Color, u: number, v: number, layer: number, shaded: boolean) {
    const k = shaded ? heightShade(p.y) : 1;
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.col.push(c.r * k, c.g * k, c.b * k);
    this.surf.push(u, v, layer);
  }

  poly(pts: THREE.Vector3[], uvs: [number, number][], n: THREE.Vector3, c: THREE.Color, layer: number, shaded: boolean) {
    for (const i of triangulate(pts, n)) this.vertex(pts[i], n, c, uvs[i][0], uvs[i][1], layer, shaded);
  }

  /** Decorative geometry; an existing colour attribute (baked gradients, say) is multiplied by `c`. */
  geometry(geom: THREE.BufferGeometry, c: THREE.Color) {
    const g = geom.index ? geom.toNonIndexed() : geom;
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const baked = g.attributes.color;
    const v = new THREE.Vector3();
    const nv = new THREE.Vector3();
    const vc = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      if (baked) vc.fromBufferAttribute(baked, i).multiply(c);
      else vc.copy(c);
      this.vertex(v.fromBufferAttribute(p, i), nv.fromBufferAttribute(n, i), vc, 0.5, 0.5, 0, false);
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('surface', new THREE.Float32BufferAttribute(this.surf, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/** Texture coordinates for a point on a box face, either fitted to whole tiles or tiled in world space. */
function faceUV(surface: Surface, p: THREE.Vector3, n: THREE.Vector3, min: THREE.Vector3, max: THREE.Vector3): [number, number] {
  const spec = SURFACES[surface];
  if (Math.abs(n.y) > 0.5) {
    if (!spec.fit) return [p.x / spec.w, p.z / spec.h];
    const sx = max.x - min.x;
    const sz = max.z - min.z;
    return [((p.x - min.x) / sx) * Math.max(1, Math.round(sx / spec.w)), ((p.z - min.z) / sz) * Math.max(1, Math.round(sz / spec.h))];
  }
  // Horizontal axis runs left-to-right as seen from outside the face.
  const right = new THREE.Vector3().crossVectors(UP, n);
  const along = p.dot(right);
  if (!spec.fit) return [along / spec.w, p.y / spec.h];
  const lo = Math.min(min.dot(right), max.dot(right));
  const len = Math.abs(max.dot(right) - min.dot(right));
  const sy = max.y - min.y;
  return [((along - lo) / len) * Math.max(1, Math.round(len / spec.w)), ((p.y - min.y) / sy) * Math.max(1, Math.round(sy / spec.h))];
}

/** Fitted surfaces need room for at least most of one tile, otherwise a window gets squashed onto a kerb. */
function fits(surface: Surface, faceWidth: number, faceHeight: number): boolean {
  const spec = SURFACES[surface];
  return !spec.fit || (faceWidth >= spec.w * 0.6 && faceHeight >= spec.h * 0.75);
}

function waterMaterial(): { material: THREE.MeshStandardMaterial; time: THREE.IUniform<number> } {
  const time = { value: 0 };
  const material = new THREE.MeshStandardMaterial({ color: 0x3fb2e0, roughness: 0.08, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.time = time;
    shader.uniforms.deep = { value: new THREE.Color(0x1f86c2) };
    shader.uniforms.shallow = { value: new THREE.Color(0x63d6e6) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 rect;\nvarying vec4 vRect;\nvarying vec3 vWaterWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRect = rect;\nvWaterWorld = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float time;\nuniform vec3 deep;\nuniform vec3 shallow;\nvarying vec4 vRect;\nvarying vec3 vWaterWorld;')
      .replace(
        '#include <color_fragment>',
        `vec3 w = vWaterWorld;
        float edge = min(min(vRect.x, vRect.z - vRect.x), min(vRect.y, vRect.w - vRect.y));
        float wobble = sin(w.x * 2.1 + time * 1.3) * 0.1 + sin(w.z * 1.7 - time * 1.1) * 0.1;
        float foam = 1.0 - smoothstep(0.2, 0.55, edge + wobble);
        float ripple = sin(w.x * 0.9 + sin(w.z * 0.7 + time * 0.8) * 1.5 + time * 0.6) * sin(w.z * 1.3 - time * 0.5 + sin(w.x * 0.5));
        diffuseColor.rgb = mix(deep, shallow, smoothstep(3.0, 0.4, edge));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.95, 1.0), smoothstep(0.7, 0.95, ripple) * 0.6);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), foam);`,
      );
  };
  material.customProgramCacheKey = () => 'water';
  return { material, time };
}

const posterLoader = new THREE.TextureLoader();

/** Hand-painted artwork (shop signs, billboards) from public/textures. */
function posterMaterial(image: string): THREE.MeshStandardMaterial {
  const map = posterLoader.load(`${import.meta.env.BASE_URL}textures/${image}.jpg`);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map, roughness: 0.6 });
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
  killHeight = -1;
  private mesh = new MeshWriter();
  private instances = new Map<KitName, { matrices: THREE.Matrix4[]; colors: THREE.Color[] }>();
  private water = { pos: [] as number[], rect: [] as number[] };
  private posters = new Map<string, { pos: number[]; uv: number[] }>();
  private cursor = { x: 0, z: 0, turns: 0 };

  addBox(min: THREE.Vector3, max: THREE.Vector3, style: Style) {
    const size = new THREE.Vector3().subVectors(max, min);
    if (size.x <= 0 || size.y <= 0 || size.z <= 0) return;
    if (style.collide !== false) this.world.add(min.clone(), max.clone(), style.kind ?? 'solid');
    if (style.hidden) return;

    const side = new THREE.Color(style.color);
    const top = new THREE.Color(style.top ?? style.color);
    // Chamfers catch the light like worn, painted edges.
    const edge = side.clone().lerp(WHITE, 0.2);
    const bevel = style.bevel === false ? 0 : Math.min(MAX_BEVEL, Math.min(size.x, size.y, size.z) * 0.2);
    const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
    const plain: [number, number][] = [
      [0.5, 0.5],
      [0.5, 0.5],
      [0.5, 0.5],
      [0.5, 0.5],
    ];
    chamferedBox(size.clone().multiplyScalar(0.5), bevel, (local, n, face) => {
      const pts = local.map((p) => p.add(center));
      if (!face) {
        this.mesh.poly(pts, plain, n, edge, 0, true);
        return;
      }
      const isTop = face.axis === 1 && face.sign > 0;
      const vertical = face.axis !== 1;
      let surface: Surface = (isTop ? style.topSurface : vertical ? style.sides : undefined) ?? 'plain';
      const faceWidth = face.axis === 0 ? size.z : size.x;
      if (vertical && !fits(surface, faceWidth, size.y)) surface = 'plain';
      const uvs = pts.map((p) => faceUV(surface, p, n, min, max));
      this.mesh.poly(pts, uvs, n, isTop ? top : side, surfaceLayer(surface), vertical);
    });
  }

  /** Arbitrary decorative geometry, already positioned in world space. Never collides. */
  addDecor(geom: THREE.BufferGeometry, color: number) {
    this.mesh.geometry(geom, new THREE.Color(color));
  }

  /** One copy of a kit piece, turned to face `yaw` (0 faces +z). */
  addInstance(kind: KitName, position: THREE.Vector3, yaw: number, color: number, scale = new THREE.Vector3(1, 1, 1)) {
    let list = this.instances.get(kind);
    if (!list) {
      list = { matrices: [], colors: [] };
      this.instances.set(kind, list);
    }
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    list.matrices.push(new THREE.Matrix4().compose(position, q, scale));
    list.colors.push(new THREE.Color(color));
  }

  /** A water surface over a rectangle at height `y`; foam gathers along its edges. */
  addWater(min: THREE.Vector3, max: THREE.Vector3, y: number) {
    const sx = max.x - min.x;
    const sz = max.z - min.z;
    const corners: [number, number][] = [
      [0, 0],
      [sx, sz],
      [sx, 0],
      [0, 0],
      [0, sz],
      [sx, sz],
    ];
    for (const [lx, lz] of corners) {
      this.water.pos.push(min.x + lx, y, min.z + lz);
      this.water.rect.push(lx, lz, sx, sz);
    }
  }

  /**
   * A pitched roof over a footprint, ridge running along x or z, with overhanging tiled slopes, painted
   * fascia boards and plastered gable ends.
   */
  addGableRoof(min: THREE.Vector3, max: THREE.Vector3, ridgeAlongX: boolean, rise: number, roofColor: number, gableColor: number) {
    const overhang = 0.5;
    const thick = 0.2;
    const [a0, a1] = ridgeAlongX ? [min.x, max.x] : [min.z, max.z];
    const [b0, b1] = ridgeAlongX ? [min.z, max.z] : [min.x, max.x];
    const P = (a: number, b: number, y: number) => (ridgeAlongX ? new THREE.Vector3(a, y, b) : new THREE.Vector3(b, y, a));
    const dirA = ridgeAlongX ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const dirB = ridgeAlongX ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const half = (b1 - b0) / 2;
    const mid = (b0 + b1) / 2;
    const slope = rise / half;
    const y0 = min.y;
    const ridge = y0 + rise;
    const eaveY = y0 - overhang * slope;
    const roof = new THREE.Color(roofColor);
    const trim = new THREE.Color(0xf3ead8);
    const gable = new THREE.Color(gableColor);
    const tiles = surfaceLayer('rooftiles');
    const tile = SURFACES.rooftiles;
    const slopeLen = Math.hypot(half + overhang, rise + overhang * slope);
    const plain: [number, number][] = [
      [0.5, 0.5],
      [0.5, 0.5],
      [0.5, 0.5],
      [0.5, 0.5],
    ];

    for (const side of [-1, 1]) {
      const eaveB = side < 0 ? b0 - overhang : b1 + overhang;
      const n = dirB
        .clone()
        .multiplyScalar(side * rise)
        .addScaledVector(UP, half)
        .normalize();
      const slopePts = [P(a0 - overhang, eaveB, eaveY), P(a1 + overhang, eaveB, eaveY), P(a1 + overhang, mid, ridge), P(a0 - overhang, mid, ridge)];
      const uvs: [number, number][] = [
        [(a0 - overhang) / tile.w, 0],
        [(a1 + overhang) / tile.w, 0],
        [(a1 + overhang) / tile.w, slopeLen / tile.h],
        [(a0 - overhang) / tile.w, slopeLen / tile.h],
      ];
      this.mesh.poly(slopePts, uvs, n, roof, tiles, false);
      const below = slopePts.map((p) => p.clone().setY(p.y - thick));
      this.mesh.poly([below[0], below[1], slopePts[1], slopePts[0]], plain, dirB.clone().multiplyScalar(side), trim, 0, false);
      this.mesh.poly(below, plain, n.clone().negate(), gable.clone().multiplyScalar(0.7), 0, false);
      for (const [end, a] of [
        [-1, a0 - overhang],
        [1, a1 + overhang],
      ]) {
        const pts = [P(a, eaveB, eaveY), P(a, mid, ridge), P(a, mid, ridge - thick), P(a, eaveB, eaveY - thick)];
        this.mesh.poly(pts, plain, dirA.clone().multiplyScalar(end), trim, 0, false);
      }
    }
    const plaster = surfaceLayer('plaster');
    for (const [end, a] of [
      [-1, a0],
      [1, a1],
    ]) {
      const pts = [P(a, b0, y0), P(a, b1, y0), P(a, mid, ridge)];
      const n = dirA.clone().multiplyScalar(end);
      const uvs = pts.map((p) => faceUV('plaster', p, n, min, max));
      this.mesh.poly(pts, uvs, n, gable, plaster, false);
    }
  }

  /** A quad of painted artwork facing `yaw`. */
  addPoster(image: string, center: THREE.Vector3, yaw: number, width: number, height: number) {
    let poster = this.posters.get(image);
    if (!poster) {
      poster = { pos: [], uv: [] };
      this.posters.set(image, poster);
    }
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const corner = (sx: number, sy: number) => center.clone().addScaledVector(right, (sx * width) / 2).setY(center.y + (sy * height) / 2);
    const quad: [THREE.Vector3, number, number][] = [
      [corner(-1, -1), 0, 0],
      [corner(1, -1), 1, 0],
      [corner(1, 1), 1, 1],
      [corner(-1, -1), 0, 0],
      [corner(1, 1), 1, 1],
      [corner(-1, 1), 0, 1],
    ];
    for (const [p, u, v] of quad) {
      poster.pos.push(p.x, p.y, p.z);
      poster.uv.push(u, v);
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
    // Gates often sit at the edge of a gap, so respawn on the first solid ground past each one.
    for (const cp of this.checkpoints) {
      search: for (let ahead = 2; ahead < 14; ahead += 0.5) {
        for (const side of [0, 2, -2, 4, -4, 6, -6, 8, -8]) {
          const p = cp.point.clone().addScaledVector(cp.dir, ahead).addScaledVector(cp.right, side);
          const ground = this.world.groundBelow(p.x, p.z, cp.point.y + 3, PLAYER_RADIUS);
          if (ground > this.killHeight) {
            cp.spawn.copy(p).setY(ground);
            break search;
          }
        }
      }
    }

    const group = new THREE.Group();
    const solid = new THREE.Mesh(this.mesh.build(), createLevelMaterial());
    solid.castShadow = true;
    solid.receiveShadow = true;
    group.add(solid);

    // Instances are bucketed into grid cells so each bucket can be frustum-culled, including from shadow passes.
    const position = new THREE.Vector3();
    for (const [kind, list] of this.instances) {
      const kit = createKit(kind);
      const cells = new Map<string, number[]>();
      list.matrices.forEach((m, i) => {
        position.setFromMatrixPosition(m);
        const key = `${Math.floor(position.x / CELL)},${Math.floor(position.z / CELL)}`;
        const cell = cells.get(key) ?? [];
        cell.push(i);
        cells.set(key, cell);
      });
      for (const indices of cells.values()) {
        const mesh = new THREE.InstancedMesh(kit.geometry, kit.material, indices.length);
        indices.forEach((src, i) => {
          mesh.setMatrixAt(i, list.matrices[src]);
          mesh.setColorAt(i, list.colors[src]);
        });
        mesh.castShadow = kit.castShadow;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        if (kit.range === Infinity) {
          group.add(mesh);
          continue;
        }
        // LOD measures from its own position, so centre it on the cell and shift the instances back.
        const lod = new THREE.LOD();
        lod.position.copy(mesh.boundingSphere!.center);
        mesh.position.copy(lod.position).negate();
        lod.addLevel(mesh, 0);
        lod.addLevel(new THREE.Object3D(), kit.range + mesh.boundingSphere!.radius);
        group.add(lod);
      }
    }

    const water = waterMaterial();
    if (this.water.pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.water.pos, 3));
      g.setAttribute('rect', new THREE.Float32BufferAttribute(this.water.rect, 4));
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, water.material);
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    for (const [image, poster] of this.posters) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(poster.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(poster.uv, 2));
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, posterMaterial(image));
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    return {
      world: this.world,
      group,
      checkpoints: this.checkpoints,
      routes: this.routes,
      itemBoxes: this.itemBoxes,
      anchors: this.anchors,
      starts: this.starts,
      carLanes: this.carLanes,
      killHeight: this.killHeight,
      animate: (time) => {
        water.time.value = time;
      },
    };
  }
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
  decor(geom: THREE.BufferGeometry, x: number, y: number, d: number, color: number) {
    const p = this.toWorld(x, d, y);
    geom.rotateY(this.heading);
    geom.translate(p.x, p.y, p.z);
    this.lb.addDecor(geom, color);
  }

  /** Yaw that turns a +z-facing kit piece to face `facing`, given in section coordinates (x, d). */
  yaw([fx, fd]: [number, number]): number {
    const dir = this.toWorld(fx, fd).sub(this.toWorld(0, 0));
    return Math.atan2(dir.x, dir.z);
  }

  instance(kind: KitName, x: number, y: number, d: number, facing: [number, number], color: number, scale?: THREE.Vector3) {
    this.lb.addInstance(kind, this.toWorld(x, d, y), this.yaw(facing), color, scale);
  }

  water(x0: number, x1: number, d0: number, d1: number, y: number) {
    const a = this.toWorld(x0, d0);
    const b = this.toWorld(x1, d1);
    this.lb.addWater(new THREE.Vector3(Math.min(a.x, b.x), 0, Math.min(a.z, b.z)), new THREE.Vector3(Math.max(a.x, b.x), 0, Math.max(a.z, b.z)), y);
  }

  /** Pitched roof sitting on top of a footprint at height `y`; the ridge runs along d unless `ridgeAcross`. */
  gableRoof(x0: number, x1: number, d0: number, d1: number, y: number, rise: number, roof: number, gable: number, ridgeAcross = false) {
    const a = this.toWorld(x0, d0, y);
    const b = this.toWorld(x1, d1, y);
    const dAxisIsX = Math.abs(this.toWorld(0, 1).x - this.toWorld(0, 0).x) > 0.5;
    this.lb.addGableRoof(
      new THREE.Vector3(Math.min(a.x, b.x), y, Math.min(a.z, b.z)),
      new THREE.Vector3(Math.max(a.x, b.x), y, Math.max(a.z, b.z)),
      ridgeAcross ? !dAxisIsX : dAxisIsX,
      rise,
      roof,
      gable,
    );
  }

  poster(image: string, x: number, y: number, d: number, facing: [number, number], width: number, height: number) {
    this.lb.addPoster(image, this.toWorld(x, d, y), this.yaw(facing), width, height);
  }

  item(x: number, d: number, y = 0) {
    this.lb.itemBoxes.push(this.toWorld(x, d, y + 1.3));
  }

  anchor(x: number, d: number, y: number) {
    this.lb.anchors.push(this.toWorld(x, d, y));
  }

  start(x: number, d: number, y = 0) {
    this.lb.starts.push({ pos: this.toWorld(x, d, y), heading: this.heading });
  }

  /** Waypoints as [x, y, d], leading to the next checkpoint declared. */
  route(points: [number, number, number][]) {
    this.lb.pendingRoutes.push(points.map(([x, y, d]) => this.toWorld(x, d, y)));
  }

  /** Traffic between two points given as [x, d], at street level. */
  road(from: [number, number], to: [number, number], speed: number, gap: number, color: number) {
    this.lb.carLanes.push({ from: this.toWorld(...from), to: this.toWorld(...to), speed, gap, color });
  }

  carLane(d: number, speed: number, gap: number, color: number, reverse = false) {
    const a = this.toWorld(-SECTION_WIDTH / 2 - 50, d);
    const b = this.toWorld(SECTION_WIDTH / 2 + 50, d);
    this.lb.carLanes.push({ from: reverse ? b : a, to: reverse ? a : b, speed, gap, color });
  }

  /**
   * Gate line across the course at distance `d`. Defaults to the section's exit. Runners respawn on whatever is at
   * height `y`. A `lesson` is shown to players on their way to this gate.
   */
  checkpoint(d?: number, y = 0, lesson?: Lesson) {
    const W = SECTION_WIDTH;
    let point: THREE.Vector3;
    let dir: THREE.Vector3;
    let heading: number;
    if (this.turnDir !== 0 && d === undefined) {
      point = this.toWorld((-this.turnDir * W) / 2, W / 2, y);
      const inward = this.toWorld(-this.turnDir * W, W / 2, y);
      dir = inward.sub(point).normalize();
      heading = this.heading + (this.turnDir * Math.PI) / 2;
    } else {
      const at = d ?? this.length;
      point = this.toWorld(0, at, y);
      dir = this.toWorld(0, at + 1, y).sub(point);
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
      lesson,
    });
    this.lb.routes.push(this.lb.pendingRoutes);
    this.lb.pendingRoutes = [];
  }
}
