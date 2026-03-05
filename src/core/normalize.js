import { DIRECTION, UNKNOWN, MSG_TYPE_DM, MSG_TYPE_TEXT } from './constants.js';

export function normalizeMessage(raw, direction = DIRECTION.INCOMING) {
  return {
    type: MSG_TYPE_DM,
    direction,
    accountId: raw.accountId || '',
    conversationId: raw.conversationId || UNKNOWN,
    timestamp: raw.timestamp || new Date().toISOString(),
    user: {
      id: raw.user?.id || UNKNOWN,
      username: raw.user?.username || UNKNOWN,
      nickname: raw.user?.nickname || raw.user?.username || UNKNOWN,
      avatar: raw.user?.avatar || '',
    },
    message: {
      type: raw.message?.type || MSG_TYPE_TEXT,
      content: raw.message?.content || '',
    },
  };
}
