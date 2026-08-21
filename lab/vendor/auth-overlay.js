/* =============================================================
 * ROOSTER — SUPABASE MAGIC-LINK AUTH OVERLAY
 * Ported from comms-platform/mba-supabase.js (auth layer only).
 * =============================================================
 *
 * Drop-in gate for a static site. No build step, no framework.
 *
 * USAGE — in <head>, in this order:
 *   <link rel="stylesheet" href="auth-overlay.css">
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3"></script>
 *   <script src="auth-config.js"></script>
 *   <script src="auth-overlay.js"></script>
 *
 * auth-config.js defines:
 *   window.ROOSTER_AUTH = {
 *     supabaseUrl:            'https://xxxx.supabase.co',
 *     supabasePublishableKey: 'sb_publishable_...', // safe in client code
 *     site:                   'hvac-visits',  // matches allowed_emails.site
 *     title:                  'HVAC Visits',  // shown on the login card
 *     allowedEmails:          [],             // optional — PUBLIC if used
 *     showBadge:              true            // badge + sign-out button
 *   };
 *
 * Supabase renamed the client-side key: the legacy `anon` JWT is now the
 * "publishable key" (sb_publishable_…). `supabaseAnonKey` is still read as
 * a fallback so older configs keep working.
 *
 * The gate FAILS CLOSED: page content stays hidden until an allowed
 * session is confirmed. See gotchas.md — this is a UX gate, not a
 * security boundary. Real protection comes from RLS on your data.
 */
