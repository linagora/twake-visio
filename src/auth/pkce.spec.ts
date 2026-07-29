import { createPkcePair } from 'src/auth/pkce';

describe('createPkcePair', () => {
  it('produit un verifier de longueur conforme à la RFC 7636', async () => {
    const pair = await createPkcePair();
    expect(pair.verifier.length).toBeGreaterThanOrEqual(43);
    expect(pair.verifier.length).toBeLessThanOrEqual(128);
  });

  it('n\'utilise que des caractères base64url non réservés', async () => {
    const pair = await createPkcePair();
    expect(pair.verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
    expect(pair.challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('annonce la méthode S256', async () => {
    const pair = await createPkcePair();
    expect(pair.method).toBe('S256');
  });

  it('produit un verifier différent à chaque appel', async () => {
    const [first, second] = await Promise.all([createPkcePair(), createPkcePair()]);
    expect(first.verifier).not.toBe(second.verifier);
  });
});
