/*******************************
 * api.js (SWAP) — Apps Script Bridge Mode (NO CORS)
 * - Auto-injects hidden iframe pointing to Apps Script web app (?bridge=1)
 * - Uses postMessage <-> google.script.run bridge to avoid CORS entirely
 *
 * ✅ You must set BRIDGE_URL to your deployed Apps Script /exec?bridge=1
 *******************************/

export const BRIDGE_URL =
  "https://script.google.com/macros/s/AKfycbw_XJ2cfqwDckDu9bdHbCwpOkipeiPtRF_M60nD-QqTwGS2MxlU-wht5dmOjIBMGnj7eg/exec?bridge=1"; // <-- REPLACE ME

const IFRAME_ID = "swapBridge";
const REQ_TYPE = "SWAP_REQ";
const RES_TYPE = "SWAP_RES";
const READY_TYPE = "SWAP_BRIDGE_READY";

const ALLOWED_ORIGIN_MATCH = [
  "https://script.google.com",
  "https://script.googleusercontent.com",
];

let _readyPromise = null;
const _pending = new Map(); // id -> {resolve,reject,timeoutId}

/** Ensures hidden bridge iframe exists */
function ensureBridgeIframe() {
  let iframe = document.getElementById(IFRAME_ID);
  if (iframe) return iframe;

  iframe = document.createElement("iframe");
  iframe.id = IFRAME_ID;
  iframe.src = BRIDGE_URL;
  iframe.style.position = "fixed";
  iframe.style.left = "-9999px";
  iframe.style.top = "-9999px";
  iframe.style.width = "1px";
  iframe.style.height = "1px";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");

  document.body.appendChild(iframe);
  return iframe;
}

/** Origin allowlist check */
function isAllowedOrigin(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGIN_MATCH.some((o) => origin.startsWith(o));
}

/** One-time bridge ready wait */
function waitForBridgeReady() {
  if (_readyPromise) return _readyPromise;

  _readyPromise = new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      window.removeEventListener("message", onMsg);
      reject(new Error("Bridge iframe did not become ready (timeout)."));
    }, 12000);

    function onMsg(e) {
      if (!isAllowedOrigin(e.origin)) return;
      const m = e.data || {};
      if (m.type !== READY_TYPE) return;

      clearTimeout(timeoutId);
      window.removeEventListener("message", onMsg);
      resolve(true);
    }

    window.addEventListener("message", onMsg);

    // Ensure iframe exists *after* listener is attached
    ensureBridgeIframe();
  });

  return _readyPromise;
}

/** Global response listener (handles all pending requests) */
(function attachGlobalListener() {
  let attached = false;
  if (attached) return;
  attached = true;

  window.addEventListener("message", (e) => {
    if (!isAllowedOrigin(e.origin)) return;
    const m = e.data || {};
    if (m.type !== RES_TYPE) return;

    const id = m.id;
    if (!id || !_pending.has(id)) return;

    const { resolve, reject, timeoutId } = _pending.get(id);
    clearTimeout(timeoutId);
    _pending.delete(id);

    if (m.ok) resolve(m.data);
    else reject(new Error(m.error || "Bridge error"));
  });
})();

/** Core call */
async function bridgeCall(action, payload) {
  await waitForBridgeReady();

  const iframe = document.getElementById(IFRAME_ID);
  if (!iframe || !iframe.contentWindow) {
    throw new Error("Bridge iframe not available.");
  }

  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const p = new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      _pending.delete(id);
      reject(new Error("Bridge request timed out."));
    }, 30000);

    _pending.set(id, { resolve, reject, timeoutId });
  });

  iframe.contentWindow.postMessage({ type: REQ_TYPE, id, action, payload }, "*");
  return p;
}

/**
 * Main API function used by your app
 * Returns parsed JSON object from Apps Script (ex: {ok:true, plan:{...}})
 */
export async function postJSON(action, payload) {
  const data = await bridgeCall(action, payload);
  if (!data || data.ok === false) {
    throw new Error(data?.error || "Request failed");
  }
  return data;
}

/* Convenience wrappers (optional) */
export async function generatePlan(profile, targets = {}) {
  return postJSON("plan_generate", { profile, targets });
}

export async function suggestSwaps(item, profile) {
  return postJSON("swaps_suggest", { item, profile });
}

export async function generateRecipes(day, profile) {
  return postJSON("recipe_generate", { day, profile });
}
