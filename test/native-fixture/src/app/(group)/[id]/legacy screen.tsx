import { Text } from 'react-native';

import { translate } from '@/shared/i18n';

export default function LegacyScreen() {
  return <Text>{translate('greeting.title')}</Text>;
}
