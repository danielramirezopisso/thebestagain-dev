// admin.js — Admin panel
// Only dropisso@gmail.com can access this page.
// All deletes are soft deletes (is_active = false).
// Deactivating a category/brand also deactivates all related markers.
// Removing a category-brand link also deactivates markers of that combination.

const ADMIN_EMAIL = "dropisso@gmail.com";

let ALL_CATEGORIES = [];
let ALL_BRANDS = [];
let ALL_CATEGORY_BRANDS = []; // current links

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setCatStatus(msg)   { document.getElementById("catStatus").textContent = msg || ""; }
function setBrandStatus(msg) { document.getElementById("brandStatus").textContent = msg || ""; }
function setLinkStatus(msg)  { document.getElementById("linkStatus").textContent = msg || ""; }

/* ══════════════════════════════
   INIT
══════════════════════════════ */
async function initAdminPage() {
  const user = await maybeUser();

  if (!user || user.email !== ADMIN_EMAIL) {
    document.getElementById("accessDenied").style.display = "block";
    return;
  }

  document.getElementById("adminContent").style.display = "block";
  await Promise.all([loadCategories(), loadBrands(), loadChains(), loadBattlesAdmin()]);
  populateLinkCatSelect();
}

/* ══════════════════════════════
   MODALS
══════════════════════════════ */
function openModal(id) {
  document.getElementById(id).style.display = "flex";
}
function closeModal(id) {
  document.getElementById(id).style.display = "none";
}
function closeModalOnBg(event, id) {
  if (event.target === document.getElementById(id)) closeModal(id);
}

function confirm(title, message, onConfirm) {
  document.getElementById("confirmTitle").textContent = title;
  document.getElementById("confirmMessage").textContent = message;
  const btn = document.getElementById("confirmBtn");
  btn.onclick = () => { closeModal("confirmModal"); onConfirm(); };
  openModal("confirmModal");
}

/* ══════════════════════════════
   CATEGORIES
══════════════════════════════ */
async function loadCategories() {
  setCatStatus("Loading…");
  const { data, error } = await sb
    .from("categories")
    .select("id,name,icon_url,for_places,for_products,is_active,created_at")
    .order("id", { ascending: true });

  if (error) { setCatStatus("Error: " + error.message); return; }
  ALL_CATEGORIES = data || [];
  renderCatTable();
  setCatStatus(`${ALL_CATEGORIES.length} categories total.`);
}

