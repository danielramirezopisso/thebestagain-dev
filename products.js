function scoreRowClass(score, hasVoted) {
  if (!hasVoted) return 'score-none';
  const s = Math.round(Number(score));
  if (s >= 10) return 'score-10';
  if (s >= 9)  return 'score-9';
  if (s >= 8)  return 'score-8';
  if (s >= 7)  return 'score-7';
  if (s >= 6)  return 'score-6';
  if (s >= 5)  return 'score-5';
  if (s >= 4)  return 'score-4';
  if (s >= 3)  return 'score-3';
  return 'score-low';
}

// products.js — Products UX v2.3
// NEW: brands filtered by selected category via category_brands table

let CATS = [];
let CAT_BY_ID = {};
let BRANDS = [];
let BRAND_BY_ID = {};
let MARKERS = [];
let CATEGORY_BRANDS = []; // [{category_id, brand_id}]

// filters
let FILTER_CATEGORY = "";
let FILTER_BUCKET = "";

// lane sort
let TOP_CATS = [];
let LANE_SORT = {};
let DRAWER_CAT = null;
let DRAWER_SORT = "desc";

// journey mode
let JOURNEY_MODE_PROD = false;
let MY_VOTED_IDS_PROD = new Set();
let MY_VOTE_SCORES_PROD = {}; // marker_id -> personal vote score

const DEFAULT_ICON_URL = "https://danielramirezopisso.github.io/thebestagain/icons/default.svg";

function qs(id){ return document.getElementById(id); }

function toggleAddPanel() {
  const panel = qs('addPanel');
  if (!panel) return;
  const isOpen = panel.classList.contains('add-panel-open');
  if (isOpen) {
    panel.classList.remove('add-panel-open');
    panel.classList.add('add-panel-collapsed');
  } else {
    panel.classList.add('add-panel-open');
    panel.classList.remove('add-panel-collapsed');
  }
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function normalizeUrl(raw){
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  try { return new URL(s, window.location.href).toString(); } catch { return ""; }
}

function iconForCategory(id){
  const raw = CAT_BY_ID[id]?.icon_url || "";
  return normalizeUrl(raw) || DEFAULT_ICON_URL;
}
function iconForBrand(id){
  const raw = BRAND_BY_ID[id]?.icon_url || "";
  return normalizeUrl(raw);
}

function setStatus(msg){ qs("pageStatus").textContent = msg || ""; }
function setPStatus(msg){ const el = qs("p_status"); if (el) el.textContent = msg || ""; }

// Returns brands allowed for a given category_id (integer)
function brandsForCategory(category_id) {
  if (!category_id) return BRANDS.filter(b => b.is_active);
  const allowed = new Set(
    CATEGORY_BRANDS
      .filter(cb => cb.category_id === category_id && cb.is_active)
      .map(cb => cb.brand_id)
  );
  return BRANDS.filter(b => b.is_active && allowed.has(b.id));
}

function fillAddBrandDropdown() {
  const category_id = parseInt(qs("p_category").value) || null;
  const filtered = brandsForCategory(category_id);
  qs("p_brand").innerHTML = filtered.length
    ? filtered.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join("")
    : `<option value="">No brands linked to this category</option>`;
}

function fillVoteSelect(){
  const sel = qs("p_vote");
  sel.innerHTML = "";
  for (let i=1;i<=10;i++){
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = String(i);
    if (i===7) opt.selected = true;
    sel.appendChild(opt);
  }
}

function colorClassForRating(avg, cnt){
  const c = Number(cnt ?? 0);
  if (!c) return "rating-none";
  const x = Number(avg ?? 0);
  if (x >= 9) return "rating-9-10";
  if (x >= 7) return "rating-7-8";
  if (x >= 5) return "rating-5-6";
  if (x >= 3) return "rating-3-4";
  return "rating-1-2";
}

function bucketFor(avg){
  const x = Number(avg ?? 0);
  if (x >= 9) return "9-10";
  if (x >= 7) return "7-8";
  if (x >= 5) return "5-6";
  if (x >= 3) return "3-4";
  return "1-2";
}

function passesBucket(m){
  if (!FILTER_BUCKET) return true;
  const c = Number(m.rating_count ?? 0);
  if (!c) return false;
  return bucketFor(m.rating_avg) === FILTER_BUCKET;
}
function passesCategory(m){
  if (!FILTER_CATEGORY) return true;
  return m.category_id === FILTER_CATEGORY;
}

function showClearIfNeeded(){
  const any = !!FILTER_CATEGORY || !!FILTER_BUCKET;
  qs("btnClearFilters").style.display = any ? "inline-flex" : "none";
}

function clearFilters(){
  FILTER_CATEGORY = "";
  FILTER_BUCKET = "";
  qs("catMore").value = "";
  renderCatQuick();
  setActiveRatingBtn("");
  showClearIfNeeded();
  renderAll();
}

function onCategoryMoreChanged(){
  const v = parseInt(qs("catMore").value) || "";
  if (!v) return;
  FILTER_CATEGORY = v;
  renderCatQuick();
  showClearIfNeeded();
  renderAll();
}

function renderRatingButtons(){
  const host = qs("ratingSeg");
  host.innerHTML = "";
  const buttons = [
    { key:"",     label:"All" },
    { key:"7-8",  label:"7+" },
    { key:"9-10", label:"9+" },
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
      renderAll();
    };
    host.appendChild(btn);
  });
  setActiveRatingBtn("");
}

