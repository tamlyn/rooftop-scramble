import * as THREE from 'three';
import type { CarLane } from './level/builder';
import type { Runner } from './runner';
import { toon, OUTLINE_COLOR } from './toon';
import { sfx } from './audio';

const CAR_LENGTH = 4.2;
const CAR_WIDTH = 2;
const CAR_HEIGHT = 1.8;

function makeCar(color: number): THREE.Object3D {
  const g = new THREE.Group();
  const outline = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
  const add = (geom: THREE.BufferGeometry, c: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geom, toon(c));
    m.position.set(x, y, z);
    const hull = new THREE.Mesh(geom, outline);
    hull.scale.setScalar(1.04);
    m.add(hull);
    g.add(m);
  };
  // Built facing +z so Object3D.lookAt points it down the lane.
  add(new THREE.BoxGeometry(CAR_WIDTH, 0.9, CAR_LENGTH), color, 0, 0.75, 0);
  add(new THREE.BoxGeometry(CAR_WIDTH * 0.85, 0.75, 2.2), 0xbfe6ff, 0, 1.5, -0.3);
  for (const x of [-1, 1]) {
    for (const z of [-1.35, 1.35]) add(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 12).rotateZ(Math.PI / 2), 0x2a2a33, x * 0.95, 0.4, z);
    add(new THREE.SphereGeometry(0.16, 8, 6), 0xfff6b0, x * 0.65, 0.85, CAR_LENGTH / 2);
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

export class Traffic {
  readonly group = new THREE.Group();
  private cars: Car[] = [];
  private time = 0;

  constructor(lanes: CarLane[]) {
    for (const lane of lanes) {
      const delta = lane.to.clone().sub(lane.from);
      const length = delta.length();
      const dir = delta.normalize();
      for (let offset = 0; offset < length; offset += lane.gap) {
        const mesh = makeCar(lane.color);
        this.group.add(mesh);
        this.cars.push({ lane, dir, length, offset, mesh });
      }
    }
  }

  update(dt: number, runners: Runner[]) {
    this.time += dt;
    const local = new THREE.Vector3();
    for (const car of this.cars) {
      const s = (this.time * car.lane.speed + car.offset) % car.length;
      const pos = car.mesh.position.copy(car.lane.from).addScaledVector(car.dir, s);
      car.mesh.lookAt(pos.clone().add(car.dir));
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
