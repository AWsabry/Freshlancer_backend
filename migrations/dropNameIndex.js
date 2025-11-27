const mongoose = require('mongoose');
require('dotenv').config({ path: './config.env' });

// Connect to MongoDB
const DB = process.env.DATABASE.replace(
  '<PASSWORD>',
  process.env.DATABASE_PASSWORD
);

mongoose
  .connect(DB, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('DB connection successful!');
    dropNameIndex();
  })
  .catch((err) => {
    console.error('DB connection error:', err);
    process.exit(1);
  });

async function dropNameIndex() {
  try {
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    // Get all indexes
    const indexes = await usersCollection.indexes();
    console.log('Current indexes:', indexes.map(i => i.name));

    // Check if name_1 index exists
    const nameIndexExists = indexes.some(index => index.name === 'name_1');

    if (nameIndexExists) {
      // Drop the name index
      await usersCollection.dropIndex('name_1');
      console.log('✅ Successfully dropped name_1 index');
    } else {
      console.log('ℹ️  name_1 index does not exist (already dropped or never created)');
    }

    // List indexes after dropping
    const indexesAfter = await usersCollection.indexes();
    console.log('Indexes after migration:', indexesAfter.map(i => i.name));

    process.exit(0);
  } catch (error) {
    console.error('❌ Error dropping index:', error.message);
    process.exit(1);
  }
}
