import { computeChallenge, createPkcePair } from 'src/auth/pkce';

// RFC 7636 annexe B. Le seul moyen de prouver que le challenge est le digest
// du verifier, et non d'une constante ou d'une autre valeur.
const RFC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

describe('computeChallenge', () => {
  it('reproduit le vecteur de test de la RFC 7636', async () => {
    expect(await computeChallenge(RFC_VERIFIER)).toBe(RFC_CHALLENGE);
  });

  it('est déterministe pour un même verifier', async () => {
    const [first, second] = await Promise.all([
      computeChallenge(RFC_VERIFIER),
      computeChallenge(RFC_VERIFIER),
    ]);
    expect(first).toBe(second);
  });

  it('produit un digest SHA-256 encodé en base64url, soit 43 caractères', async () => {
    expect(await computeChallenge(RFC_VERIFIER)).toHaveLength(43);
  });
});

describe('createPkcePair', () => {
  it('produit un verifier de longueur conforme à la RFC 7636', async () => {
    const pair = await createPkcePair();
    expect(pair.verifier.length).toBeGreaterThanOrEqual(43);
    expect(pair.verifier.length).toBeLessThanOrEqual(128);
  });

  it("n'utilise que des caractères base64url non réservés", async () => {
    const pair = await createPkcePair();
    expect(pair.verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
    expect(pair.challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('annonce la méthode S256', async () => {
    const pair = await createPkcePair();
    expect(pair.method).toBe('S256');
  });

  it('calcule le challenge sur son propre verifier', async () => {
    const pair = await createPkcePair();
    expect(pair.challenge).toBe(await computeChallenge(pair.verifier));
  });

  it('produit un challenge de 43 caractères', async () => {
    const pair = await createPkcePair();
    expect(pair.challenge).toHaveLength(43);
  });

  it('produit un verifier différent à chaque appel', async () => {
    const [first, second] = await Promise.all([createPkcePair(), createPkcePair()]);
    expect(first.verifier).not.toBe(second.verifier);
  });
});
