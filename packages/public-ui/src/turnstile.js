const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** Charge le script Cloudflare Turnstile une seule fois. */
export function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${TURNSTILE_SCRIPT}"]`);
    const script = existing || Object.assign(document.createElement("script"), { src: TURNSTILE_SCRIPT, async: true, defer: true });
    script.addEventListener("load", () => resolve(window.turnstile), { once: true });
    script.addEventListener("error", () => reject(new Error("Le contrôle anti-robot n’a pas pu être chargé.")), { once: true });
    if (!existing) document.head.appendChild(script);
  });
}
