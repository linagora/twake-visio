import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, HelperText, RadioButton, Text, TextInput } from 'react-native-paper';

import { createRoom, grantRoomAccess } from 'src/api/rooms';
import type { ApiError } from 'src/api/types';
import { searchUsers, type Me } from 'src/api/users';
import { getActiveAccount } from 'src/auth/accounts';
import { rememberRoomTitle } from 'src/rooms/titles';
import { readPreferences } from 'src/settings/preferences';
import type { AccessLevel } from 'src/call/types';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  root: { padding: tokens.spacing.md, gap: tokens.spacing.md },
  option: { gap: tokens.spacing.xs },
});

const ACCESS_LEVELS = ['public', 'trusted', 'restricted'] as const;

// Chaque niveau est énoncé par sa conséquence, jamais par son seul nom : « trusted »
// ne dit pas à l'organisateur que ses invités externes resteront à la porte.
const ACCESS_COPY: Readonly<Record<AccessLevel, string>> = {
  public: 'room.accessPublic',
  trusted: 'room.accessTrusted',
  restricted: 'room.accessRestricted',
};

type FailureKey = 'error.network' | 'error.unauthorized' | 'room.nameTaken' | 'room.createFailed';

// Un refus d'autorisation demande une action de la personne, les autres non :
// les confondre lui dirait de se reconnecter alors que le serveur a répondu 500.
//
// Le cas qui compte ici est le nom déjà pris. L'API dérive le slug du nom et
// refuse les doublons — « Room with this Slug already exists » sur un 400 — et
// c'est la seule erreur de création que l'utilisateur peut lever lui-même. La
// lui présenter comme un échec générique l'invite à réessayer à l'identique,
// ce qui échouera toujours.
function toFailure(error: ApiError): FailureKey {
  if (error.kind === 'unauthorized') return 'error.unauthorized';
  if (error.kind === 'network') return 'error.network';
  if (error.kind === 'validation' && error.fields.slug !== undefined) return 'room.nameTaken';
  return 'room.createFailed';
}

function isAccessLevel(value: string): value is AccessLevel {
  return ACCESS_LEVELS.some((level) => level === value);
}

export function CreateRoomScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const [name, setName] = useState('');
  // Le défaut vient des Réglages, dont la valeur d'usine est `public` — pas le
  // `trusted` du mockup, qui casse l'exigence produit pour les invités
  // externes. Voir `DEFAULT_PREFERENCES`.
  const [accessLevel, setAccessLevel] = useState<AccessLevel>(
    () => readPreferences().defaultAccessLevel,
  );
  const [coOwnerQuery, setCoOwnerQuery] = useState('');
  const [candidates, setCandidates] = useState<readonly Me[]>([]);
  const [coOwners, setCoOwners] = useState<readonly Me[]>([]);
  const [failure, setFailure] = useState<FailureKey | 'room.nameRequired' | null>(null);
  const [busy, setBusy] = useState(false);

  const handleAccessLevelChange = (value: string): void => {
    if (isAccessLevel(value)) setAccessLevel(value);
  };

  const handleSearch = async (): Promise<void> => {
    const account = getActiveAccount();
    if (account === null || coOwnerQuery.trim().length === 0) return;
    const result = await searchUsers(account, coOwnerQuery.trim());
    setCandidates(result.ok ? result.value : []);
  };

  const handleAddCoOwner = (user: Me): void => {
    setCoOwners((current) =>
      current.some((selected) => selected.id === user.id) ? current : [...current, user],
    );
    setCandidates([]);
    setCoOwnerQuery('');
  };

  const handleSubmit = async (): Promise<void> => {
    const account = getActiveAccount();
    if (account === null) {
      setFailure('error.unauthorized');
      return;
    }
    if (name.trim().length === 0) {
      setFailure('room.nameRequired');
      return;
    }

    setFailure(null);
    setBusy(true);
    let result;
    try {
      result = await createRoom(account, { name: name.trim(), accessLevel });
    } catch (err: unknown) {
      // Le rejet d'un fetch n'était pas rattrapé : l'appui restait sans effet
      // visible, ce qui se lit comme un bouton mort.
      console.error('[create] createRoom a rejeté', err);
      setFailure('error.network');
      setBusy(false);
      return;
    }
    setBusy(false);

    if (!result.ok) {
      // Signalé en clair : sans cette trace, la seule information disponible
      // était « rien ne se passe », qui ne dit pas laquelle des six erreurs
      // possibles s'est produite.
      console.error('[create] createRoom a échoué', result.error);
      setFailure(toFailure(result.error));
      return;
    }

    // L'intitulé saisi ne peut pas vivre côté serveur : le nom porte le code.
    // On le garde sur l'appareil, faute de mieux, et l'écran d'accueil le
    // résout pour les réunions créées ici.
    rememberRoomTitle(result.value.slug, name);

    // perform_create n'attribue owner qu'au créateur. Sans ces appels, la
    // personne pour qui la réunion est organisée n'a aucun droit de modération.
    const roomId = result.value.id;
    if (roomId !== null) {
      for (const owner of coOwners) {
        await grantRoomAccess(account, roomId, owner.id, 'owner');
      }
    }

    router.replace(`/room/${result.value.slug}/prejoin`);
  };

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <TextInput
        testID="room-name-input"
        label={t('room.name')}
        value={name}
        onChangeText={setName}
      />

      <RadioButton.Group value={accessLevel} onValueChange={handleAccessLevelChange}>
        {ACCESS_LEVELS.map((level) => (
          <View key={level} style={styles.option}>
            <RadioButton.Item
              testID={`access-${level}`}
              label={t(ACCESS_COPY[level])}
              value={level}
            />
          </View>
        ))}
      </RadioButton.Group>

      {accessLevel !== 'public' ? (
        <HelperText type="info" testID="moderator-warning" visible>
          {t('lobby.noModerator')}
        </HelperText>
      ) : null}

      <Text variant="labelLarge">{t('room.coOwners')}</Text>
      <TextInput
        testID="co-owner-input"
        label={t('room.coOwnerSearch')}
        value={coOwnerQuery}
        onChangeText={setCoOwnerQuery}
        autoCapitalize="none"
        keyboardType="email-address"
        onSubmitEditing={handleSearch}
      />

      {candidates.map((user) => (
        <Button
          key={user.id}
          testID="co-owner-candidate"
          mode="text"
          onPress={() => handleAddCoOwner(user)}
        >
          {user.email}
        </Button>
      ))}

      {coOwners.map((user) => (
        <Text key={user.id} testID="co-owner-selected">
          {user.email}
        </Text>
      ))}

      <HelperText type="error" visible={failure !== null} testID="create-error">
        {failure === null ? '' : t(failure)}
      </HelperText>

      <Button
        mode="contained"
        testID="submit-btn"
        onPress={handleSubmit}
        loading={busy}
        disabled={busy}
      >
        {t('home.create')}
      </Button>
    </ScrollView>
  );
}
