// home.js v5 — Hero + Rutas + Rankings only

let ALL_MARKERS = [];
let CAT = {};
let BRAND = {};
let rotatingIdx = 0;

const DEFAULT_ICON_URL = "https://danielramirezopisso.github.io/thebestagain/icons/default.svg";

const ROTATING_FALLBACK = [
  "Pizza Margherita",
  "Tortilla de Patatas",
  "Croqueta de Pollo",
  "Patatas Bravas",
  "Ensaladilla Rusa",
  "Cheesecake",
  "Tiramisu",
  "Bloody Mary",
  "Flan",
  "Lemon Pie",
  "Pasta Carbonara",
  "Bikini",
];

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

function iconForCategory(category_id) {
  const c = CAT[String(category_id)];
  return normalizeIconUrl(c?.icon_url || "") || DEFAULT_ICON_URL;
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

async function maybeUserLocal() {
  try { return await maybeUser(); } catch { return null; }
}

/* ══════════════════════════════
   INIT
══════════════════════════════ */
async function initHomePage() {
  await loadLookups();
  await loadMarkers();

  startHeroRotation();
  loadHeroStat();
  initHomeMap();
  loadRutasPreview();
  loadRankingsPreview();
}

async function loadLookups() {
  const [catRes, brandRes] = await Promise.all([
    sb.from("categories").select("id,name,icon_url,is_active,for_places,for_products")
      .eq("is_active", true).order("id"),
    sb.from("brands").select("id,name,icon_url,is_active").eq("is_active", true),
  ]);
  (catRes.data || []).forEach(c => { CAT[String(c.id)] = c; });
  (brandRes.data || []).forEach(b => { BRAND[String(b.id)] = b; });
}

async function loadMarkers() {
  const { data } = await sb.from("markers")
    .select("id,title,group_type,category_id,brand_id,address,rating_avg,rating_count,is_active,lat,lon,created_at")
    .eq("is_active", true);
  ALL_MARKERS = data || [];
}

/* ══════════════════════════════
   HERO ROTATION
══════════════════════════════ */
function startHeroRotation() {
  const el = document.getElementById("heroRotating");
  if (!el) return;
  // Use curated fallback list always — DB cats may include non-photogenic names
  const cats = ROTATING_FALLBACK;
  el.textContent = cats[0];
  el.classList.add("fade-in");
  setInterval(() => {
    el.classList.add("fade-out");
    el.classList.remove("fade-in");
    setTimeout(() => {
      rotatingIdx = (rotatingIdx + 1) % cats.length;
      el.textContent = cats[rotatingIdx];
      el.classList.remove("fade-out");
      el.classList.add("fade-in");
    }, 320);
  }, 2500);
}

/* ══════════════════════════════
   HERO STAT
══════════════════════════════ */
async function loadHeroStat() {
  const el = document.getElementById("heroStat");
  if (!el) return;
  const { count } = await sb.from("markers")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true).eq("group_type", "place");
  if (count) el.textContent = `${count}+ places · Barcelona & Madrid`;
}

/* ══════════════════════════════
   HOME MAP
══════════════════════════════ */
let HOME_MAP = null;

async function initHomeMap() {
  const container = document.getElementById("homeMap");
  if (!container) return;

  // Wait for layout to settle, then measure
  await new Promise(r => setTimeout(r, 100));

  const wrap = container.closest(".home-hero-map-wrap");
  const h = wrap ? wrap.getBoundingClientRect().height : 0;
  container.style.height = (h > 50 ? h : 460) + "px";

  HOME_MAP = L.map("homeMap", {
    zoomControl: false, scrollWheelZoom: false,
    dragging: false, doubleClickZoom: false,
    boxZoom: false, keyboard: false,
    touchZoom: false, attributionControl: false,
  }).setView([41.3888, 2.1589], 13);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19, attribution: "&copy; OpenStreetMap &copy; CARTO"
  }).addTo(HOME_MAP);

  // Render markers only after tiles start loading
  const places = ALL_MARKERS
    .filter(m => m.group_type === "place" && m.lat && m.lon)
    .sort((a, b) => Number(b.rating_avg ?? 0) - Number(a.rating_avg ?? 0))
    .slice(0, 80);

  places.forEach(m => {
    const icon = iconForCategory(m.category_id);
    // Monochrome on home — elegant, not a dashboard
    const leafIcon = L.divIcon({
      className: "tba-marker home-map-marker",
      html: `<div class="tba-marker-inner"><img src="${escapeHtml(icon)}" alt="" onerror="this.style.display='none'" /></div>`,
      iconSize: [28, 28], iconAnchor: [14, 14],
    });
    L.marker([m.lat, m.lon], { icon: leafIcon })
      .addTo(HOME_MAP)
      .on("click", () => { window.location.href = `marker.html?id=${encodeURIComponent(m.id)}`; });
  });

  setTimeout(() => HOME_MAP.invalidateSize(), 200);
  setTimeout(() => HOME_MAP.invalidateSize(), 800);
}

