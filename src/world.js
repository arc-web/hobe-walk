import * as THREE from 'three';
import { ROADS, WATER, GREENS, AREA_RADIUS } from './data/streets.js';
import { BUILDINGS } from './data/buildings.js';

// ---------------------------------------------------------------------------
// A deterministic random, so the palms and the houses land in the same place
// every time the page loads. Nothing here should shuffle between visits.
// ---------------------------------------------------------------------------
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROAD_HALF = 3.6;   // metres, half of a two lane residential street
const SIDEWALK = 1.4;

// ---------------------------------------------------------------------------
// Build a flat ribbon along a polyline. Each segment is extended by half its
// width at both ends, so corners join without gaps instead of showing notches.
// ---------------------------------------------------------------------------
function ribbon(points, half, lift) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i];
    const [x1, z1] = points[i + 1];
    let dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.01) continue;
    dx /= len; dz /= len;
    // unit normal across the road
    const nx = -dz * half, nz = dx * half;
    // extend along the heading so neighbouring segments overlap at the joint
    const ex = dx * half, ez = dz * half;
    const ax = x0 - ex, az = z0 - ez, bx = x1 + ex, bz = z1 + ez;
    // Wound so the face normal points up. The first version wound the other way,
    // which put the normal at minus one in Y: every street triangle was a back
    // face from above, so the whole network was culled and the roads were never
    // drawn, even though the geometry and the vertex counts were correct.
    out.push(
      ax + nx, lift, az + nz,  bx + nx, lift, bz + nz,  ax - nx, lift, az - nz,
      bx + nx, lift, bz + nz,  bx - nx, lift, bz - nz,  ax - nx, lift, az - nz,
    );
  }
  return out;
}

function disc(cx, cz, segments, lift, radius, squash) {
  const out = [];
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    out.push(cx, lift, cz);
    out.push(cx + Math.cos(a0) * radius, lift, cz + Math.sin(a0) * radius * squash);
    out.push(cx + Math.cos(a1) * radius, lift, cz + Math.sin(a1) * radius * squash);
  }
  return out;
}

