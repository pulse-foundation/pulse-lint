import { useMemo } from 'react';
export function Example({ value }) {
  const result = useMemo(() => {
    value * 2;
  }, [value]);
  return <div>{result}</div>;
}
