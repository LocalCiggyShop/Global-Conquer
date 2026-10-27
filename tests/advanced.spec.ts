import {gzipSync} from "node:zlib";
import { expect, test } from "@playwright/test";
import { createCampaign, Simulation } from "../src/campaign";
import { cellAt, cellPoint, createGrid, nearestOpen } from "../src/navigation";
import type { ContinentData, Point } from "../src/types";

test("unit fog, intelligence, colors, cities, rankings and closer zoom", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#deploy-button")).toBeEnabled();
  await page.locator("#deploy-button").click();
  await expect(page.locator("#play-ui")).toBeVisible();
  const fog = await page.evaluate(() => {
    const d = window.__worldRTS;
    return {
      total: d.state.units.filter((u) => u.nation !== d.state.nation).length,
      visible: d.visibleUnitIds.filter(
        (id) =>
          d.state.units.find((u) => u.id === id)?.nation !== d.state.nation,
      ).length,
      cities: d.state.cities?.length,
      maxZoom: d.maxZoom,
    };
  });
  expect(fog.visible).toBeLessThan(fog.total);
  expect(fog.cities).toBeGreaterThan(0);
  expect(fog.maxZoom).toBeGreaterThan(8);
  await page.screenshot({ path: ".cache/fog-cities-colors.png" });
  await page.locator("#diplomacy-button").click();
  await page.locator("#nation-search").fill("Germany");
  await page.locator('[data-nation="DEU"]').click();
  await expect(page.locator("#intel-status")).toContainText(
    "No live intelligence",
  );
  await page.locator("#recon-button").click();
  await expect(page.locator("#intel-status")).toContainText("Gathering");
  await expect(page.locator("#intel-status")).toContainText(
    "Live military intelligence",
    { timeout: 30000 },
  );
  const visible = await page.evaluate(() => {
    const d = window.__worldRTS;
    return d.state.units
      .filter((u) => u.nation === "DEU" && !u.embarkedOn)
      .every((u) => d.visibleUnitIds.includes(u.id));
  });
  expect(visible).toBe(true);
  await page.locator('[data-diplomacy-tab="rankings"]').click();
  await expect(page.locator("#ranking-table tbody tr")).toHaveCount(50);
  await page.locator("#ranking-sort").selectOption("military");
  await expect(page.locator("#ranking-table .your-ranking")).toBeVisible();
  await page.screenshot({ path: ".cache/country-rankings.png" });
  expect(errors).toEqual([]);
});

