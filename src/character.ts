import * as THREE from 'three';
import type { Runner } from './runner';
import { plastic } from './materials';
import { RUN_SPEED } from './config';

const SKIN_TONES = [0xffd1a8, 0xc68a5e, 0xf2b98e, 0x8d5a3b, 0xffe0c2, 0xa86f48];
export type Hat = 'cap' | 'beanie' | 'propeller' | 'tophat' | 'mohawk' | 'headband';
export const HATS: Hat[] = ['cap', 'propeller', 'beanie', 'tophat', 'mohawk', 'headband'];

function part(geom: THREE.BufferGeometry, color: number, material: THREE.Material = plastic(color)): THREE.Mesh {
  const mesh = new THREE.Mesh(geom, material);
  mesh.castShadow = true;
  return mesh;
}

function limb(radius: number, length: number, color: number, footColor?: number, handColor?: number): { pivot: THREE.Group; mesh: THREE.Mesh } {
  const pivot = new THREE.Group();
  const mesh = part(new THREE.CapsuleGeometry(radius, length, 6, 14), color);
  mesh.position.y = -length / 2 - radius * 0.5;
  pivot.add(mesh);
  if (footColor !== undefined) {
    const foot = part(new THREE.SphereGeometry(radius * 1.35, 16, 12).scale(1, 0.7, 1.5), footColor);
    foot.position.set(0, -length - radius, -radius * 0.6);
    pivot.add(foot);
  }
  if (handColor !== undefined) {
    const hand = part(new THREE.SphereGeometry(radius * 1.45, 16, 12), handColor);
    hand.position.y = -length - radius * 0.8;
    pivot.add(hand);
  }
  return { pivot, mesh };
}

function makeHat(hat: Hat, color: number): THREE.Object3D {
  const g = new THREE.Group();
  const accent = new THREE.Color(color).offsetHSL(0.5, 0, 0).getHex();
  switch (hat) {
    case 'cap': {
      const dome = part(new THREE.SphereGeometry(0.38, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), color);
      const brim = part(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 16).scale(1, 1, 1.4), color);
      brim.position.set(0, 0.02, -0.3);
      g.add(dome, brim);
      break;
    }
    case 'propeller': {
      const dome = part(new THREE.SphereGeometry(0.38, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0xff5050);
      const stalk = part(new THREE.CylinderGeometry(0.03, 0.03, 0.2), 0x333333);
      stalk.position.y = 0.45;
      const blades = new THREE.Group();
      blades.name = 'spin';
      blades.position.y = 0.55;
      for (const c of [0xffd86b, 0x7cc4ff]) {
        const blade = part(new THREE.BoxGeometry(0.6, 0.02, 0.1), c);
        blade.rotation.y = c === 0xffd86b ? 0 : Math.PI / 2;
        blades.add(blade);
      }
      g.add(dome, stalk, blades);
      break;
    }
    case 'beanie': {
      const dome = part(new THREE.SphereGeometry(0.39, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.25, 1), color);
      const pom = part(new THREE.SphereGeometry(0.12, 10, 8), accent);
      pom.position.y = 0.5;
      g.add(dome, pom);
      break;
    }
    case 'tophat': {
      const brim = part(new THREE.CylinderGeometry(0.45, 0.45, 0.04, 16), 0x222233);
      const crown = part(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 16), 0x222233);
      crown.position.y = 0.25;
      const band = part(new THREE.CylinderGeometry(0.29, 0.29, 0.08, 16), color);
      band.position.y = 0.06;
      g.add(brim, crown, band);
      g.position.y = 0.12;
      break;
    }
    case 'mohawk': {
      for (let i = 0; i < 5; i++) {
        const spike = part(new THREE.ConeGeometry(0.08, 0.35, 6), color);
        spike.position.set(0, 0.25, -0.25 + i * 0.13);
        spike.rotation.x = -0.3 + i * 0.15;
        g.add(spike);
      }
      break;
    }
    case 'headband': {
      const band = part(new THREE.TorusGeometry(0.37, 0.05, 6, 20).rotateX(Math.PI / 2), color);
      band.position.y = -0.02;
      const tail = part(new THREE.BoxGeometry(0.06, 0.06, 0.35), color);
      tail.position.set(0.1, -0.05, 0.42);
      tail.rotation.x = -0.5;
      g.add(band, tail);
      break;
    }
  }
  return g;
}

