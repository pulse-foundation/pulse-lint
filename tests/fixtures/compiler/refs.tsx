import { useRef } from 'react';
export function Example() {
  const ref = useRef(0);
  return <div>{ref.current}</div>;
}
