// marker.js v6 — multi-category context aware

let MARKER_ID = null;
let ACTIVE_CATEGORY_ID = null;
let CURRENT_MARKER = null;
let CURRENT_VOTE = null;
let CURRENT_VOTE_ID = null;

let CATEGORIES_ALL = [];
let BRANDS = [];
let CATEGORY_BRANDS = [];
let MARKER_CATEGORIES = [];
let CHAINS_ALL = [];       // all chains (for lookup by id)

let miniMapInstance = null;
// City is stored directly on place markers (null for products)
// Products never filter by city
function markerCity(m) { return m?.city || null; }


function qp(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function setStatus(msg) {
  const el = document.getElementById("pageStatus");
  if (el) el.textContent = msg || "";
}

function setVoteStatus(msg) {
  const el = document.getElementById("voteStatus");
  if (el) el.textContent = msg || "";
}

function setEditStatus(msg) {
  const el = document.getElementById("editStatus");
  if (el) el.textContent = msg || "";
}

function formatDate(iso) {
  return (iso || "").replace("T"," ").slice(0,16);
}

function colorClass(avg, cnt) {
  if (!Number(cnt)) return "rating-none";
  const x = Number(avg);
  if (x >= 9) return "rating-9-10";
  if (x >= 7) return "rating-7-8";
  if (x >= 5) return "rating-5-6";
  if (x >= 3) return "rating-3-4";
  return "rating-1-2";
}

function barClass(avg, cnt) {
  return colorClass(avg, cnt).replace("rating-","bar-");
}

function getCategoryById(id) {
  return CATEGORIES_ALL.find(c => c.id === id) || null;
}
function getBrandById(id) {
  return BRANDS.find(b => b.id === id) || null;
}
function brandsForCategory(category_id) {
  if (!category_id) return BRANDS.filter(b => b.is_active);
  const allowed = new Set(
    CATEGORY_BRANDS.filter(cb => cb.category_id === category_id && cb.is_active).map(cb => cb.brand_id)
  );
  return BRANDS.filter(b => b.is_active && allowed.has(b.id));
}

/* ══════════════════════════════
   RENDER HERO
══════════════════════════════ */
function renderHero(m, user) {
  document.title = `${m.title} — The Best Again`;

  const activeCatId = ACTIVE_CATEGORY_ID || m.category_id;
  const cat = getCategoryById(activeCatId) || getCategoryById(m.category_id);
  const isPlace = m.group_type === "place";
  const isAdmin = user?.email?.includes("dropisso");
  const isCreator = user && (m.created_by === user.id || m.created_by === null || isAdmin);

  // Breadcrumb: Category > Place/Product
  const breadcrumbEl = document.getElementById("mkBreadcrumb");
  if (breadcrumbEl) {
    const catLink = cat
      ? `<a href="map.html">${escapeHtml(cat.name)}</a>`
      : (isPlace ? "Place" : "Product");
    breadcrumbEl.innerHTML = `<a href="index.html">Home</a><span>›</span>${catLink}`;
  }

  // Title
  const titleEl = document.getElementById("markerTitle");
  if (titleEl) {
    titleEl.textContent = m.title;
    // Edit button moved to side actions
  }

  // Meta line: category · brand · address snippet
  const metaEl = document.getElementById("mkMeta");
  if (metaEl) {
    const parts = [];
    if (cat) parts.push(escapeHtml(cat.name));
    if (!isPlace && m.brand_id) {
      const brand = getBrandById(m.brand_id);
      if (brand) parts.push(escapeHtml(brand.name));
    }
    if (!isPlace && m.product_name) parts.push(escapeHtml(m.product_name));
    if (isPlace && m.city) {
      // Use the city code nicely
      const cityLabel = m.city === "BCN" ? "Barcelona" : m.city === "MAD" ? "Madrid" : m.city;
      parts.push(escapeHtml(cityLabel));
    }
    if (isPlace && m.chain_id) {
      const chain = CHAINS_ALL.find(ch => ch.id === m.chain_id);
      if (chain) parts.push(`⛓ ${escapeHtml(chain.name)}`);
    }
    metaEl.textContent = parts.join(" · ");
  }

  // Placeholder icon (shown when no photos)
  const placeholderIcon = document.getElementById("mkPhotoPlaceholderIcon");
  if (placeholderIcon && cat?.icon_url) {
    const iconUrl = cat.icon_url.startsWith("http") ? cat.icon_url
      : window.location.href.replace(/\/[^/]*(\?.*)?$/, "/") + cat.icon_url;
    placeholderIcon.innerHTML = `<img src="${escapeHtml(iconUrl)}" style="width:64px;height:64px;object-fit:contain;opacity:0.25;" onerror="this.parentNode.textContent='🍽'" />`;
  }

  // Side actions (wishlist, claim, edit)
  const sideActions = document.getElementById("mkSideActions");
  if (sideActions) {
    let btns = "";
    if (isPlace) {
      btns += `<a class="mk-side-action-btn mk-side-action-primary" href="claim.html?id=${encodeURIComponent(MARKER_ID)}">🏢 Claim this place</a>`;
    }
    btns += `<button class="mk-side-action-btn mk-side-action-ghost" onclick="shareMarker()">↗ Share</button>`;
    btns += `<span class="mk-wl-wrap">${wlBtnHtml(m.id)}</span>`;
    if (isCreator) {
      btns += `<button class="mk-side-action-btn mk-side-action-subtle" onclick="enterEditMode()">✏️ Edit</button>`;
    }
    sideActions.innerHTML = btns;
  }

  // Admin/creator edit button goes in side actions (#18 - single edit button)
  // (no separate admin row needed)

}

// Get rating for the active category, fall back to overall marker rating
function getActiveCatRating(m) {
  const catId = ACTIVE_CATEGORY_ID || m.category_id;
  const mc = MARKER_CATEGORIES.find(r => r.category_id === catId);
  if (mc && Number(mc.rating_count ?? 0) > 0) {
    return { avg: Number(mc.rating_avg ?? 0), count: Number(mc.rating_count ?? 0) };
  }
  return { avg: Number(m.rating_avg ?? 0), count: Number(m.rating_count ?? 0) };
}

// Render "Also here for" chips linking to other categories this marker belongs to
function renderOtherCategoryChips(m, activeCatId) {
  let el = document.getElementById("otherCatChips");
  if (!el) {
    el = document.createElement("div");
    el.id = "otherCatChips";
    el.className = "other-cat-chips";
    const subtitle = document.getElementById("markerSubtitle");
    if (subtitle && subtitle.parentNode) subtitle.parentNode.insertBefore(el, subtitle.nextSibling);
  }
  if (!MARKER_CATEGORIES.length) { el.style.display = "none"; return; }
  const otherCats = MARKER_CATEGORIES.filter(mc => mc.category_id !== activeCatId);
  if (!otherCats.length) { el.style.display = "none"; return; }
  el.style.display = "flex";
  el.innerHTML = `<span class="other-cat-label">Also here for:</span>` +
    otherCats.map(mc => {
      const c = getCategoryById(mc.category_id);
      if (!c) return "";
      const iconUrl = c.icon_url || "";
      const absUrl = iconUrl.startsWith("http") ? iconUrl
        : window.location.href.replace(/\/[^/]*(\?.*)?$/, '/') + iconUrl;
      const href = `marker.html?id=${encodeURIComponent(m.id)}&cat=${mc.category_id}`;
      return `<a class="other-cat-chip" href="${href}" title="${escapeHtml(c.name)}"><img src="${escapeHtml(absUrl)}" alt="${escapeHtml(c.name)}" /><span>${escapeHtml(c.name)}</span></a>`;
    }).join("");
}

/* ══════════════════════════════
   SEO — dynamic meta update
══════════════════════════════ */
function updatePageSEO(m) {
  const cat  = getCategoryById(m.category_id);
  const brand = getBrandById(m.brand_id);

  const catName   = cat?.name   || "";
  const brandName = brand?.name || "";
  const { avg: seoAvg } = getActiveCatRating(m);
  const score     = seoAvg ? `${Number(seoAvg).toFixed(1)}/10` : "";
  const location  = m.address   ? ` · ${m.address}` : "";

  // Build title: "El Fanalet · Best Croissant de Chocolate · 8.2/10 — The Best Again"
  const parts = [m.title, catName, score].filter(Boolean);
  const title = parts.join(" · ") + " — The Best Again";

  const desc = [
    `${m.title} rated ${score || "unrated"}`,
    catName ? `in the ${catName} category` : "",
    brandName ? `by ${brandName}` : "",
    location,
    "— Discover and vote on the best local food spots and products."
  ].filter(Boolean).join(" ");

  document.title = title;
  const url = window.location.href;

  const set = (id, attr, val) => { const el = document.getElementById(id); if (el) el.setAttribute(attr, val); };
  const setName = (name, val) => { const el = document.querySelector(`meta[name="${name}"]`); if (el) el.setAttribute("content", val); };
  const setProp = (prop, val) => { const el = document.querySelector(`meta[property="${prop}"]`); if (el) el.setAttribute("content", val); };

  setName("description", desc);
  setProp("og:title", title);
  setProp("og:description", desc);
  setProp("og:url", url);

  // GA4 — track page view with marker context
  if (typeof gtag !== "undefined") {
    gtag("event", "page_view", {
      page_title: title,
      page_location: url,
      marker_id: m.id,
      marker_type: m.group_type,
      category: catName,
    });
  }
}

/* ══════════════════════════════
   SHARE
══════════════════════════════ */
function shareMarker() {
  const url   = window.location.href;
  const title = document.title.replace(" — The Best Again", "");
  const text  = `Check this out on The Best Again: ${title}`;

  // Native share API (mobile)
  if (navigator.share) {
    navigator.share({ title, text, url }).catch(() => {});
    return;
  }
  // Fallback: toggle share panel
  const panel = document.getElementById("sharePanel");
  if (!panel) return;
  const isOpen = panel.dataset.open === "1";
  panel.dataset.open = isOpen ? "0" : "1";
  panel.style.display = isOpen ? "none" : "flex";
}

function copyMarkerLink() {
  navigator.clipboard.writeText(window.location.href).then(() => {
    const btn = document.getElementById("shareCopyBtn");
    if (btn) { btn.textContent = "✓ Copied!"; setTimeout(() => btn.textContent = "Copy link", 2000); }
  });
}

async function reactivateMarker() {
  if (!confirm('Reactivate this marker? It will appear again in the map, list and rankings.')) return;
  setStatus('Reactivating…');

  const { error } = await sb
    .from('markers')
    .update({ is_active: true })
    .eq('id', MARKER_ID);

  if (error) { setStatus('Error: ' + error.message); return; }

  // Reload the page to show full UI
  window.location.reload();
}

/* ══════════════════════════════
   RENDER RATING CARD
══════════════════════════════ */
function renderRating(m, rankPos, rankTotal) {
  const { avg, count: cnt } = getActiveCatRating(m);
  const displayAvg = cnt ? avg.toFixed(1) : "—";
  const activeCatId = ACTIVE_CATEGORY_ID || m.category_id;
  const cat = getCategoryById(activeCatId) || getCategoryById(m.category_id);

  let scoreClass = "score-none";
  if (cnt) {
    const x = Number(avg);
    if (x >= 8) scoreClass = "score-high";
    else if (x >= 6) scoreClass = "score-mid";
    else scoreClass = "score-low";
  }

  const scoreBlock = document.getElementById("mkScoreBlock");
  if (scoreBlock) {
    // Sub-line: votes count + your vote on same line if voted, or login prompt if not
    let subLine = "";
    if (CURRENT_VOTE !== null) {
      subLine = `<div class="mk-score-sub">${cnt} vote${cnt !== 1 ? "s" : ""} · Your vote: <strong>${Number(CURRENT_VOTE).toFixed(1)}</strong></div>`;
    } else if (!window._mkUser) {
      subLine = `<div class="mk-score-sub">${cnt} vote${cnt !== 1 ? "s" : ""} · <a class="mk-score-vote-prompt" href="login.html?redirect=${encodeURIComponent(location.href)}">Vote →</a></div>`;
    } else {
      subLine = `<div class="mk-score-sub">${cnt} vote${cnt !== 1 ? "s" : ""}</div>`;
    }
    scoreBlock.innerHTML = `
      <div class="mk-score-number ${scoreClass}">${escapeHtml(displayAvg)}</div>
      ${subLine}
    `;
  }

  if (rankPos && rankTotal) {
    const ctx = document.getElementById("mkContextLine");
    if (ctx) {
      const catName = cat ? escapeHtml(cat.name) : "";
      const verdict = rankPos === 1 ? "The Best Again 🏆" :
                      rankPos <= 3    ? "Top pick" :
                      rankPos <= Math.ceil(rankTotal * 0.25) ? "Highly rated" :
                      rankPos <= Math.ceil(rankTotal * 0.55) ? "Worth a visit" : "Has its fans";
      const isNumber1 = rankPos === 1;
      ctx.innerHTML = `
        <span class="mk-context-rank${isNumber1 ? ' mk-context-rank-gold' : ''}">#${rankPos} of ${rankTotal}</span>
        <span class="mk-context-sep">·</span>
        <span>${catName}</span>
        <span class="mk-context-sep">·</span>
        <span class="mk-context-verdict${isNumber1 ? ' mk-context-verdict-gold' : ''}">${verdict}</span>
      `;
      ctx.style.display = "flex";
    }
  }
}

/* ══════════════════════════════
   RENDER VOTE BUTTONS
══════════════════════════════ */
function renderVoteButtons() {
  const wrap = document.getElementById("voteBtns");
  if (!wrap) return;
  wrap.innerHTML = "";

  for (let i = 1; i <= 10; i++) {
    const btn = document.createElement("button");
    btn.className = "vote-btn" + (CURRENT_VOTE === i ? " selected" : "");
    btn.textContent = String(i);
    btn.onclick = () => selectVote(i);
    wrap.appendChild(btn);
  }

  // Label changes based on whether user has voted
  const label = document.querySelector(".mk-vote-label");
  if (label) label.textContent = CURRENT_VOTE !== null ? "Your vote:" : "Rate:";

  const removeBtn = document.getElementById("btnClearVote");
  if (removeBtn) removeBtn.style.display = CURRENT_VOTE !== null ? "inline-flex" : "none";

  // Hide save button when no pending change
  const saveBtn = document.querySelector(".mk-vote-save");
  if (saveBtn) saveBtn.style.display = CURRENT_VOTE !== null ? "inline" : "none";
}

function selectVote(v) {
  CURRENT_VOTE = v;
  renderVoteButtons();
  renderRating(CURRENT_MARKER);
}

/* ══════════════════════════════
   RENDER DETAILS
══════════════════════════════ */
function renderDetails(m, creatorName) {
  const isPlace = m.group_type === "place";
  const cat = getCategoryById(m.category_id);
  const brand = getBrandById(m.brand_id);

  const rows = [];

  // Address shown under map — not duplicated in details
  if (!isPlace && brand) {
    rows.push({ key: "Brand", val: escapeHtml(brand.name) });
  }
  if (!isPlace && m.product_name) {
    rows.push({ key: "Product", val: escapeHtml(m.product_name) });
  }
  if (cat) {
    rows.push({ key: "Category", val: escapeHtml(cat.name) });
  }
  if (isPlace && m.chain_id) {
    const chain = CHAINS_ALL.find(c => c.id === m.chain_id);
    if (chain) rows.push({ key: "Chain", val: escapeHtml(chain.name) });
  }
  // Added/By removed per UX improvement
  if (!m.is_active) {
    rows.push({ key: "Status", val: `<span style="color:#ef4444;font-weight:900;">Inactive</span>` });
  }

  document.getElementById("detailsContent").innerHTML = rows.map(r => `
    <div class="mk-detail-row">
      <div class="mk-detail-label">${r.key}</div>
      <div class="mk-detail-value">${r.val}</div>
    </div>
  `).join("");
}

/* ══════════════════════════════
   MINI MAP
══════════════════════════════ */
function renderMiniMap(m) {
  const lat = Number(m.lat);
  const lon = Number(m.lon);
  if (!m.lat || !m.lon || isNaN(lat) || isNaN(lon)) return;

  const card = document.getElementById("miniMapCard");
  if (card) card.style.display = "block";

  // Set address text
  const addrEl = document.getElementById("miniMapAddress");
  if (m.address) addrEl.textContent = "📍 " + m.address;

  // Init Leaflet map
  if (miniMapInstance) {
    miniMapInstance.remove();
    miniMapInstance = null;
  }
  setTimeout(() => {
    miniMapInstance = L.map("miniMap", { zoomControl: true, scrollWheelZoom: false })
      .setView([lat, lon], 15);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors"
    }).addTo(miniMapInstance);

    L.marker([lat, lon])
      .addTo(miniMapInstance)
      .bindPopup(escapeHtml(m.title))
      .openPopup();
  }, 50);
}

