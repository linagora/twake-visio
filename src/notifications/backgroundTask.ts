import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { runReminderSync } from 'src/notifications/job';

export const REMINDER_TASK = 'twake-visio-meeting-reminders';

// Deux heures DEMANDÉES, et le mot compte.
//
// Les types du paquet le disent eux-mêmes : « On iOS, short intervals are often
// ignored — the system typically runs background tasks during specific windows,
// such as overnight », avec un défaut de douze heures et un minimum de quinze
// minutes. Android l'étrangle en Doze.
//
// **La tâche AMÉLIORE la fraîcheur, elle ne la garantit pas.** La fiabilité ne
// vient pas d'elle : elle vient des rappels DÉJÀ posés, que le système tient
// même si l'application ne tourne plus jamais. Bâtir quoi que ce soit sur
// l'hypothèse que cette tâche s'exécute serait bâtir sur du sable, et l'échec
// serait muet — un travail de fond ne rend aucun écran rouge.
const INTERVALLE_MINUTES = 120;

// `defineTask` doit être appelée au CHARGEMENT DU MODULE, hors de tout
// composant : le système peut réveiller l'application directement dans la
// tâche, et cherche alors une définition déjà enregistrée. Posée dans un
// `useEffect`, elle n'existerait pas encore au moment où on la cherche.
TaskManager.defineTask(REMINDER_TASK, async () => {
  try {
    await runReminderSync();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    // On avale plutôt que de laisser remonter : une tâche qui jette est
    // pénalisée par le système, qui l'exécutera moins souvent. Le prochain
    // passage au premier plan reprogrammera de toute façon.
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerReminderTask(): Promise<void> {
  await BackgroundTask.registerTaskAsync(REMINDER_TASK, {
    minimumInterval: INTERVALLE_MINUTES,
  });
}

export async function unregisterReminderTask(): Promise<void> {
  // Le désenregistrement d'une tâche jamais enregistrée jette. On demande donc
  // d'abord, plutôt que d'envelopper dans un `try` qui masquerait aussi les
  // vraies erreurs.
  if (await TaskManager.isTaskRegisteredAsync(REMINDER_TASK)) {
    await BackgroundTask.unregisterTaskAsync(REMINDER_TASK);
  }
}

/**
 * Aligne l'enregistrement de la tâche sur le réglage.
 *
 * Enregistrée seulement quand un délai est choisi : une tâche de fond
 * enregistrée pour ne rien faire consomme de la batterie et use le quota que le
 * système accorde à l'application.
 */
export async function syncReminderTask(enabled: boolean): Promise<void> {
  if (enabled) await registerReminderTask();
  else await unregisterReminderTask();
}
