import * as THREE from 'three';
import * as C from './config';
import type { Level } from './level/builder';
import { Runner, forward } from './runner';
import { RunnerView } from './character';
import { Bot } from './bot';
import { ItemSystem } from './items';
import { Fx } from './fx';
import { Traffic } from './traffic';
import { Hud, formatTime } from './hud';
import { NO_INPUT, type InputSource } from './input';
import { sfx } from './audio';
import { NEAR, FAR, SUN_DIRECTION, type Pipeline } from './render';
import { disposeTree } from './materials';

export const PLAYER_COLORS = [0xff5a5f, 0x3a86ff, 0x2ec27e, 0xffbe0b];
const CPU_COLORS = [0x9b5de5, 0xf15bb5, 0x00bbf9, 0xff8c42, 0x8ac926];
const CPU_NAMES = ['Gizmo', 'Noodle', 'Biscuit', 'Waffles', 'Pickle'];

const CAMERA_DISTANCE = 6.5;
const CAMERA_HEIGHT = 2.4;

interface Human {
  runner: Runner;
  source: InputSource;
  camera: THREE.PerspectiveCamera;
  camYaw: number;
  pivotY: number;
  hud: Hud;
}

type Phase = 'countdown' | 'racing' | 'results';

const css = (hex: number) => '#' + hex.toString(16).padStart(6, '0');

const scratchPivot = new THREE.Vector3();
const scratchDir = new THREE.Vector3();
const scratchLook = new THREE.Vector3();

export class Game {
  readonly runners: Runner[] = [];
  private views: RunnerView[] = [];
  private humans: Human[] = [];
  private bots = new Map<Runner, Bot>();
  private items: ItemSystem;
  private fx = new Fx();
  private traffic: Traffic;
  private dynamic = new THREE.Group();
  private segmentLengths: number[];
  private resultsEl: HTMLDivElement | null = null;

  private phase: Phase = 'countdown';
  private countdown = 3.99;
  private raceTime = 0;
  private time = 0;
  private accumulator = 0;
  private firstFinish: number | null = null;
  private resultsAge = 0;
  private resultsShown = 0;

  constructor(
    private scene: THREE.Scene,
    private level: Level,
    sources: InputSource[],
    cpuCount: number,
    private hudContainer: HTMLElement,
    private onExit: (choice: 'again' | 'lobby') => void,
  ) {
    scene.add(this.dynamic);
    this.items = new ItemSystem(level, level.world, this.fx);
    this.traffic = new Traffic(level.carLanes);
    this.dynamic.add(this.items.group, this.fx.group, this.traffic.group);

    const cps = level.checkpoints;
    this.segmentLengths = cps.map((cp, i) => (i === 0 ? 1 : cp.point.distanceTo(cps[i - 1].point)));

    const total = Math.min(C.MAX_RUNNERS, sources.length + cpuCount);
    for (let i = 0; i < total; i++) {
      const human = i < sources.length;
      const color = human ? PLAYER_COLORS[i] : CPU_COLORS[(i - sources.length) % CPU_COLORS.length];
      const name = human ? `P${i + 1}` : CPU_NAMES[(i - sources.length) % CPU_NAMES.length];
      const runner = new Runner(i, name, color, !human);
      // Humans start on the back row so CPUs aren't simply stuck behind them.
      const start = level.starts[(total - 1 - i) % level.starts.length];
      runner.respawn(start.pos, start.heading);
      runner.immune = 0;
      this.runners.push(runner);
      this.views.push(new RunnerView(runner, name, this.dynamic));

      if (human) {
        const camera = new THREE.PerspectiveCamera(70, 1, NEAR, FAR);
        const hud = new Hud(hudContainer, name, css(color));
        this.humans.push({ runner, source: sources[i], camera, camYaw: start.heading, pivotY: start.pos.y + 1.7, hud });
      } else {
        this.bots.set(runner, new Bot(runner, level, level.world, this.items, 0.92 + Math.random() * 0.08));
      }
    }
  }

  dispose() {
    this.scene.remove(this.dynamic);
    disposeTree(this.dynamic);
    for (const h of this.humans) h.hud.dispose();
    this.resultsEl?.remove();
  }