/* ══════════════════════════════
   RANKING WIDGET
══════════════════════════════ */
async function renderRankingWidget(m) {
  const card = document.getElementById("rankingCard");
  const activeCatId = ACTIVE_CATEGORY_ID || m.category_id;
  const cat = getCategoryById(activeCatId) || getCategoryById(m.category_id);
  if (!cat) return;

  // Load all markers in this category via marker_categories
  const { data: mcData } = await sb
    .from("marker_categories")
    .select("marker_id")
    .eq("category_id", activeCatId)
    .eq("is_active", true);

  let markerIds = (mcData || []).map(r => r.marker_id);
  if (!markerIds.length) return;

  const currentCity = markerCity(m); // null for products → no city filter

  // Build markers query — filter by city if it's a place
  let markersQ = sb.from("markers")
    .select("id,title,rating_avg,rating_count,brand_id,city")
    .eq("is_active", true)
    .eq("group_type", m.group_type)
    .in("id", markerIds)
    .order("rating_avg", { ascending: false });
  if (currentCity) markersQ = markersQ.eq("city", currentCity);
  const { data, error } = await markersQ;

  if (error || !data?.length) return;

  // Sort: avg desc, count as tiebreaker
  const sorted = data.slice().sort((a, b) => {
    const diff = Number(b.rating_avg ?? 0) - Number(a.rating_avg ?? 0);
    if (diff !== 0) return diff;
    return Number(b.rating_count ?? 0) - Number(a.rating_count ?? 0);
  });

  const currentIdx = sorted.findIndex(r => r.id === m.id);
  // If not found (e.g. current marker filtered out), insert it at the end
  if (currentIdx === -1) {
    sorted.push({ id: m.id, title: m.title, rating_avg: m.rating_avg, rating_count: m.rating_count, brand_id: m.brand_id, city: m.city });
  }
  const resolvedIdx = currentIdx === -1 ? sorted.length - 1 : currentIdx;
  const position = resolvedIdx + 1;
  const total = sorted.length;
  renderRating(m, position, total);

  // Show full ranking section
  const section = document.getElementById("mkRankingSection");
  if (section) {
    section.style.display = "block";

    // Title
    const titleEl = document.getElementById("mkRankingTitle");
    if (titleEl) titleEl.textContent = `${escapeHtml(cat.name)} · ${m.group_type === "place" ? "BCN" : ""}`;

    // Edit link
    const editLink = document.getElementById("editVotesCatLink");
    if (editLink) editLink.style.display = "none"; // removed - vote inline on this page

    // Full ranked list (not windowed)
    const listEl = document.getElementById("rankingList");
    if (listEl) {
      const maxAvg = Number(sorted[0]?.rating_avg ?? 0) || 10;
      const WINDOW = 3; // rows above/below current
      const SHOW_FULL_THRESHOLD = 8; // if total <= this, show all
      const showAll = sorted.length <= SHOW_FULL_THRESHOLD;

      function buildRow(r, i) {
        const pos = i + 1;
        const avg = Number(r.rating_avg ?? 0);
        const cnt = Number(r.rating_count ?? 0);
        const pct = maxAvg > 0 ? Math.round((avg / maxAvg) * 100) : 0;
        const scoreText = cnt ? avg.toFixed(1) : "—";
        const isCurrent = r.id === m.id;
        let name = r.title;
        if (m.group_type === "product" && r.brand_id) name = getBrandById(r.brand_id)?.name || r.title;
        const href = `marker.html?id=${encodeURIComponent(r.id)}&cat=${encodeURIComponent(activeCatId)}`;
        const voteBtn = (window._mkUser && !isCurrent)
          ? `<a class="mk-rank-vote-btn" href="${href}" title="Vote">Vote</a>`
          : "";
        return `<a class="mk-rank-row ${isCurrent ? "mk-rank-current" : ""}" href="${href}" id="${isCurrent ? "mkCurrentRankRow" : ""}">
          <div class="mk-rank-pos">${pos}</div>
          <div class="mk-rank-info">
            <div class="mk-rank-name">${escapeHtml(name)}</div>
            <div class="mk-rank-bar-wrap"><div class="mk-rank-bar" style="width:${cnt ? pct : 0}%"></div></div>
          </div>
          <div class="mk-rank-score ${cnt ? "" : "mk-rank-score-none"}">${escapeHtml(scoreText)}</div>
          ${voteBtn}
        </a>`;
      }

      // Render full scrollable list — simpler and always correct
      listEl.innerHTML = sorted.map((r, i) => buildRow(r, i)).join("");
      listEl.classList.add("mk-ranking-scroll");

      // Hide see-all link (not needed with scrollable list)
      const seeAllEl = document.getElementById("mkRankingSeeAll");
      if (seeAllEl) seeAllEl.style.display = "none";

      // Scroll current row into view after render
      setTimeout(() => {
        const row = document.getElementById("mkCurrentRankRow");
        if (row) row.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 150);
    }
  }

  // Also update legacy card if exists
  if (card) card.style.display = "none"; // hide old card
}

/* ══════════════════════════════
   MORE FROM THIS BRAND
══════════════════════════════ */
async function renderMoreFromBrand(m) {
  const card = document.getElementById("moreBrandCard");
  if (!card || m.group_type !== "product" || !m.brand_id) return;

  const brand = getBrandById(m.brand_id);
  if (!brand) return;

  // Load all active products from same brand, excluding current marker
  const { data, error } = await sb
    .from("markers")
    .select("id,title,rating_avg,rating_count,category_id,product_name,brand_id")
    .eq("is_active", true)
    .eq("group_type", "product")
    .eq("brand_id", m.brand_id)
    .neq("id", MARKER_ID)
    .order("rating_avg", { ascending: false });

  if (error || !data?.length) return;

  document.getElementById("moreBrandHead").textContent = `More from ${brand.name}`;

  const activeCatId = ACTIVE_CATEGORY_ID || m.category_id;
  document.getElementById("moreBrandList").innerHTML = data.map(r => {
    const avg = Number(r.rating_avg ?? 0);
    const cnt = Number(r.rating_count ?? 0);
    const cls = colorClass(avg, cnt);
    const scoreText = cnt ? avg.toFixed(1) : "—";
    const cat = getCategoryById(r.category_id);
    const displayName = r.product_name
      ? `${escapeHtml(cat?.name || "")} · ${escapeHtml(r.product_name)}`
      : escapeHtml(cat?.name || r.title);
    const href = `marker.html?id=${encodeURIComponent(r.id)}&cat=${r.category_id}`;
    return `
      <a class="rank-row" href="${href}">
        <div class="rank-name">${displayName}</div>
        <div class="rank-score ${cls}">${escapeHtml(scoreText)}</div>
      </a>`;
  }).join("");

  card.style.display = "block";
}

/* ══════════════════════════════
   OTHERS FROM THIS CHAIN
══════════════════════════════ */
async function renderOthersFromChain(m) {
  const section = document.getElementById("moreChainCard");
  if (!section || m.group_type !== "place" || !m.chain_id) return;

  const chain = CHAINS_ALL.find(c => c.id === m.chain_id);
  if (!chain) return;

  const activeCatId = ACTIVE_CATEGORY_ID || m.category_id;

  // All locations from same chain, excluding current marker
  const { data, error } = await sb
    .from("markers")
    .select("id,title,rating_avg,rating_count,address,city")
    .eq("is_active", true)
    .eq("group_type", "place")
    .eq("chain_id", m.chain_id)
    .neq("id", MARKER_ID)
    .order("rating_avg", { ascending: false });

  if (error || !data?.length) { section.style.display = "none"; return; }

  // Update title
  const headEl = document.getElementById("moreChainHead");
  if (headEl) headEl.textContent = `Other ${chain.name} locations`;

  // Render as horizontal scroll pills — same style as "Also here for"
  const listEl = document.getElementById("moreChainList");
  if (!listEl) return;

  listEl.className = "mk-also-scroll";
  listEl.innerHTML = data.map(r => {
    const avg = Number(r.rating_avg ?? 0);
    const cnt = Number(r.rating_count ?? 0);
    const score = cnt ? avg.toFixed(1) : "—";
    // Short address: just street name
    const street = r.address ? r.address.split(",")[0].trim() : "";
    const cityLabel = r.city === "BCN" ? "Barcelona" : r.city === "MAD" ? "Madrid" : (r.city || "");
    const href = `marker.html?id=${encodeURIComponent(r.id)}&cat=${activeCatId}`;
    return `
      <a class="mk-also-pill mk-chain-pill" href="${href}">
        <span class="mk-chain-pill-addr">${escapeHtml(street || cityLabel)}</span>
        <span class="mk-also-pill-score">${escapeHtml(score)}</span>
      </a>`;
  }).join("");

  section.style.display = "block";
}

/* ══════════════════════════════
   ALSO WORTH TRYING
══════════════════════════════ */
async function renderAlsoAtThisPlace(m) {
  const activeCatId = ACTIVE_CATEGORY_ID || m.category_id;
  const otherCats = MARKER_CATEGORIES.filter(mc => mc.category_id !== activeCatId && mc.is_active);

  const section = document.getElementById("alsoSection");
  if (!section) return;

  if (!otherCats.length) { section.style.display = "none"; return; }

  // Fetch actual per-category ratings from votes table
  const catIds = otherCats.map(mc => mc.category_id);
  const { data: voteData } = await sb.from("votes")
    .select("category_id, vote")
    .eq("marker_id", MARKER_ID)
    .in("category_id", catIds)
    .eq("is_active", true);

  // Build avg per category from votes
  const votesMap = {};
  (voteData || []).forEach(v => {
    if (!votesMap[v.category_id]) votesMap[v.category_id] = { sum: 0, cnt: 0 };
    votesMap[v.category_id].sum += Number(v.vote);
    votesMap[v.category_id].cnt++;
  });

  // Fall back to marker_categories rating if votes not available
  const getScore = (catId) => {
    const vm = votesMap[catId];
    if (vm && vm.cnt > 0) return (vm.sum / vm.cnt).toFixed(1);
    const mc = MARKER_CATEGORIES.find(x => x.category_id === catId);
    const avg = Number(mc?.rating_avg ?? 0);
    const cnt = Number(mc?.rating_count ?? 0);
    return cnt ? avg.toFixed(1) : "—";
  };

  const items = otherCats.map(mc => {
    const cat = getCategoryById(mc.category_id);
    if (!cat) return null;
    const score = getScore(mc.category_id);
    const href = `marker.html?id=${encodeURIComponent(m.id)}&cat=${mc.category_id}`;
    const iconUrl = cat.icon_url
      ? (cat.icon_url.startsWith("http") ? cat.icon_url
          : window.location.href.replace(/\/[^/]*(\?.*)?$/, "/") + cat.icon_url)
      : "";
    return { cat, score, href, iconUrl };
  }).filter(Boolean);

  if (!items.length) {
    section.style.display = "none";
    return;
  }

  // Update section title
  const titleEl = section.querySelector(".mk-section-title");
  if (titleEl) titleEl.textContent = "Also here for";

  // Hide see all link — not relevant for this section
  const seeAll = document.getElementById("alsoSeeAllLink");
  if (seeAll) seeAll.style.display = "none";

  const grid = document.getElementById("alsoGrid");
  if (!grid) return;

  grid.className = "mk-also-scroll"; // horizontal scroll
  grid.innerHTML = items.map(({ cat, score, cnt, href, iconUrl }) => `
    <a class="mk-also-pill" href="${href}">
      ${iconUrl ? `<img class="mk-also-pill-icon" src="${escapeHtml(iconUrl)}" alt="" onerror="this.style.display='none'" />` : ""}
      <span class="mk-also-pill-name">${escapeHtml(cat.name)}</span>
      <span class="mk-also-pill-score">${escapeHtml(score)}</span>
    </a>`).join("");

  section.style.display = "block";
}

/* ══════════════════════════════
   VOTE ACTIONS
══════════════════════════════ */
async function loadMyVote(user) {
  const catId = ACTIVE_CATEGORY_ID || CURRENT_MARKER?.category_id;
  let q = sb.from("votes").select("id,vote,is_active")
    .eq("marker_id", MARKER_ID).eq("user_id", user.id);
  if (catId) q = q.eq("category_id", catId);
  const { data, error } = await q.maybeSingle();

  if (error) { setVoteStatus("Error loading vote."); return; }

  if (data?.is_active) {
    CURRENT_VOTE    = Number(data.vote);
    CURRENT_VOTE_ID = data.id;
    setVoteStatus(`Your current vote: ${CURRENT_VOTE}`);
  } else {
    CURRENT_VOTE    = null;
    CURRENT_VOTE_ID = data?.id || null;
    setVoteStatus("No vote yet.");
  }

  renderVoteButtons();
  renderRating(CURRENT_MARKER);
  // Show current float vote (#6)
  const statusEl = document.getElementById("voteStatus");
  if (statusEl && CURRENT_VOTE !== null) {
    const actual = data?.vote ? Number(data.vote) : CURRENT_VOTE;
    if (actual !== Math.round(actual)) {
      statusEl.textContent = `Current: ${actual.toFixed(1)} (shown as ${Math.round(actual)} above)`;
    }
  }
}

async function saveMyVote() {
  if (CURRENT_VOTE === null) { setVoteStatus("Select a score first."); return; }

  setVoteStatus("Saving…");
  const allowed = await softLoginNudge("Sign in to vote and track your scores across all your favourite spots.");
  if (!allowed) { setVoteStatus(""); return; }
  const user = await maybeUser();

  const catId = ACTIVE_CATEGORY_ID || CURRENT_MARKER?.category_id;

  const { error } = await sb
    .from("votes")
    .upsert(
      [{ marker_id: MARKER_ID, user_id: user.id, vote: CURRENT_VOTE, category_id: catId, is_active: true }],
      { onConflict: "marker_id,category_id,user_id" }
    );

  if (error) { setVoteStatus("Error: " + error.message); return; }

  if (typeof gtag !== "undefined") {
    gtag("event", "vote_cast", {
      marker_id:    MARKER_ID,
      marker_title: CURRENT_MARKER?.title || "",
      category_id:  catId,
      vote_value:   CURRENT_VOTE
    });
  }

  setVoteStatus("Saved ✅");
  await refreshMarker();
  renderVoteButtons();
  renderRating(CURRENT_MARKER);
}

async function clearMyVote() {
  if (!confirm("Remove your vote?")) return;
  setVoteStatus("Removing…");

  const user = await requireAuth();
  if (!user) return;

  const catId = ACTIVE_CATEGORY_ID || CURRENT_MARKER?.category_id;
  let q = sb.from("votes").update({ is_active: false })
    .eq("marker_id", MARKER_ID).eq("user_id", user.id);
  if (catId) q = q.eq("category_id", catId);
  const { error } = await q;

  if (error) { setVoteStatus("Error: " + error.message); return; }

  CURRENT_VOTE = null;
  setVoteStatus("Removed ✅");
  await refreshMarker();
  renderVoteButtons();
  renderRating(CURRENT_MARKER);
}

async function refreshMarker() {
  const { data } = await sb
    .from("markers")
    .select("id,title,group_type,category_id,brand_id,rating_manual,rating_avg,rating_count,address,lat,lon,city,is_active,created_at,created_by")
    .eq("id", MARKER_ID)
    .single();
  if (data) CURRENT_MARKER = data;
}

/* ══════════════════════════════
   EDIT MODE
══════════════════════════════ */
function categoriesForGroup(group_type) {
  return group_type === "product"
    ? CATEGORIES_ALL.filter(c => c.for_products)
    : CATEGORIES_ALL.filter(c => c.for_places);
}

function renderCategoryOptions(group_type, selectedId) {
  const sel = document.getElementById("e_category");
  if (!sel) return;
  sel.innerHTML = categoriesForGroup(group_type)
    .map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  if (selectedId != null) sel.value = String(selectedId);
}

function renderBrandOptions(selectedId, category_id) {
  const sel = document.getElementById("e_brand");
  if (!sel) return;
  const filtered = brandsForCategory(category_id || null);
  sel.innerHTML = filtered.length
    ? filtered.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join("")
    : `<option value="">No brands for this category</option>`;
  if (selectedId != null) sel.value = String(selectedId);
}

function showBrandRow(show) {
  const row = document.getElementById("brandRow");
  if (row) row.style.display = show ? "flex" : "none";
}

function computeProductTitle(category_id, brand_id) {
  const c = CATEGORIES_ALL.find(x => x.id === parseInt(category_id));
  const b = BRANDS.find(x => x.id === parseInt(brand_id));
  return `${c?.name || ""} · ${b?.name || ""}`.trim();
}

function setTitleReadonly(isProduct) {
  const el = document.getElementById("e_title");
  if (!el) return;
  el.disabled = isProduct;
  el.style.opacity = isProduct ? "0.7" : "1";
}

function onEditGroupChanged() {
  const g = document.getElementById("e_group_type").value;
  showBrandRow(g === "product");
  renderCategoryOptions(g, null);
  setTitleReadonly(g === "product");
  // Show product_name only for products, chain only for places
  const pnRow = document.getElementById("productNameRow");
  const chainRow = document.getElementById("chainRow");
  if (pnRow) pnRow.style.display = g === "product" ? "" : "none";
  if (chainRow) chainRow.style.display = g === "place" ? "" : "none";
  if (g === "product") {
    const cat_id = parseInt(document.getElementById("e_category").value) || null;
    renderBrandOptions(null, cat_id);
    document.getElementById("e_title").value = computeProductTitle(
      document.getElementById("e_category").value,
      document.getElementById("e_brand").value
    );
  }
}

function onEditCategoryChanged() {
  const g = document.getElementById("e_group_type").value;
  if (g !== "product") return;
  const cat_id = parseInt(document.getElementById("e_category").value) || null;
  renderBrandOptions(null, cat_id);
  document.getElementById("e_title").value = computeProductTitle(
    document.getElementById("e_category").value,
    document.getElementById("e_brand").value
  );
}

function onEditBrandChanged() {
  if (document.getElementById("e_group_type").value !== "product") return;
  document.getElementById("e_title").value = computeProductTitle(
    document.getElementById("e_category").value,
    document.getElementById("e_brand").value
  );
}

function fillSelect1to10(id, def = 7) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = "";
  for (let i = 1; i <= 10; i++) {
    const o = document.createElement("option");
    o.value = String(i);
    o.textContent = String(i);
    if (i === def) o.selected = true;
    sel.appendChild(o);
  }
}

