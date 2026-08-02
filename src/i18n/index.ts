import { getLocales } from 'expo-localization';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import 'intl-pluralrules';

import de from 'src/i18n/locales/de.json';
import en from 'src/i18n/locales/en.json';
import es from 'src/i18n/locales/es.json';
import fr from 'src/i18n/locales/fr.json';
import it from 'src/i18n/locales/it.json';
import ru from 'src/i18n/locales/ru.json';
import vi from 'src/i18n/locales/vi.json';
import { isSupportedLocale } from 'src/i18n/supported';

// Réexportés pour les appelants existants — `src/i18n/index.spec.ts` les lit
// ici. La définition vit dans `supported.ts`, un module sans import, pour que
// `src/settings/preferences.ts` puisse en dépendre sans former de cycle avec ce
// fichier-ci, qui lira la préférence de langue.
export { SUPPORTED_LOCALES, isSupportedLocale, type SupportedLocale } from 'src/i18n/supported';

const resources = {
  en: { translation: en },
  fr: { translation: fr },
  es: { translation: es },
  it: { translation: it },
  de: { translation: de },
  vi: { translation: vi },
  ru: { translation: ru },
};

function resolveLocale(): string {
  const preferred = getLocales()[0]?.languageCode ?? 'en';
  return isSupportedLocale(preferred) ? preferred : 'en';
}

export async function initI18n(): Promise<void> {
  await i18next.use(initReactI18next).init({
    resources,
    lng: resolveLocale(),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
}
