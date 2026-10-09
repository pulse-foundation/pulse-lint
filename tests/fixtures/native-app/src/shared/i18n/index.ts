const en = {
  'greeting.title': 'Hello',
  'inbox.open': 'Open inbox',
  'notFound.title': 'Not found',
} as const;

export type TranslationKey = keyof typeof en;

export function translate(key: TranslationKey): string {
  return en[key];
}
