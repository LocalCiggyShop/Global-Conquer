import {gzipSync} from "node:zlib";
import { expect, test } from "@playwright/test";
import { createCampaign, Simulation, unitSpecs } from "../src/campaign";
import { createGrid } from "../src/navigation";
import type { ContinentData, Point, Unit } from "../src/types";

const ring = (a: number, b: number): Point[] => [[a,-18],[b,-18],[b,18],[a,18]];
const data: ContinentData = {
  id:"europe",bounds:[-54,-24,54,24],lakes:[],countries:[
    {id:"FRA",name:"France",population:40_000_000,bounds:[-48,-18,0,18],polygons:[[ring(-48,0)]]},
    {id:"DEU",name:"Germany",population:45_000_000,bounds:[0,-18,48,18],polygons:[[ring(0,48)]]},
  ],cities:[
    {name:"French Capital",nation:"FRA",x:-35,z:0,population:100000,capital:true},
    {name:"German Capital",nation:"DEU",x:35,z:-12,population:100000,capital:true},
    {name:"German South",nation:"DEU",x:35,z:12,population:100000,capital:false},
    {name:"German West",nation:"DEU",x:12,z:0,population:100000,capital:false},
  ],
};
function fixture() {
  const grid=createGrid(data), sim=new Simulation(data,grid,createCampaign(data,grid,"FRA"));
  sim.state.units=sim.playerUnits.slice(0,5);
  sim.state.units.forEach((u,i)=>{
    u.type=(["infantry","armor","infantry","frigate","transport"] as Unit["type"][])[i];
    u.hp=u.maxHp=unitSpecs[u.type].hp;
    u.x=i<3?-8:i===3?-6:0; u.z=i<3?(i-1)*4:-21;
  });
  for(const n of Object.values(sim.state.nations)) n.nextActionAt=Infinity;
  sim.declareWar("DEU");
  const city=sim.state.cities!.find((c)=>c.name === "German South")!, invader=sim.state.units[2];
  invader.x=city.x; invader.z=city.z;
  for(let t=0;t<5.6;t+=0.05)sim.step(0.05);
  expect(city.controller).toBe("FRA");
  sim.makePeace("DEU"); invader.x=-8; invader.z=4;
  return {state:sim.state,capacity:sim.nationCapacity(sim.state.nation)};
}

