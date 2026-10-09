import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { InboxScreen } from '@/features/inbox';

export default function RestRoute() {
  const { rest } = useLocalSearchParams<{ rest: string }>();
  return (
    <View>
      <Text>{rest}</Text>
      <InboxScreen onOpen={() => {}} />
    </View>
  );
}
