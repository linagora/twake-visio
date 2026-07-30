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
