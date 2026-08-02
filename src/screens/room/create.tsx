import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, HelperText, TextInput } from 'react-native-paper';

import { createRoom, grantRoomAccess } from 'src/api/rooms';
import type { ApiError } from 'src/api/types';
import { searchUsers, type Me } from 'src/api/users';
import { getActiveAccount } from 'src/auth/accounts';
import { rememberRoomTitle } from 'src/rooms/titles';
import { readPreferences } from 'src/settings/preferences';
import type { AccessLevel } from 'src/call/types';
import { SectionLabel } from 'src/ui/sectionLabel';
import { SurfaceCard } from 'src/ui/surfaceCard';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  candidate: { paddingVertical: 4 },
  dot: {
    alignItems: 'center',
    borderColor: tokens.color.textChevron,
    borderRadius: 10,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    marginTop: 1,
    width: 20,
  },
  dotFill: { borderRadius: 5, height: 10, width: 10 },
  dotSelected: { borderColor: tokens.color.brand },
  group: { gap: 9 },
  option: {
    alignItems: 'flex-start',
    borderColor: tokens.color.fieldBorder,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    padding: 14,
  },
  optionDesc: {
    color: tokens.color.textMeta,
    fontFamily: tokens.font.medium,
    fontSize: 12,
    lineHeight: 17,
  },
  optionSelected: {
    backgroundColor: tokens.color.brandWash,
    borderColor: tokens.color.brand,
  },
  optionText: { flex: 1, gap: 2 },
  optionTitle: {
    color: tokens.color.textPrimary,
    fontFamily: tokens.font.bold,
    fontSize: 14.5,
  },
  root: {
    backgroundColor: tokens.color.appBackground,
    gap: 18,
    padding: 18,
  },
  selected: {
    color: tokens.color.textPrimary,
    fontFamily: tokens.font.semiBold,
    fontSize: 14,
    paddingVertical: 4,
  },
  submit: { borderRadius: 16 },
});

// Le nom COURT du niveau, ajouté au Lot 1 pour l'écran Réglages. Les libellés
// de `ACCESS_COPY` disent la conséquence — « Seules les personnes authentifiées
// entrent directement » — et deviennent donc la description, pas le titre.
const ACCESS_NAME: Readonly<Record<AccessLevel, string>> = {
  public: 'settings.options.accessPublic',
  trusted: 'settings.options.accessTrusted',
  restricted: 'settings.options.accessRestricted',
};

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
      <View style={styles.group}>
        <SectionLabel label={t('room.name')} testID="create-name-label" />
        <TextInput
          label={t('room.name')}
          onChangeText={setName}
          testID="room-name-input"
          value={name}
        />
      </View>

      <View style={styles.group}>
        <SectionLabel label={t('settings.rows.defaultAccess')} testID="create-access-label" />
        {/* `Pressable` plutôt qu'un `RadioButton.Item`, mais avec sa SÉMANTIQUE :
            `accessibilityRole="radio"` et `accessibilityState.checked`. C'est ce
            que `toBeChecked()` observe, et c'est aussi ce qu'un lecteur d'écran
            annonce — un `Pressable` nu perdrait les deux. */}
        {ACCESS_LEVELS.map((level) => {
          const selected = accessLevel === level;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              key={level}
              onPress={() => handleAccessLevelChange(level)}
              style={[styles.option, selected ? styles.optionSelected : null]}
              testID={`access-${level}`}
            >
              <View style={[styles.dot, selected ? styles.dotSelected : null]}>
                {selected ? (
                  <View style={[styles.dotFill, { backgroundColor: tokens.color.brand }]} />
                ) : null}
              </View>
              <View style={styles.optionText}>
                <Text style={styles.optionTitle} testID={`access-${level}-title`}>
                  {t(ACCESS_NAME[level])}
                </Text>
                {/* La CONSÉQUENCE, jamais le seul nom : « trusted » ne dit pas à
                    l'organisateur que ses invités externes resteront à la porte. */}
                <Text style={styles.optionDesc} testID={`access-${level}-desc`}>
                  {t(ACCESS_COPY[level])}
                </Text>
              </View>
            </Pressable>
          );
        })}

        {accessLevel !== 'public' ? (
          <HelperText type="info" testID="moderator-warning" visible>
            {t('lobby.noModerator')}
          </HelperText>
        ) : null}
      </View>

      {/* Les co-organisateurs restent ICI, et c'est la raison pour laquelle cet
          écran n'est pas devenu une feuille : le mockup n'avait prévu que deux
          champs, et transposer sa feuille telle quelle aurait supprimé une
          exigence produit — `perform_create` n'attribue `owner` qu'au créateur. */}
      <View style={styles.group}>
        <SectionLabel label={t('room.coOwners')} testID="create-coowners-label" />
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          label={t('room.coOwnerSearch')}
          onChangeText={setCoOwnerQuery}
          onSubmitEditing={handleSearch}
          testID="co-owner-input"
          value={coOwnerQuery}
        />

        {candidates.length === 0 && coOwners.length === 0 ? null : (
          <SurfaceCard testID="create-coowners-card">
            {candidates.map((user) => (
              <Button
                key={user.id}
                mode="text"
                onPress={() => handleAddCoOwner(user)}
                style={styles.candidate}
                testID="co-owner-candidate"
                textColor={tokens.color.brandStrong}
              >
                {user.email}
              </Button>
            ))}
            {coOwners.map((user) => (
              <Text key={user.id} style={styles.selected} testID="co-owner-selected">
                {user.email}
              </Text>
            ))}
          </SurfaceCard>
        )}
      </View>

      <HelperText type="error" visible={failure !== null} testID="create-error">
        {failure === null ? '' : t(failure)}
      </HelperText>

      <Button
        buttonColor={tokens.color.brandStrong}
        disabled={busy}
        loading={busy}
        mode="contained"
        onPress={handleSubmit}
        style={styles.submit}
        testID="submit-btn"
        textColor={tokens.color.onBrand}
      >
        {t('home.create')}
      </Button>
    </ScrollView>
  );
}
