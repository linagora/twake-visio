import type { Room } from 'livekit-client';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';
import { IconButton } from 'react-native-paper';

import type { AudioDeviceChoice } from 'src/call/audioDevices';
import {
  audioRouteControl,
  clearAudioDevice,
  listAudioDevices,
  listAudioOutputs,
  openSystemRoutePicker,
  readCurrentAudioDeviceId,
  routeToPreferredDevice,
  watchPreferredDevice,
  selectAudioDevice,
  selectAudioOutput,
} from 'src/call/audioRoute';
import type { AudioOutputKind, CameraChoice } from 'src/call/devices';
import type { RaisedHand } from 'src/call/hands';
import {
  listCameras,
  readActiveCameraId,
  selectCamera,
  setCameraEnabled,
  setMicrophoneEnabled,
  type FacingMode,
} from 'src/call/media';
import type { ReactionKey } from 'src/call/reactions';
import type { RecordingState } from 'src/call/recording';
import { AudioOutputControl } from 'src/screens/room/audioOutputControl';
import { CameraMenu } from 'src/screens/room/cameraMenu';
import {
  BAR_HIT_SLOP,
  BAR_ICON_COLOR,
  BAR_PADDING,
  BAR_RIPPLE_COLOR,
  barStyles,
} from 'src/screens/room/controlBar';
import { MoreMenu } from 'src/screens/room/moreMenu';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  controls: {
    flexDirection: 'row',
    // `space-evenly` et non `center` : la rangée mesure 353 dp au MINIMUM, et
    // un téléphone en fait rarement 360 tout juste — 402 sur un iPhone 17 Pro.
    // Groupée au centre, elle laissait donc 49 dp inutilisés aux deux bouts et
    // les commandes se touchaient presque. Répartie, l'écart effectif suit la
    // largeur : ~9 dp sur un écran de 360, ~17 sur 402.
    //
    // Le `gap` ci-dessous reste le PLANCHER — `justifyContent` ne distribue que
    // l'espace libre, il ne peut pas en retirer. Un écran étroit dégrade donc
    // vers la rangée serrée d'avant plutôt que de déborder.
    justifyContent: 'space-evenly',
    alignItems: 'center',
    // 8 dp entre groupes, 4 dp de marge de rangée : c'est ce qui fait tenir
    // six cibles de 52 dp sur 353 dp, donc sur un écran de 360.
    //
    // `BAR_PADDING` et non le token directement : `BAR_HEIGHT` en dépend, et
    // `ReactionOverlay` en tire la garde qui empêche une bulle de se poser sur
    // « raccrocher ». Écrit deux fois, ce nombre divergerait sans que rien ne
    // le dise.
    gap: tokens.spacing.sm,
    padding: BAR_PADDING,
  },
  // 1 dp à l'intérieur de la paire caméra : elle se lit comme une paire, ce que
  // le web obtient avec `gap: '1px'`.
  cameraGroup: { flexDirection: 'row', alignItems: 'center', gap: 1 },
});

