/*******************************
 * api.js (SWAP) — Apps Script Bridge Mode (NO CORS)
 * Backward compatible exports:
 *  - export const API_BASE
 *  - export const API = { ping, generatePlan, suggestSwaps, generateRecipe }
 *  - export async function postJSON(action, payload)
 *
 * ✅ Set BRIDGE_URL to your Apps Script /exec?bridge=1
 *******************************/

export const BRIDGE_URL =
  "https://script.google.com/macros/s/AKfycbw_XJ2cfqwDckDu9bdHbCwpOkipeiPtRF_M60nD-QqTwGS2MxlU-wht5dmOjIBMGnj7eg/exec?bridge=1"; // <-- CHANGE THIS

// keep legacy name so existing code doesn't break
export const API_BASE = BRIDGE_URL;

const IFRAME_ID = "swapBridge";
const REQ_TYPE = "SWAP_REQ";
const RES_TYPE = "SWAP_RES";
const READY_TYPE = "SWAP_BRIDGE_READY";

// Apps Script iframes can report either of these origins
function isAllowedOrigin(origin) {
  if (typeof origin !== "string") return false;
  // Apps Script HtmlService commonly uses n-xxxx-script.googleusercontent.com
  return origin.startsWith("https://script.google.com") || origin.includes("googleusercontent.com");
}


const pending = new Map(); // id -> {resolve,reject,timeoutId}
let readyPromise = null;

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

  // IMPORTANT: don't assume document.body exists yet
  (document.body || document.documentElement).appendChild(iframe);

  return iframe;
}

function waitForBridgeReady() {
  if (readyPromise) return readyPromise;

  readyPromise = new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      window.removeEventListener("message", onMsg);
      reject(new Error("Bridge not ready (timeout). Check BRIDGE_URL / deployment access."));
    }, 12000);

    function onMsg(e) {
      if (!isAllowedOrigin(e.origin)) return;
      const m = e.data || {};
      if (m.type !== READY_TYPE) return;
      clearTimeout(t);
      window.removeEventListener("message", onMsg);
      resolve(true);
    }

    window.addEventListener("message", onMsg);
    ensureBridgeIframe();
  });

  return readyPromise;
}

// One global listener for responses
window.addEventListener("message", (e) => {
  if (!isAllowedOrigin(e.origin)) return;
  const m = e.data || {};
  if (m.type !== RES_TYPE) return;

  const id = m.id;
  const entry = pending.get(id);
  if (!entry) return;

  clearTimeout(entry.timeoutId);
  pending.delete(id);

  if (m.ok) entry.resolve(m.data);
  else entry.reject(new Error(m.error || "Bridge error"));
});

async function bridgeCall(action, payload) {
  await waitForBridgeReady();
  const iframe = ensureBridgeIframe();
  if (!iframe.contentWindow) throw new Error("Bridge iframe not available.");

  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const p = new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Bridge request timed out."));
    }, 30000);

    pending.set(id, { resolve, reject, timeoutId });
  });

  iframe.contentWindow.postMessage({ type: REQ_TYPE, id, action, payload }, "*");
  return p;
}

export async function postJSON(action, payload) {
  const data = await bridgeCall(action, payload);
  if (!data || data.ok === false) throw new Error(data?.error || "Request failed");
  return data;
}

// Legacy API object (so your app doesn't break)
export const API = {
  async ping() {
    return postJSON("ping", {});
  },
  async generatePlan(profile, targets) {
    return postJSON("plan_generate", { profile, targets });
  },
  async suggestSwaps(context) {
    return postJSON("swaps_suggest", context);
  },
  async generateRecipe(recipeReq) {
    return postJSON("recipe_generate", recipeReq);
  },
};
