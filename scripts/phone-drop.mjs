#!/usr/bin/env node
// phone-drop: serve a file once over your local network and show a QR code for your phone.
// By default the phone just downloads it; optionally the link opens an app instead
// (e.g. Feather: feather://install/<https-url>).
//
//   node phone-drop.mjs send <file> [--open <app|template>] [--download]
//   node phone-drop.mjs setup     one-time: create a local CA so the phone trusts HTTPS links
//   node phone-drop.mjs status    show config, certificate and network info
//   node phone-drop.mjs apps      list configured open-in apps
//
// Options: --open <app|template>  --download  --http  --https  --ip <addr>  --port <n>
//          --timeout <minutes>  --no-browser

import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderQrPage, STEPS } from "./qr-page.mjs";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATE_DIR = path.join(os.homedir(), ".phone-drop");
const CA_KEY = path.join(STATE_DIR, "ca.key");
const CA_CRT = path.join(STATE_DIR, "ca.crt");
const CA_DER = path.join(STATE_DIR, "PhoneDropCA.cer");

// ---------- args ----------
const argv = process.argv.slice(2);
const cmd = argv[0];
function opt(name, fallback) {
	const i = argv.indexOf(`--${name}`);
	return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const flag = (name) => argv.includes(`--${name}`);
const NO_BROWSER = flag("no-browser");

function die(msg) {
	console.error(`ERROR: ${msg}`);
	process.exit(1);
}

// ---------- config ----------
// Defaults come from plugin.json's userConfig; values the user set with
// `/plugin configure phone-drop@<marketplace>` live in Claude Code's settings.json.
function loadConfig() {
	const config = {};
	try {
		const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), "utf8"));
		for (const [k, v] of Object.entries(manifest.userConfig || {})) config[k] = v.default;
	} catch {}
	try {
		const dir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
		const settings = JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8"));
		for (const [id, entry] of Object.entries(settings.pluginConfigs || {})) {
			if (id.split("@")[0] === "phone-drop") Object.assign(config, entry.options || {});
		}
	} catch {}
	const list = (v) => (Array.isArray(v) ? v : typeof v === "string" && v ? v.split(/[\n,]/) : []).map((s) => s.trim()).filter(Boolean);
	const pairs = (v) => Object.fromEntries(list(v).map((s) => [s.slice(0, s.indexOf("=")).trim().toLowerCase(), s.slice(s.indexOf("=") + 1).trim()]).filter(([k, val]) => k && val));
	return {
		transport: ["auto", "https", "http"].includes(config.transport) ? config.transport : "auto",
		apps: pairs(config.apps),
		autoOpen: Object.fromEntries(Object.entries(pairs(config.auto_open)).map(([ext, app]) => [ext.replace(/^\./, ""), app.toLowerCase()])),
		timeout: Number(config.timeout_minutes) || 15,
	};
}
const CONFIG = loadConfig();

// ---------- openssl ----------
let OPENSSL;
function openssl() {
	if (OPENSSL) return OPENSSL;
	const candidates = [
		"openssl",
		"C:/Program Files/Git/usr/bin/openssl.exe",
		"C:/Program Files/Git/mingw64/bin/openssl.exe",
		"C:/Program Files/OpenSSL-Win64/bin/openssl.exe",
		"C:/msys64/usr/bin/openssl.exe",
		"C:/msys64/mingw64/bin/openssl.exe",
		"/opt/homebrew/opt/openssl@3/bin/openssl",
		"/usr/local/opt/openssl@3/bin/openssl",
	];
	for (const c of candidates) {
		try {
			execFileSync(c, ["version"], { stdio: "ignore" });
			return (OPENSSL = c);
		} catch {}
	}
	die("openssl not found (only needed for HTTPS). Windows: install Git for Windows or `winget install ShiningLight.OpenSSL.Light`. macOS: `brew install openssl@3`. Linux: install the openssl package.");
}
const ssl = (args) => execFileSync(openssl(), args, { stdio: ["ignore", "pipe", "pipe"] });

// ---------- network ----------
function isPrivate(ip) {
	return /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}
