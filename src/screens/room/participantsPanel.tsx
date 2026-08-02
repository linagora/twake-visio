import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';
import { IconButton, List, Text } from 'react-native-paper';

import type { ParticipantRole } from 'src/api/participants';
import type { ParticipantView } from 'src/call/layout';
import { BottomSheet } from 'src/screens/room/bottomSheet';
import { BAR_RIPPLE_COLOR } from 'src/screens/room/controlBar';
import { SheetRow } from 'src/screens/room/sheetRow';
import { InitialsAvatar } from 'src/ui/initialsAvatar';
import { tokens } from 'src/ui/tokens';

// Le rouge assourdi du mockup, pour l'unique état de micro que ce panneau peut
// affirmer sans mentir (voir `ParticipantRow`). Exporté pour que la
// spécification l'assertisse sans recopier un hexadécimal ; il vit ici plutôt
// que dans `src/ui/tokens` pour la raison écrite en tête de `bottomSheet.tsx`.
//
// 6,83:1 sur le `backgroundDark` (#0B0B0C) que `call.tsx` force derrière ce
// panneau — au-dessus du seuil AA de 4,5:1, et volontairement moins criard que
// `dangerDark` (#FF8A80) qui reste réservé à ce qu'on ne rattrape pas.
export const MIC_OFF_COLOR = '#E07B7B';

const styles = StyleSheet.create({
  root: { flex: 1, padding: tokens.spacing.md, gap: tokens.spacing.sm },
  // Le panneau remplace la scène dans la même `View` sombre que `call.tsx`
  // pose (`backgroundDark`, dans les deux schémas) : sans couleur explicite,
  // le titre et le nom de chaque ligne retombent sur `theme.colors.onSurface`,
  // que `makeTheme` rend TOUJOURS clair depuis le Lot 1 — noir sur noir, à coup
  // sûr. Les trois styles de texte ci-dessous en posent donc une, chacun.
  //
  // Le titre du panneau, au même gabarit que celui d'une feuille : ce sont les
  // deux surfaces qui se nomment, et les distinguer n'apporterait rien.
  panelTitle: {
    color: tokens.color.textDark,
    fontFamily: tokens.font.extraBold,
    fontSize: 20,
    lineHeight: 26,
  },
  // Le nom : 14,5 dp gras, relevé sur le mockup. `List.Item` pose sinon un
  // `fontSize: 16` (`ListItem.tsx`, `styles.title`) et la police du thème.
  name: {
    color: tokens.color.textDark,
    fontFamily: tokens.font.bold,
    fontSize: 14.5,
    lineHeight: 20,
  },
  micOff: {
    color: MIC_OFF_COLOR,
    fontFamily: tokens.font.medium,
    fontSize: tokens.typography.rowHint.fontSize,
    lineHeight: tokens.typography.rowHint.lineHeight,
  },
  // Expulser est la seule des trois actions qu'on ne rattrape pas. La couleur
  // est locale plutôt qu'empruntée à `sheetStyles.rowTitleDanger` : ce
  // sous-lot ne possède pas `controlBar.ts`, et une valeur qu'on ne possède
  // pas peut bouger sous ses appelants. 8,21:1 sur la feuille.
  rowTitleDanger: { color: tokens.color.dangerDark },
});

type RowProps = {
  readonly participant: ParticipantView;
  readonly canModerate: boolean;
  // Le trackSid en second argument : `mute-participant` du serveur meet
  // l'exige, et la ligne est le seul endroit qui sache lequel — voir
  // `ParticipantView.micTrackSid`.
  readonly onMute: (identity: string, trackSid: string) => void;
  readonly onRemove: (identity: string) => void;
  readonly onRole: (identity: string, role: ParticipantRole) => void;
};

