import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';
import { IconButton, List, Text } from 'react-native-paper';

import type { ParticipantRole } from 'src/api/participants';
import type { ParticipantView } from 'src/call/layout';
import { BottomSheet } from 'src/screens/room/bottomSheet';
import { BAR_RIPPLE_COLOR, sheetStyles } from 'src/screens/room/controlBar';
import { SheetRow } from 'src/screens/room/sheetRow';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  root: { flex: 1, padding: tokens.spacing.md, gap: tokens.spacing.sm },
  // Le panneau remplace la scène dans la même `View` sombre que `call.tsx`
  // pose (`backgroundDark`, dans les deux schémas) : sans cette couleur
  // explicite, le titre et le nom de chaque ligne retombent sur
  // `theme.colors.onSurface`, qui suit le schéma système — noir sur noir dès
  // qu'un appareil est en clair.
  text: { color: tokens.color.textDark },
});

type RowProps = {
  readonly participant: ParticipantView;
  readonly canModerate: boolean;
  readonly onMute: (identity: string) => void;
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

  return (
    <>
      <List.Item
        testID="participant-row"
        title={label}
        titleStyle={styles.text}
        titleNumberOfLines={2}
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
          <SheetRow
            testID="participant-mute"
            title={t('participants.mute')}
            onPress={() => {
              setSheetVisible(false);
              onMute(participant.identity);
            }}
          />
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
            titleStyle={sheetStyles.rowTitleDanger}
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
  readonly onMute: (identity: string) => void;
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
      <Text variant="titleMedium" style={styles.text}>
        {t('participants.title')}
      </Text>
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
