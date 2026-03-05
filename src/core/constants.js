// Internal event bus names
export const EVENTS = {
  DM_INCOMING: 'dm:incoming',
  DM_OUTGOING: 'dm:outgoing',
  MESSAGE: 'message',
};

// Message directions
export const DIRECTION = {
  INCOMING: 'incoming',
  OUTGOING: 'outgoing',
};

// Sentinel values
export const UNKNOWN = 'unknown';
export const MSG_TYPE_DM = 'dm';
export const MSG_TYPE_TEXT = 'text';
export const SELF_USER = Object.freeze({ id: 'self', username: 'You', nickname: 'You', avatar: '' });

// Limits
export const MAX_SEEN_IDS = 10_000;
