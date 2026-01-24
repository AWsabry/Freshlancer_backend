const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: './config.env' });

/**
 * Migration: Drop unique index on jobApplication in contracts collection.
 * Allows clients to create a new contract from the same application after
 * cancelling a previous one.
 *
 * Run with: node migrations/dropContractJobApplicationUniqueIndex.js
 */

mongoose
  .connect(process.env.DATABASE, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('✅ Connected to MongoDB');
    dropJobApplicationUniqueIndex();
  })
  .catch((err) => {
    console.error('❌ Database connection error:', err);
    process.exit(1);
  });

async function dropJobApplicationUniqueIndex() {
  try {
    const db = mongoose.connection.db;
    const contractsCollection = db.collection('contracts');

    const indexes = await contractsCollection.indexes();
    console.log('Current indexes:', indexes.map((i) => i.name));

    const jobAppUnique = indexes.find(
      (i) => i.name === 'jobApplication_1' && i.unique === true
    );

    if (jobAppUnique) {
      await contractsCollection.dropIndex('jobApplication_1');
      console.log('✅ Dropped unique index jobApplication_1 on contracts');
    } else {
      console.log(
        'ℹ️  Unique jobApplication index not found (already dropped or never created)'
      );
    }

    const after = await contractsCollection.indexes();
    console.log('Indexes after migration:', after.map((i) => i.name));

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}
