import { AudioSession } from '@livekit/react-native';
import { Platform } from 'react-native';

import { readAudioOutputs, type AudioOutputKind } from 'src/call/devices';

// 'system' : le sélecteur est celui d'iOS, on ne contrôle ni son apparence ni
// ses libellés. 'menu' : le nôtre, alimenté par `getAudioOutputs()`.
//
// Rendu comme une valeur plutôt que lu depuis `Platform` par le composant :
// c'est ce qui permet à une spec de rendre les deux branches sans bouchonner
// `Platform`.
export type AudioRouteControl = 'menu' | 'system';

export function audioRouteControl(): AudioRouteControl {
  return Platform.OS === 'ios' ? 'system' : 'menu';
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
