import { Lru } from './lru';

describe('Lru', () => {
  it('evicts the least recently used entry', () => {
    const c = new Lru<number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBe(2);
    expect(c.size).toBe(2);
  });

  it('refreshes an entry when it is read', () => {
    const c = new Lru<number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.get('a');
    c.set('c', 3);
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe(1);
  });
});
