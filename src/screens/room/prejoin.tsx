import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RTCView } from '@livekit/react-native-webrtc';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ActivityIndicator, Button } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchRoomAccess } from 'src/api/rooms';
import type { ApiError } from 'src/api/types';
import { endGuestSession, rememberGuestName } from 'src/auth/guest';
import { getVisitor, visitorName } from 'src/auth/visitor';
import type { RoomAccess } from 'src/call/types';
import { useCameraPreview } from 'src/call/cameraPreview';
import { rememberVisit } from 'src/rooms/journal';
import {
  applyEffect,
  areEffectsSupported,
  useEffectCameraPreview,
  type BackgroundEffect,
} from 'src/call/backgroundEffect';
import { AudioOutputSheet } from 'src/screens/room/audioOutputControl';
import { EffectsSheet } from 'src/screens/room/effectsSheet';
import { useAudioOutput } from 'src/screens/room/useAudioOutput';
import { InitialsAvatar } from 'src/ui/initialsAvatar';
import { readPreferences } from 'src/settings/preferences';
import { tokens } from 'src/ui/tokens';

// L'écran est SOMBRE, comme l'appel — pas clair comme la coque. `makeTheme`
// rendant toujours le thème clair depuis le Lot 1, tout `Text` posé ici DOIT
// porter une couleur explicite, faute de quoi Paper le rend en quasi-noir sur
// du quasi-noir. C'est la règle d'`AGENTS.md`, et elle est certaine ici, plus
// seulement probable.
const BACK_SURFACE = 'rgba(255, 255, 255, 0.08)';
const CONTROL_SURFACE = 'rgba(255, 255, 255, 0.1)';
const NAME_SURFACE = 'rgba(255, 255, 255, 0.07)';

