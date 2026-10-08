import path from 'node:path';

import type { Rule } from 'eslint';
import type * as ESTree from 'estree';
import type { JSXAttribute, JSXExpressionContainer, JSXText } from 'estree-jsx';

type NativeListeners = {
  JSXText?: (node: JSXText) => void;
  JSXExpressionContainer?: (node: JSXExpressionContainer & { parent?: { type: string } }) => void;
  JSXAttribute?: (node: JSXAttribute) => void;
  Program?: (node: ESTree.Program) => void;
  CallExpression?: (node: ESTree.CallExpression) => void;
  ImportDeclaration?: (node: ESTree.ImportDeclaration) => void;
  ExportNamedDeclaration?: (node: ESTree.ExportNamedDeclaration) => void;
  ExportAllDeclaration?: (node: ESTree.ExportAllDeclaration) => void;
  ImportExpression?: (node: ESTree.ImportExpression) => void;
};

type NativeRule = Omit<Rule.RuleModule, 'create'> & {
  create(context: Rule.RuleContext): NativeListeners;
};

// Pulse-specific React Native rules (Oxlint JS plugin). Paths are resolved against the lint
// working directory, which `pulse-lint oxlint:native` sets to the native project root.

const projectRelativePath = (context: Rule.RuleContext) =>
  path.relative(context.cwd, context.filename).split(path.sep).join('/');

const LETTERS = /\p{L}/u;

// Props that render or announce text to the user. Values must come from i18n.
const TEXT_PROPS = new Set([
  'accessibilityHint',
  'accessibilityLabel',
  'aria-label',
  'label',
  'placeholder',
  'title',
]);

const noRawJsxText: NativeRule = {
  meta: {
    type: 'problem',
    docs: { description: 'User-visible text must come from i18n, not JSX literals.' },
    schema: [],
    messages: {
      text: 'Hardcoded user-visible text {{text}}; use a translation key.',
    },
  },
  create(context) {
    const report = (node: ESTree.Node, raw: string) =>
      context.report({
        node,
        messageId: 'text',
        data: { text: JSON.stringify(raw.trim().slice(0, 40)) },
      });
    return {
      JSXText(node: JSXText) {
        if (LETTERS.test(node.value)) report(node, node.value);
      },
      JSXExpressionContainer(node) {
        if (node.parent?.type !== 'JSXElement' && node.parent?.type !== 'JSXFragment') return;
        const { expression } = node;
        if (expression.type === 'Literal' && typeof expression.value === 'string') {
          if (LETTERS.test(expression.value)) report(expression, expression.value);
        }
        if (expression.type === 'TemplateLiteral') {
          const raw = expression.quasis.map((quasi) => quasi.value.cooked ?? '').join('');
          if (LETTERS.test(raw)) report(expression, raw);
        }
      },
      JSXAttribute(node: JSXAttribute) {
        if (node.name.type !== 'JSXIdentifier' || !TEXT_PROPS.has(node.name.name)) return;
        const { value } = node;
        if (value?.type === 'Literal' && typeof value.value === 'string') {
          if (LETTERS.test(value.value)) report(value, value.value);
          return;
        }
        const expression = value?.type === 'JSXExpressionContainer' ? value.expression : null;
        if (expression?.type === 'Literal' && typeof expression.value === 'string') {
          if (LETTERS.test(expression.value)) report(expression, expression.value);
        }
        if (expression?.type === 'TemplateLiteral') {
          const raw = expression.quasis.map((quasi) => quasi.value.cooked ?? '').join('');
          if (LETTERS.test(raw)) report(expression, raw);
        }
      },
    };
  },
};

const FEATURE_PATH = /^src\/features\/([^/]+)(?:\/(.*))?$/;

const featureOf = (relativePath: string) =>
  /^src\/features\/([^/]+)\//.exec(relativePath)?.[1] ?? null;
const LOWER_LAYER = /^src\/(platform|shared)\//;

const noCrossFeatureDeepImport: NativeRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Features import each other through their public `index` entry; platform and shared code never import features.',
    },
    schema: [],
    messages: {
      deep: "Import '{{source}}' through its public entry '@/features/{{feature}}'.",
      layer:
        "{{layer}} code must not depend on features ('{{source}}'); move the shared piece down.",
    },
  },
  create(context) {
    const relativePath = projectRelativePath(context);
    const ownFeature = featureOf(relativePath);
    const lowerLayer = LOWER_LAYER.exec(relativePath)?.[1] ?? null;
    const check = (
      node:
        | ESTree.ImportDeclaration
        | ESTree.ExportNamedDeclaration
        | ESTree.ExportAllDeclaration
        | ESTree.ImportExpression,
    ) => {
      const source = node.source && 'value' in node.source ? node.source.value : undefined;
      if (typeof source !== 'string') return;
      let target: string | null = null;
      if (source.startsWith('@/')) target = path.posix.normalize(`src/${source.slice(2)}`);
      else if (source.startsWith('.'))
        target = path.posix.join(path.posix.dirname(relativePath), source);
      const match = target === null ? null : FEATURE_PATH.exec(target);
      if (!match) return;
      if (lowerLayer) {
        context.report({
          node: node.source ?? node,
          messageId: 'layer',
          data: { layer: lowerLayer, source },
        });
        return;
      }
      const publicEntry = !match[2] || /^index(?:\.[cm]?[jt]sx?)?$/.test(match[2]);
      if (publicEntry || match[1] === ownFeature) return;
      context.report({
        node: node.source ?? node,
        messageId: 'deep',
        data: { source, feature: match[1] },
      });
    };
    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
    };
  },
};

