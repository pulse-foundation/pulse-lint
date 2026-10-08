import { useCallback } from 'react';
export function useExample(props) {
  const values = [];
  useOtherHook();
  values.push(props);
  return useCallback(() => {
    notify();
    return [values];
  }, [values]);
}
