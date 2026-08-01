import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { CHAT_MAX_LENGTH, type ChatMessage } from 'src/call/chat';
import type { ChatSnapshot } from 'src/call/chatStore';
import { tokens } from 'src/ui/tokens';
import { ChatPanel } from './chatPanel';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 's-1',
    identity: 'u-ada',
    name: 'Ada',
    body: 'bonjour',
    sentAt: 1_000,
    editedAt: null,
    isLocal: false,
    ...overrides,
  };
}

function snapshot(log: readonly ChatMessage[], unread = 0): ChatSnapshot {
  return { log, unread };
}

async function sent(): Promise<boolean> {
  return true;
}

describe('ChatPanel', () => {
  it("dit en permanence que rien n'est conservé, fil vide compris", async () => {
    // Ce n'est pas un état d'erreur ni un état vide : c'est la vérité du
    // transport, et une interface qui ne la dit pas ment par omission.
    await render(<ChatPanel chat={snapshot([])} onSend={sent} onClose={jest.fn()} />);

    expect(screen.getByTestId('chat-not-kept')).toHaveTextContent('chat.notKept');
    expect(screen.getByTestId('chat-empty')).toHaveTextContent('chat.empty');
  });

  it('garde la ligne « pas conservé » quand le fil se remplit', async () => {
    await render(<ChatPanel chat={snapshot([message()])} onSend={sent} onClose={jest.fn()} />);

    expect(screen.getByTestId('chat-not-kept')).toBeTruthy();
    expect(screen.queryByTestId('chat-empty')).toBe(null);
  });

  it('rend chaque message, et vise le second', async () => {
    // Deux messages, et l'assertion porte sur le SECOND : avec un seul, une
    // liste tronquée à son premier élément passerait.
    await render(
      <ChatPanel
        chat={snapshot([
          message({ id: 's-1', body: 'bonjour' }),
          message({ id: 's-2', body: 'la suite' }),
        ])}
        onSend={sent}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByTestId('chat-body-u-ada#s-2')).toHaveTextContent('la suite');
    expect(screen.getByTestId('chat-body-u-ada#s-1')).toHaveTextContent('bonjour');
  });

  it("ouvre un en-tête d'auteur au premier message et pas au suivant", async () => {
    await render(
      <ChatPanel
        chat={snapshot([
          message({ id: 's-1', sentAt: 1_000 }),
          message({ id: 's-2', sentAt: 1_500 }),
        ])}
        onSend={sent}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByTestId('chat-author-u-ada#s-1')).toHaveTextContent('Ada');
    expect(screen.queryByTestId('chat-author-u-ada#s-2')).toBe(null);
  });

  it("rouvre un en-tête quand l'émetteur change", async () => {
    await render(
      <ChatPanel
        chat={snapshot([
          message({ id: 's-1', identity: 'u-ada', name: 'Ada' }),
          message({ id: 's-2', identity: 'u-bob', name: 'Bob', sentAt: 1_500 }),
        ])}
        onSend={sent}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByTestId('chat-author-u-bob#s-2')).toHaveTextContent('Bob');
  });

  it("replie sur le libellé d'anonyme un nom vide, jamais sur l'identité", async () => {
    // Jamais d'identité brute ni de vide à l'écran : les deux se liraient
    // comme un défaut d'affichage plutôt que comme une personne sans nom.
    await render(
      <ChatPanel chat={snapshot([message({ name: '   ' })])} onSend={sent} onClose={jest.fn()} />,
    );

    expect(screen.getByTestId('chat-author-u-ada#s-1')).toHaveTextContent(
      'call.unnamedParticipant',
    );
    expect(screen.queryByText(/u-ada/)).toBe(null);
  });

  it('envoie la saisie normalisée et vide la zone', async () => {
    const onSend = jest.fn(async () => true);
    await render(<ChatPanel chat={snapshot([])} onSend={onSend} onClose={jest.fn()} />);

    await fireEvent.changeText(screen.getByTestId('chat-input'), '  bonjour  ');
    await fireEvent.press(screen.getByTestId('chat-send'));

    expect(onSend).toHaveBeenCalledWith('bonjour');
    await waitFor(() => expect(screen.getByTestId('chat-input').props.value).toBe(''));
  });

  it('garde le texte dans la zone quand l’envoi échoue', async () => {
    // Un message perdu qu'on doit retaper est une deuxième punition pour une
    // panne de réseau. C'est la moitié du traitement d'erreur.
    const onSend = jest.fn(async () => false);
    await render(<ChatPanel chat={snapshot([])} onSend={onSend} onClose={jest.fn()} />);

    await fireEvent.changeText(screen.getByTestId('chat-input'), 'bonjour');
    await fireEvent.press(screen.getByTestId('chat-send'));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('chat-input').props.value).toBe('bonjour');
  });

  it('n’envoie rien sur une saisie de blancs seuls', async () => {
    const onSend = jest.fn(async () => true);
    await render(<ChatPanel chat={snapshot([])} onSend={onSend} onClose={jest.fn()} />);

    await fireEvent.changeText(screen.getByTestId('chat-input'), '   ');
    await fireEvent.press(screen.getByTestId('chat-send'));

    expect(onSend).not.toHaveBeenCalled();
  });

  it('ignore un second appui tant que le premier envoi est en vol', async () => {
    // La garde porte sur une VALEUR, pas sur `disabled` : Paper teste
    // `disabled` avant toute couleur explicite et rend un quasi-noir que rien
    // ne rattrape sur ce fond.
    let release = (): void => undefined;
    const onSend = jest.fn(
      async () =>
        await new Promise<boolean>((resolve) => {
          release = () => resolve(true);
        }),
    );
    await render(<ChatPanel chat={snapshot([])} onSend={onSend} onClose={jest.fn()} />);

    await fireEvent.changeText(screen.getByTestId('chat-input'), 'bonjour');
    await fireEvent.press(screen.getByTestId('chat-send'));
    await fireEvent.press(screen.getByTestId('chat-send'));

    expect(onSend).toHaveBeenCalledTimes(1);
    // Le bouton n'a pas disparu : la garde est une valeur, pas un `disabled`
    // ni un démontage.
    expect(screen.getByTestId('chat-send')).toBeTruthy();
    // Libérée dans un `act` : sans lui, `setSending(false)` et `setDraft('')`
    // tombent après la fin du test, hors de tout rendu contrôlé, et React
    // avertit sur une mise à jour non enveloppée.
    await act(async () => {
      release();
    });
  });

  // MESURÉ : sans ce test, supprimer `setSending(false)` du `.then` laissait
  // les quinze autres verts. La garde restait alors posée pour toujours, et le
  // panneau n'envoyait plus rien après son premier message — sans rien à
  // l'écran pour le dire, puisque la garde est une valeur et non un `disabled`.
  // Deux envois, donc, jamais un seul.
  it('accepte un second envoi une fois le premier résolu', async () => {
    const onSend = jest.fn(async () => true);
    await render(<ChatPanel chat={snapshot([])} onSend={onSend} onClose={jest.fn()} />);

    await fireEvent.changeText(screen.getByTestId('chat-input'), 'bonjour');
    await fireEvent.press(screen.getByTestId('chat-send'));
    await waitFor(() => expect(screen.getByTestId('chat-input').props.value).toBe(''));

    await fireEvent.changeText(screen.getByTestId('chat-input'), 'la suite');
    await fireEvent.press(screen.getByTestId('chat-send'));

    expect(onSend).toHaveBeenNthCalledWith(2, 'la suite');
  });

  // MESURÉ : sans ce test, remplacer `.catch(() => setSending(false))` par un
  // `.catch` inerte laissait les quinze autres verts. `ChatStore.send` ne
  // rejette pas, mais la coquille ne reçoit pas que lui : un rejet inattendu
  // figerait la zone de saisie pour le reste de la séance.
  it('relâche la garde quand l’envoi rejette, plutôt que de rester bloqué', async () => {
    const onSend = jest.fn(async () => true);
    onSend.mockRejectedValueOnce(new Error('inattendu'));
    await render(<ChatPanel chat={snapshot([])} onSend={onSend} onClose={jest.fn()} />);

    await fireEvent.changeText(screen.getByTestId('chat-input'), 'bonjour');
    await fireEvent.press(screen.getByTestId('chat-send'));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));

    await fireEvent.press(screen.getByTestId('chat-send'));

    expect(onSend).toHaveBeenCalledTimes(2);
  });

  // MESURÉ : sans ce test, remplacer `.reverse()` par un `.slice()` laissait
  // les quinze autres verts. `inverted` rend l'index 0 EN BAS : les rangées
  // sont construites dans l'ordre du fil — celui que `startsGroup` attend —
  // puis renversées une fois. Sans ce renversement, le message le plus récent
  // se retrouve hors de l'écran dès que le fil s'allonge. RNTL ne met rien en
  // page et ne peut donc pas dire ce qui apparaît en bas ; l'ORDRE des `testID`
  // dans l'arbre, lui, est observable.
  it('donne à la liste le plus récent en premier, qu’un rendu inversé pose en bas', async () => {
    await render(
      <ChatPanel
        chat={snapshot([
          message({ id: 's-1', sentAt: 1_000 }),
          message({ id: 's-2', sentAt: 2_000 }),
        ])}
        onSend={sent}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getAllByTestId(/^chat-message-/).map((node) => node.props.testID)).toEqual([
      'chat-message-u-ada#s-2',
      'chat-message-u-ada#s-1',
    ]);
  });

  it('borne la saisie à la longueur maximale', async () => {
    await render(<ChatPanel chat={snapshot([])} onSend={sent} onClose={jest.fn()} />);

    expect(screen.getByTestId('chat-input').props.maxLength).toBe(CHAT_MAX_LENGTH);
  });

  it('ferme sur demande, sans envoyer quoi que ce soit', async () => {
    const onClose = jest.fn();
    const onSend = jest.fn(async () => true);
    await render(<ChatPanel chat={snapshot([])} onSend={onSend} onClose={onClose} />);

    await fireEvent.press(screen.getByTestId('chat-close'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('porte une couleur explicite sur le titre, la ligne fixe, un auteur et un corps', async () => {
    // RNTL ne rastérise rien : ces assertions ne prouvent PAS qu'un texte est
    // lisible. Elles prouvent que la couleur explicite n'a pas été retirée —
    // c'est la cause qu'on garde, pas le symptôme. Sans `PaperProvider`
    // ancêtre, un `Text` dépouillé retombe sur `rgba(28, 27, 31, 1)`, et
    // l'égalité stricte fait échouer n'importe quel repli.
    await render(
      <ChatPanel
        chat={snapshot([message({ id: 's-1' }), message({ id: 's-2', sentAt: 1_500 })])}
        onSend={sent}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByTestId('chat-title')).toHaveStyle({ color: tokens.color.textDark });
    expect(screen.getByTestId('chat-not-kept')).toHaveStyle({ color: tokens.color.textDark });
    expect(screen.getByTestId('chat-author-u-ada#s-1')).toHaveStyle({
      color: tokens.color.textDark,
    });
    // Le SECOND corps aussi : une couleur posée sur le premier laisserait les
    // suivants retomber sur le thème.
    expect(screen.getByTestId('chat-body-u-ada#s-2')).toHaveStyle({
      color: tokens.color.textDark,
    });
  });

  it('porte une couleur explicite sur le fil vide', async () => {
    await render(<ChatPanel chat={snapshot([])} onSend={sent} onClose={jest.fn()} />);

    expect(screen.getByTestId('chat-empty')).toHaveStyle({ color: tokens.color.textDark });
  });

  it('force la surface de la zone de saisie ET le texte posé dessus', async () => {
    // On force la surface et le texte, ou ni l'un ni l'autre : une surface
    // forcée sous un texte laissé au thème est le pire des trois cas.
    //
    // Deux nœuds distincts, et c'est Paper qui l'impose : `TextInputOutlined`
    // EXTRAIT `backgroundColor` du `style` qu'on lui passe (`:91-99`) et le
    // remet à son liseré, rendu sous le `testID` fixe `text-input-outline`
    // (`Addons/Outline.tsx:36`) — même convention que le `more-sheet-surface`
    // que `moreMenu.spec.tsx` vise déjà. La couleur du texte, elle, atterrit
    // bien dans le style du champ natif (`:405`, `color: inputTextColor`), que
    // notre `textColor` alimente.
    await render(<ChatPanel chat={snapshot([])} onSend={sent} onClose={jest.fn()} />);

    expect(screen.getByTestId('text-input-outline')).toHaveStyle({
      backgroundColor: tokens.color.surfaceDark,
    });
    expect(screen.getByTestId('chat-input')).toHaveStyle({ color: tokens.color.textDark });
  });
});
