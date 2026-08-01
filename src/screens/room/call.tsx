import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Share, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, IconButton, Snackbar, Text } from 'react-native-paper';

import { toggleHand } from 'src/api/hand';
import {
  muteParticipant,
  removeParticipant,
  updateParticipantRole,
  type ParticipantRole,
} from 'src/api/participants';
import { startRecording, stopRecording } from 'src/api/recording';
import { fetchRoomAccess } from 'src/api/rooms';
import type { ApiError } from 'src/api/types';
import { getActiveAccount, type Account } from 'src/auth/accounts';
import {
  audioRouteControl,
  listAudioOutputs,
  openSystemRoutePicker,
  selectAudioOutput,
} from 'src/call/audioRoute';
import { createCallSession } from 'src/call/connection';
import type { AudioOutputKind, CameraChoice } from 'src/call/devices';
import { handPosition, isHandRaised, raisedHands } from 'src/call/hands';
import type { ParticipantView } from 'src/call/layout';
import {
  listCameras,
  readActiveCameraId,
  selectCamera,
  setCameraEnabled,
  setMicrophoneEnabled,
  type FacingMode,
} from 'src/call/media';
import { createRoomViewStore } from 'src/call/participants';
import { ensureMediaPermissions } from 'src/call/permissions';
import {
  canStartRecording,
  recordingErrorMessage,
  type RecordingMessageKey,
} from 'src/call/recording';
import { createRecordingStore } from 'src/call/recordingStore';
import type { CallState, RoomAccess } from 'src/call/types';
import { useCallLayout } from 'src/call/useCallLayout';
import { useWaitingParticipants } from 'src/rooms/useWaitingParticipants';
import { firstWaiting } from 'src/rooms/waitingQueue';
import { AudioOutputControl } from 'src/screens/room/audioOutputControl';
import { CameraMenu } from 'src/screens/room/cameraMenu';
import {
  BAR_HIT_SLOP,
  BAR_ICON_COLOR,
  BAR_RIPPLE_COLOR,
  barStyles,
} from 'src/screens/room/controlBar';
import { HandBanner } from 'src/screens/room/handBanner';
import { MoreMenu } from 'src/screens/room/moreMenu';
import { ParticipantsPanel } from 'src/screens/room/participantsPanel';
import { RecordingIndicator } from 'src/screens/room/recordingIndicator';
import { CallStage } from 'src/screens/room/stage';
import { WaitingBanner } from 'src/screens/room/waitingBanner';
import { tokens } from 'src/ui/tokens';

// Les seules raisons que l'écran sait dire quand il n'y a pas de séance. Ce
// sont des clés de traduction : rien de ce qui vient du réseau ou du SDK ne
// s'affiche tel quel.
type MessageKey =
  | 'error.network'
  | 'error.unauthorized'
  | 'call.ended'
  | 'call.permissionsDenied'
  | 'call.deviceSwitchFailed'
  | 'call.handFailed'
  | RecordingMessageKey;

// La même distinction grossière sert deux appelants : l'accès initial au
// salon (où c'est là, et là seulement, qu'un jeton refusé se distingue d'une
// panne — `lobby` voudrait dire que l'accès a été retiré entre le pré-écran
// et ici, et le plan ne décrit aucun retour vers la salle d'attente depuis la
// séance, ce cas est donc traité comme les autres refus plutôt qu'inventé) et
// les trois actions de modération plus bas, dont l'échec ordinaire arrive de
// la même façon : une valeur `ApiResult`, jamais une exception.
function toApiErrorMessage(error: ApiError): MessageKey {
  return error.kind === 'unauthorized' ? 'error.unauthorized' : 'error.network';
}

// `reason` est le texte brut du SDK : ni traduit, ni stable d'une version de
// livekit-client à l'autre, ni lisible par la personne à qui on le montrerait.
// Il ne s'affiche jamais. `closed` est le seul motif que `src/call/connection`
// produit lui-même — le serveur a mis fin à la séance, ce qui n'est pas une
// panne ; tout le reste vient d'un `room.connect()` en échec.
//
// On ne cherche pas `error.unauthorized` ici : `connection.ts` ne conserve que
// `err.message` et laisse tomber le `ConnectionErrorReason` structuré du SDK.
// Deviner l'autorisation depuis ce texte serait faux dès la version suivante.
function toDisconnectMessage(reason: string): MessageKey {
  return reason === 'closed' ? 'call.ended' : 'error.network';
}

// `useWaitingParticipants` exige un compte, et les Hooks doivent s'exécuter à
// chaque rendu, y compris quand personne n'est connecté. `access` — qui
// gouverne la garde juste en dessous — ne se remplit que depuis l'effet de
// connexion, lui-même arrêté dès qu'il constate l'absence de compte : ce
// repli ne sert donc jamais de véritable requête, il ne fait que satisfaire le
// typage d'un appel de Hook qui ne peut pas être conditionnel.
const NO_ACCOUNT: Account = {
  id: '',
  instance: {
    serverUrl: '',
    issuer: '',
    clientId: '',
    livekitUrl: '',
    features: { recording: false, subtitle: false, telephony: false },
  },
  email: '',
  displayName: '',
};

