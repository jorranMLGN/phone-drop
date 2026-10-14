#!/usr/bin/env node
// phone-drop: move files between your computer and your phone over local Wi-Fi with a QR code.
// Used as a CLI (`npx phone-drop`) and by the Claude Code plugin. Run `phone-drop --help` for usage.

import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { renderQrPage, STEPS } from "./qr-page.mjs";
import { renderUploadPage } from "./upload-page.mjs";
import { renderGatePage } from "./gate-page.mjs";
import { DEFAULT_THEME, THEMES, customTheme, resolveTheme } from "./themes.mjs";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATE_DIR = path.join(os.homedir(), ".phone-drop");
const CA_KEY = path.join(STATE_DIR, "ca.key");
const CA_CRT = path.join(STATE_DIR, "ca.crt");
const CA_DER = path.join(STATE_DIR, "PhoneDropCA.cer");

// ---------- args ----------
const argv = process.argv.slice(2);
const COMMANDS = ["send", "receive", "setup", "status", "apps", "help"];
// `phone-drop photo.jpg` is short for `phone-drop send photo.jpg`.
if (argv[0] && !COMMANDS.includes(argv[0]) && !argv[0].startsWith("-") && fs.existsSync(argv[0])) argv.unshift("send");
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
// Layers, later wins: defaults from plugin.json's userConfig → ~/.phone-drop/config.json (CLI users)
// → values set with `/plugin configure phone-drop@<marketplace>` (Claude Code's settings.json) → flags.
const CONFIG_FILE = path.join(STATE_DIR, "config.json");
function loadConfig() {
	const config = {};
	try {
		const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), "utf8"));
		for (const [k, v] of Object.entries(manifest.userConfig || {})) config[k] = v.default;
	} catch {}
	try {
		Object.assign(config, JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")));
	} catch (e) {
		if (e.code !== "ENOENT") console.error(`Warning: ignoring ${CONFIG_FILE}: ${e.message}`);
	}
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
		passcode: typeof config.passcode === "string" ? config.passcode.trim() : "",
		theme: typeof config.theme === "string" && config.theme.trim() ? config.theme.trim() : DEFAULT_THEME,
		customColors: typeof config.custom_colors === "string" ? config.custom_colors.trim() : "",
		receiveDir: typeof config.receive_dir === "string" && config.receive_dir.trim() ? config.receive_dir.trim().replace(/^~(?=$|[\\/])/, os.homedir()) : path.join(os.homedir(), "Downloads"),
	};
}
const CONFIG = loadConfig();
// --theme <name|#hex[,#hex]> wins over the config; custom colors win over the configured theme name.
const THEME_FLAG = opt("theme");
if (THEME_FLAG && !THEMES[THEME_FLAG.toLowerCase()] && !customTheme(THEME_FLAG)) die(`Unknown theme "${THEME_FLAG}". Use one of: ${Object.keys(THEMES).join(", ")}, or hex colors like "#e11d48" or "#e11d48,#f59e0b".`);
if (!THEME_FLAG && CONFIG.customColors && !customTheme(CONFIG.customColors)) console.error(`Warning: ignoring custom colors "${CONFIG.customColors}" (use "#rrggbb" or "#rrggbb,#rrggbb").`);
const THEME = THEME_FLAG ? resolveTheme(THEME_FLAG) : resolveTheme(CONFIG.theme, CONFIG.customColors);

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
// Live status shown on the QR page ("waiting" → "busy" → "done").
const STATUS = { state: "waiting", text: "Waiting for your phone…", files: [] };
// Folder the QR page's "Open folder" button may open (receive mode only).
let OPEN_FOLDER = null;
const setStatus = (state, text) => Object.assign(STATUS, { state, text });

