import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { signOut } from 'src/auth/login';
import { onSessionLost } from 'src/auth/session';

// Le préfixe des écrans de séance. Un chemin de salon peut être `prejoin`,
// `lobby` ou `call` ; les trois portent une caméra ou une attente qu'on ne
// coupe pas au milieu.
const ROOM_PREFIX = '/room/';

/**
 * Renvoie vers la connexion quand la session est définitivement perdue.
 *
 * **Sans lui, l'application reste inerte sans rien dire.** Mesuré le
 * 2026-08-03 : le SSO avait oublié la session, chaque écran authentifié
 * échouait, et la seule issue était de trouver le bouton « se déconnecter »
 * dans les réglages — un bouton que personne ne cherche quand rien n'annonce
 * que la session a expiré.
 *
 * `signOut` retire le COMPTE, pas seulement les jetons : `app/index.tsx`
 * redirige vers l'accueil tant qu'un compte actif subsiste, et on retomberait
 * aussitôt sur l'écran inerte.
 *
 * **Jamais pendant une séance.** Le jeton LiveKit a été frappé à l'entrée et
 * survit à la perte de session : la réunion continue parfaitement. Éjecter
 * quelqu'un d'une conversation en cours pour l'amener à un écran de connexion
 * serait le pire moment possible. La perte est mémorisée, et le renvoi se fait
 * dès la sortie.
 */
export function useSessionGuard(): void {
  const router = useRouter();
  const pathname = usePathname();
  const [lost, setLost] = useState(false);
  // Une REF, et non un état remis à faux : cet effet dépend du chemin, donc
  // sans marque il se rejouerait à chaque navigation. Un `setLost(false)`
  // ferait le même travail, mais poser un état depuis un effet déclenche des
  // rendus en cascade — et le lint du dépôt en fait une erreur.
  const handled = useRef(false);

  useEffect(() => onSessionLost(() => setLost(true)), []);

  useEffect(() => {
    if (!lost || handled.current) return;
    if (pathname.startsWith(ROOM_PREFIX)) return;

    handled.current = true;
    void signOut().finally(() => router.replace('/welcome'));
  }, [lost, pathname, router]);
}
