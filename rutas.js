// rutas.js v2 — full redesign with map, celebrations, sticky bar, tier teaser

let SELECTED_CITY = 'BCN';
let SELECTED_CAT_ID = null;
let ACTIVE_RUTA = null;
let ALL_RUTAS = [];
let RUTA_ITEMS = [];
let MY_VOTES = {};
let CATEGORIES_MAP = {};
let CURRENT_USER = null;
let RUTA_MAP_INSTANCE = null;
let RUTA_ITEMS_BY_CAT = {}; // category_id -> ruta_items array
let RUTA_MAP_OPEN = false;

function escapeHtml(s) {
  return String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;')
    .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");
}

function colorClassForScore(v) {
  const x = Number(v ?? 0);
  if (!x) return 'ruta-score-none';
  if (x >= 9) return 'ruta-score-9-10';
  if (x >= 7) return 'ruta-score-7-8';
  if (x >= 5) return 'ruta-score-5-6';
  if (x >= 3) return 'ruta-score-3-4';
  return 'ruta-score-1-2';
}

function absIconUrl(iconUrl) {
  if (!iconUrl) return '';
  if (iconUrl.startsWith('http')) return iconUrl;
  return window.location.href.replace(/\/[^/]*(\?.*)?$/, '/') + iconUrl;
}

/* ══════════════════════════════
   INIT
══════════════════════════════ */
async function initRutasPage() {
  const { data: catData } = await sb.from('categories')
    .select('id,name,icon_url,is_active').eq('is_active', true);
  (catData || []).forEach(c => CATEGORIES_MAP[c.id] = c);

  CURRENT_USER = await maybeUser();
  if (CURRENT_USER) await loadMyVotes(CURRENT_USER.id);

  // Read URL params from marker page links
  const _qp  = new URLSearchParams(location.search);
  const _city = _qp.get('city') || 'BCN';
  const _rutaId = _qp.get('ruta');

  await selectCity(_city);

  if (_rutaId) {
    const _target = ALL_RUTAS.find(r => r.id === _rutaId);
    if (_target) await selectCategory(_target.category_id);
  }
}

async function loadMyVotes(userId) {
  const { data } = await sb.from('votes')
    .select('marker_id,vote,category_id,is_active')
    .eq('user_id', userId).eq('is_active', true);
  MY_VOTES = {};
  (data || []).forEach(v => { MY_VOTES[`${v.marker_id}__${v.category_id}`] = v; });
}

/* ══════════════════════════════
   CITY
══════════════════════════════ */
async function selectCity(city) {
  SELECTED_CITY = city;
  SELECTED_CAT_ID = null;

  document.querySelectorAll('.city-tab').forEach(el => el.classList.remove('city-tab-active'));
  const btn = document.getElementById(`city${city}`);
  if (btn) btn.classList.add('city-tab-active');

  const { data, error } = await sb.from('rutas')
    .select('id,name,city,category_id,tier,is_active')
    .eq('city', city).eq('is_active', true).order('tier');
  ALL_RUTAS = data || [];

  closeRuta();
  renderCatCards();

  const catSection = document.getElementById('catSection');
  catSection.style.display = 'block';
  // Stagger card animations
  setTimeout(() => {
    document.querySelectorAll('.rutas-cat-card').forEach((el, i) => {
      el.style.animationDelay = `${i * 0.05}s`;
    });
  }, 10);
}

/* ══════════════════════════════
   CATEGORY CARDS
══════════════════════════════ */
function renderCatCards() {
  const host = document.getElementById('rutasCatGrid');
  if (!host) return;
  host.innerHTML = '';

  ALL_RUTAS.forEach(ruta => {
    const cat = CATEGORIES_MAP[ruta.category_id];
    if (!cat) return;

    // We'll update this after items load; for now show nothing
    const votedInCat = 0; // placeholder, updated by updateCatCardProgress

    const card = document.createElement('div');
    card.className = 'rutas-cat-card';
    card.onclick = () => selectCategory(ruta.category_id);

    const icon = absIconUrl(cat.icon_url);
    card.innerHTML = `
      ${icon ? `<img src="${escapeHtml(icon)}" alt="" />` : '<span style="font-size:28px;">🍽️</span>'}
      <div class="rutas-cat-card-name">${escapeHtml(cat.name)}</div>
      <div class="rutas-cat-card-count" id="catCount-${ruta.category_id}"></div>
      <div class="rutas-cat-card-progress" id="catProgress-${ruta.category_id}" style="width:0%"></div>
    `;
    host.appendChild(card);
  });

  // After items load we can update progress widths
  updateCatCardProgress();
}

