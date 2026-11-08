import * as THREE from 'three';
import type { Level } from './level/builder';
import type { World } from './physics';
import { forward, type Runner } from './runner';
import type { Fx } from './fx';
import { sfx } from './audio';
import { plastic } from './materials';
import { GRAPPLE_RANGE } from './config';

export type ItemKind = 'rocket' | 'grapple' | 'bulldozer' | 'soap' | 'spring' | 'coffee' | 'pigeons';

export const ITEM_INFO: Record<ItemKind, { name: string; icon: string }> = {
  rocket: { name: 'Rocket', icon: '🚀' },
  grapple: { name: 'Grappling hook', icon: '🪝' },
  bulldozer: { name: 'Bulldozer', icon: '🚜' },
  soap: { name: 'Bar of soap', icon: '🧼' },
  spring: { name: 'Spring shoes', icon: '👟' },
  coffee: { name: 'Triple espresso', icon: '☕' },
  pigeons: { name: 'Pigeons', icon: '🐦' },
};
export const ITEM_KINDS = Object.keys(ITEM_INFO) as ItemKind[];

// Leaders get defensive or minor items; stragglers get the big catch-up ones.
const WEIGHTS: Record<ItemKind, [front: number, back: number]> = {
  soap: [4, 0.5],
  coffee: [3, 2],
  spring: [3, 1],
  grapple: [1, 3],
  rocket: [1, 3],
  pigeons: [0.3, 2],
  bulldozer: [0.1, 2],
};

export function rollItem(placeFraction: number): ItemKind {
  const weights = ITEM_KINDS.map((k) => {
    const [front, back] = WEIGHTS[k];
    return front + (back - front) * placeFraction;
  });
  let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ITEM_KINDS.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return ITEM_KINDS[i];
  }
  return 'soap';
}

const ROULETTE_TIME = 1.0;
const BOX_RESPAWN = 4;
const ROCKET_SPEED = 26;
const BLAST_RADIUS = 4.5;

interface ItemBox {
  pos: THREE.Vector3;
  mesh: THREE.Object3D;
  cooldown: number;
}

interface Rocket {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  owner: Runner;
  target: Runner | null;
  age: number;
  mesh: THREE.Object3D;
}

interface Soap {
  pos: THREE.Vector3;
  owner: Runner;
  age: number;
  mesh: THREE.Object3D;
}

function boxTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, '#ff7ad9');
  grad.addColorStop(0.5, '#ffd86b');
  grad.addColorStop(1, '#6bd5ff');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#2a2238';
  g.lineWidth = 10;
  g.strokeRect(5, 5, 118, 118);
  g.font = 'bold 96px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeText('?', 64, 70);
  g.fillStyle = '#ffffff';
  g.fillText('?', 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRocket(): THREE.Object3D {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.9, 10).rotateX(Math.PI / 2), plastic(0xff4d4d));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 10).rotateX(Math.PI / 2), plastic(0xffffff));
  nose.position.z = 0.65;
  g.add(body, nose);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.3), plastic(0xffd86b));
    fin.position.z = -0.35;
    fin.rotation.z = (i * Math.PI) / 2;
    fin.geometry.translate(0, 0.2, 0);
    g.add(fin);
  }
  return g;
}

function makeSoap(): THREE.Object3D {
  const g = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.4, 4, 8).rotateZ(Math.PI / 2).scale(1, 0.55, 0.8), plastic(0xff9ed8));
  bar.position.y = 0.15;
  g.add(bar);
  for (let i = 0; i < 5; i++) {
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.08 + Math.random() * 0.08, 8, 6), plastic(0xe8f8ff));
    bubble.position.set((Math.random() - 0.5) * 0.8, 0.3 + Math.random() * 0.3, (Math.random() - 0.5) * 0.6);
    g.add(bubble);
  }
  return g;
}

function makeAnchor(): THREE.Object3D {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.16, 8, 20), plastic(0xffb627, { emissive: 0x663300 }));
  const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2), plastic(0x45506a));
  hook.position.y = 1.3;
  g.add(ring, hook);
  return g;
}

/** Item boxes, the items themselves, and everything they leave lying around the course. */
export class ItemSystem {
  readonly group = new THREE.Group();
  private boxes: ItemBox[] = [];
  private rockets: Rocket[] = [];
  private soaps: Soap[] = [];
  private anchorMeshes: THREE.Object3D[] = [];

