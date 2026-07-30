import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';
import { Button, List, Text, TextInput } from 'react-native-paper';

import { fetchMyRooms } from 'src/api/rooms';
import { getActiveAccount } from 'src/auth/accounts';
import type { Room } from 'src/call/types';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  root: { flex: 1, padding: tokens.spacing.md, gap: tokens.spacing.md },
  joinRow: { flexDirection: 'row', gap: tokens.spacing.sm, alignItems: 'center' },
  joinInput: { flex: 1 },
});

// expo-router requires a default export for every file under app/.
export default function HomeScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const [rooms, setRooms] = useState<readonly Room[]>([]);
  const [code, setCode] = useState('');

  useEffect(() => {
    const account = getActiveAccount();
    if (account === null) return;
    fetchMyRooms(account)
      .then((result) => {
        if (result.ok) setRooms(result.value);
      })
      .catch(() => setRooms([]));
  }, []);

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
      <FlatList
        data={[...rooms]}
        keyExtractor={(room) => room.slug}
        renderItem={({ item }) => (
          <List.Item
            testID="room-item"
            title={item.name}
            onPress={() => router.push(`/room/${item.slug}/prejoin`)}
          />
        )}
      />
    </View>
  );
}
