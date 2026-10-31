import { IAP, Share, Clipboard } from "@apps-in-toss/web-framework";
const SKU="ait.0000094986.bba31e5c.084ade73b2.3465092764";
const API=(typeof __SAJU_API__!=="undefined"?__SAJU_API__:"https://www.unmyung.kr").replace(/\/$/,"");
const PRICE="4,895원";
const TIMES=[["","시간 모름"],["00:00","자시 (23:00~01:00)"],["02:00","축시 (01:00~03:00)"],["04:00","인시 (03:00~05:00)"],["06:00","묘시 (05:00~07:00)"],["08:00","진시 (07:00~09:00)"],["10:00","사시 (09:00~11:00)"],["12:00","오시 (11:00~13:00)"],["14:00","미시 (13:00~15:00)"],["16:00","신시 (15:00~17:00)"],["18:00","유시 (17:00~19:00)"],["20:00","술시 (19:00~21:00)"],["22:00","해시 (21:00~23:00)"]];
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const css=`#sj{position:fixed;inset:0;z-index:90;background:rgba(10,10,20,.55);display:none;align-items:flex-end;justify-content:center}#sj.on{display:flex}
#sj .box{background:#fff;color:#191919;width:100%;max-width:520px;max-height:92vh;overflow:auto;border-radius:22px 22px 0 0;padding:22px 18px 28px;font-family:"Apple SD Gothic Neo","Pretendard","Noto Sans KR",sans-serif}
#sj h2{margin:0 0 4px;font-size:21px;color:#5B3DF5}#sj p.s{color:#6b7280;font-size:13.5px;line-height:1.6;margin:0 0 12px}
#sj label{display:block;font-weight:700;font-size:14px;margin:14px 0 6px}#sj input,#sj select{width:100%;box-sizing:border-box;padding:13px 12px;border:1.5px solid #e5e7eb;border-radius:12px;font-size:16px;background:#fff;color:#191919}
#sj .seg{display:flex;gap:8px}#sj .seg button{flex:1;padding:12px 0;border:1.5px solid #e5e7eb;border-radius:12px;background:#fff;font-size:15px;font-weight:700;color:#6b7280}#sj .seg button.on{border-color:#5B3DF5;background:#f1eeff;color:#5B3DF5}
#sj .go{width:100%;margin-top:20px;padding:15px;border:0;border-radius:14px;background:#5B3DF5;color:#fff;font-size:17px;font-weight:800}#sj .go[disabled]{opacity:.5}
#sj .ghost{width:100%;margin-top:10px;padding:13px;border:0;border-radius:14px;background:#f3f4f6;color:#374151;font-size:15px;font-weight:700}
#sj .err{color:#d93636;font-size:13.5px;margin-top:10px;min-height:18px}
#sj .pil{display:flex;gap:8px;margin:10px 0}#sj .pil div{flex:1;text-align:center;border-radius:12px;background:#f6f4ff;padding:10px 0}#sj .pil b{display:block;font-size:22px;color:#1c1650}#sj .pil small{color:#6b7280}
#sj .sec{margin:16px 0;padding:14px;border-radius:14px;background:#faf9ff}#sj .sec h3{margin:0 0 8px;font-size:16px;color:#1c1650}#sj .sec .b{white-space:pre-wrap;line-height:1.75;font-size:14.5px;color:#374151}
#sj .acts{display:flex;gap:8px;margin:12px 0}#sj .acts button{flex:1;padding:12px 4px;border:0;border-radius:12px;background:#f1eeff;color:#5B3DF5;font-size:14.5px;font-weight:800}#sj .tags span{display:inline-block;margin:3px 4px 3px 0;padding:5px 10px;border-radius:999px;background:#f1eeff;color:#5B3DF5;font-size:13px}`;
const st=document.createElement("style");st.textContent=css;(document.head||document.documentElement).appendChild(st);
let root=null,box=null,busy=false;
function ensureRoot(){if(root)return;root=document.createElement("div");root.id="sj";root.innerHTML='<div class="box"></div>';document.body.appendChild(root);box=$(".box",root);root.addEventListener("click",e=>{if(e.target===root&&!busy)close()})}
function close(){if(root)root.classList.remove("on")}
function api(path,body){return fetch(API+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).then(async r=>{const j=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(j.message||"요청에 실패했어요.");e.status=r.status;throw e}return j})}
let form={gender:"F",calendar:"solar"};
function showForm(msg){
  const yearNow=new Date().getFullYear();
  box.innerHTML='<h2>사주풀이 신청</h2><p class="s">스님이 이름과 생년월일로 사주를 풀어드려요. 1회 이용권 '+PRICE+'.</p>'+
  '<label>이름</label><input id="sjN" maxlength="10" placeholder="이름" value="'+esc(form.name||"")+'">'+
  '<label>성별</label><div class="seg" id="sjG"><button data-v="F" class="'+(form.gender==="F"?"on":"")+'">여성</button><button data-v="M" class="'+(form.gender==="M"?"on":"")+'">남성</button></div>'+
  '<label>달력</label><div class="seg" id="sjC"><button data-v="solar" class="'+(form.calendar==="solar"?"on":"")+'">양력</button><button data-v="lunar" class="'+(form.calendar==="lunar"?"on":"")+'">음력</button><button data-v="leap_lunar" class="'+(form.calendar==="leap_lunar"?"on":"")+'">음력 윤달</button></div>'+
  '<label>생년월일</label><input id="sjD" type="date" min="1920-01-01" max="'+yearNow+'-12-31" value="'+esc(form.birthDate||"")+'">'+
  '<label>태어난 시간대</label><select id="sjT">'+TIMES.map(([v,l])=>'<option value="'+v+'"'+(form.birthTime===v?" selected":"")+'>'+l+'</option>').join("")+'</select>'+
  '<div class="err" id="sjE">'+esc(msg||"")+'</div><button class="go" id="sjGo">'+PRICE+' 결제하고 사주풀이 보기</button>'+(hasLast()?'<button class="ghost" id="sjL">🔖 지난 풀이 다시 보기</button>':"")+'<button class="ghost" id="sjX">닫기</button>';
  $("#sjG").onclick=e=>{const b=e.target.closest("button");if(!b)return;form.gender=b.dataset.v;[...$("#sjG").children].forEach(x=>x.classList.toggle("on",x===b))};
  $("#sjC").onclick=e=>{const b=e.target.closest("button");if(!b)return;form.calendar=b.dataset.v;[...$("#sjC").children].forEach(x=>x.classList.toggle("on",x===b))};
  $("#sjX").onclick=close;if($("#sjL"))$("#sjL").onclick=showLast;
  $("#sjGo").onclick=()=>{form.name=$("#sjN").value.trim();form.birthDate=$("#sjD").value;form.birthTime=$("#sjT").value;
    if(!form.name){$("#sjE").textContent="이름을 입력해 주세요.";return}if(!form.birthDate){$("#sjE").textContent="생년월일을 입력해 주세요.";return}
    startPay()}
}
function profile(){return {id:"toss-"+Date.now(),name:form.name,gender:form.gender,birthDate:form.birthDate,calendar:form.calendar,timeKnown:form.birthTime?"yes":"no",birthTime:form.birthTime||"",timeMode:"period"}}
function setBusy(t){busy=true;box.innerHTML='<h2>'+esc(t)+'</h2><p class="s">잠시만 기다려 주세요. 창을 닫지 말아 주세요.</p>'}
async function confirmOrder(tossOrderId){return api("/api/orders",{action:"toss-iap-confirm",tossOrderId,profileName:form.name||""})}
function startPay(){
  const prof=profile();try{localStorage.setItem("dalbit_saju_pending",JSON.stringify({profile:prof,t:Date.now()}))}catch(e){}
  let serverOrder=null,cleanup=null;
  try{
    cleanup=IAP.createOneTimePurchaseOrder({
      options:{sku:SKU,processProductGrant:async({orderId})=>{try{const r=await confirmOrder(orderId);serverOrder=r.orderId;try{localStorage.setItem("dalbit_saju_order",JSON.stringify({orderId:serverOrder,tossOrderId:orderId,profile:prof}))}catch(e){}return true}catch(e){return false}}},
      onEvent:async ev=>{if(ev&&ev.type==="success"){try{cleanup&&cleanup()}catch(e){};if(serverOrder)runAnalysis(prof,serverOrder);else showForm("결제는 완료됐지만 확인에 실패했어요. 잠시 후 다시 열어 주세요.")}},
      onError:err=>{try{cleanup&&cleanup()}catch(e){};const c=err&&err.code;showForm(c==="USER_CANCELED"?"":c==="UNSUPPORTED_APP_VERSION"?(err.message||"토스 앱을 최신 버전으로 업데이트해 주세요."):"결제를 완료하지 못했어요. 다시 시도해 주세요.")}
    });
  }catch(e){showForm(e&&e.code==="UNSUPPORTED_APP_VERSION"?(e.message||"토스 앱을 최신 버전으로 업데이트해 주세요."):"토스 앱에서만 결제할 수 있어요.")}
}
function pillar(l,p){const s=p&&p.stem||"?",b=p&&p.branch||"?";return '<div><small>'+l+'</small><b>'+esc(s)+'</b><b>'+esc(b)+'</b></div>'}
function luckyHtml(l){if(!l||typeof l!=="object")return"";return '<div class="tags">'+Object.entries(l).filter(([k,v])=>v&&typeof v!=="object").map(([k,v])=>'<span>'+esc(k)+' · '+esc(v)+'</span>').join("")+'</div>'}
function resultText(prof,data,bodies){const p=(data.summary&&data.summary.pillars)||{};const pl=(l,x)=>l+" "+((x&&x.stem)||"?")+((x&&x.branch)||"?");let t="[달빛암자 사주풀이] "+prof.name+"님\n"+(data.headline||"")+"\n\n"+[pl("시주",p.hour),pl("일주",p.day),pl("월주",p.month),pl("연주",p.year)].join(" · ")+"\n";(data.sections||[]).forEach((s,i)=>{t+="\n■ "+s.title+"\n"+(bodies[i]||"")+"\n"});return t+"\n- 달빛암자 · 운명론자"}
async function copyText(t){try{await Clipboard.setText(t);return true}catch(e){}try{await navigator.clipboard.writeText(t);return true}catch(e){}try{const ta=document.createElement("textarea");ta.value=t;ta.style.cssText="position:fixed;opacity:0";document.body.appendChild(ta);ta.select();document.execCommand("copy");ta.remove();return true}catch(e){return false}}
function actsHtml(){return '<div class="acts"><button data-a="cp">📋 전체 복사하기</button><button data-a="sh">📤 카톡·메일로 보내기</button></div>'}
function renderResult(prof,data,bodies,done){const p=(data.summary&&data.summary.pillars)||{};
  box.innerHTML='<h2>'+esc(prof.name)+'님의 사주풀이</h2><p class="s">'+esc(data.headline||"")+'</p>'+(done?actsHtml():'<p class="s">풀이를 쓰는 중이에요. 다 끝나면 복사·보내기 버튼이 나와요.</p>')+'<div class="pil">'+pillar("시주",p.hour)+pillar("일주",p.day)+pillar("월주",p.month)+pillar("연주",p.year)+'</div>'+luckyHtml(data.lucky)+
  (data.sections||[]).map((s,i)=>'<div class="sec"><h3>'+esc(s.title)+'</h3><div class="b" id="sjS'+i+'">'+esc(bodies[i]||"풀이를 쓰는 중이에요…")+'</div></div>').join("")+(done?actsHtml():"")+'<button class="ghost" id="sjX2">닫기</button>';
  $("#sjX2").onclick=()=>{busy=false;close()};
  if(done){const text=resultText(prof,data,bodies);box.querySelectorAll(".acts button").forEach(b=>{const orig=b.textContent;b.onclick=async()=>{if(b.dataset.a==="cp"){const ok=await copyText(text);b.textContent=ok?"✅ 복사했어요":"복사에 실패했어요"}else{try{await Share.sendMessage({message:text});return}catch(e){const ok=await copyText(text);b.textContent=ok?"✅ 복사했어요. 카톡에 붙여넣기":"공유에 실패했어요"}}setTimeout(()=>{b.textContent=orig},3000)}})}}
