/* ══════════════════════════════════════════
   GLOBAL SEARCH
══════════════════════════════════════════ */
let _gsDebounce = null;

function openGlobalSearch() {
  document.getElementById('gsOverlay').classList.add('gs-open');
  setTimeout(() => document.getElementById('gsInput')?.focus(), 60);
}

function closeGlobalSearch() {
  document.getElementById('gsOverlay').classList.remove('gs-open');
  document.getElementById('gsInput').value = '';
  document.getElementById('gsResults').style.display = 'none';
}

function initGlobalSearch() {
  const input = document.getElementById('gsInput');
  if (!input) return;

  input.addEventListener('input', () => {
    clearTimeout(_gsDebounce);
    const q = input.value.trim();
    if (q.length < 2) {
      document.getElementById('gsResults').style.display = 'none';
      return;
    }
    _gsDebounce = setTimeout(() => runSearch(q), 280);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeGlobalSearch();
  });
}

async function runSearch(q) {
  const box = document.getElementById('gsResults');
  box.style.display = 'block';
  box.innerHTML = '<div class="gs-status">Searching…</div>';

  try {
    const [{ data: markers }, { data: cats }] = await Promise.all([
      sb.from('markers')
        .select('id,title,group_type,rating_avg,rating_count,city')
        .eq('is_active', true)
        .ilike('title', `%${q}%`)
        .order('rating_count', { ascending: false })
        .limit(7),
      sb.from('categories')
        .select('id,name,icon_url')
        .eq('is_active', true)
        .ilike('name', `%${q}%`)
        .limit(3)
    ]);

    const items = [];

    (cats || []).forEach(c => items.push({
      icon: c.icon_url
        ? `<img src="${c.icon_url}" class="gs-icon-img" onerror="this.style.display='none'">`
        : '🏷',
      title: c.name,
      sub: 'Category',
      url: `map.html?category=${c.id}`
    }));

    (markers || []).forEach(m => {
      const city = m.city === 'BCN' ? 'Barcelona' : m.city === 'MAD' ? 'Madrid' : (m.city || '');
      const score = m.rating_count > 0 ? `${Number(m.rating_avg).toFixed(1)} ★` : '';
      items.push({
        icon: m.group_type === 'product' ? '📦' : '📍',
        title: m.title,
        sub: [city, score].filter(Boolean).join(' · '),
        url: `marker.html?id=${m.id}`
      });
    });

    if (!items.length) {
      box.innerHTML = '<div class="gs-status">No results found</div>';
      return;
    }

    box.innerHTML = items.map(it => `
      <a class="gs-result" href="${it.url}" onclick="closeGlobalSearch()">
        <span class="gs-result-icon">${it.icon}</span>
        <span class="gs-result-body">
          <span class="gs-result-title">${esc(it.title)}</span>
          ${it.sub ? `<span class="gs-result-sub">${it.sub}</span>` : ''}
        </span>
      </a>`).join('');

  } catch(e) {
    box.innerHTML = '<div class="gs-status">Search unavailable</div>';
  }
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