// The QR page is served by a tiny server on 127.0.0.1 (never the LAN) behind a random path,
// so the page can show live status and its "Stop & close" button can end the transfer.
async function showQrPage(page) {
	const token = crypto.randomBytes(12).toString("hex");
	const base = `/${token}/`;
	const html = await renderQrPage({ ...page, controlBase: base, createdAt: new Date(), timeoutMin: Number(opt("timeout", CONFIG.timeout)), theme: THEME });
	const control = http.createServer((req, res) => {
		if (req.method === "GET" && req.url === base) return sendHtml(res, html);
		if (req.method === "GET" && req.url === `${base}status`) return json(res, 200, STATUS);
		if (req.method === "POST" && req.url === `${base}open` && OPEN_FOLDER) {
			openInBrowser(OPEN_FOLDER);
			return json(res, 200, { ok: true });
		}
		if (req.method === "POST" && req.url === `${base}stop`) {
			json(res, 200, { ok: true });
			if (STATUS.state === "done") return;
			console.log("Stopped from the QR page.");
			return setTimeout(() => process.exit(3), 200);
		}
		res.writeHead(404).end();
	});
	await new Promise((resolve) => control.listen(0, "127.0.0.1", resolve));
	const url = `http://127.0.0.1:${control.address().port}${base}`;
	if (!NO_BROWSER) openInBrowser(url);
	// When a person runs this in a terminal, also draw the QR right there.
	if (process.stdout.isTTY && !flag("no-terminal-qr")) console.log(`\n${await QRCode.toString(page.link, { type: "terminal", small: true })}`);
	console.log(`QR page: ${url}`);
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

// Stops the server after `minutes` of inactivity. It never fires while a transfer is running,
// so a multi-GB file over slow Wi-Fi isn't cut off halfway.
function startTimeout(minutes, what, onTimeout) {
	let active = 0;
	let handle;
	const arm = () => {
		clearTimeout(handle);
		handle = setTimeout(() => {
			if (onTimeout) return onTimeout();
			console.log(`Timed out after ${minutes} min without ${what}. Server stopped.`);
			process.exit(2);
		}, minutes * 60_000);
	};
	arm();
	return {
		busy() {
			active++;
			clearTimeout(handle);
		},
		idle() {
			active = Math.max(0, active - 1);
			if (!active) arm();
		},
		stop() {
			clearTimeout(handle);
		},
	};
}

// ---------- passcode ----------
// Optional passcode: the QR opens a lock screen, and only after the right code does the phone
// get a second random key that unlocks the actual transfer URL. The code itself is never in the QR.
function resolvePasscode() {
	if (flag("no-passcode")) return null;
	let value = argv.includes("--passcode") ? opt("passcode", "random") : CONFIG.passcode;
	value = String(value || "").trim();
	if (!value) return null;
	if (value.toLowerCase() === "random") value = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
	return value;
}

const MAX_ATTEMPTS = 5;
const json = (res, status, obj) => res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(obj));
const sendHtml = (res, html) => res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }).end(html);
const sameSecret = (a, b) => {
	const x = crypto.createHash("sha256").update(String(a)).digest();
	const y = crypto.createHash("sha256").update(String(b)).digest();
	return crypto.timingSafeEqual(x, y);
};

