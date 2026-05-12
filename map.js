// map.js — Map UX v2.0 — multi-category markers + sparkle support

let MAP;
let ADD_MODE = false;
let LAST_CLICK = null;
let LAYER_GROUP;
let PREVIEW_MARKER = null;

const DEFAULT_ICON_URL = "https://danielramirezopisso.github.io/thebestagain/icons/default.svg";
const SPARKLE_ICON_URL = "https://danielramirezopisso.github.io/thebestagain/icons/sparkle.svg";
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/reverse";

const FOCUS_ID = new URLSearchParams(window.location.search).get("focus");
let DID_FOCUS = false;
let LEAFLET_MARKERS_BY_ID = {};
let MARKER_DATA_BY_ID = {};

let CATEGORIES = [];
let CAT_ICON = {};
let CAT_NAME = {};

let FILTER_CATEGORY = "";
let FILTER_RATING_BUCKET = "";
let FILTER_CHAINS = true; // true = show chains, false = hide them
let SELECTED_ID = null;
let QUICK_VOTE_VALUE = null;   // current pending quick vote in drawer
let JOURNEY_MODE = false;
let MY_VOTED_IDS = new Set();

function qs(id){ return document.getElementById(id); }
function setMapStatus(msg) { qs("mapStatus").textContent = msg || ""; }
function setSaveStatus(msg) { const el = qs("saveStatus"); if (el) el.textContent = msg || ""; }

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function normalizeIconUrl(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  try { return new URL(s, window.location.href).toString(); } catch { return ""; }
}

function getIconUrlForCategory(category_id) {
  const raw = CAT_ICON[String(category_id)] || "";
  return normalizeIconUrl(raw) || DEFAULT_ICON_URL;
}

function colorClassForRating(avg, count) {
  const cnt = Number(count ?? 0);
  if (!cnt) return "rating-none";
  const x = Number(avg ?? 0);
  if (x >= 9) return "rating-9-10";
  if (x >= 7) return "rating-7-8";
  if (x >= 5) return "rating-5-6";
  if (x >= 3) return "rating-3-4";
  return "rating-1-2";
}

function makeMarkerIcon(iconUrl, avg, count, greyed, isSparkle) {
  const cls = greyed ? "rating-none journey-unvisited" : colorClassForRating(avg, count);
  const url = isSparkle ? SPARKLE_ICON_URL : (iconUrl || DEFAULT_ICON_URL);
  const extraCls = isSparkle ? " tba-marker-sparkle" : "";
  return L.divIcon({
    className: `tba-marker ${cls}${extraCls}`,
    html: `<div class="tba-marker-inner"><img src="${escapeHtml(url)}" alt="" /></div>`,
    iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -34],
  });
}

function initRatingDropdown(selId, defaultValue) {
  const sel = qs(selId);
  sel.innerHTML = "";
  for (let i = 1; i <= 10; i++) {
    const opt = document.createElement("option");
    opt.value = String(i); opt.textContent = String(i);
    if (i === defaultValue) opt.selected = true;
    sel.appendChild(opt);
  }
}

function onChainToggleChanged() {
  FILTER_CHAINS = qs("chainToggle").checked;
  showClearIfNeeded();
  reloadMarkers();
}

function showClearIfNeeded() {
  const any = !!FILTER_CATEGORY || !!FILTER_RATING_BUCKET || !FILTER_CHAINS;
  // Update drawer clear button
  const clearBtn = document.getElementById("drawerClearBtn");
  if (clearBtn) clearBtn.style.display = any ? "inline-flex" : "none";
  // Update pill badge
  const badge = document.getElementById("filterActiveBadge");
  const pill = document.getElementById("filterPillLabel");
  if (badge && pill) {
    let count = 0;
    if (FILTER_CATEGORY) count++;
    if (FILTER_RATING_BUCKET) count++;
    if (!FILTER_CHAINS) count++;
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = "inline-flex";
      pill.textContent = "Filters";
    } else {
      badge.style.display = "none";
      pill.textContent = "Filters";
    }
  }
}

function clearFilters() {
  FILTER_CATEGORY = ""; FILTER_RATING_BUCKET = ""; FILTER_CHAINS = true;
  qs("catMore").value = "";
  const chainToggle = qs("chainToggle");
  if (chainToggle) chainToggle.checked = true;
  renderCategoryQuickChips(); setActiveRatingBtn("");
  showClearIfNeeded(); reloadMarkers();
  // Close drawer after clearing
  const drawer = document.getElementById("mapFilterDrawer");
  const overlay = document.getElementById("mapFilterOverlay");
  if (drawer) drawer.classList.remove("open");
  if (overlay) overlay.classList.remove("open");
}