function fillEditForm() {
  const m = CURRENT_MARKER;
  document.getElementById("e_title").value = m.title || "";
  document.getElementById("e_group_type").value = m.group_type || "place";
  renderCategoryOptions(m.group_type || "place", m.category_id);
  renderBrandOptions(m.brand_id, m.category_id);
  showBrandRow(m.group_type === "product");
  setTitleReadonly(m.group_type === "product");
  document.getElementById("e_address").value = m.address || "";
  document.getElementById("e_lat").value = m.lat ?? "";
  document.getElementById("e_lon").value = m.lon ?? "";

  // product_name field
  const pnField = document.getElementById("e_product_name");
  if (pnField) {
    pnField.value = m.product_name || "";
    pnField.closest(".edit-row")?.style.setProperty("display", m.group_type === "product" ? "" : "none");
  }

  // chain field (places only)
  const chainField = document.getElementById("e_chain_id");
  if (chainField) {
    chainField.innerHTML = `<option value="">— No chain —</option>` +
      CHAINS_ALL.filter(c => c.is_active).map(c =>
        `<option value="${c.id}" ${c.id === m.chain_id ? "selected" : ""}>${escapeHtml(c.name)}</option>`
      ).join("");
    chainField.closest(".edit-row")?.style.setProperty("display", m.group_type === "place" ? "" : "none");
  }

  const catSel = document.getElementById("e_category");
  if (catSel && !catSel.dataset.bound) {
    catSel.addEventListener("change", onEditCategoryChanged);
    catSel.dataset.bound = "1";
  }
  const brandSel = document.getElementById("e_brand");
  if (brandSel && !brandSel.dataset.bound) {
    brandSel.addEventListener("change", onEditBrandChanged);
    brandSel.dataset.bound = "1";
  }
  if (m.group_type === "product") {
    document.getElementById("e_title").value = computeProductTitle(m.category_id, m.brand_id);
  }
}

