const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: './config.env' });

/**
 * Migration: Add lastLoginAt field to all existing users
 * This ensures all users have the lastLoginAt field initialized
 * 
 * Run with: node migrations/addLastLoginAtField.js
 */

// Connect to MongoDB
mongoose
  .connect(process.env.DATABASE, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true,
    useFindAndModify: false,
  })
  .then(() => {
    console.log('✅ Connected to MongoDB');
    addLastLoginAtField();
  })
  .catch((err) => {
    console.error('❌ Database connection error:', err);
    process.exit(1);
  });

async function addLastLoginAtField() {
  try {
    const User = require('../models/userModel');
    
    console.log('\n========================================');
    console.log('🔄 MIGRATION: Adding lastLoginAt field');
    console.log('========================================\n');

    // Find all users without lastLoginAt field
    const usersWithoutField = await User.find({
      $or: [
        { lastLoginAt: { $exists: false } },
        { lastLoginAt: null }
      ]
    });

    console.log(`Found ${usersWithoutField.length} users without lastLoginAt field`);

    if (usersWithoutField.length === 0) {
      console.log('✅ All users already have lastLoginAt field');
      process.exit(0);
    }

    // Update all users to have lastLoginAt set to null (or their joinedAt date if available)
    let updatedCount = 0;
    
    for (const user of usersWithoutField) {
      // Set lastLoginAt to null (will be updated on next login)
      // Or optionally set it to joinedAt if you want to track from registration
      await User.updateOne(
        { _id: user._id },
        { 
          $set: { 
            lastLoginAt: null 
          } 
        }
      );
      updatedCount++;
    }

    console.log(`\n✅ Successfully updated ${updatedCount} user(s)`);
    console.log('   - lastLoginAt field has been added to all users');
    console.log('   - Field will be automatically updated on next login');
    console.log('\n========================================\n');

    // Verify the update
    const usersWithField = await User.countDocuments({
      lastLoginAt: { $exists: true }
    });
    const totalUsers = await User.countDocuments();
    
    console.log(`📊 Verification:`);
    console.log(`   - Total users: ${totalUsers}`);
    console.log(`   - Users with lastLoginAt field: ${usersWithField}`);
    console.log(`   - Users without field: ${totalUsers - usersWithField}\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding lastLoginAt field:', error);
    process.exit(1);
  }
}

