// battles.js — Clean rewrite
// Stack: Tinder swipe/tap to vote
// Voted grid: editorial leaderboard rows (% bars, thumbnails)
// Votes: only active (is_active = true) battle_votes count

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


// Editorial descriptions for each debate
const DEBATE_DESCRIPTIONS = {
  "cebolla": "La pregunta que divide familias en España desde generaciones. ¿Eres de los que no conciben una tortilla sin cebolla, o defiendes la pureza de la patata y el huevo?",
  "babosa": "Hay dos tipos de personas: las que buscan el centro jugoso y cremoso, y las que prefieren una textura más firme y consistente. ¿En qué bando estás?",
  "piña": "El debate más polarizante de la pizza. La piña en la pizza: ¿atrevida combinación agridulce o sacrilegio culinario imperdonable?",
  "bordes": "El crust de la pizza tiene sus fans incondicionales y sus detractores acérrimos. ¿Te comes los bordes hasta el final o los dejas en el plato?",
  "McDonald": "Dos imperios, dos filosofías, una sola hambre. La cheeseburger definitiva: ¿la clásica de McDonald's o la del Burger King?",
  "pepinillo": "Pequeño, verde y muy controversial. El pepinillo en la hamburguesa: ¿le da ese toque ácido perfecto o arruina todo lo que toca?",
  "Patatas fritas": "Las patatas fritas del fast food: ¿las finas y crujientes del arco dorado o las más gordas y sabrosas del rey?",
  "croqueta": "La croqueta es sagrada en España. Pero ¿cuál es la reina? ¿La suave y contundente de jamón ibérico o la delicada y cremosa de pollo?",
  "Desayuno": "Un debate de toda la vida. ¿Empiezas el día con una tostada con tomate y aceite, o te vas a los bollos, croissants y chocolate?",
  "ColaCao": "El clásico del desayuno infantil español. ¿ColaCao con su textura característica o el suave Nesquick que se disuelve perfectamente?",
  "Nutella": "Las dos grandes cremas de cacao. ¿La italiana Nutella con su sabor más intenso y famoso, o la española Nocilla que muchos llevamos en el alma?",
  "Churros": "Crujientes, calientes y para mojar en chocolate. ¿Los churros finos y crujientes de toda la vida, o las porras más gordas y esponjosas?",
  "Coca": "El debate de las colas. ¿La inconfundible Coca-Cola o la Pepsi con su sabor ligeramente más dulce? La pregunta de siempre.",
  "Fanta": "La naranja en versión gaseosa. ¿La Fanta internacional con su sabor globalmente conocido, o el Kas naranja genuinamente español?",
  "cerveza": "Para acompañar una buena comida, ¿qué eliges? ¿Una cerveza bien fría que refresca con cada bocado, o un buen vino que marida y eleva el sabor?"
};

function getDescription(question) {
  for (const [key, desc] of Object.entries(DEBATE_DESCRIPTIONS)) {
    if (question.includes(key)) return desc;
  }
  return '';
}

