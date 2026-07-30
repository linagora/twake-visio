import type { InstanceConfig } from 'src/instance/types';

export type Account = {
  readonly id: string;
  readonly instance: InstanceConfig;
  readonly email: string;
  readonly displayName: string;
};

let accounts: Account[] = [];
let activeId: string | null = null;

export function makeAccountId(issuer: string, sub: string): string {
  return `${issuer}|${sub}`;
}

export function addAccount(account: Account): Account {
  accounts = [...accounts.filter((a) => a.id !== account.id), account];
  activeId = account.id;
  return account;
}

export function listAccounts(): readonly Account[] {
  return accounts;
}

export function getActiveAccount(): Account | null {
  return accounts.find((a) => a.id === activeId) ?? null;
}

export function setActiveAccount(id: string): void {
  if (accounts.some((a) => a.id === id)) activeId = id;
}

export function removeAccount(id: string): void {
  accounts = accounts.filter((a) => a.id !== id);
  if (activeId === id) activeId = accounts[0]?.id ?? null;
}

export function resetAccountsForTest(): void {
  accounts = [];
  activeId = null;
}
