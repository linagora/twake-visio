import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getActiveAccount } from 'src/auth/accounts';
import { instanceLabel } from 'src/instance/label';
import { signOut } from 'src/auth/login';
import type { AccessLevel } from 'src/call/types';
import { chooseLanguage } from 'src/i18n';
import { SUPPORTED_LOCALES, type SupportedLocale } from 'src/i18n/supported';
import { readPreferences, writePreference } from 'src/settings/preferences';
import { AppHeader } from 'src/ui/appHeader';
import { InitialsAvatar } from 'src/ui/initialsAvatar';
import { SectionLabel } from 'src/ui/sectionLabel';
import { SettingRow, type SettingOption } from 'src/ui/settingRow';
import { SurfaceCard } from 'src/ui/surfaceCard';
import { tokens } from 'src/ui/tokens';

// « suivre le système » n'est pas une locale : elle a besoin d'un identifiant
// à elle, distinct des sept, pour que la rangée puisse la cocher.
const SYSTEM_LANGUAGE = 'system';

const ACCESS_LEVELS: readonly AccessLevel[] = ['public', 'trusted', 'restricted'];

const ACCESS_LABEL_KEY: Readonly<Record<AccessLevel, string>> = {
  public: 'settings.options.accessPublic',
  trusted: 'settings.options.accessTrusted',
  restricted: 'settings.options.accessRestricted',
};