function renderCatTable() {
  const wrap = document.getElementById("catTable");
  if (!ALL_CATEGORIES.length) {
    wrap.innerHTML = `<p class="muted">No categories yet.</p>`;
    return;
  }

  wrap.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>ID</th>
          <th class="col-name">Name</th>
          <th class="col-flag">Places</th>
          <th class="col-flag">Products</th>
          <th class="col-status">Status</th>
          <th class="col-actions">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${ALL_CATEGORIES.map(c => `
          <tr class="${c.is_active ? "" : "inactive"}">
            <td>${c.id}</td>
            <td class="col-name">
              ${c.icon_url ? `<img class="admin-icon-preview" src="${escapeHtml(c.icon_url)}" onerror="this.style.display='none'" />` : ""}
              <b>${escapeHtml(c.name)}</b>
            </td>
            <td class="col-flag">${c.for_places ? "✅" : "—"}</td>
            <td class="col-flag">${c.for_products ? "✅" : "—"}</td>
            <td class="col-status"><span class="pill ${c.is_active ? "pill-active" : "pill-inactive"}">${c.is_active ? "Active" : "Inactive"}</span></td>
            <td>
              <div class="row-actions">
                <button onclick="editCategory(${c.id})">Edit</button>
                ${c.is_active
                  ? `<button style="border-color:#ef4444;color:#ef4444;" onclick="deactivateCategory(${c.id})">Deactivate</button>`
                  : `<button onclick="reactivateCategory(${c.id})">Reactivate</button>`
                }
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function openNewCategoryModal() {
  document.getElementById("cat_id").value = "";
  document.getElementById("cat_name").value = "";
  document.getElementById("cat_icon_url").value = "";
  document.getElementById("cat_for_places").checked = false;
  document.getElementById("cat_for_products").checked = false;
  document.getElementById("catModalTitle").textContent = "New Category";
  document.getElementById("catModalStatus").textContent = "";
  openModal("categoryModal");
}

function editCategory(id) {
  const c = ALL_CATEGORIES.find(x => x.id === id);
  if (!c) return;
  document.getElementById("cat_id").value = c.id;
  document.getElementById("cat_name").value = c.name;
  document.getElementById("cat_icon_url").value = c.icon_url || "";
  document.getElementById("cat_for_places").checked = !!c.for_places;
  document.getElementById("cat_for_products").checked = !!c.for_products;
  document.getElementById("catModalTitle").textContent = "Edit Category";
  document.getElementById("catModalStatus").textContent = "";
  openModal("categoryModal");
}

async function saveCategory() {
  const id = parseInt(document.getElementById("cat_id").value) || null;
  const name = document.getElementById("cat_name").value.trim();
  const iconRaw = document.getElementById("cat_icon_url").value.trim();
  const icon_url = iconRaw
    ? (iconRaw.startsWith("http") ? iconRaw : `https://danielramirezopisso.github.io/thebestagain/icons/${iconRaw.replace(/\.svg$/,"")}.svg`)
    : null;
  const for_places = document.getElementById("cat_for_places").checked;
  const for_products = document.getElementById("cat_for_products").checked;
  const statusEl = document.getElementById("catModalStatus");

  if (!name) { statusEl.textContent = "Name is required."; return; }

  statusEl.textContent = "Saving…";

  if (id) {
    // Update existing
    const { error } = await sb
      .from("categories")
      .update({ name, icon_url, for_places, for_products })
      .eq("id", id);
    if (error) { statusEl.textContent = "Error: " + error.message; return; }
  } else {
    // Insert new
    const { error } = await sb
      .from("categories")
      .insert([{ name, icon_url, for_places, for_products, is_active: true }]);
    if (error) { statusEl.textContent = "Error: " + error.message; return; }
  }

  closeModal("categoryModal");
  await loadCategories();
  populateLinkCatSelect();
}

async function deactivateCategory(id) {
  const cat = ALL_CATEGORIES.find(c => c.id === id);
  confirm(
    "Deactivate Category",
    `Deactivate "${cat?.name}"? All markers in this category will also be deactivated.`,
    async () => {
      setCatStatus("Deactivating…");

      // Soft-delete all markers of this category
      await sb.from("markers").update({ is_active: false }).eq("category_id", id);

      // Soft-delete the category itself
      const { error } = await sb.from("categories").update({ is_active: false }).eq("id", id);
      if (error) { setCatStatus("Error: " + error.message); return; }

      await loadCategories();
      setCatStatus(`Category deactivated ✅`);
    }
  );
}

async function reactivateCategory(id) {
  const { error } = await sb.from("categories").update({ is_active: true }).eq("id", id);
  if (error) { setCatStatus("Error: " + error.message); return; }
  await loadCategories();
  setCatStatus("Category reactivated ✅");
}

/* ══════════════════════════════
   BRANDS
══════════════════════════════ */
async function loadBrands() {
  setBrandStatus("Loading…");
  const { data, error } = await sb
    .from("brands")
    .select("id,name,icon_url,is_active,created_at")
    .order("id", { ascending: true });

  if (error) { setBrandStatus("Error: " + error.message); return; }
  ALL_BRANDS = data || [];
  renderBrandTable();
  setBrandStatus(`${ALL_BRANDS.length} brands total.`);
}

function renderBrandTable() {
  const wrap = document.getElementById("brandTable");
  if (!ALL_BRANDS.length) {
    wrap.innerHTML = `<p class="muted">No brands yet.</p>`;
    return;
  }

  wrap.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>ID</th>
          <th class="col-name">Name</th>
          <th class="col-icon">Icon</th>
          <th class="col-status">Status</th>
          <th class="col-actions">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${ALL_BRANDS.map(b => `
          <tr class="${b.is_active ? "" : "inactive"}">
            <td>${b.id}</td>
            <td class="col-name">
              ${b.icon_url ? `<img class="admin-icon-preview" src="${escapeHtml(b.icon_url)}" onerror="this.style.display='none'" />` : ""}
              <b>${escapeHtml(b.name)}</b>
            </td>
            <td class="col-icon">
              <span title="${escapeHtml(b.icon_url || '')}">${escapeHtml(b.icon_url ? b.icon_url.split('/').pop() : '—')}</span>
            </td>
            <td><span class="pill ${b.is_active ? "pill-active" : "pill-inactive"}">${b.is_active ? "Active" : "Inactive"}</span></td>
            <td>
              <div class="row-actions">
                <button onclick="editBrand(${b.id})">Edit</button>
                ${b.is_active
                  ? `<button style="border-color:#ef4444;color:#ef4444;" onclick="deactivateBrand(${b.id})">Deactivate</button>`
                  : `<button onclick="reactivateBrand(${b.id})">Reactivate</button>`
                }
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function openNewBrandModal() {
  document.getElementById("brand_id").value = "";
  document.getElementById("brand_name").value = "";
  document.getElementById("brand_icon_url").value = "";
  document.getElementById("brandModalTitle").textContent = "New Brand";
  document.getElementById("brandModalStatus").textContent = "";
  openModal("brandModal");
}

function editBrand(id) {
  const b = ALL_BRANDS.find(x => x.id === id);
  if (!b) return;
  document.getElementById("brand_id").value = b.id;
  document.getElementById("brand_name").value = b.name;
  document.getElementById("brand_icon_url").value = b.icon_url || "";
  document.getElementById("brandModalTitle").textContent = "Edit Brand";
  document.getElementById("brandModalStatus").textContent = "";
  openModal("brandModal");
}

async function saveBrand() {
  const id = parseInt(document.getElementById("brand_id").value) || null;
  const name = document.getElementById("brand_name").value.trim();
  const iconRaw2 = document.getElementById("brand_icon_url").value.trim();
  const icon_url = iconRaw2
    ? (iconRaw2.startsWith("http") ? iconRaw2 : `https://danielramirezopisso.github.io/thebestagain/icons/brands/${iconRaw2.replace(/\.(svg|jpg|jpeg|png)$/,"")}.${iconRaw2.match(/\.(jpg|jpeg|png)$/) ? iconRaw2.split(".").pop() : "svg"}`)
    : null;
  const statusEl = document.getElementById("brandModalStatus");

  if (!name) { statusEl.textContent = "Name is required."; return; }
  statusEl.textContent = "Saving…";

  if (id) {
    const { error } = await sb.from("brands").update({ name, icon_url }).eq("id", id);
    if (error) { statusEl.textContent = "Error: " + error.message; return; }
  } else {
    const { error } = await sb.from("brands").insert([{ name, icon_url, is_active: true }]);
    if (error) { statusEl.textContent = "Error: " + error.message; return; }
  }

  closeModal("brandModal");
  await loadBrands();
  // Reload links panel if open, since brand list changed
  if (document.getElementById("linkCatSelect").value) loadLinksForCategory();
}

async function deactivateBrand(id) {
  const brand = ALL_BRANDS.find(b => b.id === id);
  confirm(
    "Deactivate Brand",
    `Deactivate "${brand?.name}"? All markers with this brand will also be deactivated.`,
    async () => {
      setBrandStatus("Deactivating…");

      // Soft-delete all markers of this brand
      await sb.from("markers").update({ is_active: false }).eq("brand_id", id);

      // Soft-delete the brand
      const { error } = await sb.from("brands").update({ is_active: false }).eq("id", id);
      if (error) { setBrandStatus("Error: " + error.message); return; }

      await loadBrands();
      setBrandStatus("Brand deactivated ✅");
    }
  );
}

async function reactivateBrand(id) {
  const { error } = await sb.from("brands").update({ is_active: true }).eq("id", id);
  if (error) { setBrandStatus("Error: " + error.message); return; }
  await loadBrands();
  setBrandStatus("Brand reactivated ✅");
}

/* ══════════════════════════════
   CATEGORY–BRAND LINKS
══════════════════════════════ */
function populateLinkCatSelect() {
  const sel = document.getElementById("linkCatSelect");
  const current = sel.value;

  // Only product categories are relevant for brand linking
  const productCats = ALL_CATEGORIES.filter(c => c.for_products && c.is_active);

  sel.innerHTML = `<option value="">— pick a category —</option>` +
    productCats.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");

  if (current) sel.value = current;
}

async function loadLinksForCategory() {
  const category_id = parseInt(document.getElementById("linkCatSelect").value) || null;
  const panel = document.getElementById("linkPanel");

  if (!category_id) {
    panel.innerHTML = "";
    setLinkStatus("");
    return;
  }

  setLinkStatus("Loading links…");
  panel.innerHTML = "";

  const { data, error } = await sb
    .from("category_brands")
    .select("id,brand_id,is_active")
    .eq("category_id", category_id);

  if (error) { setLinkStatus("Error: " + error.message); return; }
  ALL_CATEGORY_BRANDS = data || [];

  const linkedIds = new Set(
    ALL_CATEGORY_BRANDS.filter(cb => cb.is_active).map(cb => cb.brand_id)
  );

  const activeBrands = ALL_BRANDS.filter(b => b.is_active);

  if (!activeBrands.length) {
    panel.innerHTML = `<p class="muted">No active brands available.</p>`;
    setLinkStatus("");
    return;
  }

  panel.innerHTML = `
    <div class="brand-grid">
      ${activeBrands.map(b => `
        <label class="brand-check-card ${linkedIds.has(b.id) ? "linked" : ""}" id="brandCard_${b.id}">
          <input
            type="checkbox"
            id="brandLink_${b.id}"
            ${linkedIds.has(b.id) ? "checked" : ""}
            onchange="toggleBrandLink(${category_id}, ${b.id}, this.checked)"
          />
          <div>
            <div class="brand-check-name">${escapeHtml(b.name)}</div>
            <div class="brand-check-status">${linkedIds.has(b.id) ? "Linked" : "Not linked"}</div>
          </div>
        </label>
      `).join("")}
    </div>
  `;

  setLinkStatus(`${linkedIds.size} brand(s) linked to this category.`);
}

async function toggleBrandLink(category_id, brand_id, shouldLink) {
  setLinkStatus("Saving…");

  // Check if a row already exists (active or inactive)
  const existing = ALL_CATEGORY_BRANDS.find(cb => cb.brand_id === brand_id);

  if (shouldLink) {
    // Link: upsert as active
    if (existing) {
      const { error } = await sb
        .from("category_brands")
        .update({ is_active: true })
        .eq("id", existing.id);
      if (error) { setLinkStatus("Error: " + error.message); return; }
    } else {
      const { error } = await sb
        .from("category_brands")
        .insert([{ category_id, brand_id, is_active: true }]);
      if (error) { setLinkStatus("Error: " + error.message); return; }
    }

    // Update card UI
    const card = document.getElementById(`brandCard_${brand_id}`);
    if (card) {
      card.classList.add("linked");
      card.querySelector(".brand-check-status").textContent = "Linked";
    }
    setLinkStatus("Link added ✅");

  } else {
    // Unlink: soft delete the link AND all markers of this category+brand combo
    if (existing) {
      const { error } = await sb
        .from("category_brands")
        .update({ is_active: false })
        .eq("id", existing.id);
      if (error) { setLinkStatus("Error: " + error.message); return; }
    }

    // Soft-delete markers of this category+brand combination
    const { error: mErr } = await sb
      .from("markers")
      .update({ is_active: false })
      .eq("category_id", category_id)
      .eq("brand_id", brand_id)
      .eq("group_type", "product");

    if (mErr) { setLinkStatus("Link removed but markers error: " + mErr.message); return; }

    // Update card UI
    const card = document.getElementById(`brandCard_${brand_id}`);
    if (card) {
      card.classList.remove("linked");
      card.querySelector(".brand-check-status").textContent = "Not linked";
    }
    setLinkStatus("Link removed ✅ Markers deactivated.");
  }

  // Reload the links data silently
  const { data } = await sb
    .from("category_brands")
    .select("id,brand_id,is_active")
    .eq("category_id", category_id);
  ALL_CATEGORY_BRANDS = data || [];
}

/* ══════════════════════════════
   MARKER CATEGORIES (multi-category management)
══════════════════════════════ */

let MC_MARKER_ID = null;
let MC_MARKER_TITLE = "";
let MC_CURRENT = []; // current marker_categories rows

function setMcStatus(msg) {
  const el = document.getElementById("mcStatus");
  if (el) el.textContent = msg || "";
}

async function loadMarkerForCategories() {
  const input = document.getElementById("mcMarkerSearch").value.trim();
  if (!input) { setMcStatus("Enter a marker title to search."); return; }
  setMcStatus("Searching…");

  const { data, error } = await sb
    .from("markers")
    .select("id,title,category_id,group_type,is_active")
    .ilike("title", `%${input}%`)
    .eq("is_active", true)
    .limit(10);

  if (error) { setMcStatus("Error: " + error.message); return; }
  if (!data?.length) { setMcStatus("No markers found."); document.getElementById("mcResults").innerHTML = ""; return; }

  document.getElementById("mcResults").innerHTML = data.map(m => `
    <div class="mc-result-row">
      <span>${escapeHtml(m.title)}</span>
      <button onclick="selectMarkerForMC('${escapeHtml(m.id)}', '${escapeHtml(m.title.replace(/'/g,"&#39;"))}')">Manage categories</button>
    </div>
  `).join("");
  setMcStatus(`${data.length} marker(s) found.`);
}

async function selectMarkerForMC(markerId, markerTitle) {
  MC_MARKER_ID = markerId;
  MC_MARKER_TITLE = markerTitle;
  setMcStatus("Loading categories…");
  document.getElementById("mcPanel").style.display = "block";
  document.getElementById("mcPanelTitle").textContent = `Categories for: ${markerTitle}`;

  const { data, error } = await sb
    .from("marker_categories")
    .select("id,category_id,is_primary,is_active")
    .eq("marker_id", markerId);

  if (error) { setMcStatus("Error: " + error.message); return; }
  MC_CURRENT = data || [];

  renderMCPanel();
  setMcStatus("");
}

function renderMCPanel() {
  const linkedIds = new Set(MC_CURRENT.filter(r => r.is_active).map(r => r.category_id));
  const primaryId = MC_CURRENT.find(r => r.is_primary && r.is_active)?.category_id;
  // Show all active place categories
  const allCats = ALL_CATEGORIES.filter(c => c.is_active && c.for_places);

  if (!allCats.length) {
    document.getElementById("mcCatList").innerHTML = `<p class="muted">No place categories loaded. Try reopening this section.</p>`;
    return;
  }

  document.getElementById("mcCatList").innerHTML = allCats.map(c => {
    const isLinked = linkedIds.has(c.id);
    const isPrimary = c.id === primaryId;
    return `
      <label class="brand-check-card ${isLinked ? "linked" : ""}">
        <input type="checkbox" ${isLinked ? "checked" : ""} onchange="toggleMarkerCategory(${c.id}, this.checked)" />
        <div>
          <div class="brand-check-name">${escapeHtml(c.name)} ${isPrimary ? "⭐ primary" : ""}</div>
          <div class="brand-check-status">${isLinked ? "✓ Linked" : "Not linked"}</div>
        </div>
      </label>
    `;
  }).join("");
}

async function toggleMarkerCategory(category_id, shouldLink) {
  if (!MC_MARKER_ID) return;
  setMcStatus("Saving…");

  const existing = MC_CURRENT.find(r => r.category_id === category_id);

  if (shouldLink) {
    if (existing) {
      await sb.from("marker_categories").update({ is_active: true }).eq("id", existing.id);
    } else {
      await sb.from("marker_categories").insert([{ marker_id: MC_MARKER_ID, category_id, is_primary: false, is_active: true }]);
    }
  } else {
    if (existing) {
      if (existing.is_primary) { setMcStatus("Cannot remove primary category. Change primary first."); renderMCPanel(); return; }
      await sb.from("marker_categories").update({ is_active: false }).eq("id", existing.id);
    }
  }

  // Reload
  const { data } = await sb.from("marker_categories").select("id,category_id,is_primary,is_active").eq("marker_id", MC_MARKER_ID);
  MC_CURRENT = data || [];
  renderMCPanel();
  setMcStatus("Saved ✅ — " + (shouldLink ? "category linked" : "category unlinked"));
}

/* ══════════════════════════════
   CHAINS MANAGEMENT
══════════════════════════════ */

let ALL_CHAINS = [];
let CHAIN_MARKER_ID = null;
let CHAIN_MARKER_TITLE = "";

function setChainsStatus(msg) {
  const el = document.getElementById("chainsStatus");
  if (el) el.textContent = msg || "";
}

// Load all chains and render table
async function loadChains() {
  setChainsStatus("Loading…");
  const { data, error } = await sb.from("chains")
    .select("id,name,is_active,created_at")
    .order("name", { ascending: true });
  if (error) { setChainsStatus("Error: " + error.message); return; }
  ALL_CHAINS = data || [];
  renderChainsTable();
  setChainsStatus(`${ALL_CHAINS.length} chain(s).`);
}

function renderChainsTable() {
  const wrap = document.getElementById("chainsTable");
  if (!ALL_CHAINS.length) { wrap.innerHTML = `<p class="muted">No chains yet.</p>`; return; }
  wrap.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>ID</th><th>Name</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        ${ALL_CHAINS.map(c => `
          <tr class="${c.is_active ? "" : "inactive"}">
            <td>${c.id}</td>
            <td><b>${escapeHtml(c.name)}</b></td>
            <td><span class="pill ${c.is_active ? "pill-active" : "pill-inactive"}">${c.is_active ? "Active" : "Inactive"}</span></td>
            <td><div class="row-actions">
              <button onclick="editChain(${c.id})">Edit</button>
              ${c.is_active
                ? `<button style="border-color:#ef4444;color:#ef4444;" onclick="deactivateChain(${c.id})">Deactivate</button>`
                : `<button onclick="reactivateChain(${c.id})">Reactivate</button>`}
            </div></td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

function openNewChainModal() {
  document.getElementById("chain_id").value = "";
  document.getElementById("chain_name").value = "";
  document.getElementById("chainModalTitle").textContent = "New Chain";
  document.getElementById("chainModalStatus").textContent = "";
  openModal("chainModal");
}

function editChain(id) {
  const c = ALL_CHAINS.find(x => x.id === id);
  if (!c) return;
  document.getElementById("chain_id").value = c.id;
  document.getElementById("chain_name").value = c.name;
  document.getElementById("chainModalTitle").textContent = "Edit Chain";
  document.getElementById("chainModalStatus").textContent = "";
  openModal("chainModal");
}

async function saveChain() {
  const id = parseInt(document.getElementById("chain_id").value) || null;
  const name = document.getElementById("chain_name").value.trim();
  const statusEl = document.getElementById("chainModalStatus");
  if (!name) { statusEl.textContent = "Name is required."; return; }
  statusEl.textContent = "Saving…";
  if (id) {
    const { error } = await sb.from("chains").update({ name }).eq("id", id);
    if (error) { statusEl.textContent = "Error: " + error.message; return; }
  } else {
    const { error } = await sb.from("chains").insert([{ name, is_active: true }]);
    if (error) { statusEl.textContent = "Error: " + error.message; return; }
  }
  closeModal("chainModal");
  await loadChains();
}

async function deactivateChain(id) {
  const c = ALL_CHAINS.find(x => x.id === id);
  confirm("Deactivate Chain", `Deactivate "${c?.name}"?`, async () => {
    await sb.from("chains").update({ is_active: false }).eq("id", id);
    await loadChains();
  });
}

async function reactivateChain(id) {
  await sb.from("chains").update({ is_active: true }).eq("id", id);
  await loadChains();
}

// Assign a marker to a chain
async function loadMarkerForChain() {
  const input = document.getElementById("chainMarkerSearch").value.trim();
  if (!input) { setChainsStatus("Enter a marker title to search."); return; }
  setChainsStatus("Searching…");
  const { data, error } = await sb.from("markers")
    .select("id,title,chain_id,group_type,is_active")
    .ilike("title", `%${input}%`).eq("is_active", true).eq("group_type", "place").limit(10);
  if (error) { setChainsStatus("Error: " + error.message); return; }
  if (!data?.length) { setChainsStatus("No places found."); document.getElementById("chainMarkerResults").innerHTML = ""; return; }

  document.getElementById("chainMarkerResults").innerHTML = data.map(m => {
    const currentChain = ALL_CHAINS.find(c => c.id === m.chain_id);
    return `
      <div class="mc-result-row">
        <span>${escapeHtml(m.title)} ${currentChain ? `<span class="muted">(${escapeHtml(currentChain.name)})</span>` : ""}</span>
        <button onclick="selectMarkerForChain('${escapeHtml(m.id)}','${escapeHtml(m.title.replace(/'/g,"&#39;"))}',${m.chain_id || "null"})">Assign chain</button>
      </div>`;
  }).join("");
  setChainsStatus(`${data.length} place(s) found.`);
}

async function selectMarkerForChain(markerId, markerTitle, currentChainId) {
  CHAIN_MARKER_ID = markerId;
  CHAIN_MARKER_TITLE = markerTitle;
  const panel = document.getElementById("chainAssignPanel");
  panel.style.display = "block";
  document.getElementById("chainAssignTitle").textContent = `Assign chain to: ${markerTitle}`;

  const sel = document.getElementById("chainAssignSelect");
  sel.innerHTML = `<option value="">— No chain —</option>` +
    ALL_CHAINS.filter(c => c.is_active).map(c =>
      `<option value="${c.id}" ${c.id === currentChainId ? "selected" : ""}>${escapeHtml(c.name)}</option>`
    ).join("");
}

async function saveMarkerChain() {
  const chainId = parseInt(document.getElementById("chainAssignSelect").value) || null;
  const chainName = chainId
    ? ALL_CHAINS.find(c => c.id === chainId)?.name || "selected chain"
    : "no chain";
  const { error } = await sb.from("markers").update({ chain_id: chainId }).eq("id", CHAIN_MARKER_ID);
  if (error) { setChainsStatus("Error: " + error.message); return; }
  document.getElementById("chainAssignPanel").style.display = "none";
  document.getElementById("chainMarkerResults").innerHTML = "";
  document.getElementById("chainMarkerSearch").value = "";
  const msg = chainId
    ? `✅ "${CHAIN_MARKER_TITLE}" assigned to ${chainName}`
    : `✅ Chain removed from "${CHAIN_MARKER_TITLE}"`;
  setChainsStatus(msg);
  CHAIN_MARKER_ID = null;
  CHAIN_MARKER_TITLE = "";
}

/* ══════════════════════════════════════
   BATTLES ADMIN
══════════════════════════════════════ */

async function loadBattlesAdmin() {
  const { data: battles, error } = await sb
    .from('battles')
    .select('*')
    .order('position', { ascending: true });

  const sub  = document.getElementById('battlesAdminSub');
  const list = document.getElementById('battlesAdminList');
  if (!list) return;

  if (error || !battles) {
    sub.textContent = 'Error loading';
    list.innerHTML = '<p class="muted">Could not load battles.</p>';
    return;
  }

  sub.textContent = `${battles.length} battle${battles.length !== 1 ? 's' : ''}`;

  if (!battles.length) {
    list.innerHTML = '<p class="muted" style="padding:12px 0;">No battles yet. Create the first one!</p>';
    return;
  }

  list.innerHTML = `
    <table class="table" style="margin-top:8px;">
      <thead>
        <tr>
          <th>#</th>
          <th>Question</th>
          <th>Option A</th>
          <th>Option B</th>
          <th>Active</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${battles.map(b => `
          <tr>
            <td style="color:var(--muted);font-size:12px;">${b.position ?? '—'}</td>
            <td style="font-weight:600;">${escapeHtml(b.question)}</td>
            <td>${escapeHtml(b.option_a)}</td>
            <td>${escapeHtml(b.option_b)}</td>
            <td>${b.is_active ? '✅' : '❌'}</td>
            <td>
              <div style="display:flex;gap:6px;">
                <button class="tba-btn" onclick="openBattleModal('${b.id}')">Edit</button>
                <button class="tba-btn tba-btn-danger" onclick="toggleBattleActive('${b.id}', ${b.is_active})">
                  ${b.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

async function openBattleModal(battleId) {
  document.getElementById('battleModalTitle').textContent = battleId ? 'Edit Battle' : 'New Battle';
  document.getElementById('battle_id').value       = battleId || '';
  document.getElementById('battle_question').value = '';
  document.getElementById('battle_option_a').value = '';
  document.getElementById('battle_option_b').value = '';
  document.getElementById('battle_position').value = '';
  document.getElementById('battleModalStatus').textContent = '';

  if (battleId) {
    const { data } = await sb.from('battles').select('*').eq('id', battleId).single();
    if (data) {
      document.getElementById('battle_question').value = data.question || '';
      document.getElementById('battle_option_a').value = data.option_a || '';
      document.getElementById('battle_option_b').value = data.option_b || '';
      document.getElementById('battle_position').value = data.position ?? '';
    }
  }

  document.getElementById('battleModal').style.display = 'flex';
}

async function saveBattle() {
  const id       = document.getElementById('battle_id').value.trim();
  const question = document.getElementById('battle_question').value.trim();
  const option_a = document.getElementById('battle_option_a').value.trim();
  const option_b = document.getElementById('battle_option_b').value.trim();
  const position = parseInt(document.getElementById('battle_position').value) || null;
  const status   = document.getElementById('battleModalStatus');

  if (!question || !option_a || !option_b) {
    status.textContent = 'Question and both options are required.';
    return;
  }

  const payload = { question, option_a, option_b, position };
  let error;

  if (id) {
    ({ error } = await sb.from('battles').update(payload).eq('id', id));
  } else {
    ({ error } = await sb.from('battles').insert({ ...payload, is_active: true }));
  }

  if (error) { status.textContent = 'Error: ' + error.message; return; }

  closeModal('battleModal');
  loadBattlesAdmin();
}

async function toggleBattleActive(battleId, currentActive) {
  await sb.from('battles').update({ is_active: !currentActive }).eq('id', battleId);
  loadBattlesAdmin();
}
