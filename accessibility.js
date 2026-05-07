/* ── Colorblind mode — shared across all pages ── */

function isColorblind() {
  return localStorage.getItem('tba_colorblind') === '1';
}

function applyColorblindMode() {
  if (isColorblind()) {
    document.body.classList.add('colorblind');
  } else {
    document.body.classList.remove('colorblind');
  }
}

function toggleColorblindMode() {
  const next = !isColorblind();
  localStorage.setItem('tba_colorblind', next ? '1' : '0');
  applyColorblindMode();
  // Re-render map markers if present
  if (typeof refreshMapMarkers === 'function') refreshMapMarkers();
  // Re-render products if present
  if (typeof renderAll === 'function') renderAll();
  // Update all toggles on the page
  document.querySelectorAll('.cb-toggle-input').forEach(el => {
    el.checked = next;
  });
}

// Apply on every page load immediately
(function() { applyColorblindMode(); })();
