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

/* ── Global state ── */
let ALL_BATTLES        = [];
let TALLY              = {}; // battle_id → { a: N, b: N } — only active votes
let MY_VOTES           = {}; // battle_id → 'a' | 'b' | 'no_opinion'
let STACK_IDS          = [];
let IS_ANIMATING       = false;
let ACTIVE_SWIPE_CLEANUP = null;

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
      .eq('is_active', true)
  ]);

  ALL_BATTLES = battlesRes.data || [];
  const allVotes = votesRes.data || [];

  if (!ALL_BATTLES.length) {
    hide('battlesSkeletonWrap');
    show('battlesEmpty');
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

  let myVotesQuery = sb.from('battle_votes')
    .select('battle_id, choice')
    .eq('is_active', true);

  if (user) {
    // Logged in: prefer user votes, fall back to visitor
    const { data: userVotes } = await sb.from('battle_votes')
      .select('battle_id, choice')
      .eq('user_id', user.id)
      .eq('is_active', true);
    const { data: visitorVotes } = await sb.from('battle_votes')
      .select('battle_id, choice')
      .eq('visitor_id', visitorId)
      .eq('is_active', true);
    const dbMap = {};
    // Visitor votes first, user votes override
    (visitorVotes || []).forEach(v => { dbMap[v.battle_id] = v.choice; });
    (userVotes   || []).forEach(v => { dbMap[v.battle_id] = v.choice; });
    MY_VOTES = { ...getLocalVotes(), ...dbMap };
  } else {
    const { data: myVotes } = await sb.from('battle_votes')
      .select('battle_id, choice')
      .eq('visitor_id', visitorId)
      .eq('is_active', true);
    const dbMap = {};
    (myVotes || []).forEach(v => { dbMap[v.battle_id] = v.choice; });
    MY_VOTES = { ...getLocalVotes(), ...dbMap };
  }

  STACK_IDS = ALL_BATTLES.filter(b => !MY_VOTES[b.id]).map(b => b.id);
  const voted = ALL_BATTLES.filter(b => !!MY_VOTES[b.id]);

  hide('battlesSkeletonWrap');
  updateStats();
  renderStack();

  if (voted.length) {
    show('battlesDivider');
    renderVotedGrid(voted);
  }
}

function updateStats() {
  const done = ALL_BATTLES.length - STACK_IDS.length;
  const el = qs('battlesStats');
  if (!el) return;
  el.textContent = done > 0
    ? `${done} of ${ALL_BATTLES.length} battles voted`
    : '';
  el.style.display = done > 0 ? 'block' : 'none';
}

