// login.js — login + register with display name + email confirmation

function showTab(tab) {
  const isLogin = tab === "login";
  document.getElementById("loginForm").style.display    = isLogin ? "block" : "none";
  document.getElementById("registerForm").style.display = isLogin ? "none"  : "block";
  document.getElementById("confirmSent").style.display  = "none";
  document.getElementById("tabLogin").classList.toggle("active", isLogin);
  document.getElementById("tabRegister").classList.toggle("active", !isLogin);
  document.getElementById("loginStatus").textContent    = "";
  document.getElementById("registerStatus").textContent = "";
}

async function doLogin() {
  const statusEl = document.getElementById("loginStatus");
  const email    = document.getElementById("l_email").value.trim();
  const password = document.getElementById("l_password").value;

  if (!email || !password) { statusEl.textContent = "Email and password are required."; return; }

  statusEl.className = "auth-status";
  statusEl.textContent = "Signing in…";

  const { error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.includes("Email not confirmed")) {
      statusEl.textContent = "Please confirm your email first — check your inbox.";
    } else if (error.message.includes("Invalid login")) {
      statusEl.textContent = "Wrong email or password.";
    } else {
      statusEl.textContent = error.message;
    }
    return;
  }

  statusEl.className = "auth-status success";
  statusEl.textContent = "Signed in ✅ Redirecting…";

  // Claim any anonymous battle votes made before login
  const { data } = await sb.auth.getSession();
  if (data?.session?.user) await migrateVisitorVotes(data.session.user.id);

  const redirect = new URLSearchParams(window.location.search).get("redirect") || "index.html";
  window.location.href = redirect;
}

async function doRegister() {
  const statusEl  = document.getElementById("registerStatus");
  const name      = document.getElementById("r_name").value.trim();
  const email     = document.getElementById("r_email").value.trim();
  const password  = document.getElementById("r_password").value;
  const password2 = document.getElementById("r_password2").value;

  if (!name)    { statusEl.textContent = "Display name is required."; return; }
  if (!email)   { statusEl.textContent = "Email is required."; return; }
  if (!password){ statusEl.textContent = "Password is required."; return; }
  if (password.length < 6) { statusEl.textContent = "Password must be at least 6 characters."; return; }
  if (password !== password2) { statusEl.textContent = "Passwords don't match."; return; }

  statusEl.className = "auth-status";
  statusEl.textContent = "Creating account…";

  const { error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { display_name: name } }
  });

  if (error) {
    statusEl.textContent = error.message.includes("already registered")
      ? "This email is already registered. Try signing in."
      : error.message;
    return;
  }

  document.getElementById("registerForm").style.display = "none";
  document.getElementById("confirmSent").style.display  = "block";
  document.getElementById("confirmEmail").textContent   = email;
  document.getElementById("tabRegister").classList.remove("active");
}

document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const loginVisible = document.getElementById("loginForm").style.display !== "none";
  if (loginVisible) doLogin();
  else doRegister();
});

async function checkAlreadyLoggedIn() {
  const user = await maybeUser();
  if (user) window.location.href = "index.html";
}

function showForgot() {
  const sec = document.getElementById('forgotSection');
  if (!sec) return;
  sec.style.display = sec.style.display === 'none' ? 'block' : 'none';
  if (sec.style.display === 'block') {
    // Pre-fill email from login field if typed
    const email = document.getElementById('l_email')?.value?.trim();
    if (email) document.getElementById('f_email').value = email;
    document.getElementById('f_email').focus();
  }
}

async function doForgot() {
  const email = document.getElementById('f_email').value.trim();
  const status = document.getElementById('forgotStatus');
  if (!email) { status.textContent = 'Please enter your email.'; return; }

  status.textContent = 'Sending…';
  status.style.color = 'var(--muted)';

  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/reset-password.html'
  });

  if (error) {
    status.style.color = '#c0392b';
    status.textContent = error.message || 'Something went wrong.';
    return;
  }

  status.style.color = '#2e7d4f';
  status.textContent = '✅ Reset link sent — check your inbox.';
  document.getElementById('f_email').disabled = true;
  document.querySelector('#forgotSection .auth-btn').disabled = true;
}
