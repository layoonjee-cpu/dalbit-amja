import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { build } from 'esbuild';

// BEGIN_BRIDGE_RENDER
const DEFAULT_AD_GROUP_ID='ait-ad-test-rewarded-id';
const AD_ID_MARKER=/\/\*__AD_GROUP_ID_START__\*\/[\s\S]*?\/\*__AD_GROUP_ID_END__\*\//;
function validateAdGroupId(raw){
  const id=(typeof raw==='string'?raw.trim():'')||DEFAULT_AD_GROUP_ID;
    if(!/^[A-Za-z0-9._:-]{1,128}$/.test(id))throw Error('Invalid AD_GROUP_ID (allowed: letters, digits, . _ : -; max 128 chars)');
      return id;
      }
      function renderBridge(template,id){
        if(!AD_ID_MARKER.test(template))throw Error('ad-bridge.js is missing the AD_GROUP_ID markers');
          // function replacement: the replacement string is NOT interpreted (const here=, $1, ... are literal)
            return template.replace(AD_ID_MARKER,()=>JSON.stringify(id));
            }
            // END_BRIDGE_RENDER
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
                                                // IAP saju build
                                                const apiBase=fs.readFileSync(path.join(here,'api-base.txt'),'utf8').trim();
                                                await build({entryPoints:[path.join(here,'src/saju.js')],bundle:true,format:'iife',minify:true,outfile:path.join(dist,'saju.js'),define:{__SAJU_API__:JSON.stringify(apiBase)},target:['es2019']});

                                                const AD_ID=validateAdGroupId(process.env.AD_GROUP_ID);
                                                const AD_ID_FROM_ENV=!!(process.env.AD_GROUP_ID&&process.env.AD_GROUP_ID.trim());
                                                const AD_IS_TEST=AD_ID===DEFAULT_AD_GROUP_ID||AD_ID.startsWith('ait-ad-test-');
                                                if(AD_IS_TEST)console.warn('WARNING: rewarded ad is using a Toss TEST ad group id ('+AD_ID+'); set AD_GROUP_ID to the console-issued live id before release.');
                                                if(process.env.REQUIRE_LIVE_AD_ID==='1'&&AD_IS_TEST)throw Error('REQUIRE_LIVE_AD_ID=1 but a test ad group id is in use');
                                                const AD_TEMPLATE=fs.readFileSync(path.join(here,'ad-bridge.js'),'utf8');
                                                const AD_SNIPPET=renderBridge(AD_TEMPLATE,AD_ID);
                                                if(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|\beval\s*\(|new\s+Function|createElement\s*\(\s*['"]script/.test(AD_SNIPPET))throw Error('ad-bridge.js must not add network or dynamic-code calls');
                                                const bridgeSource=path.join(here,'.bridge.js');
                                                fs.writeFileSync(bridgeSource,`import { graniteEvent, closeView, loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/web-framework';
                                                window.__TOSS__=true;
                                                ${AD_SNIPPET}
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
                                                html=html.replace('</head>','<script src="saju.js"></script></head>');
                                                if(/<iframe\b|sajulab-form|open\.kakao\.com|kakaopay-/i.test(html))throw Error('Forbidden integration remained in miniapp HTML');
                                                html=html.replace('</head>','<script src="saju.js"></' + 'script></head>');
                                                fs.writeFileSync(path.join(dist,'index.html'),html);
                                                const appCode=fs.readFileSync(path.join(dist,'app.js'),'utf8');
                                                const forbidden=['https://unmyung.sajulab.kr/2026','https://www.sajulab.kr/js/embed.js','kakaopay-vip-500','kakaopay-3000','3333-35-5912880','3333355912880'];
                                                for(const token of forbidden)if(appCode.includes(token))throw Error('Forbidden payment or external integration remained: '+token);
                                                const bridgeCode=fs.readFileSync(path.join(dist,'bridge.js'),'utf8');
                                                if(bridgeCode.includes('__AD_GROUP_ID_')||bridgeCode.includes('__AD_ID__'))throw Error('AD_GROUP_ID placeholder remained in bridge');
                                                if(!bridgeCode.includes(AD_ID))throw Error('AD_GROUP_ID missing from bundled bridge');
                                                if(!/<script src="\.\/bridge\.js"><\/script><script src="\.\/app\.js"><\/script><\/body>/.test(html))throw Error('bridge.js script tag missing');
                                                const report={appName:'unmyeongnonja',files:Object.keys(payload),assetCount:assets.length,assetBytes:downloaded,htmlSha256:crypto.createHash('sha256').update(html).digest('hex'),appSha256:crypto.createHash('sha256').update(appCode).digest('hex'),externalPaymentRemoved:true,rewardedAd:{adGroupId:AD_ID,isTestId:AD_IS_TEST,source:AD_ID_FROM_ENV?'env:AD_GROUP_ID':'default-test-id',bridgeTemplateSha256:crypto.createHash('sha256').update(AD_TEMPLATE).digest('hex'),bridgeSha256:crypto.createHash('sha256').update(bridgeCode).digest('hex'),sdkExports:['graniteEvent','closeView','loadFullScreenAd','showFullScreenAd']}};
                                                fs.writeFileSync(path.join(here,'build-report.json'),JSON.stringify(report,null,2));
                                                console.log('UNMYEONG MINIAPP READY',JSON.stringify(report));
                                                