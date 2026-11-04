/* 달빛암자 토스 미니앱용 보정: 외부 이동·후원·설치 유도 숨김 */
(function(){
  window.__TOSS__=true;
  window.__TEA_CTA__=[];
  var HIDE=['공양미','기와','홈 화면에 추가','카톡','친구 초대','다른 힐링 공간','운신상담소 바로가기','Add offering','Roof tile'];
  var css='#riceTop,#mDonate,#mTile,[data-toss-hidden="1"]{display:none!important}';
  function style(){if(document.getElementById('toss-policy-style'))return;var s=document.createElement('style');s.id='toss-policy-style';s.textContent=css;(document.head||document.documentElement).appendChild(s)}
  function hide(el){if(el.getAttribute('data-toss-hidden')!=='1')el.setAttribute('data-toss-hidden','1')}
  function sweep(root){
    try{
      style();
      (root||document).querySelectorAll('button,a,.btn').forEach(function(el){
        var t=(el.textContent||'').trim(),a=el.getAttribute('aria-label')||'',title=el.getAttribute('title')||'';
        var h=el.getAttribute('href')||'';
        if(el.tagName==='A'&&(/^(https?:|//)/i.test(h)||/(^|\/)(landing|donate|about)\.html(?:[?#]|$)/i.test(h))){hide(el);return}
        for(var i=0;i<HIDE.length;i++){if((t.indexOf(HIDE[i])>-1&&t.length<70)||a.indexOf(HIDE[i])>-1||title.indexOf(HIDE[i])>-1){hide(el);break}}
      });
    }catch(e){}
  }
  window.open=function(){return null};
  new MutationObserver(function(){sweep()}).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',function(){sweep()});
  setInterval(sweep,1500);
  sweep();
})();
