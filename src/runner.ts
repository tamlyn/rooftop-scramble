import { Vector3 } from 'three';
import * as C from './config';
import type { World } from './physics';
import { NO_INPUT, type Controls } from './input';
import type { ItemKind } from './items';

export type RunnerState = 'move' | 'climb' | 'mantle' | 'dive' | 'knocked' | 'grapple';
export type KnockStyle = 'tumble' | 'splat' | 'slip' | 'bonk';
export type RunnerEvent = 'jump' | 'land' | 'splat' | 'bounce' | 'wallJump' | 'dive' | 'bonk' | 'mantle' | 'climb';

export interface Effects {
  bulldozer: number;
  spring: number;
  coffee: number;
  pigeons: number;
}

interface Contact {
  landed: boolean;
  impactVy: number;
  wall: Vector3 | null;
  ceiling: boolean;
}

const UP_PROBE = 0.08;
const scratchBoxes: import('./physics').Box[] = [];
const tmp = new Vector3();
const grappleFrom = new Vector3();

export function forward(heading: number, out = new Vector3()): Vector3 {
  return out.set(-Math.sin(heading), 0, -Math.cos(heading));
}

export function headingOf(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

function accelerateTowards(vel: Vector3, tx: number, tz: number, maxDelta: number) {
  const dx = tx - vel.x;
  const dz = tz - vel.z;
  const len = Math.hypot(dx, dz);
  if (len <= maxDelta) {
    vel.x = tx;
    vel.z = tz;
  } else {
    vel.x += (dx / len) * maxDelta;
    vel.z += (dz / len) * maxDelta;
  }
}

function applyFriction(vel: Vector3, amount: number) {
  const s = Math.hypot(vel.x, vel.z);
  if (s <= amount) {
    vel.x = 0;
    vel.z = 0;
  } else {
    vel.x *= (s - amount) / s;
    vel.z *= (s - amount) / s;
  }
}

/** Simulation state for one racer. Knows nothing about rendering or other racers. */
export class Runner {
  pos = new Vector3();
  vel = new Vector3();
  heading = 0;
  state: RunnerState = 'move';
  stateTime = 0;

  grounded = false;
  coyote = 0;
  jumpBuffer = 0;
  diveQueued = false;
  climbStamina = C.CLIMB_TIME;
  airDiveUsed = false;
  diveCooldown = 0;
  diveGroundTime = 0;
  immune = 0;

  knockStyle: KnockStyle = 'tumble';
  knockDuration = 0;
  wallNormal = new Vector3();
  mantleFrom = new Vector3();
  mantleTo = new Vector3();
  mantleDuration = C.MANTLE_TIME;
  grappleTarget = new Vector3();
  grappleStuck = 0;

  effects: Effects = { bulldozer: 0, spring: 0, coffee: 0, pigeons: 0 };
  item: ItemKind | null = null;
  itemRoulette = 0;

  nextCheckpoint = 1;
  finishTime: number | null = null;
  place = 1;
  progress = 0;

  input: Controls = NO_INPUT;
  events: RunnerEvent[] = [];
  private contact: Contact = { landed: false, impactVy: 0, wall: null, ceiling: false };
  private wallNormalScratch = new Vector3();

  constructor(
    readonly index: number,
    readonly name: string,
    readonly color: number,
    readonly isBot: boolean,
  ) {}

  get finished() {
    return this.finishTime !== null;
  }

  get canAct() {
    return this.state === 'move' || this.state === 'climb';
  }

  setInput(controls: Controls) {
    this.input = controls;
    if (controls.jumpPressed) this.jumpBuffer = C.JUMP_BUFFER;
    if (controls.divePressed) this.diveQueued = true;
  }

  respawn(pos: Vector3, heading: number) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.heading = heading;
    this.state = 'move';
    this.stateTime = 0;
    this.grounded = false;
    this.immune = C.RESPAWN_IMMUNITY;
  }

  runSpeed(): number {
    const e = this.effects;
    return C.RUN_SPEED * (e.coffee > 0 ? 1.55 : 1) * (e.bulldozer > 0 ? 1.3 : 1) * (e.pigeons > 0 ? 0.75 : 1);
  }

  /** A hit from someone or something else, which immunity after a respawn or recovery protects against. */
  knock(style: KnockStyle, duration: number, vx: number, vy: number, vz: number): boolean {
    return this.immune <= 0 && this.fall(style, duration, vx, vy, vz);
  }

  /** Self-inflicted falls (hard landings, diving into walls) ignore immunity. */
  private fall(style: KnockStyle, duration: number, vx: number, vy: number, vz: number): boolean {
    // Already knocked runners can't be re-hit, otherwise anything that keeps overlapping them hits every frame.
    if (this.state === 'knocked' || this.effects.bulldozer > 0 || this.finished) return false;
    this.state = 'knocked';
    this.knockStyle = style;
    this.knockDuration = duration;
    this.stateTime = 0;
    this.vel.set(vx, vy, vz);
    this.grounded = false;
    return true;
  }

  startGrapple(target: Vector3) {
    this.state = 'grapple';
    this.stateTime = 0;
    this.grappleStuck = 0;
    this.grappleTarget.copy(target);
  }

  step(dt: number, world: World) {
    this.stateTime += dt;
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.diveCooldown = Math.max(0, this.diveCooldown - dt);
    this.immune = Math.max(0, this.immune - dt);
    const e = this.effects;
    e.bulldozer = Math.max(0, e.bulldozer - dt);
    e.spring = Math.max(0, e.spring - dt);
    e.coffee = Math.max(0, e.coffee - dt);
    e.pigeons = Math.max(0, e.pigeons - dt);

    switch (this.state) {
      case 'move':
        this.stepMove(dt, world);
        break;
      case 'climb':
        this.stepClimb(dt, world);
        break;
      case 'mantle':
        this.stepMantle();
        break;
      case 'dive':
        this.stepDive(dt, world);
        break;
      case 'knocked':
        this.stepKnocked(dt, world);
        break;
      case 'grapple':
        this.stepGrapple(dt, world);
        break;
    }
    this.diveQueued = false;
  }

  private setState(state: RunnerState) {
    this.state = state;
    this.stateTime = 0;
  }

  private stepMove(dt: number, world: World) {
    const inp = this.finished ? NO_INPUT : this.input;
    const turnRate = this.grounded ? C.TURN_SPEED : C.TURN_SPEED * 0.85;
    this.heading -= inp.x * turnRate * dt;
    const f = forward(this.heading, tmp);

    if (this.grounded || inp.y !== 0) {
      const target = inp.y >= 0 ? inp.y * this.runSpeed() : inp.y * C.BACK_SPEED;
      const accel = this.grounded ? C.GROUND_ACCEL : C.AIR_ACCEL;
      accelerateTowards(this.vel, f.x * target, f.z * target, accel * dt);
    }

    if (this.jumpBuffer > 0 && (this.grounded || this.coyote > 0)) {
      this.vel.y = this.effects.spring > 0 ? C.SPRING_JUMP_SPEED : C.JUMP_SPEED;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.events.push('jump');
    }

    if (this.diveQueued && this.diveCooldown <= 0 && (this.grounded || !this.airDiveUsed) && this.effects.bulldozer <= 0) {
      this.startDive();
      return;
    }

    this.applyGravity(dt);
    const wasGrounded = this.grounded;
    const hit = this.moveAndCollide(dt, world);
    this.coyote = this.grounded ? C.COYOTE_TIME : this.coyote - dt;

    if (hit.landed) {
      this.climbStamina = C.CLIMB_TIME;
      this.airDiveUsed = false;
      if (hit.impactVy < -C.HARD_LANDING_SPEED && this.fall('splat', 0.7, 0, 0, 0)) {
        this.events.push('splat');
        return;
      }
      if (hit.impactVy < -6) this.events.push('land');
    }

    if (hit.wall && inp.y > 0.3 && -(f.x * hit.wall.x + f.z * hit.wall.z) > 0.5) {
      const reach = wasGrounded ? C.VAULT_REACH : C.LEDGE_REACH;
      if (this.tryMantle(world, hit.wall, reach)) return;
      if (this.climbStamina > 0) this.startClimb(hit.wall);
    }
  }

  private startDive() {
    const f = forward(this.heading, tmp);
    const speed = Math.max(C.DIVE_SPEED, Math.hypot(this.vel.x, this.vel.z) + 3);
    this.vel.x = f.x * speed;
    this.vel.z = f.z * speed;
    this.vel.y = this.grounded ? 5 : Math.max(this.vel.y, 3);
    if (!this.grounded) this.airDiveUsed = true;
    this.diveCooldown = C.DIVE_COOLDOWN;
    this.diveGroundTime = 0;
    this.setState('dive');
    this.events.push('dive');
  }

  private stepDive(dt: number, world: World) {
    this.applyGravity(dt);
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const hit = this.moveAndCollide(dt, world);
    if (hit.wall && speed > 6 && this.stateTime < 0.6 && this.fall('bonk', 0.6, hit.wall.x * 4, 4, hit.wall.z * 4)) {
      this.events.push('bonk');
      return;
    }
    if (this.grounded) {
      this.airDiveUsed = false;
      this.climbStamina = C.CLIMB_TIME;
      this.diveGroundTime += dt;
      applyFriction(this.vel, 25 * dt);
      // Rolling straight into a jump keeps the dive's momentum.
      if (this.jumpBuffer > 0 && this.diveGroundTime > 0.03) {
        this.setState('move');
        this.vel.y = C.JUMP_SPEED;
        this.grounded = false;
        this.jumpBuffer = 0;
        this.events.push('jump');
        return;
      }
      if (this.diveGroundTime > 0.3) this.setState('move');
    }
  }

  private startClimb(n: Vector3) {
    this.setState('climb');
    this.wallNormal.copy(n);
    this.heading = headingOf(-n.x, -n.z);
    this.vel.set(0, C.CLIMB_SPEED, 0);
    this.events.push('climb');
  }

  private stepClimb(dt: number, world: World) {
    const n = this.wallNormal;
    this.climbStamina -= dt;

    if (this.jumpBuffer > 0) {
      this.jumpBuffer = 0;
      this.heading = headingOf(n.x, n.z);
      this.vel.set(n.x * C.WALL_JUMP_SPEED, C.JUMP_SPEED * 0.95, n.z * C.WALL_JUMP_SPEED);
      // Enough grip left to catch the opposite wall, so narrow alleys can be chimney-climbed.
      this.climbStamina = Math.max(this.climbStamina, 0.4);
      this.setState('move');
      this.events.push('wallJump');
      return;
    }

    if (this.input.y <= 0.1 || this.climbStamina <= 0) {
      this.vel.set(n.x * 2.5, Math.min(this.vel.y, 1), n.z * 2.5);
      this.setState('move');
      return;
    }

    this.vel.set(-n.x * 2, C.CLIMB_SPEED, -n.z * 2);
    const hit = this.moveAndCollide(dt, world);
    if (this.tryMantle(world, n, C.LEDGE_REACH)) return;
    if (hit.ceiling || !this.touchingWall(world, n)) {
      this.vel.y = Math.min(this.vel.y, 4);
      this.setState('move');
    }
  }

  private touchingWall(world: World, n: Vector3): boolean {
    const x = this.pos.x - n.x * UP_PROBE;
    const z = this.pos.z - n.z * UP_PROBE;
    const R = C.PLAYER_RADIUS;
    return !world.isFree(x - R, this.pos.y + 0.2, z - R, x + R, this.pos.y + C.PLAYER_HEIGHT - 0.1, z + R);
  }

  private tryMantle(world: World, n: Vector3, reach: number): boolean {
    const R = C.PLAYER_RADIUS;
    const H = C.PLAYER_HEIGHT;
    const tx = this.pos.x - n.x * (R + 0.4);
    const tz = this.pos.z - n.z * (R + 0.4);
    const top = world.groundBelow(tx, tz, this.pos.y + reach, 0.15);
    if (top < this.pos.y + 0.3) return false;
    if (!world.isFree(tx - R, top + 0.01, tz - R, tx + R, top + H, tz + R)) return false;
    // Nothing overhead between us and the ledge.
    const p = this.pos;
    if (!world.isFree(p.x - R + 0.05, p.y + 0.05, p.z - R + 0.05, p.x + R - 0.05, top + H, p.z + R - 0.05)) return false;

    this.mantleFrom.copy(this.pos);
    this.mantleTo.set(tx, top, tz);
    this.mantleDuration = C.MANTLE_TIME * Math.min(1.3, Math.max(0.6, (top - this.pos.y) / 1.5));
    this.vel.set(0, 0, 0);
    this.heading = headingOf(-n.x, -n.z);
    this.setState('mantle');
    this.events.push('mantle');
    return true;
  }

  private stepMantle() {
    const t = Math.min(1, this.stateTime / this.mantleDuration);
    const up = 1 - Math.pow(1 - Math.min(1, t * 1.8), 2);
    const along = t * t;
    const a = this.mantleFrom;
    const b = this.mantleTo;
    this.pos.set(a.x + (b.x - a.x) * along, a.y + (b.y - a.y) * up, a.z + (b.z - a.z) * along);
    if (t >= 1) {
      this.pos.copy(b);
      const f = forward(this.heading, tmp);
      const speed = this.runSpeed() * 0.85;
      this.vel.set(f.x * speed, 0, f.z * speed);
      this.grounded = true;
      this.climbStamina = C.CLIMB_TIME;
      this.airDiveUsed = false;
      this.setState('move');
    }
  }

  private stepKnocked(dt: number, world: World) {
    this.applyGravity(dt);
    this.moveAndCollide(dt, world, 0.5);
    if (this.grounded) applyFriction(this.vel, (this.knockStyle === 'slip' ? 6 : 18) * dt);
    if (this.stateTime >= this.knockDuration && this.grounded) {
      this.immune = C.RESPAWN_IMMUNITY;
      this.climbStamina = C.CLIMB_TIME;
      this.airDiveUsed = false;
      this.setState('move');
    }
  }

  private stepGrapple(dt: number, world: World) {
    const target = this.grappleTarget;
    tmp.set(target.x - this.pos.x, target.y - (this.pos.y + 1), target.z - this.pos.z);
    const dist = tmp.length();
    if (dist < 1.8 || this.stateTime > 3 || this.grappleStuck > 0.25) {
      this.releaseGrapple();
      return;
    }
    tmp.divideScalar(dist);
    this.heading = headingOf(tmp.x, tmp.z);
    this.vel.copy(tmp).multiplyScalar(C.GRAPPLE_SPEED);
    const before = grappleFrom.copy(this.pos);
    this.moveAndCollide(dt, world);
    const moved = before.distanceTo(this.pos);
    this.grappleStuck = moved < C.GRAPPLE_SPEED * dt * 0.3 ? this.grappleStuck + dt : 0;
  }

  private releaseGrapple() {
    const f = forward(this.heading, tmp);
    this.vel.set(f.x * 12, 7, f.z * 12);
    this.grounded = false;
    this.airDiveUsed = false;
    this.setState('move');
    this.events.push('jump');
  }

  private applyGravity(dt: number) {
    this.vel.y = Math.max(-C.MAX_FALL_SPEED, this.vel.y - C.GRAVITY * dt);
  }

  private moveAndCollide(dt: number, world: World, bounciness = 0): Contact {
    const c = this.contact;
    c.landed = false;
    c.impactVy = 0;
    c.wall = null;
    c.ceiling = false;
    const wasGrounded = this.grounded;
    this.grounded = false;

    const maxDelta = Math.max(Math.abs(this.vel.x), Math.abs(this.vel.y), Math.abs(this.vel.z)) * dt;
    const steps = Math.max(1, Math.ceil(maxDelta / 0.25));
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.moveVertical(this.vel.y * sdt, world, c);
      this.moveHorizontal('x', this.vel.x * sdt, world, c, bounciness, wasGrounded);
      this.moveHorizontal('z', this.vel.z * sdt, world, c, bounciness, wasGrounded);
    }
    c.landed = !wasGrounded && this.grounded;
    return c;
  }

  private moveVertical(d: number, world: World, c: Contact) {
    if (d === 0) return;
    const R = C.PLAYER_RADIUS;
    const H = C.PLAYER_HEIGHT;
    const p = this.pos;
    p.y += d;
    for (const b of world.query(p.x - R, p.y, p.z - R, p.x + R, p.y + H, p.z + R, scratchBoxes)) {
      if (d < 0) {
        if (b.max.y - p.y > -d + 0.05) continue;
        p.y = b.max.y;
        if (b.kind === 'bounce' && this.vel.y < -2) {
          this.vel.y = C.BOUNCE_SPEED;
          this.climbStamina = C.CLIMB_TIME;
          this.airDiveUsed = false;
          this.events.push('bounce');
        } else {
          if (this.vel.y < c.impactVy) c.impactVy = this.vel.y;
          this.vel.y = 0;
          this.grounded = true;
        }
      } else {
        if (p.y + H - b.min.y > d + 0.05) continue;
        p.y = b.min.y - H;
        this.vel.y = Math.min(this.vel.y, 0);
        c.ceiling = true;
      }
    }
  }

  private moveHorizontal(axis: 'x' | 'z', d: number, world: World, c: Contact, bounciness: number, wasGrounded: boolean) {
    if (d === 0) return;
    const R = C.PLAYER_RADIUS;
    const H = C.PLAYER_HEIGHT;
    const p = this.pos;
    p[axis] += d;
    for (const b of world.query(p.x - R, p.y + 0.01, p.z - R, p.x + R, p.y + H, p.z + R, scratchBoxes)) {
      const rise = b.max.y - p.y;
      if (
        rise <= C.STEP_HEIGHT &&
        (this.grounded || wasGrounded) &&
        world.isFree(p.x - R, b.max.y + 0.01, p.z - R, p.x + R, b.max.y + H, p.z + R)
      ) {
        p.y = b.max.y;
        continue;
      }
      const penetration = d > 0 ? p[axis] + R - b.min[axis] : b.max[axis] - (p[axis] - R);
      if (penetration > Math.abs(d) + 0.05) continue;
      p[axis] = d > 0 ? b.min[axis] - R - 1e-4 : b.max[axis] + R + 1e-4;
      this.vel[axis] = -this.vel[axis] * bounciness;
      const n = this.wallNormalScratch.set(0, 0, 0);
      n[axis] = d > 0 ? -1 : 1;
      c.wall = n;
    }
  }
}
