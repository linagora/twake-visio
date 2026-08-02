import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { tokens } from 'src/ui/tokens';

// — Les trois valeurs de surface de l'écran d'appel —
//
// Elles devraient vivre dans `src/ui/tokens`, qui est la source unique du style
// de ce dépôt. Ce sous-lot ne possède pas ce fichier-là : l'intégration de la
// refonte doit les y promouvoir. Elles sont exportées d'ici — et non recopiées
// dans chaque bandeau — pour qu'il n'y ait qu'UN endroit à déplacer, et qu'une
// dérive entre deux copies soit impossible d'ici là. Le précédent d'un module
// d'écran qui exporte une constante de style à ses voisins est
// `controlBar.ts` → `BAR_HEIGHT`, que `reactionOverlay.tsx` importe.
//
// Les ratios ci-dessous sont mesurés, pas estimés. Les fonds sont deux :
// `backgroundDark` (#0B0B0C), que `call.tsx` force sur la racine de l'écran, et
// la carte du bandeau d'admission (#1D2622). Les confondre est une erreur que
// ce dépôt a déjà commise et corrigée (voir `AGENTS.md`).

// La couleur du texte SECONDAIRE : minuteur, mention de chiffrement, phrase
// d'attente. Valeur du mockup, conservée telle quelle — elle passe le seuil de
// 4,5:1 sur les deux fonds : 6,76:1 sur #0B0B0C, 5,34:1 sur #1D2622.
//
// `tokens.color.muted` (#6B7280) ne pouvait pas la remplacer : 3,21:1 sur la
// carte du bandeau, sous le seuil. Vérifié avant d'introduire un littéral.
export const CALL_META_TEXT = '#8F9A94';

// Le lavis d'une surface posée SUR le fond de la séance : la pastille des
// participants de cet en-tête, la puce de l'indicateur d'enregistrement.
// Composé sur #0B0B0C il donne #212122 ; du texte `textDark` dessus mesure
// 13,62:1. L'aplat lui-même ne fait que 1,22:1 contre le fond, ce qui est
// DÉCORATIF et non soumis à WCAG 1.4.11 : ce qui identifie la pastille comme
// une commande, c'est son glyphe et son nombre, à 13,62:1 — pas son fond.
export const CALL_SURFACE_TINT = 'rgba(255, 255, 255, 0.09)';

// Le filet d'une telle surface. Décoratif au même titre que `cardBorder` et
// `rowSeparator` dans `src/ui/tokens` : il ne porte aucune information
// nécessaire pour identifier une commande, donc 1.4.11 ne s'y applique pas et
// la valeur du mockup est conservée. Le filet qui EST une affordance — celui du
// bouton « Refuser », seul contour de sa commande — est un autre cas, traité
// dans `waitingBanner.tsx`.
export const CALL_SURFACE_HAIRLINE = 'rgba(255, 255, 255, 0.1)';

const styles = StyleSheet.create({
  encrypted: { color: CALL_META_TEXT, fontFamily: tokens.font.semiBold, fontSize: 12.5 },
  identity: { flexShrink: 1, gap: 3 },
  // La pastille de présence. `tokens.color.brand` (#1FA45C) plutôt que le
  // #28C46E du mockup : le vert du mockup n'existe pas dans `src/ui/tokens`, et
  // le document de conception de ce lot autorise explicitement `brand` ICI —
  // 6,11:1 sur `backgroundDark`, quand il tombait à 2,99 sur le fond clair de
  // la coque. Un aplat de 7 dp est soumis au seuil non textuel de 3:1.
  live: {
    backgroundColor: tokens.color.brand,
    borderRadius: 3.5,
    height: 7,
    width: 7,
  },
  meta: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  participants: {
    alignItems: 'center',
    backgroundColor: CALL_SURFACE_TINT,
    borderRadius: 11,
    flexDirection: 'row',
    gap: 5,
    height: 36,
    paddingHorizontal: 11,
  },
  participantsCount: {
    color: tokens.color.textDark,
    fontFamily: tokens.font.bold,
    fontSize: 13,
  },
  root: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  timer: { color: CALL_META_TEXT, fontFamily: tokens.font.semiBold, fontSize: 12.5 },
  // `flexShrink: 1` n'est pas une précaution : Yoga le met à 0 par défaut, à
  // l'inverse du web. Sans lui, un nom de réunion long pousse la pastille des
  // participants hors de l'écran au lieu de se tronquer — le défaut exact que
  // `participantsPanel.tsx` a payé, mesuré à 39 px de nom restant.
  title: {
    color: tokens.color.textDark,
    fontFamily: tokens.font.extraBold,
    fontSize: 15,
  },
});