function makeGate(passcode) {
	if (!passcode) return null;
	const key = crypto.randomBytes(16).toString("hex");
	let attempts = 0;
	return {
		passcode,
		key,
		numeric: /^\d+$/.test(passcode),
		ok: (req, url) => sameSecret(url.searchParams.get("k") || req.headers["x-phone-drop-key"] || "", key),
		unlock(req, res, next) {
			let body = "";
			req.on("data", (c) => {
				body += c;
				if (body.length > 1024) req.destroy();
			});
			req.on("end", () => {
				let code = "";
				try {
					code = String(JSON.parse(body).code || "").trim();
				} catch {}
				const who = req.socket.remoteAddress;
				if (code && sameSecret(code, passcode)) {
					console.log(`Passcode accepted from ${who}`);
					setStatus("busy", "Passcode accepted");
					return json(res, 200, { next: next(key) });
				}
				const left = MAX_ATTEMPTS - ++attempts;
				if (left <= 0) {
					console.log(`Wrong passcode from ${who}. Too many wrong attempts; stopped for safety.`);
					json(res, 403, { error: "Too many wrong attempts. The transfer was stopped." });
					return setTimeout(() => process.exit(1), 300);
				}
				console.log(`Wrong passcode from ${who} (${left} attempt(s) left)`);
				json(res, 403, { error: `Wrong passcode. ${left} attempt${left === 1 ? "" : "s"} left.` });
			});
		},
	};
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
			setStatus("done", "Profile delivered. Finish the steps on your phone.");
			timer.stop();
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
		if (!caReady()) die(`Opening in ${app.name} needs HTTPS, which needs the one-time setup. Run \`phone-drop setup\` first, or pass --download.`);
		if (transport === "http") die(`Opening in ${app.name} needs HTTPS, but transport is set to http.`);
		secure = true;
	}
	if (secure && !caReady()) die("Transport is https but the one-time setup hasn't been done. Run `phone-drop setup` first.");

	const ip = pickLanIp();
	const port = Number(opt("port", secure ? "8443" : "8080"));
	const size = fs.statSync(abs).size;
	const safeName = path.basename(abs).replace(/[^A-Za-z0-9._-]+/g, "_");
	const token = crypto.randomBytes(12).toString("hex");
	const base = `/${token}/`;
	const route = `${base}${safeName}`;
	const origin = `${secure ? "https" : "http"}://${ip}:${port}`;
	const fileUrl = `${origin}${route}`;
	const gate = makeGate(resolvePasscode());
	const appName = app ? `${app.name[0].toUpperCase()}${app.name.slice(1)}` : "";
	// With a passcode the QR opens the lock screen; the real link (with the unlock key) comes after.
	const finalLink = (u) => (app ? fillTemplate(app.template, u) : u);
	const link = gate ? `${origin}${base}` : finalLink(fileUrl);
	const minutes = Number(opt("timeout", CONFIG.timeout));
	const timer = startTimeout(minutes, "a completed download");

	const handler = (req, res) => {
		const who = req.socket.remoteAddress;
		const url = new URL(req.url, "http://x");
		if (gate && req.method === "GET" && url.pathname === base) {
			console.log(`Passcode screen opened by ${who}`);
			return sendHtml(res, renderGatePage({ computer: os.hostname(), base, numeric: gate.numeric, what: app ? `opening ${safeName} in ${appName}` : `downloading ${safeName}`, theme: THEME }));
		}
		if (gate && req.method === "POST" && url.pathname === `${base}unlock`) {
			return gate.unlock(req, res, (key) => finalLink(`${fileUrl}?k=${key}`));
		}
		if (url.pathname !== route) {
			res.writeHead(404).end();
			return;
		}
		if (gate && !gate.ok(req, url)) {
			console.log(`Blocked a request from ${who} without the passcode.`);
			return res.writeHead(403).end("Passcode required");
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
		timer.busy();
		setStatus("busy", "Sending… 0%");
		const stream = fs.createReadStream(abs);
		stream.on("data", (chunk) => {
			sent += chunk.length;
			const pct = size ? Math.floor((sent / size) * 10) * 10 : 100;
			if (pct !== lastPct) {
				lastPct = pct;
				console.log(`  ${pct}% (${(sent / 1048576).toFixed(1)} / ${(size / 1048576).toFixed(1)} MB)`);
				setStatus("busy", `Sending… ${pct}%`);
			}
		});
		res.on("finish", () => {
			console.log(`Download complete: ${safeName} -> ${who}.${app ? ` ${app.name} will now import it.` : ""}`);
			setStatus("done", app ? `Sent to ${appName}` : "It's on your phone");
			timer.stop();
			setTimeout(() => process.exit(0), 3000);
		});
		res.on("close", () => {
			if (res.writableFinished) return;
			console.log(`Transfer to ${who} aborted at ${sent} bytes; waiting for a retry.`);
			setStatus("waiting", "Interrupted. Waiting for a retry…");
			timer.idle();
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
	if (gate) console.log(`Passcode: ${gate.passcode} (tell the user; it is not shown on the QR page)`);
	await showQrPage({
		title: app ? `Open in ${appName}` : "Download to your phone",
		fileName: path.basename(abs),
		link,
		passcode: !!gate,
		steps: gate ? (app ? STEPS.appWithPasscode(app.name) : STEPS.withPasscode(STEPS.download)) : app ? STEPS.app(app.name) : STEPS.download,
	});
}

// Phone → computer: serve an upload page; each file arrives as a raw PUT body.
async function receive() {
	const dest = path.resolve(opt("to", CONFIG.receiveDir));
	fs.mkdirSync(dest, { recursive: true });
	const transport = flag("https") ? "https" : flag("http") ? "http" : CONFIG.transport;
	const secure = transport === "https" || (transport === "auto" && caReady());
	if (secure && !caReady()) die("Transport is https but the one-time setup hasn't been done. Run `phone-drop setup` first.");

	const ip = pickLanIp();
	const port = Number(opt("port", secure ? "8443" : "8080"));
	const token = crypto.randomBytes(12).toString("hex");
	const base = `/${token}/`;
	const link = `${secure ? "https" : "http"}://${ip}:${port}${base}`;
	const gate = makeGate(resolvePasscode());
	const maxBytes = Number(opt("max-mb", "0")) * 1048576;
	const minutes = Number(opt("timeout", CONFIG.timeout));
	const IDLE_MS = 2 * 60_000;
	const received = [];
	let active = 0;
	let idleTimer;
	const finish = (why) => {
		console.log(`${why} Received ${received.length} file(s) into ${dest}${received.length ? ":" : "."}`);
		for (const r of received) console.log(`  ${r}`);
		setStatus("done", received.length ? `${received.length} file${received.length === 1 ? "" : "s"} received` : "Nothing received");
		// Give the QR page a moment to pick up the final status.
		setTimeout(() => process.exit(received.length ? 0 : 2), 1500);
	};
	const timer = startTimeout(minutes, "any upload", () => finish(`Timed out after ${minutes} min.`));
	const armIdle = () => {
		clearTimeout(idleTimer);
		if (received.length && !active) idleTimer = setTimeout(() => finish("No new uploads for 2 minutes."), IDLE_MS);
	};

	// Never overwrite: "photo.jpg" → "photo (1).jpg" if it exists.
	const uniquePath = (name) => {
		const clean = path.basename(name).replace(/[<>:"/\\|?*\x00-\x1f]+/g, "_").replace(/^\.+/, "").trim() || "upload";
		const { name: stem, ext } = path.parse(clean);
		let candidate = path.join(dest, clean);
		for (let i = 1; fs.existsSync(candidate); i++) candidate = path.join(dest, `${stem} (${i})${ext}`);
		return candidate;
	};

	const handler = (req, res) => {
		const who = req.socket.remoteAddress;
		const url = new URL(req.url, "http://x");
		if (req.method === "GET" && url.pathname === base) {
			if (gate && !gate.ok(req, url)) {
				console.log(`Passcode screen opened by ${who}`);
				return sendHtml(res, renderGatePage({ computer: os.hostname(), base, numeric: gate.numeric, what: "receiving files", theme: THEME }));
			}
			console.log(`Upload page opened by ${who}`);
			return sendHtml(res, renderUploadPage({ computer: os.hostname(), base, secure, key: gate ? gate.key : "", theme: THEME }));
		}
		if (gate && req.method === "POST" && url.pathname === `${base}unlock`) {
			return gate.unlock(req, res, (key) => `${base}?k=${key}`);
		}
		if (gate && url.pathname.startsWith(base) && !gate.ok(req, url)) {
			console.log(`Blocked a request from ${who} without the passcode.`);
			return res.writeHead(403).end("Passcode required");
		}
		if (req.method === "POST" && url.pathname === `${base}done`) {
			res.writeHead(200).end("ok");
			return setTimeout(() => finish("Phone tapped Done."), 500);
		}
		if (req.method === "PUT" && url.pathname === `${base}upload`) {
			const expected = Number(req.headers["content-length"] || -1);
			if (maxBytes && expected > maxBytes) return res.writeHead(413).end("too large");
			clearTimeout(idleTimer);
			active++;
			timer.busy();
			const target = uniquePath(url.searchParams.get("name") || "upload");
			setStatus("busy", `Receiving ${path.basename(target)}…`);
			const partial = `${target}.part`;
			const out = fs.createWriteStream(partial);
			let bytes = 0;
			req.on("data", (c) => {
				bytes += c.length;
				if (maxBytes && bytes > maxBytes) req.destroy();
			});
			req.pipe(out);
			const fail = () => {
				out.destroy();
				fs.rm(partial, { force: true }, () => {});
				active--;
				timer.idle();
				console.log(`Upload of ${path.basename(target)} from ${who} aborted after ${bytes} bytes.`);
				armIdle();
			};
			req.on("aborted", fail);
			out.on("finish", () => {
				if (expected >= 0 && bytes !== expected) return fail();
				fs.renameSync(partial, target);
				active--;
				received.push(target);
				console.log(`Received ${path.basename(target)} (${(bytes / 1048576).toFixed(1)} MB) from ${who}`);
				STATUS.files.push({ name: path.basename(target), size: bytes, at: new Date().toISOString() });
				setStatus("busy", `${received.length} file${received.length === 1 ? "" : "s"} received`);
				timer.idle();
				res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ saved: path.basename(target), bytes }));
				armIdle();
			});
			return;
		}
		res.writeHead(404).end();
	};
	const server = secure ? https.createServer(serverCertFor(ip), handler) : http.createServer(handler);
	server.requestTimeout = 0; // large uploads over slow Wi-Fi
	if (secure) {
		server.on("tlsClientError", (e, sock) =>
			console.log(`TLS handshake from ${sock?.remoteAddress ?? "?"} failed (${e.code || e.message}). Is the CA trusted on the phone (Certificate Trust Settings)?`),
		);
	}
	await listenOrDie(server, port, ip);
	console.log(`Waiting for uploads over ${secure ? "HTTPS" : "HTTP"}; saving to ${dest}`);
	console.log(`Link: ${link}`);
	if (gate) console.log(`Passcode: ${gate.passcode} (tell the user; it is not shown on the QR page)`);
	OPEN_FOLDER = dest;
	await showQrPage({ title: "Send files to this computer", fileName: `Saves to ${dest}`, link, passcode: !!gate, receive: true, steps: gate ? STEPS.withPasscode(STEPS.receive) : STEPS.receive });
}

function status() {
	console.log(`State dir   : ${STATE_DIR}`);
	console.log(`HTTPS setup : ${caReady() ? "done (downloads use HTTPS when transport=auto)" : "not done (downloads use HTTP; apps need `setup`)"}`);
	console.log(`Transport   : ${CONFIG.transport}`);
	console.log(`Timeout     : ${CONFIG.timeout} min`);
	console.log(`Receive to  : ${CONFIG.receiveDir}`);
	console.log(`Theme       : ${THEME_FLAG || (CONFIG.customColors && customTheme(CONFIG.customColors) ? `custom (${CONFIG.customColors})` : CONFIG.theme)}`);
	console.log(`Passcode    : ${!CONFIG.passcode ? "off" : CONFIG.passcode.toLowerCase() === "random" ? "random 6-digit code per transfer" : "fixed code (set in config)"}`);
	console.log(`LAN IP      : ${pickLanIp()}`);
	apps();
}

function apps() {
	const auto = Object.entries(CONFIG.autoOpen).map(([ext, app]) => `.${ext} → ${app}`);
	console.log(`Apps        : ${Object.entries(CONFIG.apps).map(([n, t]) => `${n} (${t})`).join(", ") || "(none)"}`);
	console.log(`Auto-open   : ${auto.join(", ") || "(none, always download)"}`);
}

function version() {
	try {
		return JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, "package.json"), "utf8")).version;
	} catch {
		return "unknown";
	}
}

