import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { clockLabel, relativeTo } from 'src/calendar/format';
import type { CalendarEvent } from 'src/calendar/ics';
import { SectionLabel } from 'src/ui/sectionLabel';
import { SurfaceCard } from 'src/ui/surfaceCard';
import { tokens } from 'src/ui/tokens';

type Props = {
  readonly events: readonly CalendarEvent[];
  readonly now: number;
  readonly onJoin: (event: CalendarEvent) => void;
};

/**
 * Les prochaines visioconférences.
 *
 * **Pas de fond vert**, contrairement au panneau web : demande explicite de
 * Michel-Marie. Le panneau emprunte `cardSurface` comme les deux cartes
 * d'action au-dessus, ce qui le pose dans la page au lieu de l'en détacher.
 *
 * Ce composant ne décide de RIEN : il reçoit une liste déjà filtrée, triée et
 * tronquée, et un instant. Tout ce qui se décide vit dans `src/calendar`, pur
 * et testé sans rendu.
 */
export function UpcomingMeetings({ events, now, onJoin }: Props): React.ReactElement {
  const { t } = useTranslation();

  return (
    <View testID="upcoming-panel">
      <SectionLabel label={t('home.upcoming.title')} testID="upcoming-title" />

      <SurfaceCard testID="upcoming-card">
        {events.length === 0 ? (
          <Text style={styles.empty} testID="upcoming-empty">
            {t('home.upcoming.empty')}
          </Text>
        ) : (
          events.map((event, index) => (
            <View
              key={event.uid}
              style={[styles.row, index > 0 ? styles.divided : null]}
              testID={`upcoming-row-${event.uid}`}
            >
              <Text style={styles.clock} testID={`upcoming-clock-${event.uid}`}>
                {clockLabel(event.startMs)}
              </Text>

              <View style={styles.middle}>
                <Text
                  numberOfLines={1}
                  style={styles.summary}
                  testID={`upcoming-title-${event.uid}`}
                >
                  {event.summary}
                </Text>
                <Text style={styles.relative} testID={`upcoming-when-${event.uid}`}>
                  {t(whenLabel(event.startMs, now).key, whenLabel(event.startMs, now).params)}
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => onJoin(event)}
                style={styles.join}
                testID={`upcoming-join-${event.uid}`}
              >
                <Text style={styles.joinLabel}>{t('home.upcoming.join')}</Text>
              </Pressable>
            </View>
          ))
        )}
      </SurfaceCard>
    </View>
  );
}

// Rend une CLÉ et ses paramètres, jamais une phrase, et ne reçoit pas `t`.
//
// Le typage de `TFunction` d'i18next refuse un `(key: string, o?: object)`, et
// le contourner par une assertion aurait masqué le vrai bénéfice : une fonction
// qui rend une clé se teste sans i18n, dans les sept langues à la fois.
function whenLabel(
  startMs: number,
  now: number,
): { readonly key: string; readonly params?: Record<string, number> } {
  const relative = relativeTo(startMs, now);
  if (relative.kind === 'ongoing') return { key: 'home.upcoming.ongoing' };
  if (relative.kind === 'minutes') {
    return { key: 'home.upcoming.inMinutes', params: { minutes: relative.minutes } };
  }
  return {
    key: 'home.upcoming.inHours',
    params: { hours: relative.hours, minutes: relative.minutes },
  };
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  divided: { borderTopColor: tokens.color.cardBorder, borderTopWidth: StyleSheet.hairlineWidth },
  clock: {
    color: tokens.color.textPrimary,
    fontFamily: tokens.font.bold,
    fontSize: tokens.typography.rowTitle.fontSize,
    minWidth: 46,
  },
  middle: { flex: 1 },
  summary: {
    color: tokens.color.textPrimary,
    fontFamily: tokens.font.semiBold,
    fontSize: tokens.typography.rowTitle.fontSize,
  },
  relative: {
    color: tokens.color.textSecondary,
    fontFamily: tokens.font.medium,
    fontSize: tokens.typography.rowHint.fontSize,
  },
  join: {
    backgroundColor: tokens.color.brandWash,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
  },
  joinLabel: {
    color: tokens.color.brandStrong,
    fontFamily: tokens.font.semiBold,
    fontSize: tokens.typography.rowHint.fontSize,
  },
  empty: {
    color: tokens.color.textSecondary,
    fontFamily: tokens.font.medium,
    fontSize: tokens.typography.rowHint.fontSize,
    padding: tokens.spacing.md,
  },
});
