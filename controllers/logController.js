const fs = require('fs').promises;
const path = require('path');
const catchAsync = require('../utils/catchAsync');
const logger = require('../utils/logger');
const AppError = require('../utils/AppError');

/**
 * Log frontend actions to file
 * Logs info, success, warn, and error levels
 */
exports.logFrontendError = catchAsync(async (req, res, next) => {
  const { level, message, action, timestamp, url, userAgent, path: pagePath } = req.body;

  // Validate log level
  const validLevels = ['info', 'success', 'warn', 'error'];
  if (!validLevels.includes(level)) {
    return res.status(200).json({ 
      status: 'success', 
      message: `Invalid log level: ${level}. Valid levels: ${validLevels.join(', ')}` 
    });
  }

  try {
    // Create logs directory if it doesn't exist
    const logDir = path.join(__dirname, '../../logs');
    await fs.mkdir(logDir, { recursive: true });

    // Create log file with date and level (one file per day per level, or combined)
    const date = new Date().toISOString().split('T')[0];
    
    // Option 1: Separate files per level
    // const logFile = path.join(logDir, `frontend-${level}-${date}.log`);
    
    // Option 2: Combined file with all levels (current approach)
    const logFile = path.join(logDir, `frontend-${date}.log`);

    // Format log entry with action if provided
    let logEntry = `[${timestamp}] [${level.toUpperCase()}]`;
    if (action) {
      logEntry += ` [${action}]`;
    }
    logEntry += ` ${pagePath || url}\n`;
    logEntry += `Message: ${message}\n`;
    if (url) {
      logEntry += `URL: ${url}\n`;
    }
    if (userAgent) {
      logEntry += `User-Agent: ${userAgent}\n`;
    }
    logEntry += `---\n\n`;

    // Append to log file
    await fs.appendFile(logFile, logEntry);

    // Also log to server console in development
    if (process.env.NODE_ENV !== 'production') {
      const logMethod = level === 'error' ? logger.error : 
                       level === 'warn' ? logger.warn : 
                       logger.info;
      logMethod(`Frontend ${level.toUpperCase()}: ${message}`, { url, pagePath, action });
    }

    res.status(200).json({
      status: 'success',
      message: `${level} logged successfully`,
    });
  } catch (error) {
    // Log to server console if file logging fails
    logger.error('Failed to log frontend log to file:', error);
    
    // Still return success to avoid breaking frontend
    res.status(200).json({
      status: 'success',
      message: `${level} logged (file logging failed)`,
    });
  }
});

/**
 * Get list of all log files
 * Admin only
 */
exports.getLogFiles = catchAsync(async (req, res, next) => {
  const logDir = path.join(__dirname, '../../logs');

  try {
    // Check if logs directory exists
    await fs.access(logDir);
  } catch (error) {
    return res.status(200).json({
      status: 'success',
      message: 'No log files found. Logs directory does not exist yet.',
      data: {
        files: [],
        totalFiles: 0,
      },
    });
  }

  try {
    const files = await fs.readdir(logDir);
    
    // Filter only frontend log files
    const logFiles = files
      .filter(file => file.startsWith('frontend-') && file.endsWith('.log'))
      .map(file => {
        const dateMatch = file.match(/frontend-(\d{4}-\d{2}-\d{2})\.log/);
        return {
          filename: file,
          date: dateMatch ? dateMatch[1] : null,
          path: path.join(logDir, file),
        };
      })
      .sort((a, b) => {
        // Sort by date descending (newest first)
        if (!a.date || !b.date) return 0;
        return b.date.localeCompare(a.date);
      });

    // Get file stats for each log file
    const filesWithStats = await Promise.all(
      logFiles.map(async (file) => {
        try {
          const stats = await fs.stat(file.path);
          return {
            ...file,
            size: stats.size,
            sizeFormatted: formatFileSize(stats.size),
            lastModified: stats.mtime,
            createdAt: stats.birthtime,
          };
        } catch (error) {
          return {
            ...file,
            size: 0,
            sizeFormatted: '0 B',
            lastModified: null,
            createdAt: null,
          };
        }
      })
    );

    res.status(200).json({
      status: 'success',
      message: `Found ${filesWithStats.length} log file(s)`,
      data: {
        files: filesWithStats,
        totalFiles: filesWithStats.length,
      },
    });
  } catch (error) {
    logger.error('Error reading log directory:', error);
    return next(new AppError('Failed to read log files', 500));
  }
});

/**
 * Get log file content
 * Admin only
 */
exports.getLogFileContent = catchAsync(async (req, res, next) => {
  const { date } = req.params;
  const { limit, offset, search } = req.query;

  // Validate date format
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return next(new AppError('Invalid date format. Use YYYY-MM-DD', 400));
  }

  const logDir = path.join(__dirname, '../../logs');
  const logFile = path.join(logDir, `frontend-${date}.log`);

  try {
    // Check if file exists
    await fs.access(logFile);
  } catch (error) {
    return next(new AppError(`Log file for date ${date} not found`, 404));
  }

  try {
    let content = await fs.readFile(logFile, 'utf-8');

    // Parse log entries
    const entries = parseLogEntries(content);

    // Apply search filter if provided
    let filteredEntries = entries;
    if (search && search.trim()) {
      const searchLower = search.toLowerCase();
      filteredEntries = entries.filter(entry => 
        entry.message.toLowerCase().includes(searchLower) ||
        entry.url.toLowerCase().includes(searchLower) ||
        entry.path.toLowerCase().includes(searchLower) ||
        entry.userAgent.toLowerCase().includes(searchLower)
      );
    }

    // Apply pagination
    const totalEntries = filteredEntries.length;
    const limitNum = limit ? parseInt(limit, 10) : 100;
    const offsetNum = offset ? parseInt(offset, 10) : 0;
    const paginatedEntries = filteredEntries.slice(offsetNum, offsetNum + limitNum);

    // Get file stats
    const stats = await fs.stat(logFile);

    res.status(200).json({
      status: 'success',
      message: `Retrieved ${paginatedEntries.length} log entry(ies) from ${date}`,
      data: {
        date,
        filename: `frontend-${date}.log`,
        entries: paginatedEntries,
        pagination: {
          total: totalEntries,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + limitNum < totalEntries,
        },
        fileInfo: {
          size: stats.size,
          sizeFormatted: formatFileSize(stats.size),
          lastModified: stats.mtime,
        },
      },
    });
  } catch (error) {
    logger.error('Error reading log file:', error);
    return next(new AppError('Failed to read log file', 500));
  }
});

