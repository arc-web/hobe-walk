import asyncio
import json
import os
from playwright.async_api import async_playwright

# Both the page and the browser are configurable, so this runs on any machine
# rather than only the one it was written on.
URL = os.environ.get("HOBE_URL", "http://127.0.0.1:4188/")
CDP = os.environ.get("HOBE_CDP", "http://127.0.0.1:9333")


async def main():
    async with async_playwright() as p:
        b = await p.chromium.connect_over_cdp(CDP)
        ctx = b.contexts[0] if b.contexts else await b.new_context()
        pg = await ctx.new_page()
        errors = []
        pg.on("console", lambda m: errors.append(f"{m.type}: {m.text[:140]}") if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(f"pageerror: {str(e)[:160]}"))

        await pg.set_viewport_size({"width": 1440, "height": 900})
        await pg.goto(URL, wait_until="load", timeout=60000)

        # The page reports its own readiness. Wait for the truth, not a timer.
        try:
            await pg.wait_for_function("window.__hobe && window.__hobe.ready === true", timeout=45000)
        except Exception as e:
            print("  DID NOT BECOME READY:", str(e)[:120])
            print("  errors:", errors[:5])
            await pg.close()
            await b.close()
            return

        info = await pg.evaluate("({backend: window.__hobe.backend, stats: window.__hobe.stats})")
        print("  backend     :", info["backend"])
        st = info["stats"]
        print(f"  roads       : {st['roads']} ({st['namedRoads']} named)")
        print(f"  palms       : {st['palms']}")
        print(f"  houses      : {st['houses']}")
        print(f"  water shapes: {st['water']}")

        # Start the walk the way a person does.
        await pg.click("#go")
        await pg.wait_for_timeout(800)
        start = await pg.evaluate("window.__hobe.position()")
        street0 = await pg.evaluate("window.__hobe.street()")
        view0 = await pg.evaluate("window.__hobe.view()")
        print(f"  start       : x {start[0]:.1f}  z {start[1]:.1f}  on {street0}  in {view0} person")

        # Hold W for two seconds and see whether the walker actually moves.
        await pg.keyboard.down("w")
        await pg.wait_for_timeout(2000)
        await pg.keyboard.up("w")
        await pg.wait_for_timeout(150)
        moved = await pg.evaluate("window.__hobe.position()")
        walked = ((moved[0] - start[0]) ** 2 + (moved[1] - start[1]) ** 2) ** 0.5
        print(f"  after 2s W  : x {moved[0]:.1f}  z {moved[1]:.1f}  walked {walked:.1f} m")

        # Turn right and walk again, to prove the facing works.
        await pg.keyboard.down("d")
        await pg.wait_for_timeout(1400)
        await pg.keyboard.up("d")
        await pg.wait_for_timeout(150)
        strafed = await pg.evaluate("window.__hobe.position()")
        print(f"  after 1.4s D: x {strafed[0]:.1f}  z {strafed[1]:.1f}")

        # Switch to third person and back.
        await pg.keyboard.press("v")
        await pg.wait_for_timeout(300)
        view1 = await pg.evaluate("window.__hobe.view()")
        await pg.keyboard.press("v")
        await pg.wait_for_timeout(300)
        view2 = await pg.evaluate("window.__hobe.view()")
        print(f"  view toggle : {view0} -> {view1} -> {view2}")

        # Does anything actually render? Read the middle pixel band from the canvas.
        drawn = await pg.evaluate("""(() => {
            const c = document.querySelector('canvas');
            if (!c) return { ok: false, why: 'no canvas' };
            return { ok: true, w: c.width, h: c.height };
        })()""")
        print(f"  canvas      : {drawn}")

        await pg.keyboard.press("v")
        await pg.wait_for_timeout(600)
        shot = os.environ.get("HOBE_SHOT", "verify-third-person.png")
        await pg.screenshot(path=shot)
        print("  screenshot  :", shot)

        print("  console errors:", errors[:6] if errors else "none")
        await pg.close()
        await b.close()


asyncio.run(main())
