# Hobe Walk

A walk around the block at Hobe Sound, Florida, with Lexie.

You walk. She trots behind you and takes the corners wide. The streets are the real
ones, pulled from OpenStreetMap, so Mammoth Drive is Mammoth Drive.

## Run it

```
npm install
npm run dev
```

Then open the address Vite prints. `npm run build` writes a static bundle to `dist/`
that can be served from any plain file host.

Controls:

- `W` `A` `S` `D` or the arrow keys to walk.
- `Shift` to run.
- `V` to switch between first and third person.
- `Space` to jump.

## What is in the world

Everything is generated from the street data at load time, in the same order every
time, so the palms and the houses never move between visits.

- 188 roads, 47 of them named, including Mammoth Drive.
- 185 palms. Trunks and fronds are two instanced meshes, so the whole set costs two
  draw calls.
- 164 houses, built as a body and a roof in two instanced meshes.
- 15 water shapes and the neighbourhood greens.
- A fog taper at the edge of the play area, so the world fades out rather than
  showing where the data stops.

## The data

`src/data/streets.js` is generated, not hand written. `tools/build_streets.py`
fetches the streets for the block from the Overpass and Nominatim services and
writes the file. Everything is placed relative to the house at
`27.104196675805, -80.181603162067`, which is the origin of the coordinate system.

To rebuild it:

```
python3 tools/build_streets.py
```

## Checking it

`tools/verify.py` drives the page in a real browser and reports what actually loaded:
the renderer it chose, the object counts, and how far the walker moved in a set time.
It reads the same figures the page reports on `window.__hobe`, so a silent failure in
the world build cannot pass.

```
npm run build
python3 tools/verify.py
```

The verifier takes the page address and the browser from the environment, so it runs
on any machine rather than only the one it was written on:

- `HOBE_URL` the page to test, by default `http://127.0.0.1:4188/`
- `HOBE_CDP` the browser to drive, by default `http://127.0.0.1:9333`
- `HOBE_SHOT` where to write the screenshot

A note on the numbers: on a machine with no graphics chip, the page falls back to
software rendering and reports a low frame rate. That is the machine, not the scene.
Each frame is capped at 50 milliseconds of simulated time so a stalled tab cannot
teleport the walker, which means on a slow machine a two second walk covers less
ground than it does at sixty frames a second. On a machine with a graphics chip it
runs on WebGPU.

## Layout

- `src/main.js` renders. WebGPU where the browser offers it, WebGL2 where it does not.
- `src/world.js` builds the ground, the roads, the water, the palms and the houses.
- `src/player.js` walks the camera and animates Lexie.
- `src/data/streets.js` the generated street data.
- `tools/build_streets.py` regenerates the street data.
- `tools/verify.py` checks the built page in a real browser.
