import { useForm } from 'react-hook-form';
export function Example() {
  const { watch } = useForm();
  return <div>{watch('name')}</div>;
}
