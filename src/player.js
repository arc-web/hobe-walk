import * as THREE from 'three';

const EYE = 1.62;          // metres, eye height
const WALK = 3.1;          // m/s, a normal walking pace
const RUN = 6.4;
const ACCEL = 14;
const AREA_RADIUS = 600;

// ---------------------------------------------------------------------------
// A simple dog. Not a scan of Lexie yet, but she is the right size, she trots
// beside you, and she turns to face where she is going.
// ---------------------------------------------------------------------------
function makeLexie() {
  const g = new THREE.Group();
  const coat = new THREE.MeshLambertMaterial({ color: 0xc9a374 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x4a3a2c });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.5, 4, 8), coat);
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.44;
  g.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.24, 0.3), coat);
  head.position.set(0.42, 0.6, 0);
  g.add(head);

  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.14), dark);
  snout.position.set(0.58, 0.55, 0);
  g.add(snout);

  // Ears, and a tail that swings while she walks.
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.17, 4), dark);
    ear.position.set(0.38, 0.76, s * 0.1);
    g.add(ear);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.42, 6), coat);
  tail.position.set(-0.36, 0.6, 0);
  tail.rotation.z = -0.7;
  g.add(tail);

  const legs = [];
  const legGeo = new THREE.CylinderGeometry(0.045, 0.04, 0.36, 5);
  legGeo.translate(0, -0.18, 0);
  for (const [lx, lz] of [[0.19, 0.13], [0.19, -0.13], [-0.19, 0.13], [-0.19, -0.13]]) {
    const leg = new THREE.Mesh(legGeo, dark);
    leg.position.set(lx, 0.36, lz);
    g.add(leg);
    legs.push(leg);
  }

  return { group: g, legs, tail, head };
}

export function makePlayer(scene, camera, dom) {
  const rig = new THREE.Group();       // the walker's position and facing
  rig.position.set(0, 0, 6);           // stand just off the house, on the street
  scene.add(rig);

  // A visible walker, shown only in third person.
  const walker = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9b48f });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x4f7d8c });
  const trousers = new THREE.MeshLambertMaterial({ color: 0x3d4a55 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.5, 4, 8), shirt);
  torso.position.y = 1.16; walker.add(torso);
  const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.2, 4, 8), trousers);
  hips.position.y = 0.72; walker.add(hips);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 12), skin);
  skull.position.y = 1.65; walker.add(skull);
  const walkLegs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.5, 4, 8), trousers);
    leg.position.set(0, 0.42, s * 0.12);
    walker.add(leg); walkLegs.push(leg);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.42, 4, 8), skin);
    arm.position.set(0, 1.13, s * 0.27);
    walker.add(arm); walkLegs.push(arm);
  }
  walker.visible = false;
  rig.add(walker);

  // Lexie trails a little behind and to one side.
  const lexie = makeLexie();
  rig.add(lexie.group);

  // --- look ---------------------------------------------------------------
  let yaw = Math.PI, pitch = -0.04;
  let locked = false;

  function onMove(e) {
    if (!locked) return;
    yaw -= e.movementX * 0.0022;
    pitch -= e.movementY * 0.0022;
    pitch = Math.max(-1.2, Math.min(1.2, pitch));
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === dom;
  });
  dom.addEventListener('click', () => { if (!locked) dom.requestPointerLock(); });

  // --- keys ---------------------------------------------------------------
  const keys = Object.create(null);
  let thirdPerson = false;
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'KeyV') {
      thirdPerson = !thirdPerson;
      walker.visible = thirdPerson;
      if (onToggle) onToggle(thirdPerson);
    }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  let onToggle = null;

  // --- movement -----------------------------------------------------------
  const vel = new THREE.Vector2(0, 0);
  const wish = new THREE.Vector2();
  let bob = 0;
  let step = 0;

  function update(dt, elapsed) {
    wish.set(0, 0);
    if (keys['KeyW'] || keys['ArrowUp']) wish.y += 1;
    if (keys['KeyS'] || keys['ArrowDown']) wish.y -= 1;
    if (keys['KeyA'] || keys['ArrowLeft']) wish.x -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) wish.x += 1;
    if (wish.lengthSq() > 0) wish.normalize();

    // Turn the wish into world direction using the current facing.
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    const targetX = wish.y * -sin + wish.x * cos;
    const targetZ = wish.y * -cos + wish.x * -sin;
    const speed = (keys['ShiftLeft'] || keys['ShiftRight']) ? RUN : WALK;

    vel.x += (targetX * speed - vel.x) * Math.min(1, ACCEL * dt);
    vel.y += (targetZ * speed - vel.y) * Math.min(1, ACCEL * dt);

    const nx = rig.position.x + vel.x * dt;
    const nz = rig.position.z + vel.y * dt;
    const dist = Math.hypot(nx, nz);
    // Keep the walker inside the play area, where the world is still drawn.
    if (dist < AREA_RADIUS) { rig.position.x = nx; rig.position.z = nz; }
    else {
      const k = AREA_RADIUS / dist;
      rig.position.x = nx * k; rig.position.z = nz * k;
      vel.set(0, 0);
    }
    rig.rotation.y = yaw;

    const moving = vel.length() > 0.35;
    bob += dt * (moving ? vel.length() * 1.7 : 0);
    step += dt * (moving ? vel.length() * 2.6 : 1.2);
    const bounce = moving ? Math.abs(Math.sin(bob * 3.2)) * 0.045 : 0;
    const swing = moving ? Math.sin(step * 3.2) * 0.5 : 0;

    // Walk cycle on the visible body.
    walkLegs[0].rotation.x = swing;
    walkLegs[1].rotation.x = -swing;
    walkLegs[2].rotation.x = -swing;
    walkLegs[3].rotation.x = swing;

    // Lexie: a trot that follows the walker with a small lag.
    lexie.group.position.set(-0.15, Math.abs(Math.sin(step * 3.2)) * 0.04, -1.25);
    lexie.group.rotation.y = Math.sin(elapsed * 0.7) * 0.12;
    lexie.tail.rotation.y = Math.sin(step * 5.5) * 0.6;
    lexie.head.rotation.y = Math.sin(elapsed * 1.3) * 0.25;
    for (let i = 0; i < lexie.legs.length; i++) {
      lexie.legs[i].rotation.x = Math.sin(step * 5.5 + i * 1.9) * 0.7;
    }

    // Camera
    if (thirdPerson) {
      const back = 4.4, up = 2.15 + pitch * 1.2;
      camera.position.set(
        rig.position.x + Math.sin(yaw) * back,
        up,
        rig.position.z + Math.cos(yaw) * back,
      );
      camera.lookAt(rig.position.x, rig.position.y + 1.25, rig.position.z);
    } else {
      camera.position.set(rig.position.x, EYE + bounce, rig.position.z);
      camera.rotation.set(pitch, yaw + Math.PI, 0, 'YXZ');
    }
  }

  return {
    rig,
    update,
    get thirdPerson() { return thirdPerson; },
    set onToggle(fn) { onToggle = fn; },
    get facing() { return yaw; },
  };
}
