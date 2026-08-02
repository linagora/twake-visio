import { createMMKV } from 'react-native-mmkv';

import {
  DEFAULT_PREFERENCES,
  readPreferences,
  resetPreferences,
  writePreference,
} from 'src/settings/preferences';

describe('préférences', () => {
  beforeEach(() => {
    resetPreferences();
  });

  describe('les défauts', () => {
    // Le mockup fixe `trusted`. AGENTS.md écrit qu'un créateur ne doit pas avoir
    // à être présent pour que la réunion démarre, et que `trusted` casse cela
    // pour les invités externes ; `create.tsx:55` défaut à `public` pour cette
    // raison. Le dépôt gagne, et ce test est la garde de cette décision.
    it('défaut à public pour le niveau d’accès, pas au trusted du mockup', () => {
      expect(DEFAULT_PREFERENCES.defaultAccessLevel).toBe('public');
    });

    it('défaut à micro coupé et caméra active, comme le mockup', () => {
      expect(DEFAULT_PREFERENCES.micOffOnJoin).toBe(true);
      expect(DEFAULT_PREFERENCES.cameraOffOnJoin).toBe(false);
    });

    // `null` et non `'en'` : la valeur veut dire « suivre le système », qui est
    // le comportement d'origine de `resolveLocale`.
    it('défaut à null pour la langue, ce qui veut dire suivre le système', () => {
      expect(DEFAULT_PREFERENCES.language).toBe(null);
    });

    it('rend les défauts quand rien n’a jamais été écrit', () => {
      expect(readPreferences()).toEqual(DEFAULT_PREFERENCES);
    });
  });

  describe('l’aller-retour', () => {
    // Les deux valeurs de chaque booléen : un magasin qui rendrait toujours son
    // défaut passerait un test qui n'écrit que la valeur par défaut.
    it.each([true, false])('relit micOffOnJoin à %s', (value) => {
      writePreference('micOffOnJoin', value);
      expect(readPreferences().micOffOnJoin).toBe(value);
    });

    it.each([true, false])('relit cameraOffOnJoin à %s', (value) => {
      writePreference('cameraOffOnJoin', value);
      expect(readPreferences().cameraOffOnJoin).toBe(value);
    });

    it.each(['public', 'trusted', 'restricted'] as const)('relit le niveau %s', (level) => {
      writePreference('defaultAccessLevel', level);
      expect(readPreferences().defaultAccessLevel).toBe(level);
    });

    it('relit une langue choisie', () => {
      writePreference('language', 'vi');
      expect(readPreferences().language).toBe('vi');
    });

    it('n’écrase pas les autres préférences en en écrivant une', () => {
      writePreference('micOffOnJoin', false);
      writePreference('language', 'ru');
      expect(readPreferences().micOffOnJoin).toBe(false);
      expect(readPreferences().language).toBe('ru');
    });
  });

  describe('le retour au système', () => {
    // La branche « effacer » doit être empruntée après une écriture, sinon un
    // `store.remove` jamais appelé passerait inaperçu.
    it('revient à la langue du système quand on repose null', () => {
      writePreference('language', 'de');
      writePreference('language', null);
      expect(readPreferences().language).toBe(null);
    });
  });

  describe('la robustesse', () => {
    // Une locale retirée de la liste entre deux versions ne doit pas ressortir
    // du magasin : i18next basculerait sur une langue qui n'existe plus.
    it('ignore une langue stockée qui n’est plus supportée', () => {
      writePreference('language', 'de');
      writeRawLanguage('kl');
      expect(readPreferences().language).toBe(null);
    });
  });
});

// Écrit directement dans le magasin, en court-circuitant le typage, pour
// simuler une valeur laissée par une version antérieure de l'application.
//
// Import nommé ordinaire, et non l'idiome `require` d'`AGENTS.md` : celui-ci ne
// sert qu'à ESPIONNER un export de module. Ici on ne fait qu'appeler la
// fonction, et le mock est substitué automatiquement.
function writeRawLanguage(value: string): void {
  createMMKV({ id: 'preferences' }).set('language', value);
}
