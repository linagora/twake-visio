import en from 'src/i18n/locales/en.json';
import de from 'src/i18n/locales/de.json';
import es from 'src/i18n/locales/es.json';
import fr from 'src/i18n/locales/fr.json';
import itLocale from 'src/i18n/locales/it.json';
import ru from 'src/i18n/locales/ru.json';
import vi from 'src/i18n/locales/vi.json';
import { SUPPORTED_LOCALES } from 'src/i18n';

describe('locales', () => {
  it('couvre les sept langues exigées', () => {
    expect([...SUPPORTED_LOCALES].sort()).toEqual(
      ['de', 'en', 'es', 'fr', 'it', 'ru', 'vi'].sort(),
    );
  });

  it('ne laisse aucune clé manquante dans une locale', () => {
    const reference = Object.keys(en).sort();
    for (const [name, bundle] of Object.entries({ fr, es, it: itLocale, de, vi, ru })) {
      expect({ [name]: Object.keys(bundle).sort() }).toEqual({ [name]: reference });
    }
  });
});