export type CallControlBarProps = {
  // Masquée en plein écran, sans exception : plus de commandes à rappeler,
  // puisqu'un appui n'importe où sur l'unique tuile plein écran en sort
  // directement (`onExitFullscreen`, câblé par `stage.tsx`) — la sortie est
  // donc totale par construction, prouvée par un test dans `call.spec.tsx`
  // plutôt qu'affirmée ici. Revient dès le premier appui sur cette même tuile :
  // six boutons, `leave-btn` compris, qui reste un moyen de quitter la séance
  // entière.
  //
  // Une PROP, et non une ternaire chez l'appelant : la barre reste alors MONTÉE
  // pendant le plein écran et ne rend que `null`. C'est ce qui garde les quatre
  // états de périphérique ci-dessous — la sortie audio demandée en particulier,
  // que rien ne relit jamais. Décrochée par l'appelant, un aller-retour par le
  // plein écran effacerait la coche du haut-parleur choisi, sans que personne
  // n'ait rien demandé.
  readonly hidden: boolean;

  // La Room de la séance, stable pour toute sa durée : `createCallSession` la
  // construit dans son constructeur et `getRoom()` rend toujours la même.
  readonly room: Room;

  // Les choix faits au pré-écran, lus une seule fois — au montage de cette
  // barre, donc à l'entrée en séance. Ils SEMENT l'état, ils ne le pilotent
  // pas : ensuite ce sont les deux bascules qui en décident, et rien d'autre
  // sur l'écran ne les relit.
  readonly defaultMicOn: boolean;
  readonly defaultCameraOn: boolean;

  // La face de la caméra retenue, remontée à l'écran : lui seul la passe à
  // `useCallLayout`, qui en tire le miroir de sa propre vignette. `'unknown'`
  // ne remonte jamais — voir `handleSelectCamera`.
  readonly onFacingChange: (facing: FacingMode) => void;
  // La seule chose que cette barre ait à dire à l'écran : le changement de
  // caméra a échoué, ou un essai suivant a effacé ce message. C'est un
  // sous-ensemble du `MessageKey` de `call.tsx`, redit ici plutôt qu'importé —
  // l'importer ferait un cycle entre l'écran et sa barre.
  readonly onNotice: (key: 'call.deviceSwitchFailed' | null) => void;

  // Ce que la barre PORTE sans rien en savoir : les six entrées et six rappels
  // du menu « plus », qui traversent jusqu'à `MoreMenu` sans être lus ici.
  readonly recording: RecordingState;
  readonly canRecord: boolean;
  readonly recordingBusy: boolean;
  readonly handRaised: boolean;
  readonly handBusy: boolean;
  readonly hands: readonly RaisedHand[];
  readonly unread: number;
  readonly onShare: () => void;
  readonly onStartRecording: () => void;
  readonly onStopRecording: () => void;
  readonly onToggleHand: () => void;
  readonly onSendReaction: (key: ReactionKey) => void;
  readonly onOpenChat: () => void;

  readonly onLeave: () => void;
};