function enterEditMode() {
  document.getElementById("editCard").style.display = "block";
  document.getElementById("editCard").scrollIntoView({ behavior: "smooth", block: "start" });
  fillEditForm();
  setEditStatus("");
}

function cancelEdits() {
  document.getElementById("editCard").style.display = "none";
  setEditStatus("");
}

async function saveEdits() {
  setEditStatus("Saving…");

  const group_type  = document.getElementById("e_group_type").value;
  const category_id = parseInt(document.getElementById("e_category").value) || null;
  const address     = document.getElementById("e_address").value.trim();
  const latRaw      = document.getElementById("e_lat").value.trim();
  const lonRaw      = document.getElementById("e_lon").value.trim();
  const lat = latRaw === "" ? null : Number(latRaw);
  const lon = lonRaw === "" ? null : Number(lonRaw);
  const brand_id = group_type === "product"
    ? (parseInt(document.getElementById("e_brand").value) || null)
    : null;

  const product_name = group_type === "product"
    ? (document.getElementById("e_product_name")?.value.trim() || null)
    : null;
  const chain_id = group_type === "place"
    ? (parseInt(document.getElementById("e_chain_id")?.value) || null)
    : null;

  let title = document.getElementById("e_title").value.trim();
  if (group_type === "product") {
    if (!brand_id) { setEditStatus("Brand is required for products."); return; }
    const pn = product_name ? ` · ${product_name}` : "";
    title = computeProductTitle(category_id, brand_id) + pn;
  }
  if (!title) { setEditStatus("Title is required."); return; }

  const { data, error } = await sb
    .from("markers")
    .update({ title, group_type, category_id, brand_id, product_name, chain_id, address, lat, lon })
    .eq("id", MARKER_ID)
    .select("id,title,group_type,category_id,brand_id,rating_manual,rating_avg,rating_count,address,lat,lon,is_active,created_at,created_by")
    .single();

  if (error) { setEditStatus("Error: " + error.message); return; }

  CURRENT_MARKER = data;
  const user = await maybeUser();
  const creatorName = await resolveCreatorName(data, user);
  renderHero(data, user);
  renderDetails(data, creatorName);
  renderRating(data);
  if (data.group_type === "place") renderMiniMap(data);
  await renderRankingWidget(data);
  cancelEdits();
  setStatus("Saved ✅");
}

