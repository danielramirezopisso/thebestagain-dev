// votes.js v3 — per-category tables + clean edit mode with sidebar + distribute tool

let MY_VOTES    = [];
let CAT_BY_ID   = {};
let BRAND_BY_ID = {};

// Edit mode: [{vote_id, marker_id, title, saved, pending}]
// saved = current DB value, pending = new value (null = no change)
let EDIT_CAT_ID = null;
let EDIT_CARDS  = [];

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function colorClass(v) {
  const x = Number(v ?? 0);
  if (!x) return "rating-none";
  if (x >= 9) return "rating-9-10";
  if (x >= 7) return "rating-7-8";
  if (x >= 5) return "rating-5-6";
  if (x >= 3) return "rating-3-4";
  return "rating-1-2";
}

function setStatus(msg) {
  const el = document.getElementById("votesStatus");
  if (el) el.textContent = msg || "";
}

function hasPendingChanges() {
  return EDIT_CARDS.some(c => c.pending !== null);
}

function updateSaveBtn() {
  const btn = document.getElementById("btnSaveVotes");
  if (btn) btn.disabled = !hasPendingChanges();
}

/* ══════════════════════════════════ INIT */
async function initVotesPage() {
  const user = await requireAuth();
  if (!user) return;
  setStatus("Loading…");
  await loadAllData();
  setStatus("");
  renderNormalView();
}

async function loadAllData() {
  // Get current user id for filtering
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  const [catRes, brandRes, voteRes] = await Promise.all([
    sb.from("categories").select("id,name,icon_url,for_places,for_products,is_active"),
    sb.from("brands").select("id,name"),
    sb.from("votes")
      .select(`id,vote,updated_at,marker_id,is_active,
               markers(id,title,group_type,category_id,brand_id,is_active)`)
      .eq("is_active", true)
      .eq("user_id", user.id)
      .order("vote", { ascending: false }),
  ]);
  if (catRes.data)   catRes.data.forEach(c => CAT_BY_ID[c.id] = c);
  if (brandRes.data) brandRes.data.forEach(b => BRAND_BY_ID[b.id] = b);
  if (!voteRes.error)
    MY_VOTES = (voteRes.data || []).filter(v => v.markers?.is_active);
  else
    setStatus("Error: " + voteRes.error.message);
}

/* ══════════════════════════════════ NORMAL VIEW */
/* ══════════════════════════════════
   VOTES VIEW STATE
══════════════════════════════════ */
let VOTES_SORT  = 'score';
let VOTES_QUERY = '';
let VOTES_CAT   = null;   // null = all
let VOTES_TYPE  = null;   // null | 'place' | 'product'
let VOTES_MIN   = null;   // null | 1-10
let VOTES_MAX   = null;   // null | 1-10

