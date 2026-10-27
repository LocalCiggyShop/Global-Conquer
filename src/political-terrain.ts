import * as THREE from "three";
import {nationColor} from "./geopolitics";
import {preparePoliticalFields,type PoliticalField} from "./political-fields";
import type {Campaign,ContinentData,Grid} from "./types";
export class PoliticalTerrain {
 private layers=new Map<string,{field:PoliticalField;texture:THREE.DataTexture;pixels:Uint8Array}>();
 private colors=new Map<string,THREE.Color>();
 constructor(readonly grid:Grid,readonly data:ContinentData,fields=preparePoliticalFields(data,grid)) {
  for(const c of data.countries)this.colors.set(c.id,new THREE.Color(nationColor(c.id,data)).multiplyScalar(0.72));
  for(const field of fields){const pixels=new Uint8Array(field.lookup.length*4),texture=new THREE.DataTexture(pixels,field.width,field.height,THREE.RGBAFormat);texture.magFilter=texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;this.layers.set(field.id,{field,pixels,texture});}
 }
 countryTexture(id:string){return this.layers.get(id)!.texture;}
 attach(material:THREE.MeshStandardMaterial,id:string) {
  const {field,texture}=this.layers.get(id)!;
  material.customProgramCacheKey=()=>"country-political-field-v3";
  material.onBeforeCompile=(shader)=>{
   shader.uniforms.politicalMap={value:texture};
   shader.uniforms.politicalOrigin={value:new THREE.Vector2(this.grid.x+field.x*this.grid.cell,this.grid.z+field.z*this.grid.cell)};
   shader.uniforms.politicalExtent={value:new THREE.Vector2(field.width*this.grid.cell,field.height*this.grid.cell)};
   shader.vertexShader="varying vec2 vPoliticalUv; varying vec2 vTerrainPosition;\nuniform vec2 politicalOrigin;\nuniform vec2 politicalExtent;\n"+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\nvPoliticalUv=(position.xz-politicalOrigin)/politicalExtent;vTerrainPosition=position.xz;");
   shader.fragmentShader="varying vec2 vPoliticalUv; varying vec2 vTerrainPosition;\nuniform sampler2D politicalMap;\n"+shader.fragmentShader;
   // Continuous decorative relief, with no texture tiling or grid-sized noise.
   shader.fragmentShader=shader.fragmentShader.replace("#include <map_fragment>",`
    vec2 p=vTerrainPosition;
    float ridge=sin(p.x*0.23+p.y*0.14+sin(p.y*0.11)*1.6);
    float relief=0.975+0.025*ridge+0.012*sin(p.x*0.63-p.y*0.37);
    diffuseColor.rgb=texture2D(politicalMap,vPoliticalUv).rgb*relief;
   `);
  };
 }
 update(state:Campaign) {
  for(const {field,pixels,texture} of this.layers.values()) {
   let dirty=false;
   const fallback=state.nations[field.id]?.annexedBy??field.id;
   for(let n=0;n<field.lookup.length;n++) {
    const index=field.lookup[n],id=index>=0?state.occupation?.[index]?.controller??field.id:fallback,c=this.colors.get(id)??this.colors.get(field.id)!;
    const r=Math.round(c.r*255),g=Math.round(c.g*255),b=Math.round(c.b*255),o=n*4;
    if(pixels[o]!==r||pixels[o+1]!==g||pixels[o+2]!==b||pixels[o+3]!==255){pixels[o]=r;pixels[o+1]=g;pixels[o+2]=b;pixels[o+3]=255;dirty=true;}
   }
   if(dirty)texture.needsUpdate=true;
  }
 }
 dispose(){for(const layer of this.layers.values())layer.texture.dispose();}
}
