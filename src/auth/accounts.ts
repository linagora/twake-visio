import { createMMKV } from 'react-native-mmkv';

import type { InstanceConfig } from 'src/instance/types';

export type Account = {
  readonly id: string;
  readonly instance: InstanceConfig;
  readonly email: string;
  readonly displayName: string;
};

// MMKV et non `expo-secure-store` : un compte porte une adresse et une
// configuration d'instance, jamais un jeton. La règle est posée en tête de
// `storage.ts` et elle vaut dans les deux sens — les secrets n'entrent pas ici,
// et le reste n'a rien à faire dans le trousseau, dont les valeurs sont bornées
// en taille et coûteuses à lire.
//
// Sans cette persistance, `accounts` et `activeId` ne vivaient qu'en mémoire :
// `app/index.tsx` retombait sur `/welcome` à CHAQUE démarrage à froid, et les
// jetons rangés dans le trousseau devenaient orphelins, puisque l'identifiant
// qui les indexe disparaissait avec le processus.
const store = createMMKV({ id: 'accounts' });
const ACCOUNTS_KEY = 'accounts';
const ACTIVE_KEY = 'active';

let accounts: Account[] = [];
let activeId: string | null = null;

// Les entrées relues sont validées plutôt que converties par assertion. Elles
// viennent de notre propre écriture, mais une écriture partielle ou un champ
// ajouté depuis rendraient un objet incomplet — et un compte malformé ne casse
// pas ici, il casse plus tard sur l'écran qui le lit. Une entrée douteuse est
// donc jetée, pas réparée.
function isAccount(value: unknown): value is Account {
  if (typeof value !== 'object' || value === null) return false;
  const a = value as Record<string, unknown>;
  if (typeof a.id !== 'string' || a.id.length === 0) return false;
  if (typeof a.email !== 'string' || typeof a.displayName !== 'string') return false;
  if (typeof a.instance !== 'object' || a.instance === null) return false;
  const i = a.instance as Record<string, unknown>;
  return (
    typeof i.serverUrl === 'string' &&
    typeof i.issuer === 'string' &&
    typeof i.clientId === 'string' &&
    typeof i.livekitUrl === 'string'
  );
}

function persist(): void {
  store.set(ACCOUNTS_KEY, JSON.stringify(accounts));
  if (activeId === null) store.remove(ACTIVE_KEY);
  else store.set(ACTIVE_KEY, activeId);
}

function hydrate(): void {
  const raw = store.getString(ACCOUNTS_KEY);
  if (raw === undefined) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(parsed)) return;
  accounts = parsed.filter(isAccount);

  // Un identifiant actif qui ne désigne plus rien est écarté ici plutôt que
  // laissé à `getActiveAccount`, qui rendrait `null` sans jamais nettoyer : le
  // prochain `addAccount` croirait alors qu'un compte est déjà actif et
  // n'activerait pas le sien.
  const active = store.getString(ACTIVE_KEY) ?? null;
  activeId = accounts.some((a) => a.id === active) ? active : null;
}

hydrate();

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
  persist();
  return account;
}

export function listAccounts(): readonly Account[] {
  return accounts;
}

export function getActiveAccount(): Account | null {
  return accounts.find((a) => a.id === activeId) ?? null;
}

export function setActiveAccount(id: string): void {
  if (!accounts.some((a) => a.id === id)) return;
  activeId = id;
  persist();
}

export function removeAccount(id: string): void {
  accounts = accounts.filter((a) => a.id !== id);
  if (activeId === id) activeId = accounts[0]?.id ?? null;
  persist();
}

export function resetAccountsForTest(): void {
  accounts = [];
  activeId = null;
  // Efface aussi le magasin : sans cela l'état d'un test survivrait au suivant
  // par la relecture, et la suite deviendrait dépendante de son ordre.
  store.remove(ACCOUNTS_KEY);
  store.remove(ACTIVE_KEY);
}
