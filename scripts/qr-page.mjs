// Renders the QR page that the computer shows for the phone to scan.
import QRCode from "qrcode";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/**
 * @param {{ title: string, link: string, steps: string[], fileName?: string }} page
 *   `steps` may contain trusted inline HTML (<b>); everything else is escaped.
 */
export async function renderQrPage({ title, link, steps, fileName }) {
	const svg = await QRCode.toString(link, { type: "svg", errorCorrectionLevel: "M", margin: 2 });
	return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#f6f6f8;--fg:#1c1c1e;--muted:#6b6b70;--card:#fff;--accent:#5a64e8}
@media (prefers-color-scheme:dark){:root{--bg:#111113;--fg:#f2f2f5;--muted:#9a9aa2;--card:#1c1c20;--accent:#9aa2ff}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;display:grid;place-items:center;min-height:100vh}
main{background:var(--card);border-radius:20px;padding:32px 36px;max-width:440px;margin:16px;box-shadow:0 10px 40px #0002;text-align:center}
h1{font-size:20px;margin:0 0 4px}.file{color:var(--muted);font-size:14px;word-break:break-all}
.qr{background:#fff;border-radius:14px;padding:10px;width:280px;max-width:100%;margin:16px auto 0;box-sizing:border-box}
ol{text-align:left;padding-left:20px;margin:20px 0 8px}li{margin:4px 0}
code{font-size:12px;color:var(--muted);word-break:break-all;display:block;margin-top:12px}
b{color:var(--accent)}
</style></head><body><main>
<h1>${esc(title)}</h1>${fileName ? `<div class="file">${esc(fileName)}</div>` : ""}
<div class="qr">${svg}</div>
<ol>${steps.map((s) => `<li>${s}</li>`).join("")}</ol>
<code>${esc(link)}</code>
</main></body></html>`;
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
	app: (name) => [
		"Scan with your phone's <b>Camera</b> (same Wi-Fi).",
		`Tap the banner to open <b>${cap(name)}</b>.`,
		`Confirm in ${cap(name)}: it downloads the file straight from this computer.`,
	],
};
