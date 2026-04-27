// claim.js — Claim your place page

const SUPABASE_STORAGE = 'https://pwlskdjmgqxikbamfshj.supabase.co/storage/v1/object/public/marker-photos/';

function escapeHtml(s) {
  return String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;')
    .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");
}

function qp(name) {
  return new URLSearchParams(window.location.search).get(name);
}

async function initClaimPage() {
  const markerId = qp('id');

  // Pre-fill email if logged in
  const user = await maybeUser();
  if (user?.email) {
    const emailEl = document.getElementById('claimEmail');
    if (emailEl) emailEl.value = user.email;
  }

  if (!markerId) return; // generic page, no context

  // Load marker data
  const { data: m, error } = await sb.from('markers')
    .select('id,title,address,rating_avg,rating_count,category_id')
    .eq('id', markerId).single();

  if (error || !m) return;

  // Store for form submission
  document.getElementById('claimMarkerId').value = m.id;
  document.getElementById('claimMarkerName').value = m.title;
  document.getElementById('claimBusiness').value = m.title;

  // Update hero copy
  document.getElementById('claimHeroTitle').textContent = `Claim ${m.title}.`;
  document.getElementById('claimHeroSub').textContent =
    `${m.title} is already on The Best Again${m.rating_count > 0 ? ` with a ${Number(m.rating_avg).toFixed(1)}/10 rating` : ''}. Take control of your listing and make the most of your presence.`;

  // Show context banner
  const ctx = document.getElementById('claimContext');
  ctx.style.display = 'block';
  document.getElementById('claimContextName').textContent = m.title;

  const meta = [];
  if (m.address) meta.push('📍 ' + m.address.split(',').slice(0, 2).join(','));
  if (m.rating_count > 0) meta.push(`⭐ ${Number(m.rating_avg).toFixed(1)}/10`);
  document.getElementById('claimContextMeta').textContent = meta.join('  ·  ');

  // Load first photo for context banner
  const { data: photos } = await sb.from('marker_photos')
    .select('storage_path').eq('marker_id', markerId)
    .eq('is_active', true).order('created_at').limit(1);

  const photoWrap = document.getElementById('claimContextPhoto');
  if (photos?.length) {
    const url = SUPABASE_STORAGE + encodeURIComponent(photos[0].storage_path).replace(/%2F/g, '/');
    photoWrap.innerHTML = `<img src="${escapeHtml(url)}" alt="" />`;
  } else {
    // Show category icon as fallback
    const { data: cat } = await sb.from('categories')
      .select('icon_url').eq('id', m.category_id).single();
    if (cat?.icon_url) {
      photoWrap.innerHTML = `<img src="${escapeHtml(cat.icon_url)}" alt="" style="width:100%;height:100%;object-fit:contain;padding:10px;" />`;
    }
  }
}

/* ══════════════════════════════
   SUBMIT CLAIM
══════════════════════════════ */
async function submitClaim() {
  const name     = document.getElementById('claimName').value.trim();
  const business = document.getElementById('claimBusiness').value.trim();
  const email    = document.getElementById('claimEmail').value.trim();
  const phone    = document.getElementById('claimPhone').value.trim();
  const message  = document.getElementById('claimMessage').value.trim();
  const markerId = document.getElementById('claimMarkerId').value || null;
  const markerName = document.getElementById('claimMarkerName').value || business;

  const status = document.getElementById('claimStatus');
  status.className = 'claim-status';

  if (!name)  { status.className += ' error'; status.textContent = 'Please enter your name.'; return; }
  if (!email || !email.includes('@')) { status.className += ' error'; status.textContent = 'Please enter a valid email.'; return; }

  status.textContent = 'Sending…';

  // Build a rich message for your records
  const fullMessage = [
    `Business: ${business}`,
    `Contact: ${name}`,
    phone ? `Phone: ${phone}` : '',
    markerName ? `Marker: ${markerName}` : '',
    message ? `Note: ${message}` : '',
  ].filter(Boolean).join('\n');

  const { error } = await sb.from('business_interest').insert([{
    marker_id: markerId,
    email,
    contact_name: name,
    phone: phone || null,
    notes: fullMessage,
  }]);

  // Fallback if columns don't exist yet
  if (error) {
    await sb.from('feature_requests').insert([{
      type: 'claim_business',
      text: fullMessage,
      email,
      user_id: null,
    }]);
  }

  // Show thanks regardless (we always want them to feel heard)
  if (typeof gtag !== "undefined") {
    gtag("event", "claim_started", {
      marker_id:   markerId || "",
      marker_name: markerName || ""
    });
  }
  document.getElementById('claimFormSection').querySelector('.claim-form').style.display = 'none';
  document.getElementById('claimFormSection').querySelector('.claim-form-sub').style.display = 'none';
  document.getElementById('claimFormSection').querySelector('.claim-form-title').style.display = 'none';
  document.getElementById('claimThanks').style.display = 'block';
}

/* ══════════════════════════════
   SUBMIT ADD PLACE
══════════════════════════════ */
async function submitAddPlace() {
  const name    = document.getElementById('addPlaceName').value.trim();
  const address = document.getElementById('addPlaceAddress').value.trim();
  const email   = document.getElementById('addPlaceEmail').value.trim();
  const status  = document.getElementById('addPlaceStatus');

  status.className = 'claim-status';

  if (!name)  { status.className += ' error'; status.textContent = 'Please enter the place name.'; return; }
  if (!email || !email.includes('@')) { status.className += ' error'; status.textContent = 'Please enter your email.'; return; }

  status.textContent = 'Sending…';

  await sb.from('feature_requests').insert([{
    type: 'add_place',
    text: `Place: ${name}\nAddress: ${address}\nContact: ${email}`,
    email,
    user_id: null,
  }]);

  status.className += ' success';
  status.textContent = '✅ Got it! We\'ll add it and let you know.';
  document.getElementById('addPlaceName').value = '';
  document.getElementById('addPlaceAddress').value = '';
  document.getElementById('addPlaceEmail').value = '';
}