function setActiveRatingBtn(key){
  [...document.querySelectorAll(".seg-btn")].forEach(el => {
    el.classList.toggle("active", el.dataset.key === key);
  });
}

function renderCatQuick(){
  const host = qs("catQuick");
  host.innerHTML = "";
  const top4 = TOP_CATS.slice(0,4).map(id => CAT_BY_ID[id]).filter(Boolean);
  top4.forEach(c => {
    const a = document.createElement("a");
    a.href="#";
    a.className="chip";
    a.onclick = (e) => {
      e.preventDefault();
      FILTER_CATEGORY = (FILTER_CATEGORY === c.id) ? "" : c.id;
      qs("catMore").value = FILTER_CATEGORY ? FILTER_CATEGORY : "";
      renderCatQuick();
      showClearIfNeeded();
      renderAll();
    };
    if (FILTER_CATEGORY === c.id) a.classList.add("active");
    a.innerHTML = `<img class="chip-ic" src="${escapeHtml(iconForCategory(c.id))}" alt=""/><span>${escapeHtml(c.name)}</span>`;
    host.appendChild(a);
  });
  const all = document.createElement("a");
  all.href="#";
  all.className="chip chip-more";
  all.textContent="All";
  all.onclick=(e)=>{
    e.preventDefault();
    FILTER_CATEGORY="";
    qs("catMore").value="";
    renderCatQuick();
    showClearIfNeeded();
    renderAll();
  };
  if (!FILTER_CATEGORY) all.classList.add("active");
  host.appendChild(all);
}

function arrowFor(dir){ return dir === "asc" ? "↑" : "↓"; }

function toggleLaneSort(catId){
  const id = parseInt(catId);
  const cur = LANE_SORT[id] || "desc";
  LANE_SORT[id] = (cur === "desc") ? "asc" : "desc";
  event.stopPropagation(); // prevent opening drawer
  renderAll();
}

function openDrawer(catId){
  document.body.style.overflow = 'hidden';
  DRAWER_CAT = parseInt(catId);
  DRAWER_SORT = LANE_SORT[DRAWER_CAT] || "desc";
  qs("drawerOverlay").style.display = "block";
  qs("drawer").style.display = "flex";
  qs("drawerCatName").textContent = CAT_BY_ID[DRAWER_CAT]?.name || String(DRAWER_CAT);
  qs("drawerSortBtn").textContent = arrowFor(DRAWER_SORT);
  renderDrawer();
}

function closeDrawer(){
  document.body.style.overflow = '';
  qs("drawerOverlay").style.display = "none";
  qs("drawer").style.display = "none";
  DRAWER_CAT = null;
}

