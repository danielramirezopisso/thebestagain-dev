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
function renderNormalView() {
  const wrap = document.getElementById("votesByCategory");
  if (!MY_VOTES.length) {
    wrap.innerHTML = `
      <div style="text-align:center;padding:48px 20px;">
        <div style="font-size:36px;margin-bottom:10px;">🗳️</div>
        <h3 style="margin:0 0 6px;">No votes yet</h3>
        <p class="muted">Open any marker and cast your first vote.</p>
      </div>`;
    return;
  }

  const byCat = {};
  MY_VOTES.forEach(v => {
    const cid = v.markers.category_id;
    if (!byCat[cid]) byCat[cid] = [];
    byCat[cid].push(v);
  });
  Object.values(byCat).forEach(arr => arr.sort((a, b) => b.vote - a.vote));

  const catIds = Object.keys(byCat).map(Number)
    .sort((a, b) => (byCat[b][0]?.vote ?? 0) - (byCat[a][0]?.vote ?? 0));

  wrap.innerHTML = catIds.map(cid => {
    const cat   = CAT_BY_ID[cid];
    const votes = byCat[cid];
    const iconHtml = cat?.icon_url
      ? `<div class="cat-block-icon"><img src="${escapeHtml(cat.icon_url)}" alt=""/></div>`
      : `<div class="cat-block-icon">📦</div>`;

    const rows = votes.map((v, i) => {
      const m     = v.markers;
      const score = Number(v.vote);
      const cls   = colorClass(score);
      let info = "";
      if (m.group_type === "product" && m.brand_id)
        info = `<span class="muted" style="font-size:12px;"> · ${escapeHtml(BRAND_BY_ID[m.brand_id]?.name || "")}</span>`;
      return `
        <tr onclick="window.location.href='marker.html?id=${encodeURIComponent(m.id)}'">
          <td><span class="rank-badge">${i + 1}</span></td>
          <td><b>${escapeHtml(m.title)}</b>${info}</td>
          <td><span class="score-pill ${cls}">${score.toFixed(1)}</span></td>
        </tr>`;
    }).join("");

    return `
      <div class="cat-block">
        <div class="cat-block-head">
          ${iconHtml}
          <span class="cat-block-name">${escapeHtml(cat?.name || "Unknown")}</span>
          <span class="cat-block-count">${votes.length} vote${votes.length === 1 ? "" : "s"}</span>
        </div>
        <table class="votes-table">
          <colgroup><col class="col-rank"/><col class="col-title"/><col class="col-score"/></colgroup>
          <thead><tr><th>#</th><th>Title</th><th>Score</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join("");
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
