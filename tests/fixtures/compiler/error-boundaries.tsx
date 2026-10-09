export function Example({ value }) {
  try {
    return <div>{value}</div>;
  } catch {
    return null;
  }
}