// Le temps écoulé en `mm:ss`.
//
// Les minutes ne repassent JAMAIS par zéro : une réunion d'une heure affiche
// `60:00`, pas `00:00`. C'est le format que le mockup demande, et un modulo sur
// les minutes ferait mentir le minuteur sur les réunions longues — celles où on
// le regarde le plus.
//
// Les deux replis sont atteignables, pas défensifs : l'horloge de l'appareil
// peut être en avance sur l'instant de jonction renvoyé par le serveur (valeur
// négative), et `(Date.now() - Date.parse(joinedAt)) / 1000` rend `NaN` dès que
// cet horodatage est absent ou illisible. `-1:-1` et `NaN:NaN` s'afficheraient
// tels quels.
export function formatElapsed(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export type CallHeaderProps = {
  readonly title: string;
  // Des SECONDES, jamais une horloge lue ici : un composant qui appelle
  // `Date.now()` ne se teste qu'en faisant avancer le temps réel, et son rendu
  // dépendrait de l'instant du test. Le seul propriétaire du temps est
  // l'écran qui monte cet en-tête.
  readonly elapsedSeconds: number;
  readonly participantCount: number;
  // Préfixée, jamais `onPress` : `fireEvent.press` remonte la fibre React
  // jusqu'au premier ancêtre HÔTE, et ni `Pressable` ni un composant à nous
  // n'en sont un. Une prop qui reprend le nom d'un événement hôte est donc
  // trouvée sur notre propre fibre, et le test passe que la prop soit câblée ou
  // non. Mesuré sur ce dépôt : zéro rouge avant renommage, quatre après.
  readonly onParticipantsPress: () => void;
};

// L'en-tête de la séance : nom de la réunion, état, et l'accès au panneau des
// participants.
//
// Il ne va rien chercher lui-même — ni le nom, ni le temps, ni le compte. Les
// trois vivent déjà dans `call.tsx`, qui possède la connexion ; les redemander
// ici dupliquerait un état et le ferait diverger.
//
// AUCUN bouton `disabled` : `IconButton/utils.ts:88-93` teste `disabled` AVANT
// la couleur explicite et rend `onSurfaceDisabled`, un quasi-noir sur un fond
// quasi-noir qu'aucune couleur ne rattrape. Ici la pastille est toujours
// pressable — le panneau des participants s'ouvre même seul dans la salle.
export function CallHeader({
  title,
  elapsedSeconds,
  participantCount,
  onParticipantsPress,
}: CallHeaderProps): React.ReactElement {
  const { t } = useTranslation();

  return (
    <View style={styles.root} testID="call-header">
      <View style={styles.identity}>
        <Text numberOfLines={1} style={styles.title} testID="call-header-title">
          {title}
        </Text>
        <View style={styles.meta}>
          <View style={styles.live} testID="call-header-live" />
          <Text style={styles.timer} testID="call-header-timer">
            {formatElapsed(elapsedSeconds)}
          </Text>
          {/* Un point médian n'est pas de la copie : les sept locales le posent
              à l'identique, et le faire passer par `t` demanderait une clé que
              personne ne traduirait jamais. Il porte la couleur de ce qu'il
              sépare, sinon il retomberait sur le noir du thème clair. */}
          <Text style={styles.timer}>·</Text>
          <Text style={styles.encrypted} testID="call-header-encrypted">
            {t('call.encrypted')}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onParticipantsPress}
        style={styles.participants}
        testID="call-header-participants"
      >
        <MaterialCommunityIcons
          color={tokens.color.textDark}
          name="account-multiple"
          size={15}
          testID="call-header-participants-glyph"
        />
        <Text style={styles.participantsCount} testID="call-header-participants-count">
          {t('call.participantCount', { count: participantCount })}
        </Text>
      </Pressable>
    </View>
  );
}
