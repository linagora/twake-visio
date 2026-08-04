import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { tokens } from 'src/ui/tokens';
import { ReglagesScreen } from './reglages';

// `t` INTERPOLE réellement : sans cela il ne peut pas distinguer
// `t('settings.version', { version })` d'une chaîne où le numéro serait écrit
// en dur — c'est précisément l'erreur qui a laissé « Twake Visio 1.0 » vivre
// dans les sept locales jusqu'à la veille de la première publication. Même
// précaution que `cameraMenu.spec.tsx`, pour la même raison.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values === undefined ? key : `${key}|${JSON.stringify(values)}`,
  }),
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
// L'agenda est bouchonné plutôt que joint : le crochet réel ferait une requête
// CalDAV, et l'écran n'a besoin que du booléen.
jest.mock('src/calendar/useAgendaAvailable', () => ({ useAgendaAvailable: jest.fn() }));
// Les trois modules qui touchent le système. Aucun n'est exercé par ces
// tests-ci ; les bouchonner évite de tirer `expo-notifications` dans un
// environnement qui n'en a pas.
jest.mock('src/notifications/backgroundTask', () => ({
  syncReminderTask: jest.fn(async () => undefined),
}));
jest.mock('src/notifications/job', () => ({ runReminderSync: jest.fn(async () => undefined) }));
jest.mock('src/notifications/permission', () => ({
  ensureNotificationPermission: jest.fn(async () => true),
}));

const accounts = jest.requireMock('src/auth/accounts') as { getActiveAccount: jest.Mock };
const prefs = jest.requireMock('src/settings/preferences') as {
  readPreferences: jest.Mock;
  writePreference: jest.Mock;
};
const i18n = jest.requireMock('src/i18n') as { chooseLanguage: jest.Mock };
const agenda = jest.requireMock('src/calendar/useAgendaAvailable') as {
  useAgendaAvailable: jest.Mock;
};
const permission = jest.requireMock('src/notifications/permission') as {
  ensureNotificationPermission: jest.Mock;
};

const DEFAULTS = {
  micOffOnJoin: true,
  cameraOffOnJoin: false,
  defaultAccessLevel: 'public' as const,
  language: null,
  reminderLeadMinutes: null,
};