function renderNormalView() {
  const wrap = document.getElementById("votesByCategory");
  if (!MY_VOTES.length) {
    wrap.innerHTML = `
      <div class="votes-empty">
        <div class="votes-empty-icon">🗳️</div>
        <h3>No votes yet</h3>
        <p class="muted">Open any marker and cast your first vote.</p>
      </div>`;
    return;
  }

  // Search + sort controls
  if (!document.getElementById("votesControls")) {
    const controls = document.createElement("div");
    controls.id = "votesControls";
    controls.className = "votes-controls";
    controls.innerHTML = `
      <div class="votes-controls-row">
        <input class="votes-search" id="votesSearch" placeholder="Search…" oninput="onVotesSearch(this.value)" />
        <button class="votes-filter-btn" id="votesFilterBtn" onclick="toggleVotesFilter()">⊟ Filter</button>
      </div>
      <div class="votes-sort-pills">
        <button class="votes-sort-pill active" data-sort="score"  onclick="setVotesSort('score')">Score ↓</button>
        <button class="votes-sort-pill"        data-sort="name"   onclick="setVotesSort('name')">Name</button>
        <button class="votes-sort-pill"        data-sort="recent" onclick="setVotesSort('recent')">Recent</button>
      </div>`;
    wrap.parentNode.insertBefore(controls, wrap);

    // Filter drawer
    if (!document.getElementById('votesFilterDrawer')) {
      const myCats = [...new Set(MY_VOTES.map(v => v.markers.category_id))];
      const catOpts = myCats.map(cid => {
        const name = CAT_BY_ID[cid]?.name || 'Unknown';
        return `<button class="vf-chip" data-type="cat" data-val="${cid}" onclick="setVotesCat(${cid})">${escapeHtml(name)}</button>`;
      }).join('');

      const drawer = document.createElement('div');
      drawer.id = 'votesFilterDrawer';
      drawer.className = 'votes-filter-drawer';
      drawer.style.display = 'none';
      drawer.innerHTML = `
        <div class="vf-section">
          <div class="vf-label">Category</div>
          <div class="vf-chips">
            <button class="vf-chip active" data-type="cat" data-val="all" onclick="setVotesCat(null)">All</button>
            ${catOpts}
          </div>
        </div>
        <div class="vf-section">
          <div class="vf-label">Type</div>
          <div class="vf-chips">
            <button class="vf-chip active" data-type="type" data-val="all" onclick="setVotesType(null)">All</button>
            <button class="vf-chip" data-type="type" data-val="place"   onclick="setVotesType('place')">🗺 Places</button>
            <button class="vf-chip" data-type="type" data-val="product" onclick="setVotesType('product')">🛒 Products</button>
          </div>
        </div>
        <div class="vf-section">
          <div class="vf-label">Min score</div>
          <div class="vf-chips">
            ${[null,7,8,9].map(n => `<button class="vf-chip ${n===null?'active':''}" data-type="min" data-val="${n??'all'}" onclick="setVotesMin(${n})">${n===null?'Any':'≥'+n}</button>`).join('')}
          </div>
        </div>
        <div class="vf-footer">
          <button class="vf-clear" onclick="clearVotesFilters()">✕ Clear filters</button>
        </div>`;
      wrap.parentNode.insertBefore(drawer, wrap);
    }
  }

  updateVotesFilterBtn();
  renderVotesList();
}

function toggleVotesFilter() {
  const d = document.getElementById('votesFilterDrawer');
  if (d) d.style.display = d.style.display === 'none' ? 'block' : 'none';
}

function updateVotesFilterBtn() {
  const btn = document.getElementById('votesFilterBtn');
  if (!btn) return;
  const active = VOTES_CAT !== null || VOTES_TYPE !== null || VOTES_MIN !== null;
  btn.classList.toggle('active', active);
  btn.textContent = active ? '⊟ Filter •' : '⊟ Filter';
}

function setVotesCat(cid) {
  VOTES_CAT = cid;
  document.querySelectorAll('[data-type="cat"]').forEach(b =>
    b.classList.toggle('active', cid === null ? b.dataset.val === 'all' : String(b.dataset.val) === String(cid))
  );
  updateVotesFilterBtn(); renderVotesList();
}

function setVotesType(type) {
  VOTES_TYPE = type;
  document.querySelectorAll('[data-type="type"]').forEach(b =>
    b.classList.toggle('active', type === null ? b.dataset.val === 'all' : b.dataset.val === type)
  );
  updateVotesFilterBtn(); renderVotesList();
}

function setVotesMin(min) {
  VOTES_MIN = min;
  document.querySelectorAll('[data-type="min"]').forEach(b =>
    b.classList.toggle('active', min === null ? b.dataset.val === 'all' : String(b.dataset.val) === String(min))
  );
  updateVotesFilterBtn(); renderVotesList();
}

function clearVotesFilters() {
  VOTES_CAT = null; VOTES_TYPE = null; VOTES_MIN = null;
  document.querySelectorAll('.vf-chip').forEach(b => {
    b.classList.toggle('active', b.dataset.val === 'all');
  });
  updateVotesFilterBtn(); renderVotesList();
}

function onVotesSearch(q) {
  VOTES_QUERY = q.toLowerCase().trim();
  renderVotesList();
}

function setVotesSort(sort) {
  VOTES_SORT = sort;
  document.querySelectorAll('.votes-sort-pill').forEach(b => {
    b.classList.toggle('active', b.dataset.sort === sort);
  });
  renderVotesList();
}