function toggleDrawerSort(){
  DRAWER_SORT = (DRAWER_SORT === "desc") ? "asc" : "desc";
  qs("drawerSortBtn").textContent = arrowFor(DRAWER_SORT);
  renderDrawer();
}

document.addEventListener("keydown", (e)=>{
  if (e.key === "Escape") closeDrawer();
});

function sortMarkers(arr, dir){
  const mult = (dir === "asc") ? 1 : -1;
  return arr.sort((a,b)=>{
    const av = Number(a.rating_avg ?? 0);
    const bv = Number(b.rating_avg ?? 0);
    if (av !== bv) return mult * (av - bv);
    const ac = Number(a.rating_count ?? 0);
    const bc = Number(b.rating_count ?? 0);
    if (ac !== bc) return mult * (ac - bc);
    const an = BRAND_BY_ID[a.brand_id]?.name || "";
    const bn = BRAND_BY_ID[b.brand_id]?.name || "";
    return an.localeCompare(bn);
  });
}

function ratingBadgeHtml(m){
  const avg = Number(m.rating_avg ?? 0);
  const cnt = Number(m.rating_count ?? 0);
  const hasVoted = MY_VOTED_IDS_PROD.has(m.id);

  let n, tip, color;
  if (JOURNEY_MODE_PROD && hasVoted) {
    const myScore = MY_VOTE_SCORES_PROD[m.id];
    n     = String(Math.round(myScore));
    tip   = `Your vote: ${myScore}/10`;
    color = scoreColor(myScore);
  } else if (JOURNEY_MODE_PROD && !hasVoted) {
    n     = '–';
    tip   = 'Not voted yet — click to vote';
    color = 'var(--border)';
    const myVoteJ = hasVoted ? ' prod-voted' : '';
    return `<div class="prod-score journey-empty${myVoteJ}" title="${escapeHtml(tip)}"
      onclick="event.preventDefault(); event.stopPropagation(); openProductVote('${m.id}', '${m.category_id}', this); return false;"
      >${escapeHtml(n)}</div>`;
  } else {
    n     = cnt ? String(Math.round(avg)) : '—';
    tip   = cnt ? `${avg.toFixed(2)}/10 (${cnt} votes)` : 'No votes yet';
    color = cnt ? scoreColor(avg) : 'var(--muted)';
  }

  const myVote = hasVoted ? ' prod-voted' : '';
  return `<div class="prod-score${myVote}" style="color:${color}" title="${escapeHtml(tip)}"
    onclick="event.preventDefault(); event.stopPropagation(); openProductVote('${m.id}', '${m.category_id}', this); return false;"
    >${escapeHtml(n)}</div>`;
}

function scoreColor(score) {
  const s = Number(score);
  const cb = localStorage.getItem('tba_colorblind') === '1';
  if (cb) {
    if (s >= 9) return '#1a3f8f';
    if (s >= 7) return '#2d6be4';
    if (s >= 5) return '#c8972a';
    if (s >= 3) return '#e87722';
    return '#b35c00';
  }
  if (s >= 9) return '#1e5c3a';
  if (s >= 7) return '#4a7c59';
  if (s >= 5) return '#c8972a';
  if (s >= 3) return '#e76f51';
  return '#c1440e';
}

// ── Inline vote popover ──
let VOTE_POPOVER_OPEN = null; // current open popover element

