import { useMemo } from 'react';
export function Example({ value }) {
  useMemo(() => value * 2, [value]);
  return <div>{value}</div>;
}
