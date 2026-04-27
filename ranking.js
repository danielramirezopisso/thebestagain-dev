// ranking.js — The Best Again Rankings page

const RANKING_YEAR = 2025;
const STORAGE_URL = 'https://pwlskdjmgqxikbamfshj.supabase.co/storage/v1/object/public/marker-photos/';

let RANK_CITY = 'BCN';
let RANK_CAT_ID = null;
let RANK_CATEGORIES = [];  // categories that have ranking entries
let RANK_CAT_MAP = {};     // id -> category row

function escapeHtml(s) {
  return String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;')
    .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");
}

function colorClass(avg, cnt) {
  if (!Number(cnt) || !avg) return 'rating-none';
  const x = Number(avg);
  if (x >= 9) return 'rating-9-10';
  if (x >= 7) return 'rating-7-8';
  if (x >= 5) return 'rating-5-6';
  if (x >= 3) return 'rating-3-4';
  return 'rating-1-2';
}

function photoUrl(path) {
  if (!path) return null;
  return STORAGE_URL + encodeURIComponent(path).replace(/%2F/g, '/');
}

function absIcon(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return window.location.href.replace(/\/[^/]*(\?.*)?$/, '/') + url;
}

function mapsUrl(lat, lon) {
  if (!lat || !lon) return null;
  return `https://maps.google.com/?q=${lat},${lon}`;
}

/* ══════════════════════════════
   INIT
══════════════════════════════ */
async function initRankingPage() {
  // Load all categories that have rankings for this year
  const { data: rankData } = await sb.from('rankings')
    .select('category_id').eq('year', RANKING_YEAR).eq('is_active', true);

  const catIds = [...new Set((rankData || []).map(r => r.category_id))];
  if (!catIds.length) {
    hideSkeleton();
    document.getElementById('rankingEmpty').style.display = 'block';
    return;
  }

  const { data: catData } = await sb.from('categories')
    .select('id,name,icon_url').in('id', catIds).order('name');

  RANK_CATEGORIES = catData || [];
  RANK_CATEGORIES.forEach(c => RANK_CAT_MAP[c.id] = c);

  renderCatChips();

  // Auto-select first category
  if (RANK_CATEGORIES.length) await selectRankCategory(RANK_CATEGORIES[0].id);
}

/* ══════════════════════════════
   CITY
══════════════════════════════ */
async function selectRankCity(city) {
  RANK_CITY = city;
  document.querySelectorAll('.ranking-city-tab').forEach(el => el.classList.remove('ranking-city-active'));
  document.getElementById(`rankCity${city}`)?.classList.add('ranking-city-active');
  if (RANK_CAT_ID) await loadRanking(RANK_CAT_ID);
}

/* ══════════════════════════════
   CATEGORY CHIPS
══════════════════════════════ */
function renderCatChips() {
  const host = document.getElementById('rankingCatChips');
  if (!host) return;
  host.innerHTML = RANK_CATEGORIES.map(c => {
    const icon = absIcon(c.icon_url);
    return `<button class="ranking-cat-chip" data-cat="${c.id}" onclick="selectRankCategory(${c.id})">
      ${icon ? `<img src="${escapeHtml(icon)}" alt="" />` : ''}
      ${escapeHtml(c.name)}
    </button>`;
  }).join('');
}

async function selectRankCategory(catId) {
  RANK_CAT_ID = catId;
  document.querySelectorAll('.ranking-cat-chip').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.cat) === catId);
  });
  showSkeleton();
  await loadRanking(catId);
}

/* ══════════════════════════════
   LOAD RANKING DATA
══════════════════════════════ */
async function loadRanking(catId) {
  const { data, error } = await sb.from('rankings')
    .select(`
      position, editorial_note, featured_photo_id,
      markers ( id, title, rating_avg, rating_count, address, lat, lon, category_id ),
      marker_photos ( storage_path )
    `)
    .eq('year', RANKING_YEAR)
    .eq('city', RANK_CITY)
    .eq('category_id', catId)
    .eq('is_active', true)
    .order('position', { ascending: true });

  hideSkeleton();

  if (error || !data?.length) {
    document.getElementById('rankingCards').style.display = 'none';
    document.getElementById('rankingEmpty').style.display = 'block';
    return;
  }

  document.getElementById('rankingEmpty').style.display = 'none';
  renderRanking(data, catId);
  injectSchemaOrg(data, catId);
}

