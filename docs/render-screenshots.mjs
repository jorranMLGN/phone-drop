// Regenerates the README screenshots from the real QR page template, using example data.
//   npm run screenshots
// Needs Chrome or Edge (set CHROME=/path/to/browser to override).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderQrPage, STEPS } from "../scripts/qr-page.mjs";
import { renderUploadPage } from "../scripts/upload-page.mjs";
import { renderGatePage } from "../scripts/gate-page.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.join(here, "pages");
const imagesDir = path.join(here, "images");
fs.mkdirSync(pagesDir, { recursive: true });
fs.mkdirSync(imagesDir, { recursive: true });

const IP = "192.168.1.42";
const TOKEN = "3f9c2a7e5b1d4c8a6e0f2b9d";
const pages = {
	"download-page": { title: "Download to your phone", fileName: "holiday-photos.zip", link: `http://${IP}:8080/${TOKEN}/holiday-photos.zip`, steps: STEPS.download },
	"setup-page": { title: "Phone Drop: one-time HTTPS setup", link: `http://${IP}:8080/PhoneDropCA.cer`, steps: STEPS.setup },
	"receive-page": { title: "Send files to this computer", fileName: "Saves to ~/Downloads", link: `https://${IP}:8443/${TOKEN}/`, steps: STEPS.receive },
	"feather-page": { title: "Open in Feather", fileName: "MyApp.ipa", link: `feather://install/https://${IP}:8443/${TOKEN}/MyApp.ipa`, steps: STEPS.app("feather") },
};

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

// The upload page as the phone sees it, with a few files mid-upload (static demo state).
// The upload page as the phone sees it, with a few files mid-upload (static demo state).
const phoneDemo = (html) =>
	html.replace(
		"</body>",
		`<script>
document.head.insertAdjacentHTML('beforeend','<style>li{animation:none!important}</style>');
const demo=[["IMG_2041.HEIC",3407872,1,"img"],["IMG_2042.HEIC",2936012,1,"img2"],["Screen Recording 2026-10-12.mov",48234496,.64,"video"],["invoice-october.pdf",1258291,0,"file"]];
const grad={img:"linear-gradient(135deg,#f6a04d,#e8566c)",img2:"linear-gradient(135deg,#4facfe,#43e97b)"};
for(const [n,sz,p,k] of demo){const f=new File([""],n,{type:k==="video"?"video/quicktime":k==="file"?"application/pdf":""});Object.defineProperty(f,"size",{value:sz});const it=add(f);
 if(grad[k]){const th=it.li.querySelector(".thumb");th.innerHTML="";th.style.padding="0";th.style.backgroundImage=grad[k];}
 if(p===1){it.state="ok";it.li.className="ok";it.li.querySelector(".st").innerHTML=IC.check;it.li.querySelector(".sub").textContent=fmt(sz)+" · sent";}
 else if(p>0){it.state="up";it.sent=sz*p;it.li.className="";it.li.querySelector(".bar i").style.width=(p*100)+"%";it.li.querySelector(".sub").textContent=fmt(sz*p)+" of "+fmt(sz);}
}
busy=true;refresh();
</script></body>`,
	);

const shoot = (html, png, scheme, size) => {
	const file = path.join(pagesDir, path.basename(png, ".png") + ".html");
	fs.writeFileSync(file, html.replace("</head>", "<style>*,*::before,*::after{animation:none!important;transition:none!important}</style></head>"));
	execFileSync(browser, [
		"--headless=new",
		"--disable-gpu",
		"--hide-scrollbars",
		`--force-dark-mode=${scheme === "dark"}`,
		`--blink-settings=preferredColorScheme=${scheme === "dark" ? 0 : 1}`,
		(png.endsWith("banner.png") ? "--force-device-scale-factor=1" : "--force-device-scale-factor=2"),
		`--window-size=${size}`,
		`--screenshot=${png}`,
		pathToFileURL(file).href,
	], { stdio: "ignore" });
	console.log(`wrote ${path.relative(process.cwd(), png)}`);
};

for (const scheme of ["light", "dark"]) {
	const html = phoneDemo(renderUploadPage({ computer: "MY-LAPTOP", base: "/demo/", secure: true }));
	shoot(html, path.join(imagesDir, `phone-upload${scheme === "dark" ? "-dark" : ""}.png`), scheme, "500,800");
}

for (const scheme of ["light", "dark"]) {
	const html = renderGatePage({ computer: "MY-LAPTOP", base: "/demo/", numeric: true, what: "receiving files" }).replace(
		"</body>",
		'<script>document.getElementById("c").value="4829";document.getElementById("c").blur();</script></body>',
	);
	shoot(html, path.join(imagesDir, `phone-passcode${scheme === "dark" ? "-dark" : ""}.png`), scheme, "500,800");
}

