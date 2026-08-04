import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import { KeyboardAvoidingView, Share, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Snackbar, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { toggleHand } from 'src/api/hand';
import {
  muteParticipant,
  removeParticipant,
  updateParticipantRole,
  type ParticipantRole,
} from 'src/api/participants';
import { fetchRoomAccess } from 'src/api/rooms';
import type { ApiError } from 'src/api/types';
import { getActiveAccount, type Account } from 'src/auth/accounts';
import { createChatStore } from 'src/call/chatStore';
import { createCallSession } from 'src/call/connection';
import type { Box } from 'src/call/grid';
import { handPosition, isHandRaised, otherRaisedHands, raisedHands } from 'src/call/hands';
import {
  applyEffect,
  areEffectsSupported,
  publishEffectCamera,
  type BackgroundEffect,
} from 'src/call/backgroundEffect';
import { useInterruptionRecovery } from 'src/call/interruption';
import type { ParticipantView, Tile } from 'src/call/layout';
import { setCameraEnabled, setMicrophoneEnabled, type FacingMode } from 'src/call/media';
import { createRoomViewStore } from 'src/call/participants';
import {
  ensureBluetoothPermission,
  ensureMediaPermissions,
  ensureNotificationPermission,
} from 'src/call/permissions';
import type { ReactionKey } from 'src/call/reactions';
import { createReactionStore } from 'src/call/reactionStore';
import { type RecordingMessageKey } from 'src/call/recording';
import { createRecordingStore } from 'src/call/recordingStore';
import type { CallState, RoomAccess } from 'src/call/types';
import { useCallLayout } from 'src/call/useCallLayout';
import { useWaitingParticipants } from 'src/rooms/useWaitingParticipants';
import { firstWaiting } from 'src/rooms/waitingQueue';
import { CallControlBar } from 'src/screens/room/callControlBar';
import { CallPanels, type Panel } from 'src/screens/room/callPanels';
import { CallHeader } from 'src/screens/room/callHeader';
import { HandBanner } from 'src/screens/room/handBanner';
import { RaisedHandsBanner } from 'src/screens/room/raisedHandsBanner';
import { ReactionOverlay } from 'src/screens/room/reactionOverlay';
import { RecordingIndicator } from 'src/screens/room/recordingIndicator';
import { WaitingBanner } from 'src/screens/room/waitingBanner';
import { rememberVisitEnd } from 'src/rooms/journal';
import { keyboardMode } from 'src/ui/keyboard';
import { tokens } from 'src/ui/tokens';

// Les seules raisons que l'écran sait dire quand il n'y a pas de séance. Ce
// sont des clés de traduction : rien de ce qui vient du réseau ou du SDK ne
// s'affiche tel quel.
type MessageKey =
  | 'error.network'
  | 'error.unauthorized'
  | 'error.forbidden'
  | 'error.notFound'
  | 'error.badRequest'
  | 'error.serverError'
  | 'call.ended'
  | 'call.permissionsDenied'
  | 'call.deviceSwitchFailed'
  | 'call.handFailed'
  | 'chat.sendFailed'
  | 'call.linkCopied'
  | RecordingMessageKey;

// Sert deux appelants : l'accès initial au salon, et les trois actions de
// modération plus bas, dont l'échec ordinaire arrive de la même façon — une
// valeur `ApiResult`, jamais une exception.
//
// Une case par variante d'`ApiError`, et c'est le point : cette fonction
// rendait `error.network` — « Connexion impossible » — pour TOUT ce qui
// n'était pas `unauthorized`. Un 403, un 404, un 400 et un 500 affichaient
// donc la même phrase, et cette phrase était fausse pour les quatre : le
// réseau marchait, puisque la réponse était arrivée. Mesuré sur appareil, un
// « Couper le micro » en échec disait « Connexion impossible » pendant que la
// séance LiveKit tournait sans accroc à côté — et ni la personne devant
// l'écran ni celle qui débogue ne pouvaient savoir ce que le serveur avait
// refusé.
//
// `lobby` reste avec `network` : il ne vient d'aucun statut — `fetchRoomAccess`
// le construit depuis l'absence du bloc livekit — et voudrait dire que l'accès
// a été retiré entre le pré-écran et ici, un cas qu'aucun retour vers la salle
// d'attente ne rattrape.
function toApiErrorMessage(error: ApiError): MessageKey {
  switch (error.kind) {
    case 'unauthorized':
      return 'error.unauthorized';
    case 'forbidden':
      return 'error.forbidden';
    case 'not-found':
      return 'error.notFound';
    case 'validation':
      return 'error.badRequest';
    case 'server':
      return 'error.serverError';
    default:
      return 'error.network';
  }
}

// Les six familles de gestes qui peuvent poser un message dans l'unique
// Snackbar de cet écran. Ce n'est PAS une taxonomie d'erreurs — deux familles
// peuvent poser la même clé (`error.forbidden` vaut pour la modération comme
// pour l'admission) — c'est la PROVENANCE, et elle ne sert qu'à décider ce
// qu'un succès a le droit d'effacer.
type NoticeKind = 'device' | 'hand' | 'chat' | 'lobby' | 'moderation' | 'recording' | 'link';

type Notice = {
  readonly kind: NoticeKind;
  readonly key: MessageKey;
};

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
    features: { recording: false, subtitle: false, telephony: false, calendar: false },
  },
  email: '',
  displayName: '',
};

