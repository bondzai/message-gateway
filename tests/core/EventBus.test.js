import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../../src/core/EventBus.js';

describe('EventBus', () => {
  it('calls registered listener with args', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.on('test', fn);
    bus.emit('test', 'a', 'b');
    expect(fn).toHaveBeenCalledWith('a', 'b');
  });

  it('supports multiple listeners on same event', () => {
    const bus = new EventBus();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    bus.on('test', fn1).on('test', fn2);
    bus.emit('test', 42);
    expect(fn1).toHaveBeenCalledWith(42);
    expect(fn2).toHaveBeenCalledWith(42);
  });

  it('removes listener with off()', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.on('test', fn);
    bus.off('test', fn);
    bus.emit('test');
    expect(fn).not.toHaveBeenCalled();
  });

  it('does not throw when emitting event with no listeners', () => {
    const bus = new EventBus();
    expect(() => bus.emit('nothing')).not.toThrow();
  });

  it('isolates errors — one bad listener does not block others', () => {
    const bus = new EventBus();
    const badFn = vi.fn(() => { throw new Error('boom'); });
    const goodFn = vi.fn();
    bus.on('test', badFn).on('test', goodFn);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    bus.emit('test', 'data');
    consoleSpy.mockRestore();

    expect(badFn).toHaveBeenCalledWith('data');
    expect(goodFn).toHaveBeenCalledWith('data');
  });
});
