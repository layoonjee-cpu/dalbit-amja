/* 달빛암자 토스 미니앱용 보정: 외부 이동·후원·설치 유도 숨김 */
(function(){
  window.__TOSS__=true;
  var HIDE=['공양미','기와장','홈 화면에 추가','카톡','친구 초대','Add offering','Roof tile'];
  function sweep(root){
    try{
      (root||document).querySelectorAll('button,a,.btn').forEach(function(el){
        var t=(el.textContent||'').trim();
        if(el.tagName==='A'&&/^https?:/.test(el.getAttribute('href')||''))el.style.display='none';
        for(var i=0;i<HIDE.length;i++){if(t.indexOf(HIDE[i])>-1&&t.length<40){el.style.display='none';break}}
      });
    }catch(e){}
  }
  window.open=function(){return null};
  new MutationObserver(function(){sweep()}).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',function(){sweep()});
  setInterval(sweep,1500);
})();
