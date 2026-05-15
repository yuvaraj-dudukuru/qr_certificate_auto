import { describe, expect, it } from 'vitest';
import { composeBodyText } from './cert-body';

describe('composeBodyText', () => {
  it('INT: emits the canonical Fraylon body paragraph with substituted fields', () => {
    const body = composeBodyText({
      type: 'INT',
      program: 'Web Development',
      duration: '3-Month Internship',
      startDateLabel: '1 March 2026',
      endDateLabel: '31 May 2026',
    });
    // Should mention all four variable values verbatim.
    expect(body).toContain('3-Month Internship');
    expect(body).toContain('Web Development');
    expect(body).toContain('1 March 2026');
    expect(body).toContain('31 May 2026');
    // Proper-case Fraylon Technologies (clean template, post 2026-05-15).
    expect(body).toContain('Fraylon Technologies');
    expect(body).not.toContain('FRAYLON TEchnologies');
    // Program is referenced twice (once for "in {program}", once for
    // "performance in {program} and project development").
    const occurrences = body.split('Web Development').length - 1;
    expect(occurrences).toBe(2);
  });

  it('INT: dates appear in start-then-end order, not reversed', () => {
    const body = composeBodyText({
      type: 'INT',
      program: 'P',
      duration: 'D',
      startDateLabel: 'AAA',
      endDateLabel: 'ZZZ',
    });
    expect(body.indexOf('AAA')).toBeLessThan(body.indexOf('ZZZ'));
  });

  it('WRK / CRS: throws — no template asset yet', () => {
    for (const type of ['WRK', 'CRS'] as const) {
      expect(() =>
        composeBodyText({
          type,
          program: 'Anything',
          duration: 'Anything',
          startDateLabel: '1 Jan 2026',
          endDateLabel: '1 Feb 2026',
        }),
      ).toThrow(/no template yet/);
    }
  });
});
