// Offline preparation only: preserve original downloads and source attribution.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {Quaternion, Vector3, Matrix4, BoxGeometry} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
const folder='public/models',sourceFolder='assets/model-sources';
const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
const arrays={5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
async function read(file){
 const raw=await fs.readFile(path.join(sourceFolder,file)); const length=raw.readUInt32LE(12);
 const doc=JSON.parse(raw.subarray(20,20+length));const start=28+length;
 return {doc,bin:raw.subarray(start,start+raw.readUInt32LE(20+length))};
}
function append(asset,data){
 const padding=(4-asset.bin.length%4)%4,offset=asset.bin.length+padding;
 asset.bin=Buffer.concat([asset.bin,Buffer.alloc(padding),Buffer.from(data)]);
 return asset.doc.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.byteLength})-1;
}
function values(asset,index){
 const a=asset.doc.accessors[index],v=asset.doc.bufferViews[a.bufferView],C=arrays[a.componentType];
 if(!C||a.sparse)throw Error('Unsupported accessor');
 const width=widths[a.type],stride=v.byteStride??width*C.BYTES_PER_ELEMENT,out=new C(a.count*width);
 for(let i=0;i<a.count;i++)for(let j=0;j<width;j++){
  const offset=(v.byteOffset??0)+(a.byteOffset??0)+i*stride+j*C.BYTES_PER_ELEMENT;
  out[i*width+j]=C===Float32Array?asset.bin.readFloatLE(offset):C===Uint32Array?asset.bin.readUInt32LE(offset):C===Uint16Array?asset.bin.readUInt16LE(offset):asset.bin[offset];
 }
 return out;
}
function accessor(asset,data,type,componentType){
 const entry={bufferView:append(asset,Buffer.from(data.buffer,data.byteOffset,data.byteLength)),componentType,count:data.length/widths[type],type};
 if(type==='SCALAR'||type==='VEC3'){
  entry.min=Array(widths[type]).fill(Infinity);entry.max=Array(widths[type]).fill(-Infinity);
  for(let i=0;i<data.length;i++){let j=i%widths[type];entry.min[j]=Math.min(entry.min[j],data[i]);entry.max[j]=Math.max(entry.max[j],data[i]);}
 }
 return asset.doc.accessors.push(entry)-1;
}
function combineSoldier(asset){
 const d=asset.doc,parts=d.nodes.filter(n=>n.mesh!==undefined),geometries=parts.map(n=>d.meshes[n.mesh].primitives[0]);
 const attributes={},vertexCount=geometries.reduce((sum,p)=>sum+d.accessors[p.attributes.POSITION].count,0);
 for(const key of ['POSITION','NORMAL','JOINTS_0','WEIGHTS_0']){
  const first=d.accessors[geometries[0].attributes[key]],C=arrays[first.componentType],out=new C(vertexCount*widths[first.type]);let offset=0;
  for(const p of geometries){const data=values(asset,p.attributes[key]);out.set(data,offset);offset+=data.length;}
  attributes[key]=accessor(asset,out,first.type,first.componentType);
 }
 const colors=new Float32Array(vertexCount*3),indices=[];let offset=0;
 for(const p of geometries){
  const count=d.accessors[p.attributes.POSITION].count,c=d.materials[p.material].pbrMetallicRoughness?.baseColorFactor??[1,1,1,1];
  for(let i=0;i<count;i++)colors.set(c.slice(0,3),(offset+i)*3);
  for(const index of values(asset,p.indices))indices.push(index+offset);offset+=count;
 }
 attributes.COLOR_0=accessor(asset,colors,'VEC3',5126);
 const material=d.materials.push({name:'Infantry combined vertex palette',pbrMetallicRoughness:{metallicFactor:0,roughnessFactor:.85},doubleSided:false})-1;
 const mesh=d.meshes.push({name:'Infantry optimized',primitives:[{attributes,indices:accessor(asset,new Uint16Array(indices),'SCALAR',5123),material}]})-1;
 parts[0].mesh=mesh;for(const node of parts.slice(1))delete node.mesh;
}
function addInfantryAnimations(asset){
 const d=asset.doc,skin=d.skins[0],parents=new Map();
 d.nodes.forEach((n,i)=>(n.children??[]).forEach(c=>parents.set(c,i)));
 const matrix=i=>{const n=d.nodes[i];return n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3().fromArray(n.translation??[0,0,0]),new Quaternion().fromArray(n.rotation??[0,0,0,1]),new Vector3().fromArray(n.scale??[1,1,1]));};
 const world=i=>parents.has(i)?world(parents.get(i)).multiply(matrix(i)):matrix(i);
 const store=(i,m)=>{const p=new Vector3(),q=new Quaternion(),scale=new Vector3();m.decompose(p,q,scale);Object.assign(d.nodes[i],{translation:p.toArray(),rotation:q.toArray(),scale:scale.toArray()});delete d.nodes[i].matrix;};
 // Restore the actual inverse-bind pose: the supplied file is frozen mid-stride.
 const inverses=values(asset,skin.inverseBindMatrices),bind=new Map(skin.joints.map((node,j)=>[node,new Matrix4().fromArray(inverses,j*16).invert()]));
 for(const node of skin.joints){const parent=parents.get(node),parentWorld=parent===undefined?new Matrix4():bind.get(parent)??world(parent);store(node,parentWorld.clone().invert().multiply(bind.get(node)));}
 const find=part=>d.nodes.findIndex(n=>n.name?.startsWith('mixamorig:'+part+'_'));

 // Aim the actual bind-pose limb directions; this rig's rest pose has lowered arms.
 const aim=(joint,end,target)=>{
  const origin=new Vector3().setFromMatrixPosition(world(joint)),tip=new Vector3().setFromMatrixPosition(world(end));
  const delta=new Quaternion().setFromUnitVectors(tip.sub(origin).normalize(),target.sub(origin).normalize()),pq=new Quaternion();
  world(parents.get(joint)).decompose(new Vector3(),pq,new Vector3());
  d.nodes[joint].rotation=pq.clone().invert().multiply(delta).multiply(pq).multiply(new Quaternion().fromArray(d.nodes[joint].rotation)).toArray();
 };
 for(const [side,sign]of [['Left',1],['Right',-1]]){
  const arm=find(side+'Arm'),fore=find(side+'ForeArm'),hand=find(side+'Hand'),shoulder=new Vector3().setFromMatrixPosition(world(arm));
  aim(arm,fore,new Vector3(shoulder.x+sign*.03,shoulder.y-.22,shoulder.z+.20));
  const elbow=new Vector3().setFromMatrixPosition(world(fore));
  aim(fore,hand,new Vector3(elbow.x-sign*.12,elbow.y+.08,elbow.z+.28));
 }
 const animated=['Hips','Spine2','LeftUpLeg','RightUpLeg','LeftLeg','RightLeg','LeftFoot','RightFoot'].map(find);
 const bases=new Map(animated.map(i=>[i,{q:new Quaternion().fromArray(d.nodes[i].rotation),p:d.nodes[i].translation.slice(),parent:new Quaternion()}]));
 for(const [i,base]of bases)world(parents.get(i)).decompose(new Vector3(),base.parent,new Vector3());
 d.animations=[];
 for(const [name,moving,firing,duration]of [['GC_Idle',false,false,2],['GC_Walk',true,false,1.2],['GC_Fire',false,true,.65],['GC_WalkFire',true,true,1.2]]){
  const times=new Float32Array(25);for(let i=0;i<25;i++)times[i]=i*duration/24;
  const input=accessor(asset,times,'SCALAR',5126),samplers=[],channels=[];
  const track=(node,path,data,type)=>{const sampler=samplers.push({input,output:accessor(asset,new Float32Array(data),type,5126),interpolation:'LINEAR'})-1;channels.push({sampler,target:{node,path}});};
  for(const [node,base]of bases){
   const values=[];const part=d.nodes[node].name;
   for(let frame=0;frame<25;frame++){
    const phase=frame/24*Math.PI*2,wave=Math.sin(phase),left=part.includes('Left');let angle=0;
    if(moving&&part.includes('UpLeg'))angle=(left?1:-1)*wave*.35;
    else if(moving&&/:(Left|Right)Leg_/.test(part))angle=-Math.max(0,(left?-1:1)*wave)*.45;
    else if(moving&&part.includes('Foot'))angle=(left?-1:1)*wave*.12;
    else if(part.includes('Spine2'))angle=firing?Math.sin(phase*4)*.025:Math.sin(phase)*.012;
    const delta=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),angle);
    const q=base.parent.clone().invert().multiply(delta).multiply(base.parent).multiply(base.q);values.push(...q.toArray());
   }
   track(node,'rotation',values,'VEC4');
   if(part.includes('Hips')){const positions=[];for(let frame=0;frame<25;frame++){const p=base.p.slice();p[1]+=(moving?.014:.003)*(1-Math.cos(frame/24*Math.PI*4));positions.push(...p);}track(node,'translation',positions,'VEC3');}
  }
  d.animations.push({name,samplers,channels,extras:{author:'Global Conquer',description:'Authored lightweight in-place skeletal animation; no downloaded motion clips.'}});
 }
 // Small rifle silhouette attached to the real hand bone (one extra draw).
 const hand=find('RightHand'),left=find('LeftHand'),handWorld=world(hand),center=new Vector3().setFromMatrixPosition(handWorld).add(new Vector3().setFromMatrixPosition(world(left))).multiplyScalar(.5);center.z+=.12;
 const body=new BoxGeometry(.075,.11,.5),barrel=new BoxGeometry(.035,.035,.25);barrel.translate(0,.025,.35);
 const geometry=mergeGeometries([body,barrel]);
 const attrs={};for(const [key,name]of [['position','POSITION'],['normal','NORMAL']])attrs[name]=accessor(asset,geometry.attributes[key].array,'VEC3',5126);
 const material=d.materials.push({name:'Rifle',pbrMetallicRoughness:{baseColorFactor:[.025,.03,.035,1],metallicFactor:.3,roughnessFactor:.7}})-1;
 const mesh=d.meshes.push({name:'Rifle silhouette',primitives:[{attributes:attrs,indices:accessor(asset,new Uint16Array(geometry.index.array),'SCALAR',5123),material}]})-1;
 const node=d.nodes.push({name:'GC_Rifle',mesh})-1;store(node,handWorld.clone().invert().multiply(new Matrix4().makeTranslation(center.x,center.y,center.z)));(d.nodes[hand].children??=[]).push(node);
}
function selectSubtree(asset,name){
 const d=asset.doc,selected=d.nodes.findIndex(n=>n.name===name);if(selected<0)throw Error('Missing node '+name);
 // Keep ancestor transforms, discard siblings; this preserves source orientation.
 const parents=new Map();d.nodes.forEach((n,i)=>(n.children??[]).forEach(c=>parents.set(c,i)));
 let child=selected;while(parents.has(child)){const parent=parents.get(child);d.nodes[parent].children=[child];child=parent;}
 d.scenes=[{nodes:[child]}];d.scene=0;
}
function removeSubtree(asset,name){const d=asset.doc,index=d.nodes.findIndex(n=>n.name===name);for(const n of d.nodes)if(n.children)n.children=n.children.filter(i=>i!==index);}
function referencedTextures(material){const result=[];function walk(v){if(!v||typeof v!=='object')return;for(const [key,value]of Object.entries(v)){if(key.endsWith('Texture')&&value?.index!==undefined)result.push(value);else walk(value);}}walk(material);return result;}
function prune(asset){
 const d=asset.doc,sets={nodes:new Set(),meshes:new Set(),skins:new Set(),materials:new Set(),textures:new Set(),images:new Set(),samplers:new Set(),accessors:new Set(),bufferViews:new Set()};
 const visit=i=>{if(sets.nodes.has(i))return;sets.nodes.add(i);const n=d.nodes[i];if(n.mesh!==undefined)sets.meshes.add(n.mesh);if(n.skin!==undefined)sets.skins.add(n.skin);(n.children??[]).forEach(visit);};
 d.scenes.forEach(s=>s.nodes.forEach(visit));
 for(const i of sets.skins){const s=d.skins[i];s.joints.forEach(visit);if(s.skeleton!==undefined)visit(s.skeleton);if(s.inverseBindMatrices!==undefined)sets.accessors.add(s.inverseBindMatrices);}
 for(const i of sets.meshes)for(const p of d.meshes[i].primitives){Object.values(p.attributes).forEach(a=>sets.accessors.add(a));if(p.indices!==undefined)sets.accessors.add(p.indices);if(p.material!==undefined)sets.materials.add(p.material);}
 for(const a of d.animations??[])for(const s of a.samplers){sets.accessors.add(s.input);sets.accessors.add(s.output);}
 for(const i of sets.materials)referencedTextures(d.materials[i]).forEach(t=>sets.textures.add(t.index));
 for(const i of sets.textures){const t=d.textures[i];if(t.source!==undefined)sets.images.add(t.source);if(t.sampler!==undefined)sets.samplers.add(t.sampler);}
 for(const i of sets.images)if(d.images[i].bufferView!==undefined)sets.bufferViews.add(d.images[i].bufferView);
 for(const i of sets.accessors)sets.bufferViews.add(d.accessors[i].bufferView);
 const maps={};for(const [key,set]of Object.entries(sets)){maps[key]=new Map([...set].map((old,i)=>[old,i]));d[key]=[...set].map(i=>d[key][i]);}
 const map=(key,i)=>maps[key].get(i);
 for(const s of d.scenes)s.nodes=s.nodes.map(i=>map('nodes',i));
 for(const n of d.nodes){if(n.children)n.children=n.children.map(i=>map('nodes',i));if(n.mesh!==undefined)n.mesh=map('meshes',n.mesh);if(n.skin!==undefined)n.skin=map('skins',n.skin);}
 for(const s of d.skins){s.joints=s.joints.map(i=>map('nodes',i));if(s.skeleton!==undefined)s.skeleton=map('nodes',s.skeleton);if(s.inverseBindMatrices!==undefined)s.inverseBindMatrices=map('accessors',s.inverseBindMatrices);}
 for(const m of d.meshes)for(const p of m.primitives){for(const k in p.attributes)p.attributes[k]=map('accessors',p.attributes[k]);if(p.indices!==undefined)p.indices=map('accessors',p.indices);if(p.material!==undefined)p.material=map('materials',p.material);}
 for(const a of d.animations??[]){a.channels.forEach(c=>c.target.node=map('nodes',c.target.node));a.samplers.forEach(s=>{s.input=map('accessors',s.input);s.output=map('accessors',s.output);});}
 for(const m of d.materials)referencedTextures(m).forEach(t=>t.index=map('textures',t.index));
 for(const t of d.textures){if(t.source!==undefined)t.source=map('images',t.source);if(t.sampler!==undefined)t.sampler=map('samplers',t.sampler);}
 for(const im of d.images)if(im.bufferView!==undefined)im.bufferView=map('bufferViews',im.bufferView);
 for(const a of d.accessors)a.bufferView=map('bufferViews',a.bufferView);
 const chunks=[];let length=0;for(const view of d.bufferViews){const pad=(4-length%4)%4;chunks.push(Buffer.alloc(pad));length+=pad;const chunk=asset.bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);view.buffer=0;view.byteOffset=length;chunks.push(chunk);length+=chunk.length;}
 asset.bin=Buffer.concat(chunks);d.buffers=[{byteLength:asset.bin.length}];
}
async function resizeTextures(asset){
 for(const image of asset.doc.images??[]){const view=asset.doc.bufferViews[image.bufferView],data=asset.bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
  const resized=await sharp(data).resize({width:512,height:512,fit:'inside',withoutEnlargement:true}).png().toBuffer();
  image.bufferView=append(asset,resized);image.mimeType='image/png';
 }
}
async function write(asset,file){
 prune(asset);
 // Sketchfab often interleaves all pack meshes in large shared views. Repack each
 // retained accessor, otherwise an extracted boat still carries the entire pack.
 const packedAccessors=asset.doc.accessors.map((_,i)=>values(asset,i));
 const packedImages=asset.doc.images.map(image=>{const v=asset.doc.bufferViews[image.bufferView];return Buffer.from(asset.bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength));});
 asset.bin=Buffer.alloc(0);asset.doc.bufferViews=[];
 asset.doc.accessors.forEach((a,i)=>{const data=packedAccessors[i];a.bufferView=append(asset,Buffer.from(data.buffer,data.byteOffset,data.byteLength));delete a.byteOffset;});
 asset.doc.images.forEach((image,i)=>image.bufferView=append(asset,packedImages[i]));
 asset.doc.buffers=[{byteLength:asset.bin.length}];
 asset.doc.asset.generator='Global Conquer offline preparation (original source in extras)';
 const json=Buffer.from(JSON.stringify(asset.doc)),jpad=Buffer.alloc((4-json.length%4)%4,32),bpad=Buffer.alloc((4-asset.bin.length%4)%4);
 const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+jpad.length+asset.bin.length+bpad.length,8);header.writeUInt32LE(json.length+jpad.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const bh=Buffer.alloc(8);bh.writeUInt32LE(asset.bin.length+bpad.length,0);bh.writeUInt32LE(0x004e4942,4);
 await fs.writeFile(path.join(folder,file),Buffer.concat([header,json,jpad,bh,asset.bin,bpad]));
 const tris=asset.doc.meshes.reduce((s,m)=>s+m.primitives.reduce((s,p)=>s+asset.doc.accessors[p.indices??p.attributes.POSITION].count/3,0),0);
 console.log(file,`${Math.round((28+json.length+asset.bin.length)/1024)} KiB`,`${tris} triangles`,`${asset.doc.meshes.reduce((s,m)=>s+m.primitives.length,0)} draws`);
}
const soldier=await read('free_military_soldier_rigged.glb');combineSoldier(soldier);addInfantryAnimations(soldier);await write(soldier,'infantry.glb');
const tank=await read('rtcw_tiger_tank.glb');for(const m of tank.doc.materials){m.alphaMode='OPAQUE';delete m.extensions;}
// Specular extension is not needed for the distant RTS representation.
delete tank.doc.extensionsUsed;delete tank.doc.extensionsRequired;await resizeTextures(tank);await write(tank,'armor.glb');
const ship=await read('low_poly_frigate_ship_with_helicopter.glb');removeSubtree(ship,'MD_501:Helicopter');prune(ship);await resizeTextures(ship);await write(ship,'frigate.glb');
const boat=await read('3d_trench_system_pack_free.glb');selectSubtree(boat,'barco 2.001_64');prune(boat);await resizeTextures(boat);await write(boat,'transport.glb');
