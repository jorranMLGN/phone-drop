// Regenerates the README screenshots from the real QR page template, using example data.
//   npm run screenshots
// Needs Chrome or Edge (set CHROME=/path/to/browser to override).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderQrPage, STEPS } from "../scripts/qr-page.mjs";

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
