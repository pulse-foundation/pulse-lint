import { useState } from 'react';
export function Example() {
  const [state, setState] = useState(0);
  setState(state + 1);
  return <div>{state}</div>;
}
