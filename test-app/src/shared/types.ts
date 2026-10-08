export type UserRole = 'admin' | 'member';

export type User = {
  id: string;
  name: string;
  role: UserRole;
  online: boolean;
};