const HELP = `phone-drop ${version()}: move files between your computer and your phone with a QR code.

Usage
  phone-drop <file>                 send a file to your phone (short for "send")
  phone-drop send <file>            computer → phone: scan the QR, the phone downloads it
  phone-drop receive [--to <dir>]   phone → computer: scan the QR, pick files, they upload
  phone-drop setup                  one-time HTTPS setup (encryption + open-in-app links)
  phone-drop status                 show settings, certificate and network info
  phone-drop apps                   list open-in apps and auto-open rules

Options
  --open <app|template>   open the file in an app (e.g. feather) instead of downloading
  --download              plain download, ignore auto-open rules
  --to <dir>              receive: folder to save into (default: Downloads)
  --max-mb <n>            receive: maximum size per file
  --passcode [code]       require a passcode on the phone (random 6 digits if no code given)
  --no-passcode           no passcode for this transfer
  --http | --https        force a transport (default: HTTPS once set up, otherwise HTTP)
  --ip <addr>             LAN IP to use (default: auto-detected Wi-Fi/Ethernet)
  --port <n>              port (default 8443 HTTPS, 8080 HTTP)
  --timeout <minutes>     stop after this long with nothing transferred (default 15)
  --no-browser            don't open the QR page in the browser
  --no-terminal-qr        don't draw the QR code in the terminal
  --theme <name|#hex>     page colors: ocean, violet, mint, sunset, mono, or "#e11d48[,#f59e0b]"

Settings: ${CONFIG_FILE}  (keys: transport, apps, auto_open, receive_dir, passcode, theme, custom_colors, timeout_minutes)
Docs:     https://github.com/jorranMLGN/phone-drop`;

if (flag("version") || cmd === "-v") {
	console.log(version());
	process.exit(0);
}
if (flag("help") || cmd === "-h" || cmd === "help") {
	console.log(HELP);
	process.exit(0);
}

switch (cmd) {
	case "setup":
		await setup();
		break;
	case "send":
		await send();
		break;
	case "receive":
		await receive();
		break;
	case "status":
		status();
		break;
	case "apps":
		apps();
		break;
	default:
		if (cmd) console.error(`Unknown command or file not found: ${cmd}\n`);
		console.log(HELP);
		process.exit(cmd ? 1 : 0);
}
