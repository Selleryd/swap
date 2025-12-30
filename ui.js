// ui.js — SWAP UI Layer (calendar + swaps + recipes)
// NOTE: app.js imports these named exports. If any are missing, the whole app goes blank.

const UI_VERSION = "ui-3.2.0";

const GROUP_COLORS = {
  protein: "#22c55e",
  carb: "#8b5cf6",
  fat: "#ef4444",
  fruit: "#3b82f6",
  vegetable: "#14b8a6",
  free: "#0ea5e9",
  other: "#64748b",
};

function ensureInjectedStyles() {
  if (document.getElementById("swap-ui-injected-styles")) return;
  const style = document.createElement("style");
  style.id = "swap-ui-injected-styles";
  style.textContent = `
/* ===== SWAP UI Injected Styles (${UI_VERSION}) ===== */
:root{
  --swap-bg: #f6f7fb;
  --swap-card: rgba(255,255,255,.82);
  --swap-border: rgba(15,23,42,.10);
  --swap-text: #0f172a;
  --swap-muted: rgba(15,23,42,.65);
  --swap-shadow: 0 18px 50px rgba(2,6,23,.10);
  --swap-radius: 22px;
  --swap-radius-sm: 14px;
  --swap-gap: 14px;
  --swap-font: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
}

.swap-shell{
  font-family: var(--swap-font);
  color: var(--swap-text);
}

.swap-shell .swap-layout{
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 18px;
  min-height: 100vh;
  padding: 18px;
  background: radial-gradient(1200px 500px at 20% -10%, rgba(139,92,246,.18), transparent 55%),
              radial-gradient(1200px 500px at 80% 0%, rgba(34,197,94,.14), transparent 55%),
              var(--swap-bg);
}

@media (max-width: 980px){
  .swap-shell .swap-layout{ grid-template-columns: 1fr; padding: 10px; }
}

.swap-card{
  background: var(--swap-card);
  border: 1px solid var(--swap-border);
  border-radius: var(--swap-radius);
  box-shadow: var(--swap-shadow);
  backdrop-filter: blur(10px);
}

.swap-sidebar{
  padding: 14px;
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  gap: 12px;
}

.swap-brand{
  display:flex; align-items:center; gap: 12px;
  padding: 8px 10px;
}
.swap-logo{
  width: 44px; height: 44px; border-radius: 14px;
  background: rgba(255,255,255,.9);
  border: 1px solid var(--swap-border);
  display:flex; align-items:center; justify-content:center;
  overflow:hidden;
}
.swap-brand h1{ font-size: 16px; margin:0; line-height:1.1; font-weight: 800; }
.swap-brand p{ margin:2px 0 0 0; font-size: 12px; color: var(--swap-muted); font-weight: 600; }

.swap-nav{
  display:grid;
  gap: 10px;
  padding: 8px 6px;
}
.swap-nav button{
  width:100%;
  padding: 12px 12px;
  border-radius: 14px;
  border: 1px solid var(--swap-border);
  background: rgba(255,255,255,.7);
  font-weight: 800;
  cursor:pointer;
  text-align:left;
  transition: transform .08s ease, background .12s ease;
}
.swap-nav button:hover{ transform: translateY(-1px); background: rgba(255,255,255,.92); }
.swap-nav button.is-active{
  background: rgba(139,92,246,.12);
  border-color: rgba(139,92,246,.28);
}

.swap-status{
  padding: 12px;
  border-radius: 16px;
  border: 1px dashed rgba(15,23,42,.16);
  background: rgba(255,255,255,.55);
}
.swap-status .line1{
  font-weight: 800;
  font-size: 12px;
  color: rgba(15,23,42,.7);
}
.swap-status .line2{
  font-weight: 900;
  font-size: 13px;
  margin-top: 6px;
}

.swap-status .actions{
  display:flex;
  gap:10px;
  margin-top: 10px;
}
.swap-btn{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 999px;
  border: 1px solid var(--swap-border);
  background: rgba(255,255,255,.85);
  font-weight: 900;
  cursor:pointer;
}
.swap-btn.primary{
  border-color: rgba(139,92,246,.25);
  background: linear-gradient(135deg, rgba(139,92,246,.95), rgba(34,197,94,.90));
  color: white;
}
.swap-btn:disabled{ opacity:.6; cursor:not-allowed; }

.swap-main{
  display:grid;
  grid-template-rows: auto 1fr;
  gap: 12px;
}

.swap-topbar{
  padding: 10px 14px;
  display:flex;
  align-items:center;
  justify-content:space-between;
}
.swap-topbar .title{
  font-weight: 900;
  font-size: 14px;
  padding: 10px 14px;
  border-radius: 16px;
  border: 1px solid var(--swap-border);
  background: rgba(255,255,255,.65);
}
.swap-topbar .stats{
  font-weight: 900;
  font-size: 13px;
  color: rgba(15,23,42,.75);
  padding: 10px 12px;
  border-radius: 999px;
  border: 1px solid var(--swap-border);
  background: rgba(255,255,255,.65);
}

.swap-pages{
  padding: 0;
  overflow: hidden;
}

.swap-page{
  display:none;
  padding: 14px;
}
.swap-page.is-active{ display:block; }

.swap-section-title{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap: 12px;
}
.swap-section-title h2{
  margin: 0;
  font-size: 26px;
  letter-spacing:-.02em;
}
.swap-section-title .sub{
  margin-top: 2px;
  font-weight: 800;
  color: rgba(15,23,42,.55);
}

.swap-controls{
  display:flex;
  gap: 10px;
  align-items:center;
  justify-content:flex-end;
}

.swap-legend{
  display:flex;
  gap: 12px;
  align-items:center;
  margin: 10px 0 12px;
  color: rgba(15,23,42,.70);
  font-weight: 800;
  font-size: 12px;
}
.swap-dot{ width: 9px; height: 9px; border-radius: 50%; display:inline-block; margin-right:6px; }

.swap-plan-layout{
  display:grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 14px;
  align-items:start;
}
@media (max-width: 1100px){
  .swap-plan-layout{ grid-template-columns: 1fr; }
}

.swap-calendar-card{
  padding: 12px;
  border-radius: var(--swap-radius);
}
.swap-calendar{
  display:grid;
  grid-template-columns: repeat(7, minmax(170px, 1fr));
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 4px;
}
@media (max-width: 980px){
  .swap-calendar{
    grid-template-columns: 1fr;
    overflow-x: visible;
  }
}

.swap-day{
  border: 1px solid rgba(15,23,42,.10);
  background: rgba(255,255,255,.70);
  border-radius: 18px;
  padding: 10px;
  min-height: 520px;
  display:flex;
  flex-direction:column;
}
.swap-day .day-head{
  display:flex;
  align-items:baseline;
  justify-content:space-between;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(15,23,42,.08);
  margin-bottom: 8px;
}
.swap-day .dow{
  font-weight: 950;
  font-size: 15px;
}
.swap-day .date{
  font-weight: 900;
  font-size: 12px;
  color: rgba(15,23,42,.55);
}

.swap-meal{
  margin-bottom: 10px;
}
.swap-meal .meal-name{
  font-weight: 950;
  font-size: 12px;
  letter-spacing:.05em;
  text-transform: uppercase;
  color: rgba(15,23,42,.62);
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap: 10px;
  margin-bottom: 6px;
}
.swap-items{
  display:grid;
  gap: 6px;
}

.swap-food{
  width:100%;
  border: 1px solid rgba(15,23,42,.10);
  background: rgba(255,255,255,.92);
  border-radius: 14px;
  padding: 8px 9px;
  text-align:left;
  cursor:pointer;
  transition: transform .08s ease, box-shadow .10s ease, border-color .10s ease;
  display:grid;
  grid-template-columns: 10px 1fr auto;
  gap: 10px;
  align-items:center;
}
.swap-food:hover{
  transform: translateY(-1px);
  box-shadow: 0 10px 26px rgba(2,6,23,.10);
  border-color: rgba(139,92,246,.25);
}
.swap-food .gdot{
  width: 9px; height: 9px; border-radius: 999px;
  background: rgba(100,116,139,.7);
}
.swap-food .name{
  font-weight: 900;
  font-size: 12px;
  line-height: 1.2;
  display:-webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow:hidden;
}
.swap-food .meta{
  font-weight: 900;
  font-size: 11px;
  color: rgba(15,23,42,.55);
  white-space:nowrap;
}

.swap-side{
  padding: 12px;
  border-radius: var(--swap-radius);
}
.swap-side h3{
  margin: 0;
  font-size: 18px;
  font-weight: 950;
}
.swap-side .hint{
  margin-top: 2px;
  font-weight: 800;
  color: rgba(15,23,42,.60);
  font-size: 12px;
}
.swap-panel{
  margin-top: 10px;
  border-top: 1px solid rgba(15,23,42,.08);
  padding-top: 10px;
}
.swap-selected{
  border: 1px dashed rgba(15,23,42,.16);
  border-radius: 16px;
  background: rgba(255,255,255,.68);
  padding: 10px;
}
.swap-selected .t{
  font-weight: 950;
  font-size: 13px;
}
.swap-selected .s{
  font-weight: 900;
  font-size: 12px;
  color: rgba(15,23,42,.60);
  margin-top: 6px;
}

.swap-results{
  margin-top: 10px;
  display:grid;
  gap: 8px;
}
.swap-result{
  border: 1px solid rgba(15,23,42,.10);
  background: rgba(255,255,255,.90);
  border-radius: 16px;
  padding: 10px;
  display:grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items:center;
}
.swap-result .n{
  font-weight: 950;
  font-size: 12px;
  line-height: 1.2;
}
.swap-result .m{
  margin-top: 6px;
  font-weight: 900;
  font-size: 11px;
  color: rgba(15,23,42,.60);
}
.swap-result button{
  padding: 10px 12px;
  border-radius: 999px;
  border: 1px solid rgba(139,92,246,.25);
  background: rgba(139,92,246,.10);
  font-weight: 950;
  cursor:pointer;
}
.swap-result button:hover{
  background: rgba(139,92,246,.16);
}

.swap-freefoods{
  margin-top: 12px;
  border-top: 1px solid rgba(15,23,42,.08);
  padding-top: 10px;
}
.swap-freefoods .title{
  font-weight: 950;
  font-size: 12px;
  color: rgba(15,23,42,.70);
  margin-bottom: 8px;
}
.swap-chips{
  display:flex;
  flex-wrap:wrap;
  gap: 8px;
}
.swap-chip{
  border: 1px solid rgba(59,130,246,.22);
  background: rgba(59,130,246,.10);
  color: rgba(30,64,175,.95);
  font-weight: 950;
  font-size: 11px;
  padding: 7px 10px;
  border-radius: 999px;
}

/* Recipes */
.swap-recipes{
  display:grid;
  gap: 10px;
  margin-top: 12px;
}
.swap-day-accordion{
  border: 1px solid rgba(15,23,42,.10);
  border-radius: 18px;
  background: rgba(255,255,255,.70);
  overflow:hidden;
}
.swap-day-accordion summary{
  cursor:pointer;
  list-style:none;
  padding: 12px 12px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap: 12px;
  font-weight: 950;
}
.swap-day-accordion summary::-webkit-details-marker{ display:none; }
.swap-day-accordion .meta{
  font-weight: 900;
  color: rgba(15,23,42,.55);
  font-size: 12px;
}
.swap-recipe-body{
  padding: 0 12px 12px 12px;
  display:grid;
  gap: 10px;
}
.swap-recipe-card{
  border: 1px solid rgba(15,23,42,.10);
  border-radius: 16px;
  background: rgba(255,255,255,.92);
  padding: 10px;
}
.swap-recipe-card .hdr{
  display:flex;
  align-items:baseline;
  justify-content:space-between;
  gap: 10px;
}
.swap-recipe-card .meal{
  font-weight: 950;
  font-size: 12px;
  letter-spacing:.06em;
  text-transform: uppercase;
  color: rgba(15,23,42,.65);
}
.swap-recipe-card .name{
  font-weight: 950;
  font-size: 14px;
  margin-top: 6px;
}
.swap-recipe-card .small{
  margin-top: 6px;
  font-weight: 850;
  font-size: 12px;
  color: rgba(15,23,42,.60);
}
.swap-recipe-card details{
  margin-top: 8px;
}
.swap-recipe-card details summary{
  cursor:pointer;
  font-weight: 950;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid rgba(15,23,42,.10);
  background: rgba(255,255,255,.75);
  display:inline-flex;
}
.swap-recipe-card .content{
  margin-top: 8px;
  color: rgba(15,23,42,.78);
  font-weight: 800;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
}

/* Splash */
.swap-splash{
  min-height: 100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  padding: 18px;
  background: radial-gradient(1200px 600px at 50% -10%, rgba(139,92,246,.22), transparent 60%),
              radial-gradient(1000px 500px at 20% 0%, rgba(34,197,94,.18), transparent 60%),
              var(--swap-bg);
}
.swap-splash .box{
  width:min(980px, 100%);
  padding: 18px;
  border-radius: 28px;
}
.swap-splash .inner{
  padding: 20px;
  border-radius: 22px;
}
.swap-splash h2{
  margin: 0;
  font-size: 36px;
  letter-spacing:-.03em;
}
.swap-splash p{
  margin: 10px 0 0 0;
  color: rgba(15,23,42,.65);
  font-weight: 850;
}
.swap-splash .cta{
  margin-top: 16px;
}
`;
  document.head.appendChild(style);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function safeDate(d) {
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  } catch {
    return null;
  }
}

