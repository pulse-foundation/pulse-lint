export function Example({ user }) {
  user.name = 'changed';
  return <div>{user.name}</div>;
}
