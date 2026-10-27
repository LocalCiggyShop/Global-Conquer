import * as THREE from "three";
import type {ContinentData,CitySite} from "./types";
import type {Simulation} from "./campaign";
/** Screen-space place labels: one canvas, no per-city textures or draw calls. */
export class CityOverlay {
 readonly canvas=document.createElement("canvas");
 readonly visibleNames=new Set<string>();
 private places:CitySite[];
 private signature="";
 constructor(readonly source:HTMLCanvasElement,readonly data:ContinentData,readonly sim:Simulation){
  this.canvas.className="city-overlay";this.canvas.setAttribute("aria-hidden","true");source.after(this.canvas);
  const places=[...(data.places??sim.state.cities??[])];
  const mappedNations=new Set(places.map((c)=>c.nation));
  for(const c of sim.state.cities??[])if(!mappedNations.has(c.nation))places.push(c);
  this.places=places.sort((a,b)=>Number(b.capital)-Number(a.capital)||b.population-a.population);
 }
 update(camera:THREE.OrthographicCamera){
  const w=this.source.clientWidth,h=this.source.clientHeight;
  // Project from the same final camera matrix as WebGL, without a second frame clock.
  const signature=`${w}:${h}:${camera.zoom}:${camera.matrixWorld.elements.join(":")}:${this.sim.territory.landRevision}`;
  if(signature===this.signature)return;this.signature=signature;
  const dpr=Math.min(devicePixelRatio,2);if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)){this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);}
  const ctx=this.canvas.getContext("2d")!;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);this.visibleNames.clear();
  const occupied=new Set<string>(),v=new THREE.Vector3(),zoom=camera.zoom;
  const project=(x:number,z:number)=>{v.set(x,0.5,z).project(camera);return {x:(v.x+1)*w/2,y:(1-v.y)*h/2,visible:v.z>=-1&&v.z<=1&&Math.abs(v.x)<1.05&&Math.abs(v.y)<1.05};};
  const label=(text:string,x:number,y:number,color:string)=>{
   const width=ctx.measureText(text).width+8,left=Math.floor((x-width/2)/42),right=Math.floor((x+width/2)/42),row=Math.floor(y/17),keys=[];
   for(let c=left;c<=right;c++)for(let r=row-1;r<=row;r++)keys.push(c+":"+r);
   if(keys.some((k)=>occupied.has(k)))return false;
   keys.forEach((k)=>occupied.add(k));ctx.lineWidth=3;ctx.strokeStyle="#102031";ctx.strokeText(text,x,y);ctx.fillStyle=color;ctx.fillText(text,x,y);return true;
  };
  ctx.font="500 11px Manrope, sans-serif";ctx.textAlign="center";ctx.textBaseline="bottom";
  for(const c of this.places){
   if(zoom<3&&!c.capital)continue;
   const p=project(c.x,c.z);if(!p.visible)continue;
   ctx.fillStyle=c.capital?"#efd49a":"#d1dce6";const radius=c.capital?2.1:zoom<8?0.9:1.4;
   ctx.fillRect(p.x-radius,p.y-radius,radius*2,radius*2);
   const threshold=zoom<5?Infinity:zoom<9?500000:zoom<15?100000:0;
   if((c.capital&&zoom>=3)||c.population>=threshold)if(label((c.capital?"★ ":"")+c.name.toUpperCase(),p.x,p.y-4,c.capital?"#f1d397":"#d9e6ef"))this.visibleNames.add(c.name);
  }
  const portCells=new Set<string>();
  for(const port of this.data.ports??[]){
   if(zoom<5)continue;const p=project(port.x,port.z);if(!p.visible)continue;
   const key=Math.floor(p.x/19)+":"+Math.floor(p.y/19);if(portCells.has(key))continue;portCells.add(key);
   ctx.font="16px 'Segoe UI Symbol', sans-serif";ctx.textBaseline="middle";ctx.lineWidth=3;ctx.strokeStyle="#122739";ctx.strokeText("⚓",p.x,p.y);ctx.fillStyle="#a5d5f1";ctx.fillText("⚓",p.x,p.y);
   if(zoom>=12){ctx.font="500 10px Manrope, sans-serif";ctx.textBaseline="bottom";label(port.name,p.x,p.y-10,"#b5dcf3");}
   ctx.font="500 11px Manrope, sans-serif";ctx.textBaseline="bottom";
  }
 }
 dispose(){this.canvas.remove();}
}
