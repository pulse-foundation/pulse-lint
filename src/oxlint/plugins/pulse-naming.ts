import path from 'node:path';

import type { Rule } from 'eslint';

// The two naming policies shipped by Pulse. No configurable glob engine is needed.
const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const segments = (context: Rule.RuleContext) =>
  path.relative(context.cwd, context.physicalFilename).split(path.sep);

const filenameNamingConvention: Rule.RuleModule = {
  meta: {
    type: 'layout',
    docs: { description: 'Use kebab-case filenames, allowing middle extensions.' },
    schema: [],
    messages: {
      invalid: 'The filename "{{ filename }}" does not match the "KEBAB_CASE" pattern',
    },
  },
  create(context) {
    return {
      Program(node) {
        const parts = segments(context);
        // Matches the previous **/*.* selection: dot paths and extensionless files are excluded.
        if (parts.some((part) => part.startsWith('.'))) return;
        const filename = parts.at(-1) ?? '';
        const dot = filename.indexOf('.');
        if (dot === -1 || KEBAB_CASE.test(filename.slice(0, dot))) return;
        context.report({ node, messageId: 'invalid', data: { filename } });
      },
    };
  },
};

const folderNamingConvention: Rule.RuleModule = {
  meta: {
    type: 'layout',
    docs: { description: 'Use kebab-case for project-relative folders.' },
    schema: [],
    messages: {
      invalid: 'The folder "{{ folder }}" does not match the "KEBAB_CASE" pattern',
    },
  },
  create(context) {
    return {
      Program(node) {
        const folder = segments(context)
          .slice(0, -1)
          .find((part) => !KEBAB_CASE.test(part));
        if (folder) context.report({ node, messageId: 'invalid', data: { folder } });
      },
    };
  },
};

export default {
  meta: { name: 'pulse-naming' },
  rules: {
    'filename-naming-convention': filenameNamingConvention,
    'folder-naming-convention': folderNamingConvention,
  },
};