function geometryFrom(positions) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------------
export function buildWorld(scene) {
  const group = new THREE.Group();

  // --- ground -------------------------------------------------------------
  // A wide, quiet green with a sandy edge, so the horizon reads as Florida.
  // One flat green reads as a greybox. Per vertex colour noise costs nothing at
  // runtime and every grass field in Florida is patchy, so the ground is too.
  const span = AREA_RADIUS + 600;
  const groundGeo = new THREE.PlaneGeometry(span * 2, span * 2, 96, 96);
  groundGeo.rotateX(-Math.PI / 2);
  const groundRand = rng(77123);
  const vertexColors = [];
  const tint = new THREE.Color();
  for (let i = 0; i < groundGeo.attributes.position.count; i++) {
    const v = 0.9 + groundRand() * 0.2;
    // setRGB writes into the working space, so the values are named as sRGB and
    // converted for us. Passing raw numbers here renders five shades too bright.
    tint.setRGB(0.373 * v, 0.447 * v, 0.278 * v, THREE.SRGBColorSpace);
    vertexColors.push(tint.r, tint.g, tint.b);
  }
  groundGeo.setAttribute("color", new THREE.Float32BufferAttribute(vertexColors, 3));
  // The ground is one plane of 25 metre triangles, and the street layers sit only
  // centimetres above it. Across triangles that large, the depth buffer cannot tell
  // 0.08 m from nothing, and the ground wins the pixel. So the ground is dropped a
  // little and pushed back in depth, which is what polygon offset is for.
  const ground = new THREE.Mesh(groundGeo,
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 4,
    }));
  ground.position.y = -0.14;
  ground.receiveShadow = true;
  group.add(ground);

  const sand = new THREE.Mesh(
    new THREE.RingGeometry(AREA_RADIUS - 40, AREA_RADIUS + 600, 96),
    new THREE.MeshLambertMaterial({ color: 0x8d8060 })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = -0.015;
  sand.receiveShadow = true;
  group.add(sand);

  // --- roads --------------------------------------------------------------
  // A dark bed under every street, then a lighter crown on top of it.
  // A street section, not a line drawn on a lawn. Each layer is wider than the
  // one above it and sits a little lower, so the eye reads the edge of the
  // street from any angle: mown verge, concrete sidewalk, gutter bed, road
  // crown, then the painted edge line.
  const lawnPos = [], walkPos = [], bedPos = [], crownPos = [], markPos = [];
  for (const r of ROADS) {
    // Trim anything far outside the play area so the far roads stay cheap.
    const near = r.pts.some(([x, z]) => Math.hypot(x, z) < AREA_RADIUS + 120);
    if (!near) continue;
    lawnPos.push(...ribbon(r.pts, ROAD_HALF + SIDEWALK + 6.4, 0.02));
    walkPos.push(...ribbon(r.pts, ROAD_HALF + SIDEWALK, 0.05));
    bedPos.push(...ribbon(r.pts, ROAD_HALF + 0.9, 0.08));
    crownPos.push(...ribbon(r.pts, ROAD_HALF, 0.11));
    // A pale edge line on both sides, the way a residential street is painted.
    if (r.pts.length > 1) markPos.push(...ribbon(r.pts, ROAD_HALF - 0.28, 0.13));
  }
  const lawn = new THREE.Mesh(geometryFrom(lawnPos), new THREE.MeshLambertMaterial({ color: 0x6f8149 }));
  const walk = new THREE.Mesh(geometryFrom(walkPos), new THREE.MeshLambertMaterial({ color: 0xc9c3b4 }));
  const bed = new THREE.Mesh(geometryFrom(bedPos), new THREE.MeshLambertMaterial({ color: 0x4a4a46 }));
  const crown = new THREE.Mesh(geometryFrom(crownPos), new THREE.MeshLambertMaterial({ color: 0x6a6a66 }));
  for (const mesh of [lawn, walk, bed, crown]) mesh.receiveShadow = true;
  group.add(lawn, walk, bed, crown);

  // --- water --------------------------------------------------------------
  const waterPos = [];
  for (const w of WATER) {
    if (w.pts.length >= 3) {
      // Fill the ring with a fan from its first vertex.
      const [x0, z0] = w.pts[0];
      for (let i = 1; i < w.pts.length - 1; i++) {
        waterPos.push(x0, 0.04, z0, w.pts[i][0], 0.04, w.pts[i][1], w.pts[i + 1][0], 0.04, w.pts[i + 1][1]);
      }
    }
  }
  if (waterPos.length) {
    const water = new THREE.Mesh(geometryFrom(waterPos),
      new THREE.MeshLambertMaterial({ color: 0x2f6f86, transparent: true, opacity: 0.92, side: THREE.DoubleSide }));
    water.receiveShadow = true;
    group.add(water);
  }

  // --- greens -------------------------------------------------------------
  const greenPos = [];
  for (const g of GREENS) {
    if (g.pts.length >= 3) {
      const [x0, z0] = g.pts[0];
      for (let i = 1; i < g.pts.length - 1; i++) {
        greenPos.push(x0, 0.03, z0, g.pts[i][0], 0.03, g.pts[i][1], g.pts[i + 1][0], 0.03, g.pts[i + 1][1]);
      }
    }
  }
  if (greenPos.length) {
    const greens = new THREE.Mesh(geometryFrom(greenPos),
      new THREE.MeshLambertMaterial({ color: 0x6d8348, side: THREE.DoubleSide }));
    greens.receiveShadow = true;
    group.add(greens);
  }

  // --- palms and houses ---------------------------------------------------
  // Both are placed by walking the road network, so they follow the real streets.
  const rand = rng(20261005);
  const palmSpots = [];
  for (const r of ROADS) {
    const near = r.pts.some(([x, z]) => Math.hypot(x, z) < AREA_RADIUS);
    if (!near) continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [x0, z0] = r.pts[i], [x1, z1] = r.pts[i + 1];
      const dx = x1 - x0, dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      if (len < 3 || len > 400) continue;
      const nx = -dz / len, nz = dx / len;
      const steps = Math.max(1, Math.floor(len / 26));
      for (let s = 0; s < steps; s++) {
        const tt = (s + 0.5) / steps;
        const cx = x0 + dx * tt, cz = z0 + dz * tt;
        if (Math.hypot(cx, cz) > AREA_RADIUS) continue;
        const side = rand() < 0.5 ? 1 : -1;
        const off = ROAD_HALF + SIDEWALK + 1.6 + rand() * 2.6;
        const px = cx + nx * off * side, pz = cz + nz * off * side;
        if (rand() < 0.42) palmSpots.push([px, pz, rand()]);
      }
    }
  }

  // Fronds and trunks as two instanced meshes, so 500 palms cost two draw calls.
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.28, 7.2, 6);
  trunkGeo.translate(0, 3.6, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo,
    new THREE.MeshLambertMaterial({ color: 0x6b5a44 }), palmSpots.length);
  const frondGeo = new THREE.ConeGeometry(2.5, 1.5, 7, 1, true);
  frondGeo.translate(0, 7.4, 0);
  const fronds = new THREE.InstancedMesh(frondGeo,
    new THREE.MeshLambertMaterial({ color: 0x3f6b39, side: THREE.DoubleSide }), palmSpots.length);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  palmSpots.forEach(([px, pz, r], i) => {
    const h = 0.82 + r * 0.5;
    q.setFromEuler(new THREE.Euler((r - 0.5) * 0.1, r * 6.28, (r - 0.5) * 0.12));
    v.set(px, 0, pz); sc.set(h, h, h);
    m.compose(v, q, sc);
    trunks.setMatrixAt(i, m);
    fronds.setMatrixAt(i, m);
  });
  trunks.instanceMatrix.needsUpdate = true;
  fronds.instanceMatrix.needsUpdate = true;
  // A palm without a shadow is a sticker. The shadow is what stands it up.
  trunks.castShadow = true;
  fronds.castShadow = true;
  group.add(trunks, fronds);

  // --- houses -------------------------------------------------------------
  // Real footprints, from the OpenStreetMap building outlines for this block, so
  // every house on the street has its own shape and its own size. Walls are the
  // outline lifted to its height; the roof is a hip over the building's own box
  // with a small overhang. Both are merged into one geometry each, so 307 houses
  // cost two draw calls.
  const wallPos = [], roofPos = [], trimPos = [];
  for (const b of BUILDINGS) {
    const ring = b.pts;
    const n = ring.length;
    if (n < 3) continue;

    // Where the building's middle is. Openings are pushed out along the
    // direction from the centre, which points outwards on every shape here.
    let bcx = 0, bcz = 0;
    for (const [x, z] of ring) { bcx += x; bcz += z; }
    bcx /= n; bcz /= n;

    // A hole in the wall: a rectangle standing on the wall line, lifted clear of
    // it so it never fights the wall for the same pixel.
    const opening = (ax, az, bx, bz, at, half, y0, y1) => {
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.01) return;
      const ux = (bx - ax) / L, uz = (bz - az) / L;
      const mx = ax + (bx - ax) * at, mz = az + (bz - az) * at;
      let ox = mx - bcx, oz = mz - bcz;
      const ol = Math.hypot(ox, oz) || 1;
      ox = (ox / ol) * 0.07; oz = (oz / ol) * 0.07;
      const p0x = mx - ux * half + ox, p0z = mz - uz * half + oz;
      const p1x = mx + ux * half + ox, p1z = mz + uz * half + oz;
      trimPos.push(
        p0x, y0, p0z, p1x, y0, p1z, p1x, y1, p1z,
        p1x, y1, p1z, p0x, y1, p0z, p0x, y0, p0z,
      );
    };

    // The door goes on the wall the street is in front of, not on whichever wall
    // happens to be longest. Compare the way each wall looks out with the way the
    // nearest road lies; the best agreement wins. The longest wall is the fallback
    // for a building with no road within reach.
    let longest = 0, li = 0;
    for (let i = 0; i < n; i++) {
      const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % n];
      const L = Math.hypot(bx - ax, bz - az);
      if (L > longest) { longest = L; li = i; }
    }
    let roadX = 0, roadZ = 0, roadD = Infinity;
    for (const road of ROADS) {
      for (const [rx, rz] of road.pts) {
        const d = Math.hypot(rx - bcx, rz - bcz);
        if (d < roadD) { roadD = d; roadX = rx; roadZ = rz; }
      }
    }
    if (roadD < 70) {
      let bestDot = -2, bestEdge = -1;
      for (let i = 0; i < n; i++) {
        const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % n];
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 2.4) continue;
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        let nx = mx - bcx, nz = mz - bcz;
        const nl = Math.hypot(nx, nz) || 1;
        nx /= nl; nz /= nl;
        let tx = roadX - mx, tz = roadZ - mz;
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl; tz /= tl;
        const dot = nx * tx + nz * tz;
        if (dot > bestDot) { bestDot = dot; bestEdge = i; }
      }
      if (bestEdge >= 0 && bestDot > 0.2) { li = bestEdge; longest = 99; }
    }
    const doorSill = 0, doorHead = Math.min(2.05, b.w - 0.55);
    if (longest > 2.4 && doorHead > 1.5) {
      const [ax, az] = ring[li], [bx, bz] = ring[(li + 1) % n];
      opening(ax, az, bx, bz, 0.5, 0.48, doorSill, doorHead);
    }

    // Windows along every wall that is long enough to take one, skipping the door.
    const sill = 1.05, head = Math.min(2.0, b.w - 0.5);
    if (head - sill > 0.5) {
      for (let i = 0; i < n; i++) {
        const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % n];
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 2.6) continue;
        const count = Math.max(1, Math.floor(L / 3.4));
        for (let k = 0; k < count; k++) {
          const at = (k + 0.5) / count;
          if (i === li && Math.abs(at - 0.5) < 0.22) continue;   // that is the door
          opening(ax, az, bx, bz, at, 0.55, sill, head);
        }
      }
    }

    for (let i = 0; i < n; i++) {
      const [x0, z0] = ring[i];
      const [x1, z1] = ring[(i + 1) % n];
      wallPos.push(
        x0, 0, z0, x1, 0, z1, x1, b.w, z1,
        x1, b.w, z1, x0, b.w, z0, x0, 0, z0,
      );
    }

    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (const [x, z] of ring) {
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (z < minz) minz = z; if (z > maxz) maxz = z;
    }
    const o = 0.4;                       // eave overhang
    const x0 = minx - o, x1 = maxx + o, z0 = minz - o, z1 = maxz + o;
    const rx = (x0 + x1) / 2, rz = (z0 + z1) / 2;
    const top = b.w + b.r;
    const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i];
      const [bx, bz] = corners[(i + 1) % 4];
      roofPos.push(ax, b.w, az, bx, b.w, bz, rx, top, rz);
    }
  }

  // The ring winding is OpenStreetMap's, not ours, so both faces are drawn: this
  // is the same trap that left every road invisible when the winding was assumed.
  const walls = new THREE.Mesh(geometryFrom(wallPos),
    new THREE.MeshLambertMaterial({ color: 0xe2d9c6, side: THREE.DoubleSide }));
  const roofs = new THREE.Mesh(geometryFrom(roofPos),
    new THREE.MeshLambertMaterial({ color: 0x9c6a56, side: THREE.DoubleSide }));
  walls.castShadow = true; walls.receiveShadow = true;
  roofs.castShadow = true; roofs.receiveShadow = true;
  const trim = new THREE.Mesh(geometryFrom(trimPos),
    new THREE.MeshLambertMaterial({ color: 0x5d6b74, side: THREE.DoubleSide }));
  group.add(walls, roofs, trim);

  scene.add(group);

  // ---------------------------------------------------------------------------
  // Nearest street name, for the readout in the corner.
  // ---------------------------------------------------------------------------
  const segments = [];
  for (const r of ROADS) {
    if (!r.name) continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      segments.push([r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1], r.name]);
    }
  }

  function streetAt(x, z) {
    let best = null, bestD = 900;
    for (const [ax, az, bx, bz, name] of segments) {
      const dx = bx - ax, dz = bz - az;
      const len2 = dx * dx + dz * dz;
      let tt = len2 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
      tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
      const px = ax + dx * tt, pz = az + dz * tt;
      const d = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (d < bestD) { bestD = d; best = name; }
    }
    return bestD < 3600 ? best : null;
  }

  return {
    group,
    streetAt,
    stats: {
      roads: ROADS.length,
      namedRoads: new Set(ROADS.filter((r) => r.name).map((r) => r.name)).size,
      palms: palmSpots.length,
      houses: BUILDINGS.length,
      openings: trimPos.length / 18,
      water: WATER.length,
    },
  };
}
