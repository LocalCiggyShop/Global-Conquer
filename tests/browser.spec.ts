import { expect, test } from "@playwright/test";
import type { Campaign, ContinentData, Grid } from "../src/types";

interface Diagnostics {
  mode: string;
  focusedRegion: string;
  data: ContinentData;
  grid: Grid;
  state: Campaign;
  paused: boolean;
  selected: number[];
  globeRotation: number[];
  visibleUnitIds: number[];
  maxZoom: number;
  project(x: number, z: number): { x: number; y: number };
}
declare global {
  interface Window {
    __worldRTS: Diagnostics;
  }
}

test("globe focus, playable commands, construction, recruitment, and save/resume", async ({
  page,
}) => {
  const errors: string[] = [];
  const packages: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (req) => {
    if (/\/data\/[^/]+\.json/.test(req.url()))
      packages.push(new URL(req.url()).pathname.replace(/\.gz$/, ""));
  });
  await page.goto("/");
  await expect(page.locator("#deploy-button")).toBeEnabled();
  expect(packages).toEqual(
    expect.arrayContaining(["/data/overview.json", "/data/europe.json"]),
  );
  expect(packages).not.toContain("/data/asia.json");
  expect(
    await page.evaluate(() => window.__worldRTS.globeRotation.slice(0, 3)),
  ).toEqual([0, 0, 0]);
  await page.locator('[data-region="africa"]').click();
  await expect(page.locator("#deploy-button")).toBeEnabled();
  await expect(page.locator("#nation-select")).toHaveValue("ZAF");
  await page.locator('[data-region="europe"]').click();
  await expect(page.locator("#deploy-button")).toBeEnabled();
  await page.screenshot({ path: ".cache/overview-desktop.png" });
  const countdownAt = Date.now();
  await page.locator("#deploy-button").click();
  await expect(page.locator("#battle-countdown")).toBeVisible();
  await expect(page.locator("#play-ui")).toBeHidden();
  expect(await page.evaluate(() => window.__worldRTS.state.elapsed)).toBe(0);
  expect(await page.evaluate(() => window.__worldRTS.state.wars)).toEqual([]);
  await page.screenshot({ path: ".cache/countdown.png" });
  await expect(page.locator("#play-ui")).toBeVisible();
  expect(Date.now() - countdownAt).toBeGreaterThanOrEqual(4950);
  await expect(page.locator("#peace-status")).toHaveText("At peace");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__worldRTS.state?.units.filter((u) => u.team === "player")
            .length,
      ),
    )
    .toBe(6);
  await page.keyboard.press("q");
  await expect
    .poll(() => page.evaluate(() => window.__worldRTS.selected.length))
    .toBe(6);

  // Find an unoccupied, visible land destination without mutating the game.
  const destination = await page.evaluate(() => {
    const d = window.__worldRTS,
      g = d.grid,
      hq = d.state.buildings[0];
    for (let i = 0; i < g.walkable.length; i++)
      if (g.walkable[i]) {
        const x = g.x + ((i % g.width) + 0.5) * g.cell,
          z = g.z + (Math.floor(i / g.width) + 0.5) * g.cell;
        const distance = Math.hypot(x - hq.x, z - hq.z),
          screen = d.project(x, z);
        if (
          distance > 4 &&
          distance < 5 &&
          screen.x > 330 &&
          screen.x < 1110 &&
          screen.y > 200 &&
          screen.y < 810
        )
          return { x, z, screen };
      }
    throw new Error("No visible destination");
  });
  const before = await page.evaluate(() => window.__worldRTS.state.units[0].x);
  await page.mouse.click(destination.screen.x, destination.screen.y, {
    button: "right",
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__worldRTS.state.units
          .filter((u) => u.team === "player")
          .some((u) => u.path.length > 0),
      ),
    )
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__worldRTS.state.units[0].x), {
      timeout: 30_000,
    })
    .not.toBe(before);

  await page.locator("#army-tab").click();
  await page.locator('[data-train="infantry"]').click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__worldRTS.state.nations[window.__worldRTS.state.nation].queue
            .length,
      ),
    )
    .toBe(1);
  await page.keyboard.press("Space");
  await expect
    .poll(() => page.evaluate(() => window.__worldRTS.paused))
    .toBe(true);
  const pausedAt = await page.evaluate(() => window.__worldRTS.state.elapsed);
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.__worldRTS.state.elapsed)).toBe(
    pausedAt,
  );
  await page.keyboard.press("Space");
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__worldRTS.state.units.filter((u) => u.team === "player")
              .length,
        ),
      { timeout: 60_000 },
    )
    .toBe(7);
  await page.keyboard.press("x");

  const site = await page.evaluate(() => {
    const d = window.__worldRTS,
      g = d.grid,
      owner = d.data.countries.findIndex((c) => c.id === d.state.nation),
      hq = d.state.buildings[0];
    for (let i = 0; i < g.walkable.length; i++)
      if (g.walkable[i] && g.owners[i] === owner) {
        let good = true;
        const radius = Math.ceil(1.5 / g.cell);
        for (let dz = -radius; dz <= radius && good; dz++)
          for (let dx = -radius; dx <= radius; dx++)
            if (
              !g.walkable[i + dz * g.width + dx] ||
              g.owners[i + dz * g.width + dx] !== owner
            ) {
              good = false;
              break;
            }
        if (!good) continue;
        const x = g.x + ((i % g.width) + 0.5) * g.cell,
          z = g.z + (Math.floor(i / g.width) + 0.5) * g.cell,
          p = d.project(x, z);
        if (
          Math.hypot(x - hq.x, z - hq.z) < 3.2 ||
          d.state.units.some((u) => Math.hypot(u.x - x, u.z - z) < 2)
        )
          continue;
        if (p.x > 330 && p.x < 1100 && p.y > 200 && p.y < 810) return p;
      }
    throw new Error("No visible construction site");
  });
  await page.locator("#economy-tab").click();
  await page.locator('[data-build="barracks"]').click();
  await page.mouse.click(site.x, site.y);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__worldRTS.state.buildings.some(
          (b) => b.type === "barracks" && b.team === "player",
        ),
      ),
    )
    .toBe(true);
  await page.locator("#army-tab").click();
  await page.locator('[data-train="armor"]').click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__worldRTS.state.nations[
          window.__worldRTS.state.nation
        ].queue.some((q) => q.type === "armor"),
      ),
    )
    .toBe(true);
  await page.screenshot({ path: ".cache/play-desktop.png" });
  await page.keyboard.press("Space");
  const savedTime = await page.evaluate(() => window.__worldRTS.state.elapsed);
  await page.locator("#return-world-button").click();
  await expect(page.locator("#deploy-button")).toHaveText(/Continue game/);
  await page.reload();
  await expect(page.locator("#deploy-button")).toBeEnabled();
  await expect(page.locator("#deploy-button")).toHaveText(/Continue game/);
  await page.locator("#deploy-button").click();
  await expect(page.locator("#play-ui")).toBeVisible();
  expect(
    await page.evaluate(() => window.__worldRTS.state.elapsed),
  ).toBeGreaterThanOrEqual(savedTime);
  expect(
    await page.evaluate(
      () =>
        window.__worldRTS.state.buildings.filter((b) => b.team === "player")
          .length,
    ),
  ).toBe(2);
  expect(errors).toEqual([]);
});

