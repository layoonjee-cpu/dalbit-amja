import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { build } from 'esbuild';

const here=path.dirname(new URL(import.meta.url).pathname);
const source=path.join(here,'.source');
const dist=path.join(here,'dist');
const payload=JSON.parse(fs.readFileSync(path.join(here,'source-snapshot.json'),'utf8'));
const assets=JSON.parse(fs.readFileSync(path.join(here,'assets-manifest.json'),'utf8'));
for(const d of [source,dist]){fs.rmSync(d,{recursive:true,force:true});fs.mkdirSync(d,{recursive:true});}
for(const [name,content] of Object.entries(payload)){
  if(name.includes('..')||path.isAbsolute(name))throw Error('Invalid source path');
  const p=path.join(source,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,content);
}
const downloads=[...assets];
let downloaded=0;
async function worker(){
  while(downloads.length){
    const file=downloads.shift();
    if(!file.path.startsWith('assets/')||file.path.includes('..'))throw Error('Invalid asset path');
    let bytes;
    if(process.env.ORIGINAL_ASSETS_ROOT){bytes=fs.readFileSync(path.join(process.env.ORIGINAL_ASSETS_ROOT,file.path));}
    else{const response=await fetch('https://unmyeongnonja.pages.dev/'+file.path);if(!response.ok)throw Error('Asset download failed '+file.path+' '+response.status);bytes=Buffer.from(await response.arrayBuffer());}
    if(bytes.length!==file.size)throw Error('Asset size changed: '+file.path);
    const p=path.join(dist,file.path);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,bytes);downloaded+=bytes.length;
  }
}
await Promise.all(Array.from({length:6},worker));
await build({entryPoints:[path.join(source,'js/app.js')],bundle:true,format:'iife',minify:true,outfile:path.join(dist,'app.js'),platform:'browser',target:['es2020'],logLevel:'info'});
const bridgeSource=path.join(here,'.bridge.js');
fs.writeFileSync(bridgeSource,`import { graniteEvent, closeView } from '@apps-in-toss/web-framework';
window.__TOSS__=true;
try { graniteEvent.addEventListener('backEvent',{onEvent:()=>{Promise.resolve(closeView()).catch(()=>{});},onError:()=>{}}); } catch(e) { console.info('Toss back bridge is available in the Toss app.'); }
window.open=function(){return null;};
document.addEventListener('click',function(e){const a=e.target&&e.target.closest&&e.target.closest('a[href]');if(a){const h=a.getAttribute('href')||'';if(h.startsWith('http:')||h.startsWith('https:')||h.startsWith('//')||h.startsWith('mailto:')||h.startsWith('tel:')){e.preventDefault();e.stopPropagation();}}},true);
`);
await build({entryPoints:[bridgeSource],bundle:true,format:'iife',minify:true,outfile:path.join(dist,'bridge.js'),platform:'browser',target:['es2020'],logLevel:'info'});
let html=fs.readFileSync(path.join(source,'index.html'),'utf8');
html=html.replace(/<script\b[^>]*type=["']importmap["'][^>]*>[\s\S]*?<\/script>/gi,'');
html=html.replace(/<script\b[^>]*src=["'][^"']*cloudflareinsights[^"']*["'][^>]*><\/script>/gi,'');
html=html.replace(/<script\b[^>]*src=["'](?:\.\/)?(?:js\/)?app\.js(?:\?[^"']*)?["'][^>]*><\/script>/gi,'');
html=html.replace('</head>','<meta name="color-scheme" content="light"></head>');
html=html.replace('</body>','<script src="./bridge.js"></script><script src="./app.js"></script></body>');
if(/<iframe\b|sajulab-form|open\.kakao\.com|kakaopay-/i.test(html))throw Error('Forbidden integration remained in miniapp HTML');
fs.writeFileSync(path.join(dist,'index.html'),html);
const appCode=fs.readFileSync(path.join(dist,'app.js'),'utf8');
const forbidden=['https://unmyung.sajulab.kr/2026','https://www.sajulab.kr/js/embed.js','kakaopay-vip-500','kakaopay-3000','3333-35-5912880','3333355912880'];
for(const token of forbidden)if(appCode.includes(token))throw Error('Forbidden payment or external integration remained: '+token);
const report={appName:'unmyeongnonja',files:Object.keys(payload),assetCount:assets.length,assetBytes:downloaded,htmlSha256:crypto.createHash('sha256').update(html).digest('hex'),appSha256:crypto.createHash('sha256').update(appCode).digest('hex'),externalPaymentRemoved:true};
fs.writeFileSync(path.join(here,'build-report.json'),JSON.stringify(report,null,2));
console.log('UNMYEONG MINIAPP READY',JSON.stringify(report));
