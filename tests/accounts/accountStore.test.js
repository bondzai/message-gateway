import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadAccounts, saveAccounts, toDTO, upsert, removeById } from '../../src/accounts/accountStore.js';

let tempDir;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'accountStore-test-'));
  vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tempDir, { recursive: true, force: true });
});

describe('accountStore', () => {
  it('loadAccounts returns [] when file missing', () => {
    expect(loadAccounts()).toEqual([]);
  });

  it('saveAccounts + loadAccounts round-trips', () => {
    const accounts = [{ id: '1', open_id: 'oid1', username: 'user1', status: 'active' }];
    saveAccounts(accounts);
    expect(loadAccounts()).toEqual(accounts);
  });

  it('toDTO strips tokens from account', () => {
    const full = {
      id: '1', open_id: 'oid1', username: 'user1', display_name: 'User',
      avatar_url: 'https://example.com/avatar.jpg', status: 'active',
      token_expires_at: '2026-03-01T00:00:00Z', connected_at: '2026-02-27T00:00:00Z',
      access_token: 'secret-access', refresh_token: 'secret-refresh',
    };
    const dto = toDTO(full);
    expect(dto).not.toHaveProperty('access_token');
    expect(dto).not.toHaveProperty('refresh_token');
    expect(dto.id).toBe('1');
    expect(dto.username).toBe('user1');
  });

  it('upsert creates new account', () => {
    const result = upsert({ id: '1', open_id: 'oid1', username: 'user1' });
    expect(result).toBe('created');
    expect(loadAccounts()).toHaveLength(1);
  });

  it('upsert updates existing account with same open_id', () => {
    upsert({ id: '1', open_id: 'oid1', username: 'old' });
    const result = upsert({ id: '1', open_id: 'oid1', username: 'new' });
    expect(result).toBe('updated');
    const accounts = loadAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].username).toBe('new');
  });

  it('removeById removes and returns account', () => {
    saveAccounts([{ id: 'a', open_id: 'oid1' }, { id: 'b', open_id: 'oid2' }]);
    const removed = removeById('a');
    expect(removed.id).toBe('a');
    expect(loadAccounts()).toHaveLength(1);
  });

  it('removeById returns null for missing id', () => {
    expect(removeById('nonexistent')).toBeNull();
  });
});
