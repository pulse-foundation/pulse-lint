export function Example({ value }) {
  function Child() {
    return <div>{value}</div>;
  }
  return <Child />;
}
