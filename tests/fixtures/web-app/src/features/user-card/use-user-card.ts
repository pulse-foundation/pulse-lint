import { useMemo } from 'react';

import type { User } from '../../shared/types';

type UserCardState = {
  statusLabel: string;
  roleLabel: string;
};

export const useUserCard = (user: User): UserCardState =>
  useMemo(() => {
    return {
      statusLabel: user.online ? 'Online' : 'Offline',
      roleLabel: user.role === 'admin' ? 'Administrator' : 'Member',
    };
  }, [user]);
