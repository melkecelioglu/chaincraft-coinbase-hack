const crypto = require('crypto');
const jose = require('node-jose');
const apiError = require('@coinbase/coinbase-sdk/dist/coinbase/api_error');
require('dotenv').config();

// Monkeypatch to see real errors
const origFromError = apiError.APIError.fromError;
apiError.APIError.fromError = function(error) {
  console.error('\n[INTERCEPTED]', error.constructor?.name + ':', error.message);
  console.error('  status:', error.response?.status);
  console.error('  data:', JSON.stringify(error.response?.data));
  return origFromError.call(this, error);
};

const rawKey = process.env.COINBASE_API_PRIVATE_KEY
  ?.replace(/\\n/g, '\n')
  ?.replace(/-----BEGIN EC PRIVATE KEY-----/, '')
  ?.replace(/-----END EC PRIVATE KEY-----/, '')
  ?.replace(/\n/g, '')
  ?.trim();

const buf = Buffer.from(rawKey, 'base64');

async function buildPem(privBytes) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(privBytes);
  const key = crypto.createPrivateKey({
    key: {
      kty: 'EC', crv: 'P-256',
      x: ecdh.getPublicKey().slice(1, 33).toString('base64url'),
      y: ecdh.getPublicKey().slice(33, 65).toString('base64url'),
      d: privBytes.toString('base64url'),
    },
    format: 'jwk',
  });
  return key.export({ type: 'sec1', format: 'pem' });
}

async function main() {
  const pem = await buildPem(buf.slice(0, 32));
  console.log('PEM created, testing with Coinbase SDK...');

  const { Wallet, Coinbase } = require('@coinbase/coinbase-sdk');
  Coinbase.configure({
    apiKeyName: process.env.COINBASE_API_KEY,
    privateKey: pem,
  });

  const mnemonic = process.env.TEST_MNEMONIC;
  if (!mnemonic) {
    console.error('TEST_MNEMONIC env variable is required');
    process.exit(1);
  }
  try {
    const wallet = await Wallet.import({ mnemonicPhrase: mnemonic }, 'base-sepolia');
    console.log('SUCCESS!');
  } catch (e) {
    console.error('\nFinal:', e.name, e.httpCode, e.apiCode, e.apiMessage);
  }
}

main().catch(console.error);