/**
 * Delete log file
 * Admin only
 */
exports.deleteLogFile = catchAsync(async (req, res, next) => {
  const { date } = req.params;

  // Validate date format
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return next(new AppError('Invalid date format. Use YYYY-MM-DD', 400));
  }

  const logDir = path.join(__dirname, '../../logs');
  const logFile = path.join(logDir, `frontend-${date}.log`);

  try {
    // Check if file exists
    await fs.access(logFile);
  } catch (error) {
    return next(new AppError(`Log file for date ${date} not found`, 404));
  }

  try {
    await fs.unlink(logFile);

    res.status(200).json({
      status: 'success',
      message: `Log file for ${date} deleted successfully`,
      data: {
        date,
        deleted: true,
      },
    });
  } catch (error) {
    logger.error('Error deleting log file:', error);
    return next(new AppError('Failed to delete log file', 500));
  }
});

/**
 * Get log statistics
 * Admin only
 */
exports.getLogStats = catchAsync(async (req, res, next) => {
  const logDir = path.join(__dirname, '../../logs');

  try {
    await fs.access(logDir);
  } catch (error) {
    return res.status(200).json({
      status: 'success',
      message: 'No logs found',
      data: {
        totalFiles: 0,
        totalSize: 0,
        totalSizeFormatted: '0 B',
        totalEntries: 0,
        errorsByDate: [],
        recentErrors: [],
      },
    });
  }

  try {
    const files = await fs.readdir(logDir);
    const logFiles = files.filter(file => file.startsWith('frontend-') && file.endsWith('.log'));

    let totalSize = 0;
    let totalEntries = 0;
    const errorsByDate = [];
    const recentErrors = [];

    for (const file of logFiles) {
      const filePath = path.join(logDir, file);
      try {
        const stats = await fs.stat(filePath);
        totalSize += stats.size;

        const content = await fs.readFile(filePath, 'utf-8');
        const entries = parseLogEntries(content);
        totalEntries += entries.length;

        const dateMatch = file.match(/frontend-(\d{4}-\d{2}-\d{2})\.log/);
        if (dateMatch) {
          errorsByDate.push({
            date: dateMatch[1],
            count: entries.length,
            size: stats.size,
            sizeFormatted: formatFileSize(stats.size),
          });

          // Get recent errors (last 10)
          recentErrors.push(...entries.slice(-10));
        }
      } catch (error) {
        logger.error(`Error processing log file ${file}:`, error);
      }
    }

    // Sort errors by date descending
    errorsByDate.sort((a, b) => b.date.localeCompare(a.date));

    // Sort recent errors by timestamp descending and take top 20
    recentErrors.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const topRecentErrors = recentErrors.slice(0, 20);

    res.status(200).json({
      status: 'success',
      message: 'Log statistics retrieved successfully',
      data: {
        totalFiles: logFiles.length,
        totalSize,
        totalSizeFormatted: formatFileSize(totalSize),
        totalEntries,
        errorsByDate: errorsByDate.slice(0, 30), // Last 30 days
        recentErrors: topRecentErrors,
      },
    });
  } catch (error) {
    logger.error('Error getting log statistics:', error);
    return next(new AppError('Failed to get log statistics', 500));
  }
});

// Helper function to parse log entries
function parseLogEntries(content) {
  const entries = [];
  const entryBlocks = content.split('---\n\n').filter(block => block.trim());

  for (const block of entryBlocks) {
    const lines = block.trim().split('\n');
    const entry = {
      timestamp: null,
      level: null,
      action: null,
      path: null,
      message: null,
      url: null,
      userAgent: null,
      raw: block.trim(),
    };

    for (const line of lines) {
      if (line.startsWith('[') && line.includes(']')) {
        const timestampMatch = line.match(/\[([^\]]+)\]/g);
        if (timestampMatch) {
          // First bracket is timestamp
          entry.timestamp = timestampMatch[0].replace(/[\[\]]/g, '');
          
          // Second bracket is level
          if (timestampMatch.length >= 2) {
            entry.level = timestampMatch[1].replace(/[\[\]]/g, '').toUpperCase();
          }
          
          // Third bracket (if exists) is action
          if (timestampMatch.length >= 3) {
            entry.action = timestampMatch[2].replace(/[\[\]]/g, '');
          }
          
          // Path is everything after the last bracket
          const lastBracketIndex = line.lastIndexOf(']');
          if (lastBracketIndex !== -1) {
            entry.path = line.substring(lastBracketIndex + 1).trim();
          }
        }
      } else if (line.startsWith('Message:')) {
        entry.message = line.replace('Message:', '').trim();
      } else if (line.startsWith('URL:')) {
        entry.url = line.replace('URL:', '').trim();
      } else if (line.startsWith('User-Agent:')) {
        entry.userAgent = line.replace('User-Agent:', '').trim();
      }
    }

    if (entry.timestamp || entry.message) {
      entries.push(entry);
    }
  }

  return entries;
}

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

