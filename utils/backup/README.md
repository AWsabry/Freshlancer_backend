# Database Backup System

This system automatically creates daily backups of the MongoDB database and sends email notifications.

## Features

- **Daily Backups**: Automatically creates backups every day at 2:00 AM (Egypt time)
- **Automatic Cleanup**: Removes backups older than 7 days to save storage space
- **Email Notifications**: Sends email notifications when backups complete (success or failure)
- **Backup Management**: Stores backups in `FreeStudent-API/backups/` directory

## Quick Installation

### Automated Installation Script

We've provided an installation script that automatically detects your OS and installs MongoDB tools:

```bash
cd FreeStudent-API/utils/backup
chmod +x install-mongodb-tools.sh
sudo ./install-mongodb-tools.sh
```

This script will:
- Detect your Linux distribution and version
- Download and install the appropriate MongoDB database tools
- Verify the installation

### Manual Installation

If the automated script doesn't work, see the detailed installation instructions below.

## Configuration

### Environment Variables

Add the following to your `config.env` file:

```env
# Admin Email for Backup Notifications
ADMIN_EMAIL=your-email@example.com
```

If `ADMIN_EMAIL` is not set, the system will use `SMTP_USER` as the notification email address.

### MongoDB Tools Required

The backup system requires `mongodump` to be installed on the server.

#### Method 1: Download and Install Manually (Recommended - Works on all Linux versions)

**For Linux (Ubuntu, Debian, CentOS, RHEL, etc.):**

1. **Download MongoDB Database Tools:**
   ```bash
   # Create a temporary directory
   cd /tmp
   
   # Download the latest version (adjust version number if needed)
   wget https://fastdl.mongodb.org/tools/db/mongodb-database-tools-ubuntu2204-x86_64-100.9.1.tgz
   
   # Or for older Ubuntu versions, try:
   # wget https://fastdl.mongodb.org/tools/db/mongodb-database-tools-ubuntu2004-x86_64-100.9.1.tgz
   # wget https://fastdl.mongodb.org/tools/db/mongodb-database-tools-ubuntu1804-x86_64-100.9.1.tgz
   ```

2. **Extract and Install:**
   ```bash
   # Extract the archive
   tar -xzf mongodb-database-tools-*-x86_64-*.tgz
   
   # Copy binaries to /usr/local/bin (or another directory in your PATH)
   sudo cp mongodb-database-tools-*/bin/* /usr/local/bin/
   
   # Verify installation
   mongodump --version
   ```

**Alternative: Use MongoDB's official repository (for newer Ubuntu versions):**

```bash
# Import MongoDB public GPG key
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -

# Add MongoDB repository (adjust for your Ubuntu version)
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# Update package list
sudo apt-get update

# Install MongoDB database tools
sudo apt-get install -y mongodb-database-tools
```

**For CentOS/RHEL/Fedora:**
```bash
# Create MongoDB repository file
sudo vi /etc/yum.repos.d/mongodb-org-7.0.repo

# Add the following content:
[mongodb-org-7.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/redhat/$releasever/mongodb-org/7.0/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://www.mongodb.org/static/pgp/server-7.0.asc

# Install
sudo yum install -y mongodb-database-tools
```

**For macOS:**
```bash
# Using Homebrew
brew install mongodb-database-tools

# Or download manually from:
# https://www.mongodb.com/try/download/database-tools
```

**For Windows:**
1. Download from: https://www.mongodb.com/try/download/database-tools
2. Extract to a folder (e.g., `C:\mongodb-database-tools`)
3. Add the `bin` folder to your system PATH

#### Method 2: Check Your Ubuntu Version and Use Appropriate Command

```bash
# Check your Ubuntu version
lsb_release -a

# For Ubuntu 22.04 (Jammy)
sudo apt-get install mongodb-database-tools

# For Ubuntu 20.04 (Focal) - if available
sudo apt-get install mongodb-database-tools

# For older versions, use Method 1 (manual download)
```

#### Verify Installation

After installation, verify that `mongodump` is available:
```bash
mongodump --version
```

You should see output like:
```
mongodump version: 100.9.1
```

## Backup Schedule

- **Time**: Daily at 2:00 AM (Egypt time / Africa/Cairo timezone)
- **Retention**: Backups are kept for 7 days
- **Location**: `FreeStudent-API/backups/freshlancer-backup-YYYY-MM-DD/`

## Manual Backup

You can manually trigger a backup by running:

```javascript
const { runDailyBackup } = require('./utils/backup/databaseBackup');
runDailyBackup();
```

Or create a test script:

```javascript
// test-backup.js
require('dotenv').config({ path: './config.env' });
const { runDailyBackup } = require('./utils/backup/databaseBackup');

runDailyBackup()
  .then(result => {
    console.log('Backup completed:', result);
    process.exit(0);
  })
  .catch(error => {
    console.error('Backup failed:', error);
    process.exit(1);
  });
```

## Email Notifications

### Success Notification
When a backup completes successfully, you'll receive an email with:
- Backup name and size
- Duration of backup process
- Cleanup summary (old backups deleted, space freed)
- Storage summary (total backups, total storage used)

### Error Notification
If a backup fails, you'll receive an error notification with:
- Error message
- Timestamp
- Instructions to check server logs

## Backup Structure

```
FreeStudent-API/
  backups/
    freshlancer-backup-2025-01-15/
      Freshlancer/
        (database collections and data)
    freshlancer-backup-2025-01-16/
      Freshlancer/
        (database collections and data)
    ...
```

## Restoring from Backup

To restore a backup, use `mongorestore`:

```bash
# Restore from a specific backup
mongorestore --uri="mongodb+srv://user:password@cluster.mongodb.net/Freshlancer" \
  backups/freshlancer-backup-2025-01-15/Freshlancer
```

## Troubleshooting

### Backup Fails with "mongodump: command not found"
- Install MongoDB database tools (see above)
- Ensure `mongodump` is in your system PATH

### Backup Fails with Authentication Error
- Verify your `DATABASE` connection string in `config.env` is correct
- Ensure the database user has read permissions

### Email Notifications Not Received
- Check `ADMIN_EMAIL` or `SMTP_USER` is set correctly
- Verify SMTP settings are correct
- Check server logs for email sending errors

### Backups Taking Too Long
- Large databases may take time to backup
- Consider running backups during off-peak hours
- Check server resources (CPU, memory, disk I/O)

## Notes

- Backups are stored locally on the server
- For production, consider also backing up to cloud storage (AWS S3, Google Cloud Storage, etc.)
- The backup directory is automatically created if it doesn't exist
- Backups older than 7 days are automatically deleted

