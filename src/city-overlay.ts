import {personnel} from "./unit-stacks";
import * as THREE from "three";
import type {ContinentData,CitySite,Building} from "./types";
import type {Simulation} from "./campaign";
/** Screen-space place labels: one canvas, no per-city textures or draw calls. */
export class CityOverlay {
 readonly canvas=document.createElement("canvas");
 readonly visibleNames=new Set<string>();
 private places:CitySite[];
 private signature="";
 private lod=-1;private labelKey="";private stableLabels=new Set<CitySite>();
 private industryCanvas=document.createElement("canvas");
 private industrySignature="";
 private markerTick=-1;
 private industryMarkers:{building:Building;working:boolean}[]=[];
 constructor(readonly source:HTMLCanvasElement,readonly data:ContinentData,readonly sim:Simulation,readonly unitPosition?:(id:number)=>{x:number;z:number}|undefined){
  this.canvas.className="city-overlay";this.canvas.setAttribute("aria-hidden","true");source.after(this.canvas);this.industryCanvas.className="city-overlay";this.industryCanvas.setAttribute("aria-hidden","true");this.canvas.after(this.industryCanvas);
  const places=[...(data.places??sim.state.cities??[])];
  const mappedNations=new Set(places.map((c)=>c.nation));
  for(const c of sim.state.cities??[])if(!mappedNations.has(c.nation))places.push(c);
  this.places=places.sort((a,b)=>Number(b.capital)-Number(a.capital)||b.population-a.population);
 }
 update(camera:THREE.OrthographicCamera){
  const w=this.source.clientWidth,h=this.source.clientHeight;
  // Project from the same final camera matrix as WebGL, without a second frame clock.
  this.updateIndustry(camera,w,h);
  const signature=`${w}:${h}:${camera.zoom}:${camera.matrixWorld.elements.join(":")}:${this.sim.territory.landRevision}`;
  if(signature===this.signature)return;this.signature=signature;
  const dpr=Math.min(devicePixelRatio,2);if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)){this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);}
  const ctx=this.canvas.getContext("2d")!;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);this.visibleNames.clear();
  const v=new THREE.Vector3(),zoom=camera.zoom,thresholds=[0,3,5,9,15];
  if(this.lod<0)this.lod=thresholds.filter(t=>zoom>=t).length-1;
  while(this.lod<4&&zoom>thresholds[this.lod+1]+.2)this.lod++;
  while(this.lod>0&&zoom<thresholds[this.lod]-.2)this.lod--;
  const densityZoom=this.lod>=4?15*Math.pow(2,Math.max(0,Math.floor(Math.log2(zoom/15)))):Math.max(3,thresholds[this.lod]);
  const labelKey=[this.lod,densityZoom,w,h,camera.left,camera.right].join(':');
  if(labelKey!==this.labelKey){this.labelKey=labelKey;this.stableLabels.clear();const boxes=new Map<string,{x:number;z:number;w:number}[]>(),scale=(camera.right-camera.left)/w/densityZoom,bucketSize=Math.max(.1,100*scale),minimum=this.lod>=4?0:this.lod>=3?100000:500000;ctx.font="500 11px Manrope,sans-serif";
   for(const c of this.places){if(this.lod<1||(!c.capital&&(this.lod<2||c.population<minimum)))continue;const width=(ctx.measureText(c.name.toUpperCase()).width+10)*scale;const keys:string[]=[],nearby=new Set<{x:number;z:number;w:number}>();for(let x=Math.floor((c.x-width/2)/bucketSize);x<=Math.floor((c.x+width/2)/bucketSize);x++)for(let z=Math.floor((c.z-18*scale)/bucketSize);z<=Math.floor((c.z+18*scale)/bucketSize);z++){const key=x+':'+z;keys.push(key);for(const b of boxes.get(key)??[])nearby.add(b);}if(!c.capital&&[...nearby].some(b=>Math.abs(c.x-b.x)<(width+b.w)/2&&Math.abs(c.z-b.z)<18*scale))continue;const box={x:c.x,z:c.z,w:width};for(const key of keys){const list=boxes.get(key)??[];list.push(box);boxes.set(key,list);}this.stableLabels.add(c);}
  }
  const project=(x:number,z:number)=>{v.set(x,0.5,z).project(camera);return {x:(v.x+1)*w/2,y:(1-v.y)*h/2,visible:v.z>=-1&&v.z<=1&&Math.abs(v.x)<1.05&&Math.abs(v.y)<1.05};};
  const label=(text:string,x:number,y:number,color:string)=>{
   ctx.lineWidth=3;ctx.strokeStyle="#102031";ctx.strokeText(text,x,y);ctx.fillStyle=color;ctx.fillText(text,x,y);return true;
  };
  ctx.font="500 11px Manrope, sans-serif";ctx.textAlign="center";ctx.textBaseline="bottom";
  for(const c of this.places){
   if(this.lod<1&&!c.capital)continue;
   const p=project(c.x,c.z);if(!p.visible)continue;
   ctx.fillStyle=c.capital?"#efd49a":"#d1dce6";const radius=c.capital?2.1:zoom<8?0.9:1.4;
   ctx.fillRect(p.x-radius,p.y-radius,radius*2,radius*2);
   if(this.stableLabels.has(c))if(label((c.capital?"★ ":"")+c.name.toUpperCase(),p.x,p.y-4,c.capital?"#f1d397":"#d9e6ef"))this.visibleNames.add(c.name);
  }
  if(zoom>=2){ctx.font="600 11px Manrope,sans-serif";for(const n of Object.values(this.sim.state.nations))if(n.breakaway&&!n.defeated&&n.capital){const p=project(...n.capital);if(p.visible)label(n.breakaway.name.toUpperCase(),p.x,p.y-13,"#e8edf2");}}
  const portCells=new Set<string>();
  for(const port of this.data.ports??[]){
   if(zoom<5)continue;const p=project(port.x,port.z);if(!p.visible)continue;
   const key=Math.floor(p.x/19)+":"+Math.floor(p.y/19);if(portCells.has(key))continue;portCells.add(key);
   ctx.font="16px 'Segoe UI Symbol', sans-serif";ctx.textBaseline="middle";ctx.lineWidth=3;ctx.strokeStyle="#122739";ctx.strokeText("⚓",p.x,p.y);ctx.fillStyle="#a5d5f1";ctx.fillText("⚓",p.x,p.y);
   if(zoom>=12){ctx.font="500 10px Manrope, sans-serif";ctx.textBaseline="bottom";label(port.name,p.x,p.y-10,"#b5dcf3");}
   ctx.font="500 11px Manrope, sans-serif";ctx.textBaseline="bottom";
  }
 }
 private updateIndustry(camera:THREE.OrthographicCamera,w:number,h:number){
  if(this.markerTick!==this.sim.state.elapsed){this.markerTick=this.sim.state.elapsed;this.industryMarkers=this.sim.state.buildings.filter(b=>b.hp>0&&(b.type==="factory"||b.construction||b.mineUpgrade)&&this.sim.visibility.canSeeBuilding(this.sim.state.nation,b)).map(b=>({building:b,working:b.type==="factory"&&this.sim.economy.status(b)==="Producing"}));}
  let movingStack=false;for(const members of this.sim.visibleStacks().groups.values())if(members.length>1&&members.some(u=>u.path.length)){movingStack=true;break;}
  const signature=`${this.sim.state.elapsed}:${movingStack?this.sim.state.tickPhase:0}:${w}:${h}:${camera.zoom}:${camera.matrixWorld.elements.join(":")}`;if(signature===this.industrySignature)return;this.industrySignature=signature;
  const dpr=Math.min(devicePixelRatio,2),canvas=this.industryCanvas;if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  const ctx=canvas.getContext("2d")!;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.textAlign="center";ctx.textBaseline="bottom";
  const v=new THREE.Vector3(),zoom=camera.zoom;const project=(x:number,z:number)=>{v.set(x,0.5,z).project(camera);return {x:(v.x+1)*w/2,y:(1-v.y)*h/2,visible:v.z>=-1&&v.z<=1&&Math.abs(v.x)<1.05&&Math.abs(v.y)<1.05};};
  for(const [id,members] of this.sim.visibleStacks().groups)if(members.length>1){const u=members[0],position=this.unitPosition?.(id)??u,p=project(position.x,position.z);if(!p.visible)continue;ctx.font="700 11px Manrope,sans-serif";const text=`${members.length} · ${members.reduce((sum,m)=>sum+personnel(m),0).toLocaleString()}`;ctx.fillStyle="#111820";ctx.fillRect(p.x-29,p.y-32,58,15);ctx.fillStyle="#f0f4f8";ctx.fillText(text,p.x,p.y-20);}
  for(const {building:b,working} of this.industryMarkers){const p=project(b.x,b.z);if(!p.visible)continue;
   if(b.mineUpgrade){const job=b.mineUpgrade,width=50,y=p.y-20;ctx.fillStyle="#111318";ctx.fillRect(p.x-25,y,width,6);ctx.fillStyle="#66cbb5";ctx.fillRect(p.x-25,y,width*(1-job.remaining/job.total),6);ctx.font="600 10px Manrope,sans-serif";ctx.fillStyle="#e8edf2";ctx.fillText('Mine upgrade',p.x,y-4);}
   if(b.construction){const job=b.construction,width=50,x=p.x-width/2,y=p.y-20;ctx.fillStyle="#111318";ctx.fillRect(x-1,y-1,width+2,8);ctx.fillStyle=job.missing?.length?"#D87570":"#E8EDF2";ctx.fillRect(x,y,width*job.completedDays/job.totalDays,6);ctx.strokeStyle="#89919a";ctx.lineWidth=1;ctx.strokeRect(x,y,width,6);ctx.font="600 10px Manrope,sans-serif";ctx.fillStyle="#E8EDF2";ctx.fillText(`${job.completedDays}/${job.totalDays} days${job.missing?.length?" · paused":""}`,p.x,y-4);continue;}
   if(zoom<3)continue;ctx.fillStyle=working?"#ffffff":"#D87570";ctx.strokeStyle="#111318";ctx.lineWidth=2;
   const x=p.x-7,y=p.y-23;ctx.beginPath();ctx.moveTo(x,y+12);ctx.lineTo(x,y+5);ctx.lineTo(x+5,y+2);ctx.lineTo(x+5,y+5);ctx.lineTo(x+10,y+2);ctx.lineTo(x+10,y+5);ctx.lineTo(x+13,y+5);ctx.lineTo(x+13,y+12);ctx.closePath();ctx.stroke();ctx.fill();
  }
 }
 dispose(){this.canvas.remove();this.industryCanvas.remove();}
}