function dayNameShort(dateStr) {
  const dt = safeDate(dateStr);
  if (!dt) return "";
  return dt.toLocaleDateString(undefined, { weekday: "long" });
}

function dateShort(dateStr) {
  const dt = safeDate(dateStr);
  if (!dt) return "";
  return dt.toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "numeric" });
}

function normalizePlan(input) {
  if (!input) return null;
  const plan = input.plan ? input.plan : input;
  if (!plan) return null;

  const days = Array.isArray(plan.days) ? plan.days : [];
  const weekStart = plan.weekStart || (days[0]?.date ?? "");
  const totals = plan.totals || plan.targets || null;

  return { ...plan, weekStart, days, totals };
}

function normalizeRecipes(input) {
  if (!input) return null;
  const r = input.recipes ? input.recipes : input;

  // Accept many shapes:
  // 1) { days:[{date, meals:{breakfast:{title, ...}}}] }
  // 2) { "2025-12-27": { breakfast:{...}, lunch:{...} } }
  // 3) [ {date, ...} ]
  // 4) string/markdown

  if (typeof r === "string") return { kind: "text", text: r };

  if (Array.isArray(r)) return { kind: "daysArray", days: r };

  if (r && Array.isArray(r.days)) return { kind: "daysArray", days: r.days };

  if (r && typeof r === "object") return { kind: "byDate", byDate: r };

  return null;
}

