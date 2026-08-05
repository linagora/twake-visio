import { clearPendingAccess, stashRoomAccess, takeRoomAccess } from 'src/call/pendingAccess';
import type { RoomAccess } from 'src/call/types';

const ACCESS: RoomAccess = {
  room: { id: null, slug: 'aet-jgqg-fpa', name: 'aet-jgqg-fpa', accessLevel: 'trusted' },
  livekitUrl: 'https://livekit.linagora.com',
  token: 'jeton-admission',
  isAdministrable: false,
};

beforeEach(() => {
  clearPendingAccess();
});

describe('le passage de main entre la salle d’attente et la séance', () => {
  it('rend ce qui a été mis de côté pour ce salon', () => {
    stashRoomAccess('aet-jgqg-fpa', ACCESS);

    expect(takeRoomAccess('aet-jgqg-fpa')).toEqual(ACCESS);
  });

  it('rend null quand rien n’a été mis de côté', () => {
    expect(takeRoomAccess('aet-jgqg-fpa')).toBe(null);
  });

  /**
   * La borne qui compte. Une admission abandonnée laisserait sinon son jeton
   * servir à l'ouverture du salon SUIVANT, qui n'a aucune raison d'être le
   * même : la personne entrerait dans une réunion avec le jeton d'une autre,
   * et le serveur la placerait dans la salle du jeton, pas dans celle qu'elle
   * a demandée.
   */
  it('rend null pour un AUTRE salon, sans consommer', () => {
    stashRoomAccess('aet-jgqg-fpa', ACCESS);

    expect(takeRoomAccess('mjj-beyv-zai')).toBe(null);
    // Toujours là pour son propre salon : un slug qui ne correspond pas ne
    // doit rien détruire.
    expect(takeRoomAccess('aet-jgqg-fpa')).toEqual(ACCESS);
  });

  /**
   * Consommé UNE fois.
   *
   * Un accès laissé en place masquerait un vrai échec de `fetchRoomAccess` en
   * le remplaçant par un jeton périmé : la séance s'ouvrirait sur un jeton
   * mort au lieu de dire ce qui ne va pas.
   */
  it('ne se laisse prendre qu’une fois', () => {
    stashRoomAccess('aet-jgqg-fpa', ACCESS);

    expect(takeRoomAccess('aet-jgqg-fpa')).toEqual(ACCESS);
    expect(takeRoomAccess('aet-jgqg-fpa')).toBe(null);
  });

  it('remplace un accès plus ancien plutôt que de l’empiler', () => {
    stashRoomAccess('aet-jgqg-fpa', ACCESS);
    const autre = { ...ACCESS, token: 'jeton-plus-recent' };

    stashRoomAccess('aet-jgqg-fpa', autre);

    expect(takeRoomAccess('aet-jgqg-fpa')?.token).toBe('jeton-plus-recent');
  });
});
