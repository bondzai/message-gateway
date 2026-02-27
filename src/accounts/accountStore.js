import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

function dataDir() { return join(process.cwd(), 'data'); }
function accountsFile() { return join(dataDir(), 'accounts.json'); }

export function ensureDataDir() {
  const dir = dataDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function loadAccounts() {
  const file = accountsFile();
  if (!existsSync(file)) return [];
  try { return JSON.parse(readFileSync(file, 'utf-8')); } catch { return []; }
}

export function saveAccounts(accounts) {
  ensureDataDir();
  writeFileSync(accountsFile(), JSON.stringify(accounts, null, 2));
}

export function toDTO(account) {
  return {
    id: account.id,
    open_id: account.open_id,
    username: account.username,
    display_name: account.display_name,
    avatar_url: account.avatar_url,
    status: account.status,
    token_expires_at: account.token_expires_at,
    connected_at: account.connected_at,
  };
}

export function upsert(account) {
  const accounts = loadAccounts();
  const idx = accounts.findIndex(a => a.open_id === account.open_id);
  if (idx >= 0) {
    accounts[idx] = account;
  } else {
    accounts.push(account);
  }
  saveAccounts(accounts);
  return idx >= 0 ? 'updated' : 'created';
}

export function removeById(id) {
  const accounts = loadAccounts();
  const idx = accounts.findIndex(a => a.id === id);
  if (idx === -1) return null;
  const [removed] = accounts.splice(idx, 1);
  saveAccounts(accounts);
  return removed;
}

export function getChatLogPath() {
  return join(dataDir(), 'chats.jsonl');
}
