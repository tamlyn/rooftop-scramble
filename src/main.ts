import * as THREE from 'three';
import { buildCity } from './level/city';
import { Game, PLAYER_COLOURS } from './game';
import { KeyboardSource, GamepadSource, KEYBOARD_SCHEMES, connectedGamepadIndices, type InputSource } from './input';
import { unlockAudio } from './audio';
import { MAX_RUNNERS } from './config';
import { matte } from './materials';
import { Pipeline, createSky, createEnvironment, NEAR, FAR, SKY_HORIZON, SUN_DIRECTION } from './render';

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;
// Each split-screen viewport re-renders the shadow map around its own player instead.
renderer.shadowMap.autoUpdate = false;
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(SKY_HORIZON, 70, 330);
scene.add(createSky());
scene.environment = createEnvironment(renderer);
scene.environmentIntensity = 0.85;
// A faint violet fill keeps shadows colourful rather than grey.
scene.add(new THREE.HemisphereLight(0xb8c8ff, 0x9a80c0, 0.35));
const sun = new THREE.DirectionalLight(0xfff0d8, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 180 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.05;
sun.shadow.radius = 3;
sun.shadow.intensity = 0.85;
scene.add(sun, sun.target);
const pipeline = new Pipeline(renderer);

const level = buildCity();
scene.add(level.group);
addClouds(scene);

function addClouds(target: THREE.Scene) {
  const mat = matte(0xffffff, { emissive: 0x8a8aa8, roughness: 1 });
  // Flat-bottomed puffs read as cartoon cumulus rather than floating balls.
  const geom = new THREE.IcosahedronGeometry(1, 2);
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, Math.max(pos.getY(i), -0.25));
  geom.computeVertexNormals();
  const min = new THREE.Vector3(Infinity, 0, Infinity);
  const max = new THREE.Vector3(-Infinity, 0, -Infinity);
  for (const cp of level.checkpoints) {
    min.min(cp.point);
    max.max(cp.point);
  }
  for (let i = 0; i < 40; i++) {
    const cloud = new THREE.Group();
    const n = 3 + Math.floor(Math.random() * 4);
    for (let j = 0; j < n; j++) {
      const puff = new THREE.Mesh(geom, mat);
      const size = 2.5 + Math.random() * 2 + (j > 0 && j < n - 1 ? 1.5 : 0);
      puff.position.set(j * 3 - n * 1.5, size * 0.25, (Math.random() - 0.5) * 3);
      puff.scale.setScalar(size);
      cloud.add(puff);
    }
    cloud.position.set(
      min.x - 80 + Math.random() * (max.x - min.x + 160),
      45 + Math.random() * 30,
      min.z - 80 + Math.random() * (max.z - min.z + 160),
    );
    target.add(cloud);
  }
}

const hudRoot = document.getElementById('hud')!;
const lobbyEl = document.getElementById('lobby')!;
const slotsEl = document.getElementById('slots')!;
const cpuEl = document.getElementById('cpu')!;

const keyboardSources: InputSource[] = [new KeyboardSource('wasd'), new KeyboardSource('arrows')];
const gamepadSources = new Map<number, InputSource>();
let joined: InputSource[] = [];
let cpus = true;
let game: Game | null = null;

function availableSources(): InputSource[] {
  for (const i of connectedGamepadIndices()) {
    if (!gamepadSources.has(i)) gamepadSources.set(i, new GamepadSource(i));
  }
  return [...keyboardSources, ...gamepadSources.values()];
}

function renderLobby() {
  const help: Record<string, string> = {
    'kb-wasd': KEYBOARD_SCHEMES.wasd.help,
    'kb-arrows': KEYBOARD_SCHEMES.arrows.help,
  };
  slotsEl.innerHTML = [0, 1, 2, 3]
    .map((i) => {
      const s = joined[i];
      const colour = '#' + PLAYER_COLOURS[i].toString(16).padStart(6, '0');
      if (!s) return `<div class="slot empty"><b>P${i + 1}</b><span>Press jump to join</span></div>`;
      const controls = help[s.id] ?? 'Stick/D-pad move · A jump · X/B dive · Y/RB item';
      return `<div class="slot" style="--c:${colour}"><b>P${i + 1}</b><span>${s.label}</span><small>${controls}</small></div>`;
    })
    .join('');
  const cpuCount = cpus ? MAX_RUNNERS - joined.length : 0;
  cpuEl.textContent = cpus ? `${cpuCount} CPU runner${cpuCount === 1 ? '' : 's'} (C to toggle)` : 'No CPU runners (C to toggle)';
}

function updateLobby() {
  let changed = false;
  for (const s of availableSources()) {
    const c = s.poll();
    const isIn = joined.includes(s);
    if (c.jumpPressed && !isIn && joined.length < 4) {
      joined.push(s);
      changed = true;
    } else if (c.itemPressed && isIn) {
      joined = joined.filter((j) => j !== s);
      changed = true;
    } else if (c.startPressed && joined.length > 0) {
      startRace();
      return;
    }
  }
  if (changed) {
    unlockAudio();
    renderLobby();
  }
}

function startRace() {
  unlockAudio();
  lobbyEl.hidden = true;
  game = new Game(scene, level, joined, cpus ? MAX_RUNNERS - joined.length : 0, hudRoot, (choice) => {
    game?.dispose();
    game = null;
    if (choice === 'again') startRace();
    else showLobby();
  });
}

function showLobby() {
  lobbyEl.hidden = false;
  renderLobby();
}

addEventListener('keydown', (e) => {
  unlockAudio();
  if (e.code === 'KeyC' && !game) {
    cpus = !cpus;
    renderLobby();
  }
  if (e.code === 'Escape' && game) {
    game.dispose();
    game = null;
    showLobby();
  }
});

const lobbyCamera = new THREE.PerspectiveCamera(55, 1, NEAR, FAR);
function renderLobbyScene(time: number) {
  // Drift slowly up the high street, above the rooftops.
  const start = level.starts[0];
  const z = start.pos.z + 6 - ((time * 3) % 70);
  lobbyCamera.position.set(start.pos.x + Math.sin(time * 0.2) * 4, 15, z);
  lobbyCamera.lookAt(start.pos.x, 4, z - 30);
  lobbyCamera.aspect = innerWidth / innerHeight;
  lobbyCamera.updateProjectionMatrix();
  const focus = new THREE.Vector3(start.pos.x, 0, z - 20);
  sun.position.copy(focus).addScaledVector(SUN_DIRECTION, 70);
  sun.target.position.copy(focus);
  sun.target.updateMatrixWorld();
  renderer.shadowMap.needsUpdate = true;
  pipeline.begin();
  pipeline.view(0, 0, innerWidth, innerHeight, lobbyCamera);
  renderer.render(scene, lobbyCamera);
  pipeline.end();
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  pipeline.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
function frame() {
  const dt = clock.getDelta();
  level.animate(clock.elapsedTime);
  if (game) {
    game.update(dt);
    game?.render(renderer, pipeline, sun);
  } else {
    updateLobby();
    if (!game) renderLobbyScene(clock.elapsedTime);
  }
  requestAnimationFrame(frame);
}

if (import.meta.env.DEV) Object.assign(window, { debug: { level, get game() { return game; } } });

showLobby();
frame();
