// wishlist-btn.js — shared heart button logic
// Depends on: sb (supabase client), maybeUser() — both from auth.js

// In-memory cache of wishlisted marker IDs for the current session
let WL_SET  = new Set();   // marker ids the user has wishlisted
let WL_READY = false;      // true once we've fetched from DB

/* ── Load user's wishlist into WL_SET ── */
async function wlLoad() {
  if (WL_READY) return;
  const user = await maybeUser();
  if (!user) { WL_READY = true; return; }
  const { data } = await sb
    .from("wishlists")
    .select("marker_id")
    .eq("user_id", user.id);
  WL_SET = new Set((data || []).map(r => r.marker_id));
  WL_READY = true;
  _wlRefreshAll();
}

/* ── Toggle wishlist for a marker ── */
async function wlToggle(markerId, btn) {
  const user = await maybeUser();
  if (!user) {
    await softLoginNudge("Sign in to save places to your wishlist.");
    return;
  }

  const wasLiked = WL_SET.has(markerId);

  // Optimistic UI immediately
  if (wasLiked) { WL_SET.delete(markerId); } else { WL_SET.add(markerId); }
  _wlRefreshAll(); // refresh ALL buttons including the one clicked

  // Persist to DB
  let error = null;
  if (wasLiked) {
    const res = await sb.from("wishlists")
      .delete()
      .eq("user_id", user.id)
      .eq("marker_id", markerId);
    error = res.error;
  } else {
    const res = await sb.from("wishlists")
      .upsert({ user_id: user.id, marker_id: markerId }, { onConflict: "user_id,marker_id" });
    error = res.error;
  }

  // If DB failed, revert optimistic update
  if (error) {
    if (wasLiked) { WL_SET.add(markerId); } else { WL_SET.delete(markerId); }
    _wlRefreshAll();
    console.error("Wishlist error:", error.message);
    return;
  }

  // If we removed an item and wishlist tab is active, remove row from DOM
  if (wasLiked) {
    const panel = document.getElementById("panel-wishlist");
    if (panel && panel.classList.contains("active")) {
      const row = document.querySelector(`.vote-row [data-wl-id="${markerId}"]`)?.closest(".vote-row");
      if (row) {
        row.style.opacity = "0";
        row.style.transition = "opacity 0.2s";
        setTimeout(() => {
          row.remove();
          // Reindex position numbers
          document.querySelectorAll("#wishlistItems .vote-row-pos").forEach((el, i) => {
            el.textContent = i + 1;
          });
        }, 200);
      }
    }
  }
}

/* ── Render all heart buttons on the page ── */
function _wlRefreshAll() {
  document.querySelectorAll("[data-wl-id]").forEach(btn => {
    const id = btn.dataset.wlId;
    _wlSetBtnState(btn, WL_SET.has(id));
  });
}

function _wlSetBtnState(btn, liked) {
  btn.classList.toggle("wl-active", liked);
  btn.setAttribute("aria-label", liked ? "Remove from wishlist" : "Add to wishlist");
  btn.title = liked ? "Remove from wishlist" : "Save to wishlist";
}

/* ── Generate heart button HTML ── */
// Returns an <button> HTML string with data-wl-id set
// Call wlLoad() on page init so the state is correct
function wlBtnHtml(markerId, extraClass = "") {
  const liked = WL_SET.has(markerId);
  return `<button
    class="wl-btn${extraClass ? " " + extraClass : ""}${liked ? " wl-active" : ""}"
    data-wl-id="${markerId}"
    onclick="event.stopPropagation(); wlToggle('${markerId}', this)"
    aria-label="${liked ? "Remove from wishlist" : "Add to wishlist"}"
    title="${liked ? "Remove from wishlist" : "Save to wishlist"}"
  ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg></button>`;
}

/* ── Init: call on every page that shows hearts ── */
async function wlInit() {
  await wlLoad();
  _wlRefreshAll();
}
