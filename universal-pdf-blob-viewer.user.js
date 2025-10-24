// ==UserScript==
// @name         Universal PDF Blob Viewer Orion Safe
// @namespace    com.github.universal.pdf.blob.viewer
// @version      3.3.1
// @description  Ouvre uniquement les PDF dans un onglet enfant sans guillemet
// @match        *://*/*
// @exclude      https://docs.google.com/*
// @exclude      https://drive.google.com/*
// @exclude      https://github.com/*
// @exclude      https://gitlab.com/*
// @exclude      https://mail.google.com/*
// @exclude      https://outlook.live.com/*
// @exclude      https://web.whatsapp.com/*
// @exclude      https://*.zoom.us/*
// @run-at       document-start
// @inject-into  page
// @grant        none
// @noframes
// ==/UserScript==

(function(){
  try{
    if(!window.webkit) window.webkit={};
    if(!window.webkit.messageHandlers) window.webkit.messageHandlers={};
    if(!window.webkit.messageHandlers.kagiEvents){
      window.webkit.messageHandlers.kagiEvents={
        postMessage:function(){return undefined;}
      };
    }
    if(!window.kagi) window.kagi={};
    if(!window.kagi.registerContentScript){
      window.kagi.registerContentScript=function(){return undefined;};
    }
    if(!window.kagi.injectInlineStylesheet){
      window.kagi.injectInlineStylesheet=function(){return undefined;};
    }
  }catch(e){}

  function S(a){var r=[],i=0;for(i=0;i<a.length;i++)r.push(String.fromCharCode(a[i]));return r.join([]+[]);}

  var NAME=S([80,68,70,95,66,76,79,66,95,86,73,69,87,69,82,95,84,65,66]);
  var ABLK=S([97,98,111,117,116,58,98,108,97,110,107]);
  var EVCL=S([99,108,105,99,107]);
  var SELA=S([97]);
  var PRHV=S([104,114,101,102]);
  var BLOB=S([98,108,111,98,58]);
  var DATA=S([100,97,116,97,58,97,112,112,108,105,99,97,116,105,111,110,47,112,100,102]);
  var RXPDF=new RegExp(S([92,46,112,100,102,40,63,58,91,63,35,93,124,36,41]),S([105]));
  var RXCTP=new RegExp(S([97,112,112,108,105,99,97,116,105,111,110,47,40,112,100,102,124,120,45,112,100,102,124,97,99,114,111,98,97,116,41]),S([105]));
  var HDRCL=S([99,111,110,116,101,110,116,45,108,101,110,103,116,104]);
  var HDRCT=S([99,111,110,116,101,110,116,45,116,121,112,101]);
  var MAXB=104857600;
  var BADQ=[34,39,60,62];

  var child=null;
  var origOpen=window.open?window.open.bind(window):function(){return null;};

  function openChildSync(){
    try{
      var w=origOpen(ABLK,NAME);
      if(w){try{w.opener=null;}catch(e){}}
      return w||null;
    }catch(e){return null;}
  }

  function isPdfHref(h){
    if(!h||typeof h!==typeof S([0])) return false;
    if(h.slice(0,BLOB.length)===BLOB) return true;
    if(h.slice(0,DATA.length)===DATA) return true;
    return RXPDF.test(h);
  }

  function isPdfType(t){
    return !!t&&RXCTP.test(t);
  }

  function looksPdfBytes(buf){
    try{
      var a=new Uint8Array(buf);
      return a.length>=5&&a[0]===37&&a[1]===80&&a[2]===68&&a[3]===70&&a[4]===45;
    }catch(e){return false;}
  }

  function sanitizeSource(src){
    if(!src||typeof src!==typeof S([0])) return null;
    for(var i=0;i<BADQ.length;i++){if(src.indexOf(String.fromCharCode(BADQ[i]))>=0) return null;}
    return src;
  }

  function createViewer(win,src,label){
    if(!win||win.closed) return null;
    var doc=win.document;
    try{doc.open();doc.write(S([]));doc.close();}catch(e){}
    try{
      var html=doc.createElement(S([104,116,109,108]));
      doc.appendChild(html);
      var head=doc.createElement(S([104,101,97,100]));
      var body=doc.createElement(S([98,111,100,121]));
      html.appendChild(head);
      html.appendChild(body);
      var meta=doc.createElement(S([109,101,116,97]));
      meta.setAttribute(S([99,104,97,114,115,101,116]),S([117,116,102,45,56]));
      head.appendChild(meta);
      var meta2=doc.createElement(S([109,101,116,97]));
      meta2.setAttribute(S([110,97,109,101]),S([118,105,101,119,112,111,114,116]));
      meta2.setAttribute(S([99,111,110,116,101,110,116]),S([119,105,100,116,104,61,100,101,118,105,99,101,45,119,105,100,116,104,44,105,110,105,116,105,97,108,45,115,99,97,108,101,61,49]));
      head.appendChild(meta2);
      var title=doc.createElement(S([116,105,116,108,101]));
      title.appendChild(doc.createTextNode(label||S([80,68,70])));
      head.appendChild(title);
      body.style.margin=S([48]);
      body.style.padding=S([48]);
      body.style.width=S([49,48,48,37]);
      body.style.height=S([49,48,48,37]);
      body.style.overflow=S([104,105,100,100,101,110]);
      var frame=doc.createElement(S([105,102,114,97,109,101]));
      frame.setAttribute(S([115,114,99]),src);
      frame.style.position=S([102,105,120,101,100]);
      frame.style.inset=S([48]);
      frame.style.border=S([48]);
      frame.style.width=S([49,48,48,37]);
      frame.style.height=S([49,48,48,37]);
      frame.style.display=S([98,108,111,99,107]);
      body.appendChild(frame);
      var fallback=doc.createElement(S([100,105,118]));
      fallback.style.position=S([102,105,120,101,100]);
      fallback.style.inset=S([48]);
      fallback.style.display=S([110,111,110,101]);
      fallback.style.alignItems=S([99,101,110,116,101,114]);
      fallback.style.justifyContent=S([99,101,110,116,101,114]);
      fallback.style.background=S([35,50,49,50,49,50,49,50,69,70]);
      fallback.style.color=S([35,48,48,48,48,48]);
      fallback.style.fontFamily=S([45,97,112,112,108,101,45,115,121,115,116,101,109,44,115,101,103,111,101,32,117,73,44,115,97,110,115,45,115,101,114,105,102]);
      fallback.style.fontSize=S([49,54,112,120]);
      fallback.style.textAlign=S([99,101,110,116,101,114]);
      var fbBox=doc.createElement(S([100,105,118]));
      fbBox.style.maxWidth=S([52,48,48]);
      fbBox.style.padding=S([50,52]);
      fbBox.style.background=S([35,70,70,70,70,70,70]);
      fbBox.style.borderRadius=S([49,50]);
      fbBox.style.boxShadow=S([48,32,52,112,120,32,56,112,120,32,45,55,112,120,32,114,103,98,97,40,48,44,48,44,48,44,48,46,51,41]);
      var fbMsg=doc.createElement(S([112]));
      fbMsg.style.marginBottom=S([50]);
      fbMsg.appendChild(doc.createTextNode(S([76,101,32,118,105,115,117,97,108,105,115,97,116,105,111,110,32,100,117,32,80,68,70,32,101,115,116,32,98,108,111,113,117,195,169,101,46])));
      var fbLink=doc.createElement(S([97]));
      fbLink.setAttribute(PRHV,src);
      fbLink.style.display=S([105,110,108,105,110,101,45,98,108,111,99,107]);
      fbLink.style.padding=S([49,50,32,50,52]);
      fbLink.style.background=S([35,48,48,55,50,70,70]);
      fbLink.style.color=S([35,70,70,70,70,70,70]);
      fbLink.style.textDecoration=S([110,111,110,101]);
      fbLink.style.borderRadius=S([56]);
      fbLink.style.fontWeight=S([53,48,48]);
      fbLink.appendChild(doc.createTextNode(S([79,117,118,114,105,114,32,108,101,32,80,68,70])));
      fbBox.appendChild(fbMsg);
      fbBox.appendChild(fbLink);
      fallback.appendChild(fbBox);
      body.appendChild(fallback);
      return {iframe:frame,fallback:fallback};
    }catch(e){return null;}
  }

  function showFallback(view,win,url){
    if(!view||!win) return;
    try{view.fallback.style.display=S([102,108,101,120]);}catch(e){}
    try{win.location.href=url;}catch(e){}
  }

  async function resolveBlob(url){
    try{
      var controller=null;
      var signal=null;
      if(typeof AbortController!==typeof undefined){controller=new AbortController();signal=controller.signal;}
      var response=await fetch(url,{cache:S([110,111,45,115,116,111,114,101]),credentials:S([115,97,109,101,45,111,114,105,103,105,110]),signal:signal});
      if(!response||!response.ok) return null;
      try{
        var len=response.headers.get(HDRCL);
        if(len){var size=parseInt(len,10);if(size>MAXB){if(controller)controller.abort();return null;}}
      }catch(e){}
      var blob=await response.blob();
      if(blob.size>MAXB) return null;
      if(isPdfType(blob.type)) return blob;
      if((!blob.type||blob.type===S([97,112,112,108,105,99,97,116,105,111,110,47,111,99,116,101,116,45,115,116,114,101,97,109]))&&blob.size>=5){
        var head=await blob.slice(0,5).arrayBuffer();
        if(looksPdfBytes(head)) return blob;
      }
      return null;
    }catch(e){return null;}
  }

  function monitorFrame(view,win,original){
    if(!view||!view.iframe) return;
    var done=false;
    function mark(){done=true;}
    try{view.iframe.addEventListener(S([108,111,97,100]),mark,{once:true});}catch(e){}
    setTimeout(function(){
      if(done) return;
      try{
        var doc=view.iframe.contentDocument;
        if(!doc||!doc.body){showFallback(view,win,original);return;}
        if(doc.body.childNodes.length===0){showFallback(view,win,original);return;}
      }catch(err){showFallback(view,win,original);}
    },1200);
  }

  async function renderPdfInChild(url,filename,win){
    var safe=sanitizeSource(url);
    var label=filename&&typeof filename===typeof S([0])?filename:S([80,68,70]);
    if(!win) return;
    if(!safe){showFallback(null,win,url);return;}
    if(url.slice(0,BLOB.length)===BLOB){
      var blob=await resolveBlob(url);
      if(!blob){showFallback(null,win,url);return;}
      var blobUrl=null;
      try{blobUrl=URL.createObjectURL(blob);}catch(e){}
      var src=sanitizeSource(blobUrl||url);
      if(!src){showFallback(null,win,url);return;}
      var view=createViewer(win,src,label);
      if(!view){showFallback(null,win,url);return;}
      monitorFrame(view,win,url);
      if(blobUrl) setTimeout(function(){try{URL.revokeObjectURL(blobUrl);}catch(e){}},5000);
      return;
    }
    var view=createViewer(win,safe,label);
    if(!view){showFallback(null,win,url);return;}
    monitorFrame(view,win,url);
  }

  function onClick(event){
    var t=event.target;
    if(!t||!t.closest) return;
    var link=t.closest(SELA);
    if(!link||!link[PRHV]) return;
    var h=link[PRHV];
    if(!isPdfHref(h)&&!isPdfType(link.type||S([]))) return;
    var w=child&&!child.closed?child:openChildSync();
    if(!w) return;
    event.preventDefault();
    event.stopPropagation();
    child=w;
    renderPdfInChild(h,link.download||link.textContent||S([80,68,70]),w);
  }

  if(!window.__pdfOpenPatched){
    window.__pdfOpenPatched=true;
    window.open=function(u,t,f){
      try{
        if(typeof u===typeof S([0])&&(u.slice(0,BLOB.length)===BLOB||u.slice(0,DATA.length)===DATA||RXPDF.test(u))){
          var w=child&&!child.closed?child:openChildSync();
          if(!w) return origOpen(u,S([95,98,108,97,110,107]));
          child=w;
          renderPdfInChild(u,S([]),w);
          return w;
        }
      }catch(e){}
      return origOpen(u,t,f);
    };
  }

  document.addEventListener(EVCL,onClick,{capture:true});
  window.addEventListener(S([98,101,102,111,114,101,117,110,108,111,97,100]),function(){child=null;});
})();
