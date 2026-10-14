// Renders the QR page that the computer shows for the phone to scan.
import QRCode from "qrcode";
import { CREDITS, CREDITS_CSS, FAVICON, MOTION_CSS } from "./brand.mjs";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/**
 * @param {{ title: string, link: string, steps: string[], fileName?: string }} page
 *   `steps` may contain trusted inline HTML (<b>); everything else is escaped.
 */
export async function renderQrPage({ title, link, steps, fileName, passcode, controlBase, demo }) {
	const svg = await QRCode.toString(link, { type: "svg", errorCorrectionLevel: "M", margin: 2 });
	return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
${FAVICON}
<style>
:root{--bg:#f6f6f8;--fg:#1c1c1e;--muted:#6b6b70;--card:#fff;--accent:#5a64e8}
@media (prefers-color-scheme:dark){:root{--bg:#111113;--fg:#f2f2f5;--muted:#9a9aa2;--card:#1c1c20;--accent:#9aa2ff}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;display:grid;place-items:center;min-height:100vh;padding-bottom:40px;box-sizing:border-box}
${CREDITS_CSS}
${MOTION_CSS}
main{animation:pd-rise .6s cubic-bezier(.2,.8,.2,1) both}
.qr{animation:pd-ring 2.8s ease-out 1s infinite}
@keyframes pd-ring{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--accent) 45%,transparent)}70%,100%{box-shadow:0 0 0 18px transparent}}
h1,.file{animation:pd-fade .5s .1s both}
li{animation:pd-rise .45s cubic-bezier(.2,.8,.2,1) both}li:nth-child(1){animation-delay:.25s}li:nth-child(2){animation-delay:.35s}li:nth-child(3){animation-delay:.45s}li:nth-child(4){animation-delay:.55s}
code,.pass{animation:pd-fade .6s .6s both}.credits{animation:pd-fade .8s .8s both}
main{background:var(--card);border-radius:20px;padding:32px 36px;max-width:440px;margin:16px;box-shadow:0 10px 40px #0002;text-align:center}
h1{font-size:20px;margin:0 0 4px}.file{color:var(--muted);font-size:14px;word-break:break-all}
.qr{background:#fff;border-radius:14px;padding:10px;width:280px;max-width:100%;margin:16px auto 0;box-sizing:border-box}
ol{text-align:left;padding-left:20px;margin:20px 0 8px}li{margin:4px 0}
code{font-size:12px;color:var(--muted);word-break:break-all;display:block;margin-top:12px}
b{color:var(--accent)}
.pass{margin:14px auto 0;max-width:300px;font-size:14px;padding:9px 12px;border-radius:12px;background:var(--bg);color:var(--muted)}
.status{display:inline-flex;align-items:center;gap:8px;margin-top:12px;font-size:13.5px;font-weight:600;padding:6px 12px;border-radius:999px;background:var(--bg);color:var(--muted);animation:pd-fade .5s .3s both}
.status i{width:8px;height:8px;border-radius:50%;background:var(--accent);animation:pd-pulse 1.6s ease-in-out infinite}
.status.busy i{background:#f0a020}.status.done{color:#22a05b}.status.done i{display:none}.status.stopped i{background:var(--muted);animation:none}
@keyframes pd-pulse{50%{opacity:.25}}
.close{margin-top:18px;font:inherit;font-size:14px;font-weight:600;padding:9px 18px;border-radius:10px;border:1px solid color-mix(in srgb,var(--muted) 35%,transparent);background:transparent;color:var(--muted);cursor:pointer;transition:background .15s,color .15s}
.close:hover{background:var(--bg);color:var(--fg)}
.bye{display:none;padding:40px 0 20px}.bye b{display:block;font-size:20px;margin-bottom:6px}.bye span{color:var(--muted)}
body.closed main>*:not(.bye){display:none}body.closed .bye{display:block}
</style></head><body><main>
<h1>${esc(title)}</h1>${fileName ? `<div class="file">${esc(fileName)}</div>` : ""}
${controlBase ? '<div class="status" id="st"><i></i><span>Waiting for your phone…</span></div>' : ""}
<div class="qr">${svg}</div>${passcode ? '<div class="pass">🔒 Passcode required. The code is shown in Claude, not on this page.</div>' : ""}
<ol>${steps.map((s) => `<li>${s}</li>`).join("")}</ol>
<code>${esc(link)}</code>
${controlBase ? '<button class="close" id="close">Stop &amp; close</button><div class="bye"><b>Closed</b><span>You can close this tab now.</span></div>' : ""}
</main>${controlBase && !demo ? `<script>
const base=${JSON.stringify(controlBase)},st=document.getElementById("st"),btn=document.getElementById("close");let last="waiting";
function show(s){last=s.state;st.className="status "+s.state;st.querySelector("span").textContent=(s.state==="done"?"✓ ":"")+s.text;btn.textContent=s.state==="done"?"Close":"Stop & close";}
async function poll(){try{const r=await fetch(base+"status",{cache:"no-store"});show(await r.json());}catch{if(last!=="done")show({state:"stopped",text:"Stopped"});return;}setTimeout(poll,1000);}
poll();
btn.onclick=async()=>{try{await fetch(base+"stop",{method:"POST"})}catch{}window.close();setTimeout(()=>document.body.classList.add("closed"),150);};
</script>` : ""}${CREDITS}</body></html>`;
}

const cap = (s) => esc(s[0].toUpperCase() + s.slice(1));

export const STEPS = {
	setup: [
		"Scan with the iPhone <b>Camera</b> and open the link in <b>Safari</b> (same Wi-Fi). Tap <b>Allow</b>.",
		"Settings → <b>Profile Downloaded</b> → Install. (Not there? Settings → General → <b>VPN &amp; Device Management</b>.)",
		"Settings → General → About → <b>Certificate Trust Settings</b> → turn on <b>Phone Drop Local CA</b>.",
		"Done. Downloads are now encrypted, and open-in-app links work.",
	],
	download: [
		"Scan with your phone's <b>Camera</b> (same Wi-Fi).",
		"Open the link in your browser and tap <b>Download</b>.",
		"iPhone: <b>Files → Downloads</b>. Android: the <b>Downloads</b> app.",
	],
	receive: [
		"Scan with your phone's <b>Camera</b> (same Wi-Fi) and open the link.",
		"Tap <b>Choose photos or files</b>. They upload straight away.",
		"Tap <b>Done</b> when finished. Files appear in the folder above.",
	],
	withPasscode: (steps) => [steps[0], "Enter the <b>passcode</b> on your phone. Claude shows it in the chat.", ...steps.slice(1)],
	appWithPasscode: (name) => [
		"Scan with your phone's <b>Camera</b> (same Wi-Fi) and open the link.",
		"Enter the <b>passcode</b>. Claude shows it in the chat.",
		`Tap <b>Open</b> to switch to ${cap(name)}, then confirm. It downloads the file straight from this computer.`,
	],
	app: (name) => [
		"Scan with your phone's <b>Camera</b> (same Wi-Fi).",
		`Tap the banner to open <b>${cap(name)}</b>.`,
		`Confirm in ${cap(name)}: it downloads the file straight from this computer.`,
	],
};