const styles = StyleSheet.create({
  back: {
    alignItems: 'center',
    backgroundColor: BACK_SURFACE,
    borderRadius: 12,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  bar: {
    bottom: 16,
    flexDirection: 'row',
    // 28 entre les GROUPES, 12 à l'intérieur : c'est ce rapport qui fait lire
    // deux blocs plutôt que quatre boutons. Un écart identique partout et le
    // regroupement ne se voit pas ; trop grand, la rangée se disloque.
    gap: 28,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  group: { flexDirection: 'row', gap: 12 },
  control: {
    alignItems: 'center',
    backgroundColor: CONTROL_SURFACE,
    borderRadius: 27,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  controlOff: { backgroundColor: tokens.color.danger },
  errorRoot: {
    backgroundColor: tokens.color.backgroundDark,
    flex: 1,
    gap: tokens.spacing.md,
    justifyContent: 'center',
    padding: tokens.spacing.md,
  },
  errorText: { color: tokens.color.textDark, fontFamily: tokens.font.bold, fontSize: 16 },
  footer: { gap: 12, padding: 18 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 12, padding: 18 },
  join: { borderRadius: 16 },
  nameCard: { backgroundColor: NAME_SURFACE, borderRadius: 14, gap: 4, padding: 14 },
  nameLabel: {
    color: tokens.color.muted,
    fontFamily: tokens.font.bold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  // Mêmes graisse et taille que `nameValue`, qu'il remplace pour un invité :
  // c'est la même ligne, éditable ou non, et elle ne doit pas sauter d'une
  // taille à l'autre selon qui regarde l'écran.
  nameInput: { color: tokens.color.textDark, fontFamily: tokens.font.bold, fontSize: 15 },
  nameValue: { color: tokens.color.textDark, fontFamily: tokens.font.bold, fontSize: 15 },
  preview: {
    backgroundColor: tokens.color.surfaceDark,
    borderRadius: 22,
    flex: 1,
    marginHorizontal: 18,
    overflow: 'hidden',
  },
  previewIdle: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center' },
  previewLabel: { color: tokens.color.muted, fontFamily: tokens.font.semiBold, fontSize: 13 },
  root: { backgroundColor: tokens.color.backgroundDark, flex: 1 },
  roomName: { color: tokens.color.textDark, fontFamily: tokens.font.extraBold, fontSize: 16 },
  video: { flex: 1 },
});

// Les seules raisons que cet écran sait dire. `lobby` n'y figure pas : il n'est
// pas un échec, il redirige.
type MessageKey =
  | 'error.network'
  | 'error.unauthorized'
  | 'error.forbidden'
  | 'error.notFound'
  | 'error.serverError';

function toPrejoinMessage(error: ApiError): MessageKey {
  switch (error.kind) {
    case 'unauthorized':
      return 'error.unauthorized';
    case 'forbidden':
      return 'error.forbidden';
    case 'not-found':
      return 'error.notFound';
    case 'server':
      return 'error.serverError';
    default:
      return 'error.network';
  }
}

export function PrejoinScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [access, setAccess] = useState<RoomAccess | null>(null);
  // Lu une fois : qui frappe à la porte ne change pas pendant qu'on regarde cet
  // écran — compte ou invité, la même garantie que l'ancien `account`.
  const [visitor] = useState(() => getVisitor());
  // Le nom que CET écran affiche et que les autres verront. Pour un compte,
  // c'est une valeur figée, celle du profil ; pour un invité, `setName` la
  // fait bouger à chaque frappe — voir l'encart « VOTRE NOM » plus bas, seul
  // endroit qui la modifie.
  const [name, setName] = useState(() => (visitor === null ? '' : visitorName(visitor)));
  // La raison du refus, quand il y en a une. `null` tant qu'on attend : les
  // deux ensemble donnent les trois états de cet écran — on attend, on est
  // entré, on est refusé — là où `access` seul n'en distinguait que deux et
  // laissait le troisième se confondre avec l'attente.
  const [failure, setFailure] = useState<MessageKey | null>(null);
  // Les deux interrupteurs portent l'état *coupé* et non l'état actif : leurs
  // libellés sont « Caméra désactivée » et « Micro coupé ». Un interrupteur
  // dont la position haute contredit son libellé se lit à l'envers.
  //
  // La valeur de départ vient des Réglages, lue une seule fois au montage : la
  // relire à chaque rendu écraserait ce que la personne vient de basculer ici.
  const [cameraOff, setCameraOff] = useState(() => readPreferences().cameraOffOnJoin);
  const [micOff, setMicOff] = useState(() => readPreferences().micOffOnJoin);
  // L'aperçu suit la bascule caméra : la couper relâche la caméra, la rallumer
  // la réacquiert. Le module possède ce cycle, y compris le flux qui arrive
  // après le démontage.
  // DEUX aperçus, et un seul est monté à la fois.
  //
  // Là où le natif existe, la caméra passe par le décorateur d'effets — c'est
  // la seule façon de VOIR le flou avant d'entrer. Ailleurs (iOS aujourd'hui),
  // on garde la voie `getUserMedia` d'origine.
  //
  // Les deux crochets sont appelés inconditionnellement, jamais dans un `if` :
  // `react-hooks/rules-of-hooks` l'exige, et c'est le drapeau `enabled` qui
  // décide lequel acquiert réellement une caméra.
  const effectsOn = areEffectsSupported();
  const plainPreviewUrl = useCameraPreview(!cameraOff && !effectsOn);
  const effectPreviewUrl = useEffectCameraPreview(!cameraOff && effectsOn);
  const previewUrl = effectsOn ? effectPreviewUrl : plainPreviewUrl;

  // L'effet choisi AVANT d'entrer. Il est appliqué au natif dès la sélection,
  // donc l'aperçu au-dessus le montre — c'est le seul aperçu qui vaille, les
  // vignettes du panneau ne sont que des numéros.
  const [effect, setEffect] = useState<BackgroundEffect>({ kind: 'none' });
  const [effectsOpen, setEffectsOpen] = useState(false);

  // Cet écran n'a pas de Snackbar : un échec de routage y serait muet. Le
  // signaler demanderait une surface que le pré-join n'a pas, et l'inventer
  // pour un cas que personne n'a rencontré serait prématuré — la feuille, elle,
  // montre l'appareil CONSTATÉ, donc un routage refusé se voit à la coche qui
  // ne bouge pas.
  const audio = useAudioOutput(() => undefined);

  const handleEffectSelect = (next: BackgroundEffect): void => {
    setEffect(next);
    applyEffect(next);
  };

  useEffect(() => {
    const currentVisitor = getVisitor();
    if (currentVisitor === null || slug === undefined) return;

    fetchRoomAccess(currentVisitor, slug)
      .then((result) => {
        if (result.ok) {
          setAccess(result.value);
          return;
        }
        // L'absence du bloc livekit est traduite en `lobby` par fetchRoomAccess :
        // le salon existe, l'entrée doit passer par la salle d'attente.
        if (result.error.kind === 'lobby') {
          router.replace(`/room/${slug}/lobby`);
          return;
        }
        // TOUT le reste se disait par un sablier éternel. Mesuré sur appareil :
        // une session expirée rend `unauthorized`, `access` restait `null`, et
        // l'écran tournait sans message, sans sortie et sans retour — sur le
        // premier écran qu'on traverse en ouvrant une réunion. Le
        // `.catch(() => setAccess(null))` d'alors posait `null` sur `null` : il
        // avait l'apparence d'un traitement d'erreur sans en être un.
        setFailure(toPrejoinMessage(result.error));
      })
      .catch(() => setFailure('error.network'));
  }, [slug, router]);

  const handleJoin = (): void => {
    const camera = cameraOff ? 0 : 1;
    const mic = micOff ? 0 : 1;
    // Le journal de l'onglet Historique s'écrit ICI et non à l'entrée en
    // séance : `call.tsx` est disputé par quatorze branches, et rejoindre est
    // le dernier geste dont ce lot est certain. On enregistre l'entrée seule —
    // la durée exigerait un point d'accroche à la FIN de l'appel.
    // Le nom que CET écran affiche, pas un autre : c'est celui que la personne
    // vient de lire, donc celui qu'elle reconnaîtra dans l'historique.
    //
    // Un invité n'a PAS d'historique : rien ne l'authentifie d'une visite à
    // l'autre, donc aucun compte ne pourrait jamais relire une ligne écrite
    // ici. Il mémorise son nom pour la PROCHAINE fois à la place.
    if (visitor?.kind === 'guest') {
      rememberGuestName(name);
    } else if (slug !== undefined && access !== null) {
      rememberVisit(slug, access.room.name, Date.now());
    }
    router.replace(`/room/${slug}/call?camera=${camera}&mic=${mic}`);
  };

  // Les DEUX sorties de cet écran — le chevron de l'en-tête et le bouton de
  // l'écran d'erreur — et la même règle que `call.tsx:804-810` et
  // `lobby.tsx:136-140` : la session invité se referme AVANT la navigation, et
  // un invité repart vers `/welcome`, jamais vers `/home`.
  //
  // C'est ici que le manque coûtait le plus cher : le pré-join est le PREMIER
  // écran qu'un invité atteint, et le seul qu'il atteigne quand le code est
  // faux. On le déposait alors sur l'accueil authentifié — un nom vide, une
  // carte « Nouvelle réunion » qui rendra 401, un Historique qui n'est pas le
  // sien, un onglet Réglages qui propose de se déconnecter — pendant que la
  // session invité restait ouverte dans MMKV.
  //
  // `getVisitor()` relu plutôt que le `visitor` du montage, pour que les trois
  // écrans portent la même forme et se retrouvent d'un `grep`.
  const handleExit = (): void => {
    const current = getVisitor();
    if (current?.kind === 'guest') endGuestSession();
    router.replace(current?.kind === 'guest' ? '/welcome' : '/home');
  };

  // Les encoches sont appliquées ICI, sur la racine QUI PEINT LE FOND : un
  // rembourrage est peint par la vue qui le porte, donc les deux bandes
  // prennent la couleur de l'écran au lieu du blanc de la vue système. C'était
  // le défaut de la coque, qui les appliquait sans fond. Voir `app/_layout.tsx`.
  //
  // Un littéral de style est INÉVITABLE ici, à l'inverse de la règle du dépôt :
  // `StyleSheet.create` fige ses valeurs au chargement du module, et une
  // encoche n'est connue qu'à l'exécution. Le reste du style vient bien de la
  // feuille.
  const insets = useSafeAreaInsets();
  // L'échec passe AVANT l'attente : les deux ont `access === null`, et tester
  // l'attente d'abord rendrait le sablier pour toujours, ce qui est exactement
  // le défaut corrigé ici.
  if (failure !== null) {
    return (
      <View style={[styles.errorRoot, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <StatusBar style="light" />
        <Text style={styles.errorText} testID="prejoin-error">
          {t(failure)}
        </Text>
        {/* Même raison que `error-leave-btn` et `connecting-leave-btn` de
            `call.tsx` : l'en-tête est masqué par le Stack, donc sans ce bouton
            l'écran est un cul-de-sac dont on ne sort qu'en tuant
            l'application. */}
        <Button mode="contained" testID="prejoin-leave-btn" onPress={handleExit}>
          {t('call.leave')}
        </Button>
      </View>
    );
  }

  if (access === null) return <ActivityIndicator testID="prejoin-loading" />;

  return (
    <View
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      testID="prejoin-root"
    >
      <StatusBar style="light" />
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={t('prejoin.back')}
          onPress={handleExit}
          style={styles.back}
          testID="prejoin-back-btn"
        >
          <MaterialCommunityIcons color={tokens.color.textDark} name="chevron-left" size={20} />
        </Pressable>
        <Text numberOfLines={1} style={styles.roomName} testID="prejoin-room-name">
          {access.room.name}
        </Text>
      </View>

      <View style={styles.preview} testID="prejoin-preview">
        {previewUrl === null ? (
          // Trois raisons de n'avoir pas d'image — caméra coupée, acquisition en
          // cours, permission refusée — et une seule chose à montrer : qui l'on
          // est. L'avatar vaut mieux qu'un rectangle noir, qui se lit comme une
          // panne.
          <View style={styles.previewIdle}>
            <InitialsAvatar name={name} size="lg" testID="prejoin-avatar" />
            <Text style={styles.previewLabel} testID="prejoin-camera-label">
              {cameraOff ? t('prejoin.cameraOff') : t('prejoin.cameraPreview')}
            </Text>
          </View>
        ) : (
          // `mirror` n'est pas décoratif : la caméra frontale rend une image
          // inversée, et sans miroir on se voit comme les autres nous voient —
          // déroutant au moment de vérifier son cadrage.
          <RTCView mirror objectFit="cover" streamURL={previewUrl} style={styles.video} />
        )}

        {/* DEUX groupes, séparés par un écart plus large que celui qui sépare
            deux boutons d'un même groupe : le son à gauche, l'image à droite.
            L'ordre d'avant les entrelaçait — micro, caméra, effets, son — et
            rien ne disait que le dernier bouton commandait la même chose que le
            premier. Demande du propriétaire, faite en regardant la rangée. */}
        <View style={styles.bar}>
          <View style={styles.group}>
            <Pressable
              accessibilityLabel={t('call.muted')}
              accessibilityRole="switch"
              accessibilityState={{ checked: micOff }}
              onPress={() => setMicOff((previous) => !previous)}
              style={[styles.control, micOff ? styles.controlOff : null]}
              testID="mic-switch"
            >
              <MaterialCommunityIcons
                color={tokens.color.textDark}
                name={micOff ? 'microphone-off' : 'microphone'}
                size={24}
              />
            </Pressable>
            <Pressable
              accessibilityLabel={t('call.audioOutput')}
              accessibilityRole="button"
              onPress={audio.onOpen}
              style={styles.control}
              testID="prejoin-audio-btn"
            >
              <MaterialCommunityIcons color={tokens.color.textDark} name="volume-high" size={20} />
            </Pressable>
          </View>

          <View style={styles.group}>
            <Pressable
              accessibilityLabel={t('prejoin.cameraOff')}
              accessibilityRole="switch"
              accessibilityState={{ checked: cameraOff }}
              onPress={() => setCameraOff((previous) => !previous)}
              style={[styles.control, cameraOff ? styles.controlOff : null]}
              testID="camera-switch"
            >
              <MaterialCommunityIcons
                color={tokens.color.textDark}
                name={cameraOff ? 'video-off' : 'video'}
                size={24}
              />
            </Pressable>
            {/* Masqué là où le natif n'existe pas — iOS attend son pendant
                Vision. Une commande qu'on ne peut pas honorer coûte plus cher
                que son absence. Cette garde a SAUTÉ en regroupant les boutons,
                et rien ne l'a dit : aucun test ne la couvrait. */}
            {effectsOn ? (
              <Pressable
                accessibilityLabel={t('effects.open')}
                accessibilityRole="button"
                onPress={() => setEffectsOpen(true)}
                style={styles.control}
                testID="prejoin-effects-btn"
              >
                <MaterialCommunityIcons color={tokens.color.textDark} name="blur" size={20} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      <AudioOutputSheet
        visible={audio.open}
        onDismiss={audio.onDismiss}
        mode={audio.mode}
        outputs={audio.outputs}
        chosen={audio.chosen}
        devices={audio.devices}
        currentDeviceId={audio.currentDeviceId}
        manual={audio.manual}
        onSelect={audio.onSelect}
        onSelectDevice={audio.onSelectDevice}
        onAutomatic={audio.onAutomatic}
      />

      <EffectsSheet
        current={effect}
        onEffectSelect={handleEffectSelect}
        onSheetDismiss={() => setEffectsOpen(false)}
        testID="prejoin-effects"
        visible={effectsOpen}
      />

      <View style={styles.footer}>
        <View style={styles.nameCard}>
          <Text style={styles.nameLabel} testID="prejoin-name-label">
            {t('prejoin.yourName')}
          </Text>
          {/* Un invité choisit ce que les autres liront ; un compte le porte
              déjà, figé, dans son profil — rien à saisir de plus. */}
          {visitor?.kind === 'guest' ? (
            <TextInput
              onChangeText={setName}
              placeholder={t('prejoin.yourNamePrompt')}
              placeholderTextColor={tokens.color.muted}
              style={styles.nameInput}
              testID="prejoin-name-input"
              value={name}
            />
          ) : (
            <Text numberOfLines={1} style={styles.nameValue} testID="prejoin-name">
              {name}
            </Text>
          )}
        </View>
        {/* Masqué, jamais grisé : un bouton `disabled` de Paper retombe sur
            `onSurfaceDisabled`, un quasi-noir qu'aucune couleur explicite ne
            rattrape sur cet écran sombre — la règle d'AGENTS.md. Un invité
            sans nom n'a donc AUCUN bouton à regarder, plutôt qu'un bouton
            mort. */}
        {name.trim().length > 0 ? (
          <Button
            buttonColor={tokens.color.brandStrong}
            mode="contained"
            onPress={handleJoin}
            style={styles.join}
            testID="join-call-btn"
            textColor={tokens.color.onBrand}
          >
            {t('prejoin.join')}
          </Button>
        ) : null}
      </View>
    </View>
  );
}