describe('ReglagesScreen', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    prefs.readPreferences.mockReturnValue(DEFAULTS);
    // Par DÉFAUT indisponible : c'est l'état d'un compte sans agenda, et le
    // laisser à `true` ferait passer les tests existants pour de mauvaises
    // raisons — un groupe de plus qu'ils n'attendent.
    agenda.useAgendaAvailable.mockReturnValue(false);
    accounts.getActiveAccount.mockReturnValue({
      displayName: 'Michel Maudet',
      email: 'michel.maudet@twake.app',
      instance: { serverUrl: 'https://meet.twake-dev.maudet.cloud' },
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

  // Repris de `home.spec.tsx`, d'où l'information vient : l'HÔTE, et pas
  // seulement l'adresse. Sur deux instances d'une même organisation la personne
  // porte souvent la MÊME adresse — mesuré, un annuaire de développement dont
  // le `mail` est celui de production. Un écran qui n'afficherait que l'adresse
  // ne dirait pas où l'on est.
  //
  // La valeur du fixture est volontairement distincte de l'adresse : une
  // implémentation qui figerait l'une passerait un test qui les confondrait.
  it("nomme l'instance, pas seulement l'adresse", async () => {
    await render(<ReglagesScreen />);
    expect(screen.getByTestId('settings-instance')).toHaveTextContent(
      'meet.twake-dev.maudet.cloud',
    );
  });

  it('ne montre aucune instance quand aucun compte n’est actif', async () => {
    accounts.getActiveAccount.mockReturnValue(null);
    await render(<ReglagesScreen />);
    expect(screen.queryByTestId('settings-instance')).toBe(null);
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
  // Le numéro de version vient de `app.json`, lu par `expo-constants` au build.
  // Écrit dans les traductions, il vivait en sept exemplaires qu'aucun bump ne
  // pouvait atteindre.
  it('affiche la version que porte la configuration, jamais une constante', async () => {
    await render(<ReglagesScreen />);

    // La version RÉELLE du projet, lue au même endroit que l'écran : un
    // littéral ici deviendrait faux au prochain bump, et le test rougirait
    // pour la mauvaise raison.
    const expected = jest.requireActual<{ default: { expoConfig?: { version?: string } } }>(
      'expo-constants',
    ).default.expoConfig?.version;

    expect(screen.getByTestId('settings-version')).toHaveTextContent(
      `settings.version|{"version":"${expected ?? ''}"}`,
    );
  });

  describe('le groupe Notifications', () => {
    // La conditionnelle introduite par les rappels, ses trois états. Une seule
    // polarité testée laisserait le groupe s'afficher pour un compte sans agenda,
    // proposant un rappel qui ne se déclencherait jamais.
    it("n'est PAS rendu quand l'agenda ne répond pas", async () => {
      agenda.useAgendaAvailable.mockReturnValue(false);
      await render(<ReglagesScreen />);

      expect(screen.queryByTestId('settings-group-notifications')).toBe(null);
      expect(screen.queryByTestId('setting-reminder-header')).toBe(null);
    });

    it("n'est PAS rendu tant qu'on ne SAIT pas", async () => {
      // `null` est l'état d'attente. Sans ce cas, la ligne apparaîtrait puis
      // disparaîtrait sous le doigt à chaque ouverture des réglages.
      agenda.useAgendaAvailable.mockReturnValue(null);
      await render(<ReglagesScreen />);

      expect(screen.queryByTestId('settings-group-notifications')).toBe(null);
    });

    it("est rendu quand l'agenda répond", async () => {
      agenda.useAgendaAvailable.mockReturnValue(true);
      await render(<ReglagesScreen />);

      expect(screen.getByTestId('settings-group-notifications')).toBeTruthy();
      expect(screen.getByTestId('setting-reminder-header')).toBeTruthy();
    });

    it('affiche « Jamais » quand aucun délai n’est choisi', async () => {
      agenda.useAgendaAvailable.mockReturnValue(true);
      await render(<ReglagesScreen />);

      expect(screen.getByTestId('setting-reminder-current')).toHaveTextContent(
        'settings.options.reminderNever',
      );
    });

    it('affiche le délai choisi', async () => {
      agenda.useAgendaAvailable.mockReturnValue(true);
      prefs.readPreferences.mockReturnValue({ ...DEFAULTS, reminderLeadMinutes: 15 });
      await render(<ReglagesScreen />);

      expect(screen.getByTestId('setting-reminder-current')).toHaveTextContent(
        'settings.options.reminder15',
      );
    });

    it("n'écrit RIEN quand la permission est refusée", async () => {
      // Le cas invisible en développement, où la permission est accordée depuis
      // longtemps. Sans lui, un refus laisserait la ligne afficher un délai qui
      // ne produirait jamais aucun rappel.
      agenda.useAgendaAvailable.mockReturnValue(true);
      permission.ensureNotificationPermission.mockResolvedValue(false);
      await render(<ReglagesScreen />);

      await fireEvent.press(screen.getByTestId('setting-reminder-header'));
      await fireEvent.press(screen.getByTestId('setting-reminder-option-15'));

      expect(prefs.writePreference).not.toHaveBeenCalled();
    });

    it('écrit le délai quand la permission est accordée', async () => {
      agenda.useAgendaAvailable.mockReturnValue(true);
      permission.ensureNotificationPermission.mockResolvedValue(true);
      await render(<ReglagesScreen />);

      await fireEvent.press(screen.getByTestId('setting-reminder-header'));
      await fireEvent.press(screen.getByTestId('setting-reminder-option-15'));

      expect(prefs.writePreference).toHaveBeenCalledWith('reminderLeadMinutes', 15);
    });

    it('écrit null pour « Jamais », et ne demande AUCUNE permission', async () => {
      agenda.useAgendaAvailable.mockReturnValue(true);
      prefs.readPreferences.mockReturnValue({ ...DEFAULTS, reminderLeadMinutes: 15 });
      await render(<ReglagesScreen />);

      await fireEvent.press(screen.getByTestId('setting-reminder-header'));
      await fireEvent.press(screen.getByTestId('setting-reminder-option-never'));

      expect(prefs.writePreference).toHaveBeenCalledWith('reminderLeadMinutes', null);
      expect(permission.ensureNotificationPermission).not.toHaveBeenCalled();
    });
  });
});
