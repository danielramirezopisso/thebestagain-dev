/* ══════════════════════════════════════════════════════
   GLOBAL SEARCH — search.js
   Searches markers + categories across all pages
══════════════════════════════════════════════════════ */

let _searchDebounce = null;
let _searchOpen = false;

function initGlobalSearch() {
  const input = document.getElementById('globalSearchInput');
  const results = document.getElementById('globalSearchResults');
  if (!input || !results) return;

  input.addEventListener('input', () => {
    clearTimeout(_searchDebounce);
    const q = input.value.trim();
    if (q.length < 2) { results.style.display = 'none'; return; }
    _searchDebounce = setTimeout(() => runGlobalSearch(q), 280);
  });

  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 2) results.style.display = 'block';
  });

  // Close on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.gs-wrap')) {
      results.style.display = 'none';
    }
  });

  // Escape to close
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { results.style.display = 'none'; input.blur(); }
  });
}

async function runGlobalSearch(q) {
  const results = document.getElementById('globalSearchResults');
  if (!results) return;
  results.style.display = 'block';
  results.innerHTML = '<div class="gs-loading">Searching…</div>';

  try {
    // Search markers (places + products)
    const { data: markers } = await sb.from('markers')
      .select('id, title, group_type, category_id, rating_avg, rating_count, city')
      .eq('is_active', true)
      .ilike('title', `%${q}%`)
      .order('rating_count', { ascending: false })
      .limit(7);

    // Search categories
    const { data: cats } = await sb.from('categories')
      .select('id, name, icon_url, for_places, for_products')
      .eq('is_active', true)
      .ilike('name', `%${q}%`)
      .limit(3);

    const items = [];

    // Categories first
    (cats || []).forEach(c => {
      items.push({
        type: 'category',
        id: c.id,
        title: c.name,
        sub: c.for_places ? 'Category · Places' : 'Category · Products',
        icon: c.icon_url,
        url: `map.html?category=${c.id}`
      });
    });

    // Markers
    (markers || []).forEach(m => {
      const cityLabel = m.city === 'BCN' ? 'Barcelona' : m.city === 'MAD' ? 'Madrid' : m.city || '';
      const score = m.rating_count > 0 ? Number(m.rating_avg).toFixed(1) : null;
      items.push({
        type: m.group_type,
        id: m.id,
        title: m.title,
        sub: [cityLabel, score ? `⭐ ${score}` : null].filter(Boolean).join(' · '),
        url: `marker.html?id=${m.id}`
      });
    });

    if (!items.length) {
      results.innerHTML = '<div class="gs-empty">No results found</div>';
      return;
    }

    results.innerHTML = items.map(item => {
      const icon = item.type === 'category'
        ? (item.icon ? `<img src="${item.icon}" class="gs-icon-img" onerror="this.style.display='none'" />` : '🏷')
        : item.type === 'product' ? '📦' : '📍';
      return `<a class="gs-result" href="${item.url}">
        <span class="gs-result-icon">${icon}</span>
        <span class="gs-result-body">
          <span class="gs-result-title">${escapeHtmlSearch(item.title)}</span>
          ${item.sub ? `<span class="gs-result-sub">${item.sub}</span>` : ''}
        </span>
      </a>`;
    }).join('');

  } catch(e) {
    results.innerHTML = '<div class="gs-empty">Search unavailable</div>';
  }
}

function escapeHtmlSearch(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function toggleGlobalSearch() {
  const wrap = document.getElementById('globalSearchWrap');
  const input = document.getElementById('globalSearchInput');
  if (!wrap) return;
  _searchOpen = !_searchOpen;
  wrap.classList.toggle('gs-open', _searchOpen);
  if (_searchOpen) setTimeout(() => input?.focus(), 50);
  else {
    document.getElementById('globalSearchResults').style.display = 'none';
    if (input) input.value = '';
  }
}
