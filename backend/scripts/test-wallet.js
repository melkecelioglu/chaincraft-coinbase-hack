const { Wallet, Coinbase } = require('@coinbase/coinbase-sdk');
const apiError = require('@coinbase/coinbase-sdk/dist/coinbase/api_error');
require('dotenv').config();

// Monkeypatch APIError.fromError to capture the original error
const origFromError = apiError.APIError.fromError;
apiError.APIError.fromError = function(error) {
  console.error('\n=== ORIGINAL ERROR passed to APIError.fromError ===');
  console.error('  constructor:', error.constructor?.name);
  console.error('  message:', error.message);
  console.error('  code:', error.code);
  console.error('  response?.status:', error.response?.status);
  console.error('  response?.data:', JSON.stringify(error.response?.data));
  console.error('  config?.url:', error.config?.url);
  console.error('  config?.method:', error.config?.method);

  // If it's not an AxiosError, it might be a regular error
  if (error.stack) {
    const lines = error.stack.split('\n').slice(0, 8);
    console.error('  stack:\n   ', lines.join('\n    '));
  }

  return origFromError.call(this, error);
};

Coinbase.configure({
  apiKeyName: process.env.COINBASE_API_KEY,
  privateKey: process.env.COINBASE_API_PRIVATE_KEY?.replace(/\\n/g, '\n'),
});

const mnemonic = process.env.TEST_MNEMONIC;
if (!mnemonic) {
  console.error('TEST_MNEMONIC env variable is required');
  process.exit(1);
}

Wallet.import({ mnemonicPhrase: mnemonic }, 'base-sepolia')
  .then(() => console.log('Success!'))
  .catch(err => console.error('\nFinal error:', err.name, err.toString()));