test("diplomacy gates war, peace stops it, and military doctrine persists", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#deploy-button")).toBeEnabled();
  await page.locator("#deploy-button").click();
  await expect(page.locator("#play-ui")).toBeVisible();
  await page.locator("#army-tab").click();
  await page.locator("#doctrine-select").selectOption("maneuver");
  await expect(page.locator("#doctrine-note")).toContainText("30% faster");
  await page.locator("#diplomacy-button").click();
  await page.locator("#nation-search").fill("Germany");
  await page.locator('[data-nation="DEU"]').click();
  await expect(page.locator("#war-action")).toHaveText("Declare war");
  await page.screenshot({ path: ".cache/diplomacy-peace.png" });
  await page.locator("#war-action").click();
  await expect(page.locator("#peace-status")).toHaveText("At war · 1");
  await expect(page.locator("#war-action")).toHaveText("Make peace");
  await expect(page.locator("#doctrine-select")).toBeDisabled();
  expect(
    await page.evaluate(() =>
      window.__worldRTS.state.wars.some(
        (w) => [w.a, w.b].includes("DEU") && [w.a, w.b].includes("FRA"),
      ),
    ),
  ).toBe(true);
  await page.screenshot({ path: ".cache/diplomacy-war.png" });
  await page.locator("#war-action").click();
  await expect(page.locator("#peace-status")).toHaveText("At peace");
  expect(await page.evaluate(() => window.__worldRTS.state.wars)).toEqual([]);
  await page.locator("#war-action").click();
  await page.locator("#diplomacy-close").click();
  await page.locator("#return-world-button").click();
  await page.reload();
  await expect(page.locator("#deploy-button")).toBeEnabled();
  await page.locator("#deploy-button").click();
  await expect(page.locator("#play-ui")).toBeVisible();
  await expect(page.locator("#peace-status")).toHaveText("At war · 1");
  await expect(page.locator("#doctrine-select")).toHaveValue("maneuver");
  expect(errors).toEqual([]);
});

test("cancelling the countdown does not create or replace a save", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#deploy-button")).toBeEnabled();
  await page.locator("#deploy-button").click();
  await expect(page.locator("#battle-countdown")).toBeVisible();
  await page.locator("#cancel-countdown").click();
  await expect(page.locator("#overview-ui")).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("worldrts.campaigns.v2")),
  ).toBeNull();
});

test.describe("touch interface", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  test("nation management and diplomacy work with taps", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#deploy-button")).toBeEnabled();
    await page.screenshot({ path: ".cache/overview-mobile.png" });
    const box = await page.locator("#deploy-button").boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    await page.locator("#deploy-button").tap();
    await expect(page.locator("#play-ui")).toBeVisible();
    await page.locator("#select-all-button").tap();
    await expect(page.locator("#selection-title")).toHaveText(
      "6 units selected",
    );
    await page.locator("#manage-button").tap();
    await expect(page.locator(".command-panel")).toBeVisible();
    await page.locator("#army-tab").click();
    await page.locator("#doctrine-select").selectOption("defensive");
    await expect(page.locator("#doctrine-note")).toContainText(
      "20% less damage",
    );
    await page.locator("#manage-close").tap();
    await page.locator("#diplomacy-button").tap();
    await expect(page.locator("#diplomacy-panel")).toBeVisible();
    await page.locator("#nation-search").fill("Germany");
    await page.locator('[data-nation="DEU"]').tap();
    await page.locator("#war-action").tap();
    await expect(page.locator("#peace-status")).toHaveText("At war · 1");
    await page.screenshot({ path: ".cache/diplomacy-mobile.png" });
    await page.locator("#diplomacy-close").tap();
    await page.locator("#move-button").tap();
    await expect(page.locator("#build-banner")).toBeVisible();
    await page.screenshot({ path: ".cache/play-mobile.png" });
    await page.locator("#help-button").tap();
    await expect(page.locator("#manual")).toBeVisible();
    await page.locator("#close-dialog").tap();
    await page.locator("#world-nav").tap();
    await expect(page.locator("#overview-ui")).toBeVisible();
  });
});