// Quelques secondes, à la manière d'un lecteur vidéo : assez pour lire les
// commandes et agir, pas assez pour qu'elles gênent la vidéo qu'on regarde en
// plein écran. La vérification sur appareil (D4, voir le plan) capture à
// quatre secondes pour confirmer qu'elles se sont retirées ; ce nombre est
// celui qui rend cette capture vraie. Non exportée : les tests qui en ont
// besoin la reproduisent en dur, comme `WAITING_POLL_MS` de
// `useWaitingParticipants.ts` en dehors de ce fichier.
const CHROME_REVEAL_MS = 4000;

const styles = StyleSheet.create({
  // La scène reste sombre dans les deux schémas : c'est la convention de toute
  // la visioconférence, et un fond clair autour d'une vignette vidéo éblouit
  // dans une pièce éteinte.
  root: { flex: 1, backgroundColor: tokens.color.backgroundDark },
  banner: { alignItems: 'center', paddingVertical: tokens.spacing.sm },
  bannerText: { color: tokens.color.textDark },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    // 8 dp entre groupes, 4 dp de marge de rangée : c'est ce qui fait tenir
    // sept cibles de 44 dp sur 357 dp, donc sur un écran de 360.
    gap: tokens.spacing.sm,
    padding: tokens.spacing.xs,
  },
  // La sortie du plein écran, seule dans sa propre rangée : la barre ci-dessus
  // est déjà pleine à 357 dp sur 360 (`controlBar.ts`), une huitième cible n'y
  // tiendrait pas. Cette rangée n'existe QUE par-dessus une tuile plein écran,
  // jamais ailleurs — voir le point critique de cette tâche.
  fullscreenExitRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    padding: tokens.spacing.xs,
  },
  // 1 dp à l'intérieur de la paire caméra : elle se lit comme une paire, ce que
  // le web obtient avec `gap: '1px'`.
  cameraGroup: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  message: { textAlign: 'center' },
});