function onCategoryMoreChanged() {
  const v = qs("catMore").value;
  if (!v) return;
  FILTER_CATEGORY = v;
  renderCategoryQuickChips(); showClearIfNeeded(); reloadMarkers();
}

function renderRatingButtons() {
  const host = qs("ratingSeg");
  host.innerHTML = "";
  const buttons = [
    { key:"",    label:"All" },
    { key:"7-10", label:"7+" },
    { key:"9-10", label:"9+" },
  ];
  buttons.forEach(b => {
    const btn = document.createElement("button");
    btn.className = "seg-btn"; // no rating color class — active state uses accent
    btn.dataset.key = b.key; btn.textContent = b.label;
    btn.onclick = () => {
      FILTER_RATING_BUCKET = (FILTER_RATING_BUCKET === b.key) ? "" : b.key;
      setActiveRatingBtn(FILTER_RATING_BUCKET);
      showClearIfNeeded();
      reloadMarkers();
    };
    host.appendChild(btn);
  });
  setActiveRatingBtn("");
}

function setActiveRatingBtn(key) {
  [...document.querySelectorAll(".seg-btn")].forEach(el => el.classList.toggle("active", el.dataset.key === key));
}

function renderCategoryQuickChips() {
  const host = qs("catQuick");
  host.innerHTML = "";
  const top4 = CATEGORIES.slice(0, 4);
  top4.forEach(c => {
    const a = document.createElement("a");
    a.href = "#"; a.className = "chip";
    a.onclick = (e) => {
      e.preventDefault();
      FILTER_CATEGORY = (FILTER_CATEGORY === String(c.id)) ? "" : String(c.id);
      qs("catMore").value = FILTER_CATEGORY ? FILTER_CATEGORY : "";
      renderCategoryQuickChips(); showClearIfNeeded(); reloadMarkers();
    };
    if (FILTER_CATEGORY === String(c.id)) a.classList.add("active");
    const icon = getIconUrlForCategory(c.id);
    a.innerHTML = `<img class="chip-ic" src="${escapeHtml(icon)}" alt=""/> <span>${escapeHtml(c.name)}</span>`;
    host.appendChild(a);
  });
  const all = document.createElement("a");
  all.href = "#"; all.className = "chip chip-more"; all.textContent = "All";
  all.onclick = (e) => { e.preventDefault(); FILTER_CATEGORY = ""; qs("catMore").value = ""; renderCategoryQuickChips(); showClearIfNeeded(); reloadMarkers(); };
  if (!FILTER_CATEGORY) all.classList.add("active");
  host.appendChild(all);
}

async function reverseGeocodeAddress(lat, lon) {
  const url = `${NOMINATIM_BASE}?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1`;
  const res = await fetch(url, { headers: { "Accept": "application/json", "Referer": window.location.origin } });
  if (!res.ok) throw new Error(`Geocode failed: ${res.status}`);
  const json = await res.json();
  return json.display_name || "";
}

async function toggleAddMode() {
  const user = await maybeUser();
  if (!user) { alert("Please login to add places."); window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.href); return; }
  ADD_MODE = !ADD_MODE;
  const btn = qs("toggleAdd");
  if (ADD_MODE) { btn.textContent = "✕ Stop adding"; btn.classList.add("tba-btn-danger"); btn.classList.remove("tba-btn-primary"); }
  else { btn.textContent = "＋ Start adding"; btn.classList.remove("tba-btn-danger"); btn.classList.add("tba-btn-primary"); }
  qs("addForm").style.display = ADD_MODE ? "block" : "none";
  setSaveStatus("");
  if (!ADD_MODE) { LAST_CLICK = null; if (PREVIEW_MARKER) { MAP.removeLayer(PREVIEW_MARKER); PREVIEW_MARKER = null; } }
}

function tryFocusMarker() {
  if (!FOCUS_ID || DID_FOCUS) return;
  const mk = LEAFLET_MARKERS_BY_ID[FOCUS_ID];
  if (!mk) return;
  DID_FOCUS = true;
  selectMarkerById(FOCUS_ID, true);
}

function applyRatingBucket(q) {
  if (!FILTER_RATING_BUCKET) return q;
  if (FILTER_RATING_BUCKET === "7-10") return q.gte("rating_avg", 7);
  if (FILTER_RATING_BUCKET === "9-10") return q.gte("rating_avg", 9);
  const [a, b] = FILTER_RATING_BUCKET.split("-").map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return q;
  return q.gte("rating_avg", a).lte("rating_avg", b);
}