async function deactivateMarker() {
  if (!confirm("Deactivate this marker? It will be hidden from list and map.")) return;
  setStatus("Deactivating…");

  // Deactivate the marker — related votes/comments/photos are hidden
  // automatically since all queries filter on the marker being active
  const { error } = await sb
    .from("markers")
    .update({ is_active: false })
    .eq("id", MARKER_ID);

  if (error) { setStatus("Error: " + error.message); return; }

  // Re-fetch marker to update UI state
  const { data, error: fetchErr } = await sb
    .from("markers")
    .select("id,title,group_type,category_id,brand_id,rating_manual,rating_avg,rating_count,address,lat,lon,is_active,created_at,created_by")
    .eq("id", MARKER_ID)
    .limit(1)
    .then(r => ({ data: r.data?.[0] || null, error: r.error }));

  if (!fetchErr && data) {
    CURRENT_MARKER = data;
    const user = await maybeUser();
    renderHero(data, user);
  }

  setStatus("Deactivated ✅ — marker and all related data hidden.");
}

/* ══════════════════════════════
   CREATOR NAME
══════════════════════════════ */
async function resolveCreatorName(m, user) {
  if (!m?.created_by) return "Unknown";
  if (user && user.id === m.created_by) {
    return user.user_metadata?.display_name || user.email || "You";
  }
  const { data } = await sb
    .from("profiles")
    .select("display_name")
    .eq("id", m.created_by)
    .maybeSingle();
  return data?.display_name || "A member";
}


/* ══════════════════════════════
   COMMENTS
══════════════════════════════ */

const EMOJI_OPTIONS = ["👍","🔥","😂","😮","❤️","👎"];

function formatTimeAgo(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day:"numeric", month:"short", year:"numeric" });
}

function colorClassComment(v) {
  const x = Number(v ?? 0);
  if (!x) return "rating-none";
  if (x >= 9) return "rating-9-10";
  if (x >= 7) return "rating-7-8";
  if (x >= 5) return "rating-5-6";
  if (x >= 3) return "rating-3-4";
  return "rating-1-2";
}

async function initComments(user) {
  const writeArea   = document.getElementById("commentWriteArea");
  const loginPrompt = document.getElementById("commentLoginPrompt");
  if (user) {
    if (writeArea)   writeArea.style.display   = "block";
    if (loginPrompt) loginPrompt.style.display = "none";
    // Char counter
    const ta = document.getElementById("newCommentInput");
    if (ta) ta.addEventListener("input", () => {
      const el = document.getElementById("newCommentCharCount");
      if (el) {
        el.textContent = `${ta.value.length} / 500`;
        el.style.color = ta.value.length > 450 ? "#ef4444" : "";
      }
    });
  } else {
    if (writeArea)   writeArea.style.display   = "none";
    if (loginPrompt) loginPrompt.style.display = "block";
  }
  await loadComments(user);
  await loadPhotos(MARKER_ID);
}

