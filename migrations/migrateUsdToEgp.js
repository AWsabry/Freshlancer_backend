const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', 'config.env') });

/**
 * Migration: Convert existing USD currency to EGP for job-related data.
 * - JobPost: budget.currency USD -> EGP
 * - JobApplication: proposedBudget.currency USD -> EGP
 * - User: studentProfile.hourlyRate.currency USD -> EGP
 * - Optional: User wallet balances/escrow: move USD amount to EGP key and remove USD
 *
 * Run from FreeStudent-API directory: node migrations/migrateUsdToEgp.js
 * Optional wallet migration: node migrations/migrateUsdToEgp.js --wallet
 */

const MIGRATE_WALLET = process.argv.includes('--wallet');

mongoose
  .connect(process.env.DATABASE, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('✅ Connected to MongoDB');
    runMigration();
  })
  .catch((err) => {
    console.error('❌ Database connection error:', err);
    process.exit(1);
  });

async function runMigration() {
  try {
    const JobPost = require('../models/jobPostModel');
    const JobApplication = require('../models/jobApplicationModel');
    const User = require('../models/userModel');
    const { Contract } = require('../models/contractModel');

    console.log('\n========================================');
    console.log('🔄 MIGRATION: USD -> EGP (job-related data)');
    console.log('========================================\n');

    const mod = (r) => (r && (r.modifiedCount ?? r.nModified)) ?? 0;

    // 1) JobPost: budget.currency USD -> EGP
    const jobResult = await JobPost.updateMany(
      { 'budget.currency': 'USD' },
      { $set: { 'budget.currency': 'EGP' } }
    );
    console.log(`JobPost: ${mod(jobResult)} document(s) updated (budget.currency USD -> EGP)`);

    // 2) JobApplication: proposedBudget.currency USD -> EGP
    const appResult = await JobApplication.updateMany(
      { 'proposedBudget.currency': 'USD' },
      { $set: { 'proposedBudget.currency': 'EGP' } }
    );
    console.log(`JobApplication: ${mod(appResult)} document(s) updated (proposedBudget.currency USD -> EGP)`);

    // 3) User: studentProfile.hourlyRate.currency USD -> EGP
    const userResult = await User.updateMany(
      { 'studentProfile.hourlyRate.currency': 'USD' },
      { $set: { 'studentProfile.hourlyRate.currency': 'EGP' } }
    );
    console.log(`User (hourly rate): ${mod(userResult)} document(s) updated (studentProfile.hourlyRate.currency USD -> EGP)`);

    // 4) Contract: currency USD -> EGP
    const contractResult = await Contract.updateMany(
      { currency: 'USD' },
      { $set: { currency: 'EGP' } }
    );
    console.log(`Contract: ${mod(contractResult)} document(s) updated (currency USD -> EGP)`);

    // 5) Optional: wallet balances and escrow — add USD to EGP and remove USD
    if (MIGRATE_WALLET) {
      const usersWithUsd = await User.find({
        $or: [
          { 'wallet.balances.USD': { $exists: true, $gt: 0 } },
          { 'wallet.escrow.USD': { $exists: true, $gt: 0 } },
        ],
      });
      let walletCount = 0;
      for (const user of usersWithUsd) {
        const wallet = user.wallet || {};
        const balances = wallet.balances || {};
        const escrow = wallet.escrow || {};
        const usdBalance = Number(balances.get ? balances.get('USD') : balances.USD) || 0;
        const usdEscrow = Number(escrow.get ? escrow.get('USD') : escrow.USD) || 0;
        if (usdBalance > 0 || usdEscrow > 0) {
          const egpBalance = Number(balances.get ? balances.get('EGP') : balances.EGP) || 0;
          const egpEscrow = Number(escrow.get ? escrow.get('EGP') : escrow.EGP) || 0;
          const setOp = {};
          const unsetOp = {};
          if (usdBalance > 0) {
            setOp['wallet.balances.EGP'] = egpBalance + usdBalance;
            unsetOp['wallet.balances.USD'] = '';
          }
          if (usdEscrow > 0) {
            setOp['wallet.escrow.EGP'] = egpEscrow + usdEscrow;
            unsetOp['wallet.escrow.USD'] = '';
          }
          await User.updateOne({ _id: user._id }, { $set: setOp, $unset: unsetOp });
          walletCount++;
        }
      }
      console.log(`Wallet: ${walletCount} user(s) migrated (USD balance/escrow merged into EGP)`);
    } else {
      console.log('Wallet: skipped (run with --wallet to migrate wallet USD -> EGP)');
    }

    console.log('\n========================================');
    console.log('✅ Migration completed');
    console.log('========================================\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
}
