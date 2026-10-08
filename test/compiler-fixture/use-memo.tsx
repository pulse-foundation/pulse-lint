import { useMemo } from 'react';
export function Example({ value }) {
  const result = useMemo(async () => value * 2, [value]);
  return <div>{result}</div>;
}
