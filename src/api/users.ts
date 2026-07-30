import { authedFetch } from 'src/api/client';
import type { ApiResult } from 'src/api/types';
import type { Account } from 'src/auth/accounts';

export type Me = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
};

type RawMe = { id: string; email: string; full_name?: string; short_name?: string };

export async function fetchMe(account: Account): Promise<ApiResult<Me>> {
  const result = await authedFetch<RawMe>(account, '/api/v1.0/users/me/');
  if (!result.ok) return result;
  const raw = result.value;
  return {
    ok: true,
    value: {
      id: raw.id,
      email: raw.email,
      displayName: raw.full_name ?? raw.short_name ?? raw.email,
    },
  };
}

// Recherche par similarité trigramme sur l'email. Le backend renvoie une liste
// vide quand ALLOW_UNSECURE_USER_LISTING est désactivé — indistinguable d'une
// absence de résultat côté client, d'où la formulation neutre de l'écran appelant.
export async function searchUsers(
  account: Account,
  query: string,
): Promise<ApiResult<readonly Me[]>> {
  const result = await authedFetch<{ results: RawMe[] }>(
    account,
    `/api/v1.0/users/?q=${encodeURIComponent(query)}`,
  );
  if (!result.ok) return result;
  return {
    ok: true,
    value: result.value.results.map((raw) => ({
      id: raw.id,
      email: raw.email,
      displayName: raw.full_name ?? raw.short_name ?? raw.email,
    })),
  };
}
