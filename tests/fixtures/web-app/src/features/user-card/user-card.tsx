import type { FC } from 'react';

import type { User } from '../../shared/types';

import { useUserCard } from './use-user-card';

import './user-card.css';

type UserCardProps = {
  user: User;
};

export const UserCard: FC<UserCardProps> = ({ user }) => {
  const { statusLabel, roleLabel } = useUserCard(user);

  return (
    <article className='user-card'>
      <header className='user-card__header'>{user.name}</header>
      <p className='user-card__meta'>{roleLabel}</p>
      <p className='user-card__meta'>{statusLabel}</p>
    </article>
  );
};
