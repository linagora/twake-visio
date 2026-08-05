import { renderHook } from '@testing-library/react-native';
import i18next from 'i18next';

import { useReminders } from 'src/notifications/useReminders';

jest.mock('src/notifications/schedule', () => ({
  registerCategory: jest.fn(async () => undefined),
}));
jest.mock('src/notifications/job', () => ({ runReminderSync: jest.fn(async () => undefined) }));
jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  setNotificationHandler: jest.fn(),
}));

const schedule = jest.requireMock('src/notifications/schedule') as {
  registerCategory: jest.Mock;
};
const notifications = jest.requireMock('expo-notifications') as {
  setNotificationHandler: jest.Mock;
  addNotificationResponseReceivedListener: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useReminders', () => {
  describe("l'enregistrement de la catégorie", () => {
    /**
     * LE test de ce fichier, et celui qui manquait.
     *
     * `registerCategory` reçoit un libellé TRADUIT, et `i18next.t()` sur une
     * instance non initialisée rend `undefined` — mesuré. Le module natif
     * refuse alors la catégorie entière :
     *
     *   Value for field 'buttonTitle' is required, got nil
     *
     * La conséquence dépasse le rejet : sans catégorie, le bouton
     * « Rejoindre » du rappel n'apparaît JAMAIS, et `schedule.ts:6-8` dit
     * précisément que cela se produit « sans erreur, sans avertissement ».
     */
    it("n'enregistre RIEN tant que l'i18n n'est pas prête", async () => {
      await renderHook(() => useReminders(jest.fn(), false));

      expect(schedule.registerCategory).not.toHaveBeenCalled();
    });

    it("enregistre le libellé traduit une fois l'i18n prête", async () => {
      jest.spyOn(i18next, 't').mockReturnValue('Rejoindre' as never);

      await renderHook(() => useReminders(jest.fn(), true));

      expect(schedule.registerCategory).toHaveBeenCalledWith('Rejoindre');
    });

    // La bascule elle-même : le crochet est monté AVANT que l'i18n soit prête,
    // exactement comme `app/_layout.tsx` le fait, puis elle le devient.
    it("enregistre au moment où l'i18n devient prête, sans remontage", async () => {
      jest.spyOn(i18next, 't').mockReturnValue('Rejoindre' as never);

      const { rerender } = await renderHook(
        ({ ready }: { ready: boolean }) => useReminders(jest.fn(), ready),
        { initialProps: { ready: false } },
      );
      expect(schedule.registerCategory).not.toHaveBeenCalled();

      await rerender({ ready: true });

      expect(schedule.registerCategory).toHaveBeenCalledWith('Rejoindre');
    });
  });

  /**
   * Ce qui ne doit PAS attendre l'i18n.
   *
   * Une réponse de notification peut arriver avant que les traductions soient
   * chargées — c'est même le cas le plus fréquent, puisqu'un appui sur le
   * rappel RÉVEILLE l'application. Retarder ces deux-là pour corriger la
   * catégorie échangerait un défaut contre un autre.
   */
  describe("ce qui ne dépend pas de l'i18n", () => {
    it('pose le gestionnaire de notification immédiatement', async () => {
      await renderHook(() => useReminders(jest.fn(), false));

      expect(notifications.setNotificationHandler).toHaveBeenCalled();
    });

    it('écoute les réponses immédiatement', async () => {
      await renderHook(() => useReminders(jest.fn(), false));

      expect(notifications.addNotificationResponseReceivedListener).toHaveBeenCalled();
    });
  });
});
