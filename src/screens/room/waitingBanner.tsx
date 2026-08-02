import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import type { WaitingParticipant } from 'src/api/participants';
import { CALL_META_TEXT, CALL_SURFACE_HAIRLINE } from 'src/screens/room/callHeader';
import { InitialsAvatar } from 'src/ui/initialsAvatar';
import { tokens } from 'src/ui/tokens';

// La carte du bandeau d'admission. Valeur du mockup, conservée : ce n'est pas
// une COMMANDE, donc WCAG 1.4.11 ne s'applique pas à sa frontière (1,27:1
// contre `backgroundDark`) — ce sont les deux boutons qu'elle porte qui sont
// les commandes, et eux sont mesurés plus bas. Comme `CALL_META_TEXT`, elle
// devra rejoindre `src/ui/tokens` : ce sous-lot ne possède pas ce fichier.
export const WAITING_SURFACE = '#1D2622';

// Le libellé du bouton « Refuser ». Valeur du mockup, conservée : 8,61:1 sur
// #1D2622.
//
// Ce n'est PAS `tokens.color.dangerDark` (#FF8A80, 6,80:1, qui passerait
// aussi) : ce jeton est celui des erreurs, et refuser quelqu'un à la porte
// n'est pas une panne. Le rose éteint du mockup dit « écarter » sans dire
// « quelque chose a cassé ».
export const WAITING_REFUSE_TEXT = '#E9B4B4';

// Le contour du même bouton — et la SEULE valeur du mockup que ce sous-lot ait
// dû corriger.
//
// Le mockup posait `rgba(255,255,255,.18)`, soit 1,79:1 une fois composé sur
// #1D2622. Ce filet-là n'est pas décoratif : « Refuser » est le seul des deux
// boutons à n'avoir aucun fond, et son contour est donc la seule chose qui le
// délimite face au vert plein d'à côté. C'est exactement le rôle que
// `src/ui/tokens` distingue sous `controlOutline` — « le trait qui EST
// l'affordance » —, soumis aux 3:1 de WCAG 1.4.11.
//
// `.34` est le MINIMUM qui franchit le seuil : 3,07:1. Assombri — ici
// éclairci — au minimum, à teinte préservée, comme les cinq valeurs de la
// palette du Lot 1.
export const WAITING_REFUSE_OUTLINE = 'rgba(255, 255, 255, 0.34)';

const styles = StyleSheet.create({
  // Le côté de 44 dp du mockup, qui est aussi la cible tactile minimale
  // recommandée. `contentStyle` et non `style` : Paper pose la hauteur sur la
  // rangée interne, la sienne ne ferait que grandir la surface autour.
  action: { height: 44 },
  actionLabel: { fontFamily: tokens.font.bold, fontSize: 13, marginHorizontal: 12 },
  actions: { flexDirection: 'row', gap: tokens.spacing.sm },
  // Le vert qui porte du TEXTE est `brandStrong`, jamais `brand` : du blanc sur
  // #1FA45C ne donne que 3,22:1. Sur #177E44, 5,12:1 — et l'aplat lui-même tient
  // 3,03:1 contre la carte, donc le bouton reste identifiable.
  admit: { borderRadius: 12 },
  identity: { flexShrink: 1, gap: 2 },
  // `flexShrink: 1` sur la colonne de texte n'est pas une précaution : Yoga le
  // met à 0 par défaut, à l'inverse du web. Sans lui, une phrase allemande
  // longue pousse les deux actions hors de l'écran — le défaut exact que
  // `participantsPanel.tsx` a payé, mesuré à 39 px de nom restant.
  name: { color: tokens.color.textDark, fontFamily: tokens.font.extraBold, fontSize: 14.5 },
  // La hiérarchie du mockup : le nom en clair, la file en méta. 5,34:1 sur
  // #1D2622, au-dessus du seuil de 4,5:1 pour du texte.
  others: { color: CALL_META_TEXT, fontFamily: tokens.font.semiBold, fontSize: 12 },
  refuse: { borderColor: WAITING_REFUSE_OUTLINE, borderRadius: 12 },
  root: {
    alignItems: 'center',
    backgroundColor: WAITING_SURFACE,
    borderColor: CALL_SURFACE_HAIRLINE,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    margin: tokens.spacing.sm,
    padding: tokens.spacing.sm,
  },
});

