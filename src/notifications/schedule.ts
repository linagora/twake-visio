import * as Notifications from 'expo-notifications';

import type { Reminder } from 'src/notifications/reminders';
import { JOIN_ACTION } from 'src/notifications/response';

// La catégorie qui porte le bouton. Sur iOS, une action de notification
// n'existe PAS sans catégorie déclarée : la notification s'affiche, et le
// bouton n'apparaît simplement jamais — sans erreur, sans avertissement.
export const CATEGORY_ID = 'meeting-reminder';

const PREFIXE = 'reminder:';

export async function registerCategory(joinLabel: string): Promise<void> {
  await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
    {
      identifier: JOIN_ACTION,
      buttonTitle: joinLabel,
      // Ouvre l'application plutôt que d'agir en arrière-plan : le but est
      // précisément d'amener la personne dans le pré-accueil.
      options: { opensAppToForeground: true },
    },
  ]);
}

/**
 * Annule NOS rappels, et eux seuls.
 *
 * `cancelAllScheduledNotificationsAsync` serait plus court d'une ligne et
 * emporterait les notifications de toute autre fonction qui viendrait à en
 * poser. Aucune n'existe aujourd'hui ; c'est exactement pour cela que le jour
 * où l'une arrivera, personne ne pensera à relire ce fichier.
 */
export async function cancelReminders(): Promise<void> {
  const posees = await Notifications.getAllScheduledNotificationsAsync();
  for (const posee of posees) {
    if (posee.identifier.startsWith(PREFIXE)) {
      await Notifications.cancelScheduledNotificationAsync(posee.identifier);
    }
  }
}

/**
 * Repose le plan : on annule, puis on pose.
 *
 * **Annuler-puis-reposer, et non un diff.** Un diff exigerait de retrouver quel
 * rappel système correspond à quel évènement, à travers des identifiants que le
 * système peut avoir perdus entre deux exécutions. L'annulation est idempotente
 * et coûte quelques millisecondes pour une poignée de rappels.
 */
export async function syncReminders(
  plan: readonly Reminder[],
  body: (reminder: Reminder) => string,
): Promise<void> {
  await cancelReminders();
  for (const reminder of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: reminder.id,
      content: {
        title: reminder.title,
        body: body(reminder),
        categoryIdentifier: CATEGORY_ID,
        data: { slug: reminder.slug },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminder.fireAtMs,
      },
    });
  }
}
