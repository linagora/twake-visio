import { format, isToday, isYesterday } from 'date-fns';
import { de, enUS, es, fr, it, ru, vi } from 'date-fns/locale';
import type { Locale } from 'date-fns';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { getActiveAccount } from 'src/auth/accounts';
import { listVisits, type MeetingVisit } from 'src/rooms/journal';
import { AppHeader } from 'src/ui/appHeader';
import { EmptyState } from 'src/ui/emptyState';
import { InitialsAvatar } from 'src/ui/initialsAvatar';
import { SearchField } from 'src/ui/searchField';
import { SectionLabel } from 'src/ui/sectionLabel';
import { SurfaceCard } from 'src/ui/surfaceCard';
import { tokens } from 'src/ui/tokens';

// La recherche porte sur l'intitulé ET sur le code : le code est souvent la
// seule chose qu'on retient d'une réunion rejointe par lien, l'intitulé ne
// vivant que sur l'appareil de qui l'a créée.
export function filterVisits(
  visits: readonly MeetingVisit[],
  query: string,
): readonly MeetingVisit[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return visits;
  return visits.filter(
    (visit) =>
      visit.title.toLowerCase().includes(needle) || visit.slug.toLowerCase().includes(needle),
  );
}

const DATE_LOCALES: Readonly<Record<string, Locale>> = {
  en: enUS,
  fr,
  es,
  it,
  de,
  vi,
  ru,
};

// « 14:30 » aujourd'hui, « hier · 14:30 » hier, « mar. 29 juil. · 14:30 » avant.
export function formatVisitMoment(joinedAt: number, language: string): string {
  const locale = DATE_LOCALES[language] ?? enUS;
  const date = new Date(joinedAt);
  const time = format(date, 'HH:mm', { locale });
  if (isToday(date)) return time;
  if (isYesterday(date)) return `${format(date, 'EEEE', { locale })} · ${time}`;
  return `${format(date, 'EEE d MMM', { locale })} · ${time}`;
}

// La durée, quand la visite est close. Rendue en MINUTES entières.
//
// Arrondie à la minute supérieure, jamais à zéro : une réunion de quarante
// secondes a bien eu lieu, et « 0 min » se lit comme une erreur d'affichage.
// Au-delà de l'heure, « 1 h 05 » plutôt que « 65 min », qui se compte mal.
export function formatVisitDuration(visit: MeetingVisit): string | null {
  if (visit.endedAt === null) return null;
  const minutes = Math.max(1, Math.round((visit.endedAt - visit.joinedAt) / 60_000));
  if (minutes < 60) return `${String(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest).padStart(2, '0')}`;
}

export function HistoriqueScreen(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [query, setQuery] = useState('');
  // Lu une fois au montage : le journal ne change pas pendant qu'on le regarde,
  // et le relire à chaque frappe de la recherche ferait un aller-retour MMKV
  // par caractère.
  const [visits] = useState<readonly MeetingVisit[]>(() => listVisits());
  const shown = useMemo(() => filterVisits(visits, query), [visits, query]);

  const searching = query.trim().length > 0;
  const account = getActiveAccount();

  return (
    <View style={styles.root} testID="historique-screen">
      <AppHeader
        onAvatarPress={() => router.push('/reglages')}
        testID="history-header"
        title={t('tabs.history')}
        userName={account?.displayName ?? ''}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <SearchField
          onQueryChange={setQuery}
          placeholder={t('history.searchPlaceholder')}
          testID="history-search"
          value={query}
        />
        {visits.length === 0 ? (
          <EmptyState message={t('history.empty')} testID="history-empty" />
        ) : (
          <>
            <SectionLabel
              label={searching ? t('history.results') : t('history.recent')}
              testID="history-section"
            />
            {shown.length === 0 ? (
              <EmptyState message={t('history.noMatch')} testID="history-no-match" />
            ) : (
              <SurfaceCard testID="history-list">
                {shown.map((visit) => (
                  <View key={`${visit.slug}-${visit.joinedAt}`} style={styles.row}>
                    <InitialsAvatar
                      name={visit.title}
                      size="md"
                      testID={`visit-avatar-${visit.slug}`}
                    />
                    <View style={styles.rowText}>
                      <Text
                        numberOfLines={1}
                        style={styles.rowTitle}
                        testID={`visit-title-${visit.slug}`}
                      >
                        {visit.title}
                      </Text>
                      <Text style={styles.rowMeta} testID={`visit-meta-${visit.slug}`}>
                        {[
                          formatVisitMoment(visit.joinedAt, i18n.language),
                          formatVisitDuration(visit),
                        ]
                          .filter((part) => part !== null)
                          .join(' · ')}
                      </Text>
                    </View>
                  </View>
                ))}
              </SurfaceCard>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, padding: 18 },
  root: { backgroundColor: tokens.color.appBackground, flex: 1 },
  row: {
    alignItems: 'center',
    borderBottomColor: tokens.color.rowSeparator,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 13,
    padding: 14,
  },
  rowMeta: {
    color: tokens.color.textMeta,
    fontFamily: tokens.font.medium,
    fontSize: 12.5,
  },
  rowText: { flex: 1, gap: 4 },
  rowTitle: {
    color: tokens.color.textPrimary,
    fontFamily: tokens.font.bold,
    fontSize: tokens.typography.rowTitle.fontSize,
  },
});
