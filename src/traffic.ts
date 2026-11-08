import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CarLane } from './level/builder';
import type { Runner } from './runner';
import { plastic } from './materials';
import { assemble, block } from './level/kit';
import { sfx } from './audio';

const CAR_LENGTH = 4.2;
const CAR_WIDTH = 2;
const CAR_HEIGHT = 1.8;

const TRIM = 0xe6e2dc;
const TYRE = 0x2a2733;

// Every car shares these; only the paint material varies by lane. Built facing +z so Object3D.lookAt points it down the lane.
const body = mergeGeometries([
  block(CAR_WIDTH, 0.75, CAR_LENGTH, 0, 0.72, 0, 0.22),
  block(CAR_WIDTH * 0.84, 0.72, 2.3, 0, 1.38, -0.25, 0.2),
]);
const windows = mergeGeometries([
  block(CAR_WIDTH * 0.86, 0.46, 2.0, 0, 1.4, -0.25, 0.12),
  block(CAR_WIDTH * 0.7, 0.44, 2.36, 0, 1.4, -0.25, 0.1),
]);
const running = assemble([
  ...[-1, 1].map((z) => ({ geom: block(CAR_WIDTH + 0.06, 0.26, 0.3, 0, 0.42, z * (CAR_LENGTH / 2 - 0.05), 0.08), color: TRIM })),
  ...[-1, 1].flatMap((x) =>
    [-1.3, 1.3].flatMap((z) => [
      { geom: new THREE.CylinderGeometry(0.42, 0.42, 0.32, 16).rotateZ(Math.PI / 2).translate(x * 0.92, 0.42, z), color: TYRE },
      { geom: new THREE.CylinderGeometry(0.22, 0.22, 0.34, 12).rotateZ(Math.PI / 2).translate(x * 0.93, 0.42, z), color: TRIM },
    ]),
  ),
]);
const headlights = mergeGeometries([-1, 1].map((x) => new THREE.SphereGeometry(0.16, 12, 8).scale(1, 0.8, 0.5).translate(x * 0.66, 0.85, CAR_LENGTH / 2)));
const taillights = mergeGeometries([-1, 1].map((x) => new THREE.SphereGeometry(0.13, 10, 6).scale(1, 0.7, 0.5).translate(x * 0.7, 0.85, -CAR_LENGTH / 2)));

const glass = plastic(0x2c3b66, { roughness: 0.05 });
const runningGear = plastic(0xffffff, { vertexColors: true, roughness: 0.6 });
const headlight = new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xfff0b0, emissiveIntensity: 1.6 });
const taillight = new THREE.MeshStandardMaterial({ color: 0xff4040, emissive: 0xff2020, emissiveIntensity: 1.2 });

function makeCar(paint: THREE.Material): THREE.Object3D {
  const g = new THREE.Group();
  for (const [geom, material, shadow] of [
    [body, paint, true],
    [windows, glass, false],
    [running, runningGear, true],
    [headlights, headlight, false],
    [taillights, taillight, false],
  ] as const) {
    const m = new THREE.Mesh(geom, material);
    m.castShadow = shadow;
    g.add(m);
  }
  return g;
}

interface Car {
  lane: CarLane;
  dir: THREE.Vector3;
  length: number;
  offset: number;
  mesh: THREE.Object3D;
}

const local = new THREE.Vector3();
const ahead = new THREE.Vector3();

export class Traffic {
  readonly group = new THREE.Group();
  private cars: Car[] = [];
  private time = 0;

  constructor(lanes: CarLane[]) {
    const paints = new Map<number, THREE.Material>();
    for (const lane of lanes) {
      const delta = lane.to.clone().sub(lane.from);
      const length = delta.length();
      const dir = delta.normalize();
      let paint = paints.get(lane.color);
      if (!paint) paints.set(lane.color, (paint = plastic(lane.color, { roughness: 0.3 })));
      for (let offset = 0; offset < length; offset += lane.gap) {
        const mesh = makeCar(paint);
        this.group.add(mesh);
        this.cars.push({ lane, dir, length, offset, mesh });
      }
    }
  }

  update(dt: number, runners: Runner[]) {
    this.time += dt;
    for (const car of this.cars) {
      const s = (this.time * car.lane.speed + car.offset) % car.length;
      const pos = car.mesh.position.copy(car.lane.from).addScaledVector(car.dir, s);
      car.mesh.lookAt(ahead.copy(pos).add(car.dir));
      for (const r of runners) {
        local.subVectors(r.pos, pos);
        const along = local.x * car.dir.x + local.z * car.dir.z;
        const across = local.x * -car.dir.z + local.z * car.dir.x;
        if (Math.abs(along) > CAR_LENGTH / 2 + 0.4 || Math.abs(across) > CAR_WIDTH / 2 + 0.4 || local.y > CAR_HEIGHT) continue;
        const side = Math.sign(across) || 1;
        const vx = car.dir.x * 14 - car.dir.z * side * 6;
        const vz = car.dir.z * 14 + car.dir.x * side * 6;
        if (r.knock('tumble', 1.3, vx, 11, vz)) {
          sfx.honk();
          sfx.bonk();
        }
      }
    }
  }
}
