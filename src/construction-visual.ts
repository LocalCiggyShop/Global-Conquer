import * as THREE from 'three';
import type {Building} from './types';
import {disposeObject} from './render-utils';
interface Parts {base:THREE.Mesh;body:THREE.Mesh;roof:THREE.Mesh;details:THREE.Object3D[];finishing:THREE.Object3D[]}
interface Site {parts:Parts;group:THREE.Group;frame:THREE.LineSegments;key:string}
/** Only construction sites allocate this small, static excavation/scaffold. */
export function attachConstructionSite(model:THREE.Group,parts:Parts,building:Building){
 if(!building.construction)return;
 const group=new THREE.Group();group.name='construction-site';
 const earth=new THREE.Mesh(new THREE.PlaneGeometry(2.15,2.15),new THREE.MeshStandardMaterial({color:'#4d4438',roughness:1}));
 earth.rotation.x=-Math.PI/2;earth.position.y=.02;group.add(earth);
 const rim=new THREE.Mesh(new THREE.RingGeometry(1.32,1.48,4),new THREE.MeshStandardMaterial({color:'#746652',roughness:1,side:THREE.DoubleSide}));
 rim.rotation.set(-Math.PI/2,0,Math.PI/4);rim.position.y=.04;group.add(rim);
 const points:number[]=[];const edge=(a:number[],b:number[])=>points.push(...a,...b);
 for(const x of [-.9,.9])for(const z of [-.8,.8])edge([x,.08,z],[x,1.5,z]);
 for(const y of [.55,1.5]){edge([-.9,y,-.8],[.9,y,-.8]);edge([-.9,y,.8],[.9,y,.8]);edge([-.9,y,-.8],[-.9,y,.8]);edge([.9,y,-.8],[.9,y,.8]);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
 const frame=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#DDB565'}));group.add(frame);model.add(group);
 model.userData.constructionSite={parts,group,frame,key:''} satisfies Site;
 updateConstructionSite(model,building);
}
export function updateConstructionSite(model:THREE.Group,building:Building){
 const site=model.userData.constructionSite as Site|undefined;if(!site)return;
 const job=building.construction,key=job?`${job.completedDays}/${job.totalDays}:${!!job.missing?.length}`:'complete';
 if(key===site.key)return;site.key=key;
 const progress=job?Math.max(0,Math.min(1,job.completedDays/job.totalDays)):1,{base,body,roof,details,finishing}=site.parts;
 base.visible=progress>0;body.visible=progress>0;
 body.scale.y=job?Math.min(1,progress*1.5):1;body.position.y=.175+.425*body.scale.y;
 roof.visible=progress>=.75;details.forEach(part=>part.visible=progress>=.5);finishing.forEach(part=>part.visible=!job);
 site.frame.visible=progress>0;
 (site.frame.material as THREE.LineBasicMaterial).color.set(job?.missing?.length?'#D87570':'#DDB565');
 if(!job){disposeObject(site.group);delete model.userData.constructionSite;}
}