  constructor(
    private level: Level,
    private world: World,
    private fx: Fx,
  ) {
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ map: boxTexture(), roughness: 0.35, emissive: 0xffffff, emissiveMap: boxTexture(), emissiveIntensity: 0.25 });
    for (const pos of level.itemBoxes) {
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.copy(pos);
      this.group.add(mesh);
      this.boxes.push({ pos, mesh, cooldown: 0 });
    }
    for (const pos of level.anchors) {
      const mesh = makeAnchor();
      mesh.position.copy(pos);
      this.group.add(mesh);
      this.anchorMeshes.push(mesh);
    }
  }

  update(dt: number, time: number, runners: Runner[]) {
    this.updateBoxes(dt, time, runners);
    this.updateRockets(dt, runners);
    this.updateSoaps(dt, runners);
    for (const r of runners) {
      if (r.itemRoulette > 0) r.itemRoulette = Math.max(0, r.itemRoulette - dt);
    }
    for (const a of this.anchorMeshes) a.rotation.y = time * 1.5;
  }

  private updateBoxes(dt: number, time: number, runners: Runner[]) {
    for (const box of this.boxes) {
      if (box.cooldown > 0) {
        box.cooldown -= dt;
        const t = Math.max(0, 1 - box.cooldown / 0.3);
        box.mesh.scale.setScalar(box.cooldown < 0.3 ? t : 0.001);
        continue;
      }
      box.mesh.scale.setScalar(1);
      box.mesh.rotation.set(time * 0.7, time * 1.1, 0);
      box.mesh.position.y = box.pos.y + Math.sin(time * 2 + box.pos.x) * 0.15;
      for (const r of runners) {
        const dx = r.pos.x - box.pos.x;
        const dy = r.pos.y + 0.9 - box.pos.y;
        const dz = r.pos.z - box.pos.z;
        if (dx * dx + dy * dy + dz * dz > 1.6 * 1.6) continue;
        box.cooldown = BOX_RESPAWN;
        this.fx.burst(box.pos, { color: 0xffd86b, size: 0.3, count: 8, speed: 4, up: 2 });
        if (r.item === null && r.itemRoulette === 0) {
          r.item = rollItem(runners.length > 1 ? (r.place - 1) / (runners.length - 1) : 0);
          r.itemRoulette = ROULETTE_TIME;
          if (!r.isBot) sfx.pickup();
        }
        break;
      }
    }
  }

  /** Bots ask before using so they don't waste a grapple with nothing to hook onto. */
  canUse(r: Runner, runners: Runner[]): boolean {
    if (!r.item || r.itemRoulette > 0 || !r.canAct) return false;
    if (r.item === 'grapple') return this.findAnchor(r) !== null || this.runnerAt(runners, r.place - 1, r, 35) !== null;
    if (r.item === 'pigeons') return r.place > 1;
    return true;
  }

  use(r: Runner, runners: Runner[]): boolean {
    if (!r.item || r.itemRoulette > 0 || !r.canAct) return false;
    const f = forward(r.heading);
    switch (r.item) {
      case 'rocket': {
        // The leader has nobody to aim at ahead, so their rocket goes backwards.
        const target = r.place > 1 ? this.runnerAt(runners, r.place - 1, r) : this.runnerAt(runners, 2, r);
        const dir = target && r.place === 1 ? f.clone().negate() : f.clone();
        const pos = r.pos.clone().add(new THREE.Vector3(0, 1.4, 0)).addScaledVector(dir, 0.8);
        const vel = dir.multiplyScalar(ROCKET_SPEED * 0.6).add(new THREE.Vector3(0, 7, 0));
        const mesh = makeRocket();
        mesh.position.copy(pos);
        this.group.add(mesh);
        this.rockets.push({ pos, vel, owner: r, target, age: 0, mesh });
        sfx.rocket();
        break;
      }
      case 'grapple': {
        const anchor = this.findAnchor(r);
        if (anchor) {
          r.startGrapple(anchor);
        } else {
          const victim = this.runnerAt(runners, r.place - 1, r, 35);
          if (!victim) return false;
          const pull = r.pos.clone().sub(victim.pos).setY(0).normalize();
          victim.knock('tumble', 1, pull.x * 16, 7, pull.z * 16);
        }
        sfx.item();
        break;
      }
      case 'bulldozer':
        r.effects.bulldozer = 6;
        sfx.honk();
        break;
      case 'soap': {
        const pos = r.pos.clone().addScaledVector(f, -1.4);
        pos.y = this.world.groundBelow(pos.x, pos.z, r.pos.y + 0.5);
        if (!Number.isFinite(pos.y)) return false;
        const mesh = makeSoap();
        mesh.position.copy(pos);
        mesh.rotation.y = Math.random() * Math.PI;
        this.group.add(mesh);
        this.soaps.push({ pos, owner: r, age: 0, mesh });
        sfx.item();
        break;
      }
      case 'spring':
        r.effects.spring = 8;
        sfx.bounce();
        break;
      case 'coffee':
        r.effects.coffee = 3;
        sfx.item();
        break;
      case 'pigeons': {
        const victim = this.runnerAt(runners, r.place > 1 ? 1 : 2, r);
        if (!victim) return false;
        victim.effects.pigeons = 5;
        sfx.coo();
        break;
      }
    }
    r.item = null;
    return true;
  }

  private runnerAt(runners: Runner[], place: number, self: Runner, maxDistance = Infinity): Runner | null {
    const found = runners.find((o) => o !== self && o.place === place && !o.finished);
    if (!found || found.pos.distanceTo(self.pos) > maxDistance) return null;
    return found;
  }

  findAnchor(r: Runner): THREE.Vector3 | null {
    const f = forward(r.heading);
    const head = r.pos.clone().setY(r.pos.y + 1.5);
    let best: THREE.Vector3 | null = null;
    let bestScore = -Infinity;
    const dir = new THREE.Vector3();
    for (const a of this.level.anchors) {
      dir.subVectors(a, head);
      const dist = dir.length();
      if (dist > GRAPPLE_RANGE || dist < 6 || a.y < r.pos.y + 1) continue;
      dir.divideScalar(dist);
      const along = dir.x * f.x + dir.z * f.z;
      if (along < 0.35) continue;
      const hit = this.world.raycast(head, dir, dist - 1);
      if (hit) continue;
      const score = along * dist;
      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    }
    return best;
  }

  private updateRockets(dt: number, runners: Runner[]) {
    const desired = new THREE.Vector3();
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const rk = this.rockets[i];
      rk.age += dt;
      const speed = Math.min(ROCKET_SPEED, rk.vel.length() + 30 * dt);
      if (rk.target && rk.age > 0.25) {
        desired.set(rk.target.pos.x, rk.target.pos.y + 1, rk.target.pos.z).sub(rk.pos).normalize();
        rk.vel.normalize().lerp(desired, Math.min(1, 5 * dt)).normalize();
      } else {
        rk.vel.normalize();
        rk.vel.y -= 0.6 * dt;
      }
      rk.vel.multiplyScalar(speed);
      rk.pos.addScaledVector(rk.vel, dt);
      rk.mesh.position.copy(rk.pos);
      rk.mesh.lookAt(desired.copy(rk.pos).add(rk.vel));
      if (Math.random() < 0.7) this.fx.burst(rk.pos, { color: 0xd0d0d8, size: 0.25, life: 0.5, count: 1, speed: 0.3, up: 0.3, spread: 0 });

      let explode = rk.age > 6 || this.world.containsPoint(rk.pos);
      for (const r of runners) {
        if (r === rk.owner && rk.age < 0.6) continue;
        const dx = r.pos.x - rk.pos.x;
        const dy = r.pos.y + 0.9 - rk.pos.y;
        const dz = r.pos.z - rk.pos.z;
        if (dx * dx + dy * dy + dz * dz < 1.4 * 1.4) explode = true;
      }
      if (explode) {
        this.explode(rk.pos, runners);
        this.group.remove(rk.mesh);
        this.rockets.splice(i, 1);
      }
    }
  }

  private explode(at: THREE.Vector3, runners: Runner[]) {
    this.fx.explosion(at);
    sfx.explosion();
    for (const r of runners) {
      const away = new THREE.Vector3(r.pos.x - at.x, 0, r.pos.z - at.z);
      const dist = Math.hypot(away.x, r.pos.y + 0.9 - at.y, away.z);
      if (dist > BLAST_RADIUS) continue;
      if (away.lengthSq() < 0.01) away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      away.normalize();
      r.knock('tumble', 1.4, away.x * 8, 14, away.z * 8);
    }
  }

  private updateSoaps(dt: number, runners: Runner[]) {
    for (let i = this.soaps.length - 1; i >= 0; i--) {
      const s = this.soaps[i];
      s.age += dt;
      let gone = s.age > 40;
      for (const r of runners) {
        if (gone || (r === s.owner && s.age < 1.5) || !r.grounded || r.state === 'knocked') continue;
        if (Math.hypot(r.pos.x - s.pos.x, r.pos.z - s.pos.z) > 0.9 || Math.abs(r.pos.y - s.pos.y) > 0.6) continue;
        const f = forward(r.heading);
        if (r.knock('slip', 1.1, f.x * 11, 4, f.z * 11)) {
          this.fx.burst(s.pos, { color: 0xe8f8ff, size: 0.3, count: 10, speed: 3, up: 3 });
          sfx.splat();
          gone = true;
        }
      }
      if (gone) {
        this.group.remove(s.mesh);
        this.soaps.splice(i, 1);
      }
    }
  }
}