async function loadComments(user) {
  const list = document.getElementById("commentsList");
  if (!list) return;

  // Fetch top-level comments (parent_id is null)
  const { data: topComments, error } = await sb
    .from("comments")
    .select("id,body,created_at,updated_at,user_id,vote_id")
    .eq("marker_id", MARKER_ID)
    .eq("is_active", true)
    .is("parent_id", null)
    .order("created_at", { ascending: false });

  if (error) { console.error("loadComments:", error.message); return; }

  // Update count badge
  const countEl = document.getElementById("commentsCount");
  if (countEl) countEl.textContent = topComments?.length
    ? `${topComments.length} comment${topComments.length === 1 ? "" : "s"}`
    : "";

  if (!topComments?.length) {
    list.innerHTML = `<p class="muted comment-empty">No comments yet. Be the first!</p>`;
    return;
  }

  // Fetch all replies for these comment ids
  const topIds = topComments.map(c => c.id);
  const { data: replies } = await sb
    .from("comments")
    .select("id,body,created_at,user_id,parent_id")
    .eq("marker_id", MARKER_ID)
    .eq("is_active", true)
    .in("parent_id", topIds)
    .order("created_at", { ascending: true });

  // Fetch reactions for all comments
  const allIds = [...topIds, ...(replies || []).map(r => r.id)];
  let reactions = [];
  if (allIds.length) {
    const { data: rxData } = await sb
      .from("reactions")
      .select("id,comment_id,user_id,emoji")
      .in("comment_id", allIds);
    reactions = rxData || [];
  }

  // Fetch display names
  const allUserIds = [...new Set([
    ...topComments.map(c => c.user_id),
    ...(replies || []).map(r => r.user_id),
  ])];
  let profiles = [];
  if (allUserIds.length) {
    const { data: profData } = await sb
      .from("profiles")
      .select("id,display_name")
      .in("id", allUserIds);
    profiles = profData || [];
  }

  // Fetch votes for score pills (only for comments that have a vote_id)
  const voteIds = topComments.filter(c => c.vote_id).map(c => c.vote_id);
  let voteMap = {};
  if (voteIds.length) {
    const { data: votes } = await sb
      .from("votes").select("id,vote").in("id", voteIds);
    (votes || []).forEach(v => voteMap[v.id] = v.vote);
  }

  const nameById = {};
  (profiles || []).forEach(p => nameById[p.id] = p.display_name);

  const reactionsByComment = {};
  (reactions || []).forEach(r => {
    if (!reactionsByComment[r.comment_id]) reactionsByComment[r.comment_id] = [];
    reactionsByComment[r.comment_id].push(r);
  });

  const repliesByParent = {};
  (replies || []).forEach(r => {
    if (!repliesByParent[r.parent_id]) repliesByParent[r.parent_id] = [];
    repliesByParent[r.parent_id].push(r);
  });

  list.innerHTML = topComments.map(c =>
    renderCommentRow(c, user, nameById, reactionsByComment, repliesByParent, voteMap, false)
  ).join("");
}

function renderCommentRow(c, user, nameById, reactionsByComment, repliesByParent, voteMap, isReply) {
  const name    = nameById[c.user_id] || "A member";
  const initial = (name[0] || "?").toUpperCase();
  const isOwn   = user && user.id === c.user_id;
  const timeAgo = formatTimeAgo(c.created_at);

  // Score pill (only top-level comments with a linked vote)
  let scorePill = "";
  if (!isReply && c.vote_id && voteMap[c.vote_id] != null) {
    const score = Number(voteMap[c.vote_id]);
    const cls   = colorClassComment(score);
    scorePill   = `<span class="comment-score-pill ${cls}">${score.toFixed(1)}</span>`;
  }

  // Reactions summary
  const myReactions = new Set(
    (reactionsByComment[c.id] || [])
      .filter(r => user && r.user_id === user.id)
      .map(r => r.emoji)
  );
  const reactionCounts = {};
  (reactionsByComment[c.id] || []).forEach(r => {
    reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1;
  });

  const existingReactions = Object.entries(reactionCounts).map(([emoji, count]) => {
    const emojiB64 = btoa(unescape(encodeURIComponent(emoji)));
    const reacted  = myReactions.has(emoji);
    const clickFn  = user ? `toggleReactionB64('${c.id}','${emojiB64}')` : "location.href='login.html?redirect='+encodeURIComponent(location.href)";
    return `<button class="reaction-pill ${reacted ? "reacted" : ""}"
      onclick="${clickFn}" title="${reacted ? "Remove reaction" : "React"}">
      ${emoji} ${count}
    </button>`;
  }).join("");

  const addReactionBtn = user ? `
    <div class="reaction-add-wrap">
      <button class="reaction-add-btn" onclick="toggleEmojiPicker('${c.id}')">＋</button>
      <div class="emoji-picker" id="picker-${c.id}" style="display:none;">
        ${EMOJI_OPTIONS.map(e => {
          const b64 = btoa(unescape(encodeURIComponent(e)));
          return `<button onclick="toggleReactionB64('${c.id}','${b64}');toggleEmojiPicker('${c.id}')">${e}</button>`;
        }).join("")}
      </div>
    </div>` : "";

  // Replies
  const commentReplies = repliesByParent[c.id] || [];
  const repliesHtml = commentReplies.map(r =>
    renderCommentRow(r, user, nameById, reactionsByComment, {}, {}, true)
  ).join("");

  const replyArea = !isReply ? `
    <div class="reply-area" id="reply-area-${c.id}" style="display:none;">
      <textarea class="comment-textarea reply-textarea" placeholder="Write a reply…" rows="2" maxlength="500"
        id="reply-input-${c.id}" oninput="updateReplyCount('${c.id}')"></textarea>
      <div class="comment-write-foot">
        <span id="reply-char-${c.id}" class="comment-char-count">0 / 500</span>
        <button class="tba-btn tba-btn-primary comment-post-btn"
          onclick="postReply('${c.id}')">Reply</button>
      </div>
    </div>` : "";

  // Smaller reaction add button
  const addReactionBtnSmall = user ? `
    <button class="comment-action-btn" onclick="toggleEmojiPicker('${c.id}')" title="Add reaction">＋</button>
    <div class="emoji-picker" id="picker-${c.id}" style="display:none;position:absolute;z-index:100;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:6px;box-shadow:0 4px 12px rgba(0,0,0,0.1);">
      ${EMOJI_OPTIONS.map(e => {
        const b64 = btoa(unescape(encodeURIComponent(e)));
        return `<button class="reaction-emoji-btn" onclick="toggleReactionB64('${c.id}','${b64}');toggleEmojiPicker('${c.id}')">${e}</button>`;
      }).join("")}
    </div>` : "";

  const avatarSize = isReply ? "reply-avatar" : "comment-avatar";

  return `
    <div class="comment-item ${isReply ? "reply-item" : ""} ${isOwn ? "comment-own" : ""}" data-id="${c.id}" style="position:relative;">
      <div class="comment-meta">
        <span class="${avatarSize}">${escapeHtml(initial)}</span>
        <span class="comment-author">${escapeHtml(name)}</span>
        ${scorePill}
        <span class="comment-time">${timeAgo}</span>
        ${isOwn ? `<button class="comment-action-btn" onclick="deleteComment('${c.id}')">Delete</button>` : ""}
      </div>
      <div class="comment-text" style="margin-left:${isReply ? '25' : '34'}px;">${escapeHtml(c.body)}</div>
      <div class="comment-actions" style="margin-left:${isReply ? '25' : '34'}px;margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        ${existingReactions}
        ${addReactionBtnSmall}
        ${!isReply && user ? `<button class="comment-action-btn" onclick="toggleReplyArea('${c.id}')">↩ Reply</button>` : ""}
      </div>
      ${replyArea}
      ${!isReply && repliesHtml ? `<div class="replies-section">${repliesHtml}</div>` : ""}
    </div>`;
}

async function postComment() {
  const ta   = document.getElementById("newCommentInput");
  const body = ta?.value.trim();
  if (!body) return;

  const allowed = await softLoginNudge("Sign in to post a comment.");
  if (!allowed) return;
  const user = await maybeUser();

  const btn = document.querySelector(".comment-post-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Posting…"; }

  // Find the user's vote_id for this marker (to link score)
  const { data: voteRow } = await sb
    .from("votes")
    .select("id")
    .eq("marker_id", MARKER_ID)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  const { error } = await sb.from("comments").insert([{
    marker_id: MARKER_ID,
    user_id:   user.id,
    vote_id:   voteRow?.id || null,
    body,
  }]);

  if (btn) { btn.disabled = false; btn.textContent = "Post"; }

  if (error) { alert("Error: " + error.message); return; }

  ta.value = "";
  const countEl = document.getElementById("newCommentCharCount");
  if (countEl) countEl.textContent = "0 / 500";
  await loadComments(user);
}

async function postReply(parentId) {
  const ta   = document.getElementById(`reply-input-${parentId}`);
  const body = ta?.value.trim();
  if (!body) return;

  const user = await requireAuth();
  if (!user) return;

  const { error } = await sb.from("comments").insert([{
    marker_id: MARKER_ID,
    user_id:   user.id,
    parent_id: parentId,
    body,
  }]);

  if (error) { alert("Error: " + error.message); return; }

  ta.value = "";
  toggleReplyArea(parentId);
  await loadComments(user);
}

