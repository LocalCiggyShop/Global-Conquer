import {readFile,writeFile,mkdir,access} from "node:fs/promises";
import {createHash} from "node:crypto";
const regions=["europe","asia","africa","north-america","south-america","oceania","antarctica"];
const codes=new Set();
for(const region of regions){const data=JSON.parse(await readFile(`public/data/${region}.json`,"utf8"));for(const c of data.countries)if(/^[a-z]{2}$/.test(c.flagCode??""))codes.add(c.flagCode);}
await mkdir("public/flags",{recursive:true});
const queue=[...codes];
await Promise.all(Array.from({length:6},async()=>{for(let code;code=queue.pop();){const path=`public/flags/${code}.svg`;try{await access(path);}catch{const response=await fetch(`https://raw.githubusercontent.com/hampusborgos/country-flags/main/svg/${code}.svg`);if(!response.ok)throw new Error(`Flag ${code}: ${response.status}`);await writeFile(path,await response.text());}}}));
const manifest={source:"https://github.com/hampusborgos/country-flags",description:"Flag SVGs sourced from Wikimedia Commons and statutory flag specifications; see upstream attribution.",files:{}};
for(const code of codes)manifest.files[code]=createHash("sha256").update(await readFile(`public/flags/${code}.svg`)).digest("hex");
await writeFile("public/flags/sources.json",JSON.stringify(manifest,null,2));
console.log(`${codes.size} local national flags ready.`);
