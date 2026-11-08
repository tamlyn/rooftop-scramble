import * as THREE from 'three';
import type { Level } from './level/builder';
import type { World } from './physics';
import { forward, headingOf, type Runner } from './runner';
import type { Controls } from './input';
import type { ItemSystem } from './items';

const STUCK_TIME = 2.5;

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** A simple CPU runner: follows one of the level's waypoint routes and relies on the auto-climb/vault moves. */
export class Bot {
  private route: THREE.Vector3[] = [];
  private wp = 0;
  private segment = -1;
  private bestDist = Infinity;
  private sinceProgress = 0;
  private stuckStrikes = 0;
  private itemDelay = 0;
  private blockedTime = 0;
  private pressedJumpLastFrame = false;

  constructor(
    private runner: Runner,
    private level: Level,
    private world: World,
    private items: ItemSystem,
    private skill: number,
  ) {}

  think(dt: number, runners: Runner[], requestRespawn: () => void): Controls {
    const r = this.runner;
    if (r.nextCheckpoint !== this.segment) this.chooseRoute(false);

    const target = this.currentTarget();
    const dx = target.x - r.pos.x;
    const dz = target.z - r.pos.z;
    const flatDist = Math.hypot(dx, dz);
    if (this.wp < this.route.length && flatDist < 2 && r.pos.y > target.y - 1.2) {
      this.wp++;
      this.bestDist = Infinity;
      this.stuckStrikes = 0;
    }

    this.trackProgress(dt, flatDist, requestRespawn);

    const diff = wrapAngle(headingOf(dx, dz) - r.heading);
    const steer = Math.max(-1, Math.min(1, -diff * 3));
    const throttle = Math.abs(diff) > 1.4 ? 0.3 : this.skill;

    let jump = false;
    if (r.grounded && r.state === 'move') {
      const f = forward(r.heading);
      const aheadX = r.pos.x + f.x * 1.3;
      const aheadZ = r.pos.z + f.z * 1.3;
      const gap = r.pos.y - this.world.groundBelow(aheadX, aheadZ, r.pos.y + 0.3, 0.2) > 1.2;
      const speed = Math.hypot(r.vel.x, r.vel.z);
      this.blockedTime = speed < 2 ? this.blockedTime + dt : 0;
      const ledgeAhead = target.y > r.pos.y + 1 && flatDist < 5;
      jump = (gap && speed > 4) || this.blockedTime > 0.3 || ledgeAhead;
    }
    // A press needs a release in between, so alternate frames while we want to jump.
    const jumpPressed = jump && !this.pressedJumpLastFrame;
    this.pressedJumpLastFrame = jumpPressed;

    let item = false;
    if (r.item && r.itemRoulette === 0) {
      this.itemDelay -= dt;
      if (this.itemDelay <= 0 && this.items.canUse(r, runners)) {
        item = true;
        this.itemDelay = 1 + Math.random() * 2;
      }
    } else {
      this.itemDelay = 1 + Math.random() * 2;
    }

    let dive = false;
    if (r.grounded && r.state === 'move' && r.diveCooldown === 0) {
      const f = forward(r.heading);
      for (const o of runners) {
        if (o === r || o.state === 'knocked') continue;
        const ox = o.pos.x - r.pos.x;
        const oz = o.pos.z - r.pos.z;
        const d = Math.hypot(ox, oz);
        if (d < 3 && d > 0.5 && Math.abs(o.pos.y - r.pos.y) < 1 && (ox * f.x + oz * f.z) / d > 0.8 && Math.random() < dt * 3) {
          dive = true;
        }
      }
    }

    return {
      x: steer,
      y: throttle,
      jumpHeld: jump,
      jumpPressed,
      divePressed: dive,
      itemPressed: item,
      startPressed: false,
    };
  }

  private currentTarget(): THREE.Vector3 {
    if (this.wp < this.route.length) return this.route[this.wp];
    const cp = this.level.checkpoints[Math.min(this.runner.nextCheckpoint, this.level.checkpoints.length - 1)];
    return cp.point.clone().addScaledVector(cp.dir, 6);
  }

  private chooseRoute(safe: boolean) {
    const r = this.runner;
    this.segment = r.nextCheckpoint;
    const options = this.level.routes[r.nextCheckpoint] ?? [];
    this.route = options.length === 0 ? [] : safe ? options[0] : options[Math.floor(Math.random() * options.length)];
    // Skip waypoints already behind us.
    this.wp = 0;
    let best = Infinity;
    this.route.forEach((p, i) => {
      const d = p.distanceTo(r.pos);
      if (d < best) {
        best = d;
        this.wp = i;
      }
    });
    if (this.wp < this.route.length - 1) {
      const here = this.route[this.wp];
      const next = this.route[this.wp + 1];
      if (r.pos.distanceTo(next) < here.distanceTo(next)) this.wp++;
    }
    this.bestDist = Infinity;
    this.sinceProgress = 0;
  }

  private trackProgress(dt: number, dist: number, requestRespawn: () => void) {
    const r = this.runner;
    if (r.state === 'knocked' || r.state === 'mantle') return;
    if (dist < this.bestDist - 0.5) {
      this.bestDist = dist;
      this.sinceProgress = 0;
      return;
    }
    this.sinceProgress += dt;
    if (this.sinceProgress < STUCK_TIME) return;
    this.stuckStrikes++;
    if (this.stuckStrikes >= 2) {
      requestRespawn();
      this.stuckStrikes = 0;
    }
    this.chooseRoute(true);
  }

  onRespawn() {
    this.chooseRoute(true);
  }
}
