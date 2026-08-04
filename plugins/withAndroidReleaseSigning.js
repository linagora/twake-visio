const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * La configuration de signature de RELEASE, injectée dans `android/app/build.gradle`.
 *
 * **Pourquoi un plugin et non un fichier versionné.** `twake-drive-mobile`, dont
 * cette chaîne de publication est reprise, garde son `android/` sous git : sa
 * configuration de signature y est écrite une fois pour toutes. Ici, `android/`
 * et `ios/` sont IGNORÉS et régénérés par `expo prebuild` — c'est écrit dans
 * `AGENTS.md`, et c'est un choix, pas un oubli. Toute modification native passe
 * donc par un plugin, sans quoi elle disparaît au prochain `prebuild`, en
 * silence et au pire moment : juste avant une publication.
 *
 * **Le repli sur la clé de debug est délibéré.** Sans les variables
 * d'environnement — le cas de toute construction locale et de tout build de PR
 * —, `signingConfigs.release` retombe sur `debug`. Un APK de test reste donc
 * produisible sans le moindre secret, exactement comme aujourd'hui. Le jour où
 * la CI exporte `KEYSTORE_PATH`, la même commande produit un APK signé pour les
 * stores.
 *
 * Les quatre variables sont celles qu'attendent les lanes fastlane :
 * `KEYSTORE_PATH`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.
 */
const SIGNING_CONFIG = `
        release {
            // Piloté par l'environnement : la CI décode le keystore puis exporte
            // ces quatre variables. Absentes, on retombe sur la clé de debug —
            // un APK de test se construit ainsi sans aucun secret, exactement
            // comme avant ce plugin.
            //
            // Les quatre valeurs sont posées INCONDITIONNELLEMENT, avec un
            // repli : un bloc \`signingConfig\` sans \`storeFile\` est accepté à
            // la configuration puis échoue à la signature, sur un message qui ne
            // nomme ni la variante ni la variable manquante.
            storeFile file(System.getenv("KEYSTORE_PATH") ?: 'debug.keystore')
            storePassword System.getenv("KEYSTORE_PASSWORD") ?: 'android'
            keyAlias System.getenv("KEY_ALIAS") ?: 'androiddebugkey'
            keyPassword System.getenv("KEY_PASSWORD") ?: 'android'
        }
`;

/**
 * Le nom et le code de version, eux aussi pilotés par l'environnement.
 *
 * `VERSION_NAME` vient du tag git (`v0.8.0` → `0.8.0`) et `VERSION_CODE` du
 * numéro d'exécution de la CI, qui est monotone. Les deux sont facultatifs : une
 * construction locale garde les valeurs d'`app.json`.
 *
 * Un `versionCode` figé serait refusé par Google Play au deuxième envoi — c'est
 * le genre d'erreur qui ne se voit qu'une fois le premier dépôt fait.
 */
const VERSION_OVERRIDE = `
        if (System.getenv("VERSION_CODE")) versionCode System.getenv("VERSION_CODE").toInteger()
        if (System.getenv("VERSION_NAME")) versionName System.getenv("VERSION_NAME")
`;

function addReleaseSigning(gradle) {
  if (gradle.includes('System.getenv("KEYSTORE_PATH")')) return gradle;

  // Après le bloc `debug` de `signingConfigs`, que le gabarit d'Expo pose
  // toujours. On ancre dessus plutôt que sur `signingConfigs {` : la même
  // recherche appliquée à l'accolade ouvrante insérerait AVANT `debug`, et
  // Gradle refuse un `release` qui référence un `debug` pas encore déclaré.
  const anchor = gradle.indexOf('debug {');
  if (anchor === -1) {
    throw new Error(
      'withAndroidReleaseSigning : bloc `debug {` introuvable dans build.gradle. ' +
        "Le gabarit d'Expo a changé — ce plugin doit être relu avant la prochaine publication.",
    );
  }
  const close = gradle.indexOf('}', gradle.indexOf('storePassword', anchor));
  return `${gradle.slice(0, close + 1)}\n${SIGNING_CONFIG}${gradle.slice(close + 1)}`;
}

function useReleaseSigning(gradle) {
  // Le gabarit d'Expo signe la variante `release` avec la clé de DEBUG. On
  // bascule sur notre configuration : elle retombe sur debug d'elle-même quand
  // l'environnement est vide, donc rien ne casse hors CI.
  //
  // **L'ancre est le commentaire « Caution! », et c'est mesuré.** Une première
  // version ancrait sur `shrinkResources|minifyEnabled`, supposés suivre
  // immédiatement — ils ne suivent pas : le gabarit intercale un
  // `def enableShrinkResources = …`. La substitution ne s'appliquait donc pas,
  // le bloc `release` était bien injecté, et la variante restait signée avec la
  // clé de debug. Silencieux : `prebuild` réussit, le build réussit, et l'APK
  // est refusé par le store des semaines plus tard.
  //
  // Ce commentaire-ci n'apparaît que dans le bloc `release` du gabarit React
  // Native, ce qui en fait une ancre non ambiguë.
  const marker = '// Caution! In production, you need to generate your own keystore file.';
  if (!gradle.includes(marker)) {
    throw new Error(
      'withAndroidReleaseSigning : ancre « Caution! » introuvable dans build.gradle. ' +
        "Le gabarit d'Expo a changé — ce plugin doit être relu avant la prochaine publication.",
    );
  }
  const from = gradle.indexOf(marker);
  const line = gradle.indexOf('signingConfig signingConfigs.debug', from);
  if (line === -1) {
    throw new Error(
      'withAndroidReleaseSigning : aucun `signingConfig signingConfigs.debug` après ' +
        "l'ancre. Le gabarit d'Expo a changé.",
    );
  }
  return (
    gradle.slice(0, line) +
    'signingConfig signingConfigs.release' +
    gradle.slice(line + 'signingConfig signingConfigs.debug'.length)
  );
}

function addVersionOverride(gradle) {
  if (gradle.includes('System.getenv("VERSION_CODE")')) return gradle;
  return gradle.replace(/(versionName\s+"[^"]*")/, `$1\n${VERSION_OVERRIDE}`);
}

module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      throw new Error(
        'withAndroidReleaseSigning : build.gradle attendu en Groovy, reçu ' +
          modConfig.modResults.language,
      );
    }
    let gradle = modConfig.modResults.contents;
    gradle = addReleaseSigning(gradle);
    gradle = useReleaseSigning(gradle);
    gradle = addVersionOverride(gradle);
    modConfig.modResults.contents = gradle;
    return modConfig;
  });
};