async function runAnalysis(prof,orderId){
  ensureRoot();busy=true;box.innerHTML='<h2>사주를 풀고 있어요</h2><p class="s">'+esc(prof.name)+'님의 사주 원국을 살펴보고 있어요. 1분 정도 걸려요.</p>';root.classList.add("on");
  try{
    const data=await api("/api/saju/analyze",{productId:"saju-analysis",profile:prof,orderId});
    const bodies=[];renderResult(prof,data,bodies,false);
    const titles=(data.sections||[]).map(s=>s.title);
    await Promise.all((data.sections||[]).map((s,i)=>api("/api/saju/section",{productId:"saju-analysis",profile:prof,context:data.context,section:s,otherTitles:titles,orderId}).then(r=>{bodies[i]=r.body||"";const el=$("#sjS"+i);if(el)el.textContent=bodies[i]}).catch(()=>{bodies[i]="이 부분은 잠시 후 다시 열어 주세요.";const el=$("#sjS"+i);if(el)el.textContent=bodies[i]})));
    try{localStorage.setItem("dalbit_saju_last",JSON.stringify({prof,data:{headline:data.headline,summary:data.summary,lucky:data.lucky,sections:(data.sections||[]).map(s=>({id:s.id,title:s.title}))},bodies,t:Date.now()}))}catch(e){}
    renderResult(prof,data,bodies,true);
  }catch(e){showForm("풀이를 불러오지 못했어요: "+(e.message||""))}
  busy=false;
}
function showLast(){try{const l=JSON.parse(localStorage.getItem("dalbit_saju_last")||"null");if(!l)return false;ensureRoot();root.classList.add("on");renderResult(l.prof,l.data,l.bodies||[],true);return true}catch(e){return false}}
function hasLast(){try{return !!localStorage.getItem("dalbit_saju_last")}catch(e){return false}}
async function recover(){try{const o=JSON.parse(localStorage.getItem("dalbit_saju_order")||"null");if(IAP.getPendingOrders&&IAP.getPendingOrders.isSupported&&IAP.getPendingOrders.isSupported()){const r=await IAP.getPendingOrders();for(const po of (r&&r.orders)||[]){if(po.sku!==SKU)continue;try{const c=await confirmOrder(po.orderId);await IAP.completeProductGrant({params:{orderId:po.orderId}});const pend=JSON.parse(localStorage.getItem("dalbit_saju_pending")||"null");if(pend&&pend.profile){form={...form,name:pend.profile.name,gender:pend.profile.gender,birthDate:pend.profile.birthDate,calendar:pend.profile.calendar};runAnalysis(pend.profile,c.orderId)}return}catch(e){}}}}catch(e){}}
function openSaju(){ensureRoot();busy=false;showForm("");root.classList.add("on");recover()}
window.openSaju=openSaju;
window.__TEA_CTA__=[["🔮 사주풀이 신청하기",openSaju]];
