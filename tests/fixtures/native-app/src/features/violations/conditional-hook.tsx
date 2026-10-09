import { useState } from 'react';
import { Text } from 'react-native';

export function ConditionalHook({ enabled }: { enabled: boolean }) {
  if (enabled) {
    const [count] = useState(0);
    return <Text>{count}</Text>;
  }
  return null;
}