function fmtOverall(avg, cnt) {
  const c = Number(cnt ?? 0);
  if (!c) return "—/10 (0 votes)";
  return `${Number(avg ?? 0).toFixed(2)}/10 (${c} vote${c === 1 ? "" : "s"})`;
}

/* ── SELECTED PANEL ── */
function clearSelection() {
  SELECTED_ID = null;
  qs("selPanel").style.display = "none";
}

function renderSelCategoryChips(m, activeCatId) {
  let chipsEl = qs("selCatChips");
  if (!chipsEl) {
    chipsEl = document.createElement("div");
    chipsEl.id = "selCatChips";
    chipsEl.className = "sel-cat-chips";
    const selSub = qs("selSub");
    if (selSub && selSub.parentNode) selSub.parentNode.insertBefore(chipsEl, selSub.nextSibling);
  }
  const allCatIds = [m.category_id, ...(m.extra_categories || [])].filter(Boolean);
  const uniqueCatIds = [...new Set(allCatIds)];
  if (uniqueCatIds.length <= 1) { chipsEl.innerHTML = ""; chipsEl.style.display = "none"; return; }
  chipsEl.style.display = "flex";
  chipsEl.innerHTML = uniqueCatIds.map(catId => {
    const isActive = catId === activeCatId;
    const iconUrl = getIconUrlForCategory(catId);
    const catName = CAT_NAME[String(catId)] || "";
    // Use per-category rating if available, fall back to overall
    const catRating = m.cat_ratings?.[catId] || {};
    const colorCls = colorClassForRating(catRating.avg ?? m.rating_avg, catRating.count ?? m.rating_count);
    return `<button class="sel-cat-chip ${colorCls}${isActive ? " sel-cat-chip-active" : ""}" title="${escapeHtml(catName)}" onclick="switchSelCategory('${escapeHtml(m.id)}',${catId})"><img src="${escapeHtml(iconUrl)}" alt="${escapeHtml(catName)}" /></button>`;
  }).join("");
}

function switchSelCategory(markerId, catId) {
  const m = MARKER_DATA_BY_ID[markerId];
  if (!m) return;
  const catRating = m.cat_ratings?.[catId] || {};
  const avg = Number(catRating.avg ?? m.rating_avg ?? 0);
  const cnt = Number(catRating.count ?? m.rating_count ?? 0);
  const cls = colorClassForRating(avg, cnt);
  qs("selIcon").className = `mini-marker ${cls}`;
  qs("selIcon").innerHTML = `<img src="${escapeHtml(getIconUrlForCategory(catId))}" alt="" />`;
  qs("selSub").textContent = CAT_NAME[String(catId)] || "";
  qs("selMeta").textContent = `Rating: ${fmtOverall(avg, cnt)}`;
  qs("selOpen").href = `marker.html?id=${encodeURIComponent(markerId)}&cat=${encodeURIComponent(catId)}`;
  renderSelCategoryChips(m, catId);
  initQuickVote(markerId, catId);
}

function selectMarkerById(id, fly = false) {
  const mk = LEAFLET_MARKERS_BY_ID[id];
  const m = MARKER_DATA_BY_ID[id];
  if (!mk || !m) return;
  SELECTED_ID = id;
  const activeCatId = FILTER_CATEGORY ? parseInt(FILTER_CATEGORY) : m.category_id;
  const avg = Number(m.rating_avg ?? 0);
  const cnt = Number(m.rating_count ?? 0);
  const cls = colorClassForRating(avg, cnt);
  const isMultiCat = m.extra_categories && m.extra_categories.length > 0;
  const showSparkleInPanel = isMultiCat && !FILTER_CATEGORY;
  const iconUrl = showSparkleInPanel ? SPARKLE_ICON_URL : getIconUrlForCategory(activeCatId || m.category_id);
  qs("selIcon").className = `mini-marker ${cls}`;
  qs("selIcon").innerHTML = `<img src="${escapeHtml(iconUrl)}" alt="" />`;
  qs("selTitle").textContent = m.title || "—";
  // Show per-category rating if available, fall back to overall
  const activeCatRating = m.cat_ratings?.[activeCatId || m.category_id] || {};
  const dispAvg = activeCatRating.avg ?? m.rating_avg;
  const dispCnt = activeCatRating.count ?? m.rating_count;
  qs("selMeta").textContent = `Rating: ${fmtOverall(dispAvg, dispCnt)}`;
  qs("selSub").textContent = CAT_NAME[String(activeCatId || m.category_id)] || "";
  renderSelCategoryChips(m, activeCatId);
  const catParam = activeCatId ? `&cat=${encodeURIComponent(activeCatId)}` : "";
  qs("selOpen").href = `marker.html?id=${encodeURIComponent(m.id)}${catParam}`;
  const selPhoto = qs("selPhoto");
  const selPhotoImg = qs("selPhotoImg");
  selPhoto.style.display = "none";
  sb.from("marker_photos").select("storage_path").eq("marker_id", m.id).eq("is_active", true)
    .order("created_at", { ascending: true }).limit(1)
    .then(({ data }) => {
      if (data && data.length) {
        selPhotoImg.src = `${SUPABASE_URL}/storage/v1/object/public/marker-photos/${data[0].storage_path}`;
        selPhoto.style.display = "block";
      }
    });
  qs("selPanel").style.display = "block";
  const wlSlot = qs("selWlBtn");
  if (wlSlot) wlSlot.innerHTML = wlBtnHtml(m.id);
  if (fly) MAP.flyTo(mk.getLatLng(), Math.max(MAP.getZoom(), 17), { duration: 0.8 });

  // Init quick vote for this marker+category
  initQuickVote(m.id, activeCatId || m.category_id);
}

