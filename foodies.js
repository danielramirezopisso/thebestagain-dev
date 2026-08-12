/* ══════════════════════════════════════════════════════
   FOODIES — public shareable profile
   URL: foodies.html?u=dani[&cat=ID]
══════════════════════════════════════════════════════ */

// Hardcoded tag → UUID map (until profiles table exists)
const FOODIE_TAGS = {
  'dani': '170a6e36-52e3-4ac6-8db6-98c1391ddc3e'
};
const FOODIE_NAMES = {
  'dani': 'Dani'
};

let F_VOTES = [];        // user's votes joined with marker info
let F_CATS = [];         // categories present in votes
let F_ACTIVE_CAT = null; // active category filter
let F_MAP = null;
let F_LAYER = null;

const F_COLORS = v => {
  const x = Number(v);
  if (x >= 9) return '#2d8653';
  if (x >= 7) return '#6aab7e';
  if (x >= 5) return '#e8b84b';
  if (x >= 3) return '#f0906e';
  return '#e05c3a';
};

async function initFoodie() {
  const qp = new URLSearchParams(location.search);
  const tag = (qp.get('u') || '').toLowerCase();
  const catParam = qp.get('cat');

  // Look up TBATag in profiles table; fallback to hardcoded map
  let uid = null, name = null;
  try {
    const { data: prof } = await sb.from('profiles')
      .select('id, display_name').eq('username', tag).maybeSingle();
    if (prof) { uid = prof.id; name = prof.display_name || tag; }
  } catch(e) {}
  if (!uid) { uid = FOODIE_TAGS[tag]; name = FOODIE_NAMES[tag] || tag; }

  if (!uid) {
    document.getElementById('fName').textContent = 'Foodie not found';
    document.getElementById('fSub').textContent = 'This profile does not exist (yet).';
    return;
  }
  window._F_TAG = tag; window._F_NAME = name;
  document.getElementById('fName').textContent = name;
  document.getElementById('fAvatar').textContent = name.charAt(0).toUpperCase();
  document.title = `${name}'s food map — The Best Again`;

  // Load votes + markers + categories
  const [{ data: votes }, { data: cats }] = await Promise.all([
    sb.from('votes')
      .select('vote, category_id, marker_id, markers!inner(id, title, lat, lon, city, group_type, is_active)')
      .eq('user_id', uid)
      .eq('is_active', true),
    sb.from('categories')
      .select('id, name, icon_url')
      .eq('is_active', true)
  ]);

  const catById = {};
  (cats || []).forEach(c => catById[c.id] = c);

  F_VOTES = (votes || [])
    .filter(v => v.markers && v.markers.is_active && v.markers.group_type === 'place' && v.markers.lat && v.markers.lon)
    .map(v => ({
      marker_id: v.marker_id,
      title: v.markers.title,
      lat: v.markers.lat,
      lon: v.markers.lon,
      city: v.markers.city,
      vote: Number(v.vote),
      category_id: v.category_id,
      category: catById[v.category_id]?.name || '',
      icon: catById[v.category_id]?.icon_url || null
    }));

  if (!F_VOTES.length) {
    document.getElementById('fSub').textContent = 'No public votes yet.';
    return;
  }

  // Stats
  const avg = (F_VOTES.reduce((s, v) => s + v.vote, 0) / F_VOTES.length).toFixed(1);
  const nPlaces = new Set(F_VOTES.map(v => v.marker_id)).size;
  document.getElementById('fSub').textContent = `Barcelona · The Best Again`;
  document.getElementById('fStats').innerHTML = `
    <div class="f-stat"><span class="f-stat-val">${F_VOTES.length}</span><span class="f-stat-lbl">votes</span></div>
    <div class="f-stat"><span class="f-stat-val">${nPlaces}</span><span class="f-stat-lbl">places</span></div>
    <div class="f-stat"><span class="f-stat-val">${avg}</span><span class="f-stat-lbl">avg score</span></div>
  `;

  // Categories present in votes, sorted by count
  const counts = {};
  F_VOTES.forEach(v => { counts[v.category_id] = (counts[v.category_id] || 0) + 1; });
  F_CATS = Object.keys(counts)
    .map(id => ({ id: parseInt(id), name: catById[id]?.name || '?', count: counts[id] }))
    .sort((a, b) => b.count - a.count);

  // Active cat from URL
  if (catParam && counts[catParam]) F_ACTIVE_CAT = parseInt(catParam);

  renderChips();
  initMap();
  render();
}

