// user.js v8 — My Area: votes, places (edit+deactivate), comments, photos

let USER_ID  = null;
let IS_ADMIN = false;

const SUPABASE_URL_USER = "https://pwlskdjmgqxikbamfshj.supabase.co";

// Edit modal state
let EDIT_MARKER_ID  = null;
let EDIT_MAP_INST   = null;
let EDIT_PIN        = null;
let EDIT_LAT        = null;
let EDIT_LNG        = null;
let CATEGORIES_CACHE = [];
let BRANDS_CACHE     = [];

// Deactivate state
let DEACTIVATE_ID   = null;

function esc(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function colorClass(v) {
  const x = Number(v ?? 0);
  if (!x)   return "rating-none";
  if (x>=9) return "rating-9-10";
  if (x>=7) return "rating-7-8";
  if (x>=5) return "rating-5-6";
  if (x>=3) return "rating-3-4";
  return "rating-1-2";
}

function timeAgo(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)       return "just now";
  if (diff < 3600)     return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400)    return `${Math.floor(diff/3600)}h ago`;
  if (diff < 86400*30) return `${Math.floor(diff/86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { month:"short", year:"numeric" });
}

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
async function initUserPage() {
  const me = await maybeUser();
  if (!me) { window.location.href = "login.html"; return; }

  USER_ID  = me.id;
  IS_ADMIN = me.email?.toLowerCase().includes("dropisso");

  const name = me.user_metadata?.display_name || me.email || "You";
  document.getElementById("userName").textContent   = name;
  document.getElementById("userAvatar").textContent = name.charAt(0).toUpperCase();
  document.title = `${name} — The Best Again`;

  const joined = me.created_at
    ? new Date(me.created_at).toLocaleDateString("en-GB", { month:"long", year:"numeric" })
    : "";
  if (joined) document.getElementById("userJoined").textContent = `Member since ${joined}`;

  // Admin: use admin.html and traction-admin.html directly

  // Load wishlist state + stats + votes in parallel
  wlInit();
  await Promise.all([ loadStats(), loadAllData() ]);
  renderNormalView();

  // Hide tabs with no content
  hideEmptyTabs();

  // Check URL tab param
  const tab = new URLSearchParams(location.search).get("tab");
  if (tab) switchTab(tab);
}

/* ══════════════════════════════════════════
   STATS
══════════════════════════════════════════ */
async function loadStats() {
  const [votesRes, markersRes, commentsRes, photosRes] = await Promise.all([
    sb.from("votes").select("vote", { count:"exact" }).eq("user_id", USER_ID).eq("is_active", true),
    sb.from("markers").select("id", { count:"exact" }).eq("created_by", USER_ID).eq("is_active", true),
    sb.from("comments").select("id", { count:"exact" }).eq("user_id", USER_ID).eq("is_active", true),
    sb.from("marker_photos").select("id", { count:"exact" }).eq("user_id", USER_ID).eq("is_active", true),
  ]);

  const votes        = votesRes.data || [];
  const voteCount    = votesRes.count   ?? votes.length;
  const markerCount  = markersRes.count  ?? 0;
  const commentCount = commentsRes.count ?? 0;
  const photoCount   = photosRes.count   ?? 0;

  const avg = votes.length
    ? (votes.reduce((s,v) => s + Number(v.vote), 0) / votes.length).toFixed(1)
    : "—";

  document.getElementById("statVotes").textContent = voteCount;
  document.getElementById("statAvg").textContent   = avg;
  const smEl = document.getElementById("statMarkers");
  if (smEl) smEl.textContent = markerCount;
  const scEl = document.getElementById("statComments");
  if (scEl) scEl.textContent = commentCount;
  const spEl = document.getElementById("statPhotos");
  if (spEl) spEl.textContent = photoCount;

  const score = voteCount + (markerCount*3) + commentCount + (photoCount*2);
  const badge = getBadge(score);
  const el    = document.getElementById("statBadge");
  if (el) {
    el.textContent      = badge.label;
    el.title            = `${score} activity points · ${badge.next}`;
    el.style.background = badge.bg;
    el.style.color      = badge.color;
  }
}

function getBadge(score) {
  if (score >= 200) return { label:"🏆 Legend",      bg:"#1a1714", color:"#f5d97a", next:"You're at the top!" };
  if (score >= 100) return { label:"⭐ Expert",       bg:"#2d5a3d", color:"#fff",    next:`${200-score} pts to Legend` };
  if (score >= 50)  return { label:"🍴 Connoisseur", bg:"#4a7c59", color:"#fff",    next:`${100-score} pts to Expert` };
  if (score >= 20)  return { label:"🌱 Explorer",    bg:"#7a9e7e", color:"#fff",    next:`${50-score} pts to Connoisseur` };
  return               { label:"👋 Newcomer",    bg:"var(--faint)", color:"var(--muted)", next:`${20-score} pts to Explorer` };
}

/* ══════════════════════════════════════════
   TABS
══════════════════════════════════════════ */
function switchTab(name) {
  // Sync mobile dropdown
  const sel = document.getElementById('userTabSelect');
  if (sel && sel.value !== name) sel.value = name;
  document.querySelectorAll(".user-tab").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.tab === name));
  document.querySelectorAll(".user-tab-panel").forEach(p =>
    p.classList.toggle("active", p.id === `panel-${name}`));

  if (name === "wishlist" && !window._wishlistLoaded) { loadWishlist(); window._wishlistLoaded = true; }
  if (name === "places"   && !window._placesLoaded)   { loadPlaces();   window._placesLoaded   = true; }
  if (name === "comments" && !window._commentsLoaded) { loadComments(); window._commentsLoaded = true; }
  if (name === "photos"   && !window._photosLoaded)   { loadPhotos();   window._photosLoaded   = true; }
}

/* ══════════════════════════════════════════
   WISHLIST TAB
══════════════════════════════════════════ */
async function loadWishlist() {
  const statusEl = document.getElementById("wishlistStatus");
  const host     = document.getElementById("wishlistItems");
  const shareEl  = document.getElementById("wishlistShareLink");

  host.innerHTML = `<p class="muted" style="padding:20px 0;">Loading…</p>`;

  // Set share link
  if (shareEl && USER_ID) {
    shareEl.href = `wishlist.html?user=${encodeURIComponent(USER_ID)}`;
  }

  // Fetch wishlist rows with marker details
  const { data, error } = await sb
    .from("wishlists")
    .select("marker_id, created_at, markers(id, title, group_type, category_id, rating_avg, rating_count, address, brand_id)")
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: false });

  if (error) {
    host.innerHTML = `<p class="muted">Error loading wishlist.</p>`;
    return;
  }

  const items = (data || []).filter(r => r.markers);

  if (statusEl) statusEl.textContent = `${items.length} saved item${items.length === 1 ? "" : "s"}`;

  if (!items.length) {
    host.innerHTML = `<div class="wishlist-empty">
      <div style="font-size:32px;">♥</div>
      <p>Nothing saved yet.</p>
      <p class="muted" style="font-size:13px;">Tap the heart on any place or product to save it here.</p>
    </div>`;
    return;
  }

  // Load categories + brands for display
  const catMap   = Object.fromEntries((CATEGORIES_CACHE || []).map(c => [c.id, c]));
  const brandMap = Object.fromEntries((BRANDS_CACHE    || []).map(b => [b.id, b]));

  host.innerHTML = items.map((r, i) => {
    const m   = r.markers;
    const cat = catMap[m.category_id];
    const avg = Number(m.rating_avg ?? 0);
    const cnt = Number(m.rating_count ?? 0);
    const isPlace = m.group_type === "place";
    const sub = cat?.name || "";
    const scoreColor = cnt
      ? (avg >= 9 ? "#1e5c3a" : avg >= 7 ? "#4a7c59" : avg >= 5 ? "#c8972a" : avg >= 3 ? "#e76f51" : "#c1440e")
      : null;
    const sizeClass = i === 0 ? "vote-row-1" : i === 1 ? "vote-row-2" : i < 4 ? "vote-row-3" : "";

    return `
      <div class="vote-row ${sizeClass}">
        <a class="vote-row-link" href="marker.html?id=${encodeURIComponent(m.id)}&cat=${m.category_id}">
          <div class="vote-row-pos">${i + 1}</div>
          <div class="vote-row-info">
            <div class="vote-row-name">${escapeHtml(m.title)}</div>
            <div class="vote-row-sub">${escapeHtml(sub)}</div>
          </div>
        </a>
        <div class="vote-row-actions">
          ${scoreColor ? `<div class="vote-score-badge" style="background:${scoreColor}">${avg.toFixed(1)}</div>` : ""}
          ${wlBtnHtml(m.id)}
        </div>
      </div>`;
  }).join("");

  // After rendering, refresh all heart states
  if (typeof wlInit === "function") wlInit();
}

/* ══════════════════════════════════════════
   MY PLACES TAB
══════════════════════════════════════════ */
async function loadPlaces() {
  const host = document.getElementById("placesList");
  host.innerHTML = `<p class="muted" style="padding:20px 0;">Loading…</p>`;

  // Fetch markers first so we can filter photos/comments by marker_id
  const { data: markersData, error: markersErr } = await sb
    .from("markers")
    .select("id,title,category_id,group_type,is_active,created_at,lat,lon,address")
    .eq("created_by", USER_ID)
    .order("created_at", { ascending: false });

  if (markersErr || !markersData?.length) {
    host.innerHTML = `
      <div class="user-empty">
        <div class="user-empty-icon">📍</div>
        <p>${markersErr ? "Error loading places. " + markersErr.message : "You haven't added any places yet."}</p>
        <a href="map.html" class="tba-btn tba-btn-primary" style="margin-top:12px;">Open Map to add</a>
      </div>`;
    return;
  }

  const markerIds = markersData.map(m => m.id);

  // Now fetch everything else in parallel, scoped to user's markers
  const [votesRes, catsRes, brandsRes, photosRes, commentsRes] = await Promise.all([
    sb.from("votes")
      .select("marker_id,vote")
      .eq("user_id", USER_ID)
      .eq("is_active", true),
    sb.from("categories")
      .select("id,name,icon_url")
      .eq("is_active", true)
      .order("name"),
    sb.from("brands")
      .select("id,name")
      .eq("is_active", true),
    sb.from("marker_photos")
      .select("marker_id")
      .in("marker_id", markerIds)
      .eq("is_active", true),
    sb.from("comments")
      .select("marker_id")
      .in("marker_id", markerIds)
      .eq("is_active", true),
  ]);

  CATEGORIES_CACHE = catsRes.data   || [];
  BRANDS_CACHE     = brandsRes.data || [];
  const catMap      = Object.fromEntries(CATEGORIES_CACHE.map(c => [c.id, c]));
  const voteMap     = Object.fromEntries((votesRes.data || []).map(v => [v.marker_id, v.vote]));
  const markers     = markersData;

  // Build photo + comment count maps (all markers, not just mine — filtered later)
  const photoCount   = {};
  const commentCount = {};
  (photosRes.data   || []).forEach(p => { photoCount[p.marker_id]   = (photoCount[p.marker_id]   || 0) + 1; });
  (commentsRes.data || []).forEach(c => { commentCount[c.marker_id] = (commentCount[c.marker_id] || 0) + 1; });

  // Separate active vs inactive
  const active   = markers.filter(m => m.is_active);
  const inactive = markers.filter(m => !m.is_active);

  const renderRow = (m, idx) => {
    const cat      = catMap[m.category_id];
    const score    = voteMap[m.id];
    const inactive = !m.is_active;
    const scoreColor = score != null
      ? (score >= 9 ? "#1e5c3a" : score >= 7 ? "#4a7c59" : score >= 5 ? "#c8972a" : score >= 3 ? "#e76f51" : "#c1440e")
      : null;
    const scoreBadge = scoreColor
      ? `<div class="vote-score-badge" style="background:${scoreColor}">${Number(score).toFixed(0)}</div>`
      : `<div class="vote-score-badge" style="background:var(--border);color:var(--muted)">—</div>`;

    return `
      <div class="vote-row${inactive ? ' places-inactive' : ''}" data-id="${esc(m.id)}">
        <a class="vote-row-link" href="marker.html?id=${esc(m.id)}&cat=${m.category_id}">
          <div class="vote-row-pos">${idx + 1}</div>
          <div class="vote-row-info">
            <div class="vote-row-name">${esc(m.title)}</div>
            <div class="vote-row-sub">${esc(cat?.name || '')}</div>
          </div>
        </a>
        <div class="vote-row-actions">
          ${scoreBadge}
          ${!inactive ? `
          <button class="places-edit-btn" onclick="event.stopPropagation();openEditModal('${esc(m.id)}')" title="Edit">✏</button>
          <button class="places-del-btn"  onclick="event.stopPropagation();openDeactivate('${esc(m.id)}','${esc(m.title)}')" title="Remove">✕</button>
          ` : '<span class="places-inactive-label">inactive</span>'}
        </div>
      </div>`;
  };

  let html = active.map((m,i) => renderRow(m,i)).join("");

  if (inactive.length) {
    html += `
      <div class="places-section-divider">
        <button class="places-show-inactive" onclick="toggleInactive(this)">
          Show ${inactive.length} inactive place${inactive.length>1?"s":""}
        </button>
      </div>
      <div class="places-inactive-section" style="display:none;">
        ${inactive.map((m,i) => renderRow(m,i)).join("")}
      </div>`;
  }

  host.innerHTML = html;
}

function toggleInactive(btn) {
  const section = btn.closest(".places-section-divider").nextElementSibling;
  const hidden  = section.style.display === "none";
  section.style.display = hidden ? "" : "none";
  const count = section.querySelectorAll(".places-row").length;
  btn.textContent = hidden
    ? `Hide inactive places`
    : `Show ${count} inactive place${count>1?"s":""}`;
}

/* ══════════════════════════════════════════
   EDIT MODAL
══════════════════════════════════════════ */
async function openEditModal(markerId) {
  EDIT_MARKER_ID = markerId;
  document.getElementById("editModalStatus").textContent = "";
  document.getElementById("editSaveBtn").disabled = false;

  // Fetch marker data
  const { data: m, error } = await sb
    .from("markers")
    .select("id,title,category_id,address,lat,lon")
    .eq("id", markerId)
    .single();

  if (error || !m) {
    alert("Could not load marker data.");
    return;
  }

  // Populate fields
  document.getElementById("editTitle").value   = m.title   || "";
  document.getElementById("editAddress").value = m.address || "";

  // Populate category dropdown
  const sel = document.getElementById("editCategory");
  sel.innerHTML = CATEGORIES_CACHE
    .filter(c => c.id) // all active categories
    .map(c => `<option value="${c.id}" ${c.id === m.category_id ? "selected" : ""}>${esc(c.name)}</option>`)
    .join("");

  // Set coords
  EDIT_LAT = m.lat || 41.3851;
  EDIT_LNG = m.lon || 2.1734;
  document.getElementById("editCoordsDisplay").textContent =
    `${EDIT_LAT.toFixed(5)}, ${EDIT_LNG.toFixed(5)}`;

  // Show modal first (map needs visible container)
  document.getElementById("editModalOverlay").classList.add("active");

  // Init map after brief delay for layout
  setTimeout(() => initEditMap(EDIT_LAT, EDIT_LNG), 80);
}

function initEditMap(lat, lng) {
  // Destroy previous instance
  if (EDIT_MAP_INST) {
    EDIT_MAP_INST.remove();
    EDIT_MAP_INST = null;
    EDIT_PIN = null;
  }

  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  EDIT_MAP_INST = L.map("editMap", { zoomControl: true }).setView([lat, lng], 16);

  const hint = document.getElementById("editMapHint");
  if (hint) hint.textContent = isTouchDevice
    ? "Tap the map to place the pin"
    : "Click the map or drag the pin to move it";

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap",
    maxZoom: 19,
  }).addTo(EDIT_MAP_INST);

  // Draggable on desktop; fixed on mobile (tap-to-place handles it)
  EDIT_PIN = L.marker([lat, lng], { draggable: !isTouchDevice }).addTo(EDIT_MAP_INST);

  if (!isTouchDevice) {
    EDIT_PIN.on("dragend", e => {
      const pos = e.target.getLatLng();
      EDIT_LAT = pos.lat;
      EDIT_LNG = pos.lng;
      document.getElementById("editCoordsDisplay").textContent =
        `${EDIT_LAT.toFixed(5)}, ${EDIT_LNG.toFixed(5)}`;
    });
  }

  // Click/tap always moves pin too
  EDIT_MAP_INST.on("click", e => {
    EDIT_LAT = e.latlng.lat;
    EDIT_LNG = e.latlng.lng;
    EDIT_PIN.setLatLng([EDIT_LAT, EDIT_LNG]);
    document.getElementById("editCoordsDisplay").textContent =
      `${EDIT_LAT.toFixed(5)}, ${EDIT_LNG.toFixed(5)}`;
  });

  setTimeout(() => EDIT_MAP_INST.invalidateSize(), 150);
}

function closeEditModal() {
  document.getElementById("editModalOverlay").classList.remove("active");
  if (EDIT_MAP_INST) { EDIT_MAP_INST.remove(); EDIT_MAP_INST = null; EDIT_PIN = null; }
  EDIT_MARKER_ID = null;
}

async function saveEditModal() {
  const title    = document.getElementById("editTitle").value.trim();
  const catId    = parseInt(document.getElementById("editCategory").value);
  const address  = document.getElementById("editAddress").value.trim();
  const statusEl = document.getElementById("editModalStatus");
  const saveBtn  = document.getElementById("editSaveBtn");

  if (!title) { statusEl.textContent = "Name is required."; return; }

  saveBtn.disabled    = true;
  statusEl.textContent = "Saving…";

  const updates = {
    title,
    category_id: catId,
    address: address || null,
    lat: EDIT_LAT,
    lon: EDIT_LNG,
  };

  const { error } = await sb
    .from("markers")
    .update(updates)
    .eq("id", EDIT_MARKER_ID);

  if (error) {
    statusEl.textContent = "Error: " + error.message;
    saveBtn.disabled     = false;
    return;
  }

  statusEl.textContent = "✅ Saved!";
  setTimeout(() => {
    closeEditModal();
    // Reload places list to reflect changes
    window._placesLoaded = false;
    loadPlaces();
  }, 800);
}

/* ══════════════════════════════════════════
   DEACTIVATE MODAL
══════════════════════════════════════════ */
function openDeactivate(markerId, markerTitle) {
  DEACTIVATE_ID = markerId;
  document.getElementById("deactivateName").textContent      = markerTitle;
  document.getElementById("deactivateStatus").textContent    = "";
  document.getElementById("deactivateConfirmBtn").disabled   = false;
  document.getElementById("deactivateOverlay").classList.add("active");
}

function closeDeactivate() {
  document.getElementById("deactivateOverlay").classList.remove("active");
  DEACTIVATE_ID = null;
}

async function confirmDeactivate() {
  const btn      = document.getElementById("deactivateConfirmBtn");
  const statusEl = document.getElementById("deactivateStatus");
  btn.disabled   = true;
  statusEl.textContent = "Deactivating…";

  const { error } = await sb
    .from("markers")
    .update({ is_active: false })
    .eq("id", DEACTIVATE_ID);

  if (error) {
    statusEl.textContent = "Error: " + error.message;
    btn.disabled = false;
    return;
  }

  statusEl.textContent = "✅ Done";
  setTimeout(() => {
    closeDeactivate();
    // Reload places + refresh stats
    window._placesLoaded = false;
    loadPlaces();
    loadStats();
  }, 600);
}

/* ══════════════════════════════════════════
   COMMENTS TAB
══════════════════════════════════════════ */
async function loadComments() {
  const host = document.getElementById("commentsList");
  if (!host) return;
  if (!USER_ID) { host.innerHTML = `<p class="muted" style="padding:20px 0;">Please log in to see your comments.</p>`; return; }
  host.innerHTML = `<p class="muted" style="padding:20px 0;">Loading…</p>`;

  const { data, error } = await sb
    .from("comments")
    .select("id,body,created_at,marker_id,is_active")
    .eq("user_id", USER_ID)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error || !data?.length) {
    host.innerHTML = `
      <div class="user-empty">
        <div class="user-empty-icon">💬</div>
        <p>${error ? "Error loading comments: " + error.message : "No comments yet."}</p>
      </div>`;
    return;
  }

  // Fetch marker titles + ratings
  const mids = [...new Set(data.map(c => c.marker_id))];
  const { data: mData } = await sb.from("markers")
    .select("id,title,rating_avg,rating_count,category_id")
    .in("id", mids);
  const markerMap = Object.fromEntries((mData || []).map(m => [m.id, m]));

  host.innerHTML = data.map(d => {
    const m = markerMap[d.marker_id] || {};
    const avg = Number(m.rating_avg ?? 0);
    const cnt = Number(m.rating_count ?? 0);
    const scoreColor = cnt ? (avg >= 9 ? "#1e5c3a" : avg >= 7 ? "#4a7c59" : avg >= 5 ? "#c8972a" : avg >= 3 ? "#e76f51" : "#c1440e") : null;
    const scoreBadge = scoreColor
      ? `<div class="vote-score-badge" style="background:${scoreColor};font-size:13px;">${avg.toFixed(1)}</div>`
      : "";
    return `
      <a class="comment-card" href="marker.html?id=${esc(d.marker_id)}">
        <div class="comment-card-head">
          <span class="comment-card-place">${esc(m.title || "Unknown place")}</span>
          <div style="display:flex;align-items:center;gap:8px;">
            ${scoreBadge}
            <span class="comment-card-time">${timeAgo(d.created_at)}</span>
          </div>
        </div>
        <p class="comment-card-body">"${esc(d.body)}"</p>
        <div class="comment-card-foot">Open →</div>
      </a>`;
  }).join("");
}

/* ══════════════════════════════════════════
   PHOTOS TAB
══════════════════════════════════════════ */
async function loadPhotos() {
  const host = document.getElementById("photosList");
  if (!host) return;
  if (!USER_ID) { host.innerHTML = `<p class="muted" style="padding:20px 0;">Please log in to see your photos.</p>`; return; }
  host.innerHTML = `<p class="muted" style="padding:20px 0;">Loading…</p>`;

  const { data, error } = await sb
    .from("marker_photos")
    .select("id,storage_path,created_at,marker_id")
    .eq("user_id", USER_ID)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error || !data?.length) {
    host.innerHTML = `
      <div class="user-empty">
        <div class="user-empty-icon">📷</div>
        <p>${error ? "Error loading photos: " + error.message : "No photos yet."}</p>
      </div>`;
    return;
  }

  // Fetch marker titles for the photos we have
  const mids = [...new Set(data.map(p => p.marker_id))];
  const { data: mData } = await sb
    .from("markers")
    .select("id,title")
    .in("id", mids);
  const titleMap = Object.fromEntries((mData || []).map(m => [m.id, m.title]));

  // Group photos by marker — show first photo, badge for count
  const grouped = {};
  data.forEach(p => {
    if (!grouped[p.marker_id]) grouped[p.marker_id] = [];
    grouped[p.marker_id].push(p);
  });

  host.innerHTML = Object.entries(grouped).map(([mid, photos]) => {
    const first = photos[0];
    const url   = `${SUPABASE_URL_USER}/storage/v1/object/public/marker-photos/${first.storage_path}`;
    const count = photos.length;

    // Build all photo URLs for lightbox
    const allUrls = photos.map(p =>
      `${SUPABASE_URL_USER}/storage/v1/object/public/marker-photos/${p.storage_path}`
    );
    const allIds  = photos.map(p => p.id);
    const allPaths = photos.map(p => p.storage_path);

    const deleteBtns = photos.map((p, pi) => `
      <button class="photo-delete-btn"
        onclick="event.stopPropagation();deletePhoto('${esc(p.id)}','${esc(p.storage_path)}',this)"
        title="Delete photo">✕</button>`).join('');

    const urlsJson  = esc(JSON.stringify(allUrls));
    const idsJson   = esc(JSON.stringify(allIds));
    const pathsJson = esc(JSON.stringify(allPaths));

    return `
      <div class="photo-tile">
        <div class="photo-tile-link" onclick="openLightbox(${JSON.stringify(allUrls)},${JSON.stringify(allIds)},${JSON.stringify(allPaths)},0)">
          <div class="photo-tile-img" style="background-image:url('${esc(url)}');cursor:pointer;">
            ${count > 1 ? `<div class="photo-tile-count">${count}</div>` : ""}
          </div>
        </a>
        <div class="photo-tile-footer">
          <a href="marker.html?id=${esc(mid)}" class="photo-tile-label" onclick="event.stopPropagation()">${esc(titleMap[mid] || "")}</a>
          <div class="photo-tile-actions">${deleteBtns}</div>
        </div>
      </a>`;
  }).join("");
}

/* ── Photo lightbox ── */
let LB_URLS = [], LB_IDS = [], LB_PATHS = [], LB_IDX = 0;

function openLightbox(urls, ids, paths, idx) {
  LB_URLS = urls; LB_IDS = ids; LB_PATHS = paths; LB_IDX = idx;
  const lb = document.getElementById('photoLightbox');
  if (!lb) return;
  lb.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  renderLightbox();
}

function closeLightbox() {
  const lb = document.getElementById('photoLightbox');
  if (lb) lb.style.display = 'none';
  document.body.style.overflow = '';
}

function lbNav(dir) {
  LB_IDX = (LB_IDX + dir + LB_URLS.length) % LB_URLS.length;
  renderLightbox();
}

function renderLightbox() {
  document.getElementById('lbImg').src = LB_URLS[LB_IDX];
  document.getElementById('lbCounter').textContent = LB_URLS.length > 1
    ? `${LB_IDX + 1} / ${LB_URLS.length}` : '';
  document.getElementById('lbNav').style.display = LB_URLS.length > 1 ? 'flex' : 'none';
}

async function deletePhoto(photoId, storagePath, btn) {
  if (!confirm("Delete this photo?")) return;
  btn.disabled = true;
  btn.textContent = "…";

  // Soft delete in DB
  const { error } = await sb.from("marker_photos")
    .update({ is_active: false })
    .eq("id", photoId);

  if (error) { btn.textContent = "✕"; btn.disabled = false; alert("Could not delete photo"); return; }

  // Remove tile from DOM — if last photo for this place, remove whole tile
  const tile = btn.closest(".photo-tile");
  const remaining = tile.querySelectorAll(".photo-delete-btn:not([disabled])").length;
  if (remaining <= 1) {
    tile.style.opacity = "0";
    tile.style.transition = "opacity 0.2s";
    setTimeout(() => tile.remove(), 200);
  } else {
    btn.closest(".photo-delete-btn").remove();
    // Update count badge
    const countBadge = tile.querySelector(".photo-tile-count");
    if (countBadge) {
      const newCount = remaining - 1;
      if (newCount > 1) countBadge.textContent = newCount;
      else countBadge.remove();
    }
  }
}

function hideEmptyTabs() {
  // Hide comments tab if no comments
  const comments = document.getElementById("commentsList");
  const commentsTab = document.querySelector('[data-tab="comments"]');
  if (commentsTab && comments && !comments.children.length) {
    commentsTab.style.display = "none";
  }
  // Hide photos tab if no photos
  const photos = document.getElementById("photosList");
  const photosTab = document.querySelector('[data-tab="photos"]');
  if (photosTab && photos && !photos.children.length) {
    photosTab.style.display = "none";
  }
}