function makeBulldozer(): THREE.Group {
  const g = new THREE.Group();
  const yellow = 0xffc93c;
  const body = part(new THREE.BoxGeometry(2, 1.1, 2.4), yellow);
  body.position.y = 0.95;
  const cab = part(new THREE.BoxGeometry(1.5, 1, 1.2), yellow);
  cab.position.set(0, 1.9, 0.5);
  const window = part(new THREE.BoxGeometry(1.3, 0.6, 1.25), 0x8fd3ff);
  window.position.set(0, 1.95, 0.5);
  const blade = part(new THREE.BoxGeometry(2.8, 1.1, 0.25), 0x8a8f99);
  blade.position.set(0, 0.6, -1.65);
  blade.rotation.x = -0.2;
  for (const x of [-1.05, 1.05]) {
    const track = part(new THREE.BoxGeometry(0.5, 0.7, 2.8), 0x333340);
    track.position.set(x, 0.35, 0);
    g.add(track);
  }
  const stack = part(new THREE.CylinderGeometry(0.1, 0.12, 0.8), 0x444444);
  stack.position.set(0.6, 2, -0.6);
  g.add(body, cab, window, blade, stack);
  return g;
}

function makePigeon(): THREE.Group {
  const g = new THREE.Group();
  const body = part(new THREE.SphereGeometry(0.22, 10, 8).scale(1, 0.85, 1.3), 0x9aa3b5);
  const head = part(new THREE.SphereGeometry(0.13, 10, 8), 0x7d879b);
  head.position.set(0, 0.17, -0.22);
  const beak = part(new THREE.ConeGeometry(0.04, 0.12, 6).rotateX(-Math.PI / 2), 0xffb347);
  beak.position.set(0, 0.15, -0.37);
  g.add(body, head, beak);
  for (const side of [-1, 1]) {
    const wing = part(new THREE.BoxGeometry(0.35, 0.03, 0.22), 0x8a93a6);
    wing.geometry.translate(side * 0.17, 0, 0);
    wing.position.set(side * 0.12, 0.06, 0);
    wing.name = side < 0 ? 'wingL' : 'wingR';
    g.add(wing);
  }
  return g;
}

/** A name tag: white text on a pill in the runner's colour, like the player plaques in the lobby. */
function makeLabel(text: string, color: number): THREE.Sprite {
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = "700 30px 'Atkinson Hyperlegible', system-ui, sans-serif";
  g.font = font;
  const h = 44;
  const w = Math.ceil(g.measureText(text).width) + 28;
  c.width = w + 4;
  c.height = h + 4;
  g.font = font;
  g.fillStyle = '#' + new THREE.Color(color).getHexString();
  g.beginPath();
  g.roundRect(2, 2, w, h, h / 2);
  g.fill();
  g.lineWidth = 2.5;
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.stroke();
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true }));
  const scale = 0.2 / c.height;
  sprite.scale.set(c.width * scale * 1.5, c.height * scale * 1.5, 1);
  sprite.renderOrder = 10;
  return sprite;
}

let blob: THREE.Texture | null = null;
/** Soft-edged contact shadow; it stays even with real shadows because it shows exactly where you'll land. */
function blobTexture(): THREE.Texture {
  if (blob) return blob;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, '#fff');
  grad.addColorStop(0.5, '#bbb');
  grad.addColorStop(1, '#000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  blob = new THREE.CanvasTexture(c);
  return blob;
}

const tmpColor = new THREE.Color();

/** Chunky little runner built from primitives, animated procedurally from the simulation state. */
export class RunnerView {
  readonly root = new THREE.Group();
  readonly label: THREE.Sprite;
  private body = new THREE.Group();
  private human = new THREE.Group();
  private head = new THREE.Group();
  private torso: THREE.Mesh;
  private pupils: THREE.Mesh[] = [];
  private legL: THREE.Group;
  private legR: THREE.Group;
  private armL: THREE.Group;
  private armR: THREE.Group;
  private springs = new THREE.Group();
  private dozer = makeBulldozer();
  private pigeons = new THREE.Group();
  private stars = new THREE.Group();
  private shadow: THREE.Mesh;
  private rope: THREE.Mesh;
  private propeller: THREE.Object3D | undefined;

  private phase = 0;
  private squash = 1;
  private squashVel = 0;
  private tumble = new THREE.Euler();
  private pupilOffset = new THREE.Vector2();
  private pupilVel = new THREE.Vector2();
  private lastVel = new THREE.Vector3();

