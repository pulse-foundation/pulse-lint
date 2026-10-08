import { useRef } from 'react';
import { Text } from 'react-native';

export function RefInRender() {
  const renders = useRef(0);
  return <Text>{renders.current}</Text>;
}