/* ═══════════════════════════════════════
   CARD STACK (Tinder) — unchanged logic
═══════════════════════════════════════ */
function renderStack() {
  const wrap = qs('stackWrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  if (ACTIVE_SWIPE_CLEANUP) { ACTIVE_SWIPE_CLEANUP(); ACTIVE_SWIPE_CLEANUP = null; }

  if (!STACK_IDS.length) {
    hide('stackSection');
    return;
  }
  show('stackSection');

  [...STACK_IDS].reverse().forEach(id => {
    const b = ALL_BATTLES.find(x => x.id === id);
    if (b) wrap.appendChild(buildStackCard(b));
  });
  attachSwipe(wrap.lastElementChild);
}

function buildStackCard(battle) {
  const card = document.createElement('div');
  card.className = 'stack-card';
  card.dataset.battleId = battle.id;

  const hasBoth   = !!(battle.image_a_url && battle.image_b_url);
  const hasSingle = !!(battle.image_a_url && !battle.image_b_url);

  if (hasSingle) {
    card.innerHTML = `
      <div class="vote-indicator vote-indicator-a">A</div>
      <div class="vote-indicator vote-indicator-b">B</div>
      <div class="stack-card-single-img" style="background-image:url('${esc(battle.image_a_url)}')">
        <div class="stack-single-gradient"></div>
        <div class="stack-single-question">${esc(battle.question)}</div>
        <div class="stack-single-options">
          <div class="stack-single-opt" onclick="handleTapVote(event,'${battle.id}','a')">
            <div class="stack-single-opt-label">${esc(battle.option_a)}</div>
            <div class="stack-single-opt-hint">← tap</div>
          </div>
          <div class="stack-single-vs">VS</div>
          <div class="stack-single-opt" onclick="handleTapVote(event,'${battle.id}','b')">
            <div class="stack-single-opt-label">${esc(battle.option_b)}</div>
            <div class="stack-single-opt-hint">tap →</div>
          </div>
        </div>
      </div>`;
    return card;
  }

  const optA = hasBoth
    ? `<div class="stack-card-opt stack-card-opt-img" onclick="handleTapVote(event,'${battle.id}','a')" style="background-image:url('${esc(battle.image_a_url)}')">
         <div class="stack-opt-img-overlay"></div>
         <div class="stack-opt-label stack-opt-label-img">${esc(battle.option_a)}</div>
         <div class="stack-opt-hint stack-opt-hint-img">← tap</div>
       </div>`
    : `<div class="stack-card-opt" onclick="handleTapVote(event,'${battle.id}','a')">
         <div class="stack-opt-label">${esc(battle.option_a)}</div>
         <div class="stack-opt-hint">← tap</div>
       </div>`;

  const optB = hasBoth
    ? `<div class="stack-card-opt stack-card-opt-img" onclick="handleTapVote(event,'${battle.id}','b')" style="background-image:url('${esc(battle.image_b_url)}')">
         <div class="stack-opt-img-overlay"></div>
         <div class="stack-opt-label stack-opt-label-img">${esc(battle.option_b)}</div>
         <div class="stack-opt-hint stack-opt-hint-img">tap →</div>
       </div>`
    : `<div class="stack-card-opt" onclick="handleTapVote(event,'${battle.id}','b')">
         <div class="stack-opt-label">${esc(battle.option_b)}</div>
         <div class="stack-opt-hint">tap →</div>
       </div>`;

  card.innerHTML = `
    <div class="vote-indicator vote-indicator-a">A</div>
    <div class="vote-indicator vote-indicator-b">B</div>
    ${hasBoth ? '' : `<div class="stack-card-question">${esc(battle.question)}</div>`}
    <div class="stack-card-options${hasBoth ? ' stack-card-options-img' : ''}">
      ${optA}
      <div class="stack-vs-overlay${hasBoth ? ' stack-vs-overlay-img' : ''}">
        ${hasBoth ? `<div class="stack-vs-question">${esc(battle.question)}</div><span>VS</span>` : 'VS'}
      </div>
      ${optB}
    </div>`;
  return card;
}

function handleTapVote(e, battleId, choice) {
  if (IS_ANIMATING) return;
  e.stopPropagation();
  voteAndAdvance(battleId, choice, choice === 'a' ? 'fly-left' : 'fly-right');
}

function castNoOpinion() {
  if (IS_ANIMATING || !STACK_IDS.length) return;
  voteAndAdvance(STACK_IDS[0], 'no_opinion', 'fly-up');
}

async function voteAndAdvance(battleId, choice, flyClass) {
  IS_ANIMATING = true;
  if (ACTIVE_SWIPE_CLEANUP) { ACTIVE_SWIPE_CLEANUP(); ACTIVE_SWIPE_CLEANUP = null; }

  const wrap  = qs('stackWrap');
  const front = wrap?.lastElementChild;
  if (!front) { IS_ANIMATING = false; return; }

  const indKey = flyClass === 'fly-left' ? '.vote-indicator-a' : flyClass === 'fly-right' ? '.vote-indicator-b' : null;
  if (indKey) { const ind = front.querySelector(indKey); if (ind) ind.style.opacity = '1'; }

  front.classList.add(flyClass);
  setTimeout(() => wrap.classList.add('promoting'), 40);

  setTimeout(async () => {
    front.remove();
    wrap.classList.remove('promoting');

    STACK_IDS.shift();
    MY_VOTES[battleId] = choice;
    saveLocalVote(battleId, choice);

    if (choice !== 'no_opinion') {
      if (!TALLY[battleId]) TALLY[battleId] = { a: 0, b: 0 };
      TALLY[battleId][choice] = (TALLY[battleId][choice] || 0) + 1;
    }

    updateStats();

    const newFront = wrap.lastElementChild;
    if (newFront) {
      rebuildStackClasses(wrap);
      attachSwipe(newFront);
    } else {
      hide('stackSection');
    }

    // Add voted card to top of grid
    const battle = ALL_BATTLES.find(b => b.id === battleId);
    if (battle) {
      // Show divider
      show('battlesDivider');
      // Re-render the whole grid to keep category grouping correct
      const voted = ALL_BATTLES.filter(b => !!MY_VOTES[b.id]);
      renderVotedGrid(voted);
    }

    IS_ANIMATING = false;
    persistVote(battleId, choice);
    if (typeof gtag !== 'undefined') gtag('event', 'battle_voted', { battle_id: battleId, choice });
  }, 420);
}

function rebuildStackClasses(wrap) {
  const cards = Array.from(wrap.children);
  const total = cards.length;
  cards.forEach((card, i) => {
    const fromFront = total - 1 - i;
    card.style.transform = fromFront === 0 ? '' :
                           fromFront === 1 ? 'scale(0.95) translateY(10px)' :
                                             'scale(0.90) translateY(20px)';
    card.style.zIndex = total - fromFront;
    card.style.pointerEvents = fromFront === 0 ? 'auto' : 'none';
    card.style.boxShadow = fromFront === 0 ? '0 12px 40px rgba(26,23,20,0.14)' : 'none';
  });
}

async function persistVote(battleId, choice) {
  const visitorId = getVisitorId();
  const user = await maybeUser();
  const payload = { battle_id: battleId, visitor_id: visitorId, choice, is_active: true };
  if (user) payload.user_id = user.id;
  await sb.from('battle_votes').upsert(payload, {
    onConflict: user ? 'battle_id,user_id' : 'battle_id,visitor_id',
    ignoreDuplicates: false
  });
}

/* ═══════════════════════════════════════
   VOTED GRID — editorial leaderboard
═══════════════════════════════════════ */
function renderVotedGrid(battles) {
  const grid = qs('battlesVotedGrid');
  if (!grid) return;
  grid.innerHTML = '';

  // Group by category
  const groups = {};
  const groupOrder = [];
  battles.forEach(b => {
    const cat = b.category || 'Otros';
    const ord = b.category_order || 99;
    const key = `${String(ord).padStart(3,'0')}_${cat}`;
    if (!groups[key]) { groups[key] = { label: cat, items: [] }; groupOrder.push(key); }
    groups[key].items.push(b);
  });
  groupOrder.sort();

  groupOrder.forEach(key => {
    const { label, items } = groups[key];

    // Category divider
    const divider = document.createElement('div');
    divider.className = 'bv-category-divider';
    divider.innerHTML = `<span>${esc(label)}</span>`;
    grid.appendChild(divider);

    // 2-column group
    const group = document.createElement('div');
    group.className = 'bv-group';
    items.forEach(b => group.appendChild(buildVotedCard(b)));
    grid.appendChild(group);
  });
}

function buildVotedCard(battle) {
  const myChoice = MY_VOTES[battle.id];
  const counts   = TALLY[battle.id] || { a: 0, b: 0 };
  const totalVotes = (counts.a || 0) + (counts.b || 0);

  // Percentages — based on actual vote counts
  let pctA = 0, pctB = 0;
  if (totalVotes > 0) {
    pctA = Math.round((counts.a / totalVotes) * 100);
    pctB = 100 - pctA;
  }

  const hasBoth   = !!(battle.image_a_url && battle.image_b_url);
  const hasSingle = !!(battle.image_a_url && !battle.image_b_url);
  // For single image: same image for both sides rendered as one wide image
  const imgA = hasBoth ? battle.image_a_url : hasSingle ? battle.image_a_url : null;
  const imgB = hasBoth ? battle.image_b_url : null;

  const chosenA = myChoice === 'a';
  const chosenB = myChoice === 'b';
  const noOp    = myChoice === 'no_opinion';
  const leaderA = pctA > pctB;
  const leaderB = pctB > pctA;

  const card = document.createElement('div');
  card.className = 'bv-card';
  card.id = 'voted-' + battle.id;

  // ── Image area ──
  let imageHtml;
  if (hasSingle) {
    // One image spanning both sides — no duplication
    imageHtml = `
      <div class="bv-image-single" style="background-image:url('${esc(imgA)}')">
        <div class="bv-single-labels">
          <button class="bv-single-label${chosenA ? ' chosen' : ''}" onclick="handleVotedClick('${battle.id}','a')">${chosenA ? '✓ ' : ''}${esc(battle.option_a)}</button>
          <button class="bv-single-label${chosenB ? ' chosen' : ''}" onclick="handleVotedClick('${battle.id}','b')">${chosenB ? '✓ ' : ''}${esc(battle.option_b)}</button>
        </div>
      </div>`;
  } else if (hasBoth) {
    imageHtml = `
      <div class="bv-images">
        <div class="bv-img${chosenA ? ' chosen' : ' dimmed'}" style="background-image:url('${esc(imgA)}')" onclick="handleVotedClick('${battle.id}','a')"></div>
        <div class="bv-img${chosenB ? ' chosen' : ' dimmed'}" style="background-image:url('${esc(imgB)}')" onclick="handleVotedClick('${battle.id}','b')"></div>
      </div>`;
  } else {
    // No images — simple text buttons
    imageHtml = `
      <div class="bv-text-options">
        <button class="bv-text-opt${chosenA ? ' chosen' : ''}" onclick="handleVotedClick('${battle.id}','a')">${chosenA ? '✓ ' : ''}${esc(battle.option_a)}</button>
        <span class="bv-vs">VS</span>
        <button class="bv-text-opt${chosenB ? ' chosen' : ''}" onclick="handleVotedClick('${battle.id}','b')">${chosenB ? '✓ ' : ''}${esc(battle.option_b)}</button>
      </div>`;
  }

  // ── Result rows ──
  // Row A
  const rowA = buildResultRow({
    label:   battle.option_a,
    pct:     pctA,
    votes:   counts.a || 0,
    chosen:  chosenA,
    leader:  leaderA,
    side:    'a',
    battleId: battle.id,
    noOp
  });
  // Row B
  const rowB = buildResultRow({
    label:   battle.option_b,
    pct:     pctB,
    votes:   counts.b || 0,
    chosen:  chosenB,
    leader:  leaderB,
    side:    'b',
    battleId: battle.id,
    noOp
  });

  const votesLabel = noOp
    ? 'No opinion'
    : totalVotes === 0 ? 'No votes yet'
    : `${totalVotes.toLocaleString()} vote${totalVotes !== 1 ? 's' : ''}`;

  card.innerHTML = `
    <div class="bv-question">${esc(battle.question)}</div>
    ${imageHtml}
    <div class="bv-results">
      ${rowA}
      ${rowB}
    </div>
    <div class="bv-footer">
      <span class="bv-vote-count">${votesLabel}</span>
      <button class="bv-share-btn" onclick="shareBattle(event,'${battle.id}')">Share ↗</button>
    </div>`;

  return card;
}

function buildResultRow({ label, pct, votes, chosen, leader, side, battleId, noOp }) {
  const cls = ['bv-row'];
  if (chosen) cls.push('bv-row-chosen');
  if (leader) cls.push('bv-row-leader');

  // Bar width = exactly pct% (never lies)
  return `
    <div class="${cls.join(' ')}" onclick="handleVotedClick('${battleId}','${side}')">
      <div class="bv-row-pct">${noOp ? '—' : pct + '%'}</div>
      <div class="bv-row-bar-wrap">
        <div class="bv-row-bar" style="width:${noOp ? 0 : pct}%"></div>
      </div>
      <div class="bv-row-label">${chosen ? '✓ ' : ''}${esc(label)}</div>
    </div>`;
}

/* ── Vote interactions on voted grid ── */
async function handleVotedClick(battleId, side) {
  const current = MY_VOTES[battleId];
  if (current === side) {
    await unvote(battleId);
  } else {
    await changeVote(battleId, side);
  }
}

async function unvote(battleId) {
  const old = MY_VOTES[battleId];
  if (!old || old === 'no_opinion') return;

  if (TALLY[battleId] && (old === 'a' || old === 'b')) {
    TALLY[battleId][old] = Math.max(0, (TALLY[battleId][old] || 0) - 1);
  }
  MY_VOTES[battleId] = 'no_opinion';
  saveLocalVote(battleId, 'no_opinion');

  // Re-render card in place
  const card = qs('voted-' + battleId);
  const battle = ALL_BATTLES.find(b => b.id === battleId);
  if (card && battle) card.replaceWith(buildVotedCard(battle));

  updateStats();
  persistVote(battleId, 'no_opinion');
}

async function changeVote(battleId, newChoice) {
  const old = MY_VOTES[battleId];
  if (old === newChoice) return;

  if (old && old !== 'no_opinion' && TALLY[battleId]) {
    TALLY[battleId][old] = Math.max(0, (TALLY[battleId][old] || 0) - 1);
  }
  if (!TALLY[battleId]) TALLY[battleId] = { a: 0, b: 0 };
  TALLY[battleId][newChoice] = (TALLY[battleId][newChoice] || 0) + 1;

  MY_VOTES[battleId] = newChoice;
  saveLocalVote(battleId, newChoice);

  const card = qs('voted-' + battleId);
  const battle = ALL_BATTLES.find(b => b.id === battleId);
  if (card && battle) card.replaceWith(buildVotedCard(battle));

  updateStats();
  persistVote(battleId, newChoice);
  if (typeof gtag !== 'undefined')
    gtag('event', 'battle_vote_changed', { battle_id: battleId, from: old, to: newChoice });
}

/* ═══════════════════════════════════════
   SWIPE
═══════════════════════════════════════ */
function attachSwipe(card) {
  if (!card) return;
  const battleId = card.dataset.battleId;
  if (!battleId) return;

  let startX = 0, startY = 0, dx = 0, dragging = false;
  const THRESHOLD = 72, ROTATE_MAX = 20;

  function onStart(e) {
    if (IS_ANIMATING) return;
    const pt = e.touches ? e.touches[0] : e;
    startX = pt.clientX; startY = pt.clientY; dx = 0; dragging = true;
    card.classList.add('dragging');
  }
  function onMove(e) {
    if (!dragging || IS_ANIMATING) return;
    const pt = e.touches ? e.touches[0] : e;
    dx = pt.clientX - startX;
    const dy = pt.clientY - startY;
    if (Math.abs(dx) < Math.abs(dy) && Math.abs(dx) < 10) return;
    e.preventDefault();
    const rot = (dx / window.innerWidth) * ROTATE_MAX;
    card.style.transform = `translateX(${dx}px) rotate(${rot}deg)`;
    const indA = card.querySelector('.vote-indicator-a');
    const indB = card.querySelector('.vote-indicator-b');
    if (dx < -20) {
      if (indA) indA.style.opacity = Math.min(1, (-dx - 20) / 60) + '';
      if (indB) indB.style.opacity = '0';
    } else if (dx > 20) {
      if (indB) indB.style.opacity = Math.min(1, (dx - 20) / 60) + '';
      if (indA) indA.style.opacity = '0';
    } else {
      if (indA) indA.style.opacity = '0';
      if (indB) indB.style.opacity = '0';
    }
  }
  function onEnd() {
    if (!dragging) return;
    dragging = false;
    card.classList.remove('dragging');
    if (IS_ANIMATING) return;
    if (dx < -THRESHOLD) {
      voteAndAdvance(battleId, 'a', 'fly-left');
    } else if (dx > THRESHOLD) {
      voteAndAdvance(battleId, 'b', 'fly-right');
    } else {
      card.style.transition = 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1)';
      card.style.transform  = '';
      const indA = card.querySelector('.vote-indicator-a');
      const indB = card.querySelector('.vote-indicator-b');
      if (indA) indA.style.opacity = '0';
      if (indB) indB.style.opacity = '0';
      setTimeout(() => { if (card) card.style.transition = ''; }, 360);
    }
    dx = 0;
  }
  card.addEventListener('mousedown',  onStart);
  card.addEventListener('touchstart', onStart, { passive: true });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('mouseup',  onEnd);
  window.addEventListener('touchend', onEnd);

  ACTIVE_SWIPE_CLEANUP = () => {
    card.removeEventListener('mousedown',  onStart);
    card.removeEventListener('touchstart', onStart);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('mouseup',  onEnd);
    window.removeEventListener('touchend', onEnd);
  };
}

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