// Une ligne, une personne. Même répartition que VideoTile dans stage.tsx :
// jamais d'identité brute ni de vide à l'écran — les deux se liraient comme un
// défaut d'affichage plutôt que comme une personne réellement sans nom — et un
// nom trop long est tronqué plutôt que de pousser les actions hors de l'écran.
//
// LES TROIS ACTIONS NE SONT PLUS SUR LA LIGNE. Elles y étaient, et c'est le
// défaut que ce fichier corrige : `List.Item` pose son `right` sur la MÊME
// ligne que le titre et ne le fait jamais retomber. Mesuré sur appareil, en
// français, sur un écran de 1080 px — les trois boutons prenaient 963 px des
// 1002 disponibles et il restait **39 px** au nom :
//
//     ViewGroup desc='test depuis Mac'   [39,405][1041,581]
//       ViewGroup (zone du titre)        [39,439][78,547]   <- 39 px
//       Button 'Couper le micro'         [78,439][417,535]
//       Button 'Expulser'                [426,439][637,535]
//       Button 'Passer administrateur'   [647,439][1041,535]
//
// La personne distante ÉTAIT dans la liste ; son nom était écrasé à zéro. Ce
// qui restait lisible se lisait comme une seule ligne — la locale — portant
// des actions qui, elles, pilotaient la ligne d'en dessous. Et le français est
// le cas favorable : « Passer administrateur » devient « Als Administrator
// festlegen » en allemand.
//
// D'où une seule cible sur la ligne, qui ouvre une feuille inférieure — la
// convention du dépôt depuis que les trois menus de la barre en sont devenus.
// Elle règle trois choses d'un coup : le nom garde toute la largeur, la
// longueur des traductions cesse d'être une contrainte de mise en page, et la
// feuille PORTE LE NOM de la personne visée, ce qu'aucune rangée de boutons ne
// disait.
function ParticipantRow({
  participant,
  canModerate,
  onMute,
  onRemove,
  onRole,
}: RowProps): React.ReactElement {
  const { t } = useTranslation();
  const [sheetVisible, setSheetVisible] = useState(false);

  // La sélection nettoie le nom : il n'y a qu'une absence à traiter, et jamais
  // une identité brute à l'écran.
  const name = participant.name.trim();
  const label = name.length > 0 ? name : t('call.unnamedParticipant');

  // Sans droit de modérer, le serveur refuserait de toute façon : proposer un
  // geste voué à échouer se lit comme une panne de l'application. Et personne
  // ne se modère soi-même — s'expulser (ou changer son propre rôle) d'un pouce
  // mal placé n'est pas rattrapable.
  const canAct = canModerate && !participant.isLocal;

  // Extrait dans une const : lu directement sur `participant`, le rétrécissement
  // de type ne survivrait pas à la fermeture du `onPress`, et il faudrait un
  // `?? ''` qui enverrait un sid vide au serveur au lieu de rendre le cas
  // impossible.
  const micTrackSid = participant.micTrackSid;

  return (
    <>
      <List.Item
        testID="participant-row"
        title={label}
        titleStyle={styles.name}
        titleNumberOfLines={2}
        // `name` et non `label` : une personne sans nom n'a pas d'initiales, et
        // `initialsOf` rend alors la chaîne vide plutôt qu'une lettre prise au
        // libellé de repli — « Participant sans nom » donnerait un « P » qui ne
        // désigne personne. `size="md"` vaut 40 dp, le diamètre que le mockup
        // donne à une rangée de liste (`initialsAvatar.tsx`, `DIAMETER`).
        //
        // `props.style` est repris tel quel : c'est lui qui porte la marge et
        // le centrage vertical que `List.Item` calcule selon qu'il y a une
        // description ou non (`List/utils.ts`, `getLeftStyles`).
        left={(props) => (
          <View style={props.style}>
            <InitialsAvatar testID="participant-avatar" name={name} size="md" />
          </View>
        )}
        // LE SEUL ÉTAT DE MICRO QUE CE PANNEAU PEUT AFFIRMER. Le mockup en
        // demande deux — vert « micro actif », rouge « micro coupé » — et le
        // second seulement est démontrable ici : `micTrackSid` est
        // explicitement INDÉPENDANT de `isMuted` (`src/call/participants.ts`,
        // le commentaire de la fonction du même nom), et `ParticipantView` ne
        // porte aucun autre signal. Une piste publiée puis coupée par son
        // émetteur garde son sid : afficher « actif » sur cette seule base
        // serait un mensonge d'interface, du genre qu'on ne rattrape pas parce
        // que personne ne le soupçonne.
        //
        // Le signal est donc à SENS UNIQUE : présent, la personne est
        // certainement silencieuse ; absent, on ne sait pas. C'est une garantie
        // plus faible que celle du mockup, et c'est la seule qui soit vraie.
        // Le vert reviendra le jour où `ParticipantView` portera `isMuted` —
        // ce qui touche `src/call/`, donc un autre lot que ce restylage.
        //
        // Rendue en fonction, jamais en chaîne : `List.Item` ne pose aucun
        // `testID` sur le `Text` de sa description (`ListItem.tsx:190-203`), et
        // sans testID la couleur explicite n'est gardable par rien.
        description={
          micTrackSid === null
            ? () => (
                <Text testID="participant-mic-off" style={styles.micOff}>
                  {t('call.muted')}
                </Text>
              )
            : undefined
        }
        right={() =>
          canAct ? (
            <IconButton
              testID="participant-actions"
              icon="dots-vertical"
              // Explicite, comme partout sur cet écran. Non gardée par un
              // test, et ce n'est pas un oubli : `IconButton.tsx:211` rend son
              // glyphe SANS lui transmettre de `testID` quand l'icône est une
              // chaîne, donc la couleur est hors de portée de RNTL. Voir
              // `AGENTS.md` — aucun des sept `IconButton` de la barre ne garde
              // la sienne non plus.
              iconColor={tokens.color.textDark}
              // Le panneau est posé sur `backgroundDark`, comme la barre :
              // c'est bien la constante de `controlBar.ts` qui convient ici, et
              // non celle d'une feuille (`surfaceDark`). Deux fonds, deux
              // ratios.
              rippleColor={BAR_RIPPLE_COLOR}
              onPress={() => setSheetVisible(true)}
              accessibilityLabel={t('participants.actions')}
            />
          ) : null
        }
      />
      {canAct ? (
        // Le titre de la feuille est le NOM de la personne visée. C'est ce qui
        // manquait le plus : trois boutons posés sur une ligne dont le nom
        // était écrasé ne disaient pas sur qui ils agissaient.
        <BottomSheet
          testID="participant-sheet"
          visible={sheetVisible}
          title={label}
          onDismiss={() => setSheetVisible(false)}
        >
          {/* Chaque rappel a DEUX instructions — refermer, puis agir — et
              chacune veut son assertion : une feuille qui reste ouverte
              par-dessus le panneau masque le résultat de l'action qu'on vient
              de déclencher. C'est le trou que le lot des panneaux a livré trois
              fois. */}
          {/* Sans micro publié, il n'y a rien à couper : le serveur veut un
              `track_sid`, et il n'en existe aucun. On masque plutôt que de
              griser — la convention de cet écran, et la seule qui tienne ici
              puisqu'un `SheetRow` désactivé retomberait de toute façon sur le
              quasi-noir de Paper. */}
          {micTrackSid !== null ? (
            <SheetRow
              testID="participant-mute"
              title={t('participants.mute')}
              onPress={() => {
                setSheetVisible(false);
                onMute(participant.identity, micTrackSid);
              }}
            />
          ) : null}
          <SheetRow
            testID="participant-promote"
            title={t('participants.promote')}
            onPress={() => {
              setSheetVisible(false);
              onRole(participant.identity, 'administrator');
            }}
          />
          {/* Expulser est la seule des trois qu'on ne rattrape pas : la
              personne doit rejoindre à nouveau. `rowTitleDanger` la distingue,
              et elle vient en dernier — jamais adjacente à l'action la plus
              anodine. */}
          <SheetRow
            testID="participant-remove"
            title={t('participants.remove')}
            titleStyle={styles.rowTitleDanger}
            onPress={() => {
              setSheetVisible(false);
              onRemove(participant.identity);
            }}
          />
        </BottomSheet>
      ) : null}
    </>
  );
}

