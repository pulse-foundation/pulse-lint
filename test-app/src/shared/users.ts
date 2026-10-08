import type { User } from './types';

export const users: User[] = [
  {
    id: 'user-1',
    name: 'Taylor',
    role: 'admin',
    online: true,
  },
  {
    id: 'user-2',
    name: 'Morgan',
    role: 'member',
    online: false,
  },
];
