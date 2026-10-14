---
name: send
description: 💻 → 📱 Send a file from this computer to the user's phone (iPhone or Android) over the local Wi-Fi with a QR code, like AirDrop. By default the phone downloads it; optionally it opens in an app such as Feather (.ipa sideloading). Use when the user asks to send, drop, push, transfer, share or install a file or app on their phone, or to open a file "in Feather" or another app. Also covers the one-time HTTPS setup.
argument-hint: "[file] [--open app]"
---

# Phone Drop

Serves one file from this computer on the local network and opens a page with a QR code in the browser. The user scans it with their phone's camera:
- **Download (default):** the phone's browser downloads the file. On iPhone it goes to Files → Downloads.
- **Open in app:** the QR holds an app link (for example `feather://install/https://…`), so the app opens and pulls the file itself.

Nothing leaves the local network. The server stops after one complete download, or when the timeout runs out.

Script: `node "${CLAUDE_PLUGIN_ROOT}/scripts/phone-drop.mjs"`

## Transport

- **No setup:** plain downloads work over HTTP straight away.
- **After the one-time `setup`:** the phone trusts a small local CA. Downloads then use HTTPS automatically, and **open-in-app links work**. Apps like Feather only accept `https://` links.

The user can change these in `/plugin configure phone-drop@phone-drop`: transport (auto/https/http), apps (`name=URL template`), auto-open by file type (default `ipa=feather`, `tipa=feather`), and the timeout. The script reads the saved values itself.

## Steps

1. **Find the file.** Resolve what the user means to an absolute path. Look in Downloads etc. if they only name it. If they gave arguments (`$ARGUMENTS`), the first one is the file.
2. **Pick the mode.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/phone-drop.mjs" status` to see the configured apps and auto-open rules.
   - The user names an app ("open in Feather") → add `--open <app>`.
   - The user says "just download it" → add `--download`. This also skips the auto-open rules.
   - Otherwise leave both off. The script applies the auto-open rules (for example, `.ipa` opens in Feather) or falls back to a plain download.
   - If an app is needed and `status` says the HTTPS setup is not done, do the setup first (step 3).
3. **One-time setup (only if needed):** run `... setup` **with `run_in_background: true`**. A QR page opens in the browser. Tell the user to scan it and follow the steps on the page: install the profile, then turn on full trust under Settings → General → About → **Certificate Trust Settings**. Wait for the background task to report "Profile delivered", and ask the user to confirm that trust is on.
4. **Send:** run `node "${CLAUDE_PLUGIN_ROOT}/scripts/phone-drop.mjs" send "<absolute path>" [--open <app> | --download]` **with `run_in_background: true`**.
5. Tell the user in one or two lines what to do: scan the QR with the camera, then either download it in the browser or tap the app banner and confirm. Also give the `Link:` the script printed.
6. When the background task finishes, report the result. `Download complete` means the phone has the whole file. For a timeout or a TLS error, see Troubleshooting.

## Passcode (optional)

If the user asks for a passcode (or one is configured), the QR opens a lock screen on the phone first. Pass `--passcode` for a random 6-digit code, or `--passcode <code>` for a specific one. `--no-passcode` overrides the config for one transfer. The script prints `Passcode: …`. **Always tell the user that code**, because it is deliberately not shown on the QR page. This also works with apps: after unlocking, the page hands off to the app.

## Notes

- The QR page (printed as `QR page: http://127.0.0.1:…`) shows live status and has a **Stop & close** button. If the user stops it there, the script exits with code 3. Tell them it was stopped, not that it failed.

## Options

`--open <app|template>` (an app name, or a raw template containing `{url}`), `--download`, `--passcode [code]`, `--no-passcode`, `--http` / `--https`, `--ip <addr>`, `--port <n>`, `--timeout <minutes>`, `--no-browser`.

## Troubleshooting

- **The app opens but nothing happens**, and the log shows `TLS handshake ... failed (CERTIFICATE_UNKNOWN)`: the CA profile is installed but not trusted. Have the user turn on Settings → General → About → **Certificate Trust Settings** → "Phone Drop Local CA". If Safari shows "This Connection Is Not Private" for the link, the cause is the same. Tapping through it in Safari does not help the app.
- **The phone can't connect / timeout**: the computer and phone must be on the same Wi-Fi (no guest network or client isolation). On Windows, allow Node.js through the firewall for **Private** networks and check that the Wi-Fi profile is Private. Use `--ip` if the auto-detected IP belongs to a VPN, WSL or Docker adapter.
- **The profile isn't listed**: Settings → General → **VPN & Device Management**. iOS deletes a downloaded profile that isn't installed within 8 minutes, so re-run `setup`.
- The CA lives in `~/.phone-drop`. Never commit or share that folder; its key could mint certificates the phone trusts.