// Tool config folders (`.rnstorybook`, `.maestro`) are dot-prefixed kebab-case.
const KEBAB_SEGMENT = /^\.?[a-z0-9]+(-[a-z0-9]+)*$/;
// Expo Router names: `_layout`, `+not-found`, `(group)`, `[param]`, `[...rest]`.
const ROUTER_SEGMENT = /^(_layout|\+[a-z0-9-]+|\([a-z0-9-]+\)|\[(\.\.\.)?[a-zA-Z][a-zA-Z0-9]*\])$/;

// Extensions and platform suffixes (`.ios.tsx`, `.test.ts`) follow the last route bracket:
// the dots of `[...rest].tsx` belong to the name.
const stripExtensions = (basename: string) => {
  const dot = basename.indexOf('.', basename.lastIndexOf(']') + 1);
  return dot === -1 ? basename : basename.slice(0, dot);
};

const filenameConvention: NativeRule = {
  meta: {
    type: 'suggestion',
    docs: { description: 'kebab-case files and folders; Expo Router names only in src/app.' },
    schema: [],
    messages: {
      name: "'{{segment}}' in {{file}} must be kebab-case{{router}}.",
    },
  },
  create(context) {
    const relativePath = projectRelativePath(context);
    return {
      Program(node) {
        if (relativePath.startsWith('..')) return;
        const segments = relativePath.split('/');
        const isRoute = segments[0] === 'src' && segments[1] === 'app';
        segments[segments.length - 1] = stripExtensions(segments[segments.length - 1]);
        for (const segment of segments) {
          if (KEBAB_SEGMENT.test(segment)) continue;
          if (isRoute && ROUTER_SEGMENT.test(segment)) continue;
          context.report({
            node,
            messageId: 'name',
            data: {
              segment,
              file: relativePath,
              router: isRoute ? ' or an Expo Router name' : '',
            },
          });
          return;
        }
      },
    };
  },
};

// Resolve the actual import binding, including aliases and namespace/default imports.
// Stop at a nearer local binding so a shadowed name is not mistaken for React.
const isReactImport = (
  context: Rule.RuleContext,
  node: ESTree.Identifier,
  kind: 'memo' | 'namespace',
) => {
  let scope = context.sourceCode.getScope(node);
  while (scope) {
    const variable = scope.set.get(node.name);
    if (variable) {
      return variable.defs.some((definition) => {
        if (definition.type !== 'ImportBinding' || definition.parent.source.value !== 'react')
          return false;
        const specifier = definition.node;
        if (kind === 'namespace')
          return (
            specifier.type === 'ImportNamespaceSpecifier' ||
            specifier.type === 'ImportDefaultSpecifier'
          );
        return (
          specifier.type === 'ImportSpecifier' &&
          (specifier.imported.type === 'Identifier'
            ? specifier.imported.name
            : specifier.imported.value) === 'memo'
        );
      });
    }
    if (!scope.upper) return false;
    scope = scope.upper;
  }
  return false;
};

const isMemoCallee = (context: Rule.RuleContext, callee: ESTree.Expression | ESTree.Super) => {
  if (callee.type === 'Identifier') return isReactImport(context, callee, 'memo');
  if (callee.type !== 'MemberExpression' || callee.object.type !== 'Identifier') return false;
  const property = callee.computed
    ? callee.property.type === 'Literal' && callee.property.value
    : callee.property.type === 'Identifier' && callee.property.name;
  return property === 'memo' && isReactImport(context, callee.object, 'namespace');
};

const noMemoComparator: NativeRule = {
  meta: {
    type: 'problem',
    docs: { description: 'No custom memo comparators; keep props stable instead.' },
    schema: [],
    messages: {
      comparator:
        'Custom memo comparators hide unstable props and break with the React Compiler; pass stable props instead.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (isMemoCallee(context, node.callee) && node.arguments.length > 1) {
          context.report({ node: node.arguments[1], messageId: 'comparator' });
        }
      },
    };
  },
};

export const pulseNativePlugin = {
  meta: { name: 'pulse-native' },
  rules: {
    'filename-convention': filenameConvention,
    'no-cross-feature-deep-import': noCrossFeatureDeepImport,
    'no-memo-comparator': noMemoComparator,
    'no-raw-jsx-text': noRawJsxText,
  },
};

export default pulseNativePlugin;
