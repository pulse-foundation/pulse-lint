import { Pressable, View } from 'react-native';

import { GreetingText } from '@/features/greeting';
import { translate } from '@/shared/i18n';

export function InboxScreen({ onOpen }: { onOpen: () => void }) {
  return (
    <View>
      <GreetingText />
      <Pressable accessibilityLabel={translate('inbox.open')} onPress={onOpen} />
    </View>
  );
}
