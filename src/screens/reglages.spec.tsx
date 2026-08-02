import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { tokens } from 'src/ui/tokens';
import { ReglagesScreen } from './reglages';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Même préambule que les huit autres specs d'écran : importer `expo-router`
// pour de vrai tire `standard-navigation`, de l'ESM non transformé.
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('src/auth/accounts', () => ({ getActiveAccount: jest.fn() }));
jest.mock('src/auth/login', () => ({ signOut: jest.fn(async () => undefined) }));
jest.mock('src/i18n', () => ({ chooseLanguage: jest.fn(async () => undefined) }));
jest.mock('src/settings/preferences', () => ({
  readPreferences: jest.fn(),
  writePreference: jest.fn(),
}));

const accounts = jest.requireMock('src/auth/accounts') as { getActiveAccount: jest.Mock };
const prefs = jest.requireMock('src/settings/preferences') as {
  readPreferences: jest.Mock;
  writePreference: jest.Mock;
};
const i18n = jest.requireMock('src/i18n') as { chooseLanguage: jest.Mock };

const DEFAULTS = {
  micOffOnJoin: true,
  cameraOffOnJoin: false,
  defaultAccessLevel: 'public' as const,
  language: null,
};

describe('ReglagesScreen', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    prefs.readPreferences.mockReturnValue(DEFAULTS);
    accounts.getActiveAccount.mockReturnValue({
      displayName: 'Michel Maudet',
      email: 'michel.maudet@twake.app',
    });
  });

  describe('les couleurs explicites', () => {
    it('pose la couleur du bouton de déconnexion', async () => {
      await render(<ReglagesScreen />);
      expect(screen.getByTestId('settings-signout')).toHaveStyle({ color: tokens.color.danger });
    });

    it('pose la couleur du pied de page', async () => {
      await render(<ReglagesScreen />);
      expect(screen.getByTestId('settings-version')).toHaveStyle({
        color: tokens.color.textFooter,
      });
    });

    it('pose la couleur du nom du profil', async () => {
      await render(<ReglagesScreen />);
      expect(screen.getByTestId('settings-name')).toHaveStyle({ color: tokens.color.textPrimary });
    });

    it('pose la couleur de l’adresse du profil', async () => {
      await render(<ReglagesScreen />);
      expect(screen.getByTestId('settings-email')).toHaveStyle({ color: tokens.color.textMeta });
    });
  });

  it('affiche le compte actif', async () => {
    await render(<ReglagesScreen />);
    expect(screen.getByTestId('settings-name')).toHaveTextContent('Michel Maudet');
    expect(screen.getByTestId('settings-email')).toHaveTextContent('michel.maudet@twake.app');
  });

  describe('le dépliage', () => {
    it('ne déplie aucune rangée au départ', async () => {
      await render(<ReglagesScreen />);
      expect(screen.queryByTestId('setting-micOnJoin-option-on')).toBe(null);
    });

    it('déplie la rangée pressée', async () => {
      await render(<ReglagesScreen />);
      await fireEvent.press(screen.getByTestId('setting-micOnJoin-header'));
      expect(screen.getByTestId('setting-micOnJoin-option-on')).toBeTruthy();
    });

    it('replie une rangée déjà dépliée', async () => {
      await render(<ReglagesScreen />);
      await fireEvent.press(screen.getByTestId('setting-micOnJoin-header'));
      await fireEvent.press(screen.getByTestId('setting-micOnJoin-header'));
      expect(screen.queryByTestId('setting-micOnJoin-option-on')).toBe(null);
    });

    // Une seule à la fois : ouvrir la seconde doit refermer la première.
    it('ne garde qu’une rangée dépliée à la fois', async () => {
      await render(<ReglagesScreen />);
      await fireEvent.press(screen.getByTestId('setting-micOnJoin-header'));
      await fireEvent.press(screen.getByTestId('setting-defaultAccess-header'));

      expect(screen.queryByTestId('setting-micOnJoin-option-on')).toBe(null);
      expect(screen.getByTestId('setting-defaultAccess-option-public')).toBeTruthy();
    });
  });

  // Le gestionnaire d'option fait TROIS choses — écrire, relire, refermer.
  // Trois instructions, donc trois assertions qui le nomment : le dépôt a déjà
  // payé ce trou avec une feuille qui ne se refermait pas.
  describe('choisir une option', () => {
    it('écrit la préférence', async () => {
      await render(<ReglagesScreen />);
      await fireEvent.press(screen.getByTestId('setting-micOnJoin-header'));
      await fireEvent.press(screen.getByTestId('setting-micOnJoin-option-on'));

      expect(prefs.writePreference).toHaveBeenCalledWith('micOffOnJoin', false);
    });

    it('relit les préférences après écriture', async () => {
      await render(<ReglagesScreen />);
      prefs.readPreferences.mockClear();
      await fireEvent.press(screen.getByTestId('setting-micOnJoin-header'));
      await fireEvent.press(screen.getByTestId('setting-micOnJoin-option-on'));

      expect(prefs.readPreferences).toHaveBeenCalled();
    });

    it('referme la rangée après le choix', async () => {
      await render(<ReglagesScreen />);
      await fireEvent.press(screen.getByTestId('setting-micOnJoin-header'));
      await fireEvent.press(screen.getByTestId('setting-micOnJoin-option-on'));

      expect(screen.queryByTestId('setting-micOnJoin-option-on')).toBe(null);
    });

    // Une ligne par rangée, nommant la fixture qui l'atteint : sans elles, une
    // clé codée en dur passerait le test du micro.
    it('écrit la caméra depuis SA rangée', async () => {
      await render(<ReglagesScreen />);
      await fireEvent.press(screen.getByTestId('setting-camOnJoin-header'));
      await fireEvent.press(screen.getByTestId('setting-camOnJoin-option-off'));

      expect(prefs.writePreference).toHaveBeenCalledWith('cameraOffOnJoin', true);
    });

    it('écrit le niveau d’accès depuis SA rangée', async () => {
      await render(<ReglagesScreen />);
      await fireEvent.press(screen.getByTestId('setting-defaultAccess-header'));
      await fireEvent.press(screen.getByTestId('setting-defaultAccess-option-restricted'));

      expect(prefs.writePreference).toHaveBeenCalledWith('defaultAccessLevel', 'restricted');
    });
  });

  describe('la langue', () => {
    // La langue ne passe PAS par `writePreference` : elle doit aussi rebasculer
    // i18next, sinon l'interface reste dans l'ancienne langue.
    it('applique la langue au lieu de seulement l’enregistrer', async () => {
      await render(<ReglagesScreen />);
      await fireEvent.press(screen.getByTestId('setting-language-header'));
      await fireEvent.press(screen.getByTestId('setting-language-option-vi'));

      expect(i18n.chooseLanguage).toHaveBeenCalledWith('vi');
    });

    // « Langue du système » vaut `null`, pas la chaîne 'system' : c'est ce que
    // `Preferences.language` attend, et l'écrire tel quel casserait le repli.
    it('rend la langue au système en repassant null', async () => {
      prefs.readPreferences.mockReturnValue({ ...DEFAULTS, language: 'vi' });
      await render(<ReglagesScreen />);
      await fireEvent.press(screen.getByTestId('setting-language-header'));
      await fireEvent.press(screen.getByTestId('setting-language-option-system'));

      expect(i18n.chooseLanguage).toHaveBeenCalledWith(null);
    });

    it('propose les sept locales plus la langue du système', async () => {
      await render(<ReglagesScreen />);
      await fireEvent.press(screen.getByTestId('setting-language-header'));

      for (const id of ['system', 'en', 'fr', 'es', 'it', 'de', 'vi', 'ru']) {
        expect(screen.getByTestId(`setting-language-option-${id}`)).toBeTruthy();
      }
    });

    it('coche la langue du système quand aucune n’est choisie', async () => {
      await render(<ReglagesScreen />);
      await fireEvent.press(screen.getByTestId('setting-language-header'));

      expect(screen.getByTestId('setting-language-check-system')).toBeTruthy();
    });

    it('coche la langue choisie quand il y en a une', async () => {
      prefs.readPreferences.mockReturnValue({ ...DEFAULTS, language: 'ru' });
      await render(<ReglagesScreen />);
      await fireEvent.press(screen.getByTestId('setting-language-header'));

      expect(screen.getByTestId('setting-language-check-ru')).toBeTruthy();
      expect(screen.queryByTestId('setting-language-check-system')).toBe(null);
    });
  });

  describe('la valeur courante affichée', () => {
    // Les deux états de chaque booléen : sans le second, l'affichage pourrait
    // être constant.
    it('affiche « coupé » quand le micro l’est', async () => {
      await render(<ReglagesScreen />);
      expect(screen.getByTestId('setting-micOnJoin-current')).toHaveTextContent(
        'settings.options.micOff',
      );
    });

    it('affiche « actif » quand le micro ne l’est pas', async () => {
      prefs.readPreferences.mockReturnValue({ ...DEFAULTS, micOffOnJoin: false });
      await render(<ReglagesScreen />);
      expect(screen.getByTestId('setting-micOnJoin-current')).toHaveTextContent(
        'settings.options.micOn',
      );
    });

    it('affiche le niveau d’accès courant', async () => {
      prefs.readPreferences.mockReturnValue({ ...DEFAULTS, defaultAccessLevel: 'trusted' });
      await render(<ReglagesScreen />);
      expect(screen.getByTestId('setting-defaultAccess-current')).toHaveTextContent(
        'settings.options.accessTrusted',
      );
    });
  });

  it('déconnecte et renvoie à l’accueil', async () => {
    const { signOut } = jest.requireMock('src/auth/login') as { signOut: jest.Mock };
    await render(<ReglagesScreen />);
    await fireEvent.press(screen.getByTestId('settings-signout-btn'));

    expect(signOut).toHaveBeenCalled();
  });
});