async function deleteComment(commentId) {
  if (!confirm("Delete this comment?")) return;
  const { error } = await sb
    .from("comments")
    .update({ is_active: false })
    .eq("id", commentId);
  if (error) { alert("Error: " + error.message); return; }
  const user = await maybeUser();
  await loadComments(user);
}

async function toggleReactionB64(commentId, emojiB64) {
  try {
    const emoji = decodeURIComponent(escape(atob(emojiB64)));
    await toggleReaction(commentId, emoji);
  } catch(e) { console.error("emoji decode error", e); }
}

async function toggleReaction(commentId, emoji) {
  const allowed = await softLoginNudge("Sign in to react to comments.");
  if (!allowed) return;
  const user = await maybeUser();

  // Check if already reacted
  const { data: existing } = await sb
    .from("reactions")
    .select("id")
    .eq("comment_id", commentId)
    .eq("user_id", user.id)
    .eq("emoji", emoji)
    .maybeSingle();

  if (existing) {
    await sb.from("reactions").delete().eq("id", existing.id);
  } else {
    await sb.from("reactions").insert([{ comment_id: commentId, user_id: user.id, emoji }]);
  }

  await loadComments(user);
}

function toggleEmojiPicker(commentId) {
  const picker = document.getElementById(`picker-${commentId}`);
  if (!picker) return;
  // Close all other pickers first
  document.querySelectorAll(".emoji-picker").forEach(p => {
    if (p !== picker) p.style.display = "none";
  });
  picker.style.display = picker.style.display === "none" ? "flex" : "none";
}

function toggleReplyArea(commentId) {
  const area = document.getElementById(`reply-area-${commentId}`);
  if (!area) return;
  const isOpen = area.style.display !== "none";
  area.style.display = isOpen ? "none" : "block";
  if (!isOpen) {
    const ta = document.getElementById(`reply-input-${commentId}`);
    if (ta) ta.focus();
  }
}

function updateReplyCount(commentId) {
  const ta  = document.getElementById(`reply-input-${commentId}`);
  const el  = document.getElementById(`reply-char-${commentId}`);
  if (ta && el) {
    el.textContent = `${ta.value.length} / 500`;
    el.style.color = ta.value.length > 450 ? "#ef4444" : "";
  }
}

// Close emoji pickers when clicking outside
document.addEventListener("click", e => {
  if (!e.target.closest(".reaction-add-wrap")) {
    document.querySelectorAll(".emoji-picker").forEach(p => p.style.display = "none");
  }
});

/* ══════════════════════════════
   INIT
══════════════════════════════ */
async function initMarkerPage() {
  MARKER_ID = qp("id");
  if (!MARKER_ID) {
    setStatus("Missing marker id. Open like: marker.html?id=YOUR_ID");
    return;
  }

  // Read category context from URL
  const catParam = qp("cat");
  ACTIVE_CATEGORY_ID = catParam ? parseInt(catParam) : null;

  setStatus("Loading…");

  wlInit();

  const user = await maybeUser();

  // Load reference data + marker + marker_categories + chains in parallel
  const [cbRes, catRes, brandRes, markerRes, mcRes, chainRes] = await Promise.all([
    sb.from("category_brands").select("category_id,brand_id,is_active").eq("is_active", true),
    sb.from("categories").select("id,name,icon_url,is_active,for_places,for_products").eq("is_active", true).order("name"),
    sb.from("brands").select("id,name,icon_url,is_active").eq("is_active", true).order("name"),
    sb.from("markers")
      .select("id,title,group_type,category_id,brand_id,product_name,chain_id,rating_manual,rating_avg,rating_count,address,lat,lon,city,is_active,created_at,created_by")
      .eq("id", MARKER_ID)
      .single(),
    sb.from("marker_categories")
      .select("category_id,is_primary,is_active,rating_avg,rating_count")
      .eq("marker_id", MARKER_ID)
      .eq("is_active", true),
    sb.from("chains").select("id,name,is_active").eq("is_active", true),
  ]);

  if (markerRes.error || !markerRes.data) {
    setStatus("Marker not found.");
    document.getElementById("markerTitle").textContent = "Not found";
    return;
  }

  CATEGORY_BRANDS  = cbRes.data || [];
  CATEGORIES_ALL   = catRes.data || [];
  BRANDS           = brandRes.data || [];
  CURRENT_MARKER   = markerRes.data;
  MARKER_CATEGORIES = mcRes.data || [];
  CHAINS_ALL       = chainRes.data || [];

  // If no valid cat param, fall back to primary category
  if (ACTIVE_CATEGORY_ID && !MARKER_CATEGORIES.find(mc => mc.category_id === ACTIVE_CATEGORY_ID)) {
    ACTIVE_CATEGORY_ID = null;
  }

  const m = CURRENT_MARKER;

  // ── INACTIVE MARKER ── show banner, skip all further UI
  if (!m.is_active) {
    document.getElementById('markerTitle').textContent = m.title;
    const mkVI = document.getElementById('mkVoteInline'); if(mkVI) mkVI.style.display='none';
    const mkRS = document.getElementById('mkRankingSection'); if(mkRS) mkRS.style.display='none';

    const banner = document.getElementById('pageStatus');
    banner.innerHTML = `
      <div class="inactive-banner">
        <span class="inactive-banner-icon">🚫</span>
        <div>
          <strong>This marker has been deactivated</strong>
          <div class="inactive-banner-sub">It is no longer shown in the map, list or rankings.</div>
        </div>
        ${user ? `<button class="tba-btn tba-btn-primary inactive-reactivate-btn" onclick="reactivateMarker()">Reactivate</button>` : ''}
      </div>`;

    const creatorName = await resolveCreatorName(m, user);
    renderHero(m, user);
    renderDetails(m, creatorName);
    return;
  }

  const creatorName = await resolveCreatorName(m, user);

  window._mkUser = user || null;
  if (user) {
    const voteInline = document.getElementById("mkVoteInline");
    if (voteInline) voteInline.style.display = "flex";
    await loadMyVote(user);
  }

  // Show main content
  const loading = document.getElementById("pageLoadingState");
  const main = document.getElementById("mkMain");
  if (loading) loading.style.display = "none";
  if (main) main.style.display = "block";

  renderHero(m, user);
  renderRating(m);
  renderDetails(m, creatorName);
  updatePageSEO(m);

  if (m.group_type === "place") {
    renderMiniMap(m);
    await renderRutaBadge(m); // rutas only for places
    // Move ruta badge to sidebar above map
    const rutaBadgeEl = document.getElementById("mkRutaBadge");
    const mapCard = document.getElementById("miniMapCard");
    if (rutaBadgeEl && mapCard && rutaBadgeEl.style.display !== "none") {
      mapCard.parentNode.insertBefore(rutaBadgeEl, mapCard);
    }
  } else {
    // Products: hide map and ruta badge
    const mapCard = document.getElementById("miniMapCard");
    if (mapCard) mapCard.style.display = "none";
    const rutaBadge = document.getElementById("mkRutaBadge");
    if (rutaBadge) rutaBadge.style.display = "none";
  }

  await renderRankingWidget(m);
  await renderMoreFromBrand(m);
  await renderOthersFromChain(m);
  await renderAlsoAtThisPlace(m);
  await initComments(user);

  // Load photos into new hero strip
  await loadPhotosHero(m.id, user);

  setStatus("");
}

/* ══════════════════════════════
   RUTA BADGE
══════════════════════════════ */
async function renderRutaBadge(m) {
  const badge = document.getElementById("mkRutaBadge");
  if (!badge) return;

  try {
    // Find rutas containing this marker
    const { data: items } = await sb.from("ruta_items")
      .select("ruta_id, position")
      .eq("marker_id", m.id)
      .eq("is_active", true)
      .limit(1);

    if (!items?.length) return;

    const rutaId = items[0].ruta_id;
    const stopPos = items[0].position;

    // Get ruta details
    const { data: ruta } = await sb.from("rutas")
      .select("id, name, city")
      .eq("id", rutaId)
      .single();

    if (!ruta) return;

    // Count total stops
    const { count } = await sb.from("ruta_items")
      .select("id", { count: "exact", head: true })
      .eq("ruta_id", rutaId)
      .eq("is_active", true);

    const rutaUrl = `rutas.html?ruta=${encodeURIComponent(ruta.id)}`;
    badge.innerHTML = `
      <a class="mk-ruta-badge" href="${rutaUrl}">
        <span class="mk-ruta-badge-icon">🗺</span>
        <span class="mk-ruta-badge-name">${escapeHtml(ruta.name)}</span>
        <span class="mk-ruta-badge-stops">Stop ${stopPos} of ${count || "?"}</span>
      </a>`;
    badge.style.display = "block";
  } catch(e) {
    // Silently fail
  }
}

