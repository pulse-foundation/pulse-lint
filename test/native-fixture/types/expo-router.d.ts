// Minimal typed stand-in for `expo-router` (see react-native.d.ts).
declare module 'expo-router' {
  import type { ReactNode } from 'react';

  export function Slot(): ReactNode;
  export function useLocalSearchParams<T extends Record<string, string>>(): Partial<T>;
}
