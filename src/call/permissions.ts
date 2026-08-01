import { PermissionsAndroid, Platform } from 'react-native';

// Le manifeste déclare CAMERA et RECORD_AUDIO, mais Android 6 et au-delà exigent
// de les demander à l'exécution. Sans cette demande les deux restent refusées,
// l'application ne publie aucune piste, et la négociation WebRTC expire sur un
// « NegotiationError: negotiation timed out » qui ne nomme pas sa cause.
//
// Mesuré sur appareil avant ce module : CAMERA granted=false, RECORD_AUDIO
// granted=false, alors que la connexion au serveur, elle, aboutissait.
//
// iOS ne passe pas par ici : les invites y sont déclenchées par le premier accès
// réel au matériel, à partir des descriptions du Info.plist.
export async function ensureMediaPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const granted = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.CAMERA,
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  ]);

  return (
    granted[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED &&
    granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED
  );
}

// Le manifeste déclare BLUETOOTH et BLUETOOTH_ADMIN — permissions d'avant
// Android 12, héritées d'AudioSwitch — et désormais BLUETOOTH_CONNECT, ajoutée
// par `app.json`. Sur l'API 31 et au-delà, cette dernière est une permission
// d'EXÉCUTION : sans cette demande, AudioSwitch retire silencieusement
// 'bluetooth' de son énumération (`PermissionsCheckStrategy`, dont le jar porte
// la chaîne « Bluetooth unsupported, permissions not granted »). Aucun plantage,
// aucun message : la route manque, sans se signaler — et
// `audioOutputControl.tsx` ne rend qu'une ligne par catégorie PRÉSENTE, donc pas
// même une ligne grisée pour la signaler.
//
// SÉPARÉE de `ensureMediaPermissions`, jamais fusionnée avec elle : un
// `requestMultiple` commun ferait échouer l'entrée en séance sur un refus
// Bluetooth. Le résultat est donc facultatif pour l'appelant — un refus ne prive
// que d'une entrée du menu de sortie audio, la séance se tient au haut-parleur.
export async function ensureBluetoothPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  // BLUETOOTH_CONNECT n'existe comme permission d'exécution qu'à partir de
  // l'API 31 : en dessous, BLUETOOTH/BLUETOOTH_ADMIN — déjà déclarées, jamais à
  // demander — suffisent.
  if (Platform.Version < 31) return true;

  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}
