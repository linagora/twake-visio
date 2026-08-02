// La liste des locales, isolée dans un module SANS import.
//
// Elle vivait dans `src/i18n/index.ts`, qui importe les sept fichiers de
// traduction et initialise i18next. `src/settings/preferences.ts` a besoin du
// seul type `SupportedLocale`, et `index.ts` a besoin de lire la préférence de
// langue : les deux modules s'importeraient l'un l'autre.
//
// Ce fichier est la feuille qui rompt le cycle. Il n'importe rien, et c'est sa
// seule raison d'être — ne rien y ajouter qui en importerait.
export const SUPPORTED_LOCALES = ['en', 'fr', 'es', 'it', 'de', 'vi', 'ru'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
