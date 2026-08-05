const { withEntitlementsPlist } = require('expo/config-plugins');

/**
 * Retire l'entitlement `aps-environment` que le plugin d'`expo-notifications`
 * pose sans le demander.
 *
 * **Cette application ne fait AUCUNE notification distante.** Les rappels de
 * réunion sont programmés localement — `scheduleNotificationAsync` sur un
 * déclencheur `DATE`, plus des catégories et un écouteur de réponse
 * (`src/notifications/schedule.ts`, `src/notifications/useReminders.ts`). Pas un
 * seul appel à `getExpoPushTokenAsync` ni à `getDevicePushTokenAsync` dans tout
 * `src/` : il n'y a pas de serveur de push derrière, et rien qui en attende un.
 * Or `aps-environment` sélectionne l'environnement APNs, qui ne concerne que le
 * DISTANT. `UNUserNotificationCenter` programme du local avec la seule
 * permission de l'utilisateur, sans aucun entitlement.
 *
 * **Le plugin d'Expo, lui, le pose inconditionnellement** —
 * `expo-notifications/plugin/build/withNotificationsIOS.js:11` :
 *
 *     if (!config.modResults['aps-environment']) {
 *         config.modResults['aps-environment'] = mode;   // `mode` = 'development'
 *     }
 *
 * Il ne regarde pas ce que l'application appelle ; il suppose du push.
 *
 * **Ce que ça a coûté, le 2026-08-05.** L'archive de la v0.9.0 a échoué en CI,
 * et le message ne nommait ni `expo-notifications` ni l'entitlement comme
 * origine :
 *
 *     Provisioning profile "match AppStore com.linagora.twakevisio" doesn't
 *     include the Push Notifications capability.
 *     … doesn't include the aps-environment entitlement.
 *     ** ARCHIVE FAILED **
 *
 * Le profil `match` est antérieur aux rappels et ne porte pas cette capacité.
 * Le rattraper par le portail Apple demandait d'ACTIVER une capacité qu'on
 * n'utilise pas — `fastlane/Fastfile` le dit à sa lane `provision` : « `match`
 * provisionne des profils, il n'ACTIVE PAS de capacités » — puis de régénérer
 * le profil. Trois gestes manuels pour déclarer une porte qu'on n'ouvre jamais.
 *
 * **Et la valeur posée était fausse de toute façon** : `development` dans une
 * archive signée App Store. Le signe que cet entitlement n'a jamais été
 * configuré ici, mais hérité.
 *
 * Le jour où le push distant arrivera pour de bon — un appel entrant notifié,
 * par exemple —, il faudra le VOULOIR : retirer ce plugin, activer la capacité
 * sur l'App ID dans le portail Apple, relancer `provision-ios.yml`. Dans cet
 * ordre, et pas avant qu'un serveur de push existe.
 */
module.exports = function withLocalNotificationsOnly(config) {
  return withEntitlementsPlist(config, (modConfig) => {
    // **Ce plugin est déclaré AVANT `expo-notifications` dans `app.json`, et
    // c'est ainsi qu'il s'exécute APRÈS lui.** L'ordre des mods est l'inverse
    // de celui du tableau `plugins` — `withMod.js:197-202` :
    //
    //     const results = await action({ … });   // le mod s'exécute
    //     return nextMod(results);               // PUIS celui d'avant
    //
    // Chaque mod agit, puis passe la main au mod enregistré avant lui : le
    // DERNIER déclaré s'exécute en PREMIER. Placé après `expo-notifications`
    // — le placement intuitif, et le premier essayé —, ce plugin tournait
    // avant lui et supprimait une clé pas encore posée.
    //
    // Absent, donc ? Alors ou bien ce plugin est repassé du mauvais côté
    // d'`expo-notifications`, ou bien `expo-notifications` a cessé de poser
    // l'entitlement. Les deux cas seraient MUETS : le prebuild réussirait, et
    // l'échec reviendrait à l'archive, en CI, sur un message qui ne mène pas
    // ici — celui-là même qui a coûté la v0.9.0. On échoue maintenant.
    if (!('aps-environment' in modConfig.modResults)) {
      throw new Error(
        'withLocalNotificationsOnly : `aps-environment` est absent des entitlements. ' +
          "Soit ce plugin ne s'applique plus après `expo-notifications` dans `app.json`, " +
          'soit `expo-notifications` a cessé de le poser. Relire les deux avant de publier.',
      );
    }
    delete modConfig.modResults['aps-environment'];
    return modConfig;
  });
};
