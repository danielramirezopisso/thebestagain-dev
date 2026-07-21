// battles.js — VS Poster redesign
// Each battle = a split poster. Tap a side to vote. Animated reveal. Canvas share image.

/* ── Visitor ID ── */
function getVisitorId() {
  let vid = localStorage.getItem('tba_visitor_id');
  if (!vid) {
    vid = crypto.randomUUID ? crypto.randomUUID() : 'v-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    localStorage.setItem('tba_visitor_id', vid);
  }
  return vid;
}

/* ── Local vote cache ── */
const VOTED_KEY = 'tba_battle_votes';
function getLocalVotes() {
  try { return JSON.parse(localStorage.getItem(VOTED_KEY) || '{}'); } catch { return {}; }
}
function saveLocalVote(id, choice) {
  const v = getLocalVotes(); v[id] = choice;
  localStorage.setItem(VOTED_KEY, JSON.stringify(v));
}

/* ── State ── */
let ALL_BATTLES = [];
let TALLY       = {};
let MY_VOTES    = {};

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */
async function initBattles() {
  const [battlesRes, votesRes] = await Promise.all([
    sb.from('battles').select('*').eq('is_active', true)
      .order('category_order', { ascending: true })
      .order('position', { ascending: true }),
    sb.from('battle_votes').select('battle_id, choice')
  ]);

  ALL_BATTLES = battlesRes.data || [];
  const allVotes = votesRes.data || [];

  if (!ALL_BATTLES.length) {
    hideEl('bSkeleton'); showEl('bEmpty');
    return;
  }

  TALLY = {};
  allVotes.forEach(v => {
    if (v.choice !== 'a' && v.choice !== 'b') return;
    if (!TALLY[v.battle_id]) TALLY[v.battle_id] = { a: 0, b: 0 };
    TALLY[v.battle_id][v.choice]++;
  });

  const visitorId = getVisitorId();
  const user = await maybeUser();

  if (user) {
    const [{ data: userVotes }, { data: visitorVotes }] = await Promise.all([
      sb.from('battle_votes').select('battle_id, choice').eq('user_id', user.id),
      sb.from('battle_votes').select('battle_id, choice').eq('visitor_id', visitorId)
    ]);
    const dbMap = {};
    (visitorVotes || []).forEach(v => { dbMap[v.battle_id] = v.choice; });
    (userVotes || []).forEach(v => { dbMap[v.battle_id] = v.choice; });
    MY_VOTES = { ...getLocalVotes(), ...dbMap };
  } else {
    const { data: myVotes } = await sb.from('battle_votes')
      .select('battle_id, choice').eq('visitor_id', visitorId);
    const dbMap = {};
    (myVotes || []).forEach(v => { dbMap[v.battle_id] = v.choice; });
    MY_VOTES = { ...getLocalVotes(), ...dbMap };
  }

  hideEl('bSkeleton');
  renderAll();
}

function hideEl(id) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
function showEl(id) { const e = document.getElementById(id); if (e) e.style.display = 'block'; }

/* ═══════════════════════════════════════
   RENDER
═══════════════════════════════════════ */
function renderAll() {
  const host = document.getElementById('bFeed');
  if (!host) return;

  // Featured = first unvoted battle, or first battle
  const unvoted = ALL_BATTLES.filter(b => !MY_VOTES[b.id] || MY_VOTES[b.id] === 'no_opinion');
  const featured = unvoted[0] || ALL_BATTLES[0];
  const rest = ALL_BATTLES.filter(b => b.id !== featured.id);

  let html = renderPoster(featured, true);
  html += '<div class="b-archive-label">Más batallas</div>';
  html += '<div class="b-archive">' + rest.map(b => renderPoster(b, false)).join('') + '</div>';
  host.innerHTML = html;
}

