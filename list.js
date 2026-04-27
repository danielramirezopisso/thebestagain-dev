// list.js v3 — sortable columns, category chips, rating filter, search, type toggle

let ALL_MARKERS = [];   // raw from DB
let CATEGORIES = [];
let CAT_BY_ID = {};
let BRAND_BY_ID = {};

// Active filters
let FILTER_TYPE = "";       // "" | "place" | "product"
let FILTER_CATEGORY = "";   // "" | category id (integer)
let FILTER_BUCKET = "";     // "" | "9-10" | "7-8" etc.
let FILTER_SEARCH = "";
let FILTER_CHAINS = true; // true = show chains, false = hide chains

// Sort state
let SORT_COL = "votes";     // "title" | "type" | "category" | "votes" | "rating"
let SORT_DIR = "desc";      // "asc" | "desc"

// Journey mode
let JOURNEY_MODE_LIST = false;
let MY_VOTED_IDS_LIST = new Set();

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setCount(shown, total) {
  const el = document.getElementById("listCount");
  if (el) el.textContent = shown === total ? `${total} items` : `Showing ${shown} of ${total}`;
}

function showClearIfNeeded() {
  const any = FILTER_TYPE || FILTER_CATEGORY || FILTER_BUCKET || FILTER_SEARCH || !FILTER_CHAINS;
  document.getElementById("btnClearFilters").style.display = any ? "inline-flex" : "none";
}

/* ── TYPE TOGGLE ── */
function setTypeFilter(btn, type) {
  FILTER_TYPE = type;
  document.querySelectorAll(".type-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  // Rebuild category chips so they match the type
  renderCatChips();
  showClearIfNeeded();
  renderTable();
}

/* ── CATEGORY CHIPS ── */
function renderCatChips() {
  const host    = document.getElementById("catChips");
  const moreEl  = document.getElementById("catMore");
  host.innerHTML = "";

  // Filter categories to match current type filter
  let cats = CATEGORIES.filter(c => c.is_active);
  if (FILTER_TYPE === "place")   cats = cats.filter(c => c.for_places);
  if (FILTER_TYPE === "product") cats = cats.filter(c => c.for_products);

  const TOP_N   = 5;
  const topCats = cats.slice(0, TOP_N);
  const moreCats = cats.slice(TOP_N);

  topCats.forEach(c => {
    const btn = document.createElement("button");
    btn.className = "chip" + (FILTER_CATEGORY === c.id ? " active" : "");
    btn.onclick = () => {
      FILTER_CATEGORY = (FILTER_CATEGORY === c.id) ? "" : c.id;
      renderCatChips();
      showClearIfNeeded();
      renderTable();
    };
    const icon = c.icon_url
      ? `<img class="chip-ic" src="${escapeHtml(c.icon_url)}" alt="" />`
      : "";
    btn.innerHTML = `${icon}<span>${escapeHtml(c.name)}</span>`;
    host.appendChild(btn);
  });

  // Populate "More…" select
  if (moreEl) {
    moreEl.style.display = moreCats.length ? "" : "none";
    moreEl.innerHTML = `<option value="">More…</option>` +
      moreCats.map(c => `<option value="${c.id}"${FILTER_CATEGORY === c.id ? " selected" : ""}>${escapeHtml(c.name)}</option>`).join("");
  }
}

function onCatMoreChanged() {
  const sel = document.getElementById("catMore");
  if (!sel) return;
  const val = sel.value;
  FILTER_CATEGORY = val ? parseInt(val) : "";
  renderCatChips();
  showClearIfNeeded();
  renderTable();
}

/* ── RATING BUTTONS ── */
function renderRatingButtons() {
  const host = document.getElementById("ratingSeg");
  host.innerHTML = "";
  const buttons = [
    { key: "",     label: "All" },
    { key: "7-8",  label: "7+" },
    { key: "9-10", label: "9+" },
  ];
  buttons.forEach(b => {
    const btn = document.createElement("button");
    btn.className = "seg-btn";
    btn.dataset.key = b.key;
    btn.textContent = b.label;
    btn.onclick = () => {
      FILTER_BUCKET = (FILTER_BUCKET === b.key) ? "" : b.key;
      setActiveRatingBtn(FILTER_BUCKET);
      showClearIfNeeded();
      renderTable();
    };
    host.appendChild(btn);
  });
  setActiveRatingBtn("");
}

function setActiveRatingBtn(key) {
  document.querySelectorAll(".seg-btn").forEach(el => {
    el.classList.toggle("active", el.dataset.key === key);
  });
}

/* ── FILTERS ── */
function applyListFilters() {
  FILTER_SEARCH = document.getElementById("searchInput").value.trim().toLowerCase();
  showClearIfNeeded();
  renderTable();
}

function clearListFilters() {
  FILTER_TYPE = "";
  FILTER_CATEGORY = "";
  FILTER_BUCKET = "";
  FILTER_SEARCH = "";
  FILTER_CHAINS = true;
  const chainCb = document.getElementById("chainToggleList");
  if (chainCb) chainCb.checked = true;

  document.getElementById("searchInput").value = "";
  document.querySelectorAll(".type-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.type === "");
  });
  setActiveRatingBtn("");
  renderCatChips();
  showClearIfNeeded();
  renderTable();
}