function openProductVote(markerId, categoryId, badgeEl) {
  // Close any existing popover
  if (VOTE_POPOVER_OPEN) { VOTE_POPOVER_OPEN.remove(); VOTE_POPOVER_OPEN = null; }

  const pop = document.createElement('div');
  pop.className = 'prod-vote-pop';
  pop.dataset.markerId = markerId;

  // Get current user vote if any
  const scores = [1,2,3,4,5,6,7,8,9,10];
  pop.innerHTML = `
    <div class="prod-vote-pop-title">Your vote</div>
    <div class="prod-vote-pop-scores">
      ${scores.map(s => `<button class="prod-vote-score" data-score="${s}" onclick="event.stopPropagation();event.preventDefault();submitProductVote('${markerId}','${categoryId}',${s},this)">${s}</button>`).join('')}
    </div>
    <button class="prod-vote-pop-remove" onclick="event.stopPropagation();event.preventDefault();removeProductVote('${markerId}','${categoryId}',this)">Remove vote</button>
  `;

  // Position near the badge - append to body to avoid <a> tag navigation
  const badgeRect = badgeEl.getBoundingClientRect();
  pop.style.position = 'fixed';
  pop.style.top = (badgeRect.bottom + 6) + 'px';
  pop.style.right = (window.innerWidth - badgeRect.right) + 'px';
  pop.style.left = 'auto';
  document.body.appendChild(pop);
  VOTE_POPOVER_OPEN = pop;

  // Highlight current vote
  sb.from('votes').select('vote').eq('marker_id', markerId).eq('user_id', (window._prodUser?.id || '')).eq('is_active', true).maybeSingle()
    .then(({data}) => {
      if (data?.vote) {
        const btn = pop.querySelector(`[data-score="${Math.round(data.vote)}"]`);
        if (btn) btn.classList.add('active');
      }
    });

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function closePopover(e) {
      if (!pop.contains(e.target)) { pop.remove(); VOTE_POPOVER_OPEN = null; document.removeEventListener('click', closePopover); }
    });
  }, 10);
}

async function submitProductVote(markerId, categoryId, score, btnEl) {
  const user = await maybeUser();
  if (!user) { window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.href); return; }
  window._prodUser = user;

  // Try update first, then insert if no row exists
  const { data: existing } = await sb.from('votes')
    .select('id').eq('marker_id', markerId).eq('user_id', user.id)
    .eq('category_id', Number(categoryId)).maybeSingle();
  
  if (existing) {
    await sb.from('votes').update({ vote: score, is_active: true })
      .eq('id', existing.id);
  } else {
    await sb.from('votes').insert({
      marker_id: markerId, category_id: Number(categoryId),
      user_id: user.id, vote: score, is_active: true
    });
  }

  // Update MY_VOTED_IDS_PROD and score map
  MY_VOTED_IDS_PROD.add(markerId);
  MY_VOTE_SCORES_PROD[markerId] = score;

  // Close popover
  if (VOTE_POPOVER_OPEN) { VOTE_POPOVER_OPEN.remove(); VOTE_POPOVER_OPEN = null; }

  // Re-render to reflect new vote
  renderAll();
}

async function removeProductVote(markerId, categoryId, btnEl) {
  const user = await maybeUser();
  if (!user) return;

  await sb.from('votes').update({ is_active: false })
    .eq('marker_id', markerId).eq('user_id', user.id).eq('is_active', true);

  MY_VOTED_IDS_PROD.delete(markerId);
  delete MY_VOTE_SCORES_PROD[markerId];
  if (VOTE_POPOVER_OPEN) { VOTE_POPOVER_OPEN.remove(); VOTE_POPOVER_OPEN = null; }
  renderAll();
}

function brandIconSlotHtml(brandId){
  const url = iconForBrand(brandId);
  if (!url) return `<div class="brand-ic-slot" title="(no icon yet)"></div>`;
  return `<div class="brand-ic-slot"><img src="${escapeHtml(url)}" alt=""/></div>`;
}

