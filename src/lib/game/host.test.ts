import { describe, it, expect } from 'vitest';
import { resolveHostId, PresencePlayer } from './host';

describe('resolveHostId', () => {
  it('assigns the earliest-connected player when there is no host yet', () => {
    const present: PresencePlayer[] = [
      { id: 'p2', joinedAt: '2023-01-01T00:00:01Z' },
      { id: 'p1', joinedAt: '2023-01-01T00:00:00Z' },
      { id: 'p3', joinedAt: '2023-01-01T00:00:02Z' },
    ];
    expect(resolveHostId(null, present)).toBe('p1');
  });

  it('keeps the current host as long as they are still present, even if others joined earlier', () => {
    const present: PresencePlayer[] = [
      { id: 'p1', joinedAt: '2023-01-01T00:00:00Z' }, // earliest, but not host
      { id: 'p2', joinedAt: '2023-01-01T00:00:01Z' }, // designated host
    ];
    expect(resolveHostId('p2', present)).toBe('p2');
  });

  it('promotes the next-earliest present player when the current host disconnects', () => {
    const present: PresencePlayer[] = [
      { id: 'p2', joinedAt: '2023-01-01T00:00:01Z' },
      { id: 'p3', joinedAt: '2023-01-01T00:00:02Z' },
    ];
    // p1 (o host anterior) não está mais na lista de presentes
    expect(resolveHostId('p1', present)).toBe('p2');
  });

  it('does not hand authority back to the original host when they reconnect (sticky handoff)', () => {
    const initialPresent: PresencePlayer[] = [
      { id: 'p1', joinedAt: '2023-01-01T00:00:00Z' },
      { id: 'p2', joinedAt: '2023-01-01T00:00:01Z' },
    ];
    let hostId = resolveHostId(null, initialPresent);
    expect(hostId).toBe('p1');

    // p1 desconecta; p2 assume
    const afterDisconnect: PresencePlayer[] = [{ id: 'p2', joinedAt: '2023-01-01T00:00:01Z' }];
    hostId = resolveHostId(hostId, afterDisconnect);
    expect(hostId).toBe('p2');

    // p1 reconecta com o MESMO joinedAt original (estável via localStorage) —
    // mesmo assim, p2 continua sendo o host.
    const afterReconnect: PresencePlayer[] = [
      { id: 'p1', joinedAt: '2023-01-01T00:00:00Z' },
      { id: 'p2', joinedAt: '2023-01-01T00:00:01Z' },
    ];
    hostId = resolveHostId(hostId, afterReconnect);
    expect(hostId).toBe('p2');
  });

  it('returns null when nobody is present', () => {
    expect(resolveHostId('p1', [])).toBeNull();
    expect(resolveHostId(null, [])).toBeNull();
  });

  it('re-promotes correctly through repeated disconnects', () => {
    let hostId: string | null = null;
    hostId = resolveHostId(hostId, [
      { id: 'p1', joinedAt: '1' },
      { id: 'p2', joinedAt: '2' },
      { id: 'p3', joinedAt: '3' },
    ]);
    expect(hostId).toBe('p1');

    hostId = resolveHostId(hostId, [
      { id: 'p2', joinedAt: '2' },
      { id: 'p3', joinedAt: '3' },
    ]);
    expect(hostId).toBe('p2');

    hostId = resolveHostId(hostId, [{ id: 'p3', joinedAt: '3' }]);
    expect(hostId).toBe('p3');
  });
});
