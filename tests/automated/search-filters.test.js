const { parseSearchFilters } = require('../../server/helpers');

describe('parseSearchFilters', () => {
  test('returns empty text and filters for falsy input', () => {
    expect(parseSearchFilters('')).toEqual({ text: '', filters: {} });
    expect(parseSearchFilters(null)).toEqual({ text: '', filters: {} });
    expect(parseSearchFilters(undefined)).toEqual({ text: '', filters: {} });
  });

  test('returns plain text unchanged when no operators present', () => {
    const result = parseSearchFilters('hello world');
    expect(result.text).toBe('hello world');
    expect(result.filters).toEqual({});
  });

  test('parses from: operator', () => {
    const result = parseSearchFilters('from:alice');
    expect(result.text).toBe('');
    expect(result.filters.from).toBe('alice');
  });

  test('parses in: operator', () => {
    const result = parseSearchFilters('in:general');
    expect(result.text).toBe('');
    expect(result.filters.in).toBe('general');
  });

  test('parses before: with valid date', () => {
    const result = parseSearchFilters('before:2025-06-15');
    expect(result.text).toBe('');
    expect(result.filters.before).toBe(Date.parse('2025-06-15'));
  });

  test('parses after: with valid date', () => {
    const result = parseSearchFilters('after:2025-01-01');
    expect(result.text).toBe('');
    expect(result.filters.after).toBe(Date.parse('2025-01-01'));
  });

  test('ignores invalid dates silently', () => {
    const result = parseSearchFilters('before:notadate');
    expect(result.text).toBe('');
    expect(result.filters.before).toBeUndefined();
  });

  test('parses has:attachment', () => {
    const result = parseSearchFilters('has:attachment');
    expect(result.filters.has).toEqual(['attachment']);
  });

  test('parses has:image', () => {
    const result = parseSearchFilters('has:image');
    expect(result.filters.has).toEqual(['image']);
  });

  test('parses has:link', () => {
    const result = parseSearchFilters('has:link');
    expect(result.filters.has).toEqual(['link']);
  });

  test('ignores unknown has: values', () => {
    const result = parseSearchFilters('has:unknown');
    expect(result.filters.has).toBeUndefined();
  });

  test('parses is:pinned', () => {
    const result = parseSearchFilters('is:pinned');
    expect(result.filters.isPinned).toBe(true);
  });

  test('ignores unknown is: values', () => {
    const result = parseSearchFilters('is:starred');
    expect(result.filters.isPinned).toBeUndefined();
  });

  test('parses multiple has: values into array', () => {
    const result = parseSearchFilters('has:link has:image');
    expect(result.filters.has).toEqual(['link', 'image']);
  });

  test('extracts text remaining after filters', () => {
    const result = parseSearchFilters('hello from:alice world');
    expect(result.text).toBe('hello world');
    expect(result.filters.from).toBe('alice');
  });

  test('handles multiple filters combined with text', () => {
    const result = parseSearchFilters('hello from:alice in:general has:link');
    expect(result.text).toBe('hello');
    expect(result.filters.from).toBe('alice');
    expect(result.filters.in).toBe('general');
    expect(result.filters.has).toEqual(['link']);
  });

  test('is case-insensitive for operator keys', () => {
    const result = parseSearchFilters('FROM:Alice IN:General');
    expect(result.filters.from).toBe('alice');
    expect(result.filters.in).toBe('general');
  });

  test('collapses extra whitespace in remaining text', () => {
    const result = parseSearchFilters('hello   from:alice   world');
    expect(result.text).toBe('hello world');
  });

  test('handles all operators together', () => {
    const result = parseSearchFilters('search text from:bob in:random before:2025-12-31 after:2025-01-01 has:attachment is:pinned');
    expect(result.text).toBe('search text');
    expect(result.filters.from).toBe('bob');
    expect(result.filters.in).toBe('random');
    expect(result.filters.before).toBe(Date.parse('2025-12-31'));
    expect(result.filters.after).toBe(Date.parse('2025-01-01'));
    expect(result.filters.has).toEqual(['attachment']);
    expect(result.filters.isPinned).toBe(true);
  });

  test('filter-only query (no free text) returns empty text', () => {
    const result = parseSearchFilters('from:alice in:general');
    expect(result.text).toBe('');
    expect(result.filters.from).toBe('alice');
    expect(result.filters.in).toBe('general');
  });
});
