import type { FC } from 'react';

import { UserCard } from './features/user-card/user-card';
import { users } from './shared/users';

import './styles/app.css';

export const AppShell: FC = () => (
  <main className='app-shell'>
    {users.map((user) => (
      <UserCard key={user.id} user={user} />
    ))}
  </main>
);