/* ── SORTING ── */
function setSort(col) {
  if (SORT_COL === col) {
    SORT_DIR = SORT_DIR === "desc" ? "asc" : "desc";
  } else {
    SORT_COL = col;
    SORT_DIR = col === "title" ? "asc" : "desc";
  }
  renderTable();
}

function sortRows(rows) {
  return rows.slice().sort((a, b) => {
    const mult = SORT_DIR === "asc" ? 1 : -1;
    switch (SORT_COL) {
      case "title":
        return mult * String(a.title || "").localeCompare(String(b.title || ""));
      case "type":
        return mult * String(a.group_type || "").localeCompare(String(b.group_type || ""));
      case "category": {
        const an = CAT_BY_ID[a.category_id]?.name || "";
        const bn = CAT_BY_ID[b.category_id]?.name || "";
        return mult * an.localeCompare(bn);
      }
      case "votes":
        return mult * (Number(a.rating_count ?? 0) - Number(b.rating_count ?? 0));
      case "rating":
        return mult * (Number(a.rating_avg ?? 0) - Number(b.rating_avg ?? 0));
      default:
        return 0;
    }
  });
}

/* ── FILTERING ── */
function bucketFor(avg) {
  const x = Number(avg ?? 0);
  if (x >= 9) return "9-10";
  if (x >= 7) return "7-8";
  if (x >= 5) return "5-6";
  if (x >= 3) return "3-4";
  return "1-2";
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

function dotColorFor(cls) {
  const map = {
    "rating-none": "#ccc",
    "rating-1-2":  "#ff3b30",
    "rating-3-4":  "#ff8a00",
    "rating-5-6":  "#ffd60a",
    "rating-7-8":  "#34c759",
    "rating-9-10": "#0f9d58",
  };
  return map[cls] || "#ccc";
}

// marker_id -> Set of category_ids (loaded at init)
let MARKER_CAT_MAP = {};

function filterRows(rows) {
  return rows.filter(m => {
    if (FILTER_TYPE && m.group_type !== FILTER_TYPE) return false;
    if (FILTER_CATEGORY) {
      // Check both primary category and marker_categories map
      const cats = MARKER_CAT_MAP[m.id];
      const catMatch = cats
        ? cats.has(FILTER_CATEGORY)
        : m.category_id === FILTER_CATEGORY;
      if (!catMatch) return false;
    }
    if (FILTER_BUCKET) {
      const cnt = Number(m.rating_count ?? 0);
      if (!cnt) return false;
      if (bucketFor(m.rating_avg) !== FILTER_BUCKET) return false;
    }
    if (FILTER_SEARCH) {
      const title  = String(m.title || "").toLowerCase();
      const addr   = String(m.address || "").toLowerCase();
      const brand  = String(BRAND_BY_ID[m.brand_id]?.name || "").toLowerCase();
      const cat    = String(CAT_BY_ID[m.category_id]?.name || "").toLowerCase();
      const needle = FILTER_SEARCH;
      if (!title.includes(needle) && !addr.includes(needle) && !brand.includes(needle) && !cat.includes(needle)) return false;
    }
    if (!FILTER_CHAINS && m.chain_id) return false;
    return true;
  });
}

/* ── RENDER TABLE ── */
function thClass(col) {
  if (SORT_COL !== col) return "sortable";
  return `sortable sort-${SORT_DIR}`;
}

function renderTable() {
  let filtered = filterRows(ALL_MARKERS);
  let sorted   = sortRows(filtered);

  // Journey mode: voted items first (by score desc), then unvoted (by rating desc)
  if (JOURNEY_MODE_LIST && MY_VOTED_IDS_LIST.size > 0) {
    const voted   = sorted.filter(m =>  MY_VOTED_IDS_LIST.has(m.id));
    const unvoted = sorted.filter(m => !MY_VOTED_IDS_LIST.has(m.id));
    sorted = [...voted, ...unvoted];
  }

  setCount(sorted.length, ALL_MARKERS.length);

  const wrap = document.getElementById("listWrap");

  if (!sorted.length) {
    wrap.innerHTML = `
      <div class="list-empty">
        <div class="list-empty-icon">🔍</div>
        <h3>No results</h3>
        <p class="muted">Try adjusting your filters or search term.</p>
        <button class="tba-btn" onclick="clearListFilters()" style="margin-top:10px;">Clear filters</button>
      </div>
    `;
    return;
  }

  wrap.innerHTML = `
    <table class="list-table">
      <thead>
        <tr>
          <th class="${thClass('title')} col-title" onclick="setSort('title')">Title</th>
          <th class="${thClass('type')} col-type"   onclick="setSort('type')">Type</th>
          <th class="${thClass('category')} col-cat" onclick="setSort('category')">Category</th>
          <th class="${thClass('votes')} col-votes"  onclick="setSort('votes')">Votes</th>
          <th class="${thClass('rating')} col-rating" onclick="setSort('rating')">Rating</th>
          <th class="col-wl"></th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map(m => {
          const cat       = CAT_BY_ID[m.category_id]?.name || "—";
          const avg       = Number(m.rating_avg ?? 0);
          const cnt       = Number(m.rating_count ?? 0);
          const cls       = colorClassForRating(avg, cnt);
          const dot       = dotColorFor(cls);
          const ratingTxt = cnt ? avg.toFixed(2) : "—";
          const votesTxt  = cnt ? String(cnt) : "—";
          const unvisited = JOURNEY_MODE_LIST && !MY_VOTED_IDS_LIST.has(m.id);

          // Info column
          let info = "";
          if (m.group_type === "place" && m.address) {
            info = `<span class="muted" style="font-size:12px;">📍 ${escapeHtml(m.address)}</span>`;
          } else if (m.group_type === "product" && m.brand_id) {
            const brand = BRAND_BY_ID[m.brand_id]?.name || "";
            const productLabel = m.product_name ? `${escapeHtml(brand)} · <span style="font-weight:400;">${escapeHtml(m.product_name)}</span>` : escapeHtml(brand);
            if (brand) info = `<span class="muted" style="font-size:12px;">🏷️ ${productLabel}</span>`;
          }

          const chainBadge = m.chain_id ? `<span class="chain-badge" title="Part of a chain">⛓</span>` : "";

          const typeTag = m.group_type === "place"
            ? `<span class="type-tag type-tag-place">📍 Place</span>`
            : `<span class="type-tag type-tag-product">🛒 Product</span>`;

          return `
            <tr class="${unvisited ? "journey-unvisited-row" : ""}" onclick="window.location.href='marker.html?id=${encodeURIComponent(m.id)}&cat=${encodeURIComponent(FILTER_CATEGORY || m.category_id)}'">
              <td class="col-title"><b>${escapeHtml(m.title)}</b> ${chainBadge}</td>
              <td class="col-type">${typeTag}</td>
              <td class="col-cat">${escapeHtml(cat)}</td>
              <td class="col-votes"><span class="rating-votes">${escapeHtml(votesTxt)}</span></td>
              <td class="col-rating">
                <div class="rating-cell">
                  <div class="rating-dot" style="background:${unvisited ? "var(--rule)" : dot};"></div>
                  <span class="rating-val">${escapeHtml(ratingTxt)}</span>
                </div>
              </td>
              <td class="col-wl">${wlBtnHtml(m.id, "wl-btn-sm")}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

/* ── JOURNEY MODE ── */
function updateJourneyToggleUIList() {
  const d = document.getElementById("listJOptDiscover");
  const j = document.getElementById("listJOptJourney");
  if (!d || !j) return;
  d.classList.toggle("journey-opt-active", !JOURNEY_MODE_LIST);
  j.classList.toggle("journey-opt-active", JOURNEY_MODE_LIST);
}

async function toggleJourneyModeList() {
  const user = await maybeUser();
  if (!user) {
    showJourneyLoginPromptInline("listJourneyWrap");
    return;
  }
  JOURNEY_MODE_LIST = !JOURNEY_MODE_LIST;
  updateJourneyToggleUIList();
  renderTable();
}

function showJourneyLoginPromptInline(wrapperId) {
  let el = document.getElementById("journeyLoginToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "journeyLoginToast";
    el.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);" +
      "background:var(--accent,#e0355b);color:#fff;padding:10px 18px;border-radius:20px;" +
      "font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.25);" +
      "cursor:pointer;white-space:nowrap;";
    el.innerHTML = "🔑 Log in to track My Journey &nbsp;→";
    el.onclick = () => window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.href);
    document.body.appendChild(el);
  }
  el.style.display = "block";
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.display = "none"; }, 3500);
}

