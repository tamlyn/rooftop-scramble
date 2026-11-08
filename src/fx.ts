import * as THREE from 'three';
import { matte } from './materials';

interface Puff {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  gravity: number;
}

const geometry = new THREE.IcosahedronGeometry(1, 1);
const materials = new Map<number, THREE.Material>();
function material(color: number) {
  let m = materials.get(color);
  if (!m) {
    m = matte(color, { roughness: 1 });
    materials.set(color, m);
  }
  return m;
}

export interface PuffOptions {
  color?: number;
  size?: number;
  life?: number;
  count?: number;
  speed?: number;
  up?: number;
  gravity?: number;
  spread?: number;
}

/** Cartoon smoke puffs: little balls that pop in and shrink away. Used for dust, explosions, splashes. */
export class Fx {
  readonly group = new THREE.Group();
  private puffs: Puff[] = [];
  private pool: THREE.Mesh[] = [];

  burst(at: THREE.Vector3, opts: PuffOptions = {}) {
    const { color = 0xffffff, size = 0.4, life = 0.6, count = 6, speed = 2, up = 1, gravity = 0, spread = 0.3 } = opts;
    for (let i = 0; i < count; i++) {
      const mesh = this.pool.pop() ?? new THREE.Mesh(geometry);
      mesh.material = material(color);
      mesh.position.set(
        at.x + (Math.random() - 0.5) * spread * 2,
        at.y + (Math.random() - 0.5) * spread,
        at.z + (Math.random() - 0.5) * spread * 2,
      );
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.5 + Math.random() * 0.5);
      const vel = new THREE.Vector3(Math.cos(a) * s, up * (0.5 + Math.random()), Math.sin(a) * s);
      mesh.scale.setScalar(0.001);
      this.group.add(mesh);
      this.puffs.push({ mesh, vel, age: 0, life: life * (0.7 + Math.random() * 0.6), size: size * (0.7 + Math.random() * 0.6), gravity });
    }
  }

  explosion(at: THREE.Vector3) {
    this.burst(at, { color: 0xfff1a8, size: 1.6, life: 0.35, count: 4, speed: 2, spread: 0.6 });
    this.burst(at, { color: 0xff9f43, size: 1.1, life: 0.6, count: 10, speed: 9, up: 4, spread: 0.8 });
    this.burst(at, { color: 0xff5e57, size: 0.8, life: 0.7, count: 8, speed: 7, up: 6, spread: 0.6 });
    this.burst(at, { color: 0x6d6875, size: 0.9, life: 1.1, count: 6, speed: 3, up: 3, spread: 1 });
  }

  update(dt: number) {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        this.group.remove(p.mesh);
        this.pool.push(p.mesh);
        this.puffs.splice(i, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(Math.exp(-3 * dt));
      p.mesh.position.addScaledVector(p.vel, dt);
      const s = t < 0.15 ? t / 0.15 : 1 - Math.pow((t - 0.15) / 0.85, 2);
      p.mesh.scale.setScalar(Math.max(0.001, p.size * s));
    }
  }
}
