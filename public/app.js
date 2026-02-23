const socket = io({ transports: ['polling', 'websocket'], upgrade: true });
const chat = document.getElementById('chat');
const status = document.getElementById('status');
const convList = document.getElementById('conv-list');
const chatHeader = document.getElementById('chat-header');
const sendForm = document.getElementById('send-form');
const msgInput = document.getElementById('msg-input');
const sendBtn = sendForm.querySelector('button');

const conversations = {};
let activeConversation = null;

// Load saved chats on page load
fetch('/api/chats')
  .then(r => r.json())
  .then(chats => {
    for (const msg of chats) {
      addToConversation(msg);
    }
    renderConversationList();
  })
  .catch(() => {});

socket.on('connect', () => {
  status.textContent = 'Connected';
  status.className = 'status connected';
});

socket.on('disconnect', () => {
  status.textContent = 'Disconnected';
  status.className = 'status disconnected';
});

socket.on('message', (data) => {
  addToConversation(data);
  renderConversationList();

  if (activeConversation === data.conversationId) {
    appendMessage(data);
  }
});

function addToConversation(data) {
  const convId = data.conversationId;

  if (!conversations[convId]) {
    conversations[convId] = {
      user: data.direction === 'incoming' ? data.user : null,
      messages: [],
      lastActivity: data.timestamp,
    };
  }

  if (data.direction === 'incoming' && !conversations[convId].user) {
    conversations[convId].user = data.user;
  }

  conversations[convId].messages.push(data);
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
  const name = conv.user?.nickname || conv.user?.username || convId;
  chatHeader.textContent = `Chat with ${name}`;
  msgInput.disabled = false;
  sendBtn.disabled = false;

  chat.innerHTML = '';
  for (const msg of conv.messages) {
    appendMessage(msg);
  }

  renderConversationList();
}

function appendMessage(data) {
  const el = document.createElement('div');
  el.className = `bubble ${data.direction}`;

  const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const sender = data.direction === 'incoming'
    ? escapeHtml(data.user.nickname || data.user.username)
    : 'You';

  el.innerHTML = `
    <div class="bubble-sender">${sender}</div>
    <div class="bubble-text">${escapeHtml(data.message.content)}</div>
    <div class="bubble-time">${time}</div>
  `;

  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
}

sendForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = msgInput.value.trim();
  if (!text || !activeConversation) return;

  socket.emit('send_message', {
    conversationId: activeConversation,
    text,
  });

  msgInput.value = '';
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + '...' : str;
}