function renderLane(catId, markersForCat){
  const cat = CAT_BY_ID[catId];
  const name = cat?.name || String(catId);
  const icon = iconForCategory(catId);
  const dir = LANE_SORT[catId] || "desc";

  let sorted = sortMarkers(markersForCat.slice(), dir);

  // Always sort: voted items first (by rating desc), then unvoted (by rating desc)
  {
    const voted   = sorted.filter(m =>  MY_VOTED_IDS_PROD.has(m.id));
    const unvoted = sorted.filter(m => !MY_VOTED_IDS_PROD.has(m.id));
    sorted = [...voted, ...unvoted];
  }

  const visible = sorted.slice(0, 5);
  const hasMore = sorted.length > 5;

  // Max avg for bar width
  const maxAvg = Math.max(...sorted.map(m => Number(m.rating_avg || 0)), 1);

  const itemsHtml = visible.map((m, idx)=>{
    const brand = BRAND_BY_ID[m.brand_id]?.name || "(unknown brand)";
    const displayName = m.product_name ? `${brand} · ${m.product_name}` : brand;
    const unvisited = JOURNEY_MODE_PROD && !MY_VOTED_IDS_PROD.has(m.id);
    const myScore = JOURNEY_MODE_PROD && MY_VOTED_IDS_PROD.has(m.id) ? MY_VOTE_SCORES_PROD[m.id] : null;
    const rowScore = myScore ?? m.rating_avg;
    const rowHasVotes = myScore != null || (!JOURNEY_MODE_PROD && Number(m.rating_count) > 0);
    const rowScoreCls = scoreRowClass(rowScore, rowHasVotes);
    const avg = Number(m.rating_avg || 0);
    const cnt = Number(m.rating_count || 0);
    const barPct = cnt ? Math.round((avg / maxAvg) * 100) : 0;
    return `
      <div class="item-row ${rowScoreCls}${unvisited ? " journey-unvisited-item" : ""}">
        <a class="item" href="marker.html?id=${encodeURIComponent(m.id)}&cat=${encodeURIComponent(catId)}">
          <div class="item-top">
            ${brandIconSlotHtml(m.brand_id)}
            <div class="item-name">${escapeHtml(displayName)}</div>
            ${ratingBadgeHtml(m)}
          </div>
          ${cnt ? `<div class="item-bar-wrap"><div class="item-bar" style="width:${barPct}%"></div></div>` : ''}
        </a>
        ${wlBtnHtml(m.id, "wl-btn-sm")}
      </div>
    `;
  }).join("");

  const moreHtml = hasMore
    ? `<div class="see-more" onclick="openDrawer(${catId})">See more →</div>`
    : "";

  // density class: subtle background shift for fuller lanes
  const density = markersForCat.length >= 5 ? "lane-dense" : markersForCat.length >= 3 ? "lane-medium" : "";

  return `
    <div class="lane ${density}">
      <div class="lane-head">
        <div class="lane-title" onclick="openDrawer(${catId})" style="cursor:pointer;">
          <img class="lane-ic" src="${escapeHtml(icon)}" alt=""/>
          <div class="lane-name">${escapeHtml(name)}</div>
        </div>
        <button class="tba-btn lane-sort" onclick="toggleLaneSort(${catId})" title="Toggle sort">
          ${escapeHtml(arrowFor(dir))}
        </button>
      </div>
      ${itemsHtml || `<div class="muted">No products in this category yet.</div>`}
      ${moreHtml}
    </div>
  `;
}

function renderDrawer(){
  if (!DRAWER_CAT) return;
  const catId = DRAWER_CAT;
  let rows = MARKERS.filter(m => m.category_id === catId).filter(passesBucket);
  rows = sortMarkers(rows.slice(), DRAWER_SORT);
  qs("drawerList").innerHTML = rows.map(m=>{
    const brand = BRAND_BY_ID[m.brand_id]?.name || "(unknown brand)";
    const displayName = m.product_name ? `${brand} · ${m.product_name}` : brand;
    return `
      <div class="item-row">
        <a class="item" href="marker.html?id=${encodeURIComponent(m.id)}&cat=${encodeURIComponent(catId)}">
          <div class="item-top">
            ${brandIconSlotHtml(m.brand_id)}
            <div class="item-name">${escapeHtml(displayName)}</div>
            ${ratingBadgeHtml(m)}
          </div>
        </a>
        ${wlBtnHtml(m.id, "wl-btn-sm")}
      </div>
    `;
  }).join("") || `<div class="muted">No products match the filters.</div>`;
}

