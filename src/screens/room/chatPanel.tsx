import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';
import { IconButton, Text, TextInput } from 'react-native-paper';

import {
  CHAT_MAX_LENGTH,
  messageKey,
  normaliseBody,
  startsGroup,
  type ChatMessage,
} from 'src/call/chat';
import type { ChatSnapshot } from 'src/call/chatStore';
import {
  BAR_HIT_SLOP,
  BAR_ICON_COLOR,
  BAR_RIPPLE_COLOR,
  barStyles,
} from 'src/screens/room/controlBar';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  // Aucun fond propre : le panneau hérite du `backgroundDark` que `call.tsx`
  // force sur `styles.root` dans les deux schémas, comme `ParticipantsPanel`.
  // Poser un fond sans en tirer les conséquences sur le texte est le pire des
  // trois cas.
  root: { flex: 1, padding: tokens.spacing.md, gap: tokens.spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  log: { flex: 1 },
  row: { paddingVertical: tokens.spacing.xs },
  composer: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  // La zone de saisie est la SEULE surface propre de ce panneau : elle porte
  // donc son fond ET ses quatre couleurs (voir les props ci-dessous).
  input: { flex: 1, backgroundColor: tokens.color.surfaceDark },
  // Sans cette couleur explicite, chaque libellé retombe sur
  // `theme.colors.onSurface`, qui suit le schéma système — quasi-noir sur un
  // fond forcé sombre. 16,65:1 avec.
  text: { color: tokens.color.textDark },
});

type Row = {
  readonly message: ChatMessage;
  readonly header: boolean;
};

type RowProps = {
  readonly row: Row;
};

// Une ligne, un message. L'en-tête d'auteur n'apparaît qu'en tête de groupe :
// c'est `startsGroup` qui le décide, à partir du fil dans son ordre réel — et
// non de l'ordre inversé dans lequel la liste le rend.
function ChatRow({ row }: RowProps): React.ReactElement {
  const { t } = useTranslation();
  const key = messageKey(row.message);
  const name = row.message.name.trim();

  return (
    <View testID={`chat-message-${key}`} style={styles.row}>
      {row.header ? (
        // Secondaire par la TAILLE, jamais par un gris : `tokens.color.muted`
        // donne 4,07:1 sur ce fond, sous le seuil AA de 4,5:1.
        <Text testID={`chat-author-${key}`} variant="labelSmall" style={styles.text}>
          {name.length > 0 ? name : t('call.unnamedParticipant')}
        </Text>
      ) : null}
      <Text testID={`chat-body-${key}`} style={styles.text}>
        {row.message.body}
      </Text>
    </View>
  );
}

export type ChatPanelProps = {
  readonly chat: ChatSnapshot;
  // Rend `true` quand le message est parti. §6.8 la déclare `void`, mais §7.7
  // exige que la zone de saisie NE SOIT PAS vidée sur échec : avec un rappel
  // `void`, la coquille ne peut pas savoir. La valeur existe déjà côté
  // magasin ; il suffit de ne pas la jeter en route.
  readonly onSend: (body: string) => Promise<boolean>;
  readonly onClose: () => void;
};

// Coquille : elle reçoit un instantané et deux rappels, elle ne va rien
// chercher elle-même et ne connaît RIEN de son hôte — ni sa hauteur, ni sa
// position, ni le clavier. Elle se pose dans une boîte `flex: 1`.
export function ChatPanel({ chat, onSend, onClose }: ChatPanelProps): React.ReactElement {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  // Une requête en vol, jamais un état désiré. Garde par VALEUR : `disabled`
  // est interdit sur cet écran, Paper le teste avant toute couleur explicite.
  const [sending, setSending] = useState(false);

  // Construites dans l'ordre du fil — celui que `startsGroup` attend — puis
  // renversées une fois pour la liste `inverted`, qui rend l'index 0 en bas.
  // C'est ce qui garde le message le plus récent visible sans un seul
  // `scrollToEnd` impératif, appel qu'aucun test ne pourrait exercer.
  const rows = useMemo<readonly Row[]>(
    () =>
      chat.log
        .map((message, index) => ({ message, header: startsGroup(chat.log, index) }))
        .reverse(),
    [chat.log],
  );

  const handleSend = (): void => {
    if (sending) return;
    const body = normaliseBody(draft);
    if (body === null) return;

    setSending(true);
    onSend(body)
      .then((ok) => {
        setSending(false);
        // Vidée seulement sur succès : un message perdu qu'on doit retaper est
        // une deuxième punition pour une panne de réseau.
        if (ok) setDraft('');
      })
      .catch(() => setSending(false));
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text testID="chat-title" variant="titleMedium" style={styles.text}>
          {t('chat.title')}
        </Text>
        {/* Le point d'entrée est une ligne de feuille, pas une bascule de
            barre : ce panneau porte donc sa propre sortie, atteignable en un
            appui, clavier ouvert compris. */}
        <IconButton
          testID="chat-close"
          icon="close"
          iconColor={BAR_ICON_COLOR}
          rippleColor={BAR_RIPPLE_COLOR}
          style={barStyles.button}
          hitSlop={BAR_HIT_SLOP}
          onPress={onClose}
          accessibilityLabel={t('chat.close')}
        />
      </View>

      {/* Permanente, hors de la liste : c'est la vérité du transport, et une
          interface qui ne la dit pas ment par omission. Une `FlatList`
          inversée la poserait en bas. */}
      <Text testID="chat-not-kept" variant="labelSmall" style={styles.text}>
        {t('chat.notKept')}
      </Text>

      {rows.length === 0 ? (
        <Text testID="chat-empty" style={[styles.log, styles.text]}>
          {t('chat.empty')}
        </Text>
      ) : (
        <FlatList
          testID="chat-log"
          inverted
          style={styles.log}
          data={rows}
          keyExtractor={(row) => messageKey(row.message)}
          renderItem={({ item }) => <ChatRow row={item} />}
        />
      )}

      <View style={styles.composer}>
        <TextInput
          testID="chat-input"
          mode="outlined"
          multiline
          value={draft}
          onChangeText={setDraft}
          placeholder={t('chat.placeholder')}
          maxLength={CHAT_MAX_LENGTH}
          style={styles.input}
          // Les quatre couleurs, parce que le fond est forcé juste au-dessus.
          // Le liseré est le seul à ne pas venir de `textDark` : ce n'est pas
          // du texte, et le seuil applicable est celui des objets graphiques.
          textColor={tokens.color.textDark}
          placeholderTextColor={tokens.color.textDark}
          outlineColor={tokens.color.muted}
          activeOutlineColor={tokens.color.primaryDark}
        />
        <IconButton
          testID="chat-send"
          icon="send"
          iconColor={BAR_ICON_COLOR}
          rippleColor={BAR_RIPPLE_COLOR}
          style={barStyles.button}
          hitSlop={BAR_HIT_SLOP}
          onPress={handleSend}
          accessibilityLabel={t('chat.send')}
        />
      </View>
    </View>
  );
}