function getRoot() {
  return document.getElementById("app") || document.body;
}

function q(id) {
  return document.getElementById(id);
}

/* =========================
   Templates
========================= */

const TEMPLATES = {
  tplSplash: `
    <div class="swap-splash">
      <div class="swap-card box">
        <div class="swap-card inner">
          <div class="swap-brand" style="padding:0; margin-bottom:14px;">
            <div class="swap-logo" aria-hidden="true">
              <span style="font-weight:950; font-size:13px;">SWAP</span>
            </div>
            <div>
              <h1>SWAP</h1>
              <p>Switch With Any Portion</p>
            </div>
          </div>

          <h2>Build a week plan you can actually follow.</h2>
          <p>Generate a structured weekly plan. Click any item to swap with an equivalent option (same subgroup first), keeping calories and macros within your allowed margin.</p>

          <div class="cta">
            <button class="swap-btn primary" data-action="go-intake">Enter now</button>
          </div>
        </div>
      </div>
    </div>
  `,

  tplShell: `
    <div class="swap-shell">
      <div class="swap-layout">
        <!-- Sidebar -->
        <aside class="swap-card swap-sidebar">
          <div class="swap-brand">
            <div class="swap-logo">
              <span style="font-weight:950; font-size:13px;">SWAP</span>
            </div>
            <div>
              <h1>SWAP</h1>
              <p>Switch With Any Portion</p>
            </div>
          </div>

          <nav class="swap-nav" aria-label="Primary">
            <button class="is-active" data-action="tab-plan" data-tab="plan">Meal Plan</button>
            <button data-action="tab-recipes" data-tab="recipes">Recipes</button>
            <button data-action="tab-profile" data-tab="profile">Profile</button>
          </nav>

          <div></div>

          <div class="swap-status">
            <div class="line1" id="statusHint">Status</div>
            <div class="line2" id="statusText">Ready</div>
            <div class="actions">
              <button class="swap-btn" data-action="reset">Reset</button>
            </div>
          </div>
        </aside>

        <!-- Main -->
        <main class="swap-main">
          <header class="swap-card swap-topbar">
            <div class="title" id="topbarTitle">Meal Plan</div>
            <div class="stats" id="topbarStats">—</div>
          </header>

          <section class="swap-card swap-pages">
            <!-- Plan -->
            <div class="swap-page is-active" id="page-plan" data-page="plan">
              <div class="swap-section-title">
                <div>
                  <h2>Week Plan</h2>
                  <div class="sub" id="weekLabel">—</div>
                </div>
                <div class="swap-controls">
                  <button class="swap-btn primary" data-action="generate-plan">Generate</button>
                  <button class="swap-btn" data-action="regenerate-plan">Regenerate</button>
                </div>
              </div>

              <div class="swap-legend" aria-label="Legend">
                <span><span class="swap-dot" style="background:${GROUP_COLORS.carb}"></span>Carbs</span>
                <span><span class="swap-dot" style="background:${GROUP_COLORS.protein}"></span>Protein</span>
                <span><span class="swap-dot" style="background:${GROUP_COLORS.fat}"></span>Fat</span>
                <span><span class="swap-dot" style="background:${GROUP_COLORS.fruit}"></span>Free foods</span>
              </div>

              <div class="swap-plan-layout">
                <div class="swap-card swap-calendar-card">
                  <div class="swap-calendar" id="calendar"></div>
                </div>

                <aside class="swap-card swap-side">
                  <h3>Swaps</h3>
                  <div class="hint">Click a food item to see equivalent swaps.</div>

                  <div class="swap-panel">
                    <div class="swap-selected" id="swapsHeader"></div>
                    <div class="swap-results" id="swapsList"></div>

                    <div class="swap-freefoods">
                      <div class="title">Free Foods (extra hunger)</div>
                      <div class="swap-chips" id="freeFoods"></div>
                    </div>
                  </div>
                </aside>
              </div>
            </div>

            <!-- Recipes -->
            <div class="swap-page" id="page-recipes" data-page="recipes">
              <div class="swap-section-title">
                <div>
                  <h2>Recipes</h2>
                  <div class="sub">Recipes generate when you request them. They’re stored (in your browser) so you don’t lose them.</div>
                </div>
                <div class="swap-controls">
                  <button class="swap-btn primary" data-action="generate-recipes">Generate recipes for this week</button>
                </div>
              </div>

              <div class="swap-recipes" id="recipesList"></div>
            </div>

            <!-- Profile -->
            <div class="swap-page" id="page-profile" data-page="profile">
              <div class="swap-section-title">
                <div>
                  <h2>Profile</h2>
                  <div class="sub">Update your intake and targets.</div>
                </div>
              </div>
              <div style="padding:14px; color: rgba(15,23,42,.65); font-weight:850;">
                Profile UI is handled by your existing app logic. (This template just provides the stable container.)
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  `,
};