test("dock recruitment, troop embarkation, sea crossing, landing and local occupation", async ({
  page,
}) => {
  const ring = (a: number, b: number, c: number, d: number): Point[] => [
    [a, b],
    [c, b],
    [c, d],
    [a, d],
  ];
  const data: ContinentData = {
    id: "europe",
    bounds: [-100, -60, 100, 60],
    lakes: [],
    countries: [
      {
        id: "AAA",
        name: "Alpha",
        bounds: [-80, -40, -20, 40],
        polygons: [[ring(-80, -40, -20, 40)]],
      },
      {
        id: "BBB",
        name: "Beta",
        bounds: [20, -40, 80, 40],
        polygons: [[ring(20, -40, 80, 40)]],
      },
    ],
    cities: [
      {
        name: "Alpha City",
        nation: "AAA",
        x: -50,
        z: 0,
        population: 100000,
        capital: true,
      },
      {
        name: "Beta City",
        nation: "BBB",
        x: 50,
        z: 0,
        population: 100000,
        capital: true,
      },
    ],
  };
  const grid = createGrid(data),
    sim = new Simulation(data, grid, createCampaign(data, grid, "AAA"));
  sim.playerNation.credits = 5000;
  sim.playerNation.supplies = 1000;
  Object.values(sim.state.nations).forEach((n) => (n.nextActionAt = 100000));
  const candidates = sim.naval.coasts
    .filter((i) => sim.territory.controllerAt(i) === "AAA")
    .sort((a, b) => {
      const p = cellPoint(grid, a),
        q = cellPoint(grid, b);
      return (
        Math.abs(p[0] + 20) +
        Math.abs(p[1]) * 0.1 -
        (Math.abs(q[0] + 20) + Math.abs(q[1]) * 0.1)
      );
    });
  const portCell = candidates.find(
    (i) => !sim.placementError("dock", ...cellPoint(grid, i)),
  )!;
  expect(portCell).toBeDefined();
  const port = cellPoint(grid, portCell);
  expect(sim.build("dock", ...port)).toBeNull();
  const sea = nearestOpen(grid, sim.naval.water, port[0] + 2, port[1] + 1, 14),
    seaPoint = cellPoint(grid, sea);
  const own = sim.walkable.map((v, i) => (v && grid.owners[i] === 0 ? 1 : 0)),
    shore = nearestOpen(grid, own, ...seaPoint, 12),
    shorePoint = cellPoint(grid, shore);
  expect(
    Math.hypot(shorePoint[0] - seaPoint[0], shorePoint[1] - seaPoint[1]),
  ).toBeLessThanOrEqual(4);
  const troops = sim.playerUnits.slice(0, 2);
  for (const u of troops) {
    u.x = shorePoint[0];
    u.z = shorePoint[1];
  }
  const landingCell = sim.naval.coasts
    .filter((i) => grid.walkable[i] && grid.owners[i] === 1)
    .sort((a, b) => {
      const p = cellPoint(grid, a),
        q = cellPoint(grid, b);
      return (
        Math.hypot(p[0] - seaPoint[0], p[1] - seaPoint[1]) -
        Math.hypot(q[0] - seaPoint[0], q[1] - seaPoint[1])
      );
    })[0];
  const landing = cellPoint(grid, landingCell);
  await page.route("**/data/europe.json.gz",(route)=>route.fulfill({body:gzipSync(JSON.stringify(data)),contentType:"application/gzip"}));
  await page.route("**/data/europe.json", (route) =>
    route.fulfill({ json: data }),
  );
  await page.addInitScript(
    (state) =>
      localStorage.setItem(
        "worldrts.campaigns.v2",
        JSON.stringify({ europe: state }),
      ),
    sim.state,
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#deploy-button")).toBeEnabled();
  await page.locator("#deploy-button").click();
  await expect(page.locator("#play-ui")).toBeVisible();
  await page.locator("#army-tab").click();
  await page.locator('[data-train="transport"]').click();
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.__worldRTS.state.units.some(
            (u) => u.type === "transport" && u.nation === "AAA",
          ),
        ),
      { timeout: 30000 },
    )
    .toBe(true);
  await page.keyboard.press("q");
  await page.locator("#embark-button").click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__worldRTS.state.units.find(
            (u) => u.type === "transport" && u.nation === "AAA",
          )?.cargo?.length ?? 0,
      ),
    )
    .toBe(2);
  await page.locator("#diplomacy-button").click();
  await page.locator("#nation-search").fill("Beta");
  await page.locator('[data-nation="BBB"]').click();
  await page.locator("#war-action").click();
  await page.locator("#diplomacy-close").click();
  await page.locator("#frame-button").click();
  const ship = await page.evaluate(() => {
    const d = window.__worldRTS,
      u = d.state.units.find(
        (u) => u.type === "transport" && u.nation === "AAA",
      )!;
    return d.project(u.x, u.z);
  });
  await page.mouse.click(ship.x, ship.y);
  await expect(page.locator("#selection-note")).toContainText("troops aboard");
  const destination = await page.evaluate(
    (p) => window.__worldRTS.project(p[0], p[1]),
    landing,
  );
  await page.mouse.click(destination.x, destination.y, { button: "right" });
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__worldRTS.state.units.filter(
              (u) =>
                u.nation === "AAA" &&
                !u.embarkedOn &&
                u.type === "infantry" &&
                u.x > 20,
            ).length,
        ),
      { timeout: 45000 },
    )
    .toBe(2);
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Object.values(window.__worldRTS.state.occupation ?? {}).some(
            (t) => t.controller === "AAA" && t.original === "BBB",
          ),
        ),
      { timeout: 20000 },
    )
    .toBe(true);
  const occupation = await page.evaluate(() => {
    const d = window.__worldRTS;
    return {
      tiles: Object.keys(d.state.occupation ?? {}).length,
      betaTotal: [...d.grid.owners].filter((i) => i === 1).length,
      sea: Object.keys(d.state.seaControl ?? {}).length,
    };
  });
  expect(occupation.tiles).toBeLessThan(occupation.betaTotal);
  expect(occupation.sea).toBeGreaterThan(0);
  await page.screenshot({ path: ".cache/naval-landing.png" });
  expect(errors).toEqual([]);
});