/* ── CHAIN TOGGLE ── */
function onListChainToggleChanged() {
  FILTER_CHAINS = document.getElementById("chainToggleList").checked;
  showClearIfNeeded();
  renderTable();
}

/* ── INIT ── */
async function initListPage() {
  renderRatingButtons();
  wlInit(); // load wishlist state for heart buttons

  // Load categories
  const { data: catData, error: catErr } = await sb
    .from("categories")
    .select("id,name,icon_url,is_active,for_places,for_products")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (catErr) { document.getElementById("listWrap").textContent = "Error: " + catErr.message; return; }
  CATEGORIES = catData || [];
  CAT_BY_ID = {};
  CATEGORIES.forEach(c => CAT_BY_ID[c.id] = c);

  // Load brands
  const { data: brandData, error: brandErr } = await sb
    .from("brands")
    .select("id,name,is_active")
    .eq("is_active", true);

  if (!brandErr && brandData) {
    brandData.forEach(b => BRAND_BY_ID[b.id] = b);
  }

  // Load markers
  const { data, error } = await sb
    .from("markers")
    .select("id,title,group_type,category_id,brand_id,address,rating_avg,rating_count,is_active,product_name,chain_id")
    .eq("is_active", true);

  if (error) { document.getElementById("listWrap").textContent = "Error: " + error.message; return; }
  ALL_MARKERS = data || [];

  // Journey mode: load votes if logged in (toggle always visible)
  const user = await maybeUser();
  if (user) {
    const { data: voteData } = await sb
      .from("votes")
      .select("marker_id")
      .eq("user_id", user.id)
      .eq("is_active", true);
    MY_VOTED_IDS_LIST = new Set((voteData || []).map(v => v.marker_id));
  }

  // Load marker_categories for multi-category filtering
  const { data: mcData } = await sb
    .from("marker_categories")
    .select("marker_id,category_id")
    .eq("is_active", true);

  MARKER_CAT_MAP = {};
  (mcData || []).forEach(r => {
    if (!MARKER_CAT_MAP[r.marker_id]) MARKER_CAT_MAP[r.marker_id] = new Set();
    MARKER_CAT_MAP[r.marker_id].add(r.category_id);
  });

  // Read URL param ?category=X from home page chip clicks
  const urlCat = new URLSearchParams(window.location.search).get("category");
  if (urlCat) {
    const catId = parseInt(urlCat);
    if (!isNaN(catId)) FILTER_CATEGORY = catId;
  }

  renderCatChips();
  showClearIfNeeded();
  renderTable();
}