/* =========================
   Exported API (what app.js imports)
========================= */

export function mountTemplate(rootEl, templateId) {
  ensureInjectedStyles();

  const root = rootEl || getRoot();

  // Support existing <template id="..."> in index.html if present
  const tplNode = document.getElementById(templateId);
  if (tplNode && tplNode.content) {
    root.replaceChildren(tplNode.content.cloneNode(true));
    return;
  }

  const html = TEMPLATES[templateId];
  if (!html) {
    root.innerHTML = `<div style="padding:18px;font-family:${UI_VERSION};">
      <b>UI Error:</b> Missing template <code>${templateId}</code>
    </div>`;
    return;
  }

  root.innerHTML = html;

  // Initialize swaps header default state to avoid empty weirdness
  renderSwapsHeader(null);
}

export function setStatus(text, mode = "normal") {
  const hint = q("statusHint");
  const node = q("statusText");
  if (!node) return;

  if (hint) {
    hint.textContent = mode === "error" ? "Error" : mode === "working" ? "Working" : "Status";
  }
  node.textContent = text || "Ready";
}

export function setTopbar(titleOrObj, maybeStatsObj) {
  const titleNode = q("topbarTitle");
  const statsNode = q("topbarStats");

  let title = "Meal Plan";
  let stats = null;

  if (typeof titleOrObj === "string") {
    title = titleOrObj;
    stats = maybeStatsObj || null;
  } else if (titleOrObj && typeof titleOrObj === "object") {
    title = titleOrObj.title || title;
    stats = titleOrObj.stats || titleOrObj;
  }

  if (titleNode) titleNode.textContent = title;

  // stats: {kcalPerDay, proteinPerDay} or {kcal, protein}
  if (statsNode) {
    const kcal = stats?.kcalPerDay ?? stats?.kcal ?? stats?.calories ?? null;
    const protein = stats?.proteinPerDay ?? stats?.protein ?? stats?.protein_g ?? null;

    if (kcal || protein) {
      const kcalTxt = kcal ? `${Math.round(Number(kcal))} kcal/day` : "";
      const pTxt = protein ? `≥${Math.round(Number(protein))}g protein/day` : "";
      statsNode.textContent = [kcalTxt, pTxt].filter(Boolean).join(" • ");
    } else {
      statsNode.textContent = "—";
    }
  }
}

