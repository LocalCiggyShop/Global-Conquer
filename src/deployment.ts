import type {Campaign,ContinentData,Grid,Polygon} from "./types";
import type {StrategicState} from "./states";
import type {NationLabelLayout} from "./map-labels";
import type {PoliticalField} from "./political-fields";
export interface PackedGeometry {position:Float32Array;normal:Float32Array;uv:Float32Array;index:Uint32Array;}
export interface PreparedDeployment {
 state:Campaign;grid:Grid;territory:{states:StrategicState[];membership:Int32Array};
 naval:{water:Uint8Array;coastMask:Uint8Array;coasts:number[];coastalOwners:number[]};components:Int32Array;
 countries:{id:string;geometry:PackedGeometry;border:Float32Array;minimap:Polygon[]}[];lakes:PackedGeometry|null;
 labels:NationLabelLayout[];fields:PoliticalField[];timings:Record<string,number>;
}
type GridPreparation={grid:Grid;viable:string[]};
export async function backgroundPreparation(data:ContinentData,grid:Grid|null,nation:string|null,saved:Campaign|null,progress:(value:number,label:string)=>void,signal?:AbortSignal):Promise<PreparedDeployment|GridPreparation> {
 const run=()=>new Promise<PreparedDeployment|GridPreparation>((resolve,reject)=>{
  const worker=new Worker(new URL("./deployment.worker.ts",import.meta.url),{type:"module"});
  let timer:ReturnType<typeof setTimeout>;
  const cleanup=()=>{clearTimeout(timer);worker.terminate();signal?.removeEventListener("abort",abort);};
  const fail=(error:Error)=>{cleanup();reject(error);};
  const abort=()=>fail(new DOMException("Cancelled","AbortError"));
  const deadline=(ms:number)=>{clearTimeout(timer);timer=setTimeout(()=>fail(new Error("Map preparation timed out. Please retry.")),ms);};
  signal?.addEventListener("abort",abort,{once:true});
  if(signal?.aborted){abort();return;}
  worker.onmessage=(event)=>{
   const m=event.data;
   if(m.type==="online"){deadline(60000);worker.postMessage({data,grid,nation,saved});return;}
   if(m.type==="progress"){deadline(60000);progress(m.value,m.label);return;}
   cleanup();if(m.type==="error")reject(new Error(m.message));else resolve(m.value);
  };
  worker.onerror=(e)=>fail(new Error(e.message||"Map preparation failed."));
  deadline(10000);
 });
 for(let attempt=0;attempt<2;attempt++)try{return await run();}catch(error){if(signal?.aborted||attempt===1)throw error;progress(0,"Retrying map preparation");}
 throw new Error("Map preparation failed.");
}
