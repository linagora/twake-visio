import { Redirect } from 'expo-router';
import React from 'react';

import { getActiveAccount } from 'src/auth/accounts';

// expo-router requires a default export for every file under app/.
export default function Index(): React.ReactElement {
  return <Redirect href={getActiveAccount() === null ? '/welcome' : '/home'} />;
}