export function renderCalendar(planInput) {
  const plan = normalizePlan(planInput);
  const cal = q("calendar");
  const weekLabel = q("weekLabel");
  if (!cal) return;

  cal.innerHTML = "";

  if (!plan || !Array.isArray(plan.days) || plan.days.length === 0) {
    cal.appendChild(el("div", "", "No plan yet. Click Generate."));
    if (weekLabel) weekLabel.textContent = "—";
    return;
  }

  // Week label
  if (weekLabel) weekLabel.textContent = `Week of ${dateShort(plan.weekStart || plan.days[0]?.date)}`;

  const frag = document.createDocumentFragment();

  for (const day of plan.days) {
    const col = el("div", "swap-day");
    const head = el("div", "day-head");
    head.appendChild(el("div", "dow", dayNameShort(day.date) || "Day"));
    head.appendChild(el("div", "date", dateShort(day.date) || ""));
    col.appendChild(head);

    const meals = Array.isArray(day.meals) ? day.meals : [];
    for (const meal of meals) {
      const mealWrap = el("div", "swap-meal");
      const mealName = el("div", "meal-name", meal.label || meal.key || "Meal");
      mealWrap.appendChild(mealName);

      const itemsWrap = el("div", "swap-items");
      const items = Array.isArray(meal.items) ? meal.items : [];

      if (items.length === 0) {
        const empty = el("div", "");
        empty.style.color = "rgba(15,23,42,.45)";
        empty.style.fontWeight = "850";
        empty.style.fontSize = "12px";
        empty.textContent = "—";
        itemsWrap.appendChild(empty);
      } else {
        for (const item of items) {
          const btn = el("button", "swap-food");
          btn.type = "button";

          // Robust dataset so your existing app.js handler can pick up whatever it expects.
          // (We include multiple aliases: id/foodId, portion/grams, group/subgroup, etc.)
          btn.dataset.action = "pick-food";
          btn.dataset.pick = "food";
          btn.dataset.id = item.id ?? "";
          btn.dataset.foodId = item.id ?? "";
          btn.dataset.name = item.name ?? "";
          btn.dataset.group = item.group ?? "";
          btn.dataset.subgroup = item.subgroup ?? "";
          btn.dataset.grams = String(item.grams ?? item.portion_g ?? item.portion ?? "");
          btn.dataset.portion = String(item.portion ?? item.grams ?? "");
          btn.dataset.calories = String(item.calories ?? "");
          btn.dataset.protein = String(item.protein_g ?? "");
          btn.dataset.carbs = String(item.carbs_g ?? "");
          btn.dataset.fat = String(item.fat_g ?? "");
          btn.dataset.day = day.date ?? "";
          btn.dataset.meal = meal.key ?? meal.label ?? "";

          btn.title = item.name || "Select food";

          const dot = el("span", "gdot");
          const g = (item.group || "other").toLowerCase();
          dot.style.background = GROUP_COLORS[g] || GROUP_COLORS.other;

          const name = el("div", "name", item.name || "Food item");
          const meta = el(
            "div",
            "meta",
            (item.grams ?? item.portion_g)
              ? `${Math.round(Number(item.grams ?? item.portion_g))}g`
              : item.portion
                ? `${item.portion}`
                : ""
          );

          btn.appendChild(dot);
          btn.appendChild(name);
          btn.appendChild(meta);

          itemsWrap.appendChild(btn);
        }
      }

      mealWrap.appendChild(itemsWrap);
      col.appendChild(mealWrap);
    }

    frag.appendChild(col);
  }

  cal.appendChild(frag);
}