function attachMarkerHoverAndClick(mk, id) {
  mk.on("mouseover", () => { const el = mk.getElement(); if (el) el.classList.add("tba-hover"); });
  mk.on("mouseout",  () => { const el = mk.getElement(); if (el) el.classList.remove("tba-hover"); });
  mk.on("click", () => selectMarkerById(id, false));
}

async function initMap() {
  // Read URL params (e.g. from marker page "See all" link)
  const _mapQp = new URLSearchParams(location.search);
  const _catParam = _mapQp.get('category');
  const user = await maybeUser();
  // On desktop: show add panel always, but redirect to login if not logged in
  // On mobile: panel is hidden via CSS, hint button shown instead
  if (!user) {
    // Replace the start-adding button with a login prompt version
    const toggleBtn = qs("toggleAdd");
    if (toggleBtn) {
      toggleBtn.textContent = "＋ Start adding";
      toggleBtn.onclick = () => {
        alert("Please log in to add places.");
        window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.href);
      };
    }
  }
  wlInit();
  updateJourneyToggleUI();
  if (user) await refreshMyVotes(user.id);
  initRatingDropdown("m_rating", 7);
  renderRatingButtons();
  MAP = L.map("map", { zoomControl: false }).setView([41.3889, 2.1618], 15);
  L.control.zoom({ position: "topright" }).addTo(MAP);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap &copy; CARTO" }).addTo(MAP);
  LAYER_GROUP = L.layerGroup().addTo(MAP);
  setMapStatus("Loading categories…");

  const { data: catData, error: catErr } = await sb.from("categories")
    .select("id,name,icon_url,is_active,for_places").eq("is_active", true).eq("for_places", true).order("id", { ascending: true });
  if (catErr) { setMapStatus("Error loading categories: " + catErr.message); return; }
  CATEGORIES = catData || [];
  CAT_ICON = {}; CAT_NAME = {};
  CATEGORIES.forEach(c => { CAT_ICON[String(c.id)] = String(c.icon_url ?? "").trim(); CAT_NAME[String(c.id)] = c.name; });
  qs("m_category").innerHTML = CATEGORIES.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("");
  qs("catMore").innerHTML = `<option value="">More…</option>` + CATEGORIES.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("");

  // Sort by usage via marker_categories
  const { data: placeCats, error: cntErr } = await sb.from("marker_categories")
    .select("category_id, markers!inner(is_active, group_type)")
    .eq("markers.is_active", true).eq("markers.group_type", "place");
  if (!cntErr && placeCats) {
    const counts = {};
    placeCats.forEach(r => { const k = String(r.category_id ?? ""); if (!k) return; counts[k] = (counts[k] || 0) + 1; });
    CATEGORIES.sort((a, b) => (counts[String(b.id)] || 0) - (counts[String(a.id)] || 0));
  }

  renderCategoryQuickChips(); showClearIfNeeded();
  await reloadMarkers();
  // Apply category filter from URL param (after initial load)
  if (typeof _catParam !== 'undefined' && _catParam) {
    FILTER_CATEGORY = _catParam;
    if (typeof renderCategoryQuickChips === 'function') renderCategoryQuickChips();
    if (typeof showClearIfNeeded === 'function') showClearIfNeeded();
    await reloadMarkers();
  }

  MAP.on("click", async (e) => {
    const user = await maybeUser();
    if (!user || !ADD_MODE) return;
    LAST_CLICK = { lat: e.latlng.lat, lon: e.latlng.lng };
    qs("m_lat").value = LAST_CLICK.lat.toFixed(6);
    qs("m_lon").value = LAST_CLICK.lon.toFixed(6);
    if (PREVIEW_MARKER) PREVIEW_MARKER.setLatLng([LAST_CLICK.lat, LAST_CLICK.lon]);
    else PREVIEW_MARKER = L.marker([LAST_CLICK.lat, LAST_CLICK.lon], { opacity: 0.7 }).addTo(MAP).bindPopup("New place location").openPopup();
    qs("m_address").value = "";
    setSaveStatus("Location selected ✅ Looking up address…");
    try { const addr = await reverseGeocodeAddress(LAST_CLICK.lat, LAST_CLICK.lon); qs("m_address").value = addr; setSaveStatus("Address filled ✅ Now click Save."); }
    catch { setSaveStatus("Address lookup failed (you can type it manually)."); }
  });
}