export type WaitingBannerProps = {
  readonly participant: WaitingParticipant | null;
  readonly remaining: number;
  readonly onAnswer: (id: string, allow: boolean) => void;
};

// Une seule personne à la fois, la première arrivée, avec le nombre de
// personnes restantes : une pile de bandeaux mangerait la vidéo, qui est la
// raison d'être de l'écran. La coquille ne va rien chercher elle-même — elle
// reçoit une personne et deux actions.
//
// AUCUN bouton `disabled` ici, comme partout sur cet écran :
// `IconButton/utils.ts:88-93` teste `disabled` AVANT la couleur explicite et
// rend `onSurfaceDisabled`, un quasi-noir qu'aucune couleur ne rattrape.
export function WaitingBanner({
  participant,
  remaining,
  onAnswer,
}: WaitingBannerProps): React.ReactElement | null {
  const { t } = useTranslation();

  if (participant === null) return null;

  // Même repli que stage.tsx et participantsPanel.tsx : jamais d'identifiant
  // brut ni de vide à l'écran. Le bandeau était le seul des trois à afficher
  // un nom sans ce repli.
  const name = participant.username.trim();
  const label = name.length > 0 ? name : t('call.unnamedParticipant');

  return (
    <View testID="waiting-banner" style={styles.root}>
      {/* Les initiales viennent du LIBELLÉ, pas du champ brut : un disque vide
          à côté d'un nom de repli se lirait comme une panne d'affichage. */}
      <InitialsAvatar name={label} size="md" testID="waiting-avatar" />
      <View style={styles.identity} testID="waiting-identity">
        <Text numberOfLines={1} style={styles.name}>
          {t('waiting.knocking', { name: label })}
        </Text>
        {remaining > 0 ? (
          <Text numberOfLines={1} testID="waiting-others" style={styles.others}>
            {t('waiting.others', { count: remaining })}
          </Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        {/* Refuser d'abord, Admettre ensuite : l'action irréversible se pose
            LOIN du pouce, et l'action attendue tombe sous lui. */}
        <Button
          mode="outlined"
          testID="waiting-refuse"
          contentStyle={styles.action}
          labelStyle={styles.actionLabel}
          style={styles.refuse}
          // `mode="outlined"`, contrairement à `mode="contained"` ci-dessous,
          // n'a pas de fond propre : son texte retombe par défaut sur
          // `theme.colors.primary`, que le Lot 1 fixe désormais TOUJOURS au
          // thème clair — #177E44 sur #1D2622 tombe à 3,03:1, sous le seuil AA,
          // dans la même famille de bogue que C1. Vérifié dans la source de
          // `Button` (`getButtonTextColor`) : « outlined » et « text »
          // partagent le même repli.
          textColor={WAITING_REFUSE_TEXT}
          onPress={() => onAnswer(participant.id, false)}
        >
          {t('waiting.refuse')}
        </Button>
        <Button
          mode="contained"
          testID="waiting-admit"
          buttonColor={tokens.color.brandStrong}
          contentStyle={styles.action}
          labelStyle={styles.actionLabel}
          style={styles.admit}
          // Explicite alors que `mode="contained"` sait déjà se colorer : le
          // repli passe par `theme.colors.onPrimary`, et la doctrine de cet
          // écran est que rien n'y dépend du thème.
          textColor={tokens.color.onBrand}
          onPress={() => onAnswer(participant.id, true)}
        >
          {t('waiting.admit')}
        </Button>
      </View>
    </View>
  );
}