export function renderSwapsHeader(selectedFood) {
  const box = q("swapsHeader");
  if (!box) return;

  box.innerHTML = "";

  if (!selectedFood) {
    const t = el("div", "t", "Select a food");
    const s = el(
      "div",
      "s",
      "We’ll show equivalent swaps in the same subgroup first (fruit→fruit, grain→grain), then allowed alternates."
    );
    box.appendChild(t);
    box.appendChild(s);
    return;
  }

  const name = selectedFood.name || selectedFood.foodName || selectedFood.title || "Selected food";
  const grams = selectedFood.grams ?? selectedFood.portion_g ?? selectedFood.portion ?? "";
  const cal = selectedFood.calories ?? selectedFood.kcal ?? "";

  const t = el("div", "t", name);
  const s = el(
    "div",
    "s",
    [
      grams ? `Portion: ${Math.round(Number(grams))}g` : null,
      cal ? `Calories: ${Math.round(Number(cal))}` : null,
      selectedFood.group ? `Group: ${selectedFood.group}` : null,
      selectedFood.subgroup ? `Subgroup: ${selectedFood.subgroup}` : null,
    ]
      .filter(Boolean)
      .join(" • ")
  );

  box.appendChild(t);
  box.appendChild(s);
}

export function renderSwapResults(swapsInput, selectedFood) {
  const list = q("swapsList");
  if (!list) return;

  list.innerHTML = "";

  const swaps =
    swapsInput?.swaps && Array.isArray(swapsInput.swaps)
      ? swapsInput.swaps
      : Array.isArray(swapsInput)
        ? swapsInput
        : [];

  if (!swaps.length) {
    const empty = el("div", "");
    empty.style.color = "rgba(15,23,42,.55)";
    empty.style.fontWeight = "900";
    empty.style.fontSize = "12px";
    empty.textContent = "No swaps yet. Click a food item first.";
    list.appendChild(empty);
    return;
  }

  for (const cand of swaps) {
    const row = el("div", "swap-result");

    const left = el("div", "");
    const n = el("div", "n", cand.name || "Swap option");

    // Optional macro/fit line if available
    const parts = [];
    const grams = cand.grams ?? cand.portion_g ?? cand.portion ?? null;
    const cal = cand.calories ?? cand.kcal ?? null;

    if (grams) parts.push(`${Math.round(Number(grams))}g`);
    if (cal) parts.push(`${Math.round(Number(cal))} kcal`);

    // If API gives deltas, show them
    if (cand.delta && typeof cand.delta === "object") {
      const dc = cand.delta.caloriesPct ?? cand.delta.kcalPct ?? null;
      if (dc !== null && dc !== undefined) parts.push(`Δ kcal ${Number(dc).toFixed(1)}%`);
    }

    const m = el("div", "m", parts.join(" • "));

    left.appendChild(n);
    if (parts.length) left.appendChild(m);

    const btn = el("button", "", "Use");
    btn.type = "button";

    // Dataset for app.js to apply swap (we include aliases for safety)
    btn.dataset.action = "apply-swap";
    btn.dataset.newId = cand.id ?? "";
    btn.dataset.id = cand.id ?? "";
    btn.dataset.newFoodId = cand.id ?? "";
    btn.dataset.newName = cand.name ?? "";
    btn.dataset.newGrams = String(grams ?? "");
    btn.dataset.newCalories = String(cal ?? "");

    if (selectedFood) {
      btn.dataset.oldId = selectedFood.id ?? selectedFood.foodId ?? "";
      btn.dataset.oldFoodId = selectedFood.id ?? selectedFood.foodId ?? "";
      btn.dataset.day = selectedFood.day ?? "";
      btn.dataset.meal = selectedFood.meal ?? "";
    }

    row.appendChild(left);
    row.appendChild(btn);

    list.appendChild(row);
  }
}

