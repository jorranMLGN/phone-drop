// End-to-end tests: runs the real CLI on a free port and talks to it like a phone would.
//   npm test
// Needs the one-time HTTPS setup (~/.phone-drop/ca.crt) because most tests use HTTPS.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CA_FILE = path.join(os.homedir(), ".phone-drop", "ca.crt");
if (!fs.existsSync(CA_FILE)) {
	console.error("Skipping: run `phone-drop setup` first (needs ~/.phone-drop/ca.crt).");
	process.exit(0);
}
const CA = fs.readFileSync(CA_FILE);
// A port nothing else is using, so the tests don't clash with a real transfer that's running.
const TEST_PORT = await new Promise((resolve) => {
	const probe = net.createServer().listen(0, () => {
		const { port } = probe.address();
		probe.close(() => resolve(String(port)));
	});
});
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "phone-drop-test-"));
let failures = 0;
const check = (name, cond, extra = "") => {
	console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  ${extra}` : ""}`);
	if (!cond) failures++;
};

function start(args, { port = true } = {}) {
	return new Promise((resolve, reject) => {
		const p = spawn(process.execPath, [path.join(ROOT, "scripts/phone-drop.mjs"), ...args, "--no-browser", ...(port ? ["--port", TEST_PORT] : []), "--timeout", "1"]);
		let out = "";
		const exit = new Promise((r) => p.on("exit", (c) => r(c)));
		const onData = (d) => {
			out += d;
			const link = out.match(/Link: (\S+)/);
			const page = out.match(/QR page: (\S+)/);
			if (link && page && !p.started) {
				p.started = true;
				resolve({ p, exit, link: link[1], page: page[1], code: (out.match(/Passcode: (\S+)/) || [])[1], out: () => out });
			}
		};
		p.stdout.on("data", onData);
		p.stderr.on("data", onData);
		exit.then((c) => !p.started && reject(new Error(`exited ${c} before starting:\n${out}`)));
	});
}
function req(method, url, { body, headers = {} } = {}) {
	const lib = url.startsWith("https") ? https : http;
	return new Promise((resolve) => {
		const q = lib.request(url, { method, ca: CA, headers }, (r) => {
			const chunks = [];
			r.on("data", (c) => chunks.push(c));
			r.on("end", () => resolve({ status: r.statusCode, body: Buffer.concat(chunks) }));
		});
		q.on("error", (e) => resolve({ status: 0, body: Buffer.from(e.code || "err") }));
		q.end(body);
	});
}
const unlock = (base, code) => req("POST", `${base}unlock`, { body: JSON.stringify({ code }), headers: { "Content-Type": "application/json" } });
const status = async (page) => JSON.parse((await req("GET", `${page}status`)).body);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const file = path.join(TMP, "secret.bin");
fs.writeFileSync(file, crypto.randomBytes(50000));

