/**
 * Regenerates embeddings for all ContractTemplate documents.
 * New embedding text includes source code summary for better search quality.
 *
 * Usage: npx ts-node scripts/regenerate-embeddings.ts
 * Requires: DB_CONNECTION_STRING and OPENAI_API_KEY in .env
 */
import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const DB_URI =
  process.env.DB_CONNECTION_STRING ||
  'mongodb://localhost:27017/openai-func?directConnection=true';

const TemplateSchema = new mongoose.Schema(
  {
    name: String,
    description: String,
    tags: [String],
    type: String,
    template: String,
    sources: mongoose.Schema.Types.Mixed,
    contractName: String,
    constructorArgs: mongoose.Schema.Types.Mixed,
    originalDeployment: mongoose.Schema.Types.Mixed,
    embedding: [Number],
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'SmartUser' },
    deployCount: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'contracttemplates' },
);

const Template = mongoose.model('ContractTemplate', TemplateSchema);

function buildEmbeddingText(doc: any): string {
  const sourceText = Object.values(doc.sources || {})
    .map((s: any) => s.content)
    .join('\n');
  const sourceSummary = sourceText.slice(0, 500);
  const tags = (doc.tags || []).join(' ');
  return `${doc.contractName || doc.name} ${doc.description || ''} ${tags} ${sourceSummary}`;
}

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(DB_URI);
  console.log('Connected.');

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const templates = await Template.find({}).exec();
  console.log(`Found ${templates.length} templates to regenerate.`);

  for (let i = 0; i < templates.length; i++) {
    const doc = templates[i];
    const embeddingText = buildEmbeddingText(doc);
    console.log(`[${i + 1}/${templates.length}] Regenerating: ${doc.name}...`);

    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: embeddingText,
        dimensions: 1536,
      });

      await Template.findByIdAndUpdate(doc._id, {
        embedding: response.data[0].embedding,
      });

      console.log(`  Done.`);
    } catch (err: any) {
      console.error(`  FAILED: ${err.message}`);
      if (err.status === 429) {
        console.log('  Rate limited, waiting 1s...');
        await new Promise((r) => setTimeout(r, 1000));
        i--;
      }
    }
  }

  console.log('\nAll embeddings regenerated.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
