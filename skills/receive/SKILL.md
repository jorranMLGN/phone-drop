---
name: receive
description: 📱 → 💻 Receive files from the user's phone (iPhone or Android) onto this computer over the local Wi-Fi. Shows a QR code that opens an upload page on the phone. Use when the user wants to upload, send, copy, transfer or get photos, videos, screenshots or files from their phone to the computer/PC/laptop.
argument-hint: "[destination folder]"
---

# Phone Drop: receive

Phone → computer. Starts a one-shot server and opens a QR page in the browser. The user scans it, and the phone opens an upload page. They pick photos or files, which upload straight away onto this computer. Nothing leaves the local network.

Script: `node "${CLAUDE_PLUGIN_ROOT}/scripts/phone-drop.mjs"`

## Steps

1. **Destination.** By default files go to the configured *Receive folder* (or `~/Downloads` if none is set). If the user names a folder (or passed one as `$ARGUMENTS`), resolve it to an absolute path and pass `--to "<dir>"`.
2. **Start:** run `node "${CLAUDE_PLUGIN_ROOT}/scripts/phone-drop.mjs" receive [--to "<dir>"]` **with `run_in_background: true`**. It uses HTTPS if the one-time setup was done, otherwise HTTP (no setup needed).
3. Tell the user in one or two lines what to do: scan the QR with the camera, open the link, tap **Choose photos or files** (they upload immediately), and tap **Done** when finished. Also give the `Link:` the script printed.
4. The server stops when the phone taps **Done**, after a few minutes without new uploads (*Receive idle stop*, default 2; `--idle <min>`) (once at least one file has arrived), or at the timeout. When the background task finishes, list the received files (the script prints their full paths). If it's relevant, offer to do something with them.

## Passcode (optional)

If the user asks for a passcode (or one is configured), the phone has to enter it before it can upload. Pass `--passcode` for a random 6-digit code, or `--passcode <code>` for a specific one. `--no-passcode` overrides the config. The script prints `Passcode: …`. **Always tell the user that code**, because it is not shown on the QR page.

## Notes

- Colors: if the user asks for a look ("in green", "dark and minimal"), pass `--theme <ocean|violet|mint|sunset|mono>` or `--theme "#hex[,#hex]"`. The default comes from the *Color theme* / *Custom colors* settings.

- The QR page (printed as `QR page: http://127.0.0.1:…`) shows live status, a live **Received** list with an **Open folder** button, and a **Stop & close** button. If the user stops it there, the script exits with code 3. Tell them it was stopped, not that it failed.
- Files are never overwritten: `photo.jpg` becomes `photo (1).jpg` if a file with that name already exists. Incomplete uploads are discarded.
- `--max-mb <n>` limits the size per file. `--http` / `--https` force a transport.
- iPhone photos can arrive as `.HEIC` or `.JPG`, depending on how they were picked. If the user needs JPEG and the computer can't open HEIC, offer to convert them.
- Troubleshooting (firewall, same Wi-Fi, certificate trust) is the same as for the `send` skill.
