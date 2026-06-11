import { describe, expect, it } from 'vitest';

import {
  applyNoteConventions,
  formatTagsAsInlineSyntax,
  insertInlineTags,
  parseFrontmatter,
} from './note-conventions.js';

describe('parseFrontmatter', () => {
  it('returns null frontmatter when text does not start with ---', () => {
    const text = '# Title\nbody';
    expect(parseFrontmatter(text)).toEqual({ frontmatter: null, body: text });
  });

  it('detects frontmatter when --- is first line with closing ---', () => {
    const result = parseFrontmatter('---\ntitle: Test\n---\nbody');
    expect(result.frontmatter).toBe('---\ntitle: Test\n---');
    expect(result.body).toBe('body');
  });

  it('returns null frontmatter when no closing --- exists', () => {
    const text = '---\nno closing line\ncontent';
    expect(parseFrontmatter(text)).toEqual({ frontmatter: null, body: text });
  });

  it('ignores horizontal rules in body — --- not at line 1', () => {
    const text = '# Title\n---\nhorizontal rule\n---\nbody';
    expect(parseFrontmatter(text)).toEqual({ frontmatter: null, body: text });
  });

  it('handles empty body after frontmatter', () => {
    const result = parseFrontmatter('---\nkey: val\n---\n');
    expect(result.frontmatter).toBe('---\nkey: val\n---');
    expect(result.body).toBe('');
  });

  it('handles multi-key frontmatter with body including H1', () => {
    const text = '---\ntitle: My Note\ntags: [work]\n---\n# My Note\ncontent';
    const result = parseFrontmatter(text);
    expect(result.frontmatter).toBe('---\ntitle: My Note\ntags: [work]\n---');
    expect(result.body).toBe('# My Note\ncontent');
  });

  it('returns null frontmatter when --- is present but not at line 1', () => {
    const text = '\n---\nkey: val\n---\nbody';
    expect(parseFrontmatter(text)).toEqual({ frontmatter: null, body: text });
  });
});

describe('formatTagsAsInlineSyntax', () => {
  it('converts comma-separated tags to Bear inline syntax', () => {
    expect(formatTagsAsInlineSyntax('work,urgent')).toBe('#work #urgent');
  });

  it('adds closing hash for tags with spaces', () => {
    expect(formatTagsAsInlineSyntax('my tag')).toBe('#my tag#');
  });

  it('returns empty string for all-invalid tags', () => {
    expect(formatTagsAsInlineSyntax('###,,,')).toBe('');
  });
});

describe('applyNoteConventions', () => {
  it.each([
    ['undefined tags returns text unchanged', 'hello', undefined, 'hello'],
    ['empty string tags returns text unchanged', 'hello', '', 'hello'],
    ['both text and tags undefined returns both unchanged', undefined, undefined, undefined],
    ['multiple tags produce tag line without separator', undefined, 'work,urgent', '#work #urgent'],
    ['empty string text treated as no text', '', 'work', '#work'],
    [
      'multiple tags and text joined with separator',
      'body',
      'work,urgent',
      '#work #urgent\n---\nbody',
    ],
    ['single tag and text joined with separator', 'body', 'work', '#work\n---\nbody'],
    ['nested tag without spaces has no closing hash', undefined, 'work/meetings', '#work/meetings'],
    ['tag with space gets closing hash', undefined, 'my tag', '#my tag#'],
    [
      'nested tag with spaces gets closing hash',
      undefined,
      'work/meeting notes',
      '#work/meeting notes#',
    ],
    ['simple tag has no closing hash', undefined, 'urgent', '#urgent'],
    [
      'mixed tags apply closing hash per-tag',
      undefined,
      'work/meetings,urgent,my tag',
      '#work/meetings #urgent #my tag#',
    ],
    [
      'strips leading and trailing hash symbols from tags',
      undefined,
      '#work,##urgent#',
      '#work #urgent',
    ],
    ['all-invalid tags pass text through unchanged', 'hello', '###,,,  ', 'hello'],
    [
      'empty segments between commas are filtered out',
      undefined,
      'work, , ,urgent',
      '#work #urgent',
    ],
    ['whitespace around tags is trimmed', undefined, ' work , urgent ', '#work #urgent'],
  ])('%s', (_name, text, tags, expectedText) => {
    expect(applyNoteConventions({ text, tags })).toEqual({ text: expectedText, tags: undefined });
  });
});

describe('insertInlineTags', () => {
  it.each([
    [
      'appends tags at the end for default placement',
      '# Title\nBody',
      'end',
      undefined,
      '# Title\nBody\n#work',
    ],
    [
      'inserts tags after the title without a separator by default',
      '# Title\nBody',
      'after-title',
      undefined,
      '# Title\n#work\nBody',
    ],
    [
      'can insert tags after the title with a separator for new note creation',
      '# Title\nBody',
      'after-title',
      { separatorAfterTags: true },
      '# Title\n#work\n---\nBody',
    ],
    [
      'merges tags into an existing tag line after the title without adding a separator',
      '# Title\n#existing\nBody',
      'after-title',
      { separatorAfterTags: true },
      '# Title\n#existing #work\nBody',
    ],
    [
      'preserves an existing separator after an existing tag line',
      '# Title\n#existing\n---\nBody',
      'after-title',
      { separatorAfterTags: true },
      '# Title\n#existing #work\n---\nBody',
    ],
    [
      'falls back to top-of-body placement without a separator when after-title has no H1',
      'Body without title',
      'after-title',
      undefined,
      '#work\nBody without title',
    ],
    [
      'can include a separator in the no-H1 fallback for new note creation',
      'Body without title',
      'after-title',
      { separatorAfterTags: true },
      '#work\n---\nBody without title',
    ],
    [
      'merges with a leading tag line when after-title fallback has no H1',
      '#existing\nBody without title',
      'after-title',
      { separatorAfterTags: true },
      '#existing #work\nBody without title',
    ],
    [
      'omits separator when inserting after a title-only body',
      '# Title',
      'after-title',
      undefined,
      '# Title\n#work',
    ],
  ] as const)('%s', (_name, text, placement, options, expectedText) => {
    expect(insertInlineTags(text, '#work', placement, options)).toBe(expectedText);
  });

  it('does not insert tags before a title when body comes from frontmatter parsing', () => {
    const parsed = parseFrontmatter('---\nstatus: draft\n---\n# Title\nBody');
    const body = insertInlineTags(parsed.body, '#work', 'after-title');

    expect(`${parsed.frontmatter}\n${body}`).toBe('---\nstatus: draft\n---\n# Title\n#work\nBody');
  });
});