function renderPoster(b, isFeatured) {
  const voted   = MY_VOTES[b.id] === 'a' || MY_VOTES[b.id] === 'b';
  const t       = TALLY[b.id] || { a: 0, b: 0 };
  const total   = t.a + t.b;
  const pctA    = total ? Math.round(t.a / total * 100) : 50;
  const pctB    = 100 - pctA;
  const sizeCls = isFeatured ? 'b-poster-lg' : 'b-poster-sm';

  const imgA = b.image_a_url, imgB = b.image_b_url;
  const bgA = imgA ? `background-image:url('${imgA}')` : '';
  const bgB = imgB ? `background-image:url('${imgB}')` : '';
  const emojiA = !imgA ? '<span class="b-side-emoji">🍽</span>' : '';
  const emojiB = !imgB ? '<span class="b-side-emoji">🍽</span>' : '';

  // widths: before vote 50/50; after vote animate to result
  const wA = voted ? pctA : 50;
  const wB = voted ? pctB : 50;

  return `
  <div class="b-poster ${sizeCls} ${voted ? 'b-voted' : ''}" id="poster-${b.id}">
    <div class="b-question">${esc(b.question)}</div>
    <div class="b-arena">
      <div class="b-side b-side-a ${MY_VOTES[b.id]==='a'?'b-side-mine':''}" style="width:${wA}%;${bgA}"
           onclick="voteSide('${b.id}','a')">
        ${emojiA}
        <div class="b-side-shade"></div>
        <div class="b-side-label">
          <span class="b-side-name">${esc(b.option_a)}</span>
          <span class="b-side-pct" style="${voted?'':'display:none'}">${pctA}%</span>
        </div>
        ${MY_VOTES[b.id]==='a' ? '<span class="b-mine-badge">Tu voto</span>' : ''}
      </div>
      <div class="b-vs">VS</div>
      <div class="b-side b-side-b ${MY_VOTES[b.id]==='b'?'b-side-mine':''}" style="width:${wB}%;${bgB}"
           onclick="voteSide('${b.id}','b')">
        ${emojiB}
        <div class="b-side-shade"></div>
        <div class="b-side-label">
          <span class="b-side-name">${esc(b.option_b)}</span>
          <span class="b-side-pct" style="${voted?'':'display:none'}">${pctB}%</span>
        </div>
        ${MY_VOTES[b.id]==='b' ? '<span class="b-mine-badge">Tu voto</span>' : ''}
      </div>
    </div>
    <div class="b-foot">
      <span class="b-verdict" id="verdict-${b.id}">${voted ? verdictLine(b, MY_VOTES[b.id], pctA, pctB) : (total ? total + ' votos' : 'Sé el primero en votar')}</span>
      <button class="b-share-btn" onclick="shareBattleImage('${b.id}')">Compartir ↗</button>
    </div>
  </div>`;
}

function verdictLine(b, mine, pctA, pctB) {
  const myPct  = mine === 'a' ? pctA : pctB;
  const myName = mine === 'a' ? b.option_a : b.option_b;
  if (myPct >= 50) return `Team ${esc(myName)} — el ${myPct}% está contigo 💪`;
  return `Solo el ${myPct}% piensa como tú. Valiente. 😤`;
}

/* ═══════════════════════════════════════
   VOTE
═══════════════════════════════════════ */
async function voteSide(battleId, choice) {
  const prev = MY_VOTES[battleId];
  if (prev === choice) return; // already this side

  // Update tally
  if (!TALLY[battleId]) TALLY[battleId] = { a: 0, b: 0 };
  if (prev === 'a' || prev === 'b') TALLY[battleId][prev] = Math.max(0, TALLY[battleId][prev] - 1);
  TALLY[battleId][choice]++;

  MY_VOTES[battleId] = choice;
  saveLocalVote(battleId, choice);
  persistVote(battleId, choice);
  if (typeof gtag !== 'undefined') gtag('event', 'battle_voted', { battle_id: battleId, choice });

  animateReveal(battleId, choice);
}

function animateReveal(battleId, choice) {
  const poster = document.getElementById('poster-' + battleId);
  if (!poster) { renderAll(); return; }

  const b = ALL_BATTLES.find(x => x.id === battleId);
  const t = TALLY[battleId];
  const total = t.a + t.b;
  const pctA = total ? Math.round(t.a / total * 100) : 50;
  const pctB = 100 - pctA;

  const sideA = poster.querySelector('.b-side-a');
  const sideB = poster.querySelector('.b-side-b');
  poster.classList.add('b-voted');

  // Flash chosen side
  const chosen = choice === 'a' ? sideA : sideB;
  chosen.classList.add('b-flash');
  setTimeout(() => chosen.classList.remove('b-flash'), 450);

  // Animate widths
  requestAnimationFrame(() => {
    sideA.style.width = pctA + '%';
    sideB.style.width = pctB + '%';
  });

  // Show percentages + badges
  setTimeout(() => {
    sideA.querySelector('.b-side-pct').style.display = '';
    sideB.querySelector('.b-side-pct').style.display = '';
    sideA.querySelector('.b-side-pct').textContent = pctA + '%';
    sideB.querySelector('.b-side-pct').textContent = pctB + '%';
    sideA.classList.toggle('b-side-mine', choice === 'a');
    sideB.classList.toggle('b-side-mine', choice === 'b');
    // Remove old badges, add new
    poster.querySelectorAll('.b-mine-badge').forEach(el => el.remove());
    const badge = document.createElement('span');
    badge.className = 'b-mine-badge';
    badge.textContent = 'Tu voto';
    chosen.appendChild(badge);
    // Verdict
    const v = document.getElementById('verdict-' + battleId);
    if (v) v.innerHTML = verdictLine(b, choice, pctA, pctB);
  }, 550);
}

