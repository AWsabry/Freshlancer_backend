const dotenv = require('dotenv');
const mongoose = require('mongoose');
const path = require('path');
const University = require('../models/universityModel');

dotenv.config({ path: path.resolve(__dirname, '../config.env') });

const DB = process.env.DATABASE;

mongoose
  .connect(DB)
  .then(() => console.log('✅ Database connected successfully'))
  .catch((err) => {
    console.error('❌ Database connection error:', err);
    process.exit(1);
  });

const updateUniversitiesStatus = async () => {
  try {
    console.log('📚 Starting university status update...');

    // Update all universities to have status: 'approved'
    const result = await University.updateMany(
      {}, // Match all documents
      {
        $set: {
          status: 'approved',
          isActive: true, // Also ensure isActive is true
        },
      }
    );

    console.log(`✅ Updated ${result.modifiedCount} universities`);
    console.log(`📊 Matched ${result.matchedCount} universities`);

    // Verify the update
    const approvedCount = await University.countDocuments({ status: 'approved' });
    const totalCount = await University.countDocuments({});

    console.log(`\n📊 Verification:`);
    console.log(`   - Total universities: ${totalCount}`);
    console.log(`   - Approved universities: ${approvedCount}`);

    if (approvedCount === totalCount) {
      console.log('\n🎉 All universities are now approved!');
    } else {
      console.log(`\n⚠️ Warning: ${totalCount - approvedCount} universities are not approved`);
    }

  } catch (error) {
    console.error('❌ Error during university status update:', error);
  } finally {
    mongoose.connection.close();
    process.exit();
  }
};

updateUniversitiesStatus();

