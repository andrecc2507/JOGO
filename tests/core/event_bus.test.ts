import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@core';

type Events = { ping: { n: number } };

describe('EventBus', () => {
  it('entrega payloads e permite cancelar a inscrição', () => {
    const bus = new EventBus<Events>();
    const handler = vi.fn();
    const off = bus.on('ping', handler);
    bus.emit('ping', { n: 1 });
    off();
    bus.emit('ping', { n: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ n: 1 });
  });

  it('once dispara uma única vez', () => {
    const bus = new EventBus<Events>();
    const handler = vi.fn();
    bus.once('ping', handler);
    bus.emit('ping', { n: 1 });
    bus.emit('ping', { n: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