function showDesktopHint() {
  let toast = document.getElementById("desktopHintToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "desktopHintToast";
    toast.style.cssText = "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);" +
      "background:#333;color:#fff;padding:10px 18px;border-radius:20px;" +
      "font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.3);" +
      "white-space:nowrap;text-align:center;max-width:280px;white-space:normal;line-height:1.4;";
    toast.textContent = "💻 Adding places works best on desktop — open thebestagain.com on your computer!";
    document.body.appendChild(toast);
  }
  toast.style.display = "block";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.style.display = "none"; }, 4000);
}

/* ── JOURNEY MODE ── */
async function refreshMyVotes(userId) {
  if (!userId) return;
  const { data } = await sb.from("votes").select("marker_id,vote,category_id").eq("user_id", userId).eq("is_active", true);
  MY_VOTED_IDS = new Set((data || []).map(v => v.marker_id));
  // Store personal scores for journey mode colors
  window.MY_VOTE_SCORES_MAP = {};
  (data || []).forEach(v => { window.MY_VOTE_SCORES_MAP[v.marker_id] = v.vote; });
}

function showJourneyLoginPrompt() {
  let el = document.getElementById("journeyLoginToast");
  if (!el) {
    el = document.createElement("div"); el.id = "journeyLoginToast";
    el.style.cssText = "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--accent,#e0355b);color:#fff;padding:10px 18px;border-radius:20px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.25);cursor:pointer;white-space:nowrap;";
    el.innerHTML = "🔑 Log in to track My Journey &nbsp;→";
    el.onclick = () => window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.href);
    document.body.appendChild(el);
  }
  el.style.display = "block"; clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.display = "none"; }, 3500);
}

function updateJourneyToggleUI() {
  const d = document.getElementById("jOptDiscover");
  const j = document.getElementById("jOptJourney");
  if (!d || !j) return;
  d.classList.toggle("journey-opt-active", !JOURNEY_MODE);
  j.classList.toggle("journey-opt-active", JOURNEY_MODE);
}

async function toggleJourneyMode() {
  const user = await maybeUser();
  if (!user) { showJourneyLoginPrompt(); return; }
  JOURNEY_MODE = !JOURNEY_MODE;
  updateJourneyToggleUI();
  reloadMarkers();
}

