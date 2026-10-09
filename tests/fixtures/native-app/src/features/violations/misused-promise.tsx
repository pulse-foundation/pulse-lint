import { Pressable } from 'react-native';

import { translate } from '@/shared/i18n';

async function save(): Promise<number> {
  return await Promise.resolve(1);
}

export function SaveButton() {
  return (
    <Pressable
      accessibilityLabel={translate('inbox.open')}
      onPress={async () => {
        await save();
      }}
    />
  );
}