function renderVotesList() {
  const wrap = document.getElementById("votesByCategory");

  // Filter by search
  let votes = MY_VOTES.filter(v => {
    if (VOTES_CAT  !== null && v.markers.category_id !== VOTES_CAT) return false;
    if (VOTES_TYPE !== null && v.markers.group_type  !== VOTES_TYPE) return false;
    if (VOTES_MIN  !== null && Number(v.vote) < VOTES_MIN) return false;
    if (!VOTES_QUERY) return true;
    const name  = (v.markers.title || '').toLowerCase();
    const cat   = (CAT_BY_ID[v.markers.category_id]?.name || '').toLowerCase();
    const brand = (BRAND_BY_ID[v.markers.brand_id]?.name || '').toLowerCase();
    return name.includes(VOTES_QUERY) || cat.includes(VOTES_QUERY) || brand.includes(VOTES_QUERY);
  });

  // Sort
  if (VOTES_SORT === 'score')    votes.sort((a, b) => b.vote - a.vote);
  if (VOTES_SORT === 'name')     votes.sort((a, b) => (a.markers.title || '').localeCompare(b.markers.title || ''));
  if (VOTES_SORT === 'category') votes.sort((a, b) => {
    const ca = CAT_BY_ID[a.markers.category_id]?.name || '';
    const cb = CAT_BY_ID[b.markers.category_id]?.name || '';
    return ca.localeCompare(cb) || b.vote - a.vote;
  });
  if (VOTES_SORT === 'recent')   votes.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  if (!votes.length) {
    wrap.innerHTML = `<div class="votes-empty"><p class="muted">No votes match your search.</p></div>`;
    return;
  }

  // Insert category dividers when sorted by score/recent/name
  // Group into sections with category headers
  let html = '';
  let lastCat = null;
  let posInCat = {};
  const showDividers = (VOTES_SORT === "score" || VOTES_SORT === "recent");

  votes.forEach((v, i) => {
    const cid = v.markers.category_id;
    if (showDividers && cid !== lastCat) {
      const catName = CAT_BY_ID[cid]?.name || "";
      html += `<div class="vote-cat-divider">${escapeHtml(catName)}</div>`;
      lastCat = cid;
      posInCat[cid] = 0;
    }
    posInCat[cid] = (posInCat[cid] || 0) + 1;
    html += renderVoteRow(v, i, posInCat[cid] || i + 1);
  });
  wrap.innerHTML = html;
}

function renderVoteRow(v, globalIdx, posInCat) {
  const i = globalIdx;
    const m     = v.markers;
    const score = Number(v.vote);
    const cat   = CAT_BY_ID[m.category_id];
    const brand = m.brand_id ? BRAND_BY_ID[m.brand_id]?.name : null;
    const sub   = brand ? brand : (cat?.name || '');
    const scoreColor = getScoreColor(score);
    const sizeClass  = i === 0 ? 'vote-row-1' : i === 1 ? 'vote-row-2' : i < 4 ? 'vote-row-3' : '';

  return `
      <div class="vote-row ${sizeClass}" id="vrow-${encodeURIComponent(v.id)}">
        <a class="vote-row-link" href="marker.html?id=${encodeURIComponent(m.id)}&cat=${m.category_id}">
          <div class="vote-row-pos">${i + 1}</div>
          <div class="vote-row-info">
            <div class="vote-row-name">${escapeHtml(m.title)}</div>
            <div class="vote-row-sub">${escapeHtml(sub)}</div>
          </div>
        </a>
        <div class="vote-row-actions">
          <div class="vote-inline-scores" id="vscores-${encodeURIComponent(v.id)}" style="display:none;">
            ${[1,2,3,4,5,6,7,8,9,10].map(n => `<button class="vote-score-btn ${n === score ? 'active' : ''}" 
              onclick="changeMyVote('${v.id}','${m.id}','${m.category_id}',${n})">${n}</button>`).join('')}
            <button class="vote-score-remove" onclick="removeMyVote('${v.id}','${m.id}')">✕</button>
          </div>
          <div class="vote-score-badge" style="background:${scoreColor}"
            onclick="toggleVoteScores('${encodeURIComponent(v.id)}')"
            title="Click to change">${score}</div>
        </div>
      </div>`;

}

function getScoreColor(s) {
  if (s >= 9) return '#1e5c3a';
  if (s >= 7) return '#4a7c59';
  if (s >= 5) return '#c8972a';
  if (s >= 3) return '#e76f51';
  return '#c1440e';
}

function toggleVoteScores(id) {
  // Close all others first
  document.querySelectorAll('.vote-inline-scores').forEach(el => {
    if (el.id !== 'vscores-' + id) el.style.display = 'none';
  });
  const el = document.getElementById('vscores-' + id);
  if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none';
}

