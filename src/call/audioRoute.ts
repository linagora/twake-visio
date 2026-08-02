import { AudioSession } from '@livekit/react-native';
import { Platform } from 'react-native';

import {
  preferredAudioDevice,
  readAudioDevices,
  type AudioDeviceChoice,
} from 'src/call/audioDevices';
import { readAudioOutputs, type AudioOutputKind } from 'src/call/devices';
import { nativeAudioDevices } from 'src/call/nativeAudioDevices';

// 'system' : le sélecteur est celui d'iOS, on ne contrôle ni son apparence ni
// ses libellés. 'menu' : le nôtre, alimenté par `getAudioOutputs()`, par
// CATÉGORIE. 'devices' : le nôtre, alimenté par notre module natif, par
// APPAREIL NOMMÉ.
//
// Rendu comme une valeur plutôt que lu depuis `Platform` par le composant :
// c'est ce qui permet à une spec de rendre les trois branches sans bouchonner
// `Platform`.
export type AudioRouteControl = 'devices' | 'menu' | 'system';

// Le module natif rend `null` partout où il n'est pas lié — sous Jest, sur iOS,
// et dans un binaire construit sans lui. `isSupported()` ajoute le plancher
// API 31 : `getAvailableCommunicationDevices()` n'existe pas en dessous.
function ownsRoute(): boolean {
  const native = nativeAudioDevices;
  return native !== null && native.isSupported();
}

export function audioRouteControl(): AudioRouteControl {
  if (Platform.OS === 'ios') return 'system';
  return ownsRoute() ? 'devices' : 'menu';
}

// Un seul arbitre par séance. Sur le chemin 'devices' notre module prend le
// focus audio, le mode et la route ; AudioSwitch n'est JAMAIS démarré, sans
// quoi son prochain `onDeviceConnected` rappellerait `startBluetoothSco()` et
// écraserait notre `setCommunicationDevice()`.
export async function startAudioRoute(): Promise<void> {
  const native = nativeAudioDevices;
  if (native !== null && native.isSupported()) {
    await native.acquire();
    // APRÈS `acquire()`, jamais avant : `getAvailableCommunicationDevices()` se
    // lit une fois le mode de communication posé.
    //
    // Cet appel remplace ce qu'AudioSwitch faisait et que personne ne faisait
    // plus. Lui appelait `startBluetoothSco()` sur `onDeviceConnected` ; en lui
    // retirant le volant — à raison, deux arbitres sur le même canal étant la
    // cause classique du « le son est reparti tout seul » — on a emporté la
    // sélection automatique avec, sans la remplacer.
    await routeToPreferredDevice();
    return;
  }
  await AudioSession.startAudioSession();
}

// Rend `true` seulement si une route a été posée MAINTENANT et acceptée.
// `false` couvre quatre cas que l'appelant n'a pas à distinguer : pas de module
// natif, pas de casque à préférer, la route déjà en place, et un refus du
// système.
//
// Ne touche RIEN quand il n'y a pas de casque : arbitrer entre écouteur et
// haut-parleur n'est pas la question, et `setCommunicationDevice()` est un choix
// manuel du point de vue d'Android — une fois posé, il ne se défait qu'en le
// vidant.
export async function routeToPreferredDevice(): Promise<boolean> {
  const preferred = preferredAudioDevice(await listAudioDevices());
  if (preferred === null) return false;

  // GARDE-FOU DE BOUCLE, pas une optimisation.
  // `addOnCommunicationDeviceChangedListener` notifie aussi les changements que
  // NOUS provoquons — c'est écrit dans `TwakeAudioDevicesModule.acquireRoute`,
  // et c'est même la raison d'être de cet écouteur. Comme
  // `watchPreferredDevice` rappelle cette fonction à chaque notification, sans
  // cette égalité elle se rappellerait elle-même sans fin.
  if ((await readCurrentAudioDeviceId()) === preferred.id) return false;

  return selectAudioDevice(preferred.id);
}

