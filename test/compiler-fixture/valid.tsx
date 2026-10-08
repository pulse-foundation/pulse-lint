import { useRef, useMemo, useState, useEffect } from 'react';
const Child = ({ value }) => <div>{value}</div>;
export function Example({ value, user }) {
  const ref = useRef(0);
  const [state, setState] = useState(0);
  const doubled = useMemo(() => value * 2, [value]);
  const copy = { ...user, name: 'changed' };
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return (
    <button
      onClick={() => {
        ref.current++;
        setState(state + 1);
      }}
    >
      <Child value={doubled} />
      {copy.name}
      {state}
    </button>
  );
}