  constructor(readonly runner: Runner, labelText: string, scene: THREE.Object3D) {
    const color = runner.color;
    const skin = SKIN_TONES[runner.index % SKIN_TONES.length];
    const shorts = tmpColor.set(color).multiplyScalar(0.55).getHex();

    this.torso = part(new THREE.CapsuleGeometry(0.33, 0.3, 10, 24), color);
    this.torso.position.y = 1.0;
    const belly = part(new THREE.SphereGeometry(0.2, 10, 8).scale(1, 1, 0.5), 0xffffff);
    belly.position.set(0, -0.03, -0.27);
    this.torso.add(belly);

    const headMesh = part(new THREE.SphereGeometry(0.37, 32, 24), skin);
    this.head.add(headMesh);
    for (const side of [-1, 1]) {
      const eye = part(new THREE.SphereGeometry(0.13, 20, 14), 0xffffff);
      eye.position.set(side * 0.14, 0.06, -0.29);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), plastic(0x111111));
      pupil.position.set(0, 0, -0.1);
      eye.add(pupil);
      this.pupils.push(pupil);
      this.head.add(eye);
    }
    const nose = part(new THREE.SphereGeometry(0.07, 8, 6), tmpColor.set(skin).multiplyScalar(0.85).getHex());
    nose.position.set(0, -0.06, -0.37);
    this.head.add(nose);
    const mouth = part(new THREE.TorusGeometry(0.1, 0.022, 6, 14, Math.PI).rotateZ(Math.PI).rotateX(0.35), 0x5a2a2a);
    mouth.position.set(0, -0.12, -0.335);
    this.head.add(mouth);
    const hat = makeHat(HATS[runner.index % HATS.length], color);
    hat.position.y += 0.1;
    this.head.add(hat);
    this.propeller = hat.getObjectByName('spin');
    this.head.position.y = 1.55;

    const legL = limb(0.13, 0.38, shorts, 0xffffff);
    const legR = limb(0.13, 0.38, shorts, 0xffffff);
    this.legL = legL.pivot;
    this.legR = legR.pivot;
    this.legL.position.set(-0.16, 0.72, 0);
    this.legR.position.set(0.16, 0.72, 0);
    const armL = limb(0.1, 0.36, color, undefined, skin);
    const armR = limb(0.1, 0.36, color, undefined, skin);
    this.armL = armL.pivot;
    this.armR = armR.pivot;
    this.armL.position.set(-0.42, 1.22, 0);
    this.armR.position.set(0.42, 1.22, 0);

    for (const side of [-1, 1]) {
      const spring = part(new THREE.TorusGeometry(0.12, 0.035, 6, 12).rotateX(Math.PI / 2), 0xb0b8c8);
      for (let i = 0; i < 4; i++) {
        const coil = spring.clone();
        coil.position.set(side * 0.16, -0.05 - i * 0.1, -0.05);
        this.springs.add(coil);
      }
    }
    this.springs.visible = false;

    this.human.add(this.torso, this.head, this.legL, this.legR, this.armL, this.armR, this.springs);
    // Hips are the pivot so tumbles and dives rotate around the middle of the body.
    this.human.position.y = -0.85;
    this.body.position.y = 0.85;
    this.body.add(this.human);
    this.root.add(this.body);

    this.dozer.visible = false;
    this.root.add(this.dozer);

    for (let i = 0; i < 5; i++) this.pigeons.add(makePigeon());
    this.pigeons.visible = false;
    this.root.add(this.pigeons);

    for (let i = 0; i < 3; i++) {
      const star = part(new THREE.OctahedronGeometry(0.12), 0xffe14d);
      this.stars.add(star);
    }
    this.stars.visible = false;
    this.root.add(this.stars);

    this.label = makeLabel(labelText, color);
    this.label.position.y = 2.6;
    this.root.add(this.label);

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 1.2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x2a1f4a, alphaMap: blobTexture(), transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.shadow.renderOrder = 1;
    scene.add(this.shadow);

    this.rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 5).translate(0, 0.5, 0).rotateX(Math.PI / 2), plastic(0x6b4a2b));
    this.rope.visible = false;
    scene.add(this.rope);

    scene.add(this.root);
  }

  onEvent(event: string) {
    if (event === 'jump' || event === 'bounce' || event === 'wallJump') this.squashVel = 6;
    if (event === 'land' || event === 'mantle') this.squashVel = -5;
  }

  update(dt: number, time: number, groundY: number) {
    const r = this.runner;
    this.root.position.copy(r.pos);
    this.root.rotation.y = r.heading;

    const dozing = r.effects.bulldozer > 0;
    this.dozer.visible = dozing;
    this.torso.visible = this.legL.visible = this.legR.visible = this.armL.visible = this.armR.visible = !dozing;
    this.springs.visible = r.effects.spring > 0 && !dozing;

    const speed = Math.hypot(r.vel.x, r.vel.z);
    const run = Math.min(1, speed / RUN_SPEED);
    let legL = 0;
    let legR = 0;
    let armLx = 0;
    let armRx = 0;
    let armLz = 0.15;
    let armRz = 0.15;
    let pitch = 0;
    let bob = 0;
    let bodyY = 0.85;
    let flat = 1;

    this.squashVel += (1 - this.squash) * 180 * dt - this.squashVel * 10 * dt;
    this.squash += this.squashVel * dt;

    switch (r.state) {
      case 'move':
        if (r.finished && r.grounded) {
          // Victory hop.
          armLx = armRx = Math.PI;
          armLz = 0.4;
          armRz = 0.4;
          bob = Math.abs(Math.sin(time * 8)) * 0.3;
        } else if (r.grounded) {
          this.phase += speed * dt * 1.6;
          const s = Math.sin(this.phase);
          legL = s * 1.0 * run;
          legR = -s * 1.0 * run;
          armLx = -s * 1.1 * run;
          armRx = s * 1.1 * run;
          pitch = -0.25 * run;
          bob = Math.abs(Math.cos(this.phase)) * 0.12 * run;
        } else {
          legL = 0.9;
          legR = -0.2;
          if (r.vel.y < 0) {
            // Panicked windmilling on the way down.
            armLx = time * 18;
            armRx = time * 18 + Math.PI;
            armLz = 0.5;
            armRz = 0.5;
          } else {
            armLx = armRx = 2.6;
            armLz = 0.5;
            armRz = 0.5;
          }
          pitch = -0.1;
        }
        break;
      case 'climb': {
        const s = Math.sin(r.stateTime * 16);
        armLx = 2.8 + s * 0.4;
        armRx = 2.8 - s * 0.4;
        legL = 0.6 + s * 0.6;
        legR = 0.6 - s * 0.6;
        pitch = 0.1;
        break;
      }
      case 'mantle':
        armLx = armRx = 2.2;
        legL = 1.4;
        legR = 0.6;
        pitch = -0.4;
        break;
      case 'dive':
        pitch = r.grounded ? -1.45 : -1.25;
        armLx = armRx = Math.PI;
        armLz = 0.2;
        armRz = 0.2;
        legL = legR = -0.2;
        bodyY = r.grounded ? 0.35 : 0.85;
        break;
      case 'grapple':
        armRx = Math.PI;
        armLx = 0.3;
        armLz = 0.8;
        legL = 0.4;
        legR = -0.3;
        break;
      case 'knocked':
        if (r.knockStyle === 'splat') {
          flat = 0.25;
          armLz = 1.5;
          armRz = 1.5;
          bodyY = 0.25;
        } else if (r.knockStyle === 'slip') {
          this.tumble.y += dt * 18;
          pitch = 0.5;
          armLx = time * 20;
          armRx = -time * 20;
          armLz = 1;
          armRz = 1;
        } else if (!r.grounded) {
          this.tumble.x += dt * 11;
          this.tumble.z += dt * 4;
          armLz = 1.4;
          armRz = 1.4;
          legL = 0.5;
          legR = -0.5;
        } else {
          // Flat on their back, limbs splayed.
          this.tumble.set(0, 0, 0);
          pitch = Math.PI / 2;
          bodyY = 0.3;
          armLz = 1.3;
          armRz = 1.3;
          legL = 0.2;
          legR = -0.2;
        }
        break;
    }
    if (r.state !== 'knocked') this.tumble.set(0, 0, 0);

    const blend = 1 - Math.exp(-20 * dt);
    const lerp = (obj: THREE.Object3D, axis: 'x' | 'z', target: number) => {
      obj.rotation[axis] += (target - obj.rotation[axis]) * blend;
    };
    lerp(this.legL, 'x', legL);
    lerp(this.legR, 'x', legR);
    // Windmilling angles grow without bound, so set those directly rather than easing towards them.
    if (Math.abs(armLx) > 4) this.armL.rotation.x = armLx;
    else lerp(this.armL, 'x', armLx);
    if (Math.abs(armRx) > 4) this.armR.rotation.x = armRx;
    else lerp(this.armR, 'x', armRx);
    // Positive spread values mean "away from the body" for both arms.
    lerp(this.armL, 'z', -armLz);
    lerp(this.armR, 'z', armRz);

    this.body.position.y += (bodyY + bob - this.body.position.y) * blend;
    this.body.rotation.x = this.tumble.x + pitch;
    this.body.rotation.y = this.tumble.y;
    this.body.rotation.z = this.tumble.z;
    const sq = this.squash * flat;
    this.body.scale.set(1 / Math.sqrt(Math.max(0.2, sq)), sq, 1 / Math.sqrt(Math.max(0.2, sq)));

    if (r.effects.coffee > 0) this.body.position.x = (Math.random() - 0.5) * 0.08;
    else this.body.position.x = 0;

    if (dozing) {
      this.human.position.set(0, 0.2, 0.5);
      this.dozer.position.y = Math.abs(Math.sin(time * 30)) * 0.04;
    } else {
      this.human.position.set(0, -0.85, 0);
    }

    if (this.propeller) this.propeller.rotation.y += dt * (6 + speed * 3);

    this.updateEyes(dt, r);
    this.updatePigeons(r, time);

    this.stars.visible = r.state === 'knocked';
    if (this.stars.visible) {
      this.stars.children.forEach((star, i) => {
        const a = time * 5 + (i * Math.PI * 2) / 3;
        star.position.set(Math.cos(a) * 0.45, bodyY + 1.25, Math.sin(a) * 0.45);
        star.rotation.y = time * 6;
      });
    }

    const height = r.pos.y - groundY;
    this.shadow.visible = Number.isFinite(groundY) && height < 25;
    this.shadow.position.set(r.pos.x, groundY + 0.03, r.pos.z);
    this.shadow.scale.setScalar(dozing ? 2.6 : Math.max(0.4, 1 - height * 0.04));

    this.rope.visible = r.state === 'grapple';
    if (this.rope.visible) {
      const hand = new THREE.Vector3(0, 1.9, 0).applyMatrix4(this.root.matrixWorld);
      this.rope.position.copy(hand);
      this.rope.lookAt(r.grappleTarget);
      this.rope.scale.set(1, 1, hand.distanceTo(r.grappleTarget));
    }
  }

  private updateEyes(dt: number, r: Runner) {
    // Googly pupils lag behind acceleration.
    const ax = (r.vel.x - this.lastVel.x) / Math.max(dt, 1e-3);
    const ay = (r.vel.y - this.lastVel.y) / Math.max(dt, 1e-3);
    this.lastVel.copy(r.vel);
    this.pupilVel.x += (-this.pupilOffset.x * 300 - this.pupilVel.x * 8 - ax * 0.05) * dt;
    this.pupilVel.y += (-this.pupilOffset.y * 300 - this.pupilVel.y * 8 - ay * 0.05) * dt;
    this.pupilOffset.addScaledVector(this.pupilVel, dt);
    this.pupilOffset.clampLength(0, 0.06);
    const dizzy = r.state === 'knocked';
    this.pupils.forEach((p, i) => {
      if (dizzy) {
        const a = performance.now() / 80 + i * Math.PI;
        p.position.set(Math.cos(a) * 0.05, Math.sin(a) * 0.05, -0.09);
      } else {
        p.position.set(this.pupilOffset.x * 0.5, this.pupilOffset.y, -0.1);
      }
    });
  }

  private updatePigeons(r: Runner, time: number) {
    this.pigeons.visible = r.effects.pigeons > 0;
    if (!this.pigeons.visible) return;
    this.pigeons.children.forEach((pigeon, i) => {
      const a = time * 3.5 + (i * Math.PI * 2) / 5;
      const radius = 0.55 + Math.sin(time * 5 + i) * 0.1;
      pigeon.position.set(Math.cos(a) * radius, 1.6 + Math.sin(time * 7 + i * 2) * 0.25, Math.sin(a) * radius);
      pigeon.rotation.y = -a;
      const flap = Math.sin(time * 40 + i) * 0.8;
      pigeon.getObjectByName('wingL')!.rotation.z = flap;
      pigeon.getObjectByName('wingR')!.rotation.z = -flap;
    });
  }
}