function pickLanIp() {
	const forced = opt("ip");
	if (forced) return forced;
	const virtual = /vEthernet|VirtualBox|VMware|WSL|Hyper-V|Loopback|Tailscale|ZeroTier|docker|utun|bridge/i;
	const found = [];
	for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
		for (const a of addrs || []) {
			if (a.family !== "IPv4" || a.internal || !isPrivate(a.address)) continue;
			found.push({ ip: a.address, score: (virtual.test(name) ? 0 : 2) + (/^192\.168\./.test(a.address) ? 1 : 0) });
		}
	}
	found.sort((x, y) => y.score - x.score);
	if (!found.length) die("No private LAN IPv4 address found. Are you on Wi-Fi? Pass --ip <addr> to override.");
	return found[0].ip;
}

// ---------- certificates ----------
const caReady = () => fs.existsSync(CA_KEY) && fs.existsSync(CA_CRT);

function ensureCa() {
	if (caReady()) {
		if (!fs.existsSync(CA_DER)) ssl(["x509", "-in", CA_CRT, "-outform", "DER", "-out", CA_DER]);
		return false;
	}
	fs.mkdirSync(STATE_DIR, { recursive: true });
	const cnf = path.join(STATE_DIR, "ca.cnf");
	// The CA key never leaves this machine and is locked to the current user (see restrictKey).
	// Anyone holding it could mint certificates the phone trusts, so keep it private.
	fs.writeFileSync(
		cnf,
		`[req]
distinguished_name = dn
prompt = no
x509_extensions = v3_ca
[dn]
CN = Phone Drop Local CA (${os.hostname()})
O = phone-drop
[v3_ca]
basicConstraints = critical, CA:TRUE, pathlen:0
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
`,
	);
	ssl(["req", "-x509", "-new", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-sha256", "-days", "3650", "-keyout", CA_KEY, "-out", CA_CRT, "-config", cnf]);
	restrictKey(CA_KEY);
	ssl(["x509", "-in", CA_CRT, "-outform", "DER", "-out", CA_DER]);
	return true;
}

function restrictKey(file) {
	try {
		if (process.platform === "win32") {
			execFileSync("icacls", [file, "/inheritance:r", "/grant:r", `${os.userInfo().username}:F`], { stdio: "ignore" });
		} else {
			fs.chmodSync(file, 0o600);
		}
	} catch {}
}

function serverCertFor(ip) {
	const dir = path.join(STATE_DIR, "server", ip);
	const key = path.join(dir, "server.key");
	const crt = path.join(dir, "server.crt");
	if (fs.existsSync(key) && fs.existsSync(crt)) {
		// reuse unless it expires within a week
		try {
			ssl(["x509", "-in", crt, "-noout", "-checkend", String(7 * 86400)]);
			return { key: fs.readFileSync(key), cert: fs.readFileSync(crt) };
		} catch {}
	}
	fs.mkdirSync(dir, { recursive: true });
	const csr = path.join(dir, "server.csr");
	const ext = path.join(dir, "server.ext");
	fs.writeFileSync(
		ext,
		`basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature
extendedKeyUsage = serverAuth
subjectAltName = IP:${ip}
`,
	);
	ssl(["req", "-new", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-keyout", key, "-out", csr, "-subj", "/CN=Phone Drop/O=phone-drop"]);
	restrictKey(key);
	// iOS rejects TLS server certs valid longer than 825 days; stay well under.
	ssl(["x509", "-req", "-in", csr, "-CA", CA_CRT, "-CAkey", CA_KEY, "-CAcreateserial", "-out", crt, "-days", "397", "-sha256", "-extfile", ext]);
	ssl(["verify", "-CAfile", CA_CRT, crt]);
	return { key: fs.readFileSync(key), cert: fs.readFileSync(crt) };
}

// ---------- open-in apps ----------
// Returns { name, template } or null for a plain download.
function resolveApp(file) {
	if (flag("download")) return null;
	const requested = opt("open");
	if (requested) {
		if (requested.includes("{url")) return { name: "custom", template: requested };
		const template = CONFIG.apps[requested.toLowerCase()];
		if (!template) die(`Unknown app "${requested}". Configured apps: ${Object.keys(CONFIG.apps).join(", ") || "(none)"}. Add one with /plugin configure, or pass a template containing {url}.`);
		return { name: requested.toLowerCase(), template };
	}
	const ext = path.extname(file).slice(1).toLowerCase();
	const auto = CONFIG.autoOpen[ext];
	if (auto && CONFIG.apps[auto]) return { name: auto, template: CONFIG.apps[auto] };
	return null;
}
const fillTemplate = (template, url) => template.replaceAll("{url_encoded}", encodeURIComponent(url)).replaceAll("{url}", url);

// ---------- QR page / server helpers ----------
async function showQrPage(page) {
	const out = path.join(os.tmpdir(), `phone-drop-${Date.now()}.html`);
	fs.writeFileSync(out, await renderQrPage(page));
	if (!NO_BROWSER) openInBrowser(out);
	console.log(`QR page: ${out}`);
}

function openInBrowser(file) {
	const [bin, args] =
		process.platform === "win32" ? ["cmd.exe", ["/c", "start", "", file]] : process.platform === "darwin" ? ["open", [file]] : ["xdg-open", [file]];
	try {
		spawn(bin, args, { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
	} catch {}
}

function listenOrDie(server, port, host) {
	return new Promise((resolve) => {
		server.once("error", (e) => die(e.code === "EADDRINUSE" ? `Port ${port} is in use (another phone-drop still running?). Use --port.` : e.message));
		server.listen(port, host, resolve);
	});
}

function startTimeout(minutes, what) {
	return setTimeout(() => {
		console.log(`Timed out after ${minutes} min without ${what}. Server stopped.`);
		process.exit(2);
	}, minutes * 60_000);
}

// ---------- commands ----------
async function setup() {
	const created = ensureCa();
	console.log(created ? `Created local CA in ${STATE_DIR}` : `Using existing local CA in ${STATE_DIR}`);
	const ip = pickLanIp();
	const port = Number(opt("port", "8080"));
	const der = fs.readFileSync(CA_DER);
	const url = `http://${ip}:${port}/PhoneDropCA.cer`;
	const minutes = Number(opt("timeout", CONFIG.timeout));
	const timer = startTimeout(minutes, "the profile being downloaded");

	const server = http.createServer((req, res) => {
		if (req.url !== "/PhoneDropCA.cer") {
			res.writeHead(404).end();
			return;
		}
		console.log(`Profile requested by ${req.socket.remoteAddress}`);
		res.writeHead(200, { "Content-Type": "application/x-x509-ca-cert", "Content-Length": der.length, "Content-Disposition": 'attachment; filename="PhoneDropCA.cer"' });
		res.end(der, () => {
			if (req.method === "HEAD") return;
			console.log("Profile delivered. Finish the steps on the phone (install the profile, then turn on full trust).");
			clearTimeout(timer);
			setTimeout(() => process.exit(0), 3000);
		});
	});
	await listenOrDie(server, port, ip);
	console.log(`Serving CA profile at ${url}`);
	await showQrPage({ title: "Phone Drop: one-time HTTPS setup", link: url, steps: STEPS.setup });
}

async function send() {
	const file = argv[1];
	if (!file || file.startsWith("--")) die("Usage: phone-drop.mjs send <file> [--open <app>] [--download]");
	const abs = path.resolve(file);
	if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) die(`File not found: ${abs}`);

	const app = resolveApp(abs);
	const transport = flag("https") ? "https" : flag("http") ? "http" : CONFIG.transport;
	let secure = transport === "https" || (transport === "auto" && caReady());
	if (app) {
		// Apps such as Feather only accept https links (and iOS App Transport Security blocks http).
		if (!caReady()) die(`Opening in ${app.name} needs HTTPS, which needs the one-time setup. Run \`phone-drop.mjs setup\` first, or pass --download.`);
		if (transport === "http") die(`Opening in ${app.name} needs HTTPS, but transport is set to http.`);
		secure = true;
	}
	if (secure && !caReady()) die("Transport is https but the one-time setup hasn't been done. Run `phone-drop.mjs setup` first.");

	const ip = pickLanIp();
	const port = Number(opt("port", secure ? "8443" : "8080"));
	const size = fs.statSync(abs).size;
	const safeName = path.basename(abs).replace(/[^A-Za-z0-9._-]+/g, "_");
	const token = crypto.randomBytes(12).toString("hex");
	const route = `/${token}/${safeName}`;
	const fileUrl = `${secure ? "https" : "http"}://${ip}:${port}${route}`;
	const link = app ? fillTemplate(app.template, fileUrl) : fileUrl;
	const minutes = Number(opt("timeout", CONFIG.timeout));
	const timer = startTimeout(minutes, "a completed download");

	const handler = (req, res) => {
		const who = req.socket.remoteAddress;
		if (req.url !== route) {
			res.writeHead(404).end();
			return;
		}
		console.log(`${req.method} from ${who}`);
		res.writeHead(200, {
			"Content-Type": "application/octet-stream",
			"Content-Length": size,
			"Content-Disposition": `attachment; filename="${safeName}"`,
			"Cache-Control": "no-store",
		});
		if (req.method === "HEAD") return res.end();
		let sent = 0;
		let lastPct = -1;
		const stream = fs.createReadStream(abs);
		stream.on("data", (chunk) => {
			sent += chunk.length;
			const pct = size ? Math.floor((sent / size) * 10) * 10 : 100;
			if (pct !== lastPct) {
				lastPct = pct;
				console.log(`  ${pct}% (${(sent / 1048576).toFixed(1)} / ${(size / 1048576).toFixed(1)} MB)`);
			}
		});
		res.on("finish", () => {
			console.log(`Download complete: ${safeName} -> ${who}.${app ? ` ${app.name} will now import it.` : ""}`);
			clearTimeout(timer);
			setTimeout(() => process.exit(0), 3000);
		});
		res.on("close", () => {
			if (!res.writableFinished) console.log(`Transfer to ${who} aborted at ${sent} bytes; waiting for a retry.`);
		});
		stream.pipe(res);
	};
	const server = secure ? https.createServer(serverCertFor(ip), handler) : http.createServer(handler);
	if (secure) {
		server.on("tlsClientError", (e, sock) =>
			console.log(`TLS handshake from ${sock?.remoteAddress ?? "?"} failed (${e.code || e.message}). Is the CA trusted on the phone (Certificate Trust Settings)?`),
		);
	}
	await listenOrDie(server, port, ip);
	console.log(`Serving ${abs} (${(size / 1048576).toFixed(1)} MB) over ${secure ? "HTTPS" : "HTTP"}${app ? `, opening in ${app.name}` : ""}`);
	console.log(`Link: ${link}`);
	await showQrPage({
		title: app ? `Open in ${app.name[0].toUpperCase()}${app.name.slice(1)}` : "Download to your phone",
		fileName: path.basename(abs),
		link,
		steps: app ? STEPS.app(app.name) : STEPS.download,
	});
}

function status() {
	console.log(`State dir   : ${STATE_DIR}`);
	console.log(`HTTPS setup : ${caReady() ? "done (downloads use HTTPS when transport=auto)" : "not done (downloads use HTTP; apps need `setup`)"}`);
	console.log(`Transport   : ${CONFIG.transport}`);
	console.log(`Timeout     : ${CONFIG.timeout} min`);
	console.log(`LAN IP      : ${pickLanIp()}`);
	apps();
}

function apps() {
	const auto = Object.entries(CONFIG.autoOpen).map(([ext, app]) => `.${ext} → ${app}`);
	console.log(`Apps        : ${Object.entries(CONFIG.apps).map(([n, t]) => `${n} (${t})`).join(", ") || "(none)"}`);
	console.log(`Auto-open   : ${auto.join(", ") || "(none, always download)"}`);
}

switch (cmd) {
	case "setup":
		await setup();
		break;
	case "send":
		await send();
		break;
	case "status":
		status();
		break;
	case "apps":
		apps();
		break;
	default:
		console.log("Usage: phone-drop.mjs <send <file> [--open app] [--download] | setup | status | apps> [--http|--https] [--ip addr] [--port n] [--timeout min] [--no-browser]");
		process.exit(cmd ? 1 : 0);
}
