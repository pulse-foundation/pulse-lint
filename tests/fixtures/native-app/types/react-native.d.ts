// Minimal typed stand-in for `react-native`: the package is installed only under apps/mobile, so
// it does not resolve from this fixture. Typed props keep the type-aware rules meaningful.
declare module 'react-native' {
  import type { ReactNode } from 'react';

  export interface TextProps {
    children?: ReactNode;
  }
  export function Text(props: TextProps): ReactNode;

  export interface PressableProps {
    accessibilityLabel?: string;
    children?: ReactNode;
    onPress?: () => void;
  }
  export function Pressable(props: PressableProps): ReactNode;

  export interface ViewProps {
    children?: ReactNode;
  }
  export function View(props: ViewProps): ReactNode;
}
