import { useState, useEffect } from 'react';
export function Example({ value }) {
  const [state, setState] = useState(0);
  useEffect(() => {
    setState(value);
  }, [value]);
  return <div>{state}</div>;
}
