// Renders docs/images/demo.gif: an animated illustration of a send (Claude Code → QR → phone).
//   npm run demo        (needs Chrome/Edge and ffmpeg on PATH, or FFMPEG=/path/to/ffmpeg)
// Each frame is a static render of the scene at time t, so the result is deterministic.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import QRCode from "qrcode";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "images", "demo.gif");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "phone-drop-demo-"));
const W = 960, H = 540, FPS = 12, SECONDS = 10.5;

const browser =
	process.env.CHROME ||
	[
		"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
		"C:/Program Files/Microsoft/Edge/Application/msedge.exe",
		"C:/Program Files/Google/Chrome/Application/chrome.exe",
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/usr/bin/google-chrome",
		"/usr/bin/chromium",
	].find((p) => fs.existsSync(p));
if (!browser) throw new Error("No Chrome/Edge found; set CHROME=/path/to/browser");
const ffmpeg = process.env.FFMPEG || "ffmpeg";

const qr = await QRCode.toString("http://192.168.1.42:8080/3f9c2a7e5b1d4c8a6e0f2b9d/holiday-video.mov", { type: "svg", margin: 1 });

const scene = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{font-family:"Segoe UI",system-ui,sans-serif;color:#e9e9f1;background:radial-gradient(900px 600px at 90% 0%,#33287a 0%,transparent 60%),radial-gradient(700px 500px at 0% 100%,#1c3170 0%,transparent 55%),#0d0d14;position:relative}
.term{position:absolute;left:30px;top:52px;width:440px;height:430px;border-radius:14px;background:#15151d;box-shadow:0 20px 50px #0008,0 0 0 1px #ffffff14;overflow:hidden}
.bar{height:34px;display:flex;align-items:center;gap:7px;padding:0 14px;background:#1c1c26;font-size:12.5px;color:#8d8da3}
.bar i{width:11px;height:11px;border-radius:50%;background:#3a3a48}.bar span{margin-left:10px}
.body{padding:18px 18px;font:14px/1.7 "Cascadia Code","Consolas",monospace;white-space:pre-wrap}
.muted{color:#7d7d93}.acc{color:#a6adff}.ok{color:#5fd68f}.dot{color:#d98bff}
.cursor{display:inline-block;width:8px;height:17px;background:#c9c9d6;vertical-align:-3px}
.win{position:absolute;left:486px;top:140px;width:184px;border-radius:14px;background:#fff;color:#16161a;box-shadow:0 26px 60px #000a;overflow:hidden}
.win .tb{height:26px;background:#ececf2;display:flex;align-items:center;gap:6px;padding:0 10px}.win .tb i{width:9px;height:9px;border-radius:50%;background:#cfcfd8}
.win .c{padding:12px 12px 14px;text-align:center}.win h3{font-size:12.5px;margin-bottom:2px}.win small{color:#6c6c74;font-size:10.5px}
.win .q{width:140px;margin:10px auto 0;padding:6px;border-radius:10px;box-shadow:0 0 0 var(--ring,0px) #5a64e855}
.win .q svg{display:block;width:100%}
.phone{position:absolute;left:696px;top:40px;width:236px;height:476px;border-radius:38px;background:#000;padding:10px;box-shadow:0 26px 70px #000b,0 0 0 2px #2c2c3a}
.screen{position:relative;width:100%;height:100%;border-radius:29px;overflow:hidden;background:#0e0e12}
.notch{position:absolute;top:9px;left:50%;transform:translateX(-50%);width:74px;height:22px;background:#000;border-radius:14px;z-index:5}
.cam{position:absolute;inset:0;background:linear-gradient(160deg,#2a2a33,#121217)}
.vf{position:absolute;left:36px;top:120px;width:144px;height:144px}
.vf svg{width:100%;display:block;background:#fff;border-radius:6px;padding:4px}
.corner{position:absolute;width:26px;height:26px;border:3px solid #ffd43b}
.c1{left:-8px;top:-8px;border-right:0;border-bottom:0;border-radius:8px 0 0 0}.c2{right:-8px;top:-8px;border-left:0;border-bottom:0;border-radius:0 8px 0 0}
.c3{left:-8px;bottom:-8px;border-right:0;border-top:0;border-radius:0 0 0 8px}.c4{right:-8px;bottom:-8px;border-left:0;border-top:0;border-radius:0 0 8px 0}
.pill{position:absolute;left:18px;right:18px;top:300px;background:#ffd43b;color:#1a1a1a;border-radius:14px;padding:9px 12px;font-size:12.5px;font-weight:600;text-align:center}
.shutter{position:absolute;left:50%;bottom:22px;width:54px;height:54px;margin-left:-27px;border-radius:50%;border:4px solid #fff}
.saf{position:absolute;inset:0;background:#f3f3f7;color:#16161a}
.addr{margin:40px 12px 0;background:#e3e3ea;border-radius:10px;padding:7px 10px;font-size:12px;color:#55555e;text-align:center}
.dl{margin:70px 16px 0;background:#fff;border-radius:18px;padding:20px 16px;text-align:center;box-shadow:0 6px 18px #0000000f}
.ic{width:52px;height:52px;margin:0 auto 10px;border-radius:14px;background:linear-gradient(135deg,#5a64e8,#8b5cf6);display:grid;place-items:center;color:#fff;font-size:24px}
.dl b{display:block;font-size:14px}.dl small{display:block;color:#6c6c74;font-size:12px;margin-top:2px}
.pb{height:6px;border-radius:3px;background:#e6e6ee;margin-top:14px;overflow:hidden}.pb i{display:block;height:100%;background:linear-gradient(90deg,#5a64e8,#8b5cf6)}
.pct{font-size:12px;color:#6c6c74;margin-top:6px}
.done{position:absolute;inset:0;background:#f3f3f7;color:#16161a;text-align:center;padding-top:150px}
.chk{width:74px;height:74px;margin:0 auto 14px;border-radius:50%;background:#22a05b;color:#fff;display:grid;place-items:center;font-size:38px;font-weight:700;box-shadow:0 10px 26px #22a05b55}
.done b{display:block;font-size:17px}.done small{display:block;color:#6c6c74;font-size:12.5px;margin-top:4px}
.cap{position:absolute;left:0;right:0;bottom:14px;text-align:center;font-size:13px;color:#8d8da3;letter-spacing:.02em}
.hide{display:none}
</style></head><body>
<div class="term"><div class="bar"><i></i><i></i><i></i><span>~/Downloads — claude</span></div><div class="body" id="t"></div></div>
<div class="win" id="win"><div class="tb"><i></i><i></i><i></i></div><div class="c"><h3>Download to your phone</h3><small>holiday-video.mov</small><div class="q" id="q">${qr}</div></div></div>
<div class="phone"><div class="screen"><div class="notch"></div>
 <div class="cam" id="cam"><div class="vf" id="vf">${qr}<i class="corner c1"></i><i class="corner c2"></i><i class="corner c3"></i><i class="corner c4"></i></div><div class="pill" id="pill">Open “192.168.1.42” in Safari</div><div class="shutter"></div></div>
 <div class="saf hide" id="saf"><div class="addr">🔒 192.168.1.42</div><div class="dl"><div class="ic">↓</div><b>holiday-video.mov</b><small>1.24 GB</small><div class="pb"><i id="pb"></i></div><div class="pct" id="pct"></div></div></div>
 <div class="done hide" id="done"><div class="chk">✓</div><b>Downloaded</b><small>Saved to Files › Downloads</small></div>
</div></div>
<div class="cap">phone-drop · no app · no cloud · no size limit</div>
<script>
const t = Number(location.hash.slice(1)) || 0;
const $ = (id) => document.getElementById(id);
const clamp = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);
const prompt = "put holiday-video.mov on my phone";
const typed = prompt.slice(0, Math.floor(clamp((t - 0.4) / 1.6) * prompt.length));
let html = '<span class="muted">✻ Claude Code</span>\\n\\n<span class="acc">&gt;</span> ' + typed;
if (t < 2.2) html += '<span class="cursor"></span>';
if (t >= 2.4) html += '\\n\\n<span class="dot">⏺</span> Bash(npx phone-drop holiday-video.mov)';
if (t >= 2.9) html += '\\n  <span class="muted">⎿ Serving holiday-video.mov (1.24 GB)</span>';
if (t >= 3.1) html += '\\n\\n<span class="dot">⏺</span> Scan the QR code with your phone\\n  and tap Download.';
if (t >= 4.6 && t < 7.4) html += '\\n\\n  <span class="muted">' + Math.floor(clamp((t - 4.6) / 2.6) * 100) + '% sent…</span>';
if (t >= 7.4) html += '\\n\\n<span class="ok">✓</span> holiday-video.mov is on your phone\\n  <span class="muted">(1.24 GB, straight over Wi-Fi)</span>';
$("t").innerHTML = html;
const w = ease((t - 2.9) / 0.5);
$("win").style.opacity = w; $("win").style.transform = "translateY(" + (14 * (1 - w)) + "px)";
$("q").style.setProperty("--ring", (t > 3.4 && t < 4.6 ? 10 * ((t * 1.4) % 1) : 0) + "px");
const v = ease((t - 3.4) / 0.5);
$("vf").style.opacity = v; $("vf").style.transform = "scale(" + (0.85 + 0.15 * v) + ")";
$("pill").style.opacity = ease((t - 3.9) / 0.3);
$("cam").classList.toggle("hide", t >= 4.5);
$("saf").classList.toggle("hide", !(t >= 4.5 && t < 7.4));
$("done").classList.toggle("hide", t < 7.4);
const p = clamp((t - 4.6) / 2.6);
$("pb").style.width = (p * 100) + "%";
$("pct").textContent = Math.floor(p * 100) + "% · " + (p * 1.24).toFixed(2) + " of 1.24 GB";
document.body.style.opacity = t > ${SECONDS} - 0.5 ? clamp((${SECONDS} - t) / 0.5) : 1;
</script></body></html>`;

const html = path.join(work, "scene.html");
fs.writeFileSync(html, scene);
const frames = Math.round(SECONDS * FPS);
for (let i = 0; i < frames; i++) {
	const t = (i / FPS).toFixed(3);
	execFileSync(browser, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--window-size=${W},${H}`, `--screenshot=${path.join(work, `f${String(i).padStart(4, "0")}.png`)}`, `${pathToFileURL(html).href}#${t}`], { stdio: "ignore" });
	if (i % 20 === 0) console.log(`frame ${i}/${frames}`);
}
const pattern = path.join(work, "f%04d.png");
execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", pattern, "-vf", `fps=${FPS},scale=${W}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, "-loop", "0", out]);
fs.rmSync(work, { recursive: true, force: true });
console.log(`wrote ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);
