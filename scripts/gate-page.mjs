// Passcode lock screen shown on the phone before a transfer, when a passcode is set.
// On success the server answers with the URL to continue to (download, app link or upload page).

import { FAVICON, MOTION_CSS } from "./brand.mjs";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const LOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/><circle cx="12" cy="16" r="1.2" fill="currentColor"/></svg>`;

export function renderGatePage({ computer, base, numeric, what }) {
	return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>Passcode · ${esc(computer)}</title>
${FAVICON}
<style>
:root{--bg:#f1f6fb;--fg:#0f172a;--muted:#64748b;--card:#fff;--line:#e2e8f0;--accent:#2563eb;--accent2:#06b6d4;--soft:#e0f2fe;--ok:#10b981;--oksoft:#d1fae5;--err:#dc2626;--errsoft:#fee2e2;--on-accent:#fff;--shadow:0 1px 2px #0f172a0d,0 8px 24px #0f172a12}
@media (prefers-color-scheme:dark){:root{--bg:#0b1220;--fg:#e8eef8;--muted:#94a3b8;--card:#131c2e;--line:#1e293b;--accent:#60a5fa;--accent2:#22d3ee;--soft:#132a46;--ok:#34d399;--oksoft:#0f2e25;--err:#f87171;--errsoft:#3a1616;--on-accent:#0b1220;--shadow:0 1px 2px #0006,0 8px 24px #0005}}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;min-height:100%;background:var(--bg);color:var(--fg);font:16px/1.45 -apple-system,system-ui,"Segoe UI",Roboto,sans-serif}
main{max-width:420px;margin:0 auto;padding:max(12vh,env(safe-area-inset-top)) 20px 40px;text-align:center}
.lock{width:76px;height:76px;margin:0 auto 18px;border-radius:24px;padding:18px;color:#fff;background:linear-gradient(135deg,var(--accent),var(--accent2));box-shadow:0 10px 28px #2563eb4d}
svg{width:100%;height:100%;display:block}
h1{font-size:24px;margin:0 0 6px}p{margin:0 0 26px;color:var(--muted)}
form{background:var(--card);border-radius:22px;padding:22px;box-shadow:var(--shadow)}
input{width:100%;font:inherit;font-size:30px;font-weight:600;letter-spacing:.35em;text-align:center;padding:14px 10px 14px calc(10px + .35em);border-radius:14px;border:2px solid var(--line);background:var(--bg);color:var(--fg);outline:none}
input:focus{border-color:var(--accent)}
input.bad{border-color:var(--err);animation:shake .35s}
@keyframes shake{25%{transform:translateX(-8px)}50%{transform:translateX(7px)}75%{transform:translateX(-4px)}}
button{display:block;width:100%;margin-top:14px;font:inherit;font-size:17px;font-weight:600;border:0;border-radius:14px;padding:15px;cursor:pointer;color:var(--on-accent);background:linear-gradient(135deg,var(--accent),var(--accent2))}
button:disabled{opacity:.6}
.msg{min-height:22px;margin-top:12px;font-size:14px;color:var(--err)}
.foot{margin-top:22px;font-size:13px;color:var(--muted)}
${MOTION_CSS}
.lock{animation:pd-rise .5s cubic-bezier(.2,.8,.2,1) both}
h1,main>p{animation:pd-fade .5s .1s both}
form{animation:pd-rise .5s .15s cubic-bezier(.2,.8,.2,1) both;transition:box-shadow .3s}
form.ok{box-shadow:0 0 0 3px #10b98155,var(--shadow)}form.ok input{border-color:#10b981}
.foot{animation:pd-fade .6s .4s both}
</style></head><body><main>
<div class="lock">${LOCK}</div>
<h1>Enter passcode</h1>
<p>${esc(computer)} asked for a passcode before ${esc(what)}.</p>
<form id="f" autocomplete="off">
<input id="c" ${numeric ? 'inputmode="numeric" pattern="[0-9]*"' : ""} autocomplete="one-time-code" autofocus aria-label="Passcode">
<button id="b">Unlock</button>
<div class="msg" id="m"></div>
</form>
<div class="foot">The code is shown where the transfer was started, e.g. in Claude.</div>
</main>
<script>
const f=document.getElementById("f"),c=document.getElementById("c"),b=document.getElementById("b"),m=document.getElementById("m");
f.onsubmit=async e=>{e.preventDefault();if(!c.value.trim())return;b.disabled=true;m.textContent="";
  try{const r=await fetch(${JSON.stringify(base)}+"unlock",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:c.value.trim()})});
    const j=await r.json().catch(()=>({}));
    if(r.ok&&j.next){b.textContent="Unlocked ✓";f.classList.add("ok");setTimeout(()=>location.href=j.next,350);return;}
    c.classList.remove("bad");void c.offsetWidth;c.classList.add("bad");c.value="";
    m.textContent=j.error||"Wrong passcode";
  }catch{m.textContent="Can't reach the computer. Is the transfer still running?";}
  b.disabled=false;c.focus();};
</script></body></html>`;
}