async function reloadMarkers() {
  setMapStatus("Loading places…");

  let markerIds = null;
  if (FILTER_CATEGORY) {
    const { data: mcData, error: mcErr } = await sb.from("marker_categories")
      .select("marker_id").eq("category_id", parseInt(FILTER_CATEGORY)).eq("is_active", true);
    if (mcErr) { setMapStatus("Error: " + mcErr.message); return; }
    markerIds = (mcData || []).map(r => r.marker_id);
    if (!markerIds.length) {
      LAYER_GROUP.clearLayers(); LEAFLET_MARKERS_BY_ID = {}; MARKER_DATA_BY_ID = {};
      setMapStatus("No places found."); return;
    }
  }

  let q = sb.from("markers").select("id,title,rating_avg,rating_count,lat,lon,group_type,is_active,category_id,chain_id")
    .eq("is_active", true).eq("group_type", "place");
  if (markerIds) q = q.in("id", markerIds);
  q = applyRatingBucket(q);

  const { data, error } = await q;
  if (error) { setMapStatus("Error: " + error.message); return; }

  // Apply chain filter client-side
  const markers = (data || []).filter(m =>
    m.lat !== null && m.lon !== null &&
    (FILTER_CHAINS || !m.chain_id)
  );

  // Fetch all category assignments + per-category ratings
  let extraCatsMap = {};   // marker_id -> [category_id, ...]
  let primaryCatMap = {};  // marker_id -> category_id (primary)
  let catRatingMap = {};   // marker_id -> { category_id -> {avg, count} }
  if (markers.length) {
    const ids = markers.map(m => m.id);
    const { data: mcAll } = await sb.from("marker_categories")
      .select("marker_id,category_id,is_primary,rating_avg,rating_count")
      .in("marker_id", ids).eq("is_active", true);
    (mcAll || []).forEach(r => {
      if (!extraCatsMap[r.marker_id]) extraCatsMap[r.marker_id] = [];
      extraCatsMap[r.marker_id].push(r.category_id);
      if (r.is_primary) primaryCatMap[r.marker_id] = r.category_id;
      if (!catRatingMap[r.marker_id]) catRatingMap[r.marker_id] = {};
      catRatingMap[r.marker_id][r.category_id] = {
        avg: r.rating_avg,
        count: r.rating_count ?? 0
      };
    });
  }

  LAYER_GROUP.clearLayers(); LEAFLET_MARKERS_BY_ID = {}; MARKER_DATA_BY_ID = {};

  markers.forEach(m => {
    const allCats = extraCatsMap[m.id] || [m.category_id];
    const uniqueCats = [...new Set(allCats)];
    m.extra_categories = uniqueCats.filter(cid => cid !== m.category_id);
    m.primary_category_id = primaryCatMap[m.id] || m.category_id;
    m.cat_ratings = catRatingMap[m.id] || {}; // per-category ratings
    const isMultiCat = uniqueCats.length > 1;
    const useSparkle = isMultiCat && !FILTER_CATEGORY;

    const iconUrl = FILTER_CATEGORY
      ? getIconUrlForCategory(parseInt(FILTER_CATEGORY))
      : getIconUrlForCategory(m.primary_category_id);

    // Sparkle color = primary category rating
    const primaryRating = m.cat_ratings[m.primary_category_id] || {};
    const avg = Number(primaryRating.avg ?? m.rating_avg ?? 0);
    const cnt = Number(primaryRating.count ?? m.rating_count ?? 0);
    const greyed = JOURNEY_MODE && !MY_VOTED_IDS.has(m.id);
    const displayAvg = (JOURNEY_MODE && window.MY_VOTE_SCORES_MAP?.[m.id])
      ? Number(window.MY_VOTE_SCORES_MAP[m.id]) : avg;
    const icon = makeMarkerIcon(iconUrl, displayAvg, cnt, greyed, useSparkle);
    const mk = L.marker([m.lat, m.lon], { icon }).addTo(LAYER_GROUP);
    LEAFLET_MARKERS_BY_ID[m.id] = mk;
    MARKER_DATA_BY_ID[m.id] = m;
    attachMarkerHoverAndClick(mk, m.id);
  });

  setMapStatus(`Loaded ${markers.length} place(s).`);
  tryFocusMarker();
}

async function saveMapMarker() {
  const user = await maybeUser();
  if (!user) { alert("Please login to add places."); window.location.href="login.html"; return; }
  setSaveStatus("Saving…");
  const title = qs("m_title").value.trim();
  const category_id = parseInt(qs("m_category").value);
  const rating_manual = Number(qs("m_rating").value);
  const address = (qs("m_address")?.value || "").trim();
  if (!ADD_MODE) { setSaveStatus("Turn Add ON first."); return; }
  if (!LAST_CLICK) { setSaveStatus("Click the map first to pick a location."); return; }
  if (!title) { setSaveStatus("Title required."); return; }

  const { data: markerRow, error: mErr } = await sb.from("markers")
    .insert([{ title, category_id, rating_manual, group_type: "place", is_active: true, lat: LAST_CLICK.lat, lon: LAST_CLICK.lon, address }])
    .select("id").single();
  if (mErr) { setSaveStatus("Error creating place: " + mErr.message); return; }

  // Insert into marker_categories (primary)
  await sb.from("marker_categories").insert([{ marker_id: markerRow.id, category_id, is_primary: true, is_active: true }]);

  const { error: vErr } = await sb.from("votes")
    .insert([{ marker_id: markerRow.id, user_id: user.id, vote: rating_manual, category_id, is_active: true }]);

  if (vErr) { setSaveStatus("Place saved ✅ but vote failed: " + vErr.message); }
  window.location.href = `marker.html?id=${encodeURIComponent(markerRow.id)}&cat=${category_id}`;
}