function renderChips() {
  const host = document.getElementById('fChips');
  let html = `<button class="f-chip ${!F_ACTIVE_CAT ? 'f-chip-on' : ''}" onclick="setFoodieCat(null)">All</button>`;
  F_CATS.forEach(c => {
    html += `<button class="f-chip ${F_ACTIVE_CAT === c.id ? 'f-chip-on' : ''}" onclick="setFoodieCat(${c.id})">${escF(c.name)} <span class="f-chip-n">${c.count}</span></button>`;
  });
  host.innerHTML = html;
}

function setFoodieCat(id) {
  F_ACTIVE_CAT = id;
  const url = new URL(location);
  if (id) url.searchParams.set('cat', id); else url.searchParams.delete('cat');
  history.replaceState(null, '', url);
  renderChips();
  render();
}

function initMap() {
  F_MAP = L.map('foodieMap', { zoomControl: false, scrollWheelZoom: false }).setView([41.3889, 2.1618], 13);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19
  }).addTo(F_MAP);
  F_LAYER = L.layerGroup().addTo(F_MAP);
}

function render() {
  const votes = F_ACTIVE_CAT
    ? F_VOTES.filter(v => v.category_id === F_ACTIVE_CAT)
    : F_VOTES;

  // Sort by vote desc
  const sorted = [...votes].sort((a, b) => b.vote - a.vote);

  // Title
  const catName = F_ACTIVE_CAT ? (F_CATS.find(c => c.id === F_ACTIVE_CAT)?.name || '') : '';
  document.getElementById('fListTitle').textContent = catName
    ? `Top ${catName}`
    : 'All rankings';

  // List
  document.getElementById('fList').innerHTML = sorted.map((v, i) => `
    <a class="f-row" href="marker.html?id=${v.marker_id}${v.category_id ? '&cat=' + v.category_id : ''}">
      <span class="f-row-pos">${i + 1}</span>
      <span class="f-row-body">
        <span class="f-row-title">${escF(v.title)}</span>
        ${!F_ACTIVE_CAT ? `<span class="f-row-cat">${escF(v.category)}</span>` : ''}
      </span>
      <span class="f-row-score" style="background:${F_COLORS(v.vote)}">${v.vote.toFixed(1)}</span>
    </a>
  `).join('');

  // Contextual CTA
  const ctaBtn = document.querySelector('.foodie-cta a');
  const ctaP = document.querySelector('.foodie-cta p');
  if (ctaBtn) {
    if (F_ACTIVE_CAT) {
      ctaBtn.textContent = 'Haz TU ranking de ' + (catName || 'esto') + ' →';
      ctaBtn.href = 'map.html?category=' + F_ACTIVE_CAT;
    } else {
      ctaBtn.textContent = 'Explora el mapa y vota →';
      ctaBtn.href = 'map.html';
    }
    if (ctaP) ctaP.textContent = F_ACTIVE_CAT ? '¿No estás de acuerdo?' : '¿Te falta tu opinión aquí?';
  }

  // Map markers
  F_LAYER.clearLayers();
  const pts = [];
  sorted.forEach((v, i) => {
    pts.push([v.lat, v.lon]);
    const ic = L.divIcon({
      className: '',
      html: `<div style="width:30px;height:30px;border-radius:50%;background:${F_COLORS(v.vote)};border:2.5px solid rgba(255,255,255,0.9);box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:800;">${i + 1}</div>`,
      iconSize: [30, 30], iconAnchor: [15, 15]
    });
    L.marker([v.lat, v.lon], { icon: ic }).addTo(F_LAYER)
      .bindPopup(`<b>${escF(v.title)}</b><br>${v.vote.toFixed(1)} ★ · <a href="marker.html?id=${v.marker_id}">View →</a>`);
  });
  if (pts.length) F_MAP.fitBounds(pts, { maxZoom: 15, padding: [30, 30] });
}

