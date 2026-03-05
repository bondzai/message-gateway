function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

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

  list.innerHTML = accounts.map(acc => {
    const name = escapeHtml(acc.username || acc.display_name || acc.open_id);
    const openId = escapeHtml(acc.open_id);
    const avatarImg = acc.avatar_url
      ? `<img src="${escapeHtml(acc.avatar_url)}" alt="">`
      : '@';
    const statusClass = escapeHtml(acc.status);
    const statusLabel = acc.status === 'active' ? '● Connected' : '○ ' + escapeHtml(acc.status);
    const tokenExpiry = acc.token_expires_at
      ? ' — Token expires: ' + new Date(acc.token_expires_at).toLocaleString()
      : '';
    const safeId = escapeHtml(acc.id);

    return `
    <div class="account-card" data-id="${safeId}">
      <div class="account-avatar">${avatarImg}</div>
      <div class="account-info">
        <div class="account-name">@${name}</div>
        <div class="account-id">ID: ${openId}</div>
        <div class="account-status ${statusClass}">
          ${statusLabel}${tokenExpiry}
        </div>
      </div>
      <a class="btn btn-chat" href="/?account=${encodeURIComponent(acc.id)}">Open Chats</a>
      <button class="btn btn-disconnect" onclick="disconnectAccount('${safeId}')">Disconnect</button>
    </div>`;
  }).join('');
}

function connectAccount() {
  window.location.href = '/auth/connect?t=' + Date.now();
}

async function disconnectAccount(id) {
  if (!confirm('Disconnect this TikTok account? You can reconnect later.')) return;

  try {
    const res = await fetch(`/api/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' });
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