const styles = StyleSheet.create({
  // La scène reste sombre dans les deux schémas : c'est la convention de toute
  // la visioconférence, et un fond clair autour d'une vignette vidéo éblouit
  // dans une pièce éteinte.
  root: { flex: 1, backgroundColor: tokens.color.backgroundDark },
  banner: { alignItems: 'center', paddingVertical: tokens.spacing.sm },
  bannerText: { color: tokens.color.textDark },
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
  // Les encoches sont appliquées ICI, sur la racine QUI PEINT LE FOND : un
  // rembourrage est peint par la vue qui le porte, donc les deux bandes
  // prennent la couleur de l'écran au lieu du blanc de la vue système. C'était
  // le défaut de la coque, qui les appliquait sans fond. Voir `app/_layout.tsx`.
  //
  // Un littéral de style est INÉVITABLE ici, à l'inverse de la règle du dépôt :
  // `StyleSheet.create` fige ses valeurs au chargement du module, et une
  // encoche n'est connue qu'à l'exécution. Le reste du style vient bien de la
  // feuille.
  //
  // Déclaré AVEC les autres crochets, jamais près du `return` : cet écran a des
  // retours anticipés — connexion, échec — et un crochet posé après eux n'est
  // plus appelé dans le même ordre à chaque rendu. `react-hooks/rules-of-hooks`
  // l'a refusé, à raison.
  //
  // Le HAUT seulement. Le bas est hors d'atteinte ici : la racine est une
  // `KeyboardAvoidingView`, qui écrase `paddingBottom` avec la hauteur du
  // clavier — zéro sans clavier. Un test l'a montré, pas une relecture. Le fond
  // noir, lui, atteint bien le bord bas puisque plus rien ne l'en écarte ; ce
  // qui manquait était l'écart pour l'INDICATEUR D'ACCUEIL, et il est posé par
  // la barre de commandes et par le calque des réactions, qui le bordent.
  const insets = useSafeAreaInsets();
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
  // Les secondes écoulées depuis l'entrée en séance, pour l'en-tête.
  //
  // Comptées ICI et passées en nombre : `CallHeader` ne lit pas l'horloge, ce
  // qui le rend testable sans faire avancer le temps réel. Le compteur ne part
  // qu'une fois connecté — le démarrer à l'ouverture ferait afficher un
  // minuteur pendant la négociation, alors que la réunion n'a pas commencé.
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Sans compte actif, il n'y a pas de jeton à demander. L'état de départ le
  // dit dès le premier rendu : le poser depuis l'effet appellerait setState de
  // façon synchrone, ce que `react-hooks/set-state-in-effect` refuse.
  const [failure, setFailure] = useState<MessageKey | null>(() =>
    getActiveAccount() === null ? 'error.unauthorized' : null,
  );

  // Le SDK n'expose pas la face courante d'une piste : c'est l'écran qui la
  // conserve, et il la reprend du `CameraChoice` que le menu lui rend — par
  // `onFacingChange`, puisque le menu vit dans `CallControlBar`. Le SEUL des
  // états de périphérique qui reste ici, parce que c'est le seul que quelqu'un
  // d'autre lise : `useCallLayout`, plus bas, en tire le miroir de la vignette
  // locale.
  const [facing, setFacing] = useState<FacingMode>('user');

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
  // surfaces ne se recouvrent jamais. Une CELLULE de grille l'ouvre sur
  // elle-même ; un appui sur la SCÈNE la bascule sur la tuile qui s'y trouve,
  // épinglée ou non ; un appui sur une vignette de la BANDE épingle, sans
  // jamais entrer en plein écran ; et seul le badge d'épinglage désépingle
  // (voir `handleUnpinTile`). Aucun appui long : chaque surface ne porte qu'un
  // seul geste, qui ne veut qu'une seule chose. Résolue plus bas, une fois
  // `layout` connu — voir `fullscreenTile`.
  const [fullscreen, setFullscreen] = useState<string | null>(null);

  // La boîte réellement offerte à la scène, mesurée par `CallStage` et remontée
  // ici — jamais `useWindowDimensions()`, qui ignore la barre de contrôle, les
  // encoches et les bandeaux. `null` tant que la première mesure n'est pas
  // arrivée : une trame.
  //
  // Elle vit ici et non dans `CallStage` parce que c'est ici qu'on appelle
  // `useCallLayout`, qui en a besoin. Contrairement à l'épinglage, la perdre au
  // démontage du panneau des participants est sans conséquence : elle est
  // remesurée en une trame au remontage.
  const [box, setBox] = useState<Box | null>(null);

  // Reprise après interruption. Posé sur l'écran et non sur la barre de
  // commandes : la barre disparaît en plein écran, alors que la reprise doit
  // valoir pour toute la durée de la séance. L'état DÉSIRÉ est lu dans les
  // publications de LiveKit, donc rien n'a besoin de descendre d'ici.
  useInterruptionRecovery(session.getRoom());

  // Tout ce qui se décide de l'affichage est derrière ce seul appel :
  // `src/call/participants` lit la Room, `src/call/layout` choisit, et l'écran
  // n'a plus qu'une liste de vignettes à passer à sa coquille de rendu.
  //
  // `null` tant que la boîte l'est : il n'y a pas de disposition possible sans
  // savoir dans quoi on dispose.
  const layout = useCallLayout(session.getRoom(), facing, box, pin);

  // Résolue contre la disposition présente, comme l'épinglage : une tuile qui
  // disparaît (la personne quitte la séance) ne laisse pas l'écran figé sur du
  // vide, elle retombe sur la disposition normale au rendu suivant. Ce n'est
  // pas une décision de disposition — `selectLayout` n'a pas à connaître cette
  // notion d'écran, donc elle ne passe jamais par lui : on sait déjà quelle
  // tuile, on choisit seulement de ne montrer qu'elle.
  // Toutes les tuiles que la disposition présente montre, quel que soit son
  // mode : c'est contre elles, et rien d'autre, que `fullscreen` est résolu.
  const visibleTiles: readonly Tile[] =
    layout === null
      ? []
      : layout.mode === 'grid'
        ? layout.tiles
        : [layout.focus, ...layout.filmstrip];

  const fullscreenTile =
    fullscreen === null ? null : (visibleTiles.find((t) => t.key === fullscreen) ?? null);

  // I4 : sans cet ajustement, `fullscreen` reste posé indéfiniment même quand
  // sa cible ne résout plus — le même principe de résolution que l'épinglage
  // (`src/call/layout.ts:198-201` : « si elle revient, l'épinglage reprend
  // tout seul »). Bénin pour l'épinglage, où une tuile qui revient se
  // déplace, sous les yeux de la personne. Pas bénin ici : si la cible
  // revient — reconnexion, ou simplement une personne qui repart puis
  // rejoint sous la même identité —, la clé PÉRIMÉE résoudrait de nouveau
  // exactement de la même façon, et rejetterait l'écran dans un plein écran
  // sans commandes, sans que personne n'ait rien demandé.
  //
  // Corrigé PENDANT le rendu, jamais dans un effet : `react-hooks/set-state-in-effect`
  // l'interdit, et un effet aurait de toute façon laissé peindre un rendu
  // intermédiaire, périmé, avant de se corriger. React documente cet appel
  // direct à `setState` pendant le rendu comme la façon de « réinitialiser
  // un état quand quelque chose change » ; il ne boucle pas, puisque cette
  // même condition redevient fausse dès que `fullscreen` repasse à `null`,
  // ce que cet appel fait à l'instant même où il s'exécute.
  if (fullscreen !== null && fullscreenTile === null) {
    setFullscreen(null);
  }

  // La MÊME guérison pour l'épinglage, et pour une raison qui lui est propre.
  // `selectLayout` résout la clé à chaque rendu sans jamais l'effacer
  // (`src/call/layout.ts` : « si elle revient, l'épinglage reprend tout seul »),
  // ce qui laissait une clé périmée survivre à la personne qu'elle désignait.
  // Trois conséquences, dans cet ordre de gravité :
  //
  //   1. rien ne la MARQUE — le badge vit sur la tuile épinglée, qui n'existe
  //      plus, et la grille n'en a jamais ;
  //   2. rien ne peut donc l'EFFACER, puisque ce badge est le seul geste qui
  //      désépingle ;
  //   3. si la personne revient sous la même identité — reconnexion, ou simple
  //      aller-retour — la scène lui saute dessus sans que personne n'ait rien
  //      demandé.
  //
  // `layout.pinned` EST la résolution : `selectLayout` ne le met à vrai que
  // lorsque la clé désigne encore une tuile présente. Un mode `grid`, comme un
  // `focus` produit par un partage d'écran, disent tous deux qu'elle ne résout
  // plus.
  //
  // `layout !== null` n'est jamais atteint : `box` n'est posée qu'une fois et
  // n'est jamais remise à `null`, et poser un épinglage exige une bande, donc
  // une disposition déjà calculée. La garde est là pour le typage — aucun test
  // ne peut la rougir, et il ne faut pas en fabriquer un.
  //
  // Corrigé PENDANT le rendu, jamais dans un effet, pour les raisons écrites
  // juste au-dessus. Ne boucle pas : la condition redevient fausse à l'instant
  // même où cet appel s'exécute.
  if (pin !== null && layout !== null && !(layout.mode === 'focus' && layout.pinned)) {
    setPin(null);
  }

  // Un appui sur une VIGNETTE DE BANDE épingle celle qu'on touche. Ce n'est pas
  // un aller-retour : une tuile épinglée force le mode `focus` et occupe la
  // scène, donc la bande ne peut jamais porter la tuile déjà épinglée
  // (`src/call/layout.ts` l'en filtre). L'ambiguïté que corrigeait l'ancien
  // ternaire (« épingler ou désépingler selon l'état courant ») ne se présente
  // donc pas — désépingler est le geste du badge, et de lui seul : voir
  // `handleUnpinTile`.
  //
  // Seule surface qui épingle encore. La bande n'existe qu'en mode `focus`,
  // donc épingler n'est atteignable que pendant un partage d'écran (ou sous un
  // épinglage déjà posé) : c'est la conséquence assumée du geste de la grille,
  // qui ouvre désormais le plein écran. Épingler sert à ramener un visage que
  // le partage a chassé dans la bande ; hors partage, il n'y a rien à défaire.
  const handlePinTile = useCallback((key: string): void => {
    setPin(key);
  }, []);

  // Cellule de grille : le plein écran SUR ELLE, avec sa clé — là où la scène
  // n'a pas besoin d'argument, puisqu'elle n'en porte jamais qu'une.
  //
  // C'est ici que la grille a cessé d'épingler. Elle montre déjà tout le monde,
  // donc y toucher quelqu'un veut dire « celui-ci, en grand », pas « garde-le
  // sur la scène » — et le parcours d'avant, DEUX appuis sur la même tuile,
  // avait un défaut que seule la géométrie révélait : épingler redispose
  // l'écran sous le doigt, et le second appui ne tombait plus sur la même
  // chose. À cinq en portrait, une bande de ~92 dp en bas épinglait quelqu'un
  // d'autre ; à trois ou moins, il tombait sur le badge et désépinglait, effet
  // net nul. Un seul appui supprime le problème plutôt que de le border.
  const handleFullscreenTile = useCallback((key: string): void => {
    setFullscreen(key);
  }, []);

  // Scène, hors plein écran : un appui bascule le plein écran SUR ELLE, que
  // la scène soit ou non le fruit d'un épinglage — jamais un épinglage ni un
  // désépinglage, qui appartiennent désormais à deux autres surfaces (la
  // bande et le badge). `layout.stage.key` vient de la fermeture, pas d'un
  // paramètre : ce geste n'a rien d'autre à dire que « la tuile qui EST sur
  // scène en ce moment ».
  //
  // `stageKey` vaut `null` tant que la mesure n'est pas arrivée, ET en mode
  // `grid` — deux états où aucune tuile de SCÈNE n'est rendue, donc où ce
  // rappel n'est joignable par rien : la grille câble ses cellules sur
  // `handleFullscreenTile`, jamais ici. La garde existe pour le typage, jamais
  // pour un cas atteint en pratique — même précédent que
  // `if (account === null || roomId === null)` sur les trois actions de
  // modération plus bas.
  const stageKey = layout !== null && layout.mode === 'focus' ? layout.focus.key : null;
  const handlePressStageTile = useCallback((): void => {
    if (stageKey !== null) setFullscreen(stageKey);
  }, [stageKey]);

  // Le badge d'épinglage (`stage.tsx`), seul et unique geste qui désépingle
  // désormais — plus jamais un second appui sur la scène, qui bascule le
  // plein écran à la place (`handlePressStageTile`).
  const handleUnpinTile = useCallback((): void => {
    setPin(null);
  }, []);

  // Tuile plein écran : un appui, où qu'il porte sur cette unique tuile,
  // referme le plein écran — un aller-retour sur la même surface que
  // `handlePressStageTile`, qui l'a ouvert. Toute la machinerie de rappel des
  // commandes (`chromeVisible`, son minuteur) devient inutile : la sortie
  // n'est plus un état intermédiaire à révéler, elle est immédiate — et donc
  // totale par construction, voir le test qui le prouve dans `call.spec.tsx`.
  const handleExitFullscreen = useCallback((): void => {
    setFullscreen(null);
  }, []);

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
  // Trois états qui s'excluent, et non deux booléens : deux booléens
  // autoriseraient quatre combinaisons dont une impossible — les deux panneaux
  // ouverts sur la même région d'écran.
  const [panel, setPanel] = useState<Panel>('none');
  // Une requête en vol, jamais un état désiré : l'affichage suit l'attribut,
  // et lui seul. Partagé par la commande du menu et par le bandeau, qui
  // portent sur le même état — deux requêtes concurrentes en sens opposé
  // produiraient un résultat qui dépend de leur ordre d'arrivée au serveur.
  const [handBusy, setHandBusy] = useState(false);

  // `ApiResult<void>` rend son échec ordinaire — un salon dont on n'est plus
  // administrateur, un 403 — comme une *valeur* (`{ ok: false }`), jamais
  // comme un rejet : un simple `.catch()` sur ces trois actions ne le
  // verrait donc jamais passer. Une seule case, six familles de gestes.
  //
  // Le `kind` est porté AVEC la clé, et il ne sert qu'à une chose : décider ce
  // qu'un succès a le droit d'effacer. Sans lui, chaque famille posait `null`
  // sans regarder ce qu'elle effaçait, et un message de chat parti effaçait en
  // silence un refus de modération que personne n'avait encore lu. Le geste qui
  // efface n'avait alors rien à voir avec ce qu'il effaçait.
  //
  // Une SEULE Snackbar reste : deux se superposeraient au même endroit de
  // l'écran. C'est donc la mémoire de la provenance qui est ajoutée, pas une
  // seconde surface.
  const [notice, setNotice] = useState<Notice | null>(null);

  // Poser ou effacer un message, du point de vue d'UNE famille.
  //
  //   - une clé  ⇒ elle pose la sienne, quelle que soit celle qui s'affichait.
  //     Un échec plus récent est le plus intéressant, et il n'y a qu'une case ;
  //   - `null`   ⇒ elle vient de RÉUSSIR, donc elle n'efface que SON propre
  //     message, et laisse intact celui d'une autre.
  //
  // Une mise à jour FONCTIONNELLE, jamais une lecture de `notice` dans la
  // fermeture : ces rappels partent depuis des promesses résolues bien après le
  // rendu qui les a créés, et liraient sinon un `notice` périmé — celui qui
  // s'affichait au moment du geste, pas celui qui s'affiche à la réponse.
  //
  // Une fonction simple, pas un `useCallback` : elle ne descend dans aucune
  // liste de dépendances, et le compilateur React refuse une mémoïsation
  // manuelle dont il ne peut pas reproduire les dépendances
  // (`react-hooks/preserve-manual-memoization`). Même forme que les onze autres
  // gestionnaires de cet écran.
  const postNotice = (kind: NoticeKind, key: MessageKey | null): void => {
    setNotice((current) => {
      if (key !== null) return { kind, key };
      return current !== null && current.kind === kind ? null : current;
    });
  };

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

  // Les mains des AUTRES, et rien de plus : `HandBanner` porte déjà la vôtre
  // sur la ligne du dessus, et l'y compter une seconde fois ferait dire « et
  // 1 autre » à un écran où il n'y a personne d'autre.
  const otherHands = useMemo(() => otherRaisedHands(hands), [hands]);

  // Une troisième lecture de la Room, indépendante des deux autres :
  // `getSnapshot()` lit `room.metadata` directement, sans attendre aucun
  // événement — le SDK n'émet pas `RoomMetadataChanged` à la jonction, et un
  // indicateur qui l'attendrait resterait éteint toute la séance pour qui
  // rejoint une réunion déjà enregistrée. Déclaré ici, avec les autres Hooks,
  // avant les sorties anticipées.
  const recordingStore = useMemo(() => createRecordingStore(session.getRoom()), [session]);
  const recordingState = useSyncExternalStore(recordingStore.subscribe, recordingStore.getSnapshot);

  // Troisième magasin indépendant, comme `recordingStore` et `roomViewStore` :
  // `useState`, pas `useMemo` — React se réserve le droit de jeter un
  // `useMemo`, et un magasin jeté laisserait derrière lui un abonnement
  // `RoomEvent.DataReceived` sur une `Room` vivante que plus personne ne
  // détacherait. `createReactionStore` s'abonne dès sa construction : il n'y
  // a pas de second instant où le faire.
  const [reactionStore] = useState(() => createReactionStore(session.getRoom()));
  const reactions = useSyncExternalStore(reactionStore.subscribe, reactionStore.getSnapshot);
  // `useState` et non `useMemo`, pour la raison exacte du magasin de réactions
  // juste au-dessus — et non celle des deux premiers, qui peuvent relire la
  // Room : celui-ci enregistre un gestionnaire de flux DÈS SA CONSTRUCTION, et React
  // se réserve le droit de jeter un `useMemo`. Un magasin jeté laisserait
  // derrière lui un gestionnaire `lk.chat` sur une Room vivante. Même raison
  // que la session, plus haut. Un message est un ÉVÉNEMENT et non un état :
  // rien ne le porte après son passage, donc une fenêtre sans écoute est une
  // perte définitive, là où les deux autres magasins peuvent relire la Room.
  const [chatStore] = useState(() => createChatStore(session.getRoom()));
  const chat = useSyncExternalStore(chatStore.subscribe, chatStore.getSnapshot);

  // `Room.id` est `string | null` depuis le premier commit d'API : distinct
  // d'`access?.room.id`, dont les usages plus bas l'écrasaient en `''` — au
  // lieu de garder l'absence — ce qui fabriquait des routes de la forme
  // `/api/v1.0/rooms//mute-participant/`.
  const roomId = access?.room.id ?? null;

  // Les trois gardes réunies : un salon public n'a pas de salle d'attente,
  // sans privilège le serveur refuserait la requête, et sans identifiant de
  // salon il n'y a pas de route à construire. Sans ce dernier, un salon
  // administrable dont `room.id` vaut `null` scrutait quand même
  // `/api/v1.0/rooms//waiting-participants/` toutes les cinq secondes.
  const canModerate = access !== null && access.isAdministrable && roomId !== null;
  const hasLobby = access !== null && access.room.accessLevel !== 'public';

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

  // Déclaré avant les deux effets de session, pour la même raison qu'eux : les
  // nettoyages s'exécutent dans l'ordre de déclaration, et détacher le
  // gestionnaire de flux avant de jeter la Room est la même précaution que le
  // désabonnement ci-dessous.
  useEffect(() => () => chatStore.dispose(), [chatStore]);

  // Clôt la visite dans le journal de l'onglet Historique, au DÉMONTAGE.
  //
  // Pas dans `handleLeave` : on quitte aussi une réunion en perdant le réseau,
  // par le retour arrière d'Android, ou parce que le système tue l'écran. Seul
  // le nettoyage couvre les quatre sorties.
  //
  // `rememberVisitEnd` refuse une visite déjà close et un salon absent du
  // journal : un montage qui échoue avant l'entrée ne laisse donc aucune trace,
  // et un remontage ne récrit pas la durée.
  useEffect(
    () => () => {
      if (slug !== undefined) rememberVisitEnd(slug, Date.now());
    },
    [slug],
  );

  const connected = callState.status === 'connected';

  // L'effet d'arrière-plan, réglable EN SÉANCE. `applyEffect` ne touche pas à
  // la piste : le décorateur natif change de mode, donc aucune renégociation
  // avec le serveur et aucune coupure chez les autres participants.
  const [effect, setEffect] = useState<BackgroundEffect>({ kind: 'none' });

  const handleEffectSelect = (next: BackgroundEffect): void => {
    setEffect(next);
    applyEffect(next);
  };

  useEffect(() => {
    if (!connected) return;
    const timer = setInterval(() => {
      setElapsedSeconds((previous) => previous + 1);
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [connected]);

  // Déclaré avant l'effet de connexion : les nettoyages s'exécutent dans
  // l'ordre de déclaration des effets, le désabonnement précède donc la
  // libération de la session.
  useEffect(() => {
    const unsubscribe = session.subscribe(setCallState);
    return () => {
      unsubscribe();
      // Avant `session.dispose()` : détacher le canal de données pendant que
      // la Room existe encore, la même précaution que le désabonnement de
      // `setCallState` juste au-dessus.
      reactionStore.dispose();
      // Terminal. Sans lui, chaque passage sur cet écran laisse derrière lui
      // une Room vivante, et avec elle le micro, la caméra et le transport.
      session.dispose();
    };
  }, [session, reactionStore]);

  // Ne dépend d'aucune des bascules : le nettoyage d'un effet s'exécute à
  // chacune de ses relances, et un effet de connexion qui dépendrait de l'état
  // du micro — désormais dans `CallControlBar` — couperait la séance à chaque
  // appui sur le micro. C'est aussi pourquoi il lit les paramètres d'URL
  // directement, et jamais la bascule.
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

        // Résultat ignoré à dessein : contrairement à la caméra et au micro, un
        // refus Bluetooth ne doit JAMAIS bloquer l'entrée en séance — il prive
        // seulement le menu de sortie audio d'une entrée (`listAudioOutputs`),
        // et la séance se tient au haut-parleur. Demandée ICI, avant
        // `connect()`, pour qu'`AudioSession.startAudioSession()`
        // (`src/call/connection.ts`) la voie déjà tranchée à son activation
        // plutôt qu'à une énumération ultérieure.
        await ensureBluetoothPermission();
        if (cancelled) return;

        // Résultat ignoré pour la même raison que le Bluetooth juste au-dessus,
        // et il faut la dire précisément : un refus ne prive PAS du service de
        // premier plan — mesuré, il tourne et garde la capture vivante même
        // avec `POST_NOTIFICATIONS: granted=false`. Il prive seulement de la
        // notification qui dit que la séance est en cours et qui ramène dedans.
        await ensureNotificationPermission();
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

        // **La caméra à EFFET, quand la plateforme la porte.**
        //
        // `setCameraEnabled` demande à LiveKit de fabriquer sa propre piste,
        // par `getUserMedia` : le décorateur de segmentation n'y est pas, donc
        // aucun effet ne peut y apparaître. Le pré-join, lui, montrait bien le
        // flou — il monte la piste à effet pour son aperçu —, et c'est ce qui
        // rendait le défaut si déroutant : on choisissait un fond, on le
        // voyait, puis il disparaissait en entrant.
        //
        // L'effet lui-même n'a pas à être retransmis : le processeur natif est
        // unique et garde le dernier `setEffect`. Publier la bonne piste suffit
        // à retrouver le choix fait au pré-join.
        if (camera !== '0' && areEffectsSupported()) {
          await publishEffectCamera(session.getRoom());
        } else {
          await setCameraEnabled(session.getRoom(), camera !== '0');
        }
      })
      .catch(() => {
        if (!cancelled) setFailure('error.network');
      });

    return () => {
      cancelled = true;
    };
  }, [session, slug, camera, mic]);

  // Le lien porte sur l'instance du compte, jamais sur une constante : une
  // personne connectée ailleurs partagerait sinon un lien vers la nôtre, qui ne
  // mène pas à sa réunion.
  /**
   * Copie le lien de la réunion, et le DIT.
   *
   * Une copie silencieuse est indiscernable d'un appui manqué : rien ne bouge à
   * l'écran, et le presse-papiers n'est visible nulle part. La Snackbar est donc
   * la commande, pas une politesse.
   */
  const handleCopyLink = async (): Promise<void> => {
    const activeAccount = getActiveAccount();
    if (activeAccount === null) return;
    await Clipboard.setStringAsync(`${activeAccount.instance.serverUrl}/${slug}`);
    postNotice('link', 'call.linkCopied');
  };

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
        postNotice('hand', result.ok ? null : 'call.handFailed');
      })
      .catch(() => {
        setHandBusy(false);
        postNotice('hand', 'call.handFailed');
      });
  };

  // Le store ne distingue pas, dans son booléen, un refus de débit d'un
  // échec de publication (§6.5/§7.5 de la conception ne rendent que
  // `boolean`) — alors que la limite de débit doit rester silencieuse en
  // toute circonstance (§5.C11 : « son refus n'est signalé par aucun
  // message »). Suivre §8 à la lettre (Snackbar sur tout échec hors
  // reconnexion) violerait donc §5.C11 dans le cas le plus fréquent : presser
  // vite est justement ce qui déclenche la limite de débit. Ce plan choisit
  // le silence dans les deux cas — voir
  // `docs/superpowers/plans/2026-08-01-scope-C2-reactions.md` pour le détail
  // et le signalement à qui possède la conception.
  //
  // `.catch()` par discipline, pas par nécessité : `send()` ne rejette
  // jamais (même contrat que `CallSession.connect`), mais rien ne l'affirme
  // au typage — même motif que `handleSelectAudioOutput` un peu plus haut.
  const handleSendReaction = (key: ReactionKey): void => {
    reactionStore.send(key).catch(() => undefined);
  };

  // LE seul chemin qui change de panneau, et il sort du plein écran quoi qu'il
  // arrive.
  //
  // C'était deux lignes, une par ouvreur, que chaque nouvel appelant devait
  // penser à écrire. Elles gardaient l'écran de l'enfermement total qu'une
  // revue de branche avait mesuré : ouvrir un panneau démontait `CallStage`,
  // qui portait alors le seul geste capable de sortir du plein écran, et le
  // minuteur de l'ancien `chromeVisible` continuait de tourner sans qu'aucun
  // bouton ne reste atteignable pour l'arrêter.
  //
  // Mesuré après coup : les supprimer TOUTES LES DEUX laissait
  // **343 tests sur 343 au vert**, parce que rien ne peut les atteindre — les
  // commandes qui changent de panneau vivent dans la barre, elle-même non
  // rendue en plein écran, et c'est CE fait-là qui protège l'écran
  // aujourd'hui, lui qui est asserté.
  //
  // Aucun test ne peut donc rougir sur cette ligne, et il ne faut pas en
  // fabriquer un. Mais elle n'est pas décorative pour autant : le jour où quoi
  // que ce soit rendra un panneau atteignable depuis le plein écran — un
  // geste, une notification, un lien profond, un `panel` restauré après une
  // reconnexion — l'enfermement total que ce dépôt a déjà livré revient, avec
  // une suite entièrement verte. En un seul endroit, elle ne peut plus être
  // oubliée par un appelant ; en deux, elle l'était déjà à moitié.
  const openPanel = (next: Panel | ((current: Panel) => Panel)): void => {
    handleExitFullscreen();
    setPanel(next);
  };

  // Une bascule, donc un ternaire : le même bouton ouvre et referme. Passer par
  // `openPanel` dans les deux sens est volontairement redondant à la fermeture
  // — `fullscreen` y vaut déjà `null` — mais un ouvreur qui contournerait la
  // porte pour « optimiser » est exactement ce que cette porte existe pour
  // empêcher.
  const handleToggleParticipants = (): void => {
    openPanel((current) => (current === 'participants' ? 'none' : 'participants'));
  };

  // Le compteur repart de zéro à l'OUVERTURE **et à la fermeture**, jamais au
  // défilement : un compteur qui dépendrait de la position de défilement
  // demanderait d'instrumenter une `FlatList`.
  //
  // La sortie du plein écran est le même invariant défensif que ci-dessus :
  // inatteignable par l'interface, puisque `more-btn` vit dans la barre, elle
  // -même masquée en plein écran — mais gardé PAR CONSTRUCTION plutôt que par
  // la seule convention de la barre.
  const handleOpenChat = (): void => {
    chatStore.markRead();
    openPanel('chat');
  };

  // La fermeture marque lu, elle aussi. §5.C19 lue à la lettre ne marquait qu'à
  // l'ouverture, et sa conséquence n'était pas tenable : un message arrivé
  // PENDANT que le panneau est ouvert était compté non lu **alors que son corps
  // était à l'écran**, et la pastille survivait à la fermeture. Elle annonçait
  // donc, sur un fil qu'on venait de lire, un message qu'on avait déjà lu.
  //
  // Ce n'est toujours pas « lu = affiché » — il faudrait la position de
  // défilement pour cela — mais les deux instants où l'on SAIT que le fil a été
  // sous les yeux sont désormais couverts tous les deux.
  const handleCloseChat = (): void => {
    chatStore.markRead();
    openPanel('none');
  };

  // `send` ne rejette jamais : son échec ordinaire est une valeur `false`.
  // Le booléen remonte jusqu'à la coquille, qui garde le texte dans la zone de
  // saisie quand le message n'est pas parti — un message perdu qu'on doit
  // retaper est une deuxième punition pour une panne de réseau. Un succès
  // efface l'erreur d'un essai précédent, comme les cinq autres actions.
  const handleSendChat = async (body: string): Promise<boolean> => {
    const ok = await chatStore.send(body);
    postNotice('chat', ok ? null : 'chat.sendFailed');
    return ok;
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
      .then((result) => postNotice('lobby', result.ok ? null : toApiErrorMessage(result.error)))
      .catch(() => postNotice('lobby', 'error.network'));
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
  // Seule des trois à ne pas prendre `account` : `mute-participant` refuse le
  // porteur OIDC et veut le jeton LiveKit de LA séance en cours, plus le
  // `track_sid` du micro visé — les deux mesurés sur une instance réelle, voir
  // `src/api/participants.ts`. `access` porte l'un et la ligne du panneau
  // l'autre ; ni l'un ni l'autre ne peut être reconstruit ici.
  const handleMuteParticipant = (identity: string, trackSid: string): void => {
    if (account === null || roomId === null || access === null) return;
    muteParticipant(account.instance.serverUrl, access.token, roomId, identity, trackSid)
      .then((result) =>
        postNotice('moderation', result.ok ? null : toApiErrorMessage(result.error)),
      )
      .catch(() => postNotice('moderation', 'error.network'));
  };

  const handleRemoveParticipant = (identity: string): void => {
    if (account === null || roomId === null) return;
    removeParticipant(account, roomId, identity)
      .then((result) =>
        postNotice('moderation', result.ok ? null : toApiErrorMessage(result.error)),
      )
      .catch(() => postNotice('moderation', 'error.network'));
  };

  const handleChangeParticipantRole = (identity: string, role: ParticipantRole): void => {
    if (account === null || roomId === null) return;
    updateParticipantRole(account, roomId, identity, role)
      .then((result) =>
        postNotice('moderation', result.ok ? null : toApiErrorMessage(result.error)),
      )
      .catch(() => postNotice('moderation', 'error.network'));
  };

  // **L'enregistrement n'a plus de commande, et c'est une décision du
  // propriétaire, prise sur appareil : « ça ne fonctionne pas ».** Le
  // démarrage et l'arrêt sont donc retirés — pas seulement masqués, faute de
  // quoi ils resteraient du code que rien n'atteint et que rien ne rougit.
  //
  // Ce qui SURVIT, et qu'il ne faut pas retirer avec : `RecordingIndicator`,
  // alimenté par les métadonnées du salon. Un enregistrement démarré depuis le
  // client web doit rester visible ici — c'est même le seul cas où il se
  // produit aujourd'hui, et le taire serait pire que de ne pas savoir
  // l'ordonner.

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
        {/* Exactement l'argument de la branche d'erreur ci-dessus, qui n'avait
            pas été appliqué ici : l'en-tête est masqué par le Stack, donc sans
            ce bouton l'attente est un cul-de-sac dont on ne sort qu'en tuant
            l'application. Et c'est le PREMIER écran que voit tout participant.
            Le réseau borne l'attente, mais pas les demandes de permission
            Android traversées juste avant `connect()`, qui n'ont aucun délai —
            un refus de la boîte de dialogue système peut laisser ici
            indéfiniment. */}
        <Button mode="contained" testID="connecting-leave-btn" onPress={handleLeave}>
          {t('call.leave')}
        </Button>
      </View>
    );
  }

  return (
    // La racine, et non le seul panneau : sur iOS le clavier se superpose à la
    // fenêtre entière, et rembourrer le panneau seul laisserait la barre de
    // commandes — donc « quitter » — sous le clavier. Sans clavier ouvert, le
    // rembourrage vaut zéro et cette vue se comporte exactement comme la `View`
    // qu'elle remplace. `keyboardMode()` est une VALEUR : c'est ce qui permet à
    // une spec de rendre les deux branches sans bouchonner `Platform`.
    <KeyboardAvoidingView
      testID="call-root"
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={keyboardMode() === 'padding' ? 'padding' : undefined}
    >
      {/* Fond sombre : icônes CLAIRES. Empilé par-dessus la base sombre de
            `app/_layout.tsx`, et dépilé au démontage par le `_propsStack` de
            React Native — rien à défaire en partant. */}
      <StatusBar style="light" />
      {/* **En plein écran : la barre et les commandes disparaissent, jamais
          une demande qui attend une réponse.**

          C'est la règle arbitrée le 2026-08-02. Elle remplace « une tuile, et
          rien d'autre », qui masquait les trois bandeaux sans distinguer ce
          qu'ils disaient, et elle se lit en deux temps :

          — ce qui ATTEND UNE RÉPONSE DE VOUS survit, et se pose donc HORS de
            la garde ci-dessous. Quelqu'un frappe à la porte : il reste enfermé
            dehors tant que personne ne répond. Quelqu'un d'autre lève la main :
            il attend qu'on lui donne la parole ;
          — ce qui DÉCRIT SEULEMENT L'ÉTAT DU MONDE disparaît, et reste dans la
            garde. L'indicateur d'enregistrement énonce un fait. VOTRE propre
            main levée ne vous demande rien : c'est un rappel, son destinataire
            est en face. Les bulles de réaction passent d'elles-mêmes.

          (Le critère écrit ici jusqu'au 2026-08-02 était « survit ce dont
          l'absence rendrait l'écran TROMPEUR ». Il décrivait exactement le code
          d'alors ; il ne décrit plus celui-ci, puisqu'une main levée qu'on ne
          voit pas est MANQUÉE et non mensongère, et qu'elle survit désormais
          quand même. Ce critère-là n'a pas disparu pour autant : il reste la
          raison — distincte — du message de reconnexion et de la `Snackbar`
          plus bas. Deux raisons de survivre, donc, et non une seule.)

          Une ternaire, et non une prop `hidden` comme celle de
          `CallControlBar` : celle-ci existe parce que la barre POSSÈDE quatre
          états de périphérique qu'un démontage effacerait. Ces deux-ci sont des
          coquilles pures — aucun état, aucun effet — donc les démonter ne perd
          rien.

          L'ORDRE DE LA BANDE est inchangé — admission, enregistrement, votre
          main, les mains des autres — et il le reste dans les quatre
          combinaisons, la garde n'encadrant que le bloc du milieu. */}

      {/* Ne rend rien tant que personne n'attend. */}
      <WaitingBanner
        participant={firstWaiting(waiting)}
        remaining={Math.max(waiting.length - 1, 0)}
        onAnswer={handleAnswerEntry}
      />

      {fullscreenTile === null ? (
        <>
          {/* DANS la garde, et c'est le critère qui le décide : l'en-tête
              DÉCRIT L'ÉTAT DU MONDE — quelle réunion, depuis combien de temps,
              combien de personnes — et n'attend aucune réponse. Il disparaît
              donc en plein écran, comme l'indicateur d'enregistrement, là où le
              bandeau d'admission survit. */}
          <CallHeader
            onCopyLink={handleCopyLink}
            onShareLink={handleShare}
            elapsedSeconds={elapsedSeconds}
            onParticipantsPress={handleToggleParticipants}
            participantCount={participants.length}
            title={access?.room.name ?? ''}
          />

          {/* Vu de tout le monde, y compris de qui n'a aucun bouton : ne rend
              rien au repos. */}
          <RecordingIndicator state={recordingState} />

          {/* Une main levée oubliée serait invisible pour qui l'a levée : ce
              bandeau la dit, et la baisse en un seul appui. Ne rend rien au
              repos. La bande empile ses lignes : l'indicateur d'enregistrement
              et celui-ci peuvent être vrais en même temps. */}
          {/* La position n'est montrée QUE si elle informe. Seul à lever la
              main, « Position 1 » n'apprend rien et allonge un bandeau déjà
              chargé — le propriétaire l'a relevé. Dès qu'une autre main est
              levée, le rang redevient une information : c'est l'ordre dans
              lequel on prendra la parole. */}
          <HandBanner
            raised={handRaised}
            position={hands.length > 1 ? handRank : null}
            onLower={handleToggleHand}
          />
        </>
      ) : null}

      {/* La seule chose qui disait, sur l'écran principal, qu'un AUTRE demande
          la parole : sans elle la file ne vivait que dans une feuille que le
          président n'a aucune raison d'ouvrir. Ne rend rien au repos, et ne
          porte aucun bouton — donner la parole est un acte de la réunion, pas
          de l'application. */}
      <RaisedHandsBanner hands={otherHands} />

      {/* Les trois corps qui s'excluent, et leur aiguillage. `panel` descend en
          lecture seule : `openPanel` reste la seule porte qui l'écrit. */}
      <CallPanels
        panel={panel}
        participants={participants}
        canModerate={canModerate}
        onMute={handleMuteParticipant}
        onRemove={handleRemoveParticipant}
        onRole={handleChangeParticipantRole}
        chat={chat}
        onSendChat={handleSendChat}
        onCloseChat={handleCloseChat}
        layout={layout}
        onMeasureBox={setBox}
        onPressStageTile={handlePressStageTile}
        onPinTile={handlePinTile}
        onFullscreenTile={handleFullscreenTile}
        onUnpinTile={handleUnpinTile}
        onExitFullscreen={handleExitFullscreen}
        fullscreenTile={fullscreenTile}
      />

      {/* La reconnexion se dit : sans cela la personne regarde une image figée
          en croyant que c'est cassé, et raccroche alors que ça se rétablit.

          HORS de la garde de plein écran, comme le bandeau d'admission
          au-dessus — mais pour une RAISON DIFFÉRENTE, et c'est elle qui vaut
          d'être écrite. La règle du 2026-08-02 fait survivre ce qui attend une
          réponse DE VOUS ; ce message-ci n'en attend aucune. Il survit parce
          que son absence rendrait l'écran TROMPEUR : une image figée sans rien
          qui dise pourquoi se lit exactement comme un plantage. Même raison
          pour le `Snackbar` plus bas.

          Deux critères, donc, et non un seul — et ni l'un ni l'autre n'est
          « ce qui n'offre aucune commande » : `RecordingIndicator` n'en offre
          aucune, ne trompe personne, n'attend rien de vous, et il est bien
          masqué quelques lignes plus haut. Arbitré explicitement, pas hérité.

          (La première rédaction de ce commentaire disait « ce qui offre une
          COMMANDE », ce qui décrivait mal le code : la revue de la
          spécification de la main levée l'a relevé, et elle avait raison. La
          deuxième posait la tromperie comme critère UNIQUE et donnait la
          demande d'admission en exemple de ce qui ne survit pas — exact
          jusqu'au 2026-08-02, faux depuis.) */}
      {callState.status === 'reconnecting' ? (
        <View style={styles.banner}>
          <Text testID="call-reconnecting" style={styles.bannerText}>
            {t('call.reconnecting')}
          </Text>
        </View>
      ) : null}

      {/* Toujours montée, `hidden` seul bascule : c'est la barre elle-même qui
          rend `null` en plein écran. Une ternaire ici la démonterait, et avec
          elle les quatre états de périphérique qu'elle porte — voir
          `CallControlBarProps.hidden`. */}
      <CallControlBar
        hidden={fullscreenTile !== null}
        room={session.getRoom()}
        defaultMicOn={mic !== '0'}
        defaultCameraOn={camera !== '0'}
        onFacingChange={setFacing}
        // La barre ne connaît pas les six familles : elle n'en est qu'une, et
        // ne dit qu'« échec » ou « réussite » sur le changement de
        // périphérique. C'est ici, à sa frontière, que sa provenance est posée.
        onNotice={(key) => postNotice('device', key)}
        handRaised={handRaised}
        handBusy={handBusy}
        hands={hands}
        unread={chat.unread}
        onToggleHand={handleToggleHand}
        onSendReaction={handleSendReaction}
        onOpenChat={handleOpenChat}
        effect={areEffectsSupported() ? effect : null}
        onEffectSelect={handleEffectSelect}
        onLeave={handleLeave}
      />

      {/* Dernier enfant de `styles.root` : peint au-dessus de tout le reste de
          l'écran, bandeaux et barre de contrôle compris. Ne rend rien au
          repos — mais elle est bel et bien enveloppée, pour la même raison que
          l'indicateur d'enregistrement et votre propre main levée ci-dessus :
          des bulles qui passent d'elles-mêmes ne font que décrire l'état du
          monde, et n'attendent aucune réponse de vous. La condition est
          séparée de la leur parce que sa POSITION l'est : ce calque doit
          rester le dernier enfant, sans quoi il passe sous la barre.

          `chatOpen` est la SEULE chose qu'elle sache de l'écran, et elle n'en
          tire qu'une garde de bas : la zone de saisie du chat occupe le bas de
          la région des panneaux, et les bulles s'y posaient. Voir
          `BOTTOM_GUARD` dans `reactionOverlay.tsx` pour l'arithmétique. */}
      {fullscreenTile === null ? (
        <ReactionOverlay reactions={reactions} chatOpen={panel === 'chat'} />
      ) : null}

      {/* Toujours montée, comme le veut l'exemple de `react-native-paper` :
          seul `visible` bascule. Une seule case pour cinq actions — modération
          et changement de caméra — qui ne partent qu'un geste à la fois. Deux
          Snackbars se superposeraient au même endroit de l'écran. */}
      <Snackbar testID="call-notice" visible={notice !== null} onDismiss={() => setNotice(null)}>
        {notice !== null ? t(notice.key) : ''}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}
