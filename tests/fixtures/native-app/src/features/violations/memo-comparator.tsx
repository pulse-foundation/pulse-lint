import { memo } from 'react';
import { Text } from 'react-native';

function Label({ value }: { value: string }) {
  return <Text>{value}</Text>;
}

export const MemoLabel = memo(Label, (previous, next) => previous.value === next.value);