(function () {
  'use strict';

  var CFG = window.ROOSTER_AUTH || {};

  // New-style publishable key, falling back to the legacy anon key name.
  // Both are publishable — bounded by RLS, safe to ship in page source.
  var KEY = CFG.supabasePublishableKey || CFG.supabaseAnonKey;

  var LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'];
  var HIDE_CLASS = 'rooster-auth-pending';
  var _client = null;
  var _signedInEmail = null;

  // Hide page content immediately, before first paint, so gated content
  // never flashes on screen while Supabase checks the session.
  document.documentElement.classList.add(HIDE_CLASS);

  // ── Config guard ────────────────────────────────────────────
  function configError(msg) {
    document.documentElement.classList.remove(HIDE_CLASS);
    console.error('[rooster-auth] ' + msg);
    var el = document.getElementById('roosterLoginMsg');
    if (el) setMsg('Auth is misconfigured: ' + msg, 'error');
  }

  // ── Supabase client ─────────────────────────────────────────
  function getClient() {
    if (!_client) {
      if (typeof supabase === 'undefined' || !supabase.createClient) {
        throw new Error('supabase-js did not load (check the CDN <script> tag).');
      }
      _client = supabase.createClient(CFG.supabaseUrl, KEY);
    }
    return _client;
  }

  // ── Local dev bypass ────────────────────────────────────────
  // Ported from the original. `netlify dev` serves on localhost, so this
  // skips auth entirely during local preview. Append ?forceauth=1 to the
  // URL to exercise the real login flow locally.
  function isLocalBypass() {
    var forced = new URLSearchParams(location.search).get('forceauth') === '1';
    if (forced) return false;
    return LOCAL_HOSTS.indexOf(location.hostname) !== -1;
  }

  // ── Allow-list check ────────────────────────────────────────
  // Primary source is the `allowed_emails` table, filtered to this site
  // (or '*' for an email allowed everywhere). A local CFG.allowedEmails
  // array is also honoured — convenient, but PUBLIC in page source.
  function inLocalList(email) {
    var list = CFG.allowedEmails;
    if (!Array.isArray(list) || !list.length) return false;
    return list.some(function (e) { return String(e).trim().toLowerCase() === email; });
  }

  async function isAllowed(email) {
    email = String(email || '').trim().toLowerCase();
    if (!email) return false;
    if (inLocalList(email)) return true;
    if (!CFG.supabaseUrl) return false;

    var site = CFG.site || '';
    var headers = {
      apikey: KEY,
      Authorization: 'Bearer ' + KEY
    };

    // Two modes, both defined in _shared/schema.sql:
    //   'rpc'   → is_email_allowed() function; the table stays unreadable,
    //             so the allow-list can't be dumped. Recommended.
    //   'table' → direct REST select on allowed_emails (the original
    //             comms-platform behaviour). Requires an anon SELECT
    //             policy, which makes the list publicly readable.
    var useRpc = CFG.allowListMode !== 'table';

    try {
      var res;
      if (useRpc) {
        res = await fetch(CFG.supabaseUrl + '/rest/v1/rpc/is_email_allowed', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
          body: JSON.stringify({ p_email: email, p_site: site })
        });
        if (!res.ok) {
          console.error('[rooster-auth] allow-list RPC failed:', res.status, await res.text());
          return false;
        }
        return (await res.json()) === true;
      }

      res = await fetch(CFG.supabaseUrl + '/rest/v1/allowed_emails'
        + '?email=eq.' + encodeURIComponent(email)
        + '&site=in.(' + encodeURIComponent(site) + ',*)'
        + '&select=email', { headers: headers });
      if (!res.ok) {
        console.error('[rooster-auth] allow-list query failed:', res.status, await res.text());
        return false;
      }
      var rows = await res.json();
      return Array.isArray(rows) && rows.length > 0;
    } catch (err) {
      console.error('[rooster-auth] allow-list check threw:', err);
      return false; // fail closed
    }
  }

  // ── Overlay DOM (injected — no per-site markup needed) ──────
  function buildOverlay() {
    if (document.getElementById('roosterLoginOverlay')) return;

    var wrap = document.createElement('div');
    wrap.id = 'roosterLoginOverlay';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'roosterLoginTitle');
    wrap.innerHTML =
      '<div class="rooster-login-card">' +
        '<div class="rooster-login-logo">' +
          '<div class="rooster-login-dot"></div>' +
          '<span class="rooster-login-text" id="roosterLoginTitle"></span>' +
        '</div>' +
        '<p class="rooster-login-sub">Enter your email to receive a secure sign-in link.</p>' +
        '<form id="roosterLoginForm" novalidate>' +
          '<input id="roosterLoginEmail" type="email" class="rooster-login-inp" ' +
                 'placeholder="Enter your email" autocomplete="email" required>' +
          '<button id="roosterLoginBtn" type="submit" class="rooster-login-btn">Send magic link</button>' +
        '</form>' +
        '<div id="roosterLoginMsg" class="rooster-login-msg" role="status" aria-live="polite"></div>' +
      '</div>';
    document.body.appendChild(wrap);

    // textContent, not innerHTML — title is config-supplied.
    document.getElementById('roosterLoginTitle').textContent = CFG.title || document.title || 'Sign in';
    document.getElementById('roosterLoginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      handleLogin();
    });
  }

  function buildBadge(email) {
    if (CFG.showBadge === false) return;
    var existing = document.getElementById('roosterAuthBadge');
    if (existing) existing.remove();

    var bar = document.createElement('div');
    bar.id = 'roosterAuthBadge';
    bar.innerHTML = '<span class="rooster-badge-email"></span>' +
                    '<button type="button" class="rooster-badge-btn">Sign out</button>';
    bar.querySelector('.rooster-badge-email').textContent = email;
    bar.querySelector('.rooster-badge-btn').addEventListener('click', signOut);
    document.body.appendChild(bar);
  }

  // ── Screen state ────────────────────────────────────────────
  function showLogin() {
    buildOverlay();
    document.documentElement.classList.add(HIDE_CLASS);
    document.getElementById('roosterLoginOverlay').style.display = 'flex';
    var badge = document.getElementById('roosterAuthBadge');
    if (badge) badge.remove();
  }

  function showApp(email) {
    _signedInEmail = email;
    var overlay = document.getElementById('roosterLoginOverlay');
    if (overlay) overlay.style.display = 'none';
    document.documentElement.classList.remove(HIDE_CLASS);
    buildBadge(email);
    document.dispatchEvent(new CustomEvent('rooster:authed', { detail: { email: email } }));
  }

  function setMsg(text, type) {
    var el = document.getElementById('roosterLoginMsg');
    if (!el) return;
    el.textContent = text;
    el.className = 'rooster-login-msg' + (type ? ' rooster-login-msg-' + type : '');
  }

  // ── Login flow ──────────────────────────────────────────────
  async function handleLogin() {
    var input = document.getElementById('roosterLoginEmail');
    var btn = document.getElementById('roosterLoginBtn');
    var email = input ? input.value.trim().toLowerCase() : '';

    if (!email || email.indexOf('@') === -1) {
      setMsg('Please enter a valid email address.', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Checking…';
    setMsg('', '');

    try {
      // Check the allow-list BEFORE sending anything.
      var allowed = await isAllowed(email);
      if (!allowed) {
        setMsg('That email address is not authorized to access this tool.', 'error');
        btn.textContent = 'Send magic link';
        btn.disabled = false;
        return;
      }

      btn.textContent = 'Sending…';
      var { error } = await getClient().auth.signInWithOtp({
        email: email,
        options: {
          shouldCreateUser: true, // pre-verified by the allow-list check above
          // location.search is preserved deliberately: on localhost the
          // magic link must come back to ?forceauth=1, or the local dev
          // bypass fires on return and shows a fake 'local-dev' session
          // instead of the real one you were trying to test.
          emailRedirectTo: location.origin + location.pathname + location.search
        }
      });
      if (error) throw error;

      setMsg('✓ Magic link sent. Check your email and click the link to sign in.', 'success');
      btn.textContent = 'Resend link';
      btn.disabled = false;
      input.disabled = true;
    } catch (err) {
      console.error('[rooster-auth] login failed:', err);
      setMsg('Something went wrong. Please try again.', 'error');
      btn.textContent = 'Send magic link';
      btn.disabled = false;
    }
  }

  async function signOut() {
    try {
      await getClient().auth.signOut();
    } catch (err) {
      console.error('[rooster-auth] sign-out failed:', err);
    }
    _signedInEmail = null;
    showLogin();
  }

  // ── Init ────────────────────────────────────────────────────
  async function init() {
    if (isLocalBypass()) {
      console.warn('[rooster-auth] LOCAL DEV BYPASS — auth skipped. Use ?forceauth=1 to test the real flow.');
      showApp('local-dev');
      return;
    }

    if (!CFG.supabaseUrl || !KEY) {
      buildOverlay();
      document.getElementById('roosterLoginOverlay').style.display = 'flex';
      configError('supabaseUrl / supabasePublishableKey missing from auth-config.js');
      return;
    }

    var sb;
    try {
      sb = getClient();
    } catch (err) {
      buildOverlay();
      document.getElementById('roosterLoginOverlay').style.display = 'flex';
      configError(err.message);
      return;
    }

    buildOverlay();

    var { data: { session } } = await sb.auth.getSession();
    if (session && session.user) {
      if (await isAllowed(session.user.email)) {
        showApp(session.user.email);
      } else {
        await sb.auth.signOut();
        showLogin();
        setMsg('Your email is not authorized to access this tool.', 'error');
      }
    } else {
      showLogin();
    }

    // Magic link clicked in this tab, or session refreshed.
    sb.auth.onAuthStateChange(async function (event, session) {
      if (event === 'SIGNED_IN' && session && session.user) {
        if (session.user.email === _signedInEmail) return; // already shown
        if (await isAllowed(session.user.email)) {
          showApp(session.user.email);
        } else {
          await sb.auth.signOut();
          showLogin();
          setMsg('Your email (' + session.user.email + ') is not authorized.', 'error');
        }
      } else if (event === 'SIGNED_OUT') {
        showLogin();
      }
    });
  }

  // Public surface
  window.roosterAuth = {
    signOut: signOut,
    email: function () { return _signedInEmail; },
    isLocalBypass: isLocalBypass,
    // Read-only accessor so a host page can reuse THIS client and its
    // session rather than calling createClient() again. A second client
    // means a second GoTrueClient in the same browser context, which
    // supabase-js warns about and which can race on token refresh.
    client: getClient
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
