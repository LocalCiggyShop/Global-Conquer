import type {ContinentData} from "./types";
const cache=new Map<string,ContinentData>();
/** Small gzip packages avoid multi-megabyte transfers on the Windows/WSL dev connection. */
export async function loadMap(id:string,signal:AbortSignal):Promise<ContinentData>{
 const hit=cache.get(id);if(hit)return hit;
 let last:unknown;
 for(let attempt=0;attempt<2;attempt++)try{
  const requestSignal=AbortSignal.any([signal,AbortSignal.timeout(15000)]);
  let response=await fetch(`/data/${id}.json.gz`,{signal:requestSignal,cache:attempt?"reload":"default"});
  if(response.status===404)response=await fetch(`/data/${id}.json`,{signal:requestSignal});
  if(!response.ok)throw new Error(`Map download failed (${response.status}).`);
  const buffer=await response.arrayBuffer(),bytes=new Uint8Array(buffer);
  const data:ContinentData=bytes[0]===31&&bytes[1]===139
   ?await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"))).json()
   :JSON.parse(new TextDecoder().decode(buffer));
  cache.set(id,data);while(cache.size>2)cache.delete(cache.keys().next().value!);return data;
 }catch(error){if(signal.aborted)throw error;last=error;}
 throw new Error(last instanceof Error?`Map download did not finish: ${last.message}. Please retry.`:"Map download did not finish. Please retry.");
}