async function changeMyVote(voteId, markerId, categoryId, newScore) {
  const { error } = await sb.from('votes')
    .update({ vote: newScore, updated_at: new Date().toISOString() })
    .eq('id', voteId);
  if (error) { alert('Could not update vote'); return; }
  // Update local data
  const v = MY_VOTES.find(x => x.id === voteId);
  if (v) v.vote = newScore;
  renderVotesList();
}

async function removeMyVote(voteId, markerId) {
  if (!confirm('Remove this vote?')) return;
  const { error } = await sb.from('votes').update({ is_active: false }).eq('id', voteId);
  if (error) { alert('Could not remove vote'); return; }
  MY_VOTES = MY_VOTES.filter(v => v.id !== voteId);
  renderVotesList();
}

/* ══════════════════════════════════ EDIT MODE: ENTRY/EXIT */
function enterEditMode() {
  document.getElementById("normalView").style.display = "none";
  document.getElementById("editView").style.display   = "block";
  EDIT_CAT_ID = null;
  EDIT_CARDS  = [];
  renderEditSidebar();

  // Auto-select first category
  const cids = [...new Set(MY_VOTES.map(v => v.markers.category_id))];
  if (cids.length) selectEditCategory(cids[0]);
  else showEditEmpty();
}

function exitEditMode() {
  if (hasPendingChanges() && !confirm("Discard unsaved changes?")) return;
  document.getElementById("normalView").style.display = "block";
  document.getElementById("editView").style.display   = "none";
}

/* ── Sidebar ── */
function renderEditSidebar() {
  const host = document.getElementById("editCatList");
  host.innerHTML = "";
  const cids = [...new Set(MY_VOTES.map(v => v.markers.category_id))];
  if (!cids.length) {
    host.innerHTML = `<p class="muted" style="padding:12px 14px;">No votes yet.</p>`;
    return;
  }
  cids.forEach(cid => {
    const cat   = CAT_BY_ID[cid];
    const count = MY_VOTES.filter(v => v.markers.category_id === cid).length;
    const btn   = document.createElement("button");
    btn.className  = "edit-cat-item" + (EDIT_CAT_ID === cid ? " active" : "");
    btn.dataset.cid = cid;
    btn.onclick = () => {
      if (hasPendingChanges() && !confirm("Discard unsaved changes?")) return;
      selectEditCategory(cid);
    };
    const iconHtml = cat?.icon_url
      ? `<img class="edit-cat-icon" src="${escapeHtml(cat.icon_url)}" alt=""/>`
      : `<span class="edit-cat-icon-fallback">📦</span>`;
    btn.innerHTML = `${iconHtml}<span class="edit-cat-name">${escapeHtml(cat?.name || String(cid))}</span><span class="edit-cat-count">${count}</span>`;
    host.appendChild(btn);
  });
}

function selectEditCategory(cid) {
  EDIT_CAT_ID = cid;
  document.querySelectorAll(".edit-cat-item").forEach(el =>
    el.classList.toggle("active", parseInt(el.dataset.cid) === cid));

  const votesForCat = MY_VOTES
    .filter(v => v.markers.category_id === cid)
    .sort((a, b) => b.vote - a.vote);

  EDIT_CARDS = votesForCat.map(v => ({
    vote_id:   v.id,
    marker_id: v.markers.id,
    title:     v.markers.title,
    saved:     v.vote !== null ? +parseFloat(v.vote).toFixed(1) : null,
    pending:   null,
  }));

  document.getElementById("distributeBar").style.display   = "flex";
  document.getElementById("distTop").value                  = "";
  document.getElementById("distBottom").value               = "";
  document.getElementById("distributeStatus").textContent   = "";
  document.getElementById("editEmptyState").style.display   = "none";
  renderEditCards();
  updateSaveBtn();
}

function showEditEmpty() {
  document.getElementById("editCardsList").innerHTML        = "";
  document.getElementById("distributeBar").style.display    = "none";
  document.getElementById("editEmptyState").style.display   = "block";
}