function updateCatCardProgress() {
  // Uses RUTA_ITEMS_BY_CAT populated after loading each ruta
  ALL_RUTAS.forEach(ruta => {
    const progressEl = document.getElementById(`catProgress-${ruta.category_id}`);
    const countEl = document.getElementById(`catCount-${ruta.category_id}`);
    const items = RUTA_ITEMS_BY_CAT[ruta.category_id] || [];
    if (!items.length) return;
    const total = items.filter(ri => ri.markers?.is_active).length;
    const voted = items.filter(ri => {
      if (!ri.markers?.is_active) return false;
      return !!MY_VOTES[`${ri.markers.id}__${ruta.category_id}`];
    }).length;
    const pct = total ? Math.round((voted / total) * 100) : 0;
    if (progressEl) {
      progressEl.style.width = `${pct}%`;
      if (pct >= 100) progressEl.classList.add('complete');
    }
    if (countEl) {
      countEl.textContent = voted > 0 ? `${voted}/${total}` : '';
    }
  });
}

/* ══════════════════════════════
   SELECT CATEGORY → load ruta
══════════════════════════════ */
async function selectCategory(catId) {
  SELECTED_CAT_ID = catId;

  document.querySelectorAll('.rutas-cat-card').forEach(el => el.classList.remove('active'));
  const cards = document.querySelectorAll('.rutas-cat-card');
  ALL_RUTAS.forEach((ruta, i) => {
    if (ruta.category_id === catId && cards[i]) cards[i].classList.add('active');
  });

  const ruta = ALL_RUTAS.find(r => r.category_id === catId);
  if (!ruta) return;

  const { data, error } = await sb.from('ruta_items')
    .select(`id, position, is_paid, markers(id,title,address,rating_avg,rating_count,is_active,category_id,lat,lon)`)
    .eq('ruta_id', ruta.id).eq('is_active', true)
    .order('position', { ascending: true });

  if (error) return;
  RUTA_ITEMS = data || [];
  RUTA_ITEMS_BY_CAT[ruta.category_id] = RUTA_ITEMS;
  ACTIVE_RUTA = ruta;

  updateCatCardProgress();
  showRutaSection(ruta);
}

/* ══════════════════════════════
   SHOW RUTA
══════════════════════════════ */
function showRutaSection(ruta) {
  const cat = CATEGORIES_MAP[ruta.category_id];
  const section = document.getElementById('rutaSection');
  section.style.display = 'block';
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });

  document.getElementById('rutaTitleLabel').textContent = 'La Selección · ' + (cat?.name || '');
  document.getElementById('rutaTitle').textContent = SELECTED_CITY === 'BCN' ? 'Barcelona' : 'Madrid';

  updateProgress(ruta);
  renderGrid(ruta);
  initRutaMap(ruta);

  // Show logged-out overlay if needed
  if (!CURRENT_USER) {
    document.getElementById('rutaLoggedOutOverlay').style.display = 'flex';
  }

  // Sticky bar
  updateStickyBar(ruta);
}

function closeRuta() {
  document.getElementById('rutaSection').style.display = 'none';
  document.getElementById('rutaStickyBar').style.display = 'none';
  document.getElementById('rutaLoggedOutOverlay').style.display = 'none';
  ACTIVE_RUTA = null;
  RUTA_ITEMS = [];
  if (RUTA_MAP_INSTANCE) { RUTA_MAP_INSTANCE.remove(); RUTA_MAP_INSTANCE = null; }
  RUTA_MAP_OPEN = false;
  document.getElementById('rutaMapWrap').style.display = 'none';
  const toggle = document.getElementById('rutaMapToggle');
  if (toggle) toggle.textContent = '🗺 Show on map';
}

/* ══════════════════════════════
   PROGRESS
══════════════════════════════ */
function countVoted(ruta) {
  const activeItems = RUTA_ITEMS.filter(ri => ri.markers?.is_active);
  return activeItems.filter(ri => !!MY_VOTES[`${ri.markers.id}__${ruta.category_id}`]).length;
}