/* ── Global state ── */
let ALL_BATTLES        = [];
let TALLY              = {}; // battle_id → { a: N, b: N } — only active votes
let MY_VOTES           = {}; // battle_id → 'a' | 'b' | 'no_opinion'

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */
async function initBattles() {
  const [battlesRes, votesRes] = await Promise.all([
    sb.from('battles')
      .select('*')
      .eq('is_active', true)
      .order('category_order', { ascending: true })
      .order('position',       { ascending: true }),
    // Only count active votes (soft-delete safe)
    sb.from('battle_votes')
      .select('battle_id, choice')
  ]);

  ALL_BATTLES = battlesRes.data || [];
  const allVotes = votesRes.data || [];

  if (!ALL_BATTLES.length) {
    hide('debatesSkeleton');
    show('debatesEmpty');
    return;
  }

  // Build tally from active votes only
  TALLY = {};
  allVotes.forEach(v => {
    if (v.choice !== 'a' && v.choice !== 'b') return;
    if (!TALLY[v.battle_id]) TALLY[v.battle_id] = { a: 0, b: 0 };
    TALLY[v.battle_id][v.choice]++;
  });

  // My personal votes — fetch by visitor_id AND user_id if logged in
  const visitorId = getVisitorId();
  const user = await maybeUser();

  if (user) {
    // Logged in: prefer user votes, fall back to visitor
    const { data: userVotes } = await sb.from('battle_votes')
      .select('battle_id, choice')
      .eq('user_id', user.id);
    const { data: visitorVotes } = await sb.from('battle_votes')
      .select('battle_id, choice')
      .eq('visitor_id', visitorId);
    const dbMap = {};
    // Visitor votes first, user votes override
    (visitorVotes || []).forEach(v => { dbMap[v.battle_id] = v.choice; });
    (userVotes   || []).forEach(v => { dbMap[v.battle_id] = v.choice; });
    MY_VOTES = { ...getLocalVotes(), ...dbMap };
  } else {
    const { data: myVotes } = await sb.from('battle_votes')
      .select('battle_id, choice')
      .eq('visitor_id', visitorId);
    const dbMap = {};
    (myVotes || []).forEach(v => { dbMap[v.battle_id] = v.choice; });
    MY_VOTES = { ...getLocalVotes(), ...dbMap };
  }

  hide('debatesSkeleton');
  updateStats();
  renderFeed();
}

