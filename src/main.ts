import * as THREE from 'three';
import { COURSES } from './level/courses';
import type { Level } from './level/builder';
import { Game, PLAYER_COLORS } from './game';
import { KeyboardSource, GamepadSource, KEYBOARD_SCHEMES, connectedGamepadIndices, type InputSource } from './input';
import { unlockAudio } from './audio';
import { MAX_RUNNERS } from './config';
import { Pipeline, createSky, createEnvironment, NEAR, FAR, HAZE, SUN_DIRECTION } from './render';

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.12;
// Each split-screen viewport re-renders the shadow map around its own player instead.
renderer.shadowMap.autoUpdate = false;
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// Exponential haze fades distant streets towards pale blue, which is most of what makes the town feel deep.
scene.fog = new THREE.FogExp2(HAZE, 0.0038);
scene.add(createSky());
scene.environment = createEnvironment(renderer);
scene.environmentIntensity = 0.7;
// Cool sky above and warm light bounced off pale stone below, standing in for global illumination.
scene.add(new THREE.HemisphereLight(0xd2dbe6, 0xd0b28c, 0.45));
const sun = new THREE.DirectionalLight(0xffe6c4, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 180 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.05;
sun.shadow.radius = 6;
sun.shadow.intensity = 0.85;
scene.add(sun, sun.target);
const pipeline = new Pipeline(renderer);

const builtCourses = new Map<number, Level>();
let courseIndex = 0;
let level = loadCourse(0);

function loadCourse(index: number): Level {
  let built = builtCourses.get(index);
  if (!built) {
    built = COURSES[index].build();
    builtCourses.set(index, built);
  }
  scene.add(built.group);
  return built;
}

function selectCourse(step: number) {
  scene.remove(level.group);
  courseIndex = (courseIndex + step + COURSES.length) % COURSES.length;
  level = loadCourse(courseIndex);
  renderLobby();
}

const hudRoot = document.getElementById('hud')!;
const lobbyEl = document.getElementById('lobby')!;
const slotsEl = document.getElementById('slots')!;
const cpuEl = document.getElementById('cpu')!;
const courseEl = document.getElementById('course')!;

const keyboardSources: InputSource[] = [new KeyboardSource('wasd'), new KeyboardSource('arrows')];
const gamepadSources = new Map<number, InputSource>();
let joined: InputSource[] = [];
let cpus = true;
let game: Game | null = null;
/** Last stick direction per source, so holding a direction in the lobby flips one course at a time. */
const lobbySteer = new Map<InputSource, number>();

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
      const color = '#' + PLAYER_COLORS[i].toString(16).padStart(6, '0');
      if (!s) return `<div class="slot empty"><b>P${i + 1}</b><span>Press jump to join</span></div>`;
      const controls = help[s.id] ?? 'Stick/D-pad move · A jump · X/B dive · Y/RB item';
      return `<div class="slot" style="--c:${color}"><b>P${i + 1}</b><span>${s.label}</span><small>${controls}</small></div>`;
    })
    .join('');
  const course = COURSES[courseIndex];
  courseEl.innerHTML = `<button data-step="-1">◀</button><div><b>${course.name}</b><small>${course.blurb}</small></div><button data-step="1">▶</button>`;
  const cpuCount = cpus ? MAX_RUNNERS - joined.length : 0;
  cpuEl.textContent = cpus ? `${cpuCount} CPU runner${cpuCount === 1 ? '' : 's'} (C to toggle)` : 'No CPU runners (C to toggle)';
}

courseEl.addEventListener('click', (e) => {
  const step = (e.target as HTMLElement).closest('button')?.dataset.step;
  if (step) selectCourse(Number(step));
});

function updateLobby() {
  let changed = false;
  for (const s of availableSources()) {
    const c = s.poll();
    const steer = c.x > 0.5 ? 1 : c.x < -0.5 ? -1 : 0;
    if (steer !== 0 && steer !== lobbySteer.get(s)) selectCourse(steer);
    lobbySteer.set(s, steer);
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
  lobbyCamera.position.set(start.pos.x + Math.sin(time * 0.2) * 4, start.pos.y + 15, z);
  lobbyCamera.lookAt(start.pos.x, start.pos.y + 4, z - 30);
  lobbyCamera.aspect = innerWidth / innerHeight;
  lobbyCamera.updateProjectionMatrix();
  const focus = new THREE.Vector3(start.pos.x, start.pos.y, z - 20);
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

if (import.meta.env.DEV) Object.assign(window, { debug: { renderer, get level() { return level; }, get game() { return game; }, selectCourse } });

showLobby();
frame();
