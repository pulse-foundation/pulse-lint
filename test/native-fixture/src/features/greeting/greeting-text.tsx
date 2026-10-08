import { Text } from 'react-native';

import { translate } from '@/shared/i18n';

export function GreetingText() {
  return <Text>{translate('greeting.title')}</Text>;
}
