import type { InstanceConfig } from 'src/instance/types';

export type Account = {
  readonly id: string;
  readonly instance: InstanceConfig;
  readonly email: string;
  readonly displayName: string;
};

let accounts: Account[] = [];
let activeId: string | null = null;

// Les deux parties sont encodées avant d'être jointes. Sans cela, un `sub` de la
// forme `google-oauth2|109` — que certains fournisseurs OIDC émettent réellement —
// rendrait deux comptes distincts strictement identiques : `iss|google-oauth2|109`
// se lit aussi bien comme (`iss`, `google-oauth2|109`) que comme
// (`iss|google-oauth2`, `109`). Ils se confondraient dans le registre.
export function makeAccountId(issuer: string, sub: string): string {
  return `${encodeURIComponent(issuer)}|${encodeURIComponent(sub)}`;
}

// N'active le compte que s'il n'y en a pas déjà un, ou s'il s'agit de lui-même.
// Un rafraîchissement de session en arrière-plan repasse par ici, et volerait
// sinon le compte actif à celui que l'utilisateur regarde.
export function addAccount(account: Account): Account {
  const known = accounts.some((a) => a.id === account.id);
  accounts = known
    ? accounts.map((a) => (a.id === account.id ? account : a))
    : [...accounts, account];
  if (activeId === null) activeId = account.id;
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