function updateProgress(ruta) {
  const activeItems = RUTA_ITEMS.filter(ri => ri.markers?.is_active);
  const total = activeItems.length;
  const voted = countVoted(ruta);
  const pct = total ? Math.round((voted / total) * 100) : 0;
  const complete = voted === total && total > 0;

  const fill = document.getElementById('rutaProgressFill');
  const text = document.getElementById('rutaProgressText');
  if (fill) { fill.style.width = `${pct}%`; fill.classList.toggle('complete', complete); }
  if (text) text.textContent = complete ? '✅ Complete!' : `${voted} / ${total}`;

  // Tier teaser — always show
  document.getElementById('rutaTierTeaser').style.display = 'block';

  updateStickyBar(ruta, voted, total, pct, complete);
  updateCatCardProgress();
}

function updateStickyBar(ruta, voted, total, pct, complete) {
  const cat = CATEGORIES_MAP[ruta?.category_id];
  const bar = document.getElementById('rutaStickyBar');
  if (!bar) return;
  bar.style.display = 'flex';

  if (voted === undefined) {
    voted = countVoted(ruta);
    total = RUTA_ITEMS.filter(ri => ri.markers?.is_active).length;
    pct = total ? Math.round((voted / total) * 100) : 0;
    complete = voted === total && total > 0;
  }

  document.getElementById('rutaStickyName').textContent = cat?.name || '';
  document.getElementById('rutaStickyCount').textContent = `${voted}/${total}`;
  const fill = document.getElementById('rutaStickyFill');
  if (fill) { fill.style.width = `${pct}%`; fill.classList.toggle('complete', complete); }
}

/* ══════════════════════════════
   RENDER GRID
══════════════════════════════ */
function renderGrid(ruta) {
  const catId = ruta.category_id;

  // Sort: voted first (by score desc), unvoted last
  const sorted = [...RUTA_ITEMS].sort((a, b) => {
    const aVote = MY_VOTES[`${a.markers?.id}__${catId}`];
    const bVote = MY_VOTES[`${b.markers?.id}__${catId}`];
    if (aVote && bVote) return Number(bVote.vote) - Number(aVote.vote);
    if (aVote) return -1;
    if (bVote) return 1;
    return a.position - b.position;
  });

  document.getElementById('rutaGrid').innerHTML = sorted.map((ri, idx) =>
    renderRutaItem(ri, catId, idx)
  ).join('');
}

function renderRutaItem(ri, catId, animIdx) {
  const m = ri.markers;
  if (!m) return '';
  const isInactive = !m.is_active;
  const key = `${m.id}__${catId}`;
  const myVote = MY_VOTES[key];
  const hasVoted = !!myVote;
  const cat = CATEGORIES_MAP[catId];
  const icon = absIconUrl(cat?.icon_url || '');
  const href = `marker.html?id=${encodeURIComponent(m.id)}&cat=${catId}`;
  const delay = `animation-delay:${animIdx * 0.03}s`;

  if (isInactive) return `
    <div class="ruta-item ruta-item-inactive" style="${delay}">
      <div class="ruta-item-num">${ri.position}</div>
      <div class="ruta-item-icon">${icon ? `<img src="${escapeHtml(icon)}" alt="" />` : '🍽️'}</div>
      <div class="ruta-item-name">${escapeHtml(m.title)}</div>
      <span class="ruta-item-closed">Closed</span>
    </div>`;

  const checkHtml = hasVoted ? `<div class="ruta-item-check">✓</div>` : '';
  const scoreHtml = hasVoted
    ? `<span class="ruta-item-score ${colorClassForScore(myVote.vote)}">${Number(myVote.vote).toFixed(0)}</span>`
    : '';
  const voteChipHtml = CURRENT_USER && !hasVoted ? `
    <button class="ruta-vote-chip" onclick="toggleRutaVote(event,'${m.id}',${catId})">★ Vote</button>
    <div class="ruta-vote-btns" id="rvb-${m.id}" style="display:none;">
      ${[1,2,3,4,5,6,7,8,9,10].map(i =>
        `<button class="ruta-vote-btn" onclick="castRutaVote(event,${i},'${m.id}',${catId})">${i}</button>`
      ).join('')}
    </div>` : '';

  return `
    <a class="ruta-item${hasVoted ? ' ruta-item-voted' : ''}" href="${href}" id="ri-${m.id}" style="${delay}">
      ${checkHtml}
      <div class="ruta-item-num">${ri.position}</div>
      <div class="ruta-item-icon">${icon ? `<img src="${escapeHtml(icon)}" alt="" />` : '🍽️'}</div>
      <div class="ruta-item-name">${escapeHtml(m.title)}</div>
      ${scoreHtml}
      ${voteChipHtml}
    </a>`;
}

