// The page the phone opens in receive mode: pick files and they upload to the computer right away.
// Files go up one at a time as raw PUT bodies (no multipart parsing needed on the server),
// using XHR for per-file progress.

import { FAVICON } from "./brand.mjs";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const ICON = {
	logo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M12 7v7m-3-3 3 3 3-3"/></svg>`,
	laptop: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2 19h20"/></svg>`,
	lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
	wifi: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r=".8" fill="currentColor"/></svg>`,
	upload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4m-4.5 4.5L12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>`,
	file: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>`,
	video: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/></svg>`,
	check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>`,
};

export function renderUploadPage({ computer, base, secure, key = "" }) {
	return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>Send to ${esc(computer)}</title>
${FAVICON}
<style>
:root{--bg:#f3f3f7;--fg:#16161a;--muted:#6c6c74;--card:#fff;--line:#e7e7ee;--accent:#5a64e8;--accent2:#8b5cf6;--soft:#eef0ff;--ok:#22a05b;--oksoft:#e3f6ea;--err:#d64545;--errsoft:#fde8e8;--shadow:0 1px 2px #0000000d,0 8px 24px #0000000f}
@media (prefers-color-scheme:dark){:root{--bg:#0e0e12;--fg:#f2f2f6;--muted:#9a9aa6;--card:#1a1a20;--line:#2a2a33;--accent:#8f97ff;--accent2:#b18cff;--soft:#23253d;--ok:#4cc27e;--oksoft:#16301f;--err:#ff7070;--errsoft:#3a1a1a;--shadow:0 1px 2px #0006,0 8px 24px #0004}}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.45 -apple-system,system-ui,"Segoe UI",Roboto,sans-serif}
main{max-width:480px;margin:0 auto;padding:max(20px,env(safe-area-inset-top)) 16px calc(120px + env(safe-area-inset-bottom))}
svg{width:100%;height:100%;display:block}
header{display:flex;align-items:center;gap:12px;margin:4px 0 22px}
.logo{width:44px;height:44px;border-radius:13px;padding:10px;color:#fff;background:linear-gradient(135deg,var(--accent),var(--accent2));box-shadow:0 6px 16px #5a64e840;flex:none}
.brand{font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
h1{font-size:22px;line-height:1.2;margin:1px 0 0;display:flex;align-items:center;gap:7px;min-width:0}
h1 .ic{width:22px;height:22px;color:var(--accent);flex:none}
h1 span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.badge{margin-left:auto;display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:600;padding:6px 10px;border-radius:999px;flex:none}
.badge i{width:14px;height:14px}
.badge.secure{color:var(--ok);background:var(--oksoft)}.badge.plain{color:var(--muted);background:var(--card);border:1px solid var(--line)}
.pick{position:relative;display:block;border-radius:22px;padding:30px 20px 26px;text-align:center;cursor:pointer;background:var(--card);box-shadow:var(--shadow);overflow:hidden}
.pick::before{content:"";position:absolute;inset:0;border-radius:22px;padding:2px;background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;opacity:.55}
.pick:active{transform:scale(.985)}
.pick .ic{width:58px;height:58px;margin:0 auto 12px;padding:14px;border-radius:50%;color:var(--accent);background:var(--soft)}
.pick b{display:block;font-size:19px}.pick small{display:block;color:var(--muted);font-size:14.5px;margin-top:3px}
input[type=file]{display:none}
.summary{display:none;margin:22px 2px 10px;font-size:14px;color:var(--muted);justify-content:space-between}
.summary.on{display:flex}.summary b{color:var(--fg);font-weight:600}
.total{height:4px;border-radius:2px;background:var(--line);overflow:hidden;margin:0 2px 8px;display:none}.total.on{display:block}
.total i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--accent),var(--accent2));transition:width .2s}
ul{list-style:none;padding:0;margin:0}
li{display:flex;align-items:center;gap:12px;background:var(--card);border-radius:16px;padding:10px 12px;margin:8px 0;box-shadow:var(--shadow);animation:in .25s ease-out}
@keyframes in{from{opacity:0;transform:translateY(6px)}}
.thumb{width:46px;height:46px;border-radius:11px;flex:none;background:var(--soft) center/cover no-repeat;color:var(--accent);padding:11px}
.meta{flex:1;min-width:0}
.name{font-size:15px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sub{font-size:13px;color:var(--muted);margin-top:1px}
.bar{height:4px;border-radius:2px;background:var(--line);margin-top:7px;overflow:hidden}.bar i{display:block;height:100%;width:0;background:var(--accent);transition:width .15s}
.st{width:28px;height:28px;flex:none;border-radius:50%;display:grid;place-items:center}
.st .ring{width:22px;height:22px;border-radius:50%;border:2.5px solid var(--line);border-top-color:var(--accent);animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
li.wait .st .ring{animation:none;border-top-color:var(--line)}
li.ok .st{background:var(--ok);color:#fff;padding:6px}li.ok .bar{display:none}
li.err .st{background:var(--errsoft);color:var(--err);font-weight:700;font-size:15px}li.err .bar{display:none}
li.err .sub{color:var(--err)}
li.err button.retry{all:unset;color:var(--accent);font-weight:600;font-size:13px;margin-left:6px;cursor:pointer}
.dock{position:fixed;left:0;right:0;bottom:0;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:linear-gradient(to top,var(--bg) 70%,transparent)}
.dock div{max-width:480px;margin:0 auto}
.btn{display:block;width:100%;font:inherit;font-size:17px;font-weight:600;border:0;border-radius:16px;padding:16px;cursor:pointer;color:#fff;background:linear-gradient(135deg,var(--accent),var(--accent2));box-shadow:0 8px 20px #5a64e83d}
.btn:disabled{opacity:.7;box-shadow:none}
.btn.ghost{background:transparent;color:var(--muted);box-shadow:none;font-weight:500;padding:12px}
.alert{display:none;margin:14px 2px;padding:12px 14px;border-radius:14px;background:var(--errsoft);color:var(--err);font-size:14px}.alert.on{display:block}
.finish{display:none;text-align:center;padding:12vh 8px 0}
.finish .ok{width:84px;height:84px;margin:0 auto 18px;border-radius:50%;padding:20px;color:#fff;background:var(--ok);box-shadow:0 10px 28px #22a05b4d;animation:pop .45s cubic-bezier(.2,1.6,.4,1)}
@keyframes pop{from{transform:scale(.3);opacity:0}}
.finish h2{margin:0 0 6px;font-size:24px}.finish p{margin:0;color:var(--muted)}
body.done main>*:not(.finish),body.done .dock{display:none}body.done .finish{display:block}
</style></head><body><main>
<header>
<div class="logo">${ICON.logo}</div>
<div style="min-width:0"><div class="brand">Phone Drop</div><h1><i class="ic">${ICON.laptop}</i><span>${esc(computer)}</span></h1></div>
${secure ? `<span class="badge secure"><i>${ICON.lock}</i>Encrypted</span>` : `<span class="badge plain"><i>${ICON.wifi}</i>Local Wi-Fi</span>`}
</header>
<label class="pick" for="f"><div class="ic">${ICON.upload}</div><b>Choose photos or files</b><small>They upload straight away. Pick as many as you like.</small></label>
<input id="f" type="file" multiple>
<div class="alert" id="alert">Lost the connection to the computer. Ask Claude to start receiving again, then reload this page.</div>
<div class="summary" id="summary"><span id="count"></span><b id="pct"></b></div>
<div class="total" id="total"><i></i></div>
<ul id="list"></ul>
<div class="finish"><div class="ok">${ICON.check}</div><h2>All done</h2><p id="final"></p></div>
</main>
<div class="dock"><div><button class="btn" id="fin">Done</button></div></div>
<script>
const base=${JSON.stringify(base)},computer=${JSON.stringify(computer)},key=${JSON.stringify(key)};
const $=id=>document.getElementById(id),list=$("list"),fin=$("fin");
const IC={file:${JSON.stringify(ICON.file)},video:${JSON.stringify(ICON.video)},check:${JSON.stringify(ICON.check)}};
const items=[];let busy=false;
const fmt=n=>n<1024?n+" B":n<1048576?(n/1024).toFixed(0)+" KB":n<1073741824?(n/1048576).toFixed(1)+" MB":(n/1073741824).toFixed(2)+" GB";
function add(file){
  const li=document.createElement("li");li.className="wait";
  li.innerHTML='<div class="thumb"></div><div class="meta"><div class="name"></div><div class="sub"></div><div class="bar"><i></i></div></div><div class="st"><div class="ring"></div></div>';
  const th=li.querySelector(".thumb");
  if(file.type.startsWith("image/")){const u=URL.createObjectURL(file);const img=new Image();img.onload=()=>{th.style.backgroundImage="url("+u+")";th.style.padding="0"};img.onerror=()=>th.innerHTML=IC.file;img.src=u;}
  else th.innerHTML=file.type.startsWith("video/")?IC.video:IC.file;
  li.querySelector(".name").textContent=file.name;li.querySelector(".sub").textContent=fmt(file.size)+" · waiting";
  list.appendChild(li);const it={file,li,sent:0,state:"wait"};items.push(it);return it;
}
function refresh(){
  const total=items.reduce((a,i)=>a+i.file.size,0),sent=items.reduce((a,i)=>a+(i.state==="ok"?i.file.size:i.sent),0);
  const ok=items.filter(i=>i.state==="ok").length;
  $("summary").classList.add("on");$("total").classList.add("on");
  $("count").textContent=ok+" of "+items.length+" sent · "+fmt(total);
  const p=total?Math.floor(100*sent/total):100;$("pct").textContent=p+"%";$("total").firstElementChild.style.width=p+"%";
  fin.disabled=busy;fin.textContent=busy?"Uploading…":"Done";
}
function put(it){return new Promise(res=>{
  const x=new XMLHttpRequest(),li=it.li,bar=li.querySelector(".bar i"),sub=li.querySelector(".sub");
  li.className="";it.state="up";it.sent=0;sub.textContent=fmt(it.file.size)+" · starting";
  li.querySelector(".st").innerHTML='<div class="ring"></div>';
  x.open("PUT",base+"upload?name="+encodeURIComponent(it.file.name));if(key)x.setRequestHeader("X-Phone-Drop-Key",key);
  x.upload.onprogress=e=>{if(e.lengthComputable){it.sent=e.loaded;const p=Math.floor(100*e.loaded/e.total);bar.style.width=p+"%";sub.textContent=fmt(e.loaded)+" of "+fmt(e.total);refresh();}};
  const fail=lost=>{it.state="err";li.className="err";li.querySelector(".st").textContent="!";sub.innerHTML='Failed<button class="retry">Retry</button>';sub.querySelector("button").onclick=()=>{li.className="wait";it.state="wait";pump();};if(lost)$("alert").classList.add("on");refresh();res();};
  x.onload=()=>{if(x.status!==200)return fail(false);let saved=it.file.name;try{saved=JSON.parse(x.responseText).saved}catch{}it.state="ok";li.className="ok";li.querySelector(".st").innerHTML=IC.check;sub.textContent=fmt(it.file.size)+(saved!==it.file.name?" · saved as "+saved:" · sent");refresh();res();};
  x.onerror=()=>fail(true);x.send(it.file);
});}
async function pump(){if(busy)return;busy=true;refresh();let it;while((it=items.find(i=>i.state==="wait")))await put(it);busy=false;refresh();}
$("f").onchange=e=>{for(const file of e.target.files)add(file);e.target.value="";refresh();pump();};
fin.onclick=async()=>{try{await fetch(base+"done",{method:"POST",headers:key?{"X-Phone-Drop-Key":key}:{}})}catch{}const ok=items.filter(i=>i.state==="ok");$("final").textContent=ok.length+" file"+(ok.length===1?"":"s")+" · "+fmt(ok.reduce((a,i)=>a+i.file.size,0))+" sent to "+computer+". You can close this page.";document.body.classList.add("done");};
</script></body></html>`;
}
