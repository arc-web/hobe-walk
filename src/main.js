import * as THREE from 'three';
import { buildWorld } from './world.js';
import { makePlayer } from './player.js';
import { AREA_RADIUS } from './data/streets.js';

const boot = document.getElementById('boot');
const start = document.getElementById('start');
const go = document.getElementById('go');
const hud = document.getElementById('hud');
const streetEl = document.getElementById('street');
const modeEl = document.getElementById('mode');

// ---------------------------------------------------------------------------
// Renderer. WebGPU when the browser offers it, WebGL2 when it does not, so the
// page opens on a machine that has one and not the other.
// ---------------------------------------------------------------------------
async function makeRenderer() {
  let renderer = null;
  let backend = 'WebGL2';
  if (navigator.gpu) {
    try {
      const mod = await import('three/webgpu');
      renderer = new mod.WebGPURenderer({ antialias: true });
      await renderer.init();
      backend = 'WebGPU';
    } catch (err) {
      console.warn('WebGPU unavailable, using WebGL2:', err);
      renderer = null;
    }
  }
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    backend = 'WebGL2';
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (renderer.toneMapping !== undefined) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
  }
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return { renderer, backend };
}

const { renderer, backend } = await makeRenderer();
document.body.appendChild(renderer.domElement ?? renderer.domElement);

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
// Fog near the edge of the play area is the taper: the world fades to plain
// white space instead of showing an edge, the way the brief asked for.
scene.fog = new THREE.Fog(0xd9e4ea, AREA_RADIUS * 0.62, AREA_RADIUS * 1.02);
scene.background = new THREE.Color(0xd9e4ea);

const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.1, 3000);

// Florida daylight: a warm key from the south east, a cool fill from the sky.
const sun = new THREE.DirectionalLight(0xfff1dc, 2.05);
sun.position.set(220, 260, -160);
// The sun casts, so the palms and the houses stand on the ground instead of
// floating above it. The shadow camera only covers the play area, which keeps
// the map sharp.
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -AREA_RADIUS;
sun.shadow.camera.right = AREA_RADIUS;
sun.shadow.camera.top = AREA_RADIUS;
sun.shadow.camera.bottom = -AREA_RADIUS;
sun.shadow.camera.near = 40;
sun.shadow.camera.far = 900;
sun.shadow.bias = -0.0012;
sun.shadow.normalBias = 0.6;
scene.add(sun);
scene.add(sun.target);
const sky = new THREE.HemisphereLight(0xcfe3ee, 0x6b6a52, 1.25);
scene.add(sky);
scene.add(new THREE.AmbientLight(0xffffff, 0.28));

const world = buildWorld(scene);
const player = makePlayer(scene, camera, renderer.domElement);

player.onToggle = (third) => {
  modeEl.textContent = third ? 'Third person' : 'First person';
};

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let running = false;
let streetTimer = 0;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;
  if (!running) return;

  player.update(dt, elapsed);

  // The corner readout changes slowly. Reading the whole road network every
  // frame would cost more than the scene.
  streetTimer += dt;
  if (streetTimer > 0.35) {
    streetTimer = 0;
    const name = world.streetAt(player.rig.position.x, player.rig.position.z);
    if (name) streetEl.textContent = name;
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function begin() {
  start.classList.add('gone');
  hud.classList.add('on');
  running = true;
  renderer.domElement.requestPointerLock?.();
}

go.addEventListener('click', begin);
start.addEventListener('click', (e) => { if (e.target === start) begin(); });

// Render one frame while the cover is up, so the scene is warm behind it.
clock.start();
frame();
boot.classList.add('gone');

// Report the truth about what loaded, so the build can be checked by a machine
// and not only by eye.
window.__hobe = {
  ready: true,
  backend,
  stats: world.stats,
  position: () => [player.rig.position.x, player.rig.position.z],
  street: () => world.streetAt(player.rig.position.x, player.rig.position.z),
  view: () => (player.thirdPerson ? 'third' : 'first'),
  toggle: () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' }));
  },
  begin: () => begin(),
};