  update(dt: number) {
    dt = Math.min(dt, 0.1);
    this.time += dt;

    if (this.phase === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      const after = Math.ceil(this.countdown);
      if (after !== before) sfx.beep(after === 0);
      if (this.countdown <= 0) this.phase = 'racing';
    } else {
      this.raceTime += dt;
    }

    this.readInputs(dt);

    this.accumulator += dt;
    while (this.accumulator >= C.TICK) {
      for (const r of this.runners) r.step(C.TICK, this.level.world);
      this.resolveContacts();
      this.accumulator -= C.TICK;
    }

    for (const r of this.runners) this.handleEvents(r);
    this.checkFalls();
    this.updateProgress();
    this.items.update(dt, this.time, this.runners);
    this.traffic.update(dt, this.runners);
    this.fx.update(dt);
    for (const v of this.views) {
      const r = v.runner;
      v.update(dt, this.time, this.level.world.groundBelow(r.pos.x, r.pos.z, r.pos.y + 0.5, 0.2));
    }
    for (const h of this.humans) this.updateCamera(h, dt);
    this.updateHuds();
    this.updateResults(dt);
  }

  private readInputs(dt: number) {
    const racing = this.phase === 'racing';
    for (const h of this.humans) {
      // Results reads the controllers itself; polling here would swallow its button presses.
      const controls = this.phase === 'results' ? NO_INPUT : h.source.poll();
      h.runner.setInput(racing && !h.runner.finished ? controls : NO_INPUT);
      if (racing && !h.runner.finished && controls.itemPressed) this.items.use(h.runner, this.runners);
    }
    // CPUs race on behind the results screen so their times can come in.
    for (const [runner, bot] of this.bots) {
      if (this.phase === 'countdown' || runner.finished) {
        runner.setInput(NO_INPUT);
        continue;
      }
      const controls = bot.think(dt, this.runners, () => this.respawn(runner));
      runner.setInput(controls);
      if (controls.itemPressed) this.items.use(runner, this.runners);
    }
  }

