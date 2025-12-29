const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const sendEmail = require('../email');
const logger = require('../logger');

const execAsync = promisify(exec);

/**
 * Parse MongoDB connection string to extract connection details
 */
function parseMongoUri(uri) {
  try {
    const url = new URL(uri);
    const auth = url.username && url.password 
      ? `-u "${url.username}" -p "${url.password}"` 
      : '';
    const host = url.hostname;
    const port = url.port || '27017';
    const database = url.pathname.replace('/', '');
    
    return {
      auth,
      host,
      port,
      database,
      connectionString: uri
    };
  } catch (error) {
    logger.error('Error parsing MongoDB URI:', error);
    throw new Error('Invalid MongoDB connection string');
  }
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Get backup directory path
 */
function getBackupDirectory() {
  const backupDir = path.join(__dirname, '../../backups');
  return backupDir;
}

/**
 * Create backup directory if it doesn't exist
 */
async function ensureBackupDirectory() {
  const backupDir = getBackupDirectory();
  try {
    await fs.mkdir(backupDir, { recursive: true });
    logger.info('Backup directory ensured:', backupDir);
  } catch (error) {
    logger.error('Error creating backup directory:', error);
    throw error;
  }
}

/**
 * Get backup filename with date
 */
function getBackupFilename() {
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  return `freshlancer-backup-${dateStr}`;
}

/**
 * Perform MongoDB backup using mongodump
 */
async function performBackup() {
  const startTime = Date.now();
  const databaseUri = process.env.DATABASE;
  
  if (!databaseUri) {
    throw new Error('DATABASE environment variable is not set');
  }

  logger.info('Starting database backup...');
  logger.info('Database URI:', databaseUri.replace(/:[^:@]+@/, ':****@')); // Hide password

  const backupDir = getBackupDirectory();
  await ensureBackupDirectory();

  const backupName = getBackupFilename();
  const backupPath = path.join(backupDir, backupName);

  try {
    // Parse MongoDB URI
    const mongoConfig = parseMongoUri(databaseUri);
    
    // Build mongodump command
    // For MongoDB Atlas (connection string), we use the URI directly
    let dumpCommand;
    
    if (databaseUri.includes('mongodb+srv://') || databaseUri.includes('mongodb://')) {
      // Use connection string directly for MongoDB Atlas or standard MongoDB
      dumpCommand = `mongodump --uri="${databaseUri}" --out="${backupPath}"`;
    } else {
      // Fallback to individual parameters (if needed)
      dumpCommand = `mongodump --host ${mongoConfig.host} --port ${mongoConfig.port} ${mongoConfig.auth} --db ${mongoConfig.database} --out="${backupPath}"`;
    }

    logger.info('Executing backup command...');
    logger.debug('Command:', dumpCommand.replace(/:[^:@]+@/, ':****@'));

    // Execute mongodump
    const { stdout, stderr } = await execAsync(dumpCommand, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      timeout: 3600000 // 1 hour timeout
    });

    if (stderr && !stderr.includes('writing') && !stderr.includes('done')) {
      logger.warn('Backup stderr:', stderr);
    }

    // Calculate backup size
    const backupSize = await calculateBackupSize(backupPath);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    logger.info('✅ Backup completed successfully');
    logger.info('Backup path:', backupPath);
    logger.info('Backup size:', formatFileSize(backupSize));
    logger.info('Duration:', duration, 'seconds');

    return {
      success: true,
      backupPath,
      backupName,
      backupSize,
      duration: parseFloat(duration),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('❌ Backup failed:', error);
    throw error;
  }
}

/**
 * Calculate total size of backup directory
 */
async function calculateBackupSize(backupPath) {
  try {
    let totalSize = 0;
    
    async function getDirSize(dir) {
      const files = await fs.readdir(dir, { withFileTypes: true });
      
      for (const file of files) {
        const filePath = path.join(dir, file.name);
        
        if (file.isDirectory()) {
          totalSize += await getDirSize(filePath);
        } else {
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
        }
      }
      
      return totalSize;
    }
    
    await getDirSize(backupPath);
    return totalSize;
  } catch (error) {
    logger.error('Error calculating backup size:', error);
    return 0;
  }
}

/**
 * Remove backups older than specified days
 */
async function cleanupOldBackups(daysToKeep = 7) {
  const backupDir = getBackupDirectory();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  try {
    const files = await fs.readdir(backupDir);
    let deletedCount = 0;
    let freedSpace = 0;

    for (const file of files) {
      const filePath = path.join(backupDir, file);
      const stats = await fs.stat(filePath);
      
      // Check if it's a directory (backup folder)
      if (stats.isDirectory() && file.startsWith('freshlancer-backup-')) {
        const fileDate = new Date(stats.mtime);
        
        if (fileDate < cutoffDate) {
          // Calculate size before deletion
          const size = await calculateBackupSize(filePath);
          
          // Delete the backup directory
          await fs.rm(filePath, { recursive: true, force: true });
          
          deletedCount++;
          freedSpace += size;
          
          logger.info(`Deleted old backup: ${file} (${formatFileSize(size)})`);
        }
      }
    }

    if (deletedCount > 0) {
      logger.info(`✅ Cleanup completed: Deleted ${deletedCount} old backup(s), freed ${formatFileSize(freedSpace)}`);
    } else {
      logger.info('✅ Cleanup completed: No old backups to delete');
    }

    return {
      deletedCount,
      freedSpace
    };
  } catch (error) {
    logger.error('Error during backup cleanup:', error);
    throw error;
  }
}

/**
 * Get list of existing backups
 */
async function getBackupList() {
  const backupDir = getBackupDirectory();
  
  try {
    const files = await fs.readdir(backupDir);
    const backups = [];

    for (const file of files) {
      const filePath = path.join(backupDir, file);
      const stats = await fs.stat(filePath);
      
      if (stats.isDirectory() && file.startsWith('freshlancer-backup-')) {
        const size = await calculateBackupSize(filePath);
        backups.push({
          name: file,
          path: filePath,
          size,
          sizeFormatted: formatFileSize(size),
          date: stats.mtime,
          age: Math.floor((Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24)) // days
        });
      }
    }

    // Sort by date (newest first)
    backups.sort((a, b) => b.date - a.date);

    return backups;
  } catch (error) {
    logger.error('Error getting backup list:', error);
    return [];
  }
}

/**
 * Send backup completion email notification
 */
async function sendBackupNotification(backupResult, cleanupResult) {
  const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
  
  if (!adminEmail) {
    logger.warn('No admin email configured. Skipping backup notification email.');
    return;
  }

  try {
    const backupList = await getBackupList();
    const totalBackups = backupList.length;
    const totalSize = backupList.reduce((sum, b) => sum + b.size, 0);

    const emailContent = {
      type: 'backup-notification',
      email: adminEmail,
      name: 'Admin',
      backupResult: {
        success: backupResult.success,
        backupName: backupResult.backupName,
        backupSize: backupResult.backupSize,
        backupSizeFormatted: formatFileSize(backupResult.backupSize),
        duration: backupResult.duration,
        timestamp: backupResult.timestamp
      },
      cleanupResult: {
        deletedCount: cleanupResult.deletedCount,
        freedSpace: cleanupResult.freedSpace,
        freedSpaceFormatted: formatFileSize(cleanupResult.freedSpace)
      },
      summary: {
        totalBackups,
        totalSize: formatFileSize(totalSize),
        oldestBackup: backupList.length > 0 ? backupList[backupList.length - 1].name : 'None',
        newestBackup: backupList.length > 0 ? backupList[0].name : 'None'
      }
    };

    await sendEmail(emailContent);
    logger.info('✅ Backup notification email sent to:', adminEmail);
  } catch (error) {
    logger.error('❌ Failed to send backup notification email:', error);
    // Don't throw - backup was successful, email failure shouldn't fail the process
  }
}

/**
 * Main backup function - performs backup, cleanup, and sends notification
 */
async function runDailyBackup() {
  const startTime = Date.now();
  logger.info('\n========================================');
  logger.info('🔄 STARTING DAILY DATABASE BACKUP');
  logger.info('========================================');
  logger.info('Timestamp:', new Date().toISOString());

  try {
    // Perform backup
    const backupResult = await performBackup();

    // Cleanup old backups (keep last 7 days)
    logger.info('\n🧹 Cleaning up old backups (keeping last 7 days)...');
    const cleanupResult = await cleanupOldBackups(7);

    // Send notification email
    logger.info('\n📧 Sending backup notification email...');
    await sendBackupNotification(backupResult, cleanupResult);

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info('\n✅ DAILY BACKUP COMPLETED SUCCESSFULLY');
    logger.info('Total duration:', totalDuration, 'seconds');
    logger.info('========================================\n');

    return {
      success: true,
      backupResult,
      cleanupResult,
      totalDuration: parseFloat(totalDuration)
    };
  } catch (error) {
    logger.error('\n❌ DAILY BACKUP FAILED');
    logger.error('Error:', error.message);
    logger.error('Stack:', error.stack);
    logger.info('========================================\n');

    // Try to send error notification
    try {
      const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
      if (adminEmail) {
        await sendEmail({
          type: 'backup-error',
          email: adminEmail,
          name: 'Admin',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    } catch (emailError) {
      logger.error('Failed to send error notification email:', emailError);
    }

    throw error;
  }
}

module.exports = {
  runDailyBackup,
  performBackup,
  cleanupOldBackups,
  getBackupList,
  formatFileSize
};

