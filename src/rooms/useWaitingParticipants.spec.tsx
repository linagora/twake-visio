import { act, render, renderHook } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import * as participants from 'src/api/participants';
import type { WaitingParticipant } from 'src/api/participants';
import type { ApiResult } from 'src/api/types';
import type { Account } from 'src/auth/accounts';
import { useWaitingParticipants } from 'src/rooms/useWaitingParticipants';

const ACCOUNT = { id: 'a', displayName: 'Ada' } as Account;

function Probe({ enabled }: { enabled: boolean }): React.ReactElement {
  const { waiting } = useWaitingParticipants(ACCOUNT, 'r-1', enabled);
  return <Text testID="count">{String(waiting.length)}</Text>;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.restoreAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

async function tick(): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
}

describe('useWaitingParticipants', () => {
  it("n'interroge rien quand la garde est fermée", async () => {
    const list = jest.spyOn(participants, 'listWaitingParticipants');

    await render(<Probe enabled={false} />);
    await tick();

    // Un salon public n'a pas de salle d'attente, et une personne sans
    // privilège se ferait refuser : interroger serait du bruit garanti.
    expect(list).not.toHaveBeenCalled();
  });

  it('interroge quand la garde est ouverte', async () => {
    const list = jest
      .spyOn(participants, 'listWaitingParticipants')
      .mockResolvedValue({ ok: true, value: [{ id: 'p-1', username: 'Ada' }] });

    await render(<Probe enabled />);
    await tick();

    expect(list).toHaveBeenCalledWith(ACCOUNT, 'r-1');
  });

  it('arrête de scruter au démontage', async () => {
    const list = jest
      .spyOn(participants, 'listWaitingParticipants')
      .mockResolvedValue({ ok: true, value: [] });

    const view = await render(<Probe enabled />);
    await tick();
    const before = list.mock.calls.length;

    await view.unmount();
    await tick();
    await tick();

    // Un intervalle non nettoyé interroge le serveur pour un écran que plus
    // personne ne regarde, et fuit un timer par visite.
    expect(list.mock.calls.length).toBe(before);
  });

  it('scrute pile toutes les cinq secondes, et pas seulement une fois', async () => {
    // Un `tick()` unique de 5000 ms passerait tout aussi bien avec une
    // cadence plus courte : seule une borne juste avant l'échéance, puis des
    // tours répétés, distingue vraiment 5000 ms d'une autre valeur.
    const list = jest
      .spyOn(participants, 'listWaitingParticipants')
      .mockResolvedValue({ ok: true, value: [] });

    await renderHook(() => useWaitingParticipants(ACCOUNT, 'r-1', true));

    await act(async () => {
      jest.advanceTimersByTime(4999);
    });
    expect(list).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(list).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(list).toHaveBeenCalledTimes(2);

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(list).toHaveBeenCalledTimes(3);
  });

  it("ignore une réponse qui arrive après que la garde s'est refermée", async () => {
    // Une réponse partie avant que `enabled` ne repasse à faux peut arriver
    // après coup. L'appliquer ferait réapparaître une file d'attente sur un
    // salon qu'on ne modère plus.
    let resolveFetch: (result: ApiResult<readonly WaitingParticipant[]>) => void = () => undefined;
    jest.spyOn(participants, 'listWaitingParticipants').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const { result, rerender } = await renderHook(
      ({ enabled }: { enabled: boolean }) => useWaitingParticipants(ACCOUNT, 'r-1', enabled),
      { initialProps: { enabled: true } },
    );

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    await rerender({ enabled: false });

    await act(async () => {
      resolveFetch({ ok: true, value: [{ id: 'p-1', username: 'Ada' }] });
    });

    expect(result.current.waiting).toEqual([]);
  });

  it('ne vide pas la file sur une erreur passagère', async () => {
    const list = jest.spyOn(participants, 'listWaitingParticipants');
    list.mockResolvedValueOnce({ ok: true, value: [{ id: 'p-1', username: 'Ada' }] });

    const { result } = await renderHook(() => useWaitingParticipants(ACCOUNT, 'r-1', true));
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(result.current.waiting).toEqual([{ id: 'p-1', username: 'Ada' }]);

    list.mockResolvedValueOnce({ ok: false, error: { kind: 'network' } });
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    // Une coupure passagère ne doit pas faire disparaître, aux yeux du
    // modérateur, une personne qui patiente toujours devant la porte.
    expect(result.current.waiting).toEqual([{ id: 'p-1', username: 'Ada' }]);
  });

  it('fusionne les nouvelles arrivées sans réordonner ce qui est déjà affiché', async () => {
    const ada = { id: 'p-1', username: 'Ada' };
    const bob = { id: 'p-2', username: 'Bob' };
    const cid = { id: 'p-3', username: 'Cid' };
    const list = jest.spyOn(participants, 'listWaitingParticipants');
    list.mockResolvedValueOnce({ ok: true, value: [ada, bob] });

    const { result } = await renderHook(() => useWaitingParticipants(ACCOUNT, 'r-1', true));
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(result.current.waiting).toEqual([ada, bob]);

    // Le serveur rend un ordre différent et une arrivée : réordonner ferait
    // changer de personne sous le doigt qui s'apprête à répondre.
    list.mockResolvedValueOnce({ ok: true, value: [bob, ada, cid] });
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    expect(result.current.waiting).toEqual([ada, bob, cid]);
  });
});

describe('useWaitingParticipants, answer', () => {
  it('retire immédiatement la personne de la file, avant la réponse du serveur', async () => {
    jest
      .spyOn(participants, 'listWaitingParticipants')
      .mockResolvedValue({ ok: true, value: [{ id: 'p-1', username: 'Ada' }] });
    const answerEntrySpy = jest
      .spyOn(participants, 'answerEntry')
      .mockResolvedValue({ ok: true, value: undefined });

    const { result } = await renderHook(() => useWaitingParticipants(ACCOUNT, 'r-1', true));
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(result.current.waiting).toEqual([{ id: 'p-1', username: 'Ada' }]);

    await act(async () => {
      result.current.answer('p-1', true);
    });

    // Retiré tout de suite : attendre la réponse du serveur laisserait le
    // bandeau proposer une décision déjà prise.
    expect(result.current.waiting).toEqual([]);
    expect(answerEntrySpy).toHaveBeenCalledWith(ACCOUNT, 'r-1', 'p-1', true);
  });

  it('refuse par le même mécanisme, sans inverser le sens du booléen', async () => {
    // Admettre et refuser partent vers le même endpoint : inverser le
    // booléen laisserait entrer qui on voulait écarter.
    jest.spyOn(participants, 'listWaitingParticipants').mockResolvedValue({ ok: true, value: [] });
    const answerEntrySpy = jest
      .spyOn(participants, 'answerEntry')
      .mockResolvedValue({ ok: true, value: undefined });

    const { result } = await renderHook(() => useWaitingParticipants(ACCOUNT, 'r-1', true));

    await act(async () => {
      result.current.answer('p-1', false);
    });

    expect(answerEntrySpy).toHaveBeenCalledWith(ACCOUNT, 'r-1', 'p-1', false);
  });
});
