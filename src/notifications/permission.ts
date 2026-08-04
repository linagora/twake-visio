import * as Notifications from 'expo-notifications';

/**
 * Demande l'autorisation de notifier, et dit si on l'a.
 *
 * Appelée **à l'activation du réglage**, jamais au démarrage. Une application
 * qui réclame la permission de notifier avant d'avoir montré pourquoi se la
 * fait refuser, et un refus iOS n'est pas redemandable : il faut alors passer
 * par les réglages du système, ce que presque personne ne fait.
 *
 * Rend `true` si l'autorisation est acquise, y compris quand elle l'était déjà.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  const actuelle = await Notifications.getPermissionsAsync();
  if (actuelle.granted) return true;
  // `canAskAgain` à `false` signifie un refus définitif : redemander ne
  // provoquerait aucune invite, et rendrait `granted: false` immédiatement.
  // Le distinguer permet à l'appelant d'expliquer où aller plutôt que de
  // laisser croire à un échec passager.
  if (!actuelle.canAskAgain) return false;
  const demandee = await Notifications.requestPermissionsAsync();
  return demandee.granted;
}
