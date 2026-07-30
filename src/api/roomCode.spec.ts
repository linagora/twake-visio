import * as crypto from 'expo-crypto';

import { generateRoomCode } from 'src/api/roomCode';

// Le motif que le routeur du client web exige, recopié de son bundle.
const WEB_PATTERN = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

describe('generateRoomCode', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('produit un code que le client web accepte', () => {
    // C'est la propriété qui compte : un code hors motif rend le salon
    // injoignable depuis le web et son lien impartageable.
    expect(generateRoomCode()).toMatch(WEB_PATTERN);
  });

  it('respecte le motif sur un grand nombre de tirages', () => {
    for (let i = 0; i < 500; i += 1) {
      expect(generateRoomCode()).toMatch(WEB_PATTERN);
    }
  });

  it('ne rend pas deux fois le même code', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) seen.add(generateRoomCode());

    // Un code constant passerait le test de motif sans rien protéger.
    expect(seen.size).toBe(200);
  });

  it("n'introduit pas le biais d'un modulo sur 26", () => {
    // 234 à 255 doivent être rejetés : les garder ferait ressortir a-f. On
    // fournit une source qui ne rend que des octets de cette queue, suivie
    // d'octets utilisables, et on vérifie que la queue n'a rien produit.
    let call = 0;
    const spy = jest.spyOn(crypto, 'getRandomBytes').mockImplementation(((n: number) => {
      call += 1;
      // Premier appel : uniquement la queue rejetée. Ensuite : que des zéros,
      // qui donnent 'a'.
      return new Uint8Array(n).fill(call === 1 ? 250 : 0);
    }) as never);

    const code = generateRoomCode();

    expect(code).toBe('aaa-aaaa-aaa');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('épuise chaque tirage avant de redemander des octets', () => {
    const spy = jest
      .spyOn(crypto, 'getRandomBytes')
      .mockImplementation(((n: number) => new Uint8Array(n).fill(1)) as never);

    generateRoomCode();

    // Dix octets utilisables suffisent à dix lettres : redemander une source
    // par lettre gaspillerait de l'entropie et ralentirait sans raison.
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
