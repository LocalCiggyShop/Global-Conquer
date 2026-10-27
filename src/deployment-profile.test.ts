import {readFileSync} from "node:fs";
import {it} from "vitest";
import {createCampaign,Simulation} from "./campaign";
import {createGrid} from "./navigation";
import {nationLabelLayouts} from "./map-labels";
import {polygonGeometry} from "./render-utils";
it("profiles Europe deployment stages",()=>{
 const data=JSON.parse(readFileSync(new URL("../public/data/europe.json",import.meta.url),"utf8")), timings:Record<string,number>={};
 let last=performance.now();const stage=(name:string)=>{const now=performance.now();timings[name]=+(now-last).toFixed(1);last=now;};
 const grid=createGrid(data);stage("grid");const state=createCampaign(data,grid,"FRA");stage("campaign");new Simulation(data,grid,state);stage("simulation");
 for(const c of data.countries)for(const p of c.polygons)polygonGeometry(p).dispose();stage("countryGeometry");nationLabelLayouts(data,grid);stage("labels");console.log(JSON.stringify(timings));
});
