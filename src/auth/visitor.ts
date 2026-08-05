import { getActiveAccount, type Account } from 'src/auth/accounts';
import { getGuestSession } from 'src/auth/guest';

// Qui frappe à la porte d'un salon.
//
// Ce type existe pour que le branchement « compte ou invité » se fasse UNE
// fois, dans la couche API, au lieu d'une fois par écran. Sans lui, chaque
// fonction de `src/api/rooms.ts` aurait sa jumelle anonyme, et chaque écran
// devrait choisir laquelle appeler.
export type Visitor =
  | { readonly kind: 'account'; readonly account: Account }
  | { readonly kind: 'guest'; readonly serverUrl: string; readonly displayName: string };

// Le compte D'ABORD, et l'ordre n'est pas indifférent : une session invité peut
// traîner dans le magasin après une connexion, et la reprendre ferait entrer
// quelqu'un de connecté sous le nom d'un invité — sans jeton porteur, donc sans
// aucun de ses droits de modération.
export function getVisitor(): Visitor | null {
  const account = getActiveAccount();
  if (account !== null) return { kind: 'account', account };

  const guest = getGuestSession();
  if (guest !== null) {
    return { kind: 'guest', serverUrl: guest.serverUrl, displayName: guest.displayName };
  }
  return null;
}

export function visitorServerUrl(visitor: Visitor): string {
  return visitor.kind === 'account' ? visitor.account.instance.serverUrl : visitor.serverUrl;
}

export function visitorName(visitor: Visitor): string {
  return visitor.kind === 'account' ? visitor.account.displayName : visitor.displayName;
}
