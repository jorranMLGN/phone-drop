// Regenerates the README screenshots from the real QR page template, using example data.
//   npm run screenshots
// Needs Chrome or Edge (set CHROME=/path/to/browser to override).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderQrPage, STEPS } from "../scripts/qr-page.mjs";
import { renderUploadPage } from "../scripts/upload-page.mjs";

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
	fs.writeFileSync(file, html);
	execFileSync(browser, [
		"--headless=new",
		"--disable-gpu",
		"--hide-scrollbars",
		`--force-dark-mode=${scheme === "dark"}`,
		`--blink-settings=preferredColorScheme=${scheme === "dark" ? 0 : 1}`,
		"--force-device-scale-factor=2",
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

for (const [name, page] of Object.entries(pages)) {
	for (const scheme of ["light", "dark"]) {
		const html = path.join(pagesDir, `${name}.html`);
		fs.writeFileSync(html, await renderQrPage(page));
		const png = path.join(imagesDir, `${name}${scheme === "dark" ? "-dark" : ""}.png`);
		execFileSync(browser, [
			"--headless=new",
			"--disable-gpu",
			"--hide-scrollbars",
			`--force-dark-mode=${scheme === "dark"}`,
			...(scheme === "dark" ? ["--blink-settings=preferredColorScheme=0"] : ["--blink-settings=preferredColorScheme=1"]),
			"--force-device-scale-factor=2",
			`--window-size=560,${name === "setup-page" ? 800 : 760}`,
			`--screenshot=${png}`,
			pathToFileURL(html).href,
		], { stdio: "ignore" });
		console.log(`wrote ${path.relative(process.cwd(), png)}`);
	}
}
