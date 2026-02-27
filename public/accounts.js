async function loadAccounts() {
  try {
    const res = await fetch('/api/accounts');
    const accounts = await res.json();
    renderAccounts(accounts);
  } catch (err) {
    document.getElementById('accounts-list').innerHTML =
      '<div class="empty"><p>Failed to load accounts</p></div>';
  }
}

function renderAccounts(accounts) {
  const list = document.getElementById('accounts-list');

  if (accounts.length === 0) {
    list.innerHTML = `
      <div class="empty">
        <p>No TikTok accounts connected yet.</p>
        <p>Click the button below to connect your first account.</p>
      </div>`;
    return;
  }

  list.innerHTML = accounts.map(acc => `
    <div class="account-card" data-id="${acc.id}">
      <div class="account-avatar">
        ${acc.avatar_url
          ? `<img src="${acc.avatar_url}" alt="">`
          : '@'}
      </div>
      <div class="account-info">
        <div class="account-name">@${acc.username || acc.display_name || acc.open_id}</div>
        <div class="account-id">ID: ${acc.open_id}</div>
        <div class="account-status ${acc.status}">
          ${acc.status === 'active' ? '● Connected' : '○ ' + acc.status}
          ${acc.token_expires_at ? ' — Token expires: ' + new Date(acc.token_expires_at).toLocaleString() : ''}
        </div>
      </div>
      <button class="btn btn-disconnect" onclick="disconnectAccount('${acc.id}')">Disconnect</button>
    </div>
  `).join('');

  // Show "Open Dashboard" button when accounts are connected
  let dashBtn = document.getElementById('dashboard-btn');
  if (!dashBtn) {
    dashBtn = document.createElement('a');
    dashBtn.id = 'dashboard-btn';
    dashBtn.href = '/';
    dashBtn.className = 'btn btn-connect';
    dashBtn.style.cssText = 'display:inline-block;text-decoration:none;text-align:center;margin-top:16px;background:#1a6aff;';
    dashBtn.textContent = 'Open Chat Dashboard →';
    document.querySelector('.page').appendChild(dashBtn);
  }
}

function connectAccount() {
  window.location.href = '/auth/connect?t=' + Date.now();
}

async function disconnectAccount(id) {
  if (!confirm('Disconnect this TikTok account? You can reconnect later.')) return;

  try {
    const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Account disconnected');
      loadAccounts();
    } else {
      showToast('Failed to disconnect: ' + (data.error || 'Unknown error'), true);
    }
  } catch (err) {
    showToast('Failed to disconnect', true);
  }
}

function showToast(msg, isError) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (isError ? ' error' : '');
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3000);
}

// Check for success/error params from OAuth callback
const params = new URLSearchParams(window.location.search);
if (params.get('connected')) {
  showToast('TikTok account connected successfully!');
  window.history.replaceState({}, '', '/accounts.html');
}
if (params.get('error')) {
  showToast('Connection failed: ' + params.get('error'), true);
  window.history.replaceState({}, '', '/accounts.html');
}

loadAccounts();
