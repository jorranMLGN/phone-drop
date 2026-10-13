// Shared branding: favicon and credits.

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5a64e8"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#g)"/><g fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><rect x="18" y="9" width="28" height="46" rx="7"/><path d="M32 20v16m-7-7 7 7 7-7"/></g></svg>`;

export const FAVICON = `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}">`;

export const AUTHOR = { name: "jorranMLGN", profile: "https://github.com/jorranMLGN", repo: "https://github.com/jorranMLGN/phone-drop" };

export const CREDITS = `<footer class="credits">Made by <a href="${AUTHOR.profile}" target="_blank" rel="noopener">${AUTHOR.name}</a> · <a href="${AUTHOR.repo}" target="_blank" rel="noopener">phone-drop on GitHub</a></footer>`;

export const CREDITS_CSS = `.credits{position:fixed;left:0;right:0;bottom:0;padding:10px 16px calc(10px + env(safe-area-inset-bottom));text-align:center;font-size:12.5px;color:var(--muted)}
.credits a{color:inherit;text-decoration:none;border-bottom:1px solid currentColor;padding-bottom:1px}
.credits a:hover{color:var(--accent)}`;