function escF(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFoodie);
} else {
  initFoodie();
}


/* ══ SHARE — canvas poster ══ */
async function shareFoodie() {
  const votes = F_ACTIVE_CAT ? F_VOTES.filter(v => v.category_id === F_ACTIVE_CAT) : F_VOTES;
  const sorted = [...votes].sort((a, b) => b.vote - a.vote).slice(0, 5);
  if (!sorted.length) return;
  if (typeof gtag !== 'undefined') gtag('event', 'share_clicked', { content_type: 'foodie_profile' });

  const catName = F_ACTIVE_CAT ? (F_CATS.find(c => c.id === F_ACTIVE_CAT)?.name || '') : '';
  const title = catName ? 'Top ' + catName : 'Mi mapa foodie';
  const name = window._F_NAME || 'foodie';
  const tag = window._F_TAG || '';

  const W = 1080, H = 1350;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  ctx.fillStyle = '#f4f1ec'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1a1714'; ctx.fillRect(0, 0, W, 12);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#7a7672';
  ctx.font = '700 30px Georgia';
  ctx.fillText('THE BEST AGAIN', W/2, 100);

  ctx.fillStyle = '#1a1714';
  ctx.font = 'italic 900 88px Georgia';
  wrapTextF(ctx, title, W/2, 210, W - 140, 96);

  ctx.fillStyle = '#7a7672';
  ctx.font = 'italic 600 40px Georgia';
  ctx.fillText('Barcelona · según @' + tag, W/2, 330);

  // Rows
  const startY = 430, rowH = 150;
  sorted.forEach((v, i) => {
    const y = startY + i * rowH;
    // position
    ctx.textAlign = 'left';
    ctx.fillStyle = i === 0 ? '#2d4a8a' : '#b5b0aa';
    ctx.font = '900 ' + (i === 0 ? 72 : 56) + 'px Georgia';
    ctx.fillText(String(i + 1), 80, y + 55);
    // name
    ctx.fillStyle = '#1a1714';
    ctx.font = (i === 0 ? '900 52px' : '700 44px') + ' Georgia';
    let nm = v.title;
    while (ctx.measureText(nm).width > W - 420 && nm.length > 3) nm = nm.slice(0, -1);
    if (nm !== v.title) nm += '…';
    ctx.fillText(nm, 170, y + 55);
    // score pill
    const scoreColor = F_COLORS(v.vote);
    const px = W - 210, py = y + 12;
    ctx.fillStyle = scoreColor;
    ctx.beginPath();
    ctx.roundRect(px, py, 130, 62, 31);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = '900 38px Georgia';
    ctx.fillText(v.vote.toFixed(1), px + 65, y + 55);
    // divider
    ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(80, y + 95); ctx.lineTo(W - 80, y + 95); ctx.stroke();
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = '#1a1714';
  ctx.font = 'italic 700 44px Georgia';
  ctx.fillText('¿No estás de acuerdo?', W/2, H - 130);
  ctx.fillStyle = '#2d4a8a';
  ctx.font = '700 38px Georgia';
  ctx.fillText('thebestagain.com/foodies.html?u=' + tag, W/2, H - 70);

  cv.toBlob(async blob => {
    if (!blob) return;
    const file = new File([blob], 'tba-ranking.png', { type: 'image/png' });
    const shareUrl = location.origin + '/foodies.html?u=' + tag + (F_ACTIVE_CAT ? '&cat=' + F_ACTIVE_CAT : '');
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], text: title + ' de Barcelona según @' + tag + ' — ' + shareUrl }).catch(() => {});
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'tba-ranking.png';
      a.click();
    }
  }, 'image/png');
}

function wrapTextF(ctx, text, cx, y, maxW, lineH) {
  const words = String(text || '').split(' ');
  let line = '', lines = [];
  words.forEach(w => {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; }
    else line = t;
  });
  if (line) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, cx, y + i * lineH));
}