/* ── QUICK VOTE IN DRAWER ── */
let QUICK_VOTE_OPEN = false;

async function initQuickVote(markerId, catId) {
  QUICK_VOTE_VALUE = null;
  QUICK_VOTE_OPEN = false;
  const el = qs("selVoteWrap");
  if (!el) return;

  const user = await maybeUser();
  if (!user) {
    el.innerHTML = `<button class="sel-vote-chip" onclick="softLoginNudge('Sign in to vote and track your scores.')">⭐ Vote</button>`;
    return;
  }

  // Load existing vote for this marker+category
  let q = sb.from("votes").select("id,vote,is_active")
    .eq("marker_id", markerId).eq("user_id", user.id);
  if (catId) q = q.eq("category_id", catId);
  const { data: existing } = await q.maybeSingle();

  if (existing?.is_active) QUICK_VOTE_VALUE = Number(existing.vote);

  renderQuickVoteChip(markerId, catId);
}

function renderQuickVoteChip(markerId, catId) {
  const el = qs("selVoteWrap");
  if (!el) return;

  const hasVote = QUICK_VOTE_VALUE !== null;
  const chipLabel = hasVote ? `★ My vote: ${QUICK_VOTE_VALUE}` : `★ Vote`;
  const chipCls = hasVote ? "sel-vote-chip sel-vote-chip-voted" : "sel-vote-chip";

  const btns = QUICK_VOTE_OPEN
    ? `<div class="sel-vote-btns">${Array.from({ length: 10 }, (_, i) => i + 1).map(i => {
        const sel = QUICK_VOTE_VALUE === i;
        return `<button class="sel-vote-btn${sel ? " sel-vote-selected" : ""}" onclick="selectQuickVote(${i},'${markerId}',${catId || "null"})">${i}</button>`;
      }).join("")}</div>`
    : "";

  el.innerHTML = `
    <button class="${chipCls}" onclick="toggleQuickVote('${markerId}',${catId || "null"})">${escapeHtml(chipLabel)}</button>
    ${btns}
  `;
}

function toggleQuickVote(markerId, catId) {
  QUICK_VOTE_OPEN = !QUICK_VOTE_OPEN;
  renderQuickVoteChip(markerId, catId);
}

async function selectQuickVote(value, markerId, catId) {
  const allowed = await softLoginNudge("Sign in to vote and track your scores across all your favourite spots.");
  if (!allowed) return;
  const user = await maybeUser();

  QUICK_VOTE_VALUE = value;
  QUICK_VOTE_OPEN = false;
  renderQuickVoteChip(markerId, catId);

  // Show saving state on the chip
  const chip = qs("selVoteWrap")?.querySelector(".sel-vote-chip");
  if (chip) chip.textContent = "Saving…";

  const payload = { marker_id: markerId, user_id: user.id, vote: value, is_active: true };
  if (catId) payload.category_id = catId;

  const { error } = await sb.from("votes").upsert(
    [payload],
    { onConflict: catId ? "marker_id,category_id,user_id" : "marker_id,user_id" }
  );

  if (error) {
    if (chip) chip.textContent = "Error ❌";
  } else {
    MY_VOTED_IDS.add(markerId);
    renderQuickVoteChip(markerId, catId); // re-render with saved value
  }
}

/* ── LOCATION SEARCH ── */
let searchDebounce = null, searchResults = [], searchActive = -1;

function onMapSearchInput() {
  const val = document.getElementById('mapSearchInput').value.trim();
  document.getElementById('mapSearchClear').style.display = val ? 'flex' : 'none';
  clearTimeout(searchDebounce);
  if (!val) { hideSearchResults(); return; }
  searchDebounce = setTimeout(() => nominatimSearch(val), 350);
}

