// 사이트 루트의 정적 파일을 miniapp/dist 로 복사하고 토스 미니앱용으로 보정한다.
import fs from 'node:fs';
import { build } from 'esbuild';
import path from 'node:path';
const here=path.dirname(new URL(import.meta.url).pathname);
const root=path.resolve(here,'..');
const dist=path.resolve(here,'dist');
fs.rmSync(dist,{recursive:true,force:true});
fs.mkdirSync(dist,{recursive:true});
fs.cpSync(path.join(root,'assets'),path.join(dist,'assets'),{recursive:true});
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
function rep(a,b,label){if(!html.includes(a)){console.warn('[patch skipped]',label);return}html=html.split(a).join(b)}
rep('<link rel="manifest" href="manifest.webmanifest">','','manifest');
rep("if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('/sw.js').catch(()=>{});",'','service worker');
rep('function openDonate(){',"function openDonate(){if(window.__TOSS__){status('토스 앱에서는 곧 만나요');return}",'openDonate');
rep('function openTile(txt){',"function openTile(txt){if(window.__TOSS__){status('토스 앱에서는 곧 만나요');return}",'openTile');
rep('function askCandle(){',"function askCandle(){if(window.__TOSS__){prayCandle();return}",'askCandle');
rep('function goTile(){',"function goTile(){if(window.__TOSS__){status('토스 앱에서는 곧 만나요');return}",'goTile');
// 토스: 자동 공지 제거 - 날씨 알림만 유지
rep("function status(t,ms=3200,kind=''){","function status(t,ms=3200,kind=''){if(window.__TOSS__&&kind!=='weather'){return}",'status-quiet');
html=html.replace('</head>','<script src="miniapp.js"></script><script src="saju.js"></script></head>');
const apiBase=(fs.existsSync(path.join(here,'api-base.txt'))?fs.readFileSync(path.join(here,'api-base.txt'),'utf8').trim():'https://www.unmyung.kr');
await build({entryPoints:[path.join(here,'src/saju.js')],bundle:true,format:'iife',minify:true,outfile:path.join(dist,'saju.js'),define:{__SAJU_API__:JSON.stringify(apiBase)},target:['es2019']});
fs.writeFileSync(path.join(dist,'index.html'),html);
fs.copyFileSync(path.join(here,'miniapp.js'),path.join(dist,'miniapp.js'));
console.log('miniapp dist ready',fs.readdirSync(dist));