/* ══════════════════════════════
   RENDER
══════════════════════════════ */
function renderRanking(items, catId) {
  const cat = RANK_CAT_MAP[catId];
  const icon = absIcon(cat?.icon_url || '');

  const podiumItems = items.filter(r => r.position <= 3);
  const gridItems   = items.filter(r => r.position >= 4 && r.position <= 10);
  const bonusItem   = items.find(r => r.position === 11);

  const crownSrc = pos => {
    if (pos === 1) return 'icons/ranking/gold_crown.svg';
    if (pos === 2) return 'icons/ranking/silver_crown.svg';
    return 'icons/ranking/bronze_crown.svg';
  };
  const crownClass = pos => {
    if (pos === 1) return 'crown-gold';
    if (pos === 2) return 'crown-silver';
    return 'crown-bronze';
  };

  // Heading
  const headingHtml = `
    <div class="ranking-cat-heading">
      <div class="ranking-cat-heading-title">
        ${icon ? `<img src="${escapeHtml(icon)}" alt="" style="width:32px;height:32px;object-fit:contain;vertical-align:middle;margin-right:10px;" />` : ''}
        ${escapeHtml(cat?.name || '')}
      </div>
      <div class="ranking-cat-heading-year">The Best Again ${RANKING_YEAR}</div>
    </div>`;

  // Podium
  const podiumHtml = `
    <div class="ranking-podium">
      ${buildPodiumOrder(podiumItems).map(item => {
        if (!item) return '<div></div>';
        const m = item.markers;
        const photo = item.marker_photos?.storage_path ? photoUrl(item.marker_photos.storage_path) : null;
        const cls = colorClass(m?.rating_avg, m?.rating_count);
        const score = m?.rating_count ? Number(m.rating_avg).toFixed(1) : '—';
        const addr = m?.address ? m.address.split(',').slice(0,2).join(',') : '';
        const href = `marker.html?id=${encodeURIComponent(m?.id)}&cat=${catId}`;
        return `
          <a class="podium-card podium-card-${item.position}" href="${href}">
            <div class="podium-photo">
              ${photo
                ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(m?.title)}" loading="lazy" />`
                : `<div class="podium-photo-placeholder">${icon ? `<img src="${escapeHtml(icon)}" style="width:64px;opacity:0.25;" />` : '🍽️'}</div>`}
              <img class="podium-crown ${crownClass(item.position)}" src="${crownSrc(item.position)}" alt="#${item.position}" />
            </div>
            <div class="podium-body">
              <div class="podium-pos">#${item.position}</div>
              <div class="podium-name">${escapeHtml(m?.title || '')}</div>
              ${addr ? `<div class="podium-addr">📍 ${escapeHtml(addr)}</div>` : ''}
              ${item.editorial_note ? `<div class="podium-note">"${escapeHtml(item.editorial_note)}"</div>` : ''}
              <span class="podium-score ${cls}">${escapeHtml(score)}</span>
            </div>
          </a>`;
      }).join('')}
    </div>`;

  // Grid (#4–#10)
  const gridHtml = gridItems.length ? `
    <div class="ranking-grid">
      ${gridItems.map(item => {
        const m = item.markers;
        const photo = item.marker_photos?.storage_path ? photoUrl(item.marker_photos.storage_path) : null;
        const cls = colorClass(m?.rating_avg, m?.rating_count);
        const score = m?.rating_count ? Number(m.rating_avg).toFixed(1) : '—';
        const addr = m?.address ? m.address.split(',').slice(0,2).join(',') : '';
        const href = `marker.html?id=${encodeURIComponent(m?.id)}&cat=${catId}`;
        return `
          <a class="grid-card" href="${href}">
            <div class="grid-photo">
              ${photo
                ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(m?.title)}" loading="lazy" />`
                : `<div class="grid-photo-placeholder">${icon ? `<img src="${escapeHtml(icon)}" style="width:36px;opacity:0.2;" />` : '🍽️'}</div>`}
              <div class="grid-pos-badge">${item.position}</div>
            </div>
            <div class="grid-body">
              <div class="grid-name">${escapeHtml(m?.title || '')}</div>
              ${addr ? `<div class="grid-addr">📍 ${escapeHtml(addr)}</div>` : ''}
              <span class="grid-score ${cls}">${escapeHtml(score)}</span>
            </div>
          </a>`;
      }).join('')}
    </div>` : '';

  // Bonus track
  const bonusHtml = bonusItem ? (() => {
    const m = bonusItem.markers;
    const photo = bonusItem.marker_photos?.storage_path ? photoUrl(bonusItem.marker_photos.storage_path) : null;
    const cls = colorClass(m?.rating_avg, m?.rating_count);
    const score = m?.rating_count ? Number(m.rating_avg).toFixed(1) : '—';
    const addr = m?.address ? m.address.split(',').slice(0,2).join(',') : '';
    const href = `marker.html?id=${encodeURIComponent(m?.id)}&cat=${catId}`;
    return `
      <div class="ranking-bonus-label">
        <div class="ranking-bonus-label-line"></div>
        <div class="ranking-bonus-label-text">Bonus Track</div>
        <div class="ranking-bonus-label-line"></div>
      </div>
      <a class="bonus-card" href="${href}">
        <div class="bonus-photo">
          ${photo
            ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(m?.title)}" loading="lazy" />`
            : `<div class="bonus-photo-placeholder">🎵</div>`}
        </div>
        <div class="bonus-body">
          <div class="bonus-label-tag">★ Bonus Track</div>
          <div class="bonus-name">${escapeHtml(m?.title || '')}</div>
          ${addr ? `<div class="bonus-addr">📍 ${escapeHtml(addr)}</div>` : ''}
          ${bonusItem.editorial_note ? `<div class="bonus-note">"${escapeHtml(bonusItem.editorial_note)}"</div>` : ''}
        </div>
        <span class="bonus-score ${cls}">${escapeHtml(score)}</span>
      </a>`;
  })() : '';

  const container = document.getElementById('rankingCards');
  container.innerHTML = headingHtml + podiumHtml + gridHtml + bonusHtml;
  container.style.display = 'block';
}

// Podium display order: 2, 1, 3 (silver left, gold centre, bronze right)
function buildPodiumOrder(items) {
  const byPos = {};
  items.forEach(i => byPos[i.position] = i);
  return [byPos[2] || null, byPos[1] || null, byPos[3] || null];
}

/* ══════════════════════════════
   SKELETON
══════════════════════════════ */
function showSkeleton() {
  document.getElementById('rankingSkeleton').style.display = 'block';
  document.getElementById('rankingCards').style.display = 'none';
  document.getElementById('rankingEmpty').style.display = 'none';
}

function hideSkeleton() {
  document.getElementById('rankingSkeleton').style.display = 'none';
}

/* ══════════════════════════════
   SCHEMA.ORG — rich results
══════════════════════════════ */
function injectSchemaOrg(items, catId) {
  const cat = RANK_CAT_MAP[catId];
  const existing = document.getElementById('schemaOrgScript');
  if (existing) existing.remove();

  const topItems = items.filter(r => r.position <= 10);
  const itemListElements = topItems.map((item, idx) => {
    const m = item.markers;
    return {
      "@type": "ListItem",
      "position": item.position,
      "name": m?.title || '',
      "url": `https://thebestagain.com/marker.html?id=${m?.id}&cat=${catId}`
    };
  });

  const schema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": `Best ${cat?.name || ''} in Barcelona ${RANKING_YEAR} — The Best Again`,
    "description": `The top ${topItems.length} ${cat?.name || ''} spots in Barcelona, ranked by real votes on The Best Again.`,
    "numberOfItems": topItems.length,
    "itemListElement": itemListElements
  };

  const script = document.createElement('script');
  script.id = 'schemaOrgScript';
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(schema);
  document.head.appendChild(script);

  // Also update page title and meta
  document.title = `Best ${cat?.name || ''} in Barcelona ${RANKING_YEAR} — The Best Again`;
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute('content', `The top ${topItems.length} ${cat?.name || ''} in Barcelona ${RANKING_YEAR}, ranked by real votes. See who took gold, silver and bronze.`);
}
