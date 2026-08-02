import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { TextInput } from 'react-native-paper';

import { fetchMyRooms } from 'src/api/rooms';
import { getActiveAccount } from 'src/auth/accounts';
import { JoinSheet } from 'src/screens/joinSheet';
import { findRoomTitle } from 'src/rooms/titles';
import type { Room } from 'src/call/types';
import { ActionCard } from 'src/ui/actionCard';
import { AppHeader } from 'src/ui/appHeader';
import { InitialsAvatar } from 'src/ui/initialsAvatar';
import { SectionLabel } from 'src/ui/sectionLabel';
import { SurfaceCard } from 'src/ui/surfaceCard';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  // Un code se lit chiffre à chiffre : la chasse fixe empêche les colonnes de
  // danser d'une ligne à l'autre.
  code: { fontVariant: ['tabular-nums'] },
  content: { gap: 10, padding: 18 },
  header: { gap: 12, paddingBottom: 6 },
  noneMatching: {
    color: tokens.color.textSectionLabel,
    fontFamily: tokens.font.semiBold,
    fontSize: 14,
    paddingVertical: tokens.spacing.lg,
    textAlign: 'center',
  },
  root: { backgroundColor: tokens.color.appBackground, flex: 1 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 13, padding: 14 },
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

// Un salon sans nom se voit attribuer son slug comme nom par `toRoom` : la seule
// façon de les distinguer est l'égalité des deux. Un salon réellement nommé
// comme son slug serait rangé avec les codes, ce qui ne coûte rien.
//
// La distinction compte, parce qu'un slug affiché en titre se lit comme un nom
// et noie les vraies réunions : l'instance en renvoie des dizaines, créées puis
// jamais utilisées.
// L'intitulé lisible vit sur l'appareil : meet n'a pas de champ pour le porter.
// Les réunions créées ici retrouvent donc leur titre, les autres montrent leur
// code, qui est au moins exact.
export function displayName(room: Room): string {
  return findRoomTitle(room.slug) ?? room.name;
}

// Un salon dont on connaît l'intitulé passe devant ceux qui n'ont qu'un code.
// Rien d'autre n'est disponible pour ordonner : l'API ne documente aucune date
// sur cette liste, et trier par une date qu'on n'a pas vue serait deviner.
function hasTitle(room: Room): boolean {
  return findRoomTitle(room.slug) !== null;
}

function sortRooms(rooms: readonly Room[]): readonly Room[] {
  return [...rooms].sort((a, b) => {
    const byKind = Number(hasTitle(b)) - Number(hasTitle(a));
    if (byKind !== 0) return byKind;
    return displayName(a).localeCompare(displayName(b));
  });
}

export function filterRooms(rooms: readonly Room[], query: string): readonly Room[] {
  const needle = query.trim().toLowerCase();
  const sorted = sortRooms(rooms);
  if (needle.length === 0) return sorted;
  // Le code est cherché autant que l'intitulé : on rejoint souvent une réunion
  // depuis un code lu ailleurs. Et l'intitulé cherché est celui qui s'affiche,
  // sans quoi taper ce qu'on voit à l'écran ne trouverait rien.
  return sorted.filter(
    (room) =>
      displayName(room).toLowerCase().includes(needle) || room.slug.toLowerCase().includes(needle),
  );
}

export function HomeScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const [rooms, setRooms] = useState<readonly Room[]>([]);
  const [query, setQuery] = useState('');
  const [joinOpen, setJoinOpen] = useState(false);
  const [account] = useState(() => getActiveAccount());

  useEffect(() => {
    const active = getActiveAccount();
    if (active === null) return;
    fetchMyRooms(active)
      .then((result) => {
        if (result.ok) setRooms(result.value);
      })
      .catch(() => setRooms([]));
  }, []);

  const visible = useMemo(() => filterRooms(rooms, query), [rooms, query]);

  return (
    <View style={styles.root}>
      <AppHeader
        onAvatarPress={() => router.push('/reglages')}
        testID="home-header"
        title={t('home.title')}
        userName={account?.displayName ?? ''}
      />

      <FlatList
        contentContainerStyle={styles.content}
        data={[...visible]}
        keyExtractor={(room) => room.slug}
        ListEmptyComponent={
          rooms.length === 0 ? null : (
            <Text style={styles.noneMatching} testID="room-none-matching">
              {t('home.noneMatching')}
            </Text>
          )
        }
        ListHeaderComponent={
          <View style={styles.header}>
            {/* Les deux cartes du mockup. « Créer » pousse un écran, « Rejoindre »
                ouvre une feuille : le premier porte quatre champs dont les
                co-organisateurs, le second tient en une demi-hauteur. */}
            <ActionCard
              filled
              glyph="video-outline"
              onCardPress={() => router.push('/room/create')}
              subtitle={t('home.createSubtitle')}
              testID="home-create"
              title={t('home.createTitle')}
            />
            <ActionCard
              filled={false}
              glyph="login-variant"
              onCardPress={() => setJoinOpen(true)}
              subtitle={t('home.joinSubtitle')}
              testID="home-join"
              title={t('home.joinTitle')}
            />

            <SectionLabel label={t('home.myRooms')} testID="home-section" />

            {/* Le filtre n'apparaît que s'il sert : sur trois réunions il ne
                ferait qu'occuper l'écran. */}
            {rooms.length > 5 ? (
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setQuery}
                placeholder={t('home.filter')}
                testID="room-filter-input"
                value={query}
              />
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const named = findRoomTitle(item.slug) !== null;
          return (
            <SurfaceCard>
              <Pressable
                onPress={() => router.push(`/room/${item.slug}/prejoin`)}
                style={styles.row}
                testID="room-item"
              >
                <InitialsAvatar
                  name={displayName(item)}
                  size="md"
                  testID={`room-avatar-${item.slug}`}
                />
                <View style={styles.rowText}>
                  <Text
                    numberOfLines={1}
                    style={[styles.rowTitle, named ? null : styles.code]}
                    testID={`room-title-${item.slug}`}
                  >
                    {displayName(item)}
                  </Text>
                  {/* Un code n'est pas un nom : le dire évite de faire passer
                      une référence technique pour l'intitulé d'une réunion. */}
                  {named ? null : (
                    <Text style={styles.rowMeta} testID={`room-unnamed-${item.slug}`}>
                      {t('home.unnamed')}
                    </Text>
                  )}
                </View>
              </Pressable>
            </SurfaceCard>
          );
        }}
      />

      <JoinSheet
        onJoinRoom={(slug) => {
          setJoinOpen(false);
          router.push(`/room/${slug}/prejoin`);
        }}
        onSheetDismiss={() => setJoinOpen(false)}
        testID="home-join-sheet"
        visible={joinOpen}
      />
    </View>
  );
}
