import { mediaDevices, type MediaStream } from '@livekit/react-native-webrtc';
import { useEffect, useState } from 'react';

// L'aperçu caméra du pré-join, et surtout son CYCLE DE VIE.
//
// `VideoTrack` de `@livekit/react-native` ne convient pas ici : il attend une
// `TrackReference` d'une `Room` connectée, et le pré-join précède la connexion.
// C'est `stage.tsx` qui l'emploie, après. Ici la voie est brute —
// `getUserMedia` puis `RTCView` sur l'URL du flux.
//
// Ce module existe séparément du composant pour une seule raison : le risque de
// ce lot n'est pas l'affichage, c'est la LIBÉRATION. Une caméra acquise et
// jamais relâchée reste allumée, témoin lumineux compris, après qu'on a quitté
// l'écran — et cela ne se voit sur aucune capture d'écran.

function releaseStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

// Rend l'URL du flux à passer en `streamURL`, ou `null` — caméra coupée, pas
// encore acquise, ou permission refusée. L'appelant distingue ces trois cas par
// ce qu'il affiche à la place, pas par cette valeur.
export function useCameraPreview(enabled: boolean): string | null {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);

  useEffect(() => {
    // Aucun `setStreamUrl(null)` ici : appeler `setState` dans le CORPS d'un
    // effet déclenche des rendus en cascade, et `react-hooks/set-state-in-effect`
    // le refuse. Ce n'est pas nécessaire — quand `enabled` passe à faux, c'est
    // le nettoyage de l'effet PRÉCÉDENT qui remet l'URL à null, avant que
    // celui-ci ne s'exécute.
    if (!enabled) return;

    // `cancelled` couvre LE cas qui fuit : `getUserMedia` est asynchrone, et
    // quitter l'écran pendant qu'elle résout laisserait une piste vivante que
    // plus personne ne référence. Le nettoyage ne peut pas l'arrêter — il ne la
    // connaît pas encore — donc c'est la résolution elle-même qui doit le
    // faire.
    let cancelled = false;
    let acquired: MediaStream | null = null;

    mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        if (cancelled) {
          releaseStream(stream);
          return;
        }
        acquired = stream;
        setStreamUrl(stream.toURL());
      })
      .catch(() => {
        // Le refus de permission est le cas courant, pas l'exception : l'écran
        // reste utilisable sans image, et l'appelant affiche l'avatar.
        if (!cancelled) setStreamUrl(null);
      });

    return () => {
      cancelled = true;
      if (acquired !== null) releaseStream(acquired);
      setStreamUrl(null);
    };
  }, [enabled]);

  return streamUrl;
}
