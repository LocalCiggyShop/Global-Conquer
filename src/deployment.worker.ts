import {simplifyPolygons} from "./simplify";
import * as THREE from "three";
import {mergeGeometries} from "three/addons/utils/BufferGeometryUtils.js";
import {createGrid,nationSpawn} from "./navigation";
import {createCampaign,restoreCampaign,Simulation} from "./campaign";
import {campaignSnapshot} from "./snapshot";
import {polygonGeometry,flatLines} from "./render-utils";
import {nationLabelLayouts} from "./map-labels";
import {preparePoliticalFields} from "./political-fields";
import type {PackedGeometry,PreparedDeployment} from "./deployment";
import type {ContinentData,Polygon} from "./types";
const send=self.postMessage.bind(self) as (message:unknown,transfer?:Transferable[])=>void;
function pack(polygons:Polygon[]):PackedGeometry|null {
 if(!polygons.length)return null;
 const parts=polygons.map(polygonGeometry),g=mergeGeometries(parts)!;
 const packed={position:new Float32Array(g.getAttribute("position").array),normal:new Float32Array(g.getAttribute("normal").array),uv:new Float32Array(g.getAttribute("uv").array),index:new Uint32Array(g.index!.array)};
 for(const p of parts)p.dispose();g.dispose();return packed;
}
function transferables(value:unknown,out=new Set<ArrayBuffer>()):Set<ArrayBuffer>{
 if(ArrayBuffer.isView(value))out.add(value.buffer as ArrayBuffer);
 else if(value&&typeof value==="object")for(const v of Object.values(value))transferables(v,out);
 return out;
}
self.onmessage=(event:MessageEvent)=>{
 try {
  const {data,nation,saved}=event.data as {data:ContinentData;nation:string|null;saved:any},timings:Record<string,number>={};let last=performance.now();
  const progress=(value:number,label:string)=>{const now=performance.now();timings[label]=+(now-last).toFixed(1);last=now;send({type:"progress",value,label});};
  const grid=event.data.grid??createGrid(data);progress(8,"Land navigation ready");
  if(!nation){const value={grid,viable:data.countries.flatMap((c,i)=>nationSpawn(grid,i)>=0?[c.id]:[])};send({type:"ready",value},[...transferables(value)]);return;}
  const state=saved?restoreCampaign(data,grid,saved):createCampaign(data,grid,nation);progress(25,"National economies ready");
  const sim=new Simulation(data,grid,state);progress(45,"Territory and ports ready");
  const countries=[];
  for(let i=0;i<data.countries.length;i++){const c=data.countries[i];const line=flatLines(c.polygons,0.08,"#000000");const border=new Float32Array(line.geometry.getAttribute("position").array);line.geometry.dispose();line.material.dispose();countries.push({id:c.id,geometry:pack(c.polygons)!,border,minimap:simplifyPolygons(c.polygons,grid.cell*0.35)});if(i%5===0)progress(45+25*i/data.countries.length,"Preparing country coastlines");}
  const lakes=pack(data.lakes);progress(73,"Coastlines ready");
  const labels=nationLabelLayouts(data,grid);progress(80,"Country labels ready");
  const fields=preparePoliticalFields(data,grid);progress(90,"Political map ready");
  const value:PreparedDeployment={state:campaignSnapshot(sim.state),grid,territory:{states:sim.territory.states,membership:sim.territory.membership},
   naval:sim.naval.prepared(),components:sim.components,countries,lakes,labels,fields,timings};
  send({type:"ready",value},[...transferables(value)]);
 }catch(error){send({type:"error",message:error instanceof Error?error.message:String(error)});}
};
// Explicit readiness avoids sending work while the module dependency graph is still starting.
send({type:"online"});