// L'écoute des changements de route : un casque qu'on allume en séance, une
// voiture qui se connecte, un casque qu'on débranche. Rend la fonction de
// désabonnement, et une fonction inerte quand le module n'est pas lié.
//
// `isManual()` est relu À CHAQUE notification et non capturé à l'abonnement :
// la personne peut choisir une sortie à la main entre deux événements, et ce
// choix doit tenir. Un choix manuel désarme la préférence pour le reste de la
// séance — jusqu'à ce qu'elle rende la main au système.
export function watchPreferredDevice(isManual: () => boolean): () => void {
  const native = nativeAudioDevices;
  // La MÊME garde que `startAudioRoute`, et pas seulement `native === null` :
  // sous le plancher API 31 c'est AudioSwitch qui conduit, et il fait déjà la
  // bascule. Écouter là poserait un second arbitre sur le même canal.
  if (native === null || !native.isSupported()) return () => undefined;

  const subscription = native.addListener('onDevicesChanged', () => {
    if (isManual()) return;
    void routeToPreferredDevice();
  });
  return () => subscription.remove();
}

export async function stopAudioRoute(): Promise<void> {
  const native = nativeAudioDevices;
  if (native !== null && native.isSupported()) {
    await native.release();
    return;
  }
  await AudioSession.stopAudioSession();
}

// Rend `[]` tant que `startAudioSession()` n'a pas tourné — c'est-à-dire au
// pré-écran, jamais en séance. Sur iOS, rend toujours `[]` : les deux
// constantes de la plateforme ('default', 'force_speaker') ne sont pas des
// catégories que `readAudioOutputs` reconnaît, et le mode 'system' ne les
// utilise pas.
export async function listAudioOutputs(): Promise<readonly AudioOutputKind[]> {
  return readAudioOutputs(await AudioSession.getAudioOutputs());
}

// Ne rapporte jamais d'échec, et ce n'est pas un oubli : la promesse native est
// résolue avant que le travail ne soit posté sur son handler, et un identifiant
// inconnu est un no-op silencieux. La signature dit `Promise<void>` parce qu'il
// n'y a rien d'autre à dire ; l'appelant n'a pas d'échec à traiter.
//
// C'est aussi l'appel qui désarme la bascule automatique au branchement d'un
// casque, pour le reste de la séance : « preferredOutputList is ignored when an
// output is manually selected ».
export async function selectAudioOutput(kind: AudioOutputKind): Promise<void> {
  await AudioSession.selectAudioOutput(kind);
}

// iOS seulement. Le wrapper de LiveKit est déjà gardé par `Platform.OS === 'ios'`
// et la méthode native n'a pas de resolver : rien ne dit si le sélecteur est
// apparu. Sur Android l'appel résout sans rien faire.
export async function openSystemRoutePicker(): Promise<void> {
  await AudioSession.showAudioRoutePicker();
}

// Le chemin 'devices'. `[]` quand le module n'est pas là : l'écran retombe
// alors sur le mode 'menu', qui ne lit pas cette liste.
export async function listAudioDevices(): Promise<readonly AudioDeviceChoice[]> {
  const native = nativeAudioDevices;
  if (native === null) return [];
  return readAudioDevices(await native.listDevices());
}

// Rend ce que `setCommunicationDevice()` a rendu : `false` dit que le système a
// refusé la route, et l'écran doit alors laisser la coche où elle était.
export async function selectAudioDevice(id: number): Promise<boolean> {
  const native = nativeAudioDevices;
  if (native === null) return false;
  return native.selectDevice(id);
}

// `clearCommunicationDevice()` — le retour à l'automatique qu'AudioSwitch ne
// sait pas faire : `setUserSelectedAudioDevice` y est `protected`, donc aucun
// appelant extérieur ne peut remettre le champ à `null`.
export async function clearAudioDevice(): Promise<void> {
  const native = nativeAudioDevices;
  if (native === null) return;
  await native.clearDevice();
}

// L'état CONSTATÉ, pas celui qu'on a demandé : `getCommunicationDevice()` dit
// où le son part vraiment. C'est ce qu'aucune API n'offrait au périmètre A.
export async function readCurrentAudioDeviceId(): Promise<number | null> {
  const native = nativeAudioDevices;
  if (native === null) return null;
  return native.getCurrentDeviceId();
}