async function nominatimSearch(q) {
  const res = document.getElementById('mapSearchResults');
  res.style.display = 'block';
  res.innerHTML = '<div class="map-search-loading">Searching…</div>';
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6&addressdetails=1`;
    const r = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await r.json();
    searchResults = data; searchActive = -1;
    if (!data.length) { res.innerHTML = '<div class="map-search-empty">No results found.</div>'; return; }
    res.innerHTML = data.map((d, i) => {
      const parts = (d.display_name || '').split(', ');
      return `<div class="map-search-result" data-idx="${i}" onmousedown="selectSearchResult(${i})" onmouseover="highlightResult(${i})"><span class="map-sr-main">${escapeHtml(parts[0])}</span>${parts.slice(1,3).join(', ') ? `<span class="map-sr-sub">${escapeHtml(parts.slice(1,3).join(', '))}</span>` : ''}</div>`;
    }).join('');
  } catch(e) { res.innerHTML = '<div class="map-search-empty">Search unavailable.</div>'; }
}

function highlightResult(idx) {
  searchActive = idx;
  document.querySelectorAll('.map-search-result').forEach((el, i) => el.classList.toggle('active', i === idx));
}

function selectSearchResult(idx) {
  const d = searchResults[idx]; if (!d) return;
  if (d.boundingbox) { const [s,n,w,e] = d.boundingbox.map(Number); MAP.fitBounds([[s,w],[n,e]], { maxZoom:17, padding:[30,30] }); }
  else MAP.setView([parseFloat(d.lat), parseFloat(d.lon)], 16);
  if (window._searchPin) window._searchPin.remove();
  window._searchPin = L.marker([parseFloat(d.lat), parseFloat(d.lon)], { icon: L.divIcon({ className:'', html:`<div class="search-pin">📍</div>`, iconSize:[32,32], iconAnchor:[16,32] }) }).addTo(MAP);
  document.getElementById('mapSearchInput').value = d.display_name.split(', ').slice(0,2).join(', ');
  hideSearchResults();
}

function onMapSearchKey(e) {
  const items = document.querySelectorAll('.map-search-result'); if (!items.length) return;
  if (e.key==='ArrowDown') { e.preventDefault(); highlightResult(Math.min(searchActive+1, items.length-1)); }
  else if (e.key==='ArrowUp') { e.preventDefault(); highlightResult(Math.max(searchActive-1, 0)); }
  else if (e.key==='Enter') { e.preventDefault(); if (searchActive>=0) selectSearchResult(searchActive); else if (searchResults.length) selectSearchResult(0); }
  else if (e.key==='Escape') clearMapSearch();
}

function clearMapSearch() {
  document.getElementById('mapSearchInput').value = '';
  document.getElementById('mapSearchClear').style.display = 'none';
  hideSearchResults();
  if (window._searchPin) { window._searchPin.remove(); window._searchPin = null; }
}

function hideSearchResults() {
  const res = document.getElementById('mapSearchResults');
  if (res) res.style.display = 'none';
  searchResults = []; searchActive = -1;
}

document.addEventListener('click', e => {
  if (!document.getElementById('mapSearchWrap')?.contains(e.target)) hideSearchResults();
});

/* ── Geolocation — "locate me" ── */
let USER_LOCATION_MARKER = null;
let USER_ACCURACY_CIRCLE = null;

function locateMe() {
  const btn = document.getElementById('mapLocateBtn');
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser.');
    return;
  }
  // Show loading state
  if (btn) { btn.textContent = '⟳'; btn.classList.add('locating'); }

  navigator.geolocation.getCurrentPosition(
    function(pos) {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = pos.coords.accuracy; // metres

      // Fly to position
      MAP.flyTo([lat, lng], 15, { duration: 1.2 });

      // Remove previous markers
      if (USER_LOCATION_MARKER) MAP.removeLayer(USER_LOCATION_MARKER);
      if (USER_ACCURACY_CIRCLE) MAP.removeLayer(USER_ACCURACY_CIRCLE);

      // Accuracy circle
      USER_ACCURACY_CIRCLE = L.circle([lat, lng], {
        radius: acc,
        color: '#2d4a8a', fillColor: '#2d4a8a',
        fillOpacity: 0.08, weight: 1, opacity: 0.3
      }).addTo(MAP);

      // Pulsing dot marker
      const icon = L.divIcon({
        className: '',
        html: '<div class="user-location-dot"><div class="user-location-pulse"></div></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });
      USER_LOCATION_MARKER = L.marker([lat, lng], { icon, zIndexOffset: 1000 })
        .addTo(MAP)
        .bindPopup('You are here');

      // Reset button
      if (btn) { btn.textContent = '📍'; btn.classList.remove('locating'); btn.classList.add('located'); }
    },
    function(err) {
      if (btn) { btn.textContent = '📍'; btn.classList.remove('locating'); }
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (err.code === err.PERMISSION_DENIED) {
        if (isIOS) {
          alert('Location access denied.\n\nTo fix on iPhone:\nSettings → Privacy & Security → Location Services → Safari → While Using App');
        } else {
          alert('Location access denied. Tap the lock icon in your browser bar and allow location access.');
        }
      } else if (err.code === err.POSITION_UNAVAILABLE) {
        alert('Your location could not be determined. Make sure Location Services is enabled.');
      } else if (err.code === err.TIMEOUT) {
        alert('Location request timed out. Please try again.');
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
}
