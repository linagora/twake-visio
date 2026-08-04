import { createMMKV } from 'react-native-mmkv';

// La session invité : un serveur, et le nom que les autres verront.
//
// MMKV et non la mémoire seule. Android peut tuer le processus pendant une
// séance puis restaurer l'activité : une session en mémoire laisserait l'écran
// d'appel sans serveur à interroger, et la réunion se refermerait sans raison
// lisible.
export type GuestSession = {
  readonly serverUrl: string;
  readonly displayName: string;
};

const store = createMMKV({ id: 'guest' });

// DEUX clés, de durées de vie différentes, et c'est tout le sujet de ce module.
//
// `serverUrl` EST la session : elle naît quand quelqu'un engage une réunion en
// invité et meurt quand il en sort. `name` lui survit — c'est une commodité
// qu'on mémorise pour ne pas faire retaper son nom à chaque fois, jamais une
// session. Les confondre ferait l'un des deux défauts : un nom réclamé à chaque
// réunion, ou une session fantôme qu'un lien profond reprendrait en silence
// avec le serveur de la réunion PRÉCÉDENTE.
const SERVER_KEY = 'serverUrl';
const NAME_KEY = 'name';

export function startGuestSession(serverUrl: string): void {
  store.set(SERVER_KEY, serverUrl);
}

// PAS de garde sur la chaîne VIDE, et c'est une mesure, pas un oubli. MMKV rend
// `undefined` — jamais `''` — pour une clé absente ou retirée
// (`MMKV.nitro.d.ts:45-62`, un getter par type), et les trois appelants de
// `startGuestSession` passent une chaîne non vide : `welcome.tsx` construit
// `https://${hôte}`, `openMeeting.ts` rend `DEFAULT_SERVER_URL` ou
// `https://${host}`. `serverUrl.length === 0` n'avait donc aucune valeur
// d'entrée capable de la rendre vraie — le même faux garde-fou que celui déjà
// retiré de `normalizeHostInput` (Tâche 5), et aucun test ne peut distinguer
// les deux chemins puisqu'ils mènent au même `null`.
//
// Ne pas la remettre sans un appelant qui, lui, sépare les deux. Il n'y en a
// pas aujourd'hui.
export function getGuestSession(): GuestSession | null {
  const serverUrl = store.getString(SERVER_KEY);
  if (serverUrl === undefined) return null;
  return { serverUrl, displayName: readRememberedGuestName() };
}

// Rendue même sans session en cours : le pré-join en pré-remplit son champ, et
// il le fait avant que le nom ait été confirmé.
export function readRememberedGuestName(): string {
  return store.getString(NAME_KEY) ?? '';
}

export function rememberGuestName(displayName: string): void {
  store.set(NAME_KEY, displayName);
}

// Retire la SESSION, jamais le nom. Voir le commentaire des deux clés.
export function endGuestSession(): void {
  store.remove(SERVER_KEY);
}

export function resetGuestForTest(): void {
  store.remove(SERVER_KEY);
  store.remove(NAME_KEY);
}
