import { Track } from 'livekit-client';
import type { Room } from 'livekit-client';
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

// Les deux sources que le système retire à une application d'arrière-plan.
// Mesuré sur Pixel 10 Pro Fold (API 36), séance en cours : `dumpsys
// media.camera` journalise `DISCONNECT … (PID 0)` — PID 0, donc un retrait par
// le SYSTÈME, à distinguer du même événement portant le pid de l'application,
// qui est un départ volontaire — et `dumpsys audio` fait tomber
// `Recording active` à `false`. La lecture continue : on entend les autres, eux
// ne nous voient ni ne nous entendent plus.
//
// Les deux sont retirées, mais elles ne se comportent PAS pareil au retour, et
// c'est mesuré : sur six cycles sans le crochet ci-dessous, `Recording active`
// est repassé à `true` six fois sur six — la couche native reprend le micro
// toute seule — tandis que la caméra n'a jamais été reprise, zéro fois sur six.
// Le micro est donc là par prudence et non par nécessité constatée : une
// reprise dont on ne tient pas le fil est une reprise sur laquelle on ne peut
// pas compter.
const INTERRUPTED_SOURCES = [Track.Source.Camera, Track.Source.Microphone] as const;

/**
 * Recapture les pistes locales après une interruption.
 *
 * `setCameraEnabled(room, true)` ne convient PAS ici, et c'est le piège de ce
 * défaut : tant qu'une publication existe, `setTrackEnabled` se contente d'un
 * `track.unmute()` et ne rappelle `createTracks()` que si rien n'est publié
 * (`livekit-client.esm.mjs`, `setTrackEnabled`). Or la publication survit très
 * bien à l'arrière-plan — LiveKit n'a jamais su que le système avait pris la
 * caméra. L'appel serait donc silencieusement sans effet.
 *
 * `restartTrack()` est la seule voie qui repasse par `getUserMedia`.
 */
export async function restartLocalCapture(room: Room): Promise<void> {
  for (const source of INTERRUPTED_SOURCES) {
    const publication = room.localParticipant.getTrackPublication(source);
    if (publication === undefined) continue;

    // La reprise rejoue l'état DÉSIRÉ, pas l'état constaté : une caméra que la
    // personne a coupée exprès doit le rester. `LocalTrack.restart()` recapture
    // sans regarder l'état coupé — la garde ne peut donc être qu'ici. C'est
    // aussi celle que LiveKit s'applique à lui-même (`!this.isMuted`).
    if (publication.isMuted) continue;

    const track = publication.track;
    if (track === undefined) continue;

    try {
      await track.restartTrack();
    } catch {
      // Isolé par source, à dessein : une permission retirée sur la caméra ne
      // doit pas laisser le micro muet pour le reste de la séance. Il n'y a
      // rien à dire à l'appelant — la seule action utile est déjà tentée.
    }
  }
}

/**
 * Rend à l'application la reprise que LiveKit n'exécute pas en React Native.
 *
 * `LocalTrack.handleAppVisibilityChanged()` fait déjà exactement ce travail —
 * mais `addAppVisibilityListener()` le câble sur `document.visibilitychange`,
 * sous une garde `isWeb()` qui vaut `typeof document !== 'undefined'`. Sans
 * `document`, React Native tombe dans la branche `else`, qui fixe
 * `isInBackground = false` et n'abonne rien : le gestionnaire n'est JAMAIS
 * appelé, et le `restart()` qu'il porte est du code mort ici.
 *
 * Mesuré par comparaison contrôlée le 2026-08-02, même appareil, même séance,
 * mêmes six cycles arrière-plan → retour, le crochet seul changeant :
 *
 *   sans : 0/6 reprise. Un unique `DISCONNECT`, jamais de `CONNECT`, et la
 *          tuile locale identique au pixel près d'une capture à l'autre.
 *   avec : 6/6, puis 3/3 encore après rétablissement du crochet — 9/9 en tout,
 *          la caméra reprise 2 à 3 secondes après le retour à l'avant-plan.
 */
export function useInterruptionRecovery(room: Room): void {
  // Un `ref` plutôt qu'un état : le changer ne doit rien re-rendre, et
  // l'abonnement doit lire la valeur courante sans se reposer.
  const interrupted = useRef(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status: AppStateStatus): void => {
      if (status !== 'active') {
        interrupted.current = true;
        return;
      }
      // Sans cette garde, un `active` reçu alors qu'on n'a jamais quitté
      // l'avant-plan recapturerait pour rien, et la capture se couperait
      // brièvement à chaque fois.
      if (!interrupted.current) return;
      interrupted.current = false;

      // Détachée à dessein : un écouteur d'`AppState` ne peut pas attendre, et
      // `restartLocalCapture` ne rejette jamais.
      void restartLocalCapture(room);
    });

    return () => subscription.remove();
  }, [room]);
}
