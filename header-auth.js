// header-auth.js — shows login status + notification bell

async function renderAuthHeader() {
  const user = await maybeUser();
  const el = document.getElementById("authStatus") || document.getElementById("authHeaderSlot");
  if (!el) return;

  if (!user) {
    el.innerHTML = `<a href="login.html">Login</a>`;
    return;
  }

  const displayName = user.user_metadata?.display_name || user.email || "Account";

  el.innerHTML = `
    <div class="header-user-row">
      <div class="notif-wrap">
        <button class="notif-btn" id="notifBtn" onclick="toggleNotifPanel()" title="Notifications">
          🔔
          <span class="notif-badge" id="notifBadge" style="display:none;"></span>
        </button>
        <div class="notif-panel" id="notifPanel" style="display:none;">
          <div class="notif-panel-head">
            Notifications
            <button class="notif-mark-all" onclick="markAllRead()">Mark all read</button>
          </div>
          <div id="notifList"><p class="notif-empty">Loading…</p></div>
        </div>
      </div>
      <a href="user.html" class="header-username" title="My Profile">👤 ${escapeHtmlHeader(displayName)}</a>
      <a href="#" onclick="logout(); return false;">Logout</a>
    </div>
  `;

  loadNotifications(user);

  // Close panel on outside click
  document.addEventListener("click", e => {
    if (!e.target.closest(".notif-wrap")) {
      const p = document.getElementById("notifPanel");
      if (p) p.style.display = "none";
    }
  });
}

async function loadNotifications(user) {
  try {
  const { data, error } = await sb
    .from("notifications")
    .select("id,type,is_read,created_at,marker_id,comment_id,from_user_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !data) return;

  const unread = data.filter(n => !n.is_read).length;
  const badge  = document.getElementById("notifBadge");
  if (badge) {
    badge.style.display = unread > 0 ? "flex" : "none";
    badge.textContent   = unread > 9 ? "9+" : String(unread);
  }

  const list = document.getElementById("notifList");
  if (!list) return;

  if (!data.length) {
    list.innerHTML = `<p class="notif-empty">No notifications yet.</p>`;
    return;
  }

  // Fetch display names for from_user_ids
  const fromIds = [...new Set(data.map(n => n.from_user_id).filter(Boolean))];
  const nameById = {};
  if (fromIds.length) {
    const { data: profiles } = await sb.from("profiles").select("id,display_name").in("id", fromIds);
    (profiles || []).forEach(p => nameById[p.id] = p.display_name);
  }

  list.innerHTML = data.map(n => {
    const fromName = nameById[n.from_user_id] || "Someone";
    const timeAgo  = notifTimeAgo(n.created_at);
    const text     = n.type === "reply"
      ? `💬 <b>${escapeHtmlHeader(fromName)}</b> replied to your comment`
      : `🗳️ <b>${escapeHtmlHeader(fromName)}</b> did something`;
    const href = n.marker_id ? `marker.html?id=${encodeURIComponent(n.marker_id)}` : "#";
    return `
      <a class="notif-item ${n.is_read ? "" : "notif-unread"}" href="${href}"
        onclick="markRead('${n.id}')">
        <span class="notif-text">${text}</span>
        <span class="notif-time">${timeAgo}</span>
      </a>`;
  }).join("");
  } catch(e) {
    // notifications table may not exist yet — fail silently
    const list = document.getElementById("notifList");
    if (list) list.innerHTML = `<p class="notif-empty">No notifications yet.</p>`;
  }
}

async function markRead(notifId) {
  await sb.from("notifications").update({ is_read: true }).eq("id", notifId);
}

async function markAllRead() {
  const user = await maybeUser();
  if (!user) return;
  await sb.from("notifications").update({ is_read: true })
    .eq("user_id", user.id).eq("is_read", false);
  const badge = document.getElementById("notifBadge");
  if (badge) badge.style.display = "none";
  document.querySelectorAll(".notif-item").forEach(el => el.classList.remove("notif-unread"));
}

function toggleNotifPanel() {
  const panel = document.getElementById("notifPanel");
  if (!panel) return;
  panel.style.display = panel.style.display === "none" ? "block" : "none";
}

function notifTimeAgo(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function escapeHtmlHeader(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;");
}
