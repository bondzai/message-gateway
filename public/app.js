const socket = io({ transports: ['polling', 'websocket'], upgrade: true });
const chat = document.getElementById('chat');
const status = document.getElementById('status');
const convList = document.getElementById('conv-list');
const chatHeader = document.getElementById('chat-header');
const sendForm = document.getElementById('send-form');
const msgInput = document.getElementById('msg-input');
const sendBtn = sendForm.querySelector('button');
const debug = document.getElementById('debug');
const accountSelect = document.getElementById('account-select');

let conversations = {};
let activeConversation = null;
let selectedAccountId = localStorage.getItem('selectedAccountId') || '';
let accounts = [];

function log(msg) {
  if (debug) debug.textContent = msg;
}

// --- Account Selector ---

async function loadAccountSelector() {
  try {
    const res = await fetch('/api/accounts');
    accounts = await res.json();

    if (!accounts || accounts.length === 0) {
      window.location.href = '/accounts.html';
      return;
    }

    // Check URL param (from accounts page "Open Dashboard" link)
    const urlParams = new URLSearchParams(window.location.search);
    const urlAccount = urlParams.get('account');
    if (urlAccount) {
      selectedAccountId = urlAccount;
      localStorage.setItem('selectedAccountId', selectedAccountId);
      window.history.replaceState({}, '', '/');
    }

    // If saved account no longer exists, reset to first
    if (!accounts.find(a => a.id === selectedAccountId)) {
      selectedAccountId = accounts[0].id;
      localStorage.setItem('selectedAccountId', selectedAccountId);
    }

    accountSelect.innerHTML = accounts.map(acc => {
      const name = acc.username ? `@${acc.username}` : acc.display_name || acc.open_id;
      const selected = acc.id === selectedAccountId ? ' selected' : '';
      return `<option value="${acc.id}"${selected}>${escapeHtml(name)}</option>`;
    }).join('');

    accountSelect.addEventListener('change', () => {
      selectedAccountId = accountSelect.value;
      localStorage.setItem('selectedAccountId', selectedAccountId);
      switchAccount();
    });

    loadChats();
  } catch (err) {
    log('Failed to load accounts');
  }
}

function switchAccount() {
  conversations = {};
  activeConversation = null;
  chat.innerHTML = '';
  chatHeader.textContent = 'Select a conversation';
  msgInput.disabled = true;
  sendBtn.disabled = true;
  convList.innerHTML = '';
  loadChats();
}

// --- Chat Loading ---

function loadChats() {
  // Only filter by account when multiple accounts exist
  const useFilter = selectedAccountId && accounts.length > 1;
  const url = useFilter
    ? `/api/chats?accountId=${encodeURIComponent(selectedAccountId)}`
    : '/api/chats';

  log('Loading chats...');
  fetch(url)
    .then(r => r.json())
    .then(chats => {
      log(`Loaded ${chats.length} messages`);
      for (const msg of chats) {
        addToConversation(msg);
      }
      renderConversationList();
      const sorted = Object.entries(conversations).sort(
        (a, b) => new Date(b[1].lastActivity) - new Date(a[1].lastActivity)
      );
      if (sorted.length > 0 && !activeConversation) {
        selectConversation(sorted[0][0]);
      }
    })
    .catch((err) => log('Failed to load chats: ' + err.message));
}

// --- Socket.IO ---

socket.on('connect', () => {
  status.textContent = 'Connected';
  status.className = 'status connected';
});

socket.on('disconnect', () => {
  status.textContent = 'Disconnected';
  status.className = 'status disconnected';
});

socket.on('message', (data) => {
  // Filter by selected account (show all if no accountId on message)
  if (selectedAccountId && data.accountId && data.accountId !== selectedAccountId) {
    return;
  }

  addToConversation(data);
  renderConversationList();

  if (activeConversation === data.conversationId) {
    appendMessage(data);
  }
});

// --- Conversations ---

function addToConversation(data) {
  const convId = data.conversationId;
  if (!convId) return;

  if (!conversations[convId]) {
    conversations[convId] = {
      user: data.direction === 'incoming' ? data.user : null,
      messages: [],
      lastActivity: data.timestamp,
    };
  }

  if (data.direction === 'incoming' && data.user) {
    conversations[convId].user = data.user;
  }

  const msgs = conversations[convId].messages;
  const isDupe = msgs.some(m =>
    m.timestamp === data.timestamp &&
    m.message.content === data.message.content &&
    m.direction === data.direction
  );
  if (!isDupe) {
    msgs.push(data);
  }

  conversations[convId].lastActivity = data.timestamp;
}

function renderConversationList() {
  convList.innerHTML = '';
  const sorted = Object.entries(conversations).sort(
    (a, b) => new Date(b[1].lastActivity) - new Date(a[1].lastActivity)
  );

  for (const [convId, conv] of sorted) {
    const li = document.createElement('li');
    li.className = convId === activeConversation ? 'active' : '';
    const name = conv.user?.nickname || conv.user?.username || convId;
    const lastMsg = conv.messages[conv.messages.length - 1];
    const preview = lastMsg ? truncate(lastMsg.message.content, 30) : '';
    li.innerHTML = `<strong>${escapeHtml(name)}</strong><span class="preview">${escapeHtml(preview)}</span>`;
    li.addEventListener('click', () => selectConversation(convId));
    convList.appendChild(li);
  }
}

function selectConversation(convId) {
  activeConversation = convId;
  const conv = conversations[convId];
  if (!conv) return;
  const name = conv.user?.nickname || conv.user?.username || convId;
  chatHeader.textContent = `Chat with ${name}`;
  msgInput.disabled = false;
  sendBtn.disabled = false;

  conv.messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  chat.innerHTML = '';
  for (const msg of conv.messages) {
    appendMessage(msg);
  }

  renderConversationList();
  log(`${conv.messages.length} messages in ${name}`);
}

function appendMessage(data) {
  const el = document.createElement('div');
  el.className = `bubble ${data.direction}`;

  const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const sender = data.direction === 'incoming'
    ? escapeHtml(data.user?.nickname || data.user?.username || '?')
    : 'You';

  el.innerHTML = `
    <div class="bubble-sender">${sender}</div>
    <div class="bubble-text">${escapeHtml(data.message.content)}</div>
    <div class="bubble-time">${time}</div>
  `;

  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
}

// --- Send Message ---

sendForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = msgInput.value.trim();
  if (!text || !activeConversation) return;

  socket.emit('send_message', {
    conversationId: activeConversation,
    accountId: selectedAccountId,
    text,
  });

  msgInput.value = '';
});

// --- Helpers ---

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '...' : str;
}

// --- Init ---
loadAccountSelector();
