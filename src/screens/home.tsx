import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';
import { Button, List, Text, TextInput } from 'react-native-paper';

import { fetchMyRooms } from 'src/api/rooms';
import { getActiveAccount } from 'src/auth/accounts';
import { findRoomTitle } from 'src/rooms/titles';
import type { Room } from 'src/call/types';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  root: { flex: 1, padding: tokens.spacing.md, gap: tokens.spacing.md },
  joinRow: { flexDirection: 'row', gap: tokens.spacing.sm, alignItems: 'center' },
  joinInput: { flex: 1 },
  code: { fontVariant: ['tabular-nums'] },
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
  const [code, setCode] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const account = getActiveAccount();
    if (account === null) return;
    fetchMyRooms(account)
      .then((result) => {
        if (result.ok) setRooms(result.value);
      })
      .catch(() => setRooms([]));
  }, []);

  const visible = useMemo(() => filterRooms(rooms, query), [rooms, query]);

  const handleJoin = (): void => {
    if (code.trim().length > 0) router.push(`/room/${code.trim()}/prejoin`);
  };

  const handleCreate = (): void => {
    router.push('/room/create');
  };

  return (
    <View style={styles.root}>
      <View style={styles.joinRow}>
        <TextInput
          testID="join-code-input"
          style={styles.joinInput}
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
          placeholder={t('home.join')}
        />
        <Button mode="contained" testID="join-btn" onPress={handleJoin}>
          {t('home.join')}
        </Button>
      </View>

      <Button mode="outlined" testID="create-room-btn" onPress={handleCreate}>
        {t('home.create')}
      </Button>

      <Text variant="titleMedium">{t('home.myRooms')}</Text>

      {/* Le filtre n'apparaît que s'il sert : sur trois réunions il ne ferait
          qu'occuper l'écran. */}
      {rooms.length > 5 ? (
        <TextInput
          testID="room-filter-input"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={t('home.filter')}
        />
      ) : null}

      <FlatList
        data={[...visible]}
        keyExtractor={(room) => room.slug}
        ListEmptyComponent={
          rooms.length === 0 ? null : (
            <Text testID="room-none-matching">{t('home.noneMatching')}</Text>
          )
        }
        renderItem={({ item }) => (
          <List.Item
            testID="room-item"
            title={displayName(item)}
            titleStyle={findRoomTitle(item.slug) === null ? styles.code : undefined}
            // Un code n'est pas un nom : le dire évite de faire passer une
            // référence technique pour l'intitulé d'une réunion.
            description={findRoomTitle(item.slug) === null ? t('home.unnamed') : undefined}
            onPress={() => router.push(`/room/${item.slug}/prejoin`)}
          />
        )}
      />
    </View>
  );
}