test("desktop leaders, branch voting, coloured frontlines, and seamless peace territory",async({page})=>{
  page.setDefaultTimeout(10000);
  const {state,capacity}=fixture(), errors:string[]=[];
  await page.route("**/data/europe.json",(route)=>route.fulfill({json:data}));
  await page.route("**/data/europe.json.gz",(route)=>route.fulfill({body:gzipSync(JSON.stringify(data)),contentType:"application/gzip"}));
  await page.addInitScript((save)=>{ if (!localStorage.getItem("worldrts.campaigns.v2")) localStorage.setItem("worldrts.campaigns.v2",JSON.stringify({europe:save})); },state);
  page.on("pageerror",(e)=>errors.push(e.message));
  page.on("console",(message)=>{if(message.type()==="error" && /THREE|shader/i.test(message.text()))errors.push(message.text());});
  await page.goto("/"); await expect(page.locator("#deploy-button")).toBeEnabled();
  await page.locator("#deploy-button").click();
  await page.waitForFunction(()=>window.__worldRTS?.mode === "play");
  const held=await page.evaluate(()=>Object.keys(window.__worldRTS.state.occupation ?? {}).length);
  expect(held).toBeGreaterThan(0);
  expect(await page.evaluate(()=>window.__worldRTS.occupationInstances)).toBe(0);
  expect(await page.evaluate(()=>window.__worldRTS.seaControlInstances)).toBe(0);
  await page.keyboard.press("q"); await page.locator("#assign-leader-button").click();
  await expect(page.locator('[data-leader-branch="army"]')).toHaveClass(/active/);
  await expect(page.locator("#leader-selection")).toContainText("3 ground · 2 ships");
  await page.locator("#leader-assign").click();
  expect(await page.evaluate(()=>window.__worldRTS.selected.length)).toBe(3);
  await page.locator("#leader-color").evaluate((el)=>{
    (el as HTMLInputElement).value="#e46bb3";
    el.dispatchEvent(new Event("input",{bubbles:true})); el.dispatchEvent(new Event("change",{bubbles:true}));
  });
  await page.locator("#leaders-close").click(); await page.locator("#frame-button").click();
  const border=await page.evaluate(()=>window.__worldRTS.project(-0.5,0));
  await page.locator("#frontline-button").click(); await page.mouse.click(border.x,border.y);
  await expect.poll(()=>page.evaluate(()=>window.__worldRTS.frontlineColors)).toContain("#e46bb3");
  const empty=await page.evaluate(()=>window.__worldRTS.project(-18,-10));
  await page.mouse.click(empty.x,empty.y);
  expect(await page.evaluate(()=>window.__worldRTS.selected.length)).toBe(0);
  expect(await page.evaluate(()=>window.__worldRTS.frontlineColors)).toContain("#e46bb3");
  const mixed=await page.evaluate(()=>{
    const d=window.__worldRTS, own=d.state.units.filter((u)=>u.nation===d.state.nation);
    return [...own.filter((u)=>u.type==="frigate"||u.type==="transport"),own.find((u)=>u.type==="armor")!].map((u)=>({id:u.id,...d.project(u.x,u.z)}));
  });
  for(let i=0;i<mixed.length;i++) {
    if(i)await page.keyboard.down("Shift");
    await page.mouse.click(mixed[i].x,mixed[i].y); await page.keyboard.up("Shift");
  }
  await page.locator("#assign-leader-button").click();
  await expect(page.locator('[data-leader-branch="navy"]')).toHaveClass(/active/);
  await expect(page.locator("#leader-selection")).toContainText("1 ground · 2 ships");
  await page.locator("#leader-assign").click();
  expect(await page.evaluate(()=>window.__worldRTS.selected.length)).toBe(2);
  await page.locator("#create-leader").click();
  await expect(page.locator("#leader-list .leader-card")).toHaveCount(3);
  await page.locator('[data-leader-branch="army"]').click();
  await expect(page.locator("#leader-color")).toHaveValue("#e46bb3");
  await expect(page.locator("#leader-order-defend")).toHaveAttribute("aria-pressed","true");
  await page.locator("#leader-order-attack").click();
  await expect(page.locator("#leader-order-status")).toContainText("holds the border until war");
  await expect(page.locator("#army")).toContainText(`/ ${capacity}`);
  await page.screenshot({path:".cache/leaders-and-peace.png"});
  await page.locator("#leaders-close").click();
  const armor=await page.evaluate(()=>{const d=window.__worldRTS,u=d.state.units.find((u)=>u.nation===d.state.nation&&u.type==="armor")!;return {id:u.id,...d.project(u.x,u.z),worldX:u.x};});
  await page.mouse.click(armor.x,armor.y);
  const destination=await page.evaluate(()=>window.__worldRTS.project(-18,6));
  await page.mouse.move(destination.x,destination.y);await page.mouse.down({button:"right"});
  await page.mouse.move(destination.x+12,destination.y+2);await page.mouse.up({button:"right"});
  await expect.poll(()=>page.evaluate((id)=>window.__worldRTS.state.units.find((u)=>u.id===id)!.x,armor.id)).toBeLessThan(armor.worldX-0.5);
  const order=await page.evaluate((id)=>window.__worldRTS.state.units.find((u)=>u.id===id)!.order,armor.id);
  const models=await page.evaluate(()=>window.__worldRTS.modelStats.unitsCreated);
  await page.locator("#diplomacy-button").click();
  await page.locator("#nation-search").fill("Germany"); await page.locator('[data-nation="DEU"]').click();
  await page.locator("#war-action").click();
  expect(await page.evaluate(()=>window.__worldRTS.occupationInstances)).toBe(0); // Prior settlements stay normal in later wars.
  await page.locator("#war-action").click();
  expect(await page.evaluate(()=>Object.keys(window.__worldRTS.state.occupation ?? {}).length)).toBe(held);
  expect(await page.evaluate((id)=>window.__worldRTS.state.units.find((u)=>u.id===id)!.order,armor.id)).toBe(order);
  expect(await page.evaluate(()=>window.__worldRTS.modelStats.unitsCreated)).toBe(models);
  await page.reload(); await expect(page.locator("#deploy-button")).toBeEnabled(); await page.locator("#deploy-button").click();
  await page.waitForFunction(()=>window.__worldRTS?.mode==="play");
  const restored=await page.evaluate(()=>{
    const d=window.__worldRTS;
    return {paint:d.occupationInstances,colours:d.state.leaders.filter((l)=>l.nation===d.state.nation).map((l)=>l.color),commands:d.state.units.filter((u)=>u.nation===d.state.nation&&u.leaderId!==undefined).length};
  });
  expect(restored.paint).toBe(0); expect(restored.colours).toContain("#e46bb3"); expect(restored.commands).toBe(5);
  expect(errors).toEqual([]);
});