/* ══════════════════════════════
   INLINE VOTE
══════════════════════════════ */
function toggleRutaVote(e, markerId, catId) {
  e.preventDefault(); e.stopPropagation();
  document.querySelectorAll('.ruta-vote-btns').forEach(el => {
    if (el.id !== `rvb-${markerId}`) el.style.display = 'none';
  });
  const btns = document.getElementById(`rvb-${markerId}`);
  if (btns) btns.style.display = btns.style.display === 'none' ? 'grid' : 'none';
}

async function castRutaVote(e, value, markerId, catId) {
  e.preventDefault(); e.stopPropagation();
  if (!CURRENT_USER) {
    await softLoginNudge("Sign in to vote and track your ruta progress.");
    return;
  }

  const btns = document.getElementById(`rvb-${markerId}`);
  if (btns) btns.style.display = 'none';
  const chip = document.querySelector(`#ri-${markerId} .ruta-vote-chip`);
  if (chip) chip.textContent = 'Saving…';

  const { error } = await sb.from('votes').upsert(
    [{ marker_id: markerId, user_id: CURRENT_USER.id, vote: value, category_id: catId, is_active: true }],
    { onConflict: 'marker_id,category_id,user_id' }
  );
  if (error) { if (chip) chip.textContent = '★ Vote'; return; }

  // Update local state
  MY_VOTES[`${markerId}__${catId}`] = { marker_id: markerId, vote: value, category_id: catId, is_active: true };

  // Card pop animation
  const card = document.getElementById(`ri-${markerId}`);
  if (card) {
    card.classList.add('ruta-item-popping');
    setTimeout(() => card.classList.remove('ruta-item-popping'), 350);
    // Re-render this card
    const ri = RUTA_ITEMS.find(r => r.markers?.id === markerId);
    if (ri) {
      const newHtml = renderRutaItem(ri, catId, 0);
      const tmp = document.createElement('div');
      tmp.innerHTML = newHtml;
      const newCard = tmp.firstElementChild;
      if (newCard) { newCard.style.animationDelay = '0s'; card.replaceWith(newCard); }
    }
  }

  updateProgress(ACTIVE_RUTA);

  // Check for completion
  const activeItems = RUTA_ITEMS.filter(ri => ri.markers?.is_active);
  const voted = countVoted(ACTIVE_RUTA);
  if (voted === activeItems.length && activeItems.length > 0) {
    const cat = CATEGORIES_MAP[ACTIVE_RUTA?.category_id];
    if (typeof gtag !== "undefined") {
      gtag("event", "ruta_completed", {
        ruta_id:       ACTIVE_RUTA?.id,
        category_name: cat?.name || "",
        city:          SELECTED_CITY
      });
    }
    setTimeout(() => showCompletion(ACTIVE_RUTA), 600);
  }
}

/* ══════════════════════════════
   MAP
══════════════════════════════ */
function toggleRutaMap() {
  RUTA_MAP_OPEN = !RUTA_MAP_OPEN;
  const wrap = document.getElementById('rutaMapWrap');
  const toggle = document.getElementById('rutaMapToggle');
  wrap.style.display = RUTA_MAP_OPEN ? 'block' : 'none';
  toggle.textContent = RUTA_MAP_OPEN ? '🗺 Hide map' : '🗺 Show on map';
  if (RUTA_MAP_OPEN && !RUTA_MAP_INSTANCE) initRutaMap(ACTIVE_RUTA);
  if (RUTA_MAP_INSTANCE) setTimeout(() => RUTA_MAP_INSTANCE.invalidateSize(), 50);
}