for (const [name, page] of Object.entries(pages)) {
	for (const scheme of ["light", "dark"]) {
		const html = path.join(pagesDir, `${name}.html`);
		fs.writeFileSync(html, (await renderQrPage({ ...page, controlBase: "/demo/", demo: true, createdAt: new Date("2026-10-14T14:32:00"), timeoutMin: 15 })).replace("</head>", "<style>*,*::before,*::after{animation:none!important;transition:none!important}</style></head>"));
		const png = path.join(imagesDir, `${name}${scheme === "dark" ? "-dark" : ""}.png`);
		execFileSync(browser, [
			"--headless=new",
			"--disable-gpu",
			"--hide-scrollbars",
			`--force-dark-mode=${scheme === "dark"}`,
			...(scheme === "dark" ? ["--blink-settings=preferredColorScheme=0"] : ["--blink-settings=preferredColorScheme=1"]),
			(png.endsWith("banner.png") ? "--force-device-scale-factor=1" : "--force-device-scale-factor=2"),
			`--window-size=560,${name === "setup-page" ? 800 : 760}`,
			`--screenshot=${png}`,
			pathToFileURL(html).href,
		], { stdio: "ignore" });
		console.log(`wrote ${path.relative(process.cwd(), png)}`);
	}
}

// Banner for the top of the README (1280×640 also fits GitHub's social preview).
{
	const img = (f) => pathToFileURL(path.join(imagesDir, f)).href;
	const banner = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:1280px;height:640px;overflow:hidden}
body{font-family:"Segoe UI",system-ui,-apple-system,sans-serif;color:#f4f4f8;background:radial-gradient(1200px 700px at 85% 10%,#3b2f8f 0%,transparent 60%),radial-gradient(900px 600px at 0% 100%,#1f3a8a 0%,transparent 55%),#0d0d14;position:relative}
.left{position:absolute;left:80px;top:96px;width:610px}
.mark{display:flex;align-items:center;gap:16px;margin-bottom:26px}
.logo{width:64px;height:64px;border-radius:18px;padding:14px;background:linear-gradient(135deg,#5a64e8,#8b5cf6);box-shadow:0 10px 30px #5a64e866}
.logo svg{width:100%;height:100%}
.name{font-size:30px;font-weight:700;letter-spacing:-.01em}.name small{display:block;font-size:16px;font-weight:500;color:#a9a9c4;letter-spacing:.02em}
h1{font-size:62px;line-height:1.04;margin:0 0 20px;letter-spacing:-.025em;font-weight:800}
h1 em{font-style:normal;background:linear-gradient(90deg,#9aa2ff,#c69bff);-webkit-background-clip:text;color:transparent}
p{font-size:23px;line-height:1.45;color:#c4c4d6;margin:0 0 30px}
.chips{display:flex;flex-wrap:wrap;gap:10px}
.chip{font-size:17px;font-weight:600;padding:9px 15px;border-radius:999px;background:#ffffff12;border:1px solid #ffffff22}
.chip b{color:#7ee2a8}
.phone{position:absolute;right:92px;top:58px;width:292px;height:600px;border-radius:46px;background:#000;padding:12px;box-shadow:0 30px 80px #000a,0 0 0 2px #2c2c3a}
.screen{height:100%;border-radius:36px;overflow:hidden;background:#0e0e12;padding-top:30px}.screen img{width:100%;display:block}
.notch{position:absolute;top:22px;left:50%;transform:translateX(-50%);width:96px;height:28px;background:#000;border-radius:20px}
.qr{position:absolute;right:332px;top:300px;width:210px;border-radius:20px;overflow:hidden;box-shadow:0 24px 60px #000b,0 0 0 1px #ffffff1a;transform:rotate(-4deg)}
.qr img{width:100%;display:block}
</style></head><body>
<div class="left">
<div class="mark"><div class="logo"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M12 7v7m-3-3 3 3 3-3"/></svg></div>
<div class="name">phone-drop<small>npx phone-drop · Claude Code plugin</small></div></div>
<h1>AirDrop for<br><em>AI agents</em></h1>
<p>Move files between your computer and your phone with one QR scan. Over your own Wi-Fi.</p>
<div class="chips"><span class="chip"><b>∞</b> No size limit</span><span class="chip">No app</span><span class="chip">No cloud</span><span class="chip">iPhone &amp; Android</span><span class="chip">Both directions</span></div>
</div>
<div class="qr"><img src="${img("download-page-dark.png")}"></div>
<div class="phone"><div class="screen"><img src="${img("phone-upload-dark.png")}"></div><div class="notch"></div></div>
</body></html>`;
	shoot(banner, path.join(imagesDir, "banner.png"), "dark", "1280,640");
}
