import * as Clipboard from 'expo-clipboard';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { listKnownHosts } from 'src/instance/knownInstances';
import { parseMeetingLink } from 'src/navigation/deepLinks';
import {
  CODE_GROUPS,
  formatCodeSlug,
  isCompleteCode,
  normalizeCodeInput,
} from 'src/rooms/roomCodeEntry';
import { FormSheet } from 'src/ui/formSheet';
import { tokens } from 'src/ui/tokens';

type Props = {
  readonly visible: boolean;
  readonly onSheetDismiss: () => void;
  // Remonte le SLUG, pas une route : la navigation appartient à l'appelant,
  // qui sait d'où il vient. Cette feuille ne connaît pas expo-router.
  readonly onJoinRoom: (slug: string) => void;
  readonly testID: string;
};

// Les index de fin de groupe, pour savoir où poser un séparateur. Dérivés de
// `CODE_GROUPS` plutôt que recopiés : deux constantes à tenir d'accord seraient
// une de trop.
const SEPARATOR_AFTER = CODE_GROUPS.reduce<readonly number[]>((marks, size) => {
  const previous = marks[marks.length - 1] ?? 0;
  return [...marks, previous + size];
}, []).slice(0, -1);

const TOTAL_CELLS = CODE_GROUPS.reduce((total, size) => total + size, 0);

export function JoinSheet({
  visible,
  onSheetDismiss,
  onJoinRoom,
  testID,
}: Props): React.ReactElement {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [pasteFailed, setPasteFailed] = useState(false);
  const inputRef = useRef<TextInput>(null);

  function handleChange(raw: string): void {
    setCode(normalizeCodeInput(raw));
    setPasteFailed(false);
  }

  async function handlePaste(): Promise<void> {
    const clip = await Clipboard.getStringAsync();
    // La MÊME allowlist que celle des liens profonds. Sans elle, n'importe quel
    // site collé ferait ouvrir un salon d'une instance étrangère.
    const slug = parseMeetingLink(clip, listKnownHosts());
    if (slug === null) {
      setPasteFailed(true);
      return;
    }
    setCode(normalizeCodeInput(slug));
    setPasteFailed(false);
  }

  function handleSubmit(): void {
    const slug = formatCodeSlug(code);
    if (slug !== null) onJoinRoom(slug);
  }

  return (
    <FormSheet
      onSheetDismiss={onSheetDismiss}
      testID={testID}
      title={t('join.title')}
      visible={visible}
    >
      <Text style={styles.instructions} testID={`${testID}-instructions`}>
        {t('join.instructions')}
      </Text>

      {/* La saisie réelle est un `TextInput` TRANSPARENT superposé aux cases —
          la technique du mockup. Elle donne un curseur système et une seule
          source de vérité, là où dix champs demanderaient de synchroniser dix
          états et de gérer le recul entre eux. */}
      <Pressable onPress={() => inputRef.current?.focus()} style={styles.cellsWrapper}>
        <View style={styles.cells}>
          {Array.from({ length: TOTAL_CELLS }, (_, index) => (
            <React.Fragment key={index}>
              <View style={[styles.cell, index < code.length ? styles.cellFilled : null]}>
                <Text style={styles.cellText} testID={`${testID}-cell-${index}`}>
                  {code[index] ?? ''}
                </Text>
              </View>
              {SEPARATOR_AFTER.includes(index + 1) ? <View style={styles.separator} /> : null}
            </React.Fragment>
          ))}
        </View>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={handleChange}
          ref={inputRef}
          style={styles.hiddenInput}
          testID={`${testID}-input`}
          value={code}
        />
      </Pressable>

      <Text style={styles.hint} testID={`${testID}-hint`}>
        {t('join.hint')}
      </Text>

      <Pressable onPress={handlePaste} style={styles.paste} testID={`${testID}-paste`}>
        <Text style={styles.pasteLabel}>{t('join.paste')}</Text>
      </Pressable>

      {pasteFailed ? (
        <Text style={styles.error} testID={`${testID}-paste-error`}>
          {t('join.pasteFailed')}
        </Text>
      ) : null}

      {/* Le mockup GRISE ce bouton tant que le code est incomplet. On ne le rend
          pas du tout : une commande morte sort ainsi de l'arbre
          d'accessibilité, et c'est la forme que ce dépôt a retenue ailleurs. */}
      {isCompleteCode(code) ? (
        <Pressable onPress={handleSubmit} style={styles.submit} testID={`${testID}-submit`}>
          <Text style={styles.submitLabel}>{t('join.submit')}</Text>
        </Pressable>
      ) : null}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  cell: {
    alignItems: 'center',
    borderColor: tokens.color.fieldBorder,
    borderRadius: 11,
    borderWidth: 1,
    flex: 1,
    height: 52,
    justifyContent: 'center',
  },
  cellFilled: {
    backgroundColor: tokens.color.brandWash,
    borderColor: tokens.color.brand,
  },
  cellText: {
    color: tokens.color.textPrimary,
    fontFamily: tokens.font.extraBold,
    fontSize: 19,
  },
  cells: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  cellsWrapper: { position: 'relative' },
  error: { color: tokens.color.danger, fontFamily: tokens.font.semiBold, fontSize: 13 },
  // Transparent et superposé : il capte la frappe, les cases affichent.
  hiddenInput: {
    bottom: 0,
    left: 0,
    opacity: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  hint: {
    color: tokens.color.textSectionLabel,
    fontFamily: tokens.font.semiBold,
    fontSize: 12.5,
  },
  instructions: {
    color: tokens.color.textSecondary,
    fontFamily: tokens.font.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  paste: {
    alignItems: 'center',
    borderColor: tokens.color.fieldBorder,
    borderRadius: 14,
    borderWidth: 1,
    height: 50,
    justifyContent: 'center',
  },
  pasteLabel: {
    color: tokens.color.textPrimary,
    fontFamily: tokens.font.bold,
    fontSize: 14.5,
  },
  separator: {
    backgroundColor: tokens.color.textChevron,
    borderRadius: 2,
    height: 2,
    width: 9,
  },
  submit: {
    alignItems: 'center',
    backgroundColor: tokens.color.brandStrong,
    borderRadius: 16,
    height: 56,
    justifyContent: 'center',
  },
  submitLabel: {
    color: tokens.color.onBrand,
    fontFamily: tokens.font.extraBold,
    fontSize: 16,
  },
});
