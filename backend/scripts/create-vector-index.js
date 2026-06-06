#!/usr/bin/env node

/**
 * Creates the vector search index on the ContractTemplate collection.
 * Requires MongoDB 8.2+ with mongot sidecar.
 *
 * Usage: node scripts/create-vector-index.js
 */

const { MongoClient } = require('mongodb');

const DB_URI =
  process.env.DB_CONNECTION_STRING ||
  'mongodb://localhost:27017/openai-func?directConnection=true';

async function main() {
  const client = new MongoClient(DB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db();
    const collection = db.collection('contracttemplates');

    const indexDefinition = {
      name: 'vector_index',
      type: 'vectorSearch',
      definition: {
        fields: [
          {
            type: 'vector',
            path: 'embedding',
            numDimensions: 1536,
            similarity: 'cosine',
          },
        ],
      },
    };

    await collection.createSearchIndex(indexDefinition);
    console.log('Vector search index "vector_index" created successfully');
  } catch (error) {
    if (error.codeName === 'IndexAlreadyExists') {
      console.log('Vector search index "vector_index" already exists');
    } else {
      console.error('Failed to create vector search index:', error.message);
      process.exit(1);
    }
  } finally {
    await client.close();
  }
}

main();
