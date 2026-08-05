import { DEFAULT_SERVER_URL } from 'src/constants';
import { resolveDeepLink } from 'src/navigation/openMeeting';

const HOSTS = ['meet.linagora.com'] as const;

describe('resolveDeepLink', () => {
  it('rend la route de pré-join pour un lien reconnu', () => {
    expect(resolveDeepLink('https://meet.linagora.com/abc-defg-hij', HOSTS, true)).toEqual({
      route: '/room/abc-defg-hij/prejoin',
      guestServerUrl: null,
    });
  });

  // Le trou bouché : sans compte, prejoin.tsx sortait de son effet et rendait
  // un sablier ÉTERNEL — sans message, sans sortie.
  it('ouvre une session invité quand aucun compte n’est connecté', () => {
    expect(resolveDeepLink('https://meet.linagora.com/abc-defg-hij', HOSTS, false)).toEqual({
      route: '/room/abc-defg-hij/prejoin',
      guestServerUrl: 'https://meet.linagora.com',
    });
  });

  it('refuse un hôte hors allowlist sans compte', () => {
    expect(resolveDeepLink('https://evil.example/abc-defg-hij', HOSTS, false)).toBe(null);
  });

  // L'allowlist des liens profonds reste STRICTE même pour un compte déjà
  // connecté : un lien profond arrive sans qu'on l'ait demandé, à la
  // différence d'un collage délibéré — c'est tout l'écart entre
  // `parseMeetingLink` et `parsePastedMeeting`, et l'élargir ici pour un
  // compte connecté annulerait cette protection.
  it('refuse un hôte hors allowlist même avec un compte connecté', () => {
    expect(resolveDeepLink('https://evil.example/abc-defg-hij', HOSTS, true)).toBe(null);
  });

  // LE test qui expose le défaut du plan d'origine. Son `try`/`catch` autour
  // d'un second `new URL(url)` ne pouvait JAMAIS jeter à cet endroit —
  // `parseMeetingLink` a déjà validé la même chaîne plus haut, donc un second
  // appel ne jette pas davantage — et pour ce schéma, `host` vaut le littéral
  // « room », pas une instance. Sans ce test, un lien `twakevisio://` ouvert
  // sans compte aurait démarré une session invité sur `https://room`. Vérifié
  // par mutation le 2026-08-05 : voir le rapport de tâche.
  it('ouvre une session invité sur le serveur PAR DÉFAUT pour un lien en schéma applicatif', () => {
    expect(resolveDeepLink('twakevisio://room/abc-defg-hij', HOSTS, false)).toEqual({
      route: '/room/abc-defg-hij/prejoin',
      guestServerUrl: DEFAULT_SERVER_URL,
    });
  });
});