  private resolveContacts() {
    const rs = this.runners;
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i];
        const b = rs[j];
        if (Math.abs(a.pos.y - b.pos.y) > 1.5) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 2) continue;

        for (const [hitter, victim, sign] of [
          [a, b, 1],
          [b, a, -1],
        ] as const) {
          const nx = (dx / (d || 1)) * sign;
          const nz = (dz / (d || 1)) * sign;
          if (hitter.effects.bulldozer > 0 && d < 1.9) {
            if (victim.knock('tumble', 1.4, nx * 12 + hitter.vel.x * 0.5, 12, nz * 12 + hitter.vel.z * 0.5)) {
              sfx.tackle();
              this.fx.burst(victim.pos.clone().setY(victim.pos.y + 1), { color: 0xffd86b, count: 6, speed: 4 });
            }
          } else if (hitter.state === 'dive' && hitter.stateTime < 0.7 && d < 1.3) {
            if (victim.knock('tumble', 1.3, hitter.vel.x * 0.8, 7, hitter.vel.z * 0.8)) {
              sfx.tackle();
              this.fx.burst(victim.pos.clone().setY(victim.pos.y + 1), { color: 0xffffff, count: 8, speed: 4 });
            }
          }
        }

        const minD = C.PLAYER_RADIUS * 2;
        if (d < minD && d > 1e-4 && a.state !== 'knocked' && b.state !== 'knocked') {
          const push = (minD - d) / 2;
          a.pos.x -= (dx / d) * push;
          a.pos.z -= (dz / d) * push;
          b.pos.x += (dx / d) * push;
          b.pos.z += (dz / d) * push;
        }
      }
    }
  }

  private handleEvents(r: Runner) {
    const view = this.views[r.index];
    const loud = !r.isBot;
    for (const e of r.events) {
      view.onEvent(e);
      const feet = r.pos;
      switch (e) {
        case 'jump':
          if (loud) sfx.jump();
          break;
        case 'bounce':
          sfx.bounce();
          this.fx.burst(feet, { color: 0xff9ed8, size: 0.3, count: 6, speed: 3 });
          break;
        case 'land':
          if (loud) sfx.land();
          this.fx.burst(feet, { size: 0.3, count: 5, speed: 2.5, up: 0.4 });
          break;
        case 'splat':
          sfx.splat();
          this.fx.burst(feet, { size: 0.5, count: 10, speed: 5, up: 0.5 });
          break;
        case 'dive':
          if (loud) sfx.dive();
          break;
        case 'bonk':
          sfx.bonk();
          this.fx.burst(feet.clone().setY(feet.y + 1.2), { color: 0xffe14d, size: 0.2, count: 6, speed: 3 });
          break;
        case 'wallJump':
          if (loud) sfx.jump();
          this.fx.burst(feet.clone().setY(feet.y + 0.8), { size: 0.25, count: 4, speed: 2 });
          break;
      }
    }
    r.events.length = 0;
  }

  private checkFalls() {
    for (const r of this.runners) {
      if (r.pos.y > this.level.killHeight) continue;
      this.fx.burst(r.pos.clone().setY(this.level.killHeight), { color: 0xbfe8ff, size: 0.5, count: 12, speed: 4, up: 6, gravity: 15 });
      sfx.splash();
      this.respawn(r);
    }
  }

  private respawn(r: Runner) {
    const cp = this.level.checkpoints[r.nextCheckpoint - 1];
    const world = this.level.world;
    const above = cp.spawn.y + 3;
    let pos = cp.spawn.clone().addScaledVector(cp.right, ((r.index % 3) - 1) * 2.5);
    // Spread out where there's room; on a narrow ledge everyone shares the middle.
    if (!(world.groundBelow(pos.x, pos.z, above, C.PLAYER_RADIUS) > cp.spawn.y - 1)) pos = cp.spawn.clone();
    pos.y = Math.max(cp.spawn.y, world.groundBelow(pos.x, pos.z, above, C.PLAYER_RADIUS));
    r.respawn(pos, cp.heading);
    this.bots.get(r)?.onRespawn();
    this.fx.burst(pos.clone().setY(pos.y + 1), { size: 0.5, count: 10, speed: 3 });
  }

  private updateProgress() {
    const cps = this.level.checkpoints;
    const rel = scratchDir;
    for (const r of this.runners) {
      if (r.finished) continue;
      const i = r.nextCheckpoint;
      const cp = cps[i];
      rel.subVectors(r.pos, cp.point);
      const along = rel.dot(cp.dir);
      if (along >= 0 && Math.abs(rel.dot(cp.right)) < cp.halfWidth && this.phase !== 'countdown') {
        if (i === cps.length - 1) {
          this.finish(r);
          continue;
        }
        r.nextCheckpoint++;
      }
      r.progress = i - Math.min(1, Math.max(0, -along / this.segmentLengths[i]));
    }

    const order = [...this.runners].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime! - b.finishTime!;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.progress - a.progress;
    });
    order.forEach((r, i) => (r.place = i + 1));
  }

  private finish(r: Runner) {
    r.finishTime = this.raceTime;
    r.progress = this.level.checkpoints.length - 1;
    this.firstFinish ??= this.raceTime;
    this.fx.burst(r.pos.clone().setY(r.pos.y + 2), { color: 0xffd86b, size: 0.3, count: 20, speed: 8, up: 8, gravity: 12, life: 1.5 });
    this.fx.burst(r.pos.clone().setY(r.pos.y + 2), { color: 0xff5fa2, size: 0.3, count: 20, speed: 8, up: 8, gravity: 12, life: 1.5 });
    if (!r.isBot) sfx.finish();
  }

  private updateCamera(h: Human, dt: number) {
    const r = h.runner;
    const cam = h.camera;
    let diff = r.heading - h.camYaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    h.camYaw += diff * (1 - Math.exp(-3.5 * dt));
    h.pivotY += (r.pos.y + 1.7 - h.pivotY) * (1 - Math.exp(-8 * dt));

    const pivot = scratchPivot.set(r.pos.x, h.pivotY, r.pos.z);
    const offset = scratchDir.set(Math.sin(h.camYaw) * CAMERA_DISTANCE, CAMERA_HEIGHT, Math.cos(h.camYaw) * CAMERA_DISTANCE);
    const length = offset.length();
    const dir = offset.divideScalar(length);
    const hit = this.level.world.raycast(pivot, dir, length);
    const distance = hit ? Math.max(0.8, hit.distance - 0.3) : length;
    cam.position.copy(pivot).addScaledVector(dir, distance);
    cam.lookAt(forward(h.camYaw, scratchLook).multiplyScalar(3).add(pivot));

    const speed = Math.hypot(r.vel.x, r.vel.z);
    const fov = 68 + Math.max(0, speed - C.RUN_SPEED) * 1.5;
    cam.fov += (fov - cam.fov) * (1 - Math.exp(-5 * dt));
  }

  private updateHuds() {
    const total = this.runners.length;
    const finishProgress = this.level.checkpoints.length - 1;
    for (const h of this.humans) {
      const r = h.runner;
      let message = '';
      if (this.phase === 'countdown') message = this.countdown > 3 ? 'Ready…' : String(Math.ceil(this.countdown));
      else if (this.raceTime < 1) message = 'GO!';
      else if (r.finished && this.phase !== 'results') message = `Finished ${r.place}${['th', 'st', 'nd', 'rd'][r.place] ?? 'th'}!`;
      const e = r.effects;
      const effect = e.bulldozer > 0 ? '🚜 BULLDOZER!' : e.coffee > 0 ? '☕ ZOOM!' : e.spring > 0 ? '👟 BOING!' : e.pigeons > 0 ? '🐦 PIGEONS!' : '';
      h.hud.update({
        place: r.place,
        total,
        item: r.item,
        roulette: r.itemRoulette,
        time: r.finishTime ?? this.raceTime,
        dots: this.runners.map((o) => ({ progress: o.progress / finishProgress, color: css(o.color), self: o === r })),
        message,
        pigeons: e.pigeons > 0,
        effect,
      });
    }
  }

  private updateResults(dt: number) {
    if (this.phase === 'racing') {
      const humansDone = this.humans.every((h) => h.runner.finished);
      const timedOut = this.firstFinish !== null && this.raceTime - this.firstFinish > 30;
      if (humansDone || timedOut) {
        this.resultsAge = humansDone ? -2.5 : 0;
        this.phase = 'results';
      }
      return;
    }
    if (this.phase !== 'results') return;
    this.resultsAge += dt;
    if (this.resultsAge >= 0) this.showResults();
    // Poll from the start so presses made before the results are readable are drained rather than buffered.
    const presses = this.humans.map((h) => h.source.poll());
    if (this.resultsAge < 1) return;
    for (const c of presses) {
      // Several sources can report the same key (both keyboard schemes share Enter), so act only once.
      if (c.jumpPressed || c.startPressed) return this.onExit('again');
      if (c.itemPressed) return this.onExit('lobby');
    }
  }

  /** Shows the results, redrawing the table whenever another runner finishes. */
  private showResults() {
    const finished = this.runners.filter((r) => r.finished).length;
    if (this.resultsEl && finished === this.resultsShown) return;
    this.resultsShown = finished;
    const rows = [...this.runners]
      .sort((a, b) => a.place - b.place)
      .map((r) => {
        // Humans who timed out are frozen, unlike CPUs, which race on.
        const time = r.finished ? formatTime(r.finishTime!) : r.isBot ? 'still running' : 'did not finish';
        return `<li style="--c:${css(r.color)}"><b>${r.place}</b><span>${r.name}</span><em>${time}</em></li>`;
      })
      .join('');
    if (!this.resultsEl) {
      this.resultsEl = document.createElement('div');
      this.resultsEl.className = 'results';
      this.hudContainer.appendChild(this.resultsEl);
    }
    this.resultsEl.innerHTML = `<h1>Results</h1><ol>${rows}</ol><p>Jump / Enter to race again · Item to return to the lobby</p>`;
  }

  render(renderer: THREE.WebGLRenderer, pipeline: Pipeline, sun: THREE.DirectionalLight) {
    const canvas = renderer.domElement;
    const viewports = splitScreen(this.humans.length, canvas.clientWidth, canvas.clientHeight);
    pipeline.begin();
    this.humans.forEach((h, i) => {
      const vp = viewports[i];
      pipeline.view(vp.x, vp.y, vp.w, vp.h, h.camera);
      h.camera.aspect = vp.w / vp.h;
      h.camera.updateProjectionMatrix();
      h.hud.layout(vp.x, vp.y, vp.w, vp.h);

      // Each viewport gets its own tight shadow frustum around its player.
      const p = h.runner.pos;
      sun.position.copy(p).addScaledVector(SUN_DIRECTION, 70);
      sun.target.position.copy(p);
      sun.target.updateMatrixWorld();
      renderer.shadowMap.needsUpdate = true;

      for (const v of this.views) v.label.visible = v.runner !== h.runner;
      renderer.render(this.scene, h.camera);
    });
    pipeline.end();
  }
}

export function splitScreen(count: number, width: number, height: number) {
  const gap = 4;
  if (count <= 1) return [{ x: 0, y: 0, w: width, h: height }];
  if (count === 2) {
    const w = (width - gap) / 2;
    return [
      { x: 0, y: 0, w, h: height },
      { x: w + gap, y: 0, w, h: height },
    ];
  }
  const w = (width - gap) / 2;
  const h = (height - gap) / 2;
  return [
    { x: 0, y: 0, w, h },
    { x: w + gap, y: 0, w, h },
    { x: 0, y: h + gap, w, h },
    { x: w + gap, y: h + gap, w, h },
  ];
}