export type ParticipantsPanelProps = {
  readonly participants: readonly ParticipantView[];
  readonly canModerate: boolean;
  // Deux arguments : voir `RowProps.onMute`.
  readonly onMute: (identity: string, trackSid: string) => void;
  readonly onRemove: (identity: string) => void;
  readonly onRole: (identity: string, role: ParticipantRole) => void;
};

// Coquille : elle reçoit une liste et trois rappels, elle ne va rien chercher
// elle-même. Deux identifiants circulent dans ce périmètre — l'UUID de lobby
// et l'identité LiveKit — et ne s'échangent pas ; ce panneau ne connaît que la
// seconde, celle que porte `ParticipantView.identity` et que reçoivent les
// trois rappels.
export function ParticipantsPanel({
  participants,
  canModerate,
  onMute,
  onRemove,
  onRole,
}: ParticipantsPanelProps): React.ReactElement {
  const { t } = useTranslation();

  return (
    <View style={styles.root}>
      <Text style={styles.panelTitle}>{t('participants.title')}</Text>
      <FlatList
        data={[...participants]}
        keyExtractor={(participant) => participant.identity}
        renderItem={({ item }) => (
          <ParticipantRow
            participant={item}
            canModerate={canModerate}
            onMute={onMute}
            onRemove={onRemove}
            onRole={onRole}
          />
        )}
      />
    </View>
  );
}
