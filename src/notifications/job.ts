import i18next from 'i18next';

import { getActiveAccount } from 'src/auth/accounts';
import { clockLabel } from 'src/calendar/format';
import { loadUpcoming } from 'src/calendar/load';
import { agendaHosts } from 'src/navigation/deepLinks';
import { planReminders, type Reminder } from 'src/notifications/reminders';
import { cancelReminders, syncReminders } from 'src/notifications/schedule';
import { readPreferences } from 'src/settings/preferences';

/**
 * Ce que la synchronisation a fait, pour qu'un appelant puisse le dire.
 *
 * Rendre un résultat plutôt que rien : une tâche de fond n'affiche aucun écran,
 * donc son échec est muet par construction. Sans cette valeur, « la tâche a
 * tourné » et « la tâche a reposé onze rappels » seraient indiscernables.
 */
export type SyncResult =
  | { readonly kind: 'off' }
  | { readonly kind: 'unavailable'; readonly reason: string }
  | { readonly kind: 'scheduled'; readonly count: number };

// `i18next.t(…)` et NON `import { t } from 'i18next'`, malgré ce que le lint
// suggère : l'export nommé est une méthode NON LIÉE, `this` y vaut `undefined`
// en ESM, et l'appel jette. Même raison qu'en tête de `src/call/callService.ts`.
function corps(reminder: Reminder): string {
  return i18next.t('notifications.reminderBody', { time: clockLabel(reminder.startMs) });
}

/**
 * Reprogramme les rappels depuis l'agenda.
 *
 * Appelée de trois endroits — le rafraîchissement au premier plan, le
 * changement de réglage, et la tâche de fond — et c'est le seul chemin : trois
 * implémentations de la même règle divergeraient au premier changement.
 */
export async function runReminderSync(): Promise<SyncResult> {
  const lead = readPreferences().reminderLeadMinutes;
  if (lead === null) {
    // Éteint : on n'annule pas seulement les futurs, on retire ceux qui restent
    // posés. Sans cela, couper le réglage laisserait sonner jusqu'à
    // vingt-quatre heures de rappels déjà programmés.
    await cancelReminders();
    return { kind: 'off' };
  }

  const account = getActiveAccount();
  if (account === null) {
    await cancelReminders();
    return { kind: 'unavailable', reason: 'aucun compte' };
  }

  const outcome = await loadUpcoming();
  if (!outcome.ok) {
    // On LAISSE les rappels déjà posés. Un agenda momentanément injoignable —
    // réseau coupé, jeton à renouveler — ne dit rien des réunions : un rappel
    // périmé gêne moins qu'un silence total le jour où le service tousse.
    return { kind: 'unavailable', reason: outcome.reason };
  }

  const plan = planReminders(
    outcome.events,
    lead,
    outcome.now,
    agendaHosts(account.instance.serverUrl),
  );
  await syncReminders(plan, corps);
  return { kind: 'scheduled', count: plan.length };
}
