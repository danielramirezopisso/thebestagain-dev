// auth.js — shared auth helpers

const SUPABASE_URL = "https://pwlskdjmgqxikbamfshj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_OIK8RJ8IZgHY0MW6FKqD6Q_yOm4YcmA";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function maybeUser() {
  const { data } = await sb.auth.getSession();
  return data.session?.user || null;
}

async function requireAuth() {
  const user = await maybeUser();
  if (!user) {
    window.location.href = "login.html";
    return null;
  }
  return user;
}

async function logout() {
  await sb.auth.signOut();
  window.location.href = "login.html";
}

/* ══════════════════════════════════════
   SOFT LOGIN NUDGE
   Call softLoginNudge(message) instead of
   requireAuth() to show a modal instead
   of hard-redirecting.
   Returns true if user is logged in,
   false if nudge was shown.
══════════════════════════════════════ */
async function softLoginNudge(message) {
  const user = await maybeUser();
  if (user) return true;

  // Inject modal if not already present
  if (!document.getElementById('tba-login-nudge')) {
    const el = document.createElement('div');
    el.id = 'tba-login-nudge';
    el.innerHTML = `
      <div class="tba-nudge-backdrop" onclick="closeSoftNudge()"></div>
      <div class="tba-nudge-sheet">
        <button class="tba-nudge-close" onclick="closeSoftNudge()">✕</button>
        <div class="tba-nudge-icon">⭐</div>
        <p class="tba-nudge-msg" id="tba-nudge-msg"></p>
        <a class="tba-btn tba-btn-primary tba-nudge-cta" id="tba-nudge-login">Sign in</a>
        <a class="tba-nudge-secondary" id="tba-nudge-register">Create a free account</a>
        <p class="tba-nudge-skip" onclick="closeSoftNudge()">Maybe later</p>
      </div>
    `;
    document.body.appendChild(el);
  }

  // Set message and redirect targets
  const redirect = encodeURIComponent(window.location.href);
  document.getElementById('tba-nudge-msg').textContent      = message || 'Sign in to save your progress and vote on your favourites.';
  document.getElementById('tba-nudge-login').href           = `login.html?redirect=${redirect}`;
  document.getElementById('tba-nudge-register').href        = `login.html?redirect=${redirect}&mode=register`;

  // Show
  const nudge = document.getElementById('tba-login-nudge');
  nudge.classList.add('tba-nudge-visible');
  document.body.style.overflow = 'hidden';

  return false;
}

function closeSoftNudge() {
  const nudge = document.getElementById('tba-login-nudge');
  if (nudge) nudge.classList.remove('tba-nudge-visible');
  document.body.style.overflow = '';
}

/* ══════════════════════════════════════
   VISITOR_ID → USER_ID MIGRATION
   Call after successful login to claim
   any anonymous battle votes.
══════════════════════════════════════ */
async function migrateVisitorVotes(userId) {
  try {
    const visitorId = localStorage.getItem('tba_visitor_id');
    if (!visitorId || !userId) return;
    // Update all anon votes for this visitor to the now-known user_id
    // ON CONFLICT DO NOTHING — if they already have a user vote for that battle, skip
    await sb.from('battle_votes')
      .update({ user_id: userId })
      .eq('visitor_id', visitorId)
      .is('user_id', null);
  } catch (e) {
    // Silent fail — not critical
  }
}