export function ReglagesScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  // Une seule rangée dépliée à la fois. L'état vit ICI et non dans chaque
  // `SettingRow` : une rangée ne peut pas savoir qu'une autre vient de s'ouvrir.
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [preferences, setPreferences] = useState(() => readPreferences());

  const account = getActiveAccount();

  function toggleRow(row: string): void {
    setOpenRow((current) => (current === row ? null : row));
  }

  // Écrit, relit, et referme. Les trois, à chaque choix : sans la relecture
  // l'écran afficherait encore l'ancienne valeur, sans la fermeture la feuille
  // resterait ouverte sous le doigt.
  function pick<K extends keyof ReturnType<typeof readPreferences>>(
    key: K,
    value: ReturnType<typeof readPreferences>[K],
  ): void {
    writePreference(key, value);
    setPreferences(readPreferences());
    setOpenRow(null);
  }

  const onOff: readonly SettingOption[] = [
    { id: 'off', label: t('settings.options.micOff') },
    { id: 'on', label: t('settings.options.micOn') },
  ];
  const camOnOff: readonly SettingOption[] = [
    { id: 'off', label: t('settings.options.camOff') },
    { id: 'on', label: t('settings.options.camOn') },
  ];
  const accessOptions: readonly SettingOption[] = ACCESS_LEVELS.map((level) => ({
    id: level,
    label: t(ACCESS_LABEL_KEY[level]),
  }));
  const languageOptions: readonly SettingOption[] = [
    { id: SYSTEM_LANGUAGE, label: t('settings.options.languageSystem') },
    ...SUPPORTED_LOCALES.map((locale) => ({
      id: locale,
      label: t(`settings.languages.${locale}`),
    })),
  ];

  const languageId = preferences.language ?? SYSTEM_LANGUAGE;
  const languageLabel = languageOptions.find((option) => option.id === languageId)?.label ?? '';

  // L'encart HAUT n'est PAS ici : il appartient à l'en-tête, seule surface qui
  // borde ce bord et qui porte sa propre couleur. Posé sur cette racine, la
  // bande d'état prenait le gris de la page sous un en-tête blanc.
  return (
    <View style={styles.root} testID="reglages-screen">
      <AppHeader
        onAvatarPress={() => setOpenRow(null)}
        testID="settings-header"
        title={t('tabs.settings')}
        userName={account?.displayName ?? ''}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <SurfaceCard testID="settings-profile">
          <View style={styles.profile}>
            <InitialsAvatar name={account?.displayName ?? ''} size="lg" testID="settings-avatar" />
            <View style={styles.profileText}>
              <Text style={styles.profileName} testID="settings-name">
                {account?.displayName ?? ''}
              </Text>
              <Text numberOfLines={1} style={styles.profileEmail} testID="settings-email">
                {account?.email ?? ''}
              </Text>
              {/* L'HÔTE, et pas seulement l'adresse. Sur deux instances d'une
                  même organisation la personne porte souvent la MÊME adresse —
                  mesuré, un annuaire de développement dont le `mail` est celui
                  de production. Sans cette ligne, rien à l'écran ne dit où l'on
                  est. Elle vivait sur l'accueil ; le Lot 2 l'a suivie ici, où
                  le mockup met l'identité. */}
              {account === null ? null : (
                <Text numberOfLines={1} style={styles.profileInstance} testID="settings-instance">
                  {instanceLabel(account.instance.serverUrl)}
                </Text>
              )}
            </View>
          </View>
        </SurfaceCard>

        <View style={styles.group}>
          <SectionLabel label={t('settings.groups.av')} testID="settings-group-av" />
          <SurfaceCard>
            <SettingRow
              currentLabel={preferences.micOffOnJoin ? onOff[0]!.label : onOff[1]!.label}
              hint={t('settings.rows.micOnJoinHint')}
              label={t('settings.rows.micOnJoin')}
              onOptionPress={(id) => pick('micOffOnJoin', id === 'off')}
              onRowPress={() => toggleRow('micOnJoin')}
              open={openRow === 'micOnJoin'}
              options={onOff}
              selectedId={preferences.micOffOnJoin ? 'off' : 'on'}
              testID="setting-micOnJoin"
            />
            <SettingRow
              currentLabel={preferences.cameraOffOnJoin ? camOnOff[0]!.label : camOnOff[1]!.label}
              label={t('settings.rows.camOnJoin')}
              onOptionPress={(id) => pick('cameraOffOnJoin', id === 'off')}
              onRowPress={() => toggleRow('camOnJoin')}
              open={openRow === 'camOnJoin'}
              options={camOnOff}
              selectedId={preferences.cameraOffOnJoin ? 'off' : 'on'}
              testID="setting-camOnJoin"
            />
          </SurfaceCard>
        </View>

        <View style={styles.group}>
          <SectionLabel label={t('settings.groups.rooms')} testID="settings-group-rooms" />
          <SurfaceCard>
            <SettingRow
              currentLabel={t(ACCESS_LABEL_KEY[preferences.defaultAccessLevel])}
              hint={t('settings.rows.defaultAccessHint')}
              label={t('settings.rows.defaultAccess')}
              onOptionPress={(id) => pick('defaultAccessLevel', id as AccessLevel)}
              onRowPress={() => toggleRow('defaultAccess')}
              open={openRow === 'defaultAccess'}
              options={accessOptions}
              selectedId={preferences.defaultAccessLevel}
              testID="setting-defaultAccess"
            />
          </SurfaceCard>
        </View>

        <View style={styles.group}>
          <SectionLabel label={t('settings.groups.language')} testID="settings-group-language" />
          <SurfaceCard>
            <SettingRow
              currentLabel={languageLabel}
              hint={t('settings.rows.languageHint')}
              label={t('settings.rows.language')}
              onOptionPress={(id) => {
                // `chooseLanguage` écrit la préférence ET rebascule i18next.
                // On ne passe donc pas par `pick`, qui n'écrirait que le
                // magasin et laisserait l'interface dans l'ancienne langue.
                void chooseLanguage(id === SYSTEM_LANGUAGE ? null : (id as SupportedLocale));
                setPreferences(readPreferences());
                setOpenRow(null);
              }}
              onRowPress={() => toggleRow('language')}
              open={openRow === 'language'}
              options={languageOptions}
              selectedId={languageId}
              testID="setting-language"
            />
          </SurfaceCard>
        </View>

        <SurfaceCard>
          <Pressable
            onPress={() => {
              void signOut().then(() => router.replace('/welcome'));
            }}
            style={styles.signOut}
            testID="settings-signout-btn"
          >
            <Text style={styles.signOutLabel} testID="settings-signout">
              {t('settings.signOut')}
            </Text>
          </Pressable>
        </SurfaceCard>

        <Text style={styles.version} testID="settings-version">
          {t('settings.version')}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18, padding: 18 },
  group: { gap: 9 },
  profile: { alignItems: 'center', flexDirection: 'row', gap: 14, padding: 18 },
  profileEmail: {
    color: tokens.color.textMeta,
    fontFamily: tokens.font.medium,
    fontSize: 13,
  },
  profileInstance: {
    color: tokens.color.textSectionLabel,
    fontFamily: tokens.font.medium,
    fontSize: 12,
  },
  profileName: {
    color: tokens.color.textPrimary,
    fontFamily: tokens.font.extraBold,
    fontSize: 17,
  },
  profileText: { flex: 1, gap: 4 },
  root: { backgroundColor: tokens.color.appBackground, flex: 1 },
  signOut: { justifyContent: 'center', minHeight: 52, paddingHorizontal: 16 },
  signOutLabel: {
    color: tokens.color.danger,
    fontFamily: tokens.font.bold,
    fontSize: 15,
  },
  version: {
    color: tokens.color.textFooter,
    fontFamily: tokens.font.medium,
    fontSize: 12,
    textAlign: 'center',
  },
});