// --- QR page control server: live status + Stop & close
let s = await start(["send", file, "--download"]);
check("control: QR page served on 127.0.0.1", s.page.startsWith("http://127.0.0.1:"), s.page);
let r = await req("GET", s.page);
check("control: page has status pill and Stop & close", r.status === 200 && /id="st"/.test(r.body) && /Stop &amp; close/.test(r.body));
check("control: status starts as waiting", (await status(s.page)).state === "waiting");
check("control: wrong token is 404", (await req("GET", s.page.replace(/\/[0-9a-f]{24}\//, "/000000000000000000000000/"))).status === 404);
r = await req("GET", s.link);
check("control: download works", r.status === 200 && r.body.equals(fs.readFileSync(file)));
let st = await status(s.page);
check("control: status is done after download", st.state === "done", JSON.stringify(st));
check("control: stop after done doesn't change exit code", (await req("POST", `${s.page}stop`)).status === 200 && (await s.exit) === 0);

s = await start(["receive", "--to", path.join(TMP, "stopme")]);
r = await req("POST", `${s.page}stop`);
check("control: Stop & close while waiting stops the server (exit 3)", r.status === 200 && (await s.exit) === 3);

// --- passcode: send (download)
s = await start(["send", file, "--download", "--passcode", "4321"]);
const base = s.link;
check("send: QR link is the lock screen, not the file", base.endsWith("/") && !base.includes("secret.bin"), base);
check("send: code printed", s.code === "4321");
check("send: file without key is blocked", (await req("GET", `${base}secret.bin`)).status === 403);
check("send: file with a made-up key is blocked", (await req("GET", `${base}secret.bin?k=deadbeef`)).status === 403);
const gatePage = await req("GET", base);
check("send: lock screen served without the code in it", gatePage.status === 200 && /Enter passcode/.test(gatePage.body) && !/4321/.test(gatePage.body));
r = await unlock(base, "0000");
check("send: wrong code rejected", r.status === 403 && /4 attempts left/.test(r.body), r.body.toString());
r = await unlock(base, "4321");
const next = JSON.parse(r.body).next;
check("send: right code returns unlocked link", r.status === 200 && /\?k=[0-9a-f]{32}$/.test(next), next);
r = await req("GET", next);
check("send: unlocked download is byte-identical", r.status === 200 && r.body.equals(fs.readFileSync(file)));
check("send: exits 0 after download", (await s.exit) === 0);

// --- passcode: app mode (Feather), random code
const ipa = path.join(TMP, "App.ipa");
fs.writeFileSync(ipa, "ipa");
s = await start(["send", ipa, "--passcode"]);
check("app: random 6-digit code", /^\d{6}$/.test(s.code || ""), s.code);
r = await unlock(s.link, s.code);
const appNext = JSON.parse(r.body).next;
check("app: next is a feather:// link with the key", /^feather:\/\/install\/https:\/\/.+\/App\.ipa\?k=[0-9a-f]{32}$/.test(appNext), appNext);
r = await req("GET", appNext.replace("feather://install/", ""));
check("app: Feather's download with the key works", r.status === 200 && r.body.toString() === "ipa");
await s.exit;

// --- passcode: brute force
s = await start(["send", file, "--download", "--passcode", "777777"]);
for (let i = 0; i < 4; i++) await unlock(s.link, "111111");
r = await unlock(s.link, "222222");
check("brute force: 5th wrong attempt stops everything", r.status === 403 && /stopped/.test(r.body), r.body.toString());
check("brute force: exits 1", (await s.exit) === 1);

// --- receive with passcode
const dest = path.join(TMP, "inbox");
s = await start(["receive", "--to", dest, "--passcode", "2468"]);
const rb = s.link;
r = await req("GET", rb);
check("receive: page without key shows the lock screen", r.status === 200 && /Enter passcode/.test(r.body) && !/Choose photos/.test(r.body));
check("receive: upload without key is blocked", (await req("PUT", `${rb}upload?name=x.txt`, { body: "x" })).status === 403);
check("receive: Done without key is blocked", (await req("POST", `${rb}done`)).status === 403);
r = await unlock(rb, "2468");
const rnext = JSON.parse(r.body).next;
const key = rnext.split("k=")[1];
r = await req("GET", new URL(rnext, rb).href);
check("receive: unlocked upload page has the key baked in", r.status === 200 && /Choose photos/.test(r.body) && r.body.includes(key));
r = await req("PUT", `${rb}upload?name=x.txt`, { body: "hello", headers: { "X-Phone-Drop-Key": key } });
check("receive: upload with key works", r.status === 200, r.body.toString());
st = await status(s.page);
check("receive: QR page status counts received files", st.state === "busy" && /1 file received/.test(st.text), JSON.stringify(st));
check("receive: QR page lists the received file", st.files.length === 1 && st.files[0].name === "x.txt" && st.files[0].size === 5 && !isNaN(Date.parse(st.files[0].at)));
r = await req("GET", s.page);
check("receive: QR page has the Received list and Open folder button", /id="flist"/.test(r.body) && /Open folder/.test(r.body));
r = await req("PUT", `${rb}upload?name=..%2F..%2Fevil.txt`, { body: "x", headers: { "X-Phone-Drop-Key": key } });
check("receive: path traversal stays in the folder", JSON.parse(r.body).saved === "evil.txt" && fs.existsSync(path.join(dest, "evil.txt")));
r = await req("PUT", `${rb}upload?name=x.txt`, { body: "again", headers: { "X-Phone-Drop-Key": key } });
check("receive: never overwrites", JSON.parse(r.body).saved === "x (1).txt");
await req("POST", `${rb}done`, { headers: { "X-Phone-Drop-Key": key } });
await sleep(700);
st = await status(s.page);
check("receive: QR page shows done before exit", st.state === "done", JSON.stringify(st));
check("receive: exit 0", (await s.exit) === 0);
check("receive: file saved", fs.readFileSync(path.join(dest, "x.txt"), "utf8") === "hello");

// --- themes
s = await start(["receive", "--to", path.join(TMP, "themed"), "--theme", "mint"]);
r = await req("GET", s.link);
check("theme: --theme mint colors the phone page", /--accent:#059669/.test(r.body) && /--accent:#34d399/.test(r.body));
r = await req("GET", s.page);
check("theme: QR page gets the accent too", /--accent:#059669/.test(r.body));
await req("POST", `${s.page}stop`);
await s.exit;
s = await start(["receive", "--to", path.join(TMP, "themed"), "--theme", "#e11d48,#f59e0b"]);
r = await req("GET", s.link);
check("theme: custom hex colors", /--accent:#e11d48/.test(r.body) && /--accent2:#f59e0b/.test(r.body));
await req("POST", `${s.page}stop`);
await s.exit;
s = await start(["receive", "--to", path.join(TMP, "themed")]);
r = await req("GET", s.link);
check("theme: default is ocean", /--accent:#2563eb/.test(r.body));
await req("POST", `${s.page}stop`);
await s.exit;

// --- ports: a busy default port falls through to a free one; an explicit --port is strict
{
	const a = await start(["receive", "--http", "--to", path.join(TMP, "pa")], { port: false });
	const b = await start(["receive", "--http", "--to", path.join(TMP, "pb")], { port: false });
	const pa = new URL(a.link).port, pb = new URL(b.link).port;
	check("ports: two transfers without --port get different ports", pa && pb && pa !== pb, `${pa} / ${pb}`);
	check("ports: the second one says which port it took", /is busy .* using \d+/.test(b.out()), b.out().split("\n")[0]);
	const strict = spawn(process.execPath, [path.join(ROOT, "scripts/phone-drop.mjs"), "receive", "--http", "--no-browser", "--to", path.join(TMP, "pc"), "--port", pa]);
	let err = "";
	strict.stderr.on("data", (d) => (err += d));
	const code = await new Promise((r) => strict.on("exit", r));
	check("ports: explicit --port on a busy port is an error", code === 1 && /in use/.test(err), err.trim());
	for (const x of [a, b]) {
		await req("POST", `${x.page}stop`);
		await x.exit;
	}
}

// --- settings via flags
{
	const x = await start(["receive", "--to", path.join(TMP, "flags"), "--name", "Test Laptop", "--qr-size", "420", "--max-mb", "1"]);
	let page = await req("GET", x.link);
	check("settings: --name is shown on the phone page", /Test Laptop/.test(page.body));
	page = await req("GET", x.page);
	check("settings: --qr-size sets the QR size", /\.qr\{[^}]*width:420px/.test(page.body));
	const big = await req("PUT", `${x.link}upload?name=big.bin`, { body: Buffer.alloc(2 * 1048576) });
	check("settings: --max-mb rejects bigger uploads", big.status === 413 || big.status === 0, String(big.status));
	await req("POST", `${x.page}stop`);
	await x.exit;
}

// --- settings via ~/.phone-drop/config.json (temporary home folder, plain HTTP)
{
	const home = path.join(TMP, "home");
	fs.mkdirSync(path.join(home, ".phone-drop"), { recursive: true });
	fs.writeFileSync(path.join(home, ".phone-drop", "config.json"), JSON.stringify({ device_name: "Config Laptop", qr_size: 200, open_browser: false, port: 18080, theme: "sunset" }));
	const env = { ...process.env, USERPROFILE: home, HOME: home, CLAUDE_CONFIG_DIR: path.join(home, ".claude") };
	const p = spawn(process.execPath, [path.join(ROOT, "scripts/phone-drop.mjs"), "receive", "--to", path.join(TMP, "cfg"), "--timeout", "1"], { env });
	let out = "";
	p.stdout.on("data", (d) => (out += d));
	for (let i = 0; i < 50 && !/QR page/.test(out); i++) await sleep(100);
	const link = (out.match(/Link: (\S+)/) || [])[1] || "";
	const qrPage = (out.match(/QR page: (\S+)/) || [])[1] || "";
	check("config.json: preferred port is used", /:1808\d\//.test(link), link);
	const up = await req("GET", link);
	check("config.json: device name and theme reach the phone page", /Config Laptop/.test(up.body) && /--accent:#ea580c/.test(up.body));
	const qp = await req("GET", qrPage);
	check("config.json: QR size", /\.qr\{[^}]*width:200px/.test(qp.body));
	await req("POST", `${qrPage}stop`);
	await new Promise((r) => p.on("exit", r));
}

// --- no passcode
s = await start(["send", file, "--download", "--no-passcode"]);
check("no passcode: QR link is the file itself", s.link.endsWith("secret.bin") && !s.code);
check("no passcode: direct download works", (await req("GET", s.link)).status === 200);
await s.exit;

fs.rmSync(TMP, { recursive: true, force: true });
console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