function initRutaMap(ruta) {
  if (!ruta) return;
  const mapWrap = document.getElementById('rutaMapWrap');
  // On desktop always show map; on mobile only if toggled
  const isMobile = window.innerWidth <= 768;
  if (!isMobile) mapWrap.style.display = 'block';

  if (RUTA_MAP_INSTANCE) { RUTA_MAP_INSTANCE.remove(); RUTA_MAP_INSTANCE = null; }

  const cityCenter = SELECTED_CITY === 'MAD' ? [40.4168, -3.7038] : [41.3888, 2.1589];
  const markers = RUTA_ITEMS.filter(ri => ri.markers?.lat && ri.markers?.lon && ri.markers?.is_active);

  const catId = ruta.category_id;
  const cat = CATEGORIES_MAP[catId];
  const iconUrl = absIconUrl(cat?.icon_url || '');

  setTimeout(() => {
    RUTA_MAP_INSTANCE = L.map('rutaMap', { zoomControl: true, scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap', maxZoom: 18
    }).addTo(RUTA_MAP_INSTANCE);
    RUTA_MAP_INSTANCE.setView(cityCenter, 13); // always default to city first

    const lMarkers = [];
    markers.forEach(ri => {
      const m = ri.markers;
      const myVote = MY_VOTES[`${m.id}__${catId}`];
      const cls = myVote ? colorClassForScore(myVote.vote) : 'ruta-score-none';
      const icon = L.divIcon({
        className: `tba-marker ${cls}`,
        html: `<div class="tba-marker-inner">${iconUrl ? `<img src="${escapeHtml(iconUrl)}" alt="" />` : ''}</div>`,
        iconSize: [30, 30], iconAnchor: [15, 15]
      });
      const mk = L.marker([m.lat, m.lon], { icon }).addTo(RUTA_MAP_INSTANCE);
      mk.bindPopup(`<b>${escapeHtml(m.title)}</b>${myVote ? `<br>Your vote: ${myVote.vote}` : ''}`);
      lMarkers.push(mk);
    });

    const group = L.featureGroup(lMarkers);
    try {
      RUTA_MAP_INSTANCE.fitBounds(group.getBounds().pad(0.15));
    } catch(e) {
      const center = CITY_CENTERS[SELECTED_CITY] || [41.3888, 2.1589];
      RUTA_MAP_INSTANCE.setView(center, 13);
    }
  }, 100);
}

/* ══════════════════════════════
   COMPLETION
══════════════════════════════ */
function showCompletion(ruta) {
  const cat = CATEGORIES_MAP[ruta.category_id];
  const catId = ruta.category_id;

  document.getElementById('rutaCompleteSub').textContent =
    `You've tried all 12 ${cat?.name || ''} spots in ${SELECTED_CITY === 'BCN' ? 'Barcelona' : 'Madrid'}.`;

  // Top 3
  const voted = RUTA_ITEMS
    .filter(ri => ri.markers?.is_active && MY_VOTES[`${ri.markers.id}__${catId}`])
    .map(ri => ({ title: ri.markers.title, score: Number(MY_VOTES[`${ri.markers.id}__${catId}`].vote) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const medals = ['🥇','🥈','🥉'];
  document.getElementById('rutaCompleteTop3').innerHTML = `
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:6px;">Your top picks</div>
    ${voted.map((v, i) => `
      <div class="ruta-top3-row">
        <span class="ruta-top3-pos">${medals[i] || (i+1)}</span>
        <span class="ruta-top3-name">${escapeHtml(v.title)}</span>
        <span class="ruta-top3-score ${colorClassForScore(v.score)}">${v.score}</span>
      </div>`).join('')}
  `;

  // Share card
  const topName = voted[0]?.title || '';
  document.getElementById('rutaCompleteShareCard').innerHTML = `
    <div class="ruta-complete-share-title">✅ La Selección de ${escapeHtml(cat?.name || '')} · ${SELECTED_CITY === 'BCN' ? 'Barcelona' : 'Madrid'}</div>
    <div style="margin-top:4px;">12/12 · My top pick: ${escapeHtml(topName)}</div>
    <div style="margin-top:2px;font-size:11px;opacity:0.7;">thebestagain.com/rutas</div>
  `;

  document.getElementById('rutaCompleteOverlay').style.display = 'flex';
}

function closeCompletion() {
  document.getElementById('rutaCompleteOverlay').style.display = 'none';
  // Re-sort grid to show all voted on top
  if (ACTIVE_RUTA) renderGrid(ACTIVE_RUTA);
}

function shareRutaCompletion() {
  const cat  = CATEGORIES_MAP[ACTIVE_RUTA?.category_id];
  const city = SELECTED_CITY === 'BCN' ? 'Barcelona' : 'Madrid';
  if (typeof gtag !== "undefined") {
    gtag("event", "share_clicked", {
      content_type:  "ruta_completion",
      category_name: cat?.name || "",
      city:          SELECTED_CITY
    });
  }
  const text = `✅ I completed La Selección de ${cat?.name || ''} en ${city} — 12/12 on @thebestagain!\nthebestagain.com/rutas`;
  if (navigator.share) {
    navigator.share({ text, url: 'https://thebestagain.com/rutas' }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => alert('Copied to clipboard!'));
  }
}
