/* ══════════════════════════════════════════════════════
   SEARCH BAR — searchbar.js
   Self-injecting global search. Desktop: icon + input.
   Mobile: icon only → tap expands full-width bar.
══════════════════════════════════════════════════════ */
(function() {
  let debounceTimer = null;

  function init() {
    const navRight = document.querySelector('.nav-right');
    if (!navRight || document.getElementById('sbWrap')) return;

    // Build search UI
    const wrap = document.createElement('div');
    wrap.id = 'sbWrap';
    wrap.className = 'sb-wrap';
    wrap.innerHTML = `
      <button class="sb-icon-btn" id="sbIconBtn" aria-label="Search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      </button>
      <input class="sb-input" id="sbInput" type="search" placeholder="Search places…" autocomplete="off" />
      <div class="sb-results" id="sbResults"></div>
    `;
    navRight.insertBefore(wrap, navRight.firstChild);

    const input = document.getElementById('sbInput');
    const iconBtn = document.getElementById('sbIconBtn');
    const results = document.getElementById('sbResults');

    // Icon click (mobile) — toggle expanded state
    iconBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (window.innerWidth <= 768) {
        const isOpen = wrap.classList.toggle('sb-open');
        if (isOpen) setTimeout(() => input.focus(), 80);
        else { input.value = ''; results.style.display = 'none'; }
      } else {
        input.focus();
      }
    });

    // Typing
    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const q = input.value.trim();
      if (q.length < 2) { results.style.display = 'none'; return; }
      debounceTimer = setTimeout(() => search(q), 280);
    });

    // Escape closes
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeAll();
    });

    // Click outside closes
    document.addEventListener('click', e => {
      if (!e.target.closest('.sb-wrap')) closeAll();
    });

    function closeAll() {
      results.style.display = 'none';
      wrap.classList.remove('sb-open');
      input.value = '';
      input.blur();
    }
  }

  async function search(q) {
    const results = document.getElementById('sbResults');
    results.style.display = 'block';
    results.innerHTML = '<div class="sb-status">Searching…</div>';

    try {
      if (typeof sb === 'undefined') throw new Error('no client');

      const [{ data: markers }, { data: cats }] = await Promise.all([
        sb.from('markers')
          .select('id,title,group_type,rating_avg,rating_count,city')
          .eq('is_active', true)
          .ilike('title', '%' + q + '%')
          .order('rating_count', { ascending: false })
          .limit(6),
        sb.from('categories')
          .select('id,name,icon_url')
          .eq('is_active', true)
          .ilike('name', '%' + q + '%')
          .limit(3)
      ]);

      const rows = [];

      (cats || []).forEach(c => {
        const ic = c.icon_url
          ? '<img src="' + escAttr(c.icon_url) + '" class="sb-r-img">'
          : '<span class="sb-r-emoji">🏷</span>';
        rows.push(
          '<a class="sb-result" href="map.html?category=' + c.id + '">' +
            '<span class="sb-r-icon">' + ic + '</span>' +
            '<span class="sb-r-body"><span class="sb-r-title">' + escHtml(c.name) + '</span>' +
            '<span class="sb-r-sub">Category · see all places</span></span>' +
          '</a>'
        );
      });

      (markers || []).forEach(m => {
        const city = m.city === 'BCN' ? 'Barcelona' : m.city === 'MAD' ? 'Madrid' : (m.city || '');
        const score = m.rating_count > 0 ? Number(m.rating_avg).toFixed(1) + ' ★' : '';
        const sub = [city, score].filter(Boolean).join(' · ');
        const emoji = m.group_type === 'product' ? '📦' : '📍';
        rows.push(
          '<a class="sb-result" href="marker.html?id=' + m.id + '">' +
            '<span class="sb-r-icon"><span class="sb-r-emoji">' + emoji + '</span></span>' +
            '<span class="sb-r-body"><span class="sb-r-title">' + escHtml(m.title) + '</span>' +
            (sub ? '<span class="sb-r-sub">' + escHtml(sub) + '</span>' : '') + '</span>' +
          '</a>'
        );
      });

      results.innerHTML = rows.length
        ? rows.join('')
        : '<div class="sb-status">No results found</div>';

    } catch(e) {
      results.innerHTML = '<div class="sb-status">Search unavailable</div>';
    }
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function escAttr(s) {
    return escHtml(s).replace(/"/g,'&quot;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
