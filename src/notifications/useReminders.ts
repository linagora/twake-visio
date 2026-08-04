import * as Notifications from 'expo-notifications';
import i18next from 'i18next';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { runReminderSync } from 'src/notifications/job';
import { prejoinRoute, slugFromResponse } from 'src/notifications/response';
import { registerCategory } from 'src/notifications/schedule';

type Navigate = (route: string) => void;

/**
 * Branche les rappels sur le cycle de vie de l'application.
 *
 * Monté une seule fois, à la racine, pour la même raison que `useSessionGuard`
 * l'est : c'est la seule surface qui survit à toute navigation. Une réponse de
 * notification peut arriver alors que n'importe quel écran est affiché, ou
 * qu'aucun ne l'est encore.
 */
export function useReminders(navigate: Navigate): void {
  useEffect(() => {
    // La catégorie porte le bouton « Rejoindre ». Reposée à chaque démarrage
    // plutôt qu'une fois pour toutes : son libellé est TRADUIT, et changer de
    // langue doit changer le bouton. iOS garde la dernière déclaration.
    void registerCategory(i18next.t('notifications.joinAction'));

    // Une notification qui arrive pendant que l'application est ouverte doit
    // rester visible : sans ce gestionnaire, iOS l'avale silencieusement, et le
    // rappel n'existe que pour qui a fermé l'application.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }, []);

  useEffect(() => {
    // La réponse qui a RÉVEILLÉ l'application depuis un état arrêté n'est pas
    // délivrée à l'écouteur : elle est passée avant qu'il n'existe. C'est le
    // cas le plus fréquent pour un rappel, et l'oublier donnerait un bouton qui
    // marche seulement quand l'application tournait déjà.
    void Notifications.getLastNotificationResponseAsync().then((last) => {
      if (last === null) return;
      const slug = slugFromResponse(
        last.actionIdentifier,
        last.notification.request.content.data,
        Notifications.DEFAULT_ACTION_IDENTIFIER,
      );
      if (slug !== null) navigate(prejoinRoute(slug));
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const slug = slugFromResponse(
        response.actionIdentifier,
        response.notification.request.content.data,
        Notifications.DEFAULT_ACTION_IDENTIFIER,
      );
      if (slug !== null) navigate(prejoinRoute(slug));
    });

    return () => subscription.remove();
  }, [navigate]);

  useEffect(() => {
    // Reprogrammer au RETOUR au premier plan, et non sur une minuterie : c'est
    // le moment où l'agenda a le plus de chances d'avoir changé sans qu'on
    // l'ait su, et c'est gratuit quand rien n'a bougé.
    void runReminderSync();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void runReminderSync();
    });
    return () => subscription.remove();
  }, []);
}
