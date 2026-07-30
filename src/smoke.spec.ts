import { APP_SCHEME } from 'src/constants';

describe('scaffold', () => {
  it('expose le schéma de redirection attendu', () => {
    expect(APP_SCHEME).toBe('twakevisio');
  });
});
