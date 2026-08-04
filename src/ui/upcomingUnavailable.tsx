import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { UpcomingCause } from 'src/calendar/useUpcoming';
import { tokens } from 'src/ui/tokens';

type Props = {
  readonly cause: UpcomingCause;
  readonly onSignIn: () => void;
  readonly testID: string;
};

// Ce que chaque cause demande : une phrase, et un geste ou aucun.
//
// Écrit comme une TABLE plutôt qu'en cascade de `if` : trois causes, trois
// lignes, et une quatrième cause ajoutée au type ne compilera pas tant qu'elle
// n'aura pas sa ligne ici.
const COPY: Readonly<Record<UpcomingCause, { readonly key: string; readonly action: boolean }>> = {
  'signed-out': { action: true, key: 'home.agendaSignedOut' },
  unreachable: { action: false, key: 'home.agendaUnreachable' },
  unsupported: { action: false, key: 'home.agendaUnsupported' },
};

/**
 * Ce qui s'affiche quand l'agenda ne peut pas être montré.
 *
 * **Il remplace une ligne de diagnostic — « agenda indisponible — jeton:
 * no-session » — qui ne s'affichait qu'en développement.** Le propriétaire l'a
 * vue et a demandé mieux, à juste titre : en production l'écran restait
 * SILENCIEUX, donc un agenda absent était indiscernable d'un agenda vide, et en
 * développement il parlait un langage que personne n'a à connaître.
 *
 * La distinction qui compte n'est pas « ça marche / ça ne marche pas » mais
 * « quelqu'un peut-il y faire quelque chose ». Une session perdue se répare en
 * un appui ; un service injoignable se retente seul ; une instance sans agenda
 * ne se réparera jamais. Trois phrases, et un bouton pour la seule qui en
 * appelle un.
 */
export function UpcomingUnavailable({ cause, onSignIn, testID }: Props): React.ReactElement {
  const { t } = useTranslation();
  const copy = COPY[cause];

  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.header}>
        <MaterialCommunityIcons
          color={tokens.color.textSectionLabel}
          name="calendar-alert"
          size={20}
          testID={`${testID}-glyph`}
        />
        <Text style={styles.title} testID={`${testID}-title`}>
          {t('home.agendaTitle')}
        </Text>
      </View>

      <Text style={styles.message} testID={`${testID}-message`}>
        {t(copy.key)}
      </Text>

      {copy.action ? (
        <Pressable
          accessibilityRole="button"
          onPress={onSignIn}
          style={styles.action}
          testID={`${testID}-signin`}
        >
          <Text style={styles.actionLabel} testID={`${testID}-signin-label`}>
            {t('home.agendaSignIn')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  action: { alignSelf: 'flex-start', paddingVertical: tokens.spacing.xs },
  actionLabel: {
    color: tokens.color.brandStrong,
    fontFamily: tokens.font.semiBold,
    fontSize: 14,
  },
  card: {
    backgroundColor: tokens.color.surfaceLight,
    borderColor: tokens.color.cardBorder,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    gap: tokens.spacing.xs,
    padding: tokens.spacing.md,
  },
  header: { alignItems: 'center', flexDirection: 'row', gap: tokens.spacing.xs },
  message: { color: tokens.color.textSecondary, fontSize: 13, lineHeight: 18 },
  title: { color: tokens.color.textLight, fontFamily: tokens.font.bold, fontSize: 15 },
});