function computeTopCategories(){
  const counts = {};
  MARKERS.forEach(m=>{
    const cid = m.category_id;
    if (!cid) return;
    counts[cid] = (counts[cid] || 0) + 1;
  });
  const ids = Object.keys(counts).map(Number);
  ids.sort((a,b)=> (counts[b]||0) - (counts[a]||0));
  return ids;
}

function renderAll(){
  const filtered = MARKERS.filter(passesCategory).filter(passesBucket);
  TOP_CATS = computeTopCategories();

  const more = qs("catMore");
  if (more) {
    more.innerHTML = `<option value="">More…</option>` + CATS
      .map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
      .join("");
    more.value = FILTER_CATEGORY ? FILTER_CATEGORY : "";
  }

  // Update filter pill active state
  const pill = qs("prodFilterPill");
  const count = qs("prodFilterCount");
  const activeCount = (FILTER_CATEGORY ? 1 : 0) + (FILTER_BUCKET ? 1 : 0);
  if (pill) pill.classList.toggle("active", activeCount > 0);
  if (count) { count.textContent = activeCount; count.style.display = activeCount > 0 ? "inline" : "none"; }

  renderCatQuick();

  const N = 6;
  let laneIds = TOP_CATS.slice(0, N);
  if (FILTER_CATEGORY) {
    laneIds = [FILTER_CATEGORY, ...laneIds.filter(x => x !== FILTER_CATEGORY)];
  }

  const byCat = {};
  filtered.forEach(m=>{
    const cid = m.category_id;
    (byCat[cid] ||= []).push(m);
  });

  // Hide empty lanes when filtering
  qs("lanes").innerHTML = laneIds
    .filter(cid => (byCat[cid] || []).length > 0)
    .map(cid => renderLane(cid, byCat[cid] || [])).join("");
  setStatus(`Loaded ${filtered.length} product(s).`);
  if (DRAWER_CAT) renderDrawer();
}

/* ---------- Add Product ---------- */
async function saveProduct(){
  const user = await requireAuth();
  if (!user) return;

  setPStatus("Saving…");

  const category_id = parseInt(qs("p_category").value) || null;
  const brand_id = parseInt(qs("p_brand").value) || null;
  const product_name = (qs("p_product_name")?.value || "").trim() || null;
  const v = Number(qs("p_vote").value);

  if (!category_id) { setPStatus("Category required."); return; }
  if (!brand_id) { setPStatus("Brand required."); return; }
  if (!(v >= 1 && v <= 10)) { setPStatus("Vote must be 1–10."); return; }

  // Check for duplicate (same category + brand + product_name)
  let dupQ = sb.from("markers").select("id").eq("is_active", true)
    .eq("group_type", "product").eq("category_id", category_id).eq("brand_id", brand_id);
  if (product_name) dupQ = dupQ.eq("product_name", product_name);
  else dupQ = dupQ.is("product_name", null);
  const { data: existing, error: eErr } = await dupQ.maybeSingle();

  if (eErr) { setPStatus("Error: " + eErr.message); return; }
  if (existing?.id) {
    setPStatus("Already exists ✅ Opening…");
    window.location.href = `marker.html?id=${encodeURIComponent(existing.id)}`;
    return;
  }

  const catName = CAT_BY_ID[category_id]?.name || String(category_id);
  const brandName = BRAND_BY_ID[brand_id]?.name || String(brand_id);
  const title = product_name ? `${catName} · ${brandName} · ${product_name}` : `${catName} · ${brandName}`;

  const payload = {
    title, category_id, brand_id, product_name,
    group_type: "product",
    is_active: true,
    rating_manual: v,
    lat: null, lon: null, address: null
  };

  const { data: markerRow, error: mErr } = await sb
    .from("markers")
    .insert([payload])
    .select("id")
    .single();

  if (mErr) { setPStatus("Error creating: " + mErr.message); return; }

  const { error: vErr } = await sb
    .from("votes")
    .insert([{ marker_id: markerRow.id, user_id: user.id, vote: v, category_id: category_id, is_active: true }]);

  if (vErr) {
    setPStatus("Saved marker ✅ but vote failed: " + vErr.message);
    window.location.href = `marker.html?id=${encodeURIComponent(markerRow.id)}`;
    return;
  }

  window.location.href = `marker.html?id=${encodeURIComponent(markerRow.id)}`;
}

