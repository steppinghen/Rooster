import { describe, expect, it } from 'vitest';
import { sizeClass } from './sizeClass';

describe('sizeClass', () => {
  it('lg from 80 px at normal volume', () => {
    expect(sizeClass(80, 'normal')).toBe('lg');
    expect(sizeClass(220, 'normal')).toBe('lg');
  });
  it('focus volume never uses lg', () => expect(sizeClass(220, 'focus')).toBe('md'));
  it('md from 48 to 79 px', () => {
    expect(sizeClass(48, 'normal')).toBe('md');
    expect(sizeClass(79, 'normal')).toBe('md');
  });
  it('sm under 48 px, in either volume', () => {
    expect(sizeClass(44, 'normal')).toBe('sm');
    expect(sizeClass(47, 'focus')).toBe('sm');
  });
});
