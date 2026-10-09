import { Text } from 'react-native';

import { translate } from '@/shared/i18n';

export default function NotFound() {
  return <Text>{translate('notFound.title')}</Text>;
}
