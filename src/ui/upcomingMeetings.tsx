import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { clockLabel, relativeTo } from 'src/calendar/format';
import type { CalendarEvent } from 'src/calendar/ics';
import { SectionLabel } from 'src/ui/sectionLabel';
import { SurfaceCard } from 'src/ui/surfaceCard';
import { tokens } from 'src/ui/tokens';

type Props = {
  readonly events: readonly CalendarEvent[];
  readonly now: number;
  readonly onJoin: (event: CalendarEvent) => void;
  readonly onOpenEvent: (event: CalendarEvent) => void;
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
 * et testé sans rendu. `now` avance à la seconde — voir `useUpcoming` — donc
 * chaque ligne se reformule à chaque battement.
 */
export function UpcomingMeetings({ events, now, onJoin, onOpenEvent }: Props): React.ReactElement {
  const { t } = useTranslation();

  return (
    <View style={styles.panel} testID="upcoming-panel">
      <SectionLabel label={t('home.upcoming.title')} testID="upcoming-title" />

      <SurfaceCard testID="upcoming-card">
        {events.length === 0 ? (
          <Text style={styles.empty} testID="upcoming-empty">
            {t('home.upcoming.empty')}
          </Text>
        ) : (
          events.map((event, index) => {
            const relative = relativeTo(event.startMs, now);
            const label = whenLabel(relative);

            return (
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
                  <View style={styles.whenRow}>
                    {relative.kind === 'ongoing' ? (
                      <LiveDot testID={`upcoming-live-${event.uid}`} />
                    ) : null}
                    <Text style={styles.relative} testID={`upcoming-when-${event.uid}`}>
                      {t(label.key, label.params)}
                    </Text>
                  </View>
                </View>

                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onJoin(event)}
                    style={styles.join}
                    testID={`upcoming-join-${event.uid}`}
                  >
                    <Text style={styles.joinLabel}>{t('home.upcoming.join')}</Text>
                  </Pressable>

                  {/* Consulter l'évènement dans l'agenda web. Une commande
                      SECONDAIRE : le geste principal de cette ligne est de
                      rejoindre, et deux boutons verts côte à côte ne diraient
                      plus lequel. */}
                  <Pressable
                    accessibilityLabel={t('home.upcoming.openInCalendar')}
                    accessibilityRole="button"
                    onPress={() => onOpenEvent(event)}
                    style={styles.calendar}
                    testID={`upcoming-calendar-${event.uid}`}
                  >
                    <MaterialCommunityIcons
                      color={tokens.color.textSecondary}
                      name="calendar-blank-outline"
                      size={20}
                      testID={`upcoming-calendar-${event.uid}-glyph`}
                    />
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </SurfaceCard>
    </View>
  );
}

/**
 * La pastille rouge d'une réunion commencée.
 *
 * Elle pulse plutôt qu'elle ne clignote : une opacité qui va et vient attire
 * l'œil sans le hacher, et surtout **elle n'est jamais totalement invisible** —
 * un clignotement franc laisserait, la moitié du temps, une ligne « en cours »
 * sans son témoin.
 *
 * `useNativeDriver` parce que l'opacité s'anime hors du fil JavaScript : le
 * panneau se re-rend déjà chaque seconde, et faire piloter l'animation par ce
 * même fil la ferait sauter à chaque battement.
 *
 * **Aucun test ne peut prouver qu'elle pulse** — RNTL ne rastérise rien et
 * l'animation ne passe pas par JavaScript. Ce qui est gardé, c'est qu'elle est
 * rendue quand il faut et qu'elle porte la bonne couleur.
 */
function LiveDot({ testID }: { readonly testID: string }): React.ReactElement {
  // `useState` avec un initialiseur PARESSEUX, et non `useRef(...).current` :
  // le compilateur React interdit de lire `.current` pendant le rendu, et le
  // lint du dépôt en fait une erreur. La valeur n'est construite qu'une fois
  // dans les deux cas ; celle-ci est la seule des deux qui soit permise.
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { duration: 700, toValue: 0.3, useNativeDriver: true }),
        Animated.timing(opacity, { duration: 700, toValue: 1, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return <Animated.View style={[styles.liveDot, { opacity }]} testID={testID} />;
}

// Rend une CLÉ et ses paramètres, jamais une phrase, et ne reçoit pas `t`.
//
// Le typage de `TFunction` d'i18next refuse un `(key: string, o?: object)`, et
// le contourner par une assertion aurait masqué le vrai bénéfice : une fonction
// qui rend une clé se teste sans i18n, dans les sept langues à la fois.
function whenLabel(relative: ReturnType<typeof relativeTo>): {
  readonly key: string;
  readonly params?: Record<string, number | string>;
} {
  if (relative.kind === 'ongoing') return { key: 'home.upcoming.ongoing' };

  // **L'unité de TÊTE est un compte, les suivantes sont des positions
  // d'horloge.** Un compte ne se remplit pas — « dans 9 min » se lit, « dans
  // 09 min » non. Une position d'horloge, si : « 3 h 9 » n'existe pas, et un
  // décompte dont les chiffres changent de largeur chaque seconde sautille
  // sous l'œil. Mesuré sur appareil le 2026-08-03, le panneau affichait
  // exactement « dans 3 h 9 ».
  const seconds = pad(relative.seconds);

  if (relative.kind === 'minutes') {
    return { key: 'home.upcoming.inMinutes', params: { minutes: relative.minutes, seconds } };
  }

  return {
    key: 'home.upcoming.inHours',
    params: { hours: relative.hours, minutes: pad(relative.minutes), seconds },
  };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

const styles = StyleSheet.create({
  // Le libellé de section touchait la carte : il la coiffe, il ne s'y pose pas.
  panel: { gap: tokens.spacing.sm },
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
  whenRow: { alignItems: 'center', flexDirection: 'row', gap: tokens.spacing.xs },
  liveDot: {
    backgroundColor: tokens.color.danger,
    borderRadius: tokens.radius.pill,
    height: 7,
    width: 7,
  },
  relative: {
    color: tokens.color.textSecondary,
    fontFamily: tokens.font.medium,
    fontSize: tokens.typography.rowHint.fontSize,
  },
  actions: { alignItems: 'center', flexDirection: 'row', gap: tokens.spacing.xs },
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
  // Une cible tactile n'est pas un glyphe : 20 px de dessin dans 36 px de
  // surface pressable, le minimum qu'on puisse viser sans le manquer.
  calendar: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  empty: {
    color: tokens.color.textSecondary,
    fontFamily: tokens.font.medium,
    fontSize: tokens.typography.rowHint.fontSize,
    padding: tokens.spacing.md,
  },
});
