const dotenv = require('dotenv');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const University = require('../models/universityModel');

// Load environment variables
dotenv.config({ path: './config.env' });

// Connect to database
mongoose
  .connect(process.env.DATABASE, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('✅ Database connected successfully');
    importUniversities();
  })
  .catch((err) => {
    console.error('❌ Database connection error:', err);
    process.exit(1);
  });

async function importUniversities() {
  try {
    console.log('📚 Starting university import...');

    // Path to CSV file (relative to this script)
    // The CSV is in the frontend public folder
    const csvPath = path.join(__dirname, '../../freshlancer-frontend/public/world-universities.csv');

    // Check if file exists
    if (!fs.existsSync(csvPath)) {
      console.error(`❌ CSV file not found at: ${csvPath}`);
      console.log('Please ensure the world-universities.csv file exists in freshlancer-frontend/public/');
      process.exit(1);
    }

    // Read CSV file
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim() !== '');

    console.log(`📖 Found ${lines.length} lines in CSV file`);

    // Clear existing universities (optional - comment out if you want to keep existing data)
    const existingCount = await University.countDocuments();
    if (existingCount > 0) {
      console.log(`⚠️  Found ${existingCount} existing universities in database`);
      console.log('🗑️  Clearing existing universities...');
      await University.deleteMany({});
      console.log('✅ Existing universities cleared');
    }

    const universities = [];
    let skipped = 0;
    let errors = 0;

    // Parse CSV lines
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        // CSV format: CountryCode,UniversityName,WebsiteURL
        // Some university names may contain commas, so we need to handle that
        const parts = [];
        let currentPart = '';
        let inQuotes = false;

        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            parts.push(currentPart.trim());
            currentPart = '';
          } else {
            currentPart += char;
          }
        }
        parts.push(currentPart.trim()); // Add the last part

        if (parts.length < 2) {
          console.warn(`⚠️  Skipping line ${i + 1}: Invalid format - ${line.substring(0, 50)}...`);
          skipped++;
          continue;
        }

        const countryCode = parts[0].trim();
        const name = parts[1].trim().replace(/^"|"$/g, ''); // Remove surrounding quotes if any
        const website = parts[2] ? parts[2].trim().replace(/^"|"$/g, '') : '';

        if (!countryCode || !name) {
          console.warn(`⚠️  Skipping line ${i + 1}: Missing required fields`);
          skipped++;
          continue;
        }

        universities.push({
          name,
          countryCode: countryCode.toUpperCase(),
          website: website || undefined,
          isActive: true,
        });
      } catch (error) {
        console.error(`❌ Error parsing line ${i + 1}:`, error.message);
        errors++;
      }
    }

    console.log(`📝 Parsed ${universities.length} universities`);
    console.log(`⚠️  Skipped ${skipped} invalid lines`);
    if (errors > 0) {
      console.log(`❌ Errors: ${errors}`);
    }

    // Insert universities in batches to avoid memory issues
    const batchSize = 1000;
    let inserted = 0;

    for (let i = 0; i < universities.length; i += batchSize) {
      const batch = universities.slice(i, i + batchSize);
      await University.insertMany(batch, { ordered: false });
      inserted += batch.length;
      console.log(`✅ Inserted ${inserted}/${universities.length} universities...`);
    }

    console.log('\n🎉 University import completed successfully!');
    console.log(`📊 Total universities imported: ${inserted}`);
    
    // Verify import
    const totalInDb = await University.countDocuments();
    console.log(`📊 Total universities in database: ${totalInDb}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error importing universities:', error);
    process.exit(1);
  }
}