/* ══════════════════════════════
   PHOTO HERO STRIP
══════════════════════════════ */
async function loadPhotosHero(markerId, user) {
  const strip = document.getElementById("mkPhotoStrip");
  const countEl = document.getElementById("mkPhotoCount");
  const placeholder = document.getElementById("mkPhotoPlaceholder");
  const addBtn = document.getElementById("mkPhotoAddBtn");

  if (!strip) return;

  // Show upload button for logged-in users
  if (user && addBtn) addBtn.style.display = "flex";

  // Also call the existing loadPhotos function which sets up PHOTOS array & lightbox
  await loadPhotos(markerId);

  if (!PHOTOS.length) {
    // Keep placeholder visible
    return;
  }

  // Hide placeholder, show photos
  if (placeholder) placeholder.style.display = "none";

  // Render up to 3 photos in the hero strip
  const toShow = PHOTOS.slice(0, 3);
  strip.innerHTML = toShow.map((p, i) => {
    const url = photoPublicUrl(p.storage_path);
    return `<img src="${escapeHtml(url)}" alt="" onclick="openLightbox(${i})" />`;
  }).join("");

  // Photo count pill
  if (PHOTOS.length > 1 && countEl) {
    countEl.textContent = `${PHOTOS.length} photos`;
    countEl.style.display = "block";
  }
}

/* ══════════════════════════════════════════════════════
   PHOTOS — strip + lightbox
══════════════════════════════════════════════════════ */

const SUPABASE_STORAGE_URL = `${SUPABASE_URL}/storage/v1/object/public/marker-photos/`;
const MAX_PHOTOS = 10;

let PHOTOS = [];          // [{id, storage_path, user_id, created_at}]
let LIGHTBOX_IDX = 0;
let CURRENT_USER_ID = null;

function photoPublicUrl(path) {
  return SUPABASE_STORAGE_URL + encodeURIComponent(path).replace(/%2F/g, '/');
}

async function loadPhotos(markerId) {
  const user = await maybeUser();
  CURRENT_USER_ID = user?.id || null;

  const { data, error } = await sb
    .from('marker_photos')
    .select('id, storage_path, user_id, created_at')
    .eq('marker_id', markerId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(MAX_PHOTOS);

  if (error) { console.error('Photos load error:', error); return; }

  PHOTOS = data || [];
  renderPhotoStrip(markerId);
}

function renderPhotoStrip(markerId) {
  const card   = document.getElementById('photosCard');
  const strip  = document.getElementById('photoStrip');
  const count  = document.getElementById('photosCount');
  const label  = document.getElementById('photoUploadLabel');
  if (!card || !strip) return;

  card.style.display = 'block';

  // Show upload button for logged-in users if under limit
  if (CURRENT_USER_ID && PHOTOS.length < MAX_PHOTOS) {
    label.style.display = 'inline-flex';
  } else {
    label.style.display = 'none';
  }

  count.textContent = PHOTOS.length ? `${PHOTOS.length} photo${PHOTOS.length > 1 ? 's' : ''}` : '';

  if (!PHOTOS.length) {
    strip.innerHTML = '<span class="photo-empty muted">No photos yet.</span>';
    return;
  }

  strip.innerHTML = PHOTOS.map((p, i) => {
    const url = photoPublicUrl(p.storage_path);
    const canDelete = CURRENT_USER_ID && p.user_id === CURRENT_USER_ID;
    return `
      <div class="photo-thumb-wrap" data-idx="${i}">
        <img class="photo-thumb" src="${escapeHtml(url)}" alt="Photo ${i+1}" loading="lazy"
             onclick="openLightbox(${i})" />
        ${canDelete ? `<button class="photo-delete-btn" title="Delete" onclick="deletePhoto(event,'${escapeHtml(p.id)}',${i})">&#10005;</button>` : ''}
      </div>`;
  }).join('');
}

async function uploadPhoto(input) {
  const file = input.files[0];
  if (!file) return;

  const user = await maybeUser();
  if (!user) { window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.href); return; }
  if (PHOTOS.length >= MAX_PHOTOS) { setPhotoStatus(`Max ${MAX_PHOTOS} photos reached.`); return; }

  // Validate type + size (5MB max)
  if (!file.type.startsWith('image/')) { setPhotoStatus('Please select an image file.'); return; }
  if (file.size > 5 * 1024 * 1024) { setPhotoStatus('Image must be under 5MB.'); return; }

  setPhotoStatus('Uploading…');

  const ext  = file.name.split('.').pop().toLowerCase() || 'jpg';
  const path = `${MARKER_ID}/${user.id}_${Date.now()}.${ext}`;

  const { error: upErr } = await sb.storage
    .from('marker-photos')
    .upload(path, file, { upsert: false, contentType: file.type });

  if (upErr) { setPhotoStatus('Upload failed: ' + upErr.message); return; }

  // Insert db row (soft-delete ready)
  const { error: dbErr } = await sb
    .from('marker_photos')
    .insert([{ marker_id: MARKER_ID, user_id: user.id, storage_path: path, is_active: true }]);

  if (dbErr) {
    setPhotoStatus('Saved to storage but DB failed: ' + dbErr.message);
    return;
  }

  setPhotoStatus('');
  input.value = ''; // reset input
  await loadPhotos(MARKER_ID);
}

async function deletePhoto(e, photoId, idx) {
  e.stopPropagation();
  if (!confirm('Delete this photo?')) return;

  const path = PHOTOS[idx]?.storage_path;

  // Soft delete — just mark inactive in DB
  const { error } = await sb
    .from('marker_photos')
    .update({ is_active: false })
    .eq('id', photoId);

  if (error) { setPhotoStatus('Delete failed: ' + error.message); return; }

  setPhotoStatus('');
  await loadPhotos(MARKER_ID);
}

function setPhotoStatus(msg) {
  const el = document.getElementById('photoStatus');
  if (el) el.textContent = msg;
}

/* ── LIGHTBOX ── */
function openLightbox(idx) {
  if (!PHOTOS.length) return;
  LIGHTBOX_IDX = idx;
  document.getElementById('photoLightbox').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  renderLightbox();
}

function closeLightbox() {
  document.getElementById('photoLightbox').style.display = 'none';
  document.body.style.overflow = '';
}

function lightboxNav(dir) {
  LIGHTBOX_IDX = (LIGHTBOX_IDX + dir + PHOTOS.length) % PHOTOS.length;
  renderLightbox();
}

function renderLightbox() {
  const p   = PHOTOS[LIGHTBOX_IDX];
  const url = photoPublicUrl(p.storage_path);
  const total = PHOTOS.length;

  // Main image
  document.getElementById('lightboxImg').src = url;

  // Caption
  document.getElementById('lightboxCaption').textContent =
    `${LIGHTBOX_IDX + 1} / ${total}`;

  // Prev/next visibility
  document.getElementById('lightboxPrev').style.display = total > 1 ? 'flex' : 'none';
  document.getElementById('lightboxNext').style.display = total > 1 ? 'flex' : 'none';

  // Thumbnail strip (desktop)
  const thumbsEl = document.getElementById('lightboxThumbs');
  thumbsEl.innerHTML = PHOTOS.map((ph, i) => {
    const u = photoPublicUrl(ph.storage_path);
    return `<img class="lightbox-thumb${i === LIGHTBOX_IDX ? ' active' : ''}"
                 src="${escapeHtml(u)}" alt=""
                 onclick="LIGHTBOX_IDX=${i}; renderLightbox();" loading="lazy" />`;
  }).join('');

  // Scroll active thumb into view
  const activeTh = thumbsEl.querySelector('.lightbox-thumb.active');
  if (activeTh) activeTh.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

  // Dots (mobile)
  document.getElementById('lightboxDots').innerHTML = PHOTOS.map((_, i) =>
    `<span class="lightbox-dot${i === LIGHTBOX_IDX ? ' active' : ''}"></span>`
  ).join('');
}

// Keyboard navigation
document.addEventListener('keydown', e => {
  if (document.getElementById('photoLightbox').style.display === 'none') return;
  if (e.key === 'ArrowRight') lightboxNav(1);
  if (e.key === 'ArrowLeft')  lightboxNav(-1);
  if (e.key === 'Escape')     closeLightbox();
});

// Touch swipe on mobile
(function() {
  let tx = 0;
  const lb = () => document.getElementById('photoLightbox');
  document.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', e => {
    if (lb().style.display === 'none') return;
    const dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 50) lightboxNav(dx < 0 ? 1 : -1);
  });
})();
