import * as THREE from 'three';

const EYE = 1.62;          // metres, eye height
const WALK = 3.1;          // m/s, a normal walking pace
const RUN = 6.4;
const ACCEL = 14;
const AREA_RADIUS = 600;

// ---------------------------------------------------------------------------
// Lexie.
//
// She is not a prop hanging off the walker. She has her own position in the
// world, her own speed, her own turning, and a mind that picks what to do next
// several times a second. The walker can call her but cannot steer her, which is
// the difference between a dog on a walk and a hat with legs.
// ---------------------------------------------------------------------------
const DOG = {
  trot: 3.3,      // m/s, the pace she keeps to stay with a walker
  dash: 5.5,      // m/s, when she has decided to go somewhere herself
  amble: 1.4,     // m/s, sniffing pace
  turn: 6.5,      // radians per second she can swing her heading
  comfort: 3.0,   // m. Closer than this to the walker, she is content
  leash: 24,      // m. Further than this and she comes back on her own
};

function makeLexie() {
  const g = new THREE.Group();
  const coat = new THREE.MeshLambertMaterial({ color: 0xc9a374 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x4a3a2c });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.5, 4, 8), coat);
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.44;
  g.add(body);

  // The whole head turns as one piece when she looks at something or puts her
  // nose down, so it lives in a group of its own.
  const headPivot = new THREE.Group();
  headPivot.position.set(0.34, 0.6, 0);
  g.add(headPivot);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.24, 0.3), coat);
  head.position.set(0.1, 0, 0);
  headPivot.add(head);

  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.14), dark);
  snout.position.set(0.26, -0.05, 0);
  headPivot.add(snout);

  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.17, 4), dark);
    ear.position.set(0.06, 0.16, s * 0.1);
    headPivot.add(ear);
  }

  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.36, 0.6, 0);
  g.add(tailPivot);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.42, 6), coat);
  tail.position.set(-0.14, 0, 0);
  tail.rotation.z = -0.7;
  tailPivot.add(tail);

  const legs = [];
  const legGeo = new THREE.CylinderGeometry(0.045, 0.04, 0.36, 5);
  legGeo.translate(0, -0.18, 0);
  for (const [lx, lz] of [[0.19, 0.13], [0.19, -0.13], [-0.19, 0.13], [-0.19, -0.13]]) {
    const leg = new THREE.Mesh(legGeo, dark);
    leg.position.set(lx, 0.36, lz);
    g.add(leg);
    legs.push(leg);
  }

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, legs, tail, tailPivot, headPivot };
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
  walker.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  rig.add(walker);

  // Lexie stands in the world, not on the walker.
  const lexie = makeLexie();
  scene.add(lexie.group);

  // --- her mind -------------------------------------------------------------
  // trot  she is keeping up with the walker
  // dash  she has decided to go somewhere of her own accord
  // sniff she has stopped to read the ground
  // wait  she is ahead and has stopped to look back at the walker
  // come  she was called and is on her way over
  const dog = {
    pos: new THREE.Vector3(1.0, 0, 5.0),
    vel: new THREE.Vector2(0, 0),
    heading: 0,
    state: 'trot',
    timer: 1.4,
    gait: 0,
    tailWag: 0,
    called: 0,
    speed: 0,
  };

  function pickState(walkerSpeed, gap) {
    // What she does next depends on what the walker is doing and how far off she
    // is. A dog on a lead still stops to sniff; she just catches up afterwards.
    const r = Math.random();
    if (gap > DOG.leash) { dog.state = 'trot'; dog.timer = 0.6; return; }
    if (walkerSpeed < 0.6) {
      // The walker has stopped, so she gets to be a dog about it.
      if (r < 0.5) { dog.state = 'sniff'; dog.timer = 1.6 + Math.random() * 2.6; }
      else if (r < 0.78) { dog.state = 'wait'; dog.timer = 1.2 + Math.random() * 2.0; }
      else { dog.state = 'dash'; dog.timer = 1.0 + Math.random() * 1.2; }
    } else {
      // Walking on. Mostly she keeps up, sometimes she overshoots.
      if (r < 0.62) { dog.state = 'trot'; dog.timer = 1.0 + Math.random() * 2.2; }
      else if (r < 0.82) { dog.state = 'sniff'; dog.timer = 0.9 + Math.random() * 1.2; }
      else { dog.state = 'dash'; dog.timer = 1.1 + Math.random() * 1.6; }
    }
  }

  function whereSheWantsToGo() {
    // A point beside and slightly behind the walker, not on top of him.
    const side = Math.sin(dog.pos.x * 0.7 + dog.pos.z * 0.3) >= 0 ? 1 : -1;
    const fx = Math.sin(rig.rotation.y), fz = Math.cos(rig.rotation.y);
    // forward along the walker's facing is (-fx, -fz) in this rig's convention
    return { x: rig.position.x - fx * 1.5 + fz * 1.1 * side,
             z: rig.position.z - fz * 1.5 - fx * 1.1 * side };
  }

  let onToggle = null;

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
    if (e.code === 'KeyF') { dog.called = 2.6; dog.state = 'come'; dog.timer = 0.4; }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

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

    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    const targetX = wish.y * -sin + wish.x * cos;
    const targetZ = wish.y * -cos + wish.x * -sin;
    const speed = (keys['ShiftLeft'] || keys['ShiftRight']) ? RUN : WALK;

    vel.x += (targetX * speed - vel.x) * Math.min(1, ACCEL * dt);
    vel.y += (targetZ * speed - vel.y) * Math.min(1, ACCEL * dt);

    const nx = rig.position.x + vel.x * dt;
    const nz = rig.position.z + vel.y * dt;
    const dist = Math.hypot(nx, nz);
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

    walkLegs[0].rotation.x = swing;
    walkLegs[1].rotation.x = -swing;
    walkLegs[2].rotation.x = -swing;
    walkLegs[3].rotation.x = swing;

    // ---------------------------------------------------------------- Lexie
    dog.timer -= dt;
    if (dog.called > 0) dog.called -= dt;

    const gapX = dog.pos.x - rig.position.x;
    const gapZ = dog.pos.z - rig.position.z;
    const gap = Math.hypot(gapX, gapZ);

    // A recall outranks her own plans, otherwise she picks a new idea 0.4s
    // later and wanders off instead of coming.
    if (dog.called <= 0 && dog.timer <= 0) pickState(vel.length(), gap);
    if (dog.called <= 0 && dog.state === 'come' && gap < 1.6) {
      dog.state = 'trot';
      dog.timer = 1.2;
    }

    // Where she is heading right now, and how fast she feels like going.
    let tx = rig.position.x, tz = rig.position.z, want = DOG.trot;
    if (dog.state === 'come') {
      tx = rig.position.x; tz = rig.position.z; want = DOG.dash;
      if (gap < 1.2) want = 0;
    } else if (dog.state === 'trot') {
      const p = whereSheWantsToGo(); tx = p.x; tz = p.z;
      want = gap > DOG.comfort ? DOG.trot : 0;
    } else if (dog.state === 'dash') {
      // Off on her own: pick a spot out to one side of the walker and go there.
      const f = whereSheWantsToGo();
      const ox = f.x - rig.position.x, oz = f.z - rig.position.z;
      const L = Math.hypot(ox, oz) || 1;
      tx = rig.position.x + (ox / L) * 7 + (oz / L) * 5.5;
      tz = rig.position.z + (oz / L) * 7 - (ox / L) * 5.5;
      want = DOG.dash;
    } else if (dog.state === 'sniff') {
      want = 0;
    } else if (dog.state === 'wait') {
      want = 0;
    }
    // She can stop to read the ground, but she is not going to be left behind.
    if ((dog.state === 'sniff' || dog.state === 'wait') && gap > 8) {
      dog.state = 'trot'; dog.timer = 1.5; want = DOG.trot;
    }

    const dx = tx - dog.pos.x, dz = tz - dog.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    // She slows as she arrives rather than stopping dead, and she will not crowd
    // the walker when she is just keeping up.
    const arrive = Math.min(1, d / 1.4);
    const desiredX = (dx / d) * want * arrive;
    const desiredZ = (dz / d) * want * arrive;
    const ease = Math.min(1, 6.5 * dt);
    dog.vel.x += (desiredX - dog.vel.x) * ease;
    dog.vel.y += (desiredZ - dog.vel.y) * ease;

    dog.pos.x += dog.vel.x * dt;
    dog.pos.z += dog.vel.y * dt;
    const dd = Math.hypot(dog.pos.x, dog.pos.z);
    if (dd > AREA_RADIUS) {
      const k = AREA_RADIUS / dd;
      dog.pos.x *= k; dog.pos.z *= k; dog.vel.set(0, 0);
    }
    dog.speed = Math.hypot(dog.vel.x, dog.vel.y);

    // She turns to face where she is actually going, and swings round when she
    // is standing still and has spotted something behind her.
    let faceX = dog.vel.x, faceZ = dog.vel.y;
    if (dog.speed < 0.25) { faceX = rig.position.x - dog.pos.x; faceZ = rig.position.z - dog.pos.z; }
    if (Math.hypot(faceX, faceZ) > 0.05) {
      const wanted = Math.atan2(faceX, faceZ);
      let delta = wanted - dog.heading;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      dog.heading += THREE.MathUtils.clamp(delta, -DOG.turn * dt, DOG.turn * dt);
    }

    lexie.group.position.set(dog.pos.x, 0, dog.pos.z);
    lexie.group.rotation.y = dog.heading;

    // Her gait is her own, driven by her own speed. Four legs, diagonal pairs.
    dog.gait += dt * (1.5 + dog.speed * 2.9);
    const swingAmt = Math.min(1, dog.speed / DOG.trot);
    for (let i = 0; i < lexie.legs.length; i++) {
      const phase = i === 0 || i === 3 ? 0 : Math.PI;
      lexie.legs[i].rotation.x = Math.sin(dog.gait + phase) * 0.75 * swingAmt;
    }
    // A trot bounces; standing still does not.
    lexie.group.position.y = Math.abs(Math.sin(dog.gait)) * 0.05 * swingAmt;

    // Nose down when she is reading the ground, up and level the rest of the time.
    const noseDown = dog.state === 'sniff' ? 0.85 : 0;
    lexie.headPivot.rotation.z += (noseDown - lexie.headPivot.rotation.z) * Math.min(1, 5 * dt);
    const glance = dog.state === 'wait' || dog.speed < 0.25 ? 0 : Math.sin(elapsed * 0.9) * 0.3;
    lexie.headPivot.rotation.y += (glance - lexie.headPivot.rotation.y) * Math.min(1, 3 * dt);

    // Tail: fast when she is moving or pleased, a slow idle wag when she is not.
    const wagRate = 3.0 + dog.speed * 2.2 + (dog.called > 0 ? 6 : 0);
    dog.tailWag += dt * wagRate;
    lexie.tailPivot.rotation.y = Math.sin(dog.tailWag) * 0.7;
    lexie.tailPivot.rotation.z = dog.state === 'sniff' ? -0.5 : 0;

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
    // So a check can read what she is doing rather than guess from a picture.
    dog: () => ({
      state: dog.state,
      x: +dog.pos.x.toFixed(2),
      z: +dog.pos.z.toFixed(2),
      speed: +dog.speed.toFixed(2),
      gap: +Math.hypot(dog.pos.x - rig.position.x, dog.pos.z - rig.position.z).toFixed(2),
      heading: +dog.heading.toFixed(2),
    }),
    callDog: () => { dog.called = 2.6; dog.state = 'come'; dog.timer = 0.4; },
  };
}
