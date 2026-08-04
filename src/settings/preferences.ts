import { createMMKV } from 'react-native-mmkv';

import type { AccessLevel } from 'src/call/types';
import { isSupportedLocale, type SupportedLocale } from 'src/i18n/supported';
import { isLeadMinutes, type LeadMinutes } from 'src/notifications/reminders';

// Les quatre réglages que l'écran Réglages expose.
//
// Ils vivent sur l'appareil parce que meet n'a pas de profil utilisateur pour
// les porter — même raison que `src/rooms/titles.ts`, et même conséquence
// assumée : ils ne suivent pas la personne d'un appareil à l'autre.
export type Preferences = {
  readonly micOffOnJoin: boolean;
  readonly cameraOffOnJoin: boolean;
  readonly defaultAccessLevel: AccessLevel;
  // `null` vaut « suivre la langue du système », le comportement d'origine de
  // `resolveLocale`. Une chaîne vide ne conviendrait pas : elle est
  // indiscernable d'une locale inconnue.
  readonly language: SupportedLocale | null;
  // Le délai du rappel avant une réunion, `null` valant « jamais ».
  //
  // Un seul champ plutôt qu'un booléen ET un délai : deux champs autoriseraient
  // l'état bâtard « activé, mais quel délai », qu'il faudrait alors trancher
  // partout où on les lit. C'est déjà l'idiome de `language` juste au-dessus.
  readonly reminderLeadMinutes: LeadMinutes | null;
};

// `public` et non le `trusted` du mockup.
//
// `AGENTS.md` : « A room creator must not need to be present for the meeting to
// start. `restricted` breaks this outright and `trusted` breaks it for external
// guests. » `create.tsx:55` défaut à `public` pour cette raison, et changer ce
// défaut ici le changerait pour tout le monde.
export const DEFAULT_PREFERENCES: Preferences = {
  micOffOnJoin: true,
  cameraOffOnJoin: false,
  defaultAccessLevel: 'public',
  language: null,
  // Muet par défaut. Une application qui se met à notifier sans qu'on le lui
  // ait demandé se fait couper ses notifications en bloc, et perd du même coup
  // celles qu'on aurait voulues.
  reminderLeadMinutes: null,
};

const store = createMMKV({ id: 'preferences' });

const ACCESS_LEVELS: readonly AccessLevel[] = ['public', 'trusted', 'restricted'];

function isAccessLevel(value: string): value is AccessLevel {
  return ACCESS_LEVELS.includes(value as AccessLevel);
}

export function readPreferences(): Preferences {
  const level = store.getString('defaultAccessLevel');
  const language = store.getString('language');
  const lead = store.getNumber('reminderLeadMinutes');
  return {
    micOffOnJoin: store.getBoolean('micOffOnJoin') ?? DEFAULT_PREFERENCES.micOffOnJoin,
    cameraOffOnJoin: store.getBoolean('cameraOffOnJoin') ?? DEFAULT_PREFERENCES.cameraOffOnJoin,
    // Validé plutôt que casté : une valeur écrite par une version antérieure
    // et retirée depuis passerait sinon jusqu'à `createRoom`, qui la refuserait
    // par un 400 sans que rien n'explique pourquoi.
    defaultAccessLevel:
      level !== undefined && isAccessLevel(level) ? level : DEFAULT_PREFERENCES.defaultAccessLevel,
    // Même raison : une locale retirée de `SUPPORTED_LOCALES` entre deux
    // versions ferait basculer i18next sur une langue qui n'existe plus.
    language: language !== undefined && isSupportedLocale(language) ? language : null,
    // Et encore la même : un délai retiré de `LEAD_MINUTES` entre deux versions
    // programmerait des rappels à une heure que plus aucune ligne de réglage
    // ne saurait afficher.
    reminderLeadMinutes: lead !== undefined && isLeadMinutes(lead) ? lead : null,
  };
}

export function writePreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
  // `null` est la seule valeur qu'on efface plutôt que d'écrire : c'est
  // l'absence de préférence, pas une préférence pour rien.
  if (value === null) {
    store.remove(key);
    return;
  }
  store.set(key, value);
}

// Réservé aux tests : remet le magasin dans l'état d'une installation neuve.
// Exporté plutôt que reconstruit dans chaque spec, pour que l'ensemble des clés
// à effacer reste au même endroit que celui des clés écrites.
export function resetPreferences(): void {
  for (const key of Object.keys(DEFAULT_PREFERENCES)) {
    store.remove(key);
  }
}