/* Init */
function updateJourneyToggleUIProd() {
  const d = document.getElementById("prodJOptDiscover");
  const j = document.getElementById("prodJOptJourney");
  if (!d || !j) return;
  d.classList.toggle("journey-opt-active", !JOURNEY_MODE_PROD);
  j.classList.toggle("journey-opt-active", JOURNEY_MODE_PROD);
}

async function toggleJourneyModeProd() {
  const user = await maybeUser();
  if (!user) {
    showJourneyLoginPrompt();
    return;
  }
  JOURNEY_MODE_PROD = !JOURNEY_MODE_PROD;
  updateJourneyToggleUIProd();
  renderAll();
}

function showJourneyLoginPrompt() {
  let el = document.getElementById("journeyLoginToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "journeyLoginToast";
    el.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);" +
      "background:var(--accent,#e0355b);color:#fff;padding:10px 18px;border-radius:20px;" +
      "font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.25);" +
      "cursor:pointer;white-space:nowrap;";
    el.innerHTML = "🔑 Log in to track My Journey &nbsp;\u2192";
    el.onclick = () => window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.href);
    document.body.appendChild(el);
  }
  el.style.display = "block";
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.display = "none"; }, 3500);
}

async function initProductsMasonryPage(){
  setStatus("Loading…");
  renderRatingButtons();
  fillVoteSelect();
  wlInit();

  const user = await maybeUser();
  if (!user) {
    qs("addPanelForm").style.display = "none";
    qs("addPanelLoggedOut").style.display = "block";
  }

  // Load category_brands linking table
  const { data: cbData, error: cbErr } = await sb
    .from("category_brands")
    .select("category_id,brand_id,is_active")
    .eq("is_active", true);

  if (cbErr) { setStatus("Error loading category-brands: " + cbErr.message); return; }
  CATEGORY_BRANDS = cbData || [];

  const { data: brands, error: bErr } = await sb
    .from("brands")
    .select("id,name,is_active,icon_url")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (bErr) { setStatus("Error loading brands: " + bErr.message); return; }
  BRANDS = brands || [];
  BRAND_BY_ID = {};
  BRANDS.forEach(b => BRAND_BY_ID[b.id] = b);

  const { data: cats, error: cErr } = await sb
    .from("categories")
    .select("id,name,icon_url,is_active,for_products")
    .eq("is_active", true)
    .eq("for_products", true)
    .order("name", { ascending: true });

  if (cErr) { setStatus("Error loading categories: " + cErr.message); return; }
  CATS = cats || [];
  CAT_BY_ID = {};
  CATS.forEach(c => CAT_BY_ID[c.id] = c);

  qs("p_category").innerHTML = CATS.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");

  // Fill brands filtered by selected category, update on change
  fillAddBrandDropdown();
  qs("p_category").addEventListener("change", fillAddBrandDropdown);

  const { data: markers, error: mErr } = await sb
    .from("markers")
    .select("id,title,group_type,category_id,brand_id,product_name,rating_avg,rating_count,is_active,created_at")
    .eq("is_active", true)
    .eq("group_type", "product");

  if (mErr) { setStatus("Error loading products: " + mErr.message); return; }
  MARKERS = markers || [];

  TOP_CATS = computeTopCategories();
  showClearIfNeeded();

  // Journey mode: load votes if logged in
  if (user) {
    const { data: voteData } = await sb
      .from("votes")
      .select("marker_id, vote, category_id")
      .eq("user_id", user.id)
      .eq("is_active", true);
    MY_VOTED_IDS_PROD = new Set((voteData || []).map(v => v.marker_id));
    // Build map of personal scores: marker_id -> vote score
    MY_VOTE_SCORES_PROD = {};
    (voteData || []).forEach(v => { MY_VOTE_SCORES_PROD[v.marker_id] = v.vote; });
    window._prodUser = user;
  }

  renderAll();
}