/* ── Render edit cards ── */
function renderEditCards() {
  const host = document.getElementById("editCardsList");

  // Sort by effective score desc (pending overrides saved)
  EDIT_CARDS.sort((a, b) => {
    const va = a.pending ?? a.saved ?? 0;
    const vb = b.pending ?? b.saved ?? 0;
    return vb - va;
  });

  host.innerHTML = "";

  EDIT_CARDS.forEach((card, idx) => {
    const effectiveScore = card.pending ?? card.saved;
    const isPending      = card.pending !== null;
    const cls            = colorClass(effectiveScore);

    const div = document.createElement("div");
    div.className  = "edit-vote-card" + (isPending ? " is-pending" : "");
    div.dataset.idx = idx;

    // Top row: rank + title + score
    const topRow      = document.createElement("div");
    topRow.className  = "edit-vote-top";

    const rankEl      = document.createElement("div");
    rankEl.className  = "edit-vote-rank";
    rankEl.textContent = String(idx + 1);

    const titleEl      = document.createElement("div");
    titleEl.className  = "edit-vote-title";
    titleEl.textContent = card.title;

    const scoreEl      = document.createElement("div");
    scoreEl.className  = `edit-vote-score ${cls}`;
    scoreEl.textContent = effectiveScore !== null ? Number(effectiveScore).toFixed(1) : "—";

    topRow.appendChild(rankEl);
    topRow.appendChild(titleEl);
    topRow.appendChild(scoreEl);

    // Bottom row: 1–10 buttons spanning full width
    const btnWrap     = document.createElement("div");
    btnWrap.className = "edit-vote-btns";
    for (let i = 1; i <= 10; i++) {
      const btn        = document.createElement("button");
      const isSelected = effectiveScore !== null && +parseFloat(effectiveScore).toFixed(1) === i;
      btn.className    = "edit-vote-btn" + (isSelected ? " selected" : "");
      btn.textContent  = String(i);
      const capturedIdx = idx;
      btn.onclick = () => onVoteClick(capturedIdx, i);
      btnWrap.appendChild(btn);
    }

    div.appendChild(topRow);
    div.appendChild(btnWrap);
    host.appendChild(div);
  });
}

/* ── Vote click ── */
function onVoteClick(idx, value) {
  const card = EDIT_CARDS[idx];
  // Toggle: clicking current pending value clears it (reverts to saved)
  card.pending = (card.pending === value) ? null : value;
  renderEditCards();
  updateSaveBtn();
}

/* ══════════════════════════════════ DISTRIBUTE */
function distributeScores() {
  const topVal    = parseFloat(document.getElementById("distTop").value);
  const bottomVal = parseFloat(document.getElementById("distBottom").value);
  const statusEl  = document.getElementById("distributeStatus");

  if (isNaN(topVal) || isNaN(bottomVal)) { statusEl.textContent = "Enter both values."; return; }
  if (topVal < bottomVal)  { statusEl.textContent = "Top must be ≥ bottom."; return; }
  if (topVal > 10 || bottomVal < 1) { statusEl.textContent = "Values must be 1–10."; return; }

  const n = EDIT_CARDS.length;
  if (!n) return;

  // Sort cards by current effective score first, then distribute
  EDIT_CARDS.sort((a, b) => (b.pending ?? b.saved ?? 0) - (a.pending ?? a.saved ?? 0));

  EDIT_CARDS.forEach((card, i) => {
    card.pending = n === 1
      ? +topVal.toFixed(1)
      : +(topVal - (topVal - bottomVal) * (i / (n - 1))).toFixed(1);
  });

  statusEl.textContent = `✅ ${topVal} → ${bottomVal} across ${n} cards`;
  renderEditCards();
  updateSaveBtn();
}

/* ══════════════════════════════════ SAVE */
async function saveVotes() {
  if (!hasPendingChanges()) return;

  const btn = document.getElementById("btnSaveVotes");
  btn.disabled    = true;
  btn.textContent = "Saving…";

  const toSave = EDIT_CARDS.filter(c => c.pending !== null);
  const errors = [];

  for (const card of toSave) {
    const { error } = await sb
      .from("votes")
      .update({ vote: card.pending, is_active: true })
      .eq("id", card.vote_id);
    if (error) errors.push(`${card.title}: ${error.message}`);
    else { card.saved = card.pending; card.pending = null; }
  }

  if (errors.length) alert("Some votes failed:\n" + errors.join("\n"));

  btn.textContent = "Save changes";

  // Reload data in background, update normal view
  await loadAllData();
  renderNormalView();

  // Stay in edit mode, refresh cards showing updated saved values
  // Re-select same category to refresh
  selectEditCategory(EDIT_CAT_ID);
  updateSaveBtn();
}