export function CallScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const { slug, camera, mic } = useLocalSearchParams<{
    slug: string;
    camera?: string;
    mic?: string;
  }>();

  // `useState` et non `useMemo` : React se réserve le droit de jeter un
  // `useMemo`, et une session jetée laisse derrière elle une Room vivante —
  // donc un micro, une caméra et un transport que plus personne ne fermera.
  const [session] = useState(createCallSession);

  // `subscribe()` ne pousse pas l'état courant : il n'enregistre l'abonné que
  // pour les transitions suivantes. Lire `getState()` ici est ce qui rend
  // l'écran juste quel que soit l'ordre des effets, et ce qui le laissera juste
  // le jour où une session déjà ouverte lui sera passée. Un écran qui attend
  // une poussée à l'abonnement reste sur le voyant de connexion pour toujours.
  const [callState, setCallState] = useState<CallState>(() => session.getState());

  // Sans compte actif, il n'y a pas de jeton à demander. L'état de départ le
  // dit dès le premier rendu : le poser depuis l'effet appellerait setState de
  // façon synchrone, ce que `react-hooks/set-state-in-effect` refuse.
  const [failure, setFailure] = useState<MessageKey | null>(() =>
    getActiveAccount() === null ? 'error.unauthorized' : null,
  );

  const [micOn, setMicOn] = useState(mic !== '0');
  const [cameraOn, setCameraOn] = useState(camera !== '0');
  // Le SDK n'expose pas la face courante d'une piste : c'est l'écran qui la
  // conserve, et il la reprend du `CameraChoice` que le menu lui rend.
  const [facing, setFacing] = useState<FacingMode>('user');

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

  // La Room est prête et son identité stable dès le premier rendu — la session
  // la construit dans son constructeur. Le crochet doit être appelé ici, avant
  // les sorties anticipées ci-dessous : il n'y a pas de rendu où l'écran aurait
  // le droit de ne pas l'appeler.
  //
  // La clé de la tuile épinglée, jamais un participant : depuis le partage
  // d'écran, une personne produit deux tuiles, `${identity}:camera` et
  // `${identity}:screen` — épingler LA PERSONNE serait ambigu entre les deux.
  // `CallStage` est démontée quand le panneau des participants s'ouvre (voir
  // plus bas) : un état tenu dans la coquille serait perdu à chaque
  // ouverture, il vit donc ici.
  const [pin, setPin] = useState<string | null>(null);

  // La clé de la tuile plein écran, indépendante de l'épinglage : les deux
  // gestes ne se recouvrent pas, un appui simple épingle sans y entrer, un
  // appui long y entre sans changer l'épinglage. Résolue plus bas, une fois
  // `layout` connu — voir `fullscreenTile`.
  const [fullscreen, setFullscreen] = useState<string | null>(null);

  // Les commandes rappelées PAR-DESSUS la tuile plein écran, à la manière d'un
  // lecteur vidéo — jamais un état qui a un sens hors plein écran. Voir le
  // `useEffect` plus bas, qui l'arme et la désarme, et `handlePressTile`, qui
  // la pose.
  const [chromeVisible, setChromeVisible] = useState(false);

  // Tout ce qui se décide de l'affichage est derrière ce seul appel :
  // `src/call/participants` lit la Room, `src/call/layout` choisit, et l'écran
  // n'a plus qu'une liste de vignettes à passer à sa coquille de rendu.
  const layout = useCallLayout(session.getRoom(), facing, pin);

  // Résolue contre la disposition présente, comme l'épinglage : une tuile qui
  // disparaît (la personne quitte la séance) ne laisse pas l'écran figé sur du
  // vide, elle retombe sur la disposition normale au rendu suivant. Ce n'est
  // pas une décision de disposition — `selectLayout` n'a pas à connaître cette
  // notion d'écran, donc elle ne passe jamais par lui : on sait déjà quelle
  // tuile, on choisit seulement de ne montrer qu'elle.
  //
  // Calculée AVANT les gestionnaires ci-dessous, qui la lisent : une référence
  // prise plus haut dans le corps de la fonction lèverait une erreur
  // d'initialisation dès le premier rendu, la lecture faisant partie du
  // tableau de dépendances de `useCallback`, évalué immédiatement.
  const fullscreenTile =
    fullscreen === null
      ? null
      : ([layout.stage, ...layout.filmstrip].find((t) => t.key === fullscreen) ?? null);

  // La tuile résolue, jamais la clé brute `fullscreen` : la clé reste posée
  // même quand elle ne résout plus (une personne mise en plein écran qui
  // quitte la séance), et l'écran retombe alors sur la disposition normale —
  // voir le commentaire ci-dessus. Un appui y redeviendrait un no-op
  // silencieux, ni épinglage ni rappel, si le court-circuit ci-dessous lisait
  // la clé plutôt que sa résolution contre CE rendu.
  const inFullscreen = fullscreenTile !== null;

  // Point de conception tranché ici : `onPressTile` de la tuile plein écran
  // est câblé vers CE gestionnaire (voir `stage.tsx`), qui épingle hors plein
  // écran. Sans ce court-circuit, un appui pour rappeler les commandes
  // épinglerait aussi la tuile en secret — invisible sur le moment puisque la
  // bande est masquée, et qui ne resurgirait qu'à la sortie, sous la forme
  // d'un épinglage que personne n'a consciemment demandé. On court-circuite
  // donc le câblage plutôt que d'ajouter un second geste : en plein écran, un
  // appui ne veut jamais dire autre chose que « montre-moi les commandes », à
  // la manière d'un lecteur vidéo — la convention retenue par la conception
  // (`docs/superpowers/specs/2026-08-01-grid-and-pinning-design.md`, décision
  // du 2026-08-01) pour l'appui long qui mène ici.
  //
  // Hors plein écran, inchangé : une seule instruction, DEUX issues — un
  // second appui sur la tuile déjà épinglée la désépingle, ce qui rend le
  // geste réversible sans rien apprendre de plus. Chacune des deux issues
  // veut son propre test : sans celui du désépinglage, une implémentation qui
  // écrirait `setPin(key)` sans jamais repasser à `null` passerait quand même
  // le premier.
  const handlePressTile = useCallback(
    (key: string): void => {
      if (inFullscreen) {
        setChromeVisible(true);
        return;
      }
      setPin((current) => (current === key ? null : key));
    },
    [inFullscreen],
  );

  // Le plein écran affiche la tuile touchée seule, sans bande ni barre de
  // contrôle — voir `fullscreenTile` plus haut, qui résout la clé contre la
  // disposition courante, et son passage à `CallStage` plus bas.
  const handleLongPressTile = useCallback((key: string): void => {
    setFullscreen(key);
  }, []);

  // E4, les DEUX instructions : quitter le plein écran ET désarmer le
  // minuteur de disparition. Sans la seconde, `chromeVisible` resterait à
  // `true` et le PROCHAIN plein écran rallumerait les commandes sans qu'on ait
  // rien demandé — le `useEffect` juste en dessous ne désarme
  // qu'en RÉACTION à un changement de cette valeur, jamais de son propre chef.
  const handleExitFullscreen = useCallback((): void => {
    setFullscreen(null);
    setChromeVisible(false);
  }, []);

  // E3 : afficher ET armer la disparition — deux instructions, une seule
  // dépendance. E4 : la sortie du plein écran (ci-dessus) doit désarmer,
  // sinon le minuteur se déclenche sur un composant démonté ou rallume les
  // commandes après coup. C'est la ligne qu'on oublie, et le `return` de CE
  // `useEffect` est ce qui la rend automatique plutôt que manuelle : il
  // s'exécute à chaque changement de `chromeVisible`, qu'il vienne du
  // minuteur lui-même ou de `handleExitFullscreen`.
  useEffect(() => {
    if (!chromeVisible) return undefined;
    const id = setTimeout(() => setChromeVisible(false), CHROME_REVEAL_MS);
    return () => clearTimeout(id);
  }, [chromeVisible]);

  // Un compte frais à chaque rendu, comme au premier rendu de `failure`
  // ci-dessus : il ne change pas en cours de séance, mais rien ne le fige dans
  // un état — c'est le même accesseur que l'effet de connexion et que
  // `handleShare` lisent déjà chacun de leur côté.
  const account = getActiveAccount();

  // L'accès complet, pas seulement ses morceaux : la salle d'attente et le
  // panneau de modération ont chacun besoin d'une facette différente de
  // `RoomAccess`, et dupliquer l'effet de connexion pour chacune n'aurait
  // aucune raison d'être.
  const [access, setAccess] = useState<RoomAccess | null>(null);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  // Une requête en vol, jamais un état désiré : l'affichage suit l'attribut,
  // et lui seul. Partagé par la commande du menu et par le bandeau, qui
  // portent sur le même état — deux requêtes concurrentes en sens opposé
  // produiraient un résultat qui dépend de leur ordre d'arrivée au serveur.
  const [handBusy, setHandBusy] = useState(false);

  // `ApiResult<void>` rend son échec ordinaire — un salon dont on n'est plus
  // administrateur, un 403 — comme une *valeur* (`{ ok: false }`), jamais
  // comme un rejet : un simple `.catch()` sur ces trois actions ne le
  // verrait donc jamais passer. Une seule case pour cinq actions — les trois
  // de modération et les deux canaux d'échec du changement de caméra — qui ne
  // se déclenchent qu'un geste à la fois.
  const [notice, setNotice] = useState<MessageKey | null>(null);

  // Une deuxième lecture de la Room, indépendante de `useCallLayout` :
  // celle-ci choisit qui a la scène et réordonne la bande sous le doigt à
  // chaque changement de locuteur (voir `src/call/layout`) — un panneau de
  // modération qui suivrait cet ordre ferait glisser une ligne sous le pouce
  // qui s'apprête à appuyer. Le panneau a besoin de l'ordre stable de la Room
  // elle-même, jamais de celui, mouvant, choisi pour la scène.
  const roomViewStore = useMemo(() => createRoomViewStore(session.getRoom()), [session]);
  const roomView = useSyncExternalStore(roomViewStore.subscribe, roomViewStore.getSnapshot);
  const participants = useMemo<readonly ParticipantView[]>(
    () => [roomView.local, ...roomView.remotes],
    [roomView],
  );

  // La file est dérivée de la même vue, sans second magasin : le store est
  // déjà invalidé par `ParticipantAttributesChanged`, et `readRoomView`
  // reconstruit la vue entière.
  const hands = useMemo(() => raisedHands(roomView), [roomView]);
  const handRaised = isHandRaised(roomView.local);
  const handRank = handPosition(hands, roomView.local.identity);

  // Une troisième lecture de la Room, indépendante des deux autres :
  // `getSnapshot()` lit `room.metadata` directement, sans attendre aucun
  // événement — le SDK n'émet pas `RoomMetadataChanged` à la jonction, et un
  // indicateur qui l'attendrait resterait éteint toute la séance pour qui
  // rejoint une réunion déjà enregistrée. Déclaré ici, avec les autres Hooks,
  // avant les sorties anticipées.
  const recordingStore = useMemo(() => createRecordingStore(session.getRoom()), [session]);
  const recordingState = useSyncExternalStore(recordingStore.subscribe, recordingStore.getSnapshot);

  // `Room.id` est `string | null` depuis le premier commit d'API : distinct
  // d'`access?.room.id`, dont les usages plus bas l'écrasaient en `''` — au
  // lieu de garder l'absence — ce qui fabriquait des routes de la forme
  // `/api/v1.0/rooms//mute-participant/`.
  const roomId = access?.room.id ?? null;

  // Une valeur, pas une lecture de `Platform` par le composant : c'est ce qui
  // permet à une spec de rendre les deux branches sans bouchonner la
  // plateforme.
  const routeControl = audioRouteControl();

  // Les trois gardes réunies : un salon public n'a pas de salle d'attente,
  // sans privilège le serveur refuserait la requête, et sans identifiant de
  // salon il n'y a pas de route à construire. Sans ce dernier, un salon
  // administrable dont `room.id` vaut `null` scrutait quand même
  // `/api/v1.0/rooms//waiting-participants/` toutes les cinq secondes.
  const canModerate = access !== null && access.isAdministrable && roomId !== null;
  const hasLobby = access !== null && access.room.accessLevel !== 'public';

  // Même forme que `canModerate`, `roomId !== null` inclus pour la même raison
  // exactement : sans lui, un salon dont `room.id` vaut `null` fabriquerait
  // `/api/v1.0/rooms//start-recording/`. `canStartRecording` est la frontière
  // de divergence entre `main` et le déployé — tout ce qu'elle laisse passer
  // est accepté par les deux serveurs.
  const canRecord =
    account !== null &&
    roomId !== null &&
    access !== null &&
    canStartRecording(account.instance.features, access);

  // `roomId ?? ''` ne sert jamais de véritable requête : dès que `roomId` est
  // `null`, `canModerate` (et donc `enabled` ci-dessous) vaut déjà `false`, et
  // l'effet de scrutation du Hook ne se déclenche pas. Le repli n'existe que
  // pour le typage d'un appel de Hook qui ne peut pas être conditionnel —
  // même raison que `NO_ACCOUNT` juste au-dessus.
  const { waiting, answer } = useWaitingParticipants(
    account ?? NO_ACCOUNT,
    roomId ?? '',
    canModerate && hasLobby,
  );

  // Déclaré avant l'effet de connexion : les nettoyages s'exécutent dans
  // l'ordre de déclaration des effets, le désabonnement précède donc la
  // libération de la session.
  useEffect(() => {
    const unsubscribe = session.subscribe(setCallState);
    return () => {
      unsubscribe();
      // Terminal. Sans lui, chaque passage sur cet écran laisse derrière lui
      // une Room vivante, et avec elle le micro, la caméra et le transport.
      session.dispose();
    };
  }, [session]);

  // Ne dépend d'aucune des bascules : le nettoyage d'un effet s'exécute à
  // chacune de ses relances, et un effet de connexion qui dépendrait de `micOn`
  // couperait la séance à chaque appui sur le micro.
  useEffect(() => {
    // Nom distinct du `account` de plus haut : celui-ci vit dans la fermeture
    // de l'effet et ne doit rien à sa cadence de relance, alors que le premier
    // est relu à chaque rendu — les confondre masquerait laquelle des deux
    // valeurs alimente vraiment `fetchRoomAccess`.
    const activeAccount = getActiveAccount();
    if (activeAccount === null) return;

    let cancelled = false;

    fetchRoomAccess(activeAccount, slug)
      .then(async (result) => {
        if (cancelled) return;
        if (!result.ok) {
          setFailure(toApiErrorMessage(result.error));
          return;
        }

        // Connu dès que le serveur confirme l'accès, indépendamment de la
        // suite : la salle d'attente et le panneau de modération ne dépendent
        // pas de la négociation média ni de la connexion LiveKit ci-dessous.
        setAccess(result.value);

        // Le manifeste déclare caméra et micro, mais Android exige de les
        // demander à l'exécution. Sans cette demande ils restent refusés, rien
        // n'est publié, et la négociation WebRTC expire sur un message qui ne
        // nomme pas sa cause — mesuré sur appareil. On demande avant d'ouvrir
        // le transport, pour que le refus se lise au lieu de se deviner.
        if (!(await ensureMediaPermissions())) {
          if (!cancelled) setFailure('call.permissionsDenied');
          return;
        }
        if (cancelled) return;

        // `connect()` ne rejette jamais : l'issue est publiée sur l'abonnement
        // ci-dessus, elle n'est pas portée par la promesse. Il n'y a donc pas
        // de jet à rattraper ici, seulement un état à lire — pour ne pas
        // allumer les périphériques d'une séance qui ne s'est pas ouverte.
        await session.connect(result.value);
        if (cancelled || session.getState().status !== 'connected') return;

        // Les choix faits au pré-écran arrivent par l'URL : entrer micro ouvert
        // quand la personne l'avait coupé la ferait parler sans le savoir.
        await setMicrophoneEnabled(session.getRoom(), mic !== '0');
        await setCameraEnabled(session.getRoom(), camera !== '0');
      })
      .catch(() => {
        if (!cancelled) setFailure('error.network');
      });

    return () => {
      cancelled = true;
    };
  }, [session, slug, camera, mic]);

  const handleToggleMic = (): void => {
    const next = !micOn;
    setMicOn(next);
    // L'icône revient où elle était si la commande échoue : elle ne doit jamais
    // annoncer un micro coupé qui ne l'est pas.
    setMicrophoneEnabled(session.getRoom(), next).catch(() => setMicOn(!next));
  };

  const handleToggleCamera = (): void => {
    const next = !cameraOn;
    setCameraOn(next);
    setCameraEnabled(session.getRoom(), next).catch(() => setCameraOn(!next));
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
        setActiveCameraId(readActiveCameraId(session.getRoom()));
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
    selectCamera(session.getRoom(), choice.deviceId)
      .then((switched) => {
        if (!switched) {
          setNotice('call.deviceSwitchFailed');
          return;
        }
        setActiveCameraId(choice.deviceId);
        // `'unknown'` n'a pas de miroir défini : la face précédente reste en
        // vigueur plutôt que de retourner l'image sur une valeur qui ne veut
        // rien dire.
        if (choice.facing !== 'unknown') setFacing(choice.facing);
        setNotice(null);
      })
      .catch(() => setNotice('call.deviceSwitchFailed'));
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
    listAudioOutputs()
      .then(setOutputs)
      .catch(() => setOutputs([]));
  };

  // Posé immédiatement, pas dans un `.then()` : la promesse native est résolue
  // avant que le travail ne soit posté sur son handler, et un identifiant
  // inconnu est un no-op silencieux. Attendre n'apprendrait rien de plus.
  // L'état enregistre ce qui a été *demandé*, et le menu l'affiche comme tel —
  // jamais comme un état constaté.
  const handleSelectAudioOutput = (kind: AudioOutputKind): void => {
    setChosenOutput(kind);
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

  // Le lien porte sur l'instance du compte, jamais sur une constante : une
  // personne connectée ailleurs partagerait sinon un lien vers la nôtre, qui ne
  // mène pas à sa réunion.
  const handleShare = async (): Promise<void> => {
    // Nom distinct du `account` de plus haut pour la même raison que dans
    // l'effet de connexion : celui-ci n'est relu qu'au moment du partage, pas
    // à chaque rendu.
    const activeAccount = getActiveAccount();
    if (activeAccount === null) return;
    const url = `${activeAccount.instance.serverUrl}/${slug}`;
    try {
      await Share.share({ message: url, url });
    } catch {
      // Le partage annulé n'est pas une erreur, et rien à dire de plus.
    }
  };

  const handleLeave = (): void => {
    // La fermeture d'abord, la navigation ensuite. Naviguer démonte l'écran, et
    // le nettoyage peut alors ne jamais atteindre le serveur : les autres
    // verraient un participant fantôme rester dans la réunion.
    session
      .disconnect()
      .catch(() => undefined)
      .finally(() => router.replace('/home'));
  };

  // L'état du bouton suit l'attribut, jamais l'appui : c'est le seul affichage
  // qui ne peut pas mentir. Le `200` HTTP ne change rien à l'écran — le
  // backend écrit un attribut, et c'est le serveur LiveKit qui le diffuse,
  // deux sauts plus loin.
  //
  // `result.ok` d'abord, un `.catch()` séparé pour l'exception inattendue :
  // l'échec ordinaire de `toggleHand` est une *valeur* résolue, jamais un
  // rejet — un `.catch()` seul ne verrait jamais passer un 403.
  //
  // La garde porte sur `handBusy` par *valeur* : `disabled` est interdit sur
  // cet écran, Paper le teste avant toute couleur explicite.
  const handleToggleHand = (): void => {
    if (account === null || access === null || handBusy) return;
    setHandBusy(true);
    toggleHand(
      account.instance.serverUrl,
      // `RoomViewSet.get_object()` tente l'UUID puis retombe sur le slug : les
      // deux formes résolvent le même objet, et le repli supprime purement et
      // simplement le cas `room.id === null`.
      access.room.id ?? access.room.slug,
      access.token,
      !handRaised,
    )
      .then((result) => {
        setHandBusy(false);
        setNotice(result.ok ? null : 'call.handFailed');
      })
      .catch(() => {
        setHandBusy(false);
        setNotice('call.handFailed');
      });
  };

  // C1 : ouvrir ce panneau démonte `CallStage` juste en dessous, qui porte le
  // SEUL `Pressable` capable de rappeler les commandes en plein écran (voir
  // `handlePressTile`). Sans cette sortie, le minuteur de `chromeVisible` —
  // qui continue de tourner, lui, puisqu'il vit ICI et pas dans la coquille —
  // finit par démonter la rangée de sortie ET la barre normale, et il ne
  // reste plus un seul bouton atteignable sur tout l'écran : un enfermement
  // total. Ouvrir ce panneau est déjà un geste de « je quitte la vidéo » ;
  // `handleExitFullscreen` le rend total. Seulement à l'OUVERTURE : le
  // fermer n'a jamais eu besoin de ce nettoyage, et l'appeler aussi dans ce
  // sens serait un no-op silencieux — `fullscreen` est déjà `null` à ce
  // moment-là.
  const handleToggleParticipants = (): void => {
    if (!participantsOpen) handleExitFullscreen();
    setParticipantsOpen(!participantsOpen);
  };

  // `answer` a déjà retiré la personne de la file de façon optimiste (voir
  // `useWaitingParticipants`) ; elle ne fait que rendre le résultat du
  // réseau. Même lecture que les trois actions ci-dessous : `result.ok`
  // d'abord, un `.catch()` séparé pour l'exception inattendue. Sans elle, un
  // 403 sur `enter` — un autre modérateur a répondu entre-temps, ou le droit
  // d'administrer a été retiré — n'avait aucun retour visible, et la
  // personne réapparaissait en fin de file cinq secondes plus tard sans un
  // mot : le modérateur croyait avoir ouvert la porte, la personne dehors
  // n'entrait jamais.
  const handleAnswerEntry = (id: string, allow: boolean): void => {
    answer(id, allow)
      .then((result) => setNotice(result.ok ? null : toApiErrorMessage(result.error)))
      .catch(() => setNotice('error.network'));
  };

  // Les trois actions de modération portent l'identité LiveKit que
  // `ParticipantsPanel` leur passe (`ParticipantView.identity`, reçue ici comme
  // `identity`) — jamais l'UUID de lobby que porte `WaitingParticipant.id` et
  // qu'utilise `handleAnswerEntry` ci-dessus. Les deux ne s'échangent pas, et le panneau
  // ne connaît de toute façon que la première. Ces rappels ne sont atteignables
  // que depuis une ligne du panneau, lequel ne montre ses actions que lorsque
  // `canModerate` vaut vrai — donc lorsque `account` et `roomId` sont déjà
  // remplis. La garde `if (account === null || roomId === null) return;`
  // n'existe que pour le typage, jamais pour un cas atteint en pratique — et
  // elle évite du même coup le `?? ''` qui fabriquait
  // `/api/v1.0/rooms//mute-participant/` quand `room.id` valait `null`.
  //
  // Chacune lit `result.ok` : un `.catch()` seul ne couvrirait qu'une
  // exception inattendue d'`authedFetch`, jamais le chemin d'échec ordinaire
  // de ces trois fonctions, qui est une valeur (`{ ok: false }`) résolue, pas
  // rejetée. Sans cette lecture, couper le micro ou promouvoir n'ont aucun
  // retour visible, et expulser ne fait disparaître la ligne que si le
  // serveur a réellement expulsé — un 403 devient indiscernable d'un appui
  // non enregistré. Un succès efface une éventuelle erreur affichée par un
  // essai précédent.
  const handleMuteParticipant = (identity: string): void => {
    if (account === null || roomId === null) return;
    muteParticipant(account, roomId, identity)
      .then((result) => setNotice(result.ok ? null : toApiErrorMessage(result.error)))
      .catch(() => setNotice('error.network'));
  };

  const handleRemoveParticipant = (identity: string): void => {
    if (account === null || roomId === null) return;
    removeParticipant(account, roomId, identity)
      .then((result) => setNotice(result.ok ? null : toApiErrorMessage(result.error)))
      .catch(() => setNotice('error.network'));
  };

  const handleChangeParticipantRole = (identity: string, role: ParticipantRole): void => {
    if (account === null || roomId === null) return;
    updateParticipantRole(account, roomId, identity, role)
      .then((result) => setNotice(result.ok ? null : toApiErrorMessage(result.error)))
      .catch(() => setNotice('error.network'));
  };

  // `result.ok` d'abord, un `.catch()` séparé pour l'exception inattendue :
  // l'échec ordinaire de ces deux fonctions est une *valeur* résolue, jamais un
  // rejet — un `.catch()` seul ne le verrait pas passer, et le périmètre B a
  // livré ce bogue deux fois. Aucun état optimiste : les métadonnées sont la
  // source unique, et un « en cours » local créerait une seconde source qui
  // peut contredire la première. Un succès efface l'erreur d'un essai
  // précédent, comme les trois actions de modération.
  const handleStartRecording = (): void => {
    if (account === null || roomId === null) return;
    setRecordingBusy(true);
    startRecording(account, roomId)
      .then((result) => {
        setRecordingBusy(false);
        setNotice(result.ok ? null : recordingErrorMessage('start', result.error));
      })
      .catch(() => {
        setRecordingBusy(false);
        setNotice('error.network');
      });
  };

  // Le serveur n'exige pas d'être celui qui a démarré l'enregistrement pour
  // l'arrêter : la commande est offerte à tout administrateur du salon.
  const handleStopRecording = (): void => {
    if (account === null || roomId === null) return;
    setRecordingBusy(true);
    stopRecording(account, roomId)
      .then((result) => {
        setRecordingBusy(false);
        setNotice(result.ok ? null : recordingErrorMessage('stop', result.error));
      })
      .catch(() => {
        setRecordingBusy(false);
        setNotice('error.network');
      });
  };

  const message: MessageKey | null =
    failure ?? (callState.status === 'disconnected' ? toDisconnectMessage(callState.reason) : null);

  if (message !== null) {
    return (
      <View style={styles.centered}>
        <Text testID="call-error" variant="titleMedium" style={styles.message}>
          {t(message)}
        </Text>
        {/* L'en-tête est masqué par le Stack : sans cette sortie, un écran
            d'erreur est un cul-de-sac dont on ne sort qu'en tuant l'application. */}
        <Button mode="contained" testID="error-leave-btn" onPress={handleLeave}>
          {t('call.leave')}
        </Button>
      </View>
    );
  }

  if (callState.status === 'idle' || callState.status === 'connecting') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator testID="call-connecting" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Au-dessus de la scène : ne rend rien tant que personne n'attend, donc
          toujours monté, jamais enveloppé d'une condition. */}
      <WaitingBanner
        participant={firstWaiting(waiting)}
        remaining={Math.max(waiting.length - 1, 0)}
        onAnswer={handleAnswerEntry}
      />

      {/* Vu de tout le monde, y compris de qui n'a aucun bouton : ne rend rien
          au repos, donc toujours monté, jamais enveloppé d'une condition. */}
      <RecordingIndicator state={recordingState} />

      {/* Une main levée oubliée serait invisible pour qui l'a levée : ce
          bandeau la dit, et la baisse en un seul appui. Ne rend rien au repos,
          donc toujours monté, jamais enveloppé d'une condition. La bande
          empile ses lignes : l'indicateur d'enregistrement et celui-ci
          peuvent être vrais en même temps. */}
      <HandBanner raised={handRaised} position={handRank} onLower={handleToggleHand} />

      {/* Le panneau remplace la scène plutôt que de se poser par-dessus : les
          deux se disputeraient la même vidéo, qui est la raison d'être de cet
          écran. La barre de contrôle, elle, reste en place dans les deux cas —
          le même bouton referme le panneau, et quitter reste toujours possible. */}
      {participantsOpen ? (
        <ParticipantsPanel
          participants={participants}
          canModerate={canModerate}
          onMute={handleMuteParticipant}
          onRemove={handleRemoveParticipant}
          onRole={handleChangeParticipantRole}
        />
      ) : (
        // Parti pris mobile : locuteur actif en grand, vignettes en bande. La
        // grille du web rend chaque visage illisible sur un écran de téléphone.
        <CallStage
          layout={layout}
          onPressTile={handlePressTile}
          onLongPressTile={handleLongPressTile}
          fullscreenTile={fullscreenTile}
        />
      )}

      {/* La reconnexion se dit : sans cela la personne regarde une image figée
          en croyant que c'est cassé, et raccroche alors que ça se rétablit. */}
      {callState.status === 'reconnecting' ? (
        <View style={styles.banner}>
          <Text testID="call-reconnecting" style={styles.bannerText}>
            {t('call.reconnecting')}
          </Text>
        </View>
      ) : null}

      {/* LE POINT CRITIQUE de cette tâche : sans cette rangée, un plein écran
          sur sa PROPRE tuile n'a strictement aucune sortie — le repli habituel
          (la tuile disparaît) ne peut pas jouer sur soi-même, et `leave-btn`,
          qui permettrait de quitter la séance à défaut, est dans la barre que
          le plein écran masque. Rendue UNIQUEMENT ici, par-dessus la tuile
          seule, jamais confondue avec la barre normale ci-dessous : aucun de
          ses sept boutons ne fait sortir DU plein écran, « raccrocher »
          compris, qui quitte la séance entière — un pis-aller, pas la sortie
          que ce point critique exige. Jamais `disabled` : à l'appui, elle agit
          toujours. */}
      {inFullscreen && chromeVisible ? (
        <View style={styles.fullscreenExitRow}>
          <IconButton
            testID="fullscreen-exit-btn"
            icon="fullscreen-exit"
            iconColor={BAR_ICON_COLOR}
            rippleColor={BAR_RIPPLE_COLOR}
            style={barStyles.button}
            hitSlop={BAR_HIT_SLOP}
            onPress={handleExitFullscreen}
            accessibilityLabel={t('call.exitFullscreen')}
          />
        </View>
      ) : null}

      {/* Masquée en plein écran, SAUF commandes rappelées : `chromeVisible` la
          fait réapparaître par-dessus la tuile seule, exactement comme un
          lecteur vidéo — voir `handlePressTile`. Elle reste inchangée dans ce
          cas : mêmes sept boutons, y compris `leave-btn`, qui reste un moyen
          de quitter la séance entière ; la rangée juste au-dessus est celle
          qui fait sortir DU plein écran. */}
      {fullscreenTile === null || chromeVisible ? (
        <View style={styles.controls}>
          <IconButton
            testID="mic-toggle"
            icon={micOn ? 'microphone' : 'microphone-off'}
            iconColor={BAR_ICON_COLOR}
            rippleColor={BAR_RIPPLE_COLOR}
            style={barStyles.button}
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
              style={barStyles.button}
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
            onOpen={handleOpenAudioOutput}
            onSelect={handleSelectAudioOutput}
            onSystemPicker={handleOpenSystemRoutePicker}
          />
          {/* La rangée est pleine à 357 dp sur 360 : une huitième cible en
            demanderait 409. Le partage, seule commande de la barre qu'on
            n'utilise qu'une fois par réunion, passe donc derrière ce menu, qui
            porte aussi l'enregistrement et la main levée. Sept cibles avant,
            sept après — et la commande d'enregistrement n'est jamais
            adjacente au bouton quitter. */}
          <MoreMenu
            recording={recordingState}
            canRecord={canRecord}
            recordingBusy={recordingBusy}
            handRaised={handRaised}
            handBusy={handBusy}
            hands={hands}
            onShare={handleShare}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            onToggleHand={handleToggleHand}
          />
          <IconButton
            testID="participants-toggle"
            icon="account-multiple"
            iconColor={BAR_ICON_COLOR}
            rippleColor={BAR_RIPPLE_COLOR}
            style={barStyles.button}
            hitSlop={BAR_HIT_SLOP}
            onPress={handleToggleParticipants}
            accessibilityLabel={t('participants.title')}
          />
          <IconButton
            testID="leave-btn"
            icon="phone-hangup"
            // La variante sombre : #C62828 sur #0B0B0C tombe à 3,4:1, sous le
            // seuil WCAG AA, et la scène est sombre dans les deux schémas.
            iconColor={tokens.color.dangerDark}
            rippleColor={BAR_RIPPLE_COLOR}
            style={barStyles.button}
            hitSlop={BAR_HIT_SLOP}
            onPress={handleLeave}
            accessibilityLabel={t('call.leave')}
          />
        </View>
      ) : null}

      {/* Toujours montée, comme le veut l'exemple de `react-native-paper` :
          seul `visible` bascule. Une seule case pour cinq actions — modération
          et changement de caméra — qui ne partent qu'un geste à la fois. Deux
          Snackbars se superposeraient au même endroit de l'écran. */}
      <Snackbar testID="call-notice" visible={notice !== null} onDismiss={() => setNotice(null)}>
        {notice !== null ? t(notice) : ''}
      </Snackbar>
    </View>
  );
}