async function persistVote(battleId, choice) {
  const visitorId = getVisitorId();
  const user = await maybeUser();
  const payload = { battle_id: battleId, visitor_id: visitorId, choice };
  if (user) payload.user_id = user.id;
  const { error } = await sb.from('battle_votes')
    .upsert(payload, { onConflict: user ? 'battle_id,user_id' : 'battle_id,visitor_id' });
  if (error) console.warn('Vote save error:', error.message);
}

/* ═══════════════════════════════════════
   SHARE — canvas poster image
═══════════════════════════════════════ */
async function shareBattleImage(battleId) {
  const b = ALL_BATTLES.find(x => x.id === battleId);
  if (!b) return;
  if (typeof gtag !== 'undefined') gtag('event', 'share_clicked', { content_type: 'battle', battle_id: battleId });

  const t = TALLY[battleId] || { a: 0, b: 0 };
  const total = t.a + t.b;
  const pctA = total ? Math.round(t.a / total * 100) : 50;
  const pctB = 100 - pctA;
  const mine = MY_VOTES[battleId];

  const W = 1080, H = 1080;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  // Background
  ctx.fillStyle = '#f4f1ec';
  ctx.fillRect(0, 0, W, H);

  // Load images
  const loadImg = url => new Promise(resolve => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
  const [imgA, imgB] = await Promise.all([loadImg(b.image_a_url), loadImg(b.image_b_url)]);

  // Split arena — proportional to result
  const arenaY = 260, arenaH = 560;
  const splitX = W * (pctA / 100);

  // Draw side A
  ctx.save();
  ctx.beginPath(); ctx.rect(0, arenaY, splitX, arenaH); ctx.clip();
  if (imgA) drawCover(ctx, imgA, 0, arenaY, splitX, arenaH);
  else { ctx.fillStyle = '#2d4a8a'; ctx.fillRect(0, arenaY, splitX, arenaH); }
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, arenaY, splitX, arenaH);
  ctx.restore();

  // Draw side B
  ctx.save();
  ctx.beginPath(); ctx.rect(splitX, arenaY, W - splitX, arenaH); ctx.clip();
  if (imgB) drawCover(ctx, imgB, splitX, arenaY, W - splitX, arenaH);
  else { ctx.fillStyle = '#7ba7d4'; ctx.fillRect(splitX, arenaY, W - splitX, arenaH); }
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(splitX, arenaY, W - splitX, arenaH);
  ctx.restore();

  // Divider
  ctx.fillStyle = '#f4f1ec';
  ctx.fillRect(splitX - 4, arenaY, 8, arenaH);

  // VS badge
  ctx.beginPath();
  ctx.arc(splitX, arenaY + arenaH / 2, 54, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1714'; ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'italic 900 44px Georgia';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('VS', splitX, arenaY + arenaH / 2 + 2);

  // Percentages on each side
  ctx.font = '900 96px Georgia';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(pctA + '%', splitX / 2, arenaY + arenaH / 2);
  ctx.fillText(pctB + '%', splitX + (W - splitX) / 2, arenaY + arenaH / 2);

  // Option names below percentages
  ctx.font = '700 40px Georgia';
  wrapText(ctx, b.option_a, splitX / 2, arenaY + arenaH / 2 + 80, splitX - 60, 46);
  wrapText(ctx, b.option_b, splitX + (W - splitX) / 2, arenaY + arenaH / 2 + 80, (W - splitX) - 60, 46);

  // Question at top
  ctx.fillStyle = '#1a1714';
  ctx.font = 'italic 900 64px Georgia';
  wrapText(ctx, b.question, W / 2, 130, W - 120, 74);

  // My vote line
  if (mine === 'a' || mine === 'b') {
    const myName = mine === 'a' ? b.option_a : b.option_b;
    ctx.font = '700 42px Georgia';
    ctx.fillStyle = '#2d4a8a';
    ctx.fillText('Yo voté: ' + myName, W / 2, arenaY + arenaH + 90);
  }

  // Footer
  ctx.font = '600 34px Georgia';
  ctx.fillStyle = '#7a7672';
  ctx.fillText('¿Y tú? — thebestagain.com', W / 2, H - 70);

  // Export + share
  cv.toBlob(async blob => {
    if (!blob) return;
    const file = new File([blob], 'tba-battle.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], text: b.question + ' — vota en thebestagain.com/battles.html' }).catch(() => {});
    } else {
      // Fallback: download
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'tba-battle.png';
      a.click();
    }
  }, 'image/png');
}

function drawCover(ctx, img, x, y, w, h) {
  const ir = img.width / img.height, r = w / h;
  let sw, sh, sx, sy;
  if (ir > r) { sh = img.height; sw = sh * r; sx = (img.width - sw) / 2; sy = 0; }
  else { sw = img.width; sh = sw / r; sx = 0; sy = (img.height - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function wrapText(ctx, text, cx, y, maxW, lineH) {
  const words = String(text || '').split(' ');
  let line = '', lines = [];
  words.forEach(w => {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  });
  if (line) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, cx, y + i * lineH));
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBattles);
} else {
  initBattles();
}
