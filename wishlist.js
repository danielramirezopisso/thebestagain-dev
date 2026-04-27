// wishlist.js — public shareable wishlist page
// URL format: wishlist.html?user=USER_UUID

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colorCls(avg, cnt) {
  if (!cnt || cnt < 3) return "rating-none";
  if (avg >= 9) return "rating-9-10";
  if (avg >= 7) return "rating-7-8";
  if (avg >= 5) return "rating-5-6";
  if (avg >= 3) return "rating-3-4";
  return "rating-1-2";
}

async function initWishlistPage() {
  const params     = new URLSearchParams(location.search);
  const targetUser = params.get("user");
  const content    = document.getElementById("wlContent");
  const heading    = document.getElementById("wlHeading");
  const subheading = document.getElementById("wlSubheading");

  if (!targetUser) {
    subheading.textContent = "No user specified.";
    return;
  }

  // Init heart button state for the current viewer
  wlInit();

  // Fetch target user's profile for display name
  const { data: profile } = await sb
    .from("profiles")
    .select("username, display_name")
    .eq("id", targetUser)
    .maybeSingle();

  const displayName = profile?.display_name || profile?.username || "Someone";
  heading.textContent = `${displayName}'s Wishlist`;
  document.title      = `${displayName}'s Wishlist — The Best Again`;

  const me    = await maybeUser();
  const isOwn = me && me.id === targetUser;

  // Fetch wishlist rows with embedded marker data
  const { data, error } = await sb
    .from("wishlists")
    .select("marker_id, created_at, markers(id, title, group_type, category_id, rating_avg, rating_count, address, brand_id)")
    .eq("user_id", targetUser)
    .order("created_at", { ascending: false });

  if (error) {
    subheading.textContent = "Could not load wishlist.";
    return;
  }

  const items = (data || []).filter(r => r.markers);
  subheading.textContent = `${items.length} saved item${items.length === 1 ? "" : "s"}`;

  if (!items.length) {
    content.innerHTML = `<div class="wishlist-empty">
      <div style="font-size:40px;margin-bottom:12px;">♥</div>
      <p>${isOwn ? "You haven't saved anything yet." : "This wishlist is empty."}</p>
      ${isOwn ? `<p class="muted" style="font-size:13px;">Tap the ♥ on any place or product to save it here.</p>` : ""}
    </div>`;
    return;
  }

  // Fetch reference data for display
  const [catRes, brandRes] = await Promise.all([
    sb.from("categories").select("id,name,icon_url").eq("is_active", true),
    sb.from("brands").select("id,name").eq("is_active", true),
  ]);
  const catMap   = Object.fromEntries((catRes.data   || []).map(c => [c.id, c]));
  const brandMap = Object.fromEntries((brandRes.data || []).map(b => [b.id, b]));

  content.innerHTML = items.map(r => {
    const m       = r.markers;
    const cat     = catMap[m.category_id];
    const avg     = Number(m.rating_avg ?? 0);
    const cnt     = Number(m.rating_count ?? 0);
    const rTxt    = cnt ? avg.toFixed(1) : "—";
    const isPlace = m.group_type === "place";
    const sub     = isPlace
      ? (m.address || cat?.name || "")
      : (brandMap[m.brand_id]?.name || cat?.name || "");
    const iconUrl = cat?.icon_url || (isPlace ? "icons/default-place.svg" : "icons/default-product.svg");
    const cls     = colorCls(avg, cnt);
    const typeTag = isPlace
      ? `<span class="type-tag type-tag-place">📍 Place</span>`
      : `<span class="type-tag type-tag-product">🛒 Product</span>`;

    return `
      <div class="wishlist-pub-item">
        <a class="wishlist-pub-link" href="marker.html?id=${escHtml(m.id)}">
          <div class="wishlist-item-icon">
            <img src="${escHtml(iconUrl)}" alt="" onerror="this.style.display='none'" />
          </div>
          <div class="wishlist-item-body">
            <div class="wishlist-item-title">${escHtml(m.title)}</div>
            <div class="wishlist-item-sub muted">${escHtml(sub)}</div>
          </div>
          ${typeTag}
          <div class="wishlist-item-rating rating-badge ${cls}">${escHtml(rTxt)}</div>
        </a>
        ${wlBtnHtml(m.id)}
      </div>
    `;
  }).join("");

  // Sync heart states after render
  if (typeof _wlRefreshAll === "function") _wlRefreshAll();
}