export function renderFreeFoods(items) {
  const wrap = q("freeFoods");
  if (!wrap) return;

  wrap.innerHTML = "";

  const list =
    Array.isArray(items) ? items : Array.isArray(items?.freeFoods) ? items.freeFoods : [];

  if (!list.length) {
    // Keep it empty — UI already shows section title.
    return;
  }

  for (const name of list) {
    const chip = el("span", "swap-chip", String(name));
    wrap.appendChild(chip);
  }
}

export function renderRecipes(recipesInput, weekPlanInput) {
  const list = q("recipesList");
  if (!list) return;

  list.innerHTML = "";

  const plan = normalizePlan(weekPlanInput);
  const normalized = normalizeRecipes(recipesInput);

  // If nothing passed, show placeholder
  if (!normalized) {
    const msg = el("div", "");
    msg.style.color = "rgba(15,23,42,.65)";
    msg.style.fontWeight = "900";
    msg.textContent = plan
      ? "Recipes will appear here after generation."
      : "Generate a meal plan first, then generate recipes.";
    list.appendChild(msg);
    return;
  }

  if (normalized.kind === "text") {
    const card = el("div", "swap-recipe-card");
    card.appendChild(el("div", "name", "Recipes"));
    const content = el("div", "content", normalized.text);
    card.appendChild(content);
    list.appendChild(card);
    return;
  }

  // Build per-day structure
  let days = [];

  if (normalized.kind === "daysArray") {
    days = normalized.days || [];
  } else if (normalized.kind === "byDate") {
    const entries = Object.entries(normalized.byDate || {}).sort(([a], [b]) => (a < b ? -1 : 1));
    days = entries.map(([date, meals]) => ({ date, meals }));
  }

  // If recipes are keyed but plan exists, align order to plan.days
  if (plan?.days?.length) {
    const map = new Map(days.map((d) => [d.date, d]));
    days = plan.days.map((pd) => map.get(pd.date) || { date: pd.date, meals: {} });
  }

  for (const day of days) {
    const details = document.createElement("details");
    details.className = "swap-day-accordion";
    details.open = false;

    const sum = document.createElement("summary");
    const left = el("div", "", dayNameShort(day.date) || "Day");
    const right = el("div", "meta", dateShort(day.date) || "");
    sum.appendChild(left);
    sum.appendChild(right);
    details.appendChild(sum);

    const body = el("div", "swap-recipe-body");

    // meals can be object or array
    const mealsObj = day.meals || {};
    const mealEntries = Array.isArray(mealsObj)
      ? mealsObj.map((m) => [m.key || m.meal || m.label, m])
      : Object.entries(mealsObj);

    if (!mealEntries.length) {
      const empty = el("div", "");
      empty.style.color = "rgba(15,23,42,.55)";
      empty.style.fontWeight = "900";
      empty.textContent = "No recipes yet for this day.";
      body.appendChild(empty);
    } else {
      for (const [mealKey, rec] of mealEntries) {
        const card = el("div", "swap-recipe-card");

        const hdr = el("div", "hdr");
        hdr.appendChild(el("div", "meal", (mealKey || "Meal").toString()));
        card.appendChild(hdr);

        const title =
          rec?.title || rec?.name || rec?.recipe || rec?.headline || "Recipe";
        card.appendChild(el("div", "name", title));

        // Build a short excerpt (ingredients line 1–2 or description)
        const excerpt =
          rec?.excerpt ||
          rec?.description ||
          (Array.isArray(rec?.ingredients) ? rec.ingredients.slice(0, 3).join(", ") : "") ||
          "";
        if (excerpt) card.appendChild(el("div", "small", excerpt));

        const more = document.createElement("details");
        const moreSum = document.createElement("summary");
        moreSum.textContent = "Expand";
        more.appendChild(moreSum);

        const contentParts = [];

        if (Array.isArray(rec?.ingredients) && rec.ingredients.length) {
          contentParts.push("Ingredients:\n" + rec.ingredients.map((x) => `• ${x}`).join("\n"));
        }
        if (Array.isArray(rec?.steps) && rec.steps.length) {
          contentParts.push("Steps:\n" + rec.steps.map((x, i) => `${i + 1}. ${x}`).join("\n"));
        }
        if (typeof rec?.content === "string" && rec.content.trim()) {
          contentParts.push(rec.content.trim());
        }
        if (typeof rec === "string" && rec.trim()) {
          contentParts.push(rec.trim());
        }

        const content = el("div", "content", contentParts.join("\n\n") || "No details available.");
        more.appendChild(content);
        card.appendChild(more);

        body.appendChild(card);
      }
    }

    details.appendChild(body);
    list.appendChild(details);
  }
}