// La rangée de six commandes, et les quatre états de périphérique qu'elle est
// seule à lire — la liste des caméras, celle en service, la liste des sorties
// audio et celle qu'on a demandée. Aucun de ces quatre n'intéresse le reste de
// l'écran, et les garder ici évite d'en faire descendre huit props de plus.
//
// La face de la caméra, elle, N'EST PAS de ce lot : `useCallLayout` en tire le
// miroir de la vignette locale, donc elle remonte par `onFacingChange`.
export function CallControlBar({
  hidden,
  room,
  defaultMicOn,
  defaultCameraOn,
  onFacingChange,
  onNotice,
  recording,
  canRecord,
  recordingBusy,
  handRaised,
  handBusy,
  hands,
  unread,
  onShare,
  onStartRecording,
  onStopRecording,
  onToggleHand,
  onSendReaction,
  onOpenChat,
  onLeave,
}: CallControlBarProps): React.ReactElement | null {
  const { t } = useTranslation();

  // La rangée BORDE le bas de l'écran, donc elle porte l'écart de l'indicateur
  // d'accueil. La racine de `call.tsx` ne peut pas le faire : sa
  // `KeyboardAvoidingView` écrase `paddingBottom`.
  const insets = useSafeAreaInsets();

  const [micOn, setMicOn] = useState(defaultMicOn);
  const [cameraOn, setCameraOn] = useState(defaultCameraOn);

  // Relus à chaque ouverture du menu, et à ce moment seulement : aucun
  // événement de changement de périphérique n'existe sur mobile.
  const [cameras, setCameras] = useState<readonly CameraChoice[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);

  const [outputs, setOutputs] = useState<readonly AudioOutputKind[]>([]);
  // Ce que *nous* avons demandé pendant cette séance, jamais l'état du système :
  // aucune API ne dit d'où sort le son, sur aucune des deux plateformes. Rien
  // n'est persisté entre deux séances — un choix manuel désarme la bascule
  // automatique côté Android, et le persister la désarmerait pour toujours.
  const [chosenOutput, setChosenOutput] = useState<AudioOutputKind | null>(null);

  // Chemin 'devices' (Android >= 31). `currentDeviceId` est l'état CONSTATÉ, lu
  // par `getCommunicationDevice()` : la première fois de ce dépôt qu'un écran
  // peut montrer où le son part vraiment plutôt que ce qu'on a demandé.
  // `manualOutput` est distinct, parce qu'un identifiant courant est renseigné
  // même quand personne n'a rien choisi.
  const [devices, setDevices] = useState<readonly AudioDeviceChoice[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<number | null>(null);
  const [manualOutput, setManualOutput] = useState(false);

  // Une valeur, pas une lecture de `Platform` par le composant : c'est ce qui
  // permet à une spec de rendre les deux branches sans bouchonner la
  // plateforme.
  const routeControl = audioRouteControl();

  // Un casque allumé EN SÉANCE doit prendre le son, comme un casque déjà
  // connecté le prend à l'entrée (`startAudioRoute`). Sans cette écoute, la
  // première ligne de la feuille — « Le son suit l'appareil que vous branchez »
  // — ne vaudrait que pour l'entrée.
  //
  // Réabonné à chaque bascule de `manualOutput`, ce qui évite une `ref` : le
  // coût est un désabonnement par choix manuel, et le contrat de
  // `watchPreferredDevice` reste de relire à chaque notification.
  useEffect(() => watchPreferredDevice(() => manualOutput), [manualOutput]);

  const handleToggleMic = (): void => {
    const next = !micOn;
    setMicOn(next);
    // L'icône revient où elle était si la commande échoue : elle ne doit jamais
    // annoncer un micro coupé qui ne l'est pas.
    setMicrophoneEnabled(room, next).catch(() => setMicOn(!next));
  };

  const handleToggleCamera = (): void => {
    const next = !cameraOn;
    setCameraOn(next);
    setCameraEnabled(room, next).catch(() => setCameraOn(!next));
  };

  // Deux lectures, un seul instant. `listCameras` peut rejeter : un message
  // d'erreur pour une liste que l'utilisateur vient tout juste de demander à
  // voir n'aiderait personne à agir, et le menu s'ouvre vide — y compris à la
  // réouverture qui suit un échec précédent : la liste est vidée plutôt que
  // laissée à ce qu'a rendu la dernière ouverture réussie, potentiellement
  // périmée entre-temps.
  const handleOpenCameraMenu = (): void => {
    listCameras()
      .then((list) => {
        setCameras(list);
        setActiveCameraId(readActiveCameraId(room));
      })
      .catch(() => setCameras([]));
  };

  // Deux canaux d'échec, les deux traités : le booléen dit qu'Android est
  // retombé sur son repli `facingMode`, le rejet dit que la contrainte a été
  // refusée. L'état local n'avance que sur un vrai succès — même discipline que
  // `handleToggleMic`, qui remet l'icône où elle était quand la commande
  // échoue : l'interface ne doit jamais annoncer une caméra qui n'est pas celle
  // qui filme.
  //
  // Caméra éteinte, le booléen vaut `true` sans rien prouver : c'est correct,
  // la préférence est enregistrée et le prochain `setCameraEnabled(true)` la
  // prendra. Rien à distinguer côté écran.
  const handleSelectCamera = (choice: CameraChoice): void => {
    selectCamera(room, choice.deviceId)
      .then((switched) => {
        if (!switched) {
          onNotice('call.deviceSwitchFailed');
          return;
        }
        setActiveCameraId(choice.deviceId);
        // `'unknown'` n'a pas de miroir défini : la face précédente reste en
        // vigueur plutôt que de retourner l'image sur une valeur qui ne veut
        // rien dire.
        if (choice.facing !== 'unknown') onFacingChange(choice.facing);
        onNotice(null);
      })
      .catch(() => onNotice('call.deviceSwitchFailed'));
  };

  // La liste est relue à chaque ouverture du menu, et à ce moment seulement.
  // Sur Android, entre deux ouvertures, un casque branché ou débranché ne
  // produit aucun changement à l'écran — et rien ne le permettrait : la
  // plateforme n'émet aucun événement, et aucune API ne dit d'où sort le son.
  // La liste est juste dès la réouverture, et le son, lui, a bien suivi. Un
  // rejet la vide plutôt que de laisser voir celle, potentiellement périmée,
  // de la dernière ouverture réussie — même discipline que
  // `handleOpenCameraMenu`.
  const handleOpenAudioOutput = (): void => {
    // Le chemin 'devices' n'emprunte JAMAIS `listAudioOutputs()` : c'est
    // AudioSwitch qui la sert, et AudioSwitch ne tourne pas quand notre module
    // tient la route.
    if (routeControl === 'devices') {
      Promise.all([listAudioDevices(), readCurrentAudioDeviceId()])
        .then(([list, current]) => {
          setDevices(list);
          setCurrentDeviceId(current);
        })
        .catch(() => {
          setDevices([]);
          setCurrentDeviceId(null);
        });
      return;
    }
    listAudioOutputs()
      .then(setOutputs)
      .catch(() => setOutputs([]));
  };

  // `setCommunicationDevice()` rend un booléen, et un `false` est un vrai
  // refus du système : la coche reste alors où elle était plutôt que d'annoncer
  // une route qui n'a pas pris. Même discipline que `handleSelectCamera`.
  const handleSelectAudioDevice = (device: AudioDeviceChoice): void => {
    selectAudioDevice(device.id)
      .then((routed) => {
        if (!routed) {
          onNotice('call.deviceSwitchFailed');
          return;
        }
        setCurrentDeviceId(device.id);
        setManualOutput(true);
        onNotice(null);
      })
      .catch(() => onNotice('call.deviceSwitchFailed'));
  };

  // `clearCommunicationDevice()` rend la main au système, ce qu'AudioSwitch ne
  // sait pas faire. L'identifiant courant est relu APRÈS : le système
  // rebasculera sur son propre choix, et l'écran doit montrer celui-là, pas le
  // nôtre effacé.
  const handleAutomaticAudioOutput = (): void => {
    clearAudioDevice()
      // Rendre la main au système la rendait à l'ÉCOUTEUR : mesuré, Android ne
      // choisit pas le casque tout seul sur ce chemin. « Automatique » veut
      // donc dire NOTRE automatique — la préférence, réappliquée — sans quoi
      // la ligne qui l'annonce serait fausse en un seul geste.
      .then(() => routeToPreferredDevice())
      .then(() => readCurrentAudioDeviceId())
      .then((current) => {
        setManualOutput(false);
        setCurrentDeviceId(current);
      })
      .catch(() => onNotice('call.deviceSwitchFailed'));
  };

  // Posé immédiatement, pas dans un `.then()` : la promesse native est résolue
  // avant que le travail ne soit posté sur son handler, et un identifiant
  // inconnu est un no-op silencieux. Attendre n'apprendrait rien de plus.
  // L'état enregistre ce qui a été *demandé*, et le menu l'affiche comme tel —
  // jamais comme un état constaté.
  const handleSelectAudioOutput = (kind: AudioOutputKind): void => {
    setChosenOutput(kind);
    setManualOutput(true);
    // Aucune branche d'échec, parce qu'il n'en existe aucune : afficher un
    // succès serait du bruit, afficher un échec serait une invention.
    selectAudioOutput(kind).catch(() => undefined);
  };

  // Rien ne dit si le sélecteur de la plateforme est apparu : la méthode native
  // n'a pas de resolver, et elle simule un clic sur une vue jamais insérée dans
  // la hiérarchie. Il n'y a donc rien à lire, et rien à afficher.
  const handleOpenSystemRoutePicker = (): void => {
    openSystemRoutePicker().catch(() => undefined);
  };

  // APRÈS les Hooks et APRÈS les gestionnaires : c'est tout l'intérêt de la
  // prop. Les six états ci-dessus survivent au plein écran, seul le rendu
  // disparaît.
  if (hidden) return null;

  return (
    <View
      style={[styles.controls, { paddingBottom: BAR_PADDING + insets.bottom }]}
      testID="call-controls"
    >
      {/* Le rouge plein du mockup dit « coupé » une seconde fois, à côté du
          glyphe barré : c'est la seule information de cette rangée qu'on
          cherche du coin de l'œil pendant qu'on parle. Un TABLEAU de styles,
          jamais une couleur en ligne — `IconButton` aplatit son `style` pour
          en relire `borderRadius` (`IconButton.tsx:158-161`), et le rayon
          reste donc celui de `barStyles.button`. */}
      <IconButton
        testID="mic-toggle"
        icon={micOn ? 'microphone' : 'microphone-off'}
        iconColor={BAR_ICON_COLOR}
        rippleColor={BAR_RIPPLE_COLOR}
        style={[barStyles.button, micOn ? null : barStyles.danger]}
        hitSlop={BAR_HIT_SLOP}
        onPress={handleToggleMic}
        accessibilityLabel={t('call.muted')}
      />
      {/* La paire caméra : la bascule et le chevron qui lui colle. */}
      <View style={styles.cameraGroup}>
        <IconButton
          testID="camera-toggle"
          icon={cameraOn ? 'video' : 'video-off'}
          iconColor={BAR_ICON_COLOR}
          rippleColor={BAR_RIPPLE_COLOR}
          style={[barStyles.button, cameraOn ? null : barStyles.danger]}
          hitSlop={BAR_HIT_SLOP}
          onPress={handleToggleCamera}
          accessibilityLabel={t('prejoin.cameraOff')}
        />
        <CameraMenu
          cameras={cameras}
          activeDeviceId={activeCameraId}
          onOpen={handleOpenCameraMenu}
          onSelect={handleSelectCamera}
        />
      </View>
      <AudioOutputControl
        mode={routeControl}
        outputs={outputs}
        chosen={chosenOutput}
        devices={devices}
        currentDeviceId={currentDeviceId}
        manual={manualOutput}
        onOpen={handleOpenAudioOutput}
        onSelect={handleSelectAudioOutput}
        onSelectDevice={handleSelectAudioDevice}
        onAutomatic={handleAutomaticAudioOutput}
        onSystemPicker={handleOpenSystemRoutePicker}
      />
      {/* Le partage, seule commande de la barre qu'on n'utilise qu'une fois
          par réunion, passe derrière ce menu, qui porte aussi l'enregistrement
          et la main levée. La raison d'origine était la LARGEUR — la rangée
          était pleine à 357 dp sur 360 —, et le départ du compteur de
          participants l'a détendue à 305. Le menu reste : la commande
          d'enregistrement n'y est jamais adjacente au bouton quitter, et
          c'est cette raison-là qui survit. */}
      <MoreMenu
        recording={recording}
        canRecord={canRecord}
        recordingBusy={recordingBusy}
        handRaised={handRaised}
        handBusy={handBusy}
        hands={hands}
        unread={unread}
        onShare={onShare}
        onStartRecording={onStartRecording}
        onStopRecording={onStopRecording}
        onToggleHand={onToggleHand}
        onSendReaction={onSendReaction}
        onOpenChat={onOpenChat}
      />
      <IconButton
        testID="leave-btn"
        icon="phone-hangup"
        // Le rouge a changé de place : il REMPLIT la pastille, il ne colore
        // plus le glyphe. C'est ce que demande le mockup, et le glyphe doit
        // suivre — #FF8A80 (`dangerDark`, la couleur d'avant) sur ce rouge ne
        // donne que 2,13:1, sous les 3:1 d'un objet graphique. `BAR_ICON_COLOR`
        // en donne 4,11:1, comme sur les six autres boutons de la rangée.
        iconColor={BAR_ICON_COLOR}
        rippleColor={BAR_RIPPLE_COLOR}
        style={[barStyles.button, barStyles.danger]}
        hitSlop={BAR_HIT_SLOP}
        onPress={onLeave}
        accessibilityLabel={t('call.leave')}
      />
    </View>
  );
}
