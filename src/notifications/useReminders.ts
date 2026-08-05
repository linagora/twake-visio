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
 *
 * `i18nReady` gouverne la SEULE chose qui ait besoin d'une traduction. Le reste
 * — le gestionnaire de notification et les écouteurs de réponse — s'installe
 * immédiatement : un appui sur un rappel RÉVEILLE l'application, donc la
 * réponse arrive souvent avant que les traductions soient chargées, et les
 * retarder échangerait un défaut contre un autre.
 */
export function useReminders(navigate: Navigate, i18nReady: boolean): void {
  useEffect(() => {
    // La catégorie porte le bouton « Rejoindre ». Reposée à chaque démarrage
    // plutôt qu'une fois pour toutes : son libellé est TRADUIT, et changer de
    // langue doit changer le bouton. iOS garde la dernière déclaration.
    //
    // ATTENDRE L'I18N N'EST PAS UNE PRÉCAUTION, C'EST LA CORRECTION D'UN
    // DÉFAUT LIVRÉ. `app/_layout.tsx` appelle ce crochet AVANT de lancer
    // `initI18n()`, qui est de surcroît asynchrone : sans cette garde,
    // `i18next.t()` rendait `undefined` — mesuré le 2026-08-05 — et le module
    // natif refusait la catégorie entière :
    //
    //   Value for field 'buttonTitle' is required, got nil
    //
    // Le rejet n'était pas le pire. Sans catégorie, le bouton « Rejoindre » du
    // rappel n'apparaît JAMAIS, et l'en-tête de `schedule.ts` dit précisément
    // que cela se produit « sans erreur, sans avertissement » : en production
    // il n'y a pas de bandeau rouge pour le signaler, juste un rappel muet.
    if (!i18nReady) return;
    void registerCategory(i18next.t('notifications.joinAction'));
  }, [i18nReady]);

  useEffect(() => {
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