function updateStats() {
  const total = ALL_BATTLES.length;
  const done  = Object.keys(MY_VOTES).filter(id => MY_VOTES[id] && MY_VOTES[id] !== 'no_opinion').length;
  const el    = qs('debatesStats');
  if (!el) return;
  if (done > 0) {
    el.textContent = `${done} of ${total} debates voted`;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

/* ═══════════════════════════════════════
   FEED — single scrollable column
═══════════════════════════════════════ */
function renderFeed() {
  const feed = qs('debatesFeed');
  if (!feed) return;
  feed.innerHTML = '';

  if (!ALL_BATTLES.length) {
    show('debatesEmpty');
    return;
  }

  // Group by category
  const groups = {};
  const groupOrder = [];
  ALL_BATTLES.forEach(b => {
    const cat = b.category || 'Otros';
    const ord = b.category_order || 99;
    const key = `${String(ord).padStart(3,'0')}_${cat}`;
    if (!groups[key]) { groups[key] = { label: cat, items: [] }; groupOrder.push(key); }
    groups[key].items.push(b);
  });
  groupOrder.sort();

  groupOrder.forEach(key => {
    const { label, items } = groups[key];

    // Chapter divider — bold newspaper section break
    const chapter = document.createElement('div');
    chapter.className = 'debates-chapter';
    chapter.innerHTML = `<div class="debates-chapter-label">${esc(label)}</div>`;
    feed.appendChild(chapter);

    items.forEach(b => feed.appendChild(buildDebateRow(b)));
  });
}

function buildDebateRow(battle) {
  const row = document.createElement('div');
  row.className = 'debate-row';
  row.id = 'debate-' + battle.id;

  const voted = MY_VOTES[battle.id];
  const desc  = getDescription(battle.question);

  row.innerHTML = `
    <div class="debate-question">${esc(battle.question)}</div>
    ${desc ? `<div class="debate-description">${esc(desc)}</div>` : ''}
    <div class="debate-body" id="body-${battle.id}">
      ${buildDebateBodyHtml(battle)}
    </div>
    <div class="debate-footer">
      <span class="debate-vote-count" id="count-${battle.id}">${getVoteCountLabel(battle.id)}</span>
      <button class="debate-share-btn" onclick="shareBattle(event,'${battle.id}')">Share ↗</button>
    </div>`;

  return row;
}

// Unified body — always shows bars + radio buttons
// voted = shows filled radio + bars; unvoted = shows empty radio + greyed bars
function buildDebateBodyHtml(battle) {
  const myChoice   = MY_VOTES[battle.id];
  const counts     = TALLY[battle.id] || { a: 0, b: 0 };
  const totalVotes = (counts.a || 0) + (counts.b || 0);

  let pctA = 0, pctB = 0;
  if (totalVotes > 0) {
    pctA = Math.round((counts.a / totalVotes) * 100);
    pctB = 100 - pctA;
  }

  const chosenA = myChoice === 'a';
  const chosenB = myChoice === 'b';
  const hasVoted = myChoice && myChoice !== 'no_opinion';
  const leaderA  = hasVoted && pctA > pctB;
  const leaderB  = hasVoted && pctB > pctA;

  const rowA = buildRadioRowHtml({ label: battle.option_a, pct: pctA, chosen: chosenA, leader: leaderA, side: 'a', battleId: battle.id, hasVoted });
  const rowB = buildRadioRowHtml({ label: battle.option_b, pct: pctB, chosen: chosenB, leader: leaderB, side: 'b', battleId: battle.id, hasVoted });

  const noOpLink = myChoice === 'no_opinion'
    ? `<span class="debate-no-opinion is-chosen">No opinion ✓</span>`
    : `<button class="debate-no-opinion-btn" onclick="castFeedVote('${battle.id}','no_opinion')">No opinion</button>`;

  return `
    <div class="debate-results${hasVoted ? ' has-voted' : ''}">${rowA}${rowB}</div>
    <div class="debate-footer-inner">${noOpLink}</div>`;
}

function buildRadioRowHtml({ label, pct, chosen, leader, side, battleId, hasVoted }) {
  const cls = ['debate-result-row'];
  if (chosen) cls.push('is-chosen');
  if (leader) cls.push('is-leader');

  const barWidth = hasVoted ? pct : 0;
  // Mini donut SVG — circle circumference = 2*pi*8 ≈ 50.3
  const circ = 50.27;
  const fill = hasVoted ? (circ * pct / 100) : 0;
  const donutColor = chosen ? 'var(--accent)' : 'rgba(26,23,20,0.25)';
  const donutSvg = `<svg class="debate-donut" viewBox="0 0 20 20">
    <circle cx="10" cy="10" r="8" fill="none" stroke="rgba(26,23,20,0.08)" stroke-width="2.5"/>
    <circle cx="10" cy="10" r="8" fill="none" stroke="${donutColor}" stroke-width="2.5"
      stroke-dasharray="${fill} ${circ}"
      stroke-dashoffset="${circ / 4}"
      stroke-linecap="round"/>
  </svg>`;

  return `
    <div class="${cls.join(' ')}" onclick="toggleFeedVote('${battleId}','${side}')">
      <div class="debate-radio${chosen ? ' is-filled' : ''}"></div>
      <div class="debate-result-mid">
        <div class="debate-result-label">${esc(label)}</div>
        <div class="debate-result-bar-wrap">
          <div class="debate-result-bar" data-pct="${barWidth}" style="width:${barWidth}%"></div>
        </div>
      </div>
      <div class="debate-result-pct-wrap">
        ${donutSvg}
        <div class="debate-result-pct">${hasVoted ? pct + '%' : ''}</div>
      </div>
    </div>`;
}

// Kept for compatibility — now unified
function buildResultsHtml(battle) { return buildDebateBodyHtml(battle); }
function buildVoteBtnsHtml(battle) { return buildDebateBodyHtml(battle); }

function getVoteCountLabel(battleId) {
  const counts = TALLY[battleId] || { a: 0, b: 0 };
  const total  = (counts.a || 0) + (counts.b || 0);
  if (MY_VOTES[battleId] === 'no_opinion') return 'No opinion';
  if (total === 0) return 'No votes yet';
  return `${total.toLocaleString()} vote${total !== 1 ? 's' : ''}`;
}

// Animate bars in after insert
function animateBars(battleId) {
  requestAnimationFrame(() => {
    const body = document.getElementById('body-' + battleId);
    if (!body) return;
    body.querySelectorAll('.debate-result-bar').forEach(bar => {
      const pct = bar.dataset.pct;
      requestAnimationFrame(() => { bar.style.width = pct + '%'; });
    });
  });
}

// Vote from feed
async function castFeedVote(battleId, choice) {
  if (!TALLY[battleId]) TALLY[battleId] = { a: 0, b: 0 };
  TALLY[battleId][choice] = (TALLY[battleId][choice] || 0) + 1;
  MY_VOTES[battleId] = choice;
  saveLocalVote(battleId, choice);

  refreshDebateBody(battleId);
  updateStats();
  persistVote(battleId, choice);
  if (typeof gtag !== 'undefined') gtag('event', 'battle_voted', { battle_id: battleId, choice });
}

// Change vote (tap a result row)
async function changeFeedVote(battleId, newChoice) {
  const old = MY_VOTES[battleId];
  if (old === newChoice) return;

  if (old && old !== 'no_opinion' && TALLY[battleId]) {
    TALLY[battleId][old] = Math.max(0, (TALLY[battleId][old] || 0) - 1);
  }
  if (!TALLY[battleId]) TALLY[battleId] = { a: 0, b: 0 };
  TALLY[battleId][newChoice] = (TALLY[battleId][newChoice] || 0) + 1;

  MY_VOTES[battleId] = newChoice;
  saveLocalVote(battleId, newChoice);

  refreshDebateBody(battleId);
  updateStats();
  persistVote(battleId, newChoice);
}

// Toggle: tap chosen radio = unvote; tap other = change vote
async function toggleFeedVote(battleId, side) {
  const current = MY_VOTES[battleId];
  if (current === side) {
    // Unvote
    if (current !== 'no_opinion' && TALLY[battleId]) {
      TALLY[battleId][current] = Math.max(0, (TALLY[battleId][current] || 0) - 1);
    }
    delete MY_VOTES[battleId];
    saveLocalVote(battleId, null);
    refreshDebateBody(battleId);
    updateStats();
    persistVote(battleId, 'no_opinion');
  } else {
    castFeedVote(battleId, side);
  }
}

function refreshDebateBody(battleId) {
  const body = document.getElementById('body-' + battleId);
  const battle = ALL_BATTLES.find(b => b.id === battleId);
  if (body && battle) {
    body.innerHTML = buildDebateBodyHtml(battle);
    animateBars(battleId);
  }
  const countEl = document.getElementById('count-' + battleId);
  if (countEl) countEl.textContent = getVoteCountLabel(battleId);
}

// Stack/swipe removed — replaced by inline feed voting


/* ═══════════════════════════════════════
   SHARE
═══════════════════════════════════════ */
async function shareBattle(e, battleId) {
  e.stopPropagation();
  const battle = ALL_BATTLES.find(b => b.id === battleId);
  if (!battle) return;
  if (typeof gtag !== 'undefined')
    gtag('event', 'share_clicked', { content_type: 'battle', battle_id: battleId });
  const myChoice = MY_VOTES[battleId];
  const voted = myChoice === 'a' ? battle.option_a : myChoice === 'b' ? battle.option_b : null;
  const text  = voted
    ? `${battle.question} I voted: ${voted}. What about you? thebestagain.com/battles.html`
    : `${battle.question} thebestagain.com/battles.html`;
  if (navigator.share) {
    navigator.share({ text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => {
      const btn = e.target;
      if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Share ↗'; }, 2000); }
    }).catch(() => {});
  }
}

/* ═══════════════════════════════════════
   HELPERS
═══════════════════════════════════════ */
function qs(id)  { return document.getElementById(id); }
function show(id) { const el = qs(id); if (el) el.style.display = ''; }
function hide(id) { const el = qs(id); if (el) el.style.display = 'none'; }
function esc(s) {
  return String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
}
// Keep escapeHtml alias for any legacy calls
const escapeHtml = esc;
