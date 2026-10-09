import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { InboxScreen } from '@/features/inbox';

export default function ItemRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View>
      <Text>{id}</Text>
      <InboxScreen onOpen={() => {}} />
    </View>
  );
}
