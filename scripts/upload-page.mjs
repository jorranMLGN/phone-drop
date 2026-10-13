// The page the phone opens in receive mode: pick files and upload them to the computer.
// Files go up one at a time as raw PUT bodies (no multipart parsing needed on the server),
// using XHR for per-file progress.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function renderUploadPage({ computer, base }) {
	return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Send to ${esc(computer)}</title>
<style>
:root{--bg:#f6f6f8;--fg:#1c1c1e;--muted:#6b6b70;--card:#fff;--accent:#5a64e8;--ok:#2f9e5b;--err:#d64545;--track:#e6e6ec}
@media (prefers-color-scheme:dark){:root{--bg:#111113;--fg:#f2f2f5;--muted:#9a9aa2;--card:#1c1c20;--accent:#9aa2ff;--ok:#4cc27e;--err:#ff6b6b;--track:#2c2c32}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;padding:24px 16px calc(24px + env(safe-area-inset-bottom))}
main{max-width:480px;margin:0 auto}
h1{font-size:24px;margin:8px 0 2px}.sub{color:var(--muted);margin:0 0 20px}
.pick{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:var(--card);border:2px dashed var(--accent);border-radius:18px;padding:32px 16px;text-align:center;cursor:pointer}
.pick b{color:var(--accent);font-size:19px}.pick span{color:var(--muted);font-size:14px}
input[type=file]{display:none}
ul{list-style:none;padding:0;margin:16px 0}
li{background:var(--card);border-radius:14px;padding:12px 14px;margin:8px 0}
.row{display:flex;justify-content:space-between;gap:12px;font-size:15px}
.name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.state{color:var(--muted);flex:none}
.bar{height:6px;background:var(--track);border-radius:3px;margin-top:8px;overflow:hidden}.bar i{display:block;height:100%;width:0;background:var(--accent);transition:width .15s}
li.ok .bar i{background:var(--ok)}li.ok .state{color:var(--ok)}li.err .state{color:var(--err)}
button{width:100%;font:inherit;font-weight:600;border:0;border-radius:14px;padding:15px;margin-top:8px;cursor:pointer}
.primary{background:var(--accent);color:#fff}.primary:disabled{opacity:.4}
.secondary{background:transparent;color:var(--muted)}
.done{text-align:center;padding:40px 0}.done b{font-size:22px;display:block;margin-bottom:6px}
</style></head><body><main>
<h1>Send to ${esc(computer)}</h1>
<p class="sub">Files go straight to the computer over your Wi-Fi.</p>
<div id="ui">
<label class="pick" for="f"><b>Choose photos or files</b><span>Tap to pick. You can select several.</span></label>
<input id="f" type="file" multiple>
<ul id="list"></ul>
<button id="go" class="primary" disabled>Upload</button>
<button id="fin" class="secondary">Done</button>
</div>
<div id="bye" class="done" hidden><b>All done ✓</b><span class="sub">You can close this page.</span></div>
</main>
<script>
const base=${JSON.stringify(base)};
const f=document.getElementById("f"),list=document.getElementById("list"),go=document.getElementById("go");
let queue=[];
const fmt=n=>n<1048576?(n/1024).toFixed(0)+" KB":(n/1048576).toFixed(1)+" MB";
f.onchange=()=>{for(const file of f.files){const li=document.createElement("li");li.innerHTML='<div class="row"><span class="name"></span><span class="state"></span></div><div class="bar"><i></i></div>';li.querySelector(".name").textContent=file.name;li.querySelector(".state").textContent=fmt(file.size);list.appendChild(li);queue.push({file,li});}f.value="";go.disabled=!queue.length;go.textContent=queue.length>1?"Upload "+queue.length+" files":"Upload";};
function put(item){return new Promise(res=>{const x=new XMLHttpRequest(),bar=item.li.querySelector("i"),st=item.li.querySelector(".state");x.open("PUT",base+"upload?name="+encodeURIComponent(item.file.name));x.upload.onprogress=e=>{if(e.lengthComputable){bar.style.width=(100*e.loaded/e.total)+"%";st.textContent=Math.floor(100*e.loaded/e.total)+"%";}};x.onload=()=>{const ok=x.status===200;item.li.className=ok?"ok":"err";bar.style.width="100%";st.textContent=ok?"Sent ✓":"Failed";res(ok);};x.onerror=()=>{item.li.className="err";st.textContent="Failed";res(false);};x.send(item.file);});}
go.onclick=async()=>{go.disabled=true;const batch=queue;queue=[];for(const item of batch)await put(item);go.textContent="Upload";};
document.getElementById("fin").onclick=async()=>{try{await fetch(base+"done",{method:"POST"});}catch{}document.getElementById("ui").hidden=true;document.getElementById("bye").hidden=false;};
</script></body></html>`;
}
