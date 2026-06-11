import { afterAll, describe, expect, it } from 'vitest';

import {
  callTool,
  cleanupTestNotes,
  extractNoteBody,
  trashNote,
  tryExtractNoteId,
  uniqueTitle,
} from './inspector.js';

const TEST_PREFIX = '[Bear-MCP-stest-frontmatter]';
const RUN_ID = Date.now();

afterAll(() => {
  cleanupTestNotes(TEST_PREFIX);
});

type CreatedNote = {
  title: string;
  noteId: string;
  readBody: () => string;
};

function withCreatedNote(
  suffix: string,
  args: { text: string; tags?: string },
  testBody: (note: CreatedNote) => void,
  env?: Record<string, string>
): void {
  const title = uniqueTitle(TEST_PREFIX, suffix, RUN_ID);
  let noteId: string | undefined;

  try {
    const createResult = callTool({
      toolName: 'bear-create-note',
      args: { title, ...args },
      env,
    }).content[0].text;

    noteId = tryExtractNoteId(createResult) ?? undefined;
    expect(noteId, `Expected "Note ID: <UUID>" in: ${createResult}`).toBeDefined();

    testBody({
      title,
      noteId: noteId!,
      readBody: () => openNoteBody(noteId!),
    });
  } finally {
    if (noteId) trashNote(noteId);
  }
}

function openNoteBody(noteId: string): string {
  return extractNoteBody(
    callTool({
      toolName: 'bear-open-note',
      args: { id: noteId },
    }).content[0].text
  );
}

function addTags(noteId: string, tags: string[], env?: Record<string, string>): string {
  return callTool({
    toolName: 'bear-add-tag',
    args: { id: noteId, tags: JSON.stringify(tags) },
    env,
  }).content[0].text;
}

describe('bear-create-note preserves YAML frontmatter', () => {
  it('creates note with frontmatter intact and title as H1', () => {
    withCreatedNote(
      'CreateFM',
      { text: '---\nstatus: draft\nproject: test\n---\nBody content here.' },
      ({ title, readBody }) => {
        const body = readBody();
        // Frontmatter block must appear before the title
        expect(body.indexOf('---\nstatus: draft')).toBeLessThan(body.indexOf(`# ${title}`));
        expect(body).toContain('status: draft');
        expect(body).toContain('Body content here.');
      }
    );
  });

  it('creates note with frontmatter and tags at the end by default', () => {
    withCreatedNote(
      'CreateFMTags',
      { text: '---\nstatus: active\n---\nNote body.', tags: 'stest-frontmatter' },
      ({ title, readBody }) => {
        const body = readBody();
        const tagPos = body.indexOf('#stest-frontmatter');
        expect(tagPos).toBeGreaterThan(body.indexOf(`# ${title}`));
        expect(tagPos).toBeGreaterThan(body.indexOf('Note body.'));
        // Frontmatter must not be broken
        expect(body).toContain('status: active');
      }
    );
  });

  it('creates note with frontmatter and tags after title when convention is enabled', () => {
    withCreatedNote(
      'CreateFMTagsAfterTitle',
      { text: '---\nstatus: active\n---\nNote body.', tags: 'stest-frontmatter' },
      ({ title, readBody }) => {
        const body = readBody();
        const titlePos = body.indexOf(`# ${title}`);
        const tagPos = body.indexOf('#stest-frontmatter');
        expect(tagPos).toBeGreaterThan(titlePos);
        expect(tagPos).toBeLessThan(body.indexOf('Note body.'));
        expect(body).toContain(`# ${title}\n#stest-frontmatter\n---\nNote body.`);
      },
      { UI_ENABLE_NEW_NOTE_CONVENTION: 'true' }
    );
  });

  it('creates note with frontmatter by merging into an existing tag line', () => {
    withCreatedNote(
      'CreateFMExistingTags',
      {
        text: '---\nstatus: active\n---\n#existing\nBody with existing tags.',
        tags: 'stest-frontmatter',
      },
      ({ title, readBody }) => {
        const body = readBody();
        expect(body).toContain(
          `# ${title}\n#existing #stest-frontmatter\nBody with existing tags.`
        );
        expect(body).not.toContain('#stest-frontmatter\n---\n');
      },
      { UI_ENABLE_NEW_NOTE_CONVENTION: 'true' }
    );
  });

  it('non-frontmatter text is unaffected (backward compat)', () => {
    withCreatedNote(
      'NoFM',
      { text: 'Plain body without frontmatter.', tags: 'stest-frontmatter' },
      ({ readBody }) => {
        expect(readBody()).toContain('Plain body without frontmatter.');
      }
    );
  });
});

describe('bear-add-tag on notes with YAML frontmatter', () => {
  it('appends tags at the end by default without clobbering frontmatter', () => {
    withCreatedNote(
      'AddTagFM',
      { text: '---\nstatus: draft\n---\nContent below frontmatter.' },
      ({ noteId, readBody }) => {
        const tag = `stest-fm-tag-${RUN_ID}`;
        expect(addTags(noteId, [tag])).toContain('added successfully');
        const body = readBody();
        // Frontmatter must still be intact
        expect(body).toContain('status: draft');
        // Tag must be present
        expect(body).toContain(`#${tag}`);
        // Tag must not appear between frontmatter and the title/body
        expect(body.indexOf(`#${tag}`)).toBeGreaterThan(body.indexOf('Content below frontmatter.'));
        // --- must still be line 1 (frontmatter not clobbered)
        expect(body.startsWith('---')).toBe(true);
      }
    );
  });

  it('inserts tags after title when convention is enabled without clobbering frontmatter', () => {
    withCreatedNote(
      'AddTagFMAfterTitle',
      { text: '---\nstatus: draft\n---\nContent below frontmatter.' },
      ({ title, noteId, readBody }) => {
        const tag = `stest-fm-tag-after-title-${RUN_ID}`;
        expect(addTags(noteId, [tag], { UI_ENABLE_NEW_NOTE_CONVENTION: 'true' })).toContain(
          'added successfully'
        );
        const body = readBody();
        const titlePos = body.indexOf(`# ${title}`);
        const tagPos = body.indexOf(`#${tag}`);
        expect(body.startsWith('---')).toBe(true);
        expect(tagPos).toBeGreaterThan(titlePos);
        expect(tagPos).toBeLessThan(body.indexOf('Content below frontmatter.'));
        expect(body).toContain(`# ${title}\n#${tag}\nContent below frontmatter.`);
        expect(body).not.toContain(`#${tag}\n---\n`);
      }
    );
  });

  it('merges tags into an existing tag line when convention is enabled', () => {
    withCreatedNote(
      'AddTagFMExistingTags',
      { text: '---\nstatus: draft\n---\n#existing\nContent below frontmatter.' },
      ({ title, noteId, readBody }) => {
        const tag = `stest-fm-tag-existing-${RUN_ID}`;
        expect(addTags(noteId, [tag], { UI_ENABLE_NEW_NOTE_CONVENTION: 'true' })).toContain(
          'added successfully'
        );
        const body = readBody();
        expect(body.startsWith('---')).toBe(true);
        expect(body).toContain(`# ${title}\n#existing #${tag}\nContent below frontmatter.`);
        expect(body).not.toContain(`#${tag}\n---\n`);
      }
    );
  });
});