/* ══════════════════════════════
   RUTAS PREVIEW
══════════════════════════════ */
async function loadRutasPreview() {
  const host = document.getElementById("homeRutasGrid");
  if (!host) return;

  const { data: rutas } = await sb.from("rutas")
    .select("id,name,city,category_id")
    .eq("is_active", true).order("category_id").limit(3);

  if (!rutas?.length) { host.innerHTML = ""; return; }

  let myVotes = {};
  const user = await maybeUserLocal();
  if (user) {
    const { data: vd } = await sb.from("votes")
      .select("marker_id,category_id").eq("user_id", user.id).eq("is_active", true);
    (vd || []).forEach(v => { myVotes[`${v.marker_id}__${v.category_id}`] = true; });
  }

  const rutaIds = rutas.map(r => r.id);
  const { data: allItems } = await sb.from("ruta_items")
    .select("ruta_id,marker_id,markers(is_active)").in("ruta_id", rutaIds).eq("is_active", true);

  const byRuta = {};
  (allItems || []).forEach(ri => {
    if (!byRuta[ri.ruta_id]) byRuta[ri.ruta_id] = [];
    if (ri.markers?.is_active) byRuta[ri.ruta_id].push(ri.marker_id);
  });

  host.innerHTML = rutas.map(ruta => {
    const cat = CAT[String(ruta.category_id)];
    const icon = normalizeIconUrl(cat?.icon_url || "") || DEFAULT_ICON_URL;
    const items = byRuta[ruta.id] || [];
    const total = items.length || 12;
    const voted = user ? items.filter(mid => myVotes[`${mid}__${ruta.category_id}`]).length : 0;
    const pct = total ? Math.round((voted / total) * 100) : 0;
    const city = ruta.city === "BCN" ? "Barcelona" : "Madrid";
    return `
      <a class="home-ruta-card" href="rutas.html">
        <img class="home-ruta-icon" src="${escapeHtml(icon)}" alt="" />
        <div class="home-ruta-name">${escapeHtml(cat?.name || ruta.name)}</div>
        <div class="home-ruta-city">${escapeHtml(city)}</div>
        <div class="home-ruta-progress">
          <div class="home-ruta-bar"><div class="home-ruta-fill" style="width:${pct}%"></div></div>
          ${user ? `<span class="home-ruta-count">${voted}/${total}</span>` : ""}
        </div>
      </a>`;
  }).join("");
}

/* ══════════════════════════════
   RANKINGS PREVIEW
══════════════════════════════ */
async function loadRankingsPreview() {
  const host = document.getElementById("homeRankingPreview");
  if (!host) return;

  const { data: all } = await sb.from("rankings")
    .select("position,category_id,markers(id,title,rating_avg,rating_count)")
    .eq("year", 2025).eq("is_active", true).order("position");

  if (!all?.length) { host.innerHTML = ""; return; }

  // One #1 per category, up to 3
  const seenCats = new Set();
  const rows = [];
  for (const r of all) {
    if (r.position === 1 && !seenCats.has(r.category_id)) {
      seenCats.add(r.category_id);
      rows.push(r);
      if (rows.length >= 3) break;
    }
  }
  if (rows.length < 3) {
    for (const r of all) {
      if (rows.length >= 3) break;
      if (!rows.find(x => x.markers?.id === r.markers?.id)) rows.push(r);
    }
  }

  const crown = pos => pos === 1
    ? "icons/ranking/gold_crown.svg"
    : pos === 2 ? "icons/ranking/silver_crown.svg"
    : "icons/ranking/bronze_crown.svg";

  host.innerHTML = rows.map((r, i) => {
    const m = r.markers;
    const avg = Number(m?.rating_avg ?? 0);
    const cnt = Number(m?.rating_count ?? 0);
    const cls = colorClassForRating(avg, cnt);
    const score = cnt ? avg.toFixed(1) : "—";
    const cat = CAT[String(r.category_id)];
    return `
      <a class="home-rank-row" href="marker.html?id=${encodeURIComponent(m?.id)}&cat=${r.category_id}">
        <img class="home-rank-crown" src="${escapeHtml(crown(i + 1))}" alt="" />
        <div class="home-rank-info">
          <div class="home-rank-name">${escapeHtml(m?.title || "")}</div>
          <div class="home-rank-cat">${escapeHtml(cat?.name || "")}</div>
        </div>
        <span class="home-rank-score ${cls}">${escapeHtml(score)}</span>
      </a>`;
  }).join("");
}
