import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { campaignSnapshot } from "./snapshot";
import { createCampaign, Simulation } from "./campaign";
import { cellAt, createGrid } from "./navigation";
import type { ContinentData } from "./types";

it("profiles the same conquest workload and checks unaffected orders",()=>{
  const data:ContinentData=JSON.parse(readFileSync(new URL("../public/data/europe.json",import.meta.url),"utf8")),
    grid=createGrid(data), sim=new Simulation(data,grid,createCampaign(data,grid,"FRA"));
  sim.state.wars=data.countries.filter((c)=>c.id!=="FRA").map((c)=>({a:"FRA",b:c.id,since:0}));
  let requests=0;
  sim.requestPath=()=>{requests++;};
  for(const u of sim.state.units){u.destination=[u.x,u.z];u.path=[[u.x,u.z]];}
  const start=performance.now();
  for(const id of ["DEU","ESP","ITA","RUS"]) sim.territory.annex(id,"FRA");
  const annexMs=performance.now()-start;
  const encodeStart=performance.now(), snapshot=JSON.stringify(campaignSnapshot(sim.state)), encodeMs=performance.now()-encodeStart;
  console.log(JSON.stringify({annexMs:+annexMs.toFixed(2),pathRequests:requests,occupiedCells:Object.keys(sim.state.occupation??{}).length,snapshotBytes:snapshot.length,encodeMs:+encodeMs.toFixed(2)}));
  expect(requests).toBe(0);
  expect(snapshot.length).toBeLessThan(JSON.stringify(sim.state).length*0.6);
  expect(sim.territory.controllerAt(cellAt(grid,...sim.playerNation.capital!))).toBe("FRA");
});
