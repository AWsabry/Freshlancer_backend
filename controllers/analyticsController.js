const User = require('../models/userModel');
const JobPost = require('../models/jobPostModel');
const JobApplication = require('../models/jobApplicationModel');
const Transaction = require('../models/transactionModel');
const Subscription = require('../models/subscriptionModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// Get comprehensive analytics data
exports.getAnalytics = catchAsync(async (req, res, next) => {
  const { startDate, endDate, period = 'month' } = req.query;

  // Set default date range (last 12 months if not specified)
  const defaultEndDate = new Date();
  const defaultStartDate = new Date();
  defaultStartDate.setMonth(defaultStartDate.getMonth() - 12);

  const start = startDate ? new Date(startDate) : defaultStartDate;
  const end = endDate ? new Date(endDate) : defaultEndDate;

  // User Growth Analytics
  const userGrowth = await getUserGrowth(start, end, period);
  
  // Revenue Analytics
  const revenueAnalytics = await getRevenueAnalytics(start, end, period);
  
  // Job Posting Analytics
  const jobAnalytics = await getJobAnalytics(start, end, period);
  
  // Application Analytics
  const applicationAnalytics = await getApplicationAnalytics(start, end, period);
  
  // Category Performance
  const categoryPerformance = await getCategoryPerformance(start, end);
  
  // Conversion Rates
  const conversionRates = await getConversionRates(start, end);
  
  // User Demographics
  const userDemographics = await getUserDemographics();
  
  // Top Performing Metrics
  const topMetrics = await getTopMetrics(start, end);

  res.status(200).json({
    status: 'success',
    data: {
      period,
      dateRange: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      userGrowth,
      revenueAnalytics,
      jobAnalytics,
      applicationAnalytics,
      categoryPerformance,
      conversionRates,
      userDemographics,
      topMetrics,
    },
  });
});

// Helper function to get user growth data
async function getUserGrowth(startDate, endDate, period) {
  const dateFormat = getDateFormat(period);
  const matchStage = {
    createdAt: {
      $gte: startDate,
      $lte: endDate,
    },
  };

  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: {
          $dateToString: { format: dateFormat, date: '$createdAt' },
        },
        count: { $sum: 1 },
        students: {
          $sum: { $cond: [{ $eq: ['$role', 'student'] }, 1, 0] },
        },
        clients: {
          $sum: { $cond: [{ $eq: ['$role', 'client'] }, 1, 0] },
        },
      },
    },
    { $sort: { _id: 1 } },
  ];

  const growthData = await User.aggregate(pipeline);

  // Get total counts
  const totalUsers = await User.countDocuments({ active: { $ne: false } });
  const totalStudents = await User.countDocuments({ role: 'student', active: { $ne: false } });
  const totalClients = await User.countDocuments({ role: 'client', active: { $ne: false } });

  return {
    timeline: growthData.map(item => ({
      date: item._id,
      total: item.count,
      students: item.students,
      clients: item.clients,
    })),
    totals: {
      total: totalUsers,
      students: totalStudents,
      clients: totalClients,
    },
  };
}

// Helper function to get revenue analytics
async function getRevenueAnalytics(startDate, endDate, period) {
  const dateFormat = getDateFormat(period);
  const matchStage = {
    createdAt: {
      $gte: startDate,
      $lte: endDate,
    },
    status: 'completed',
    type: 'package_purchase',
  };

  // Timeline data grouped by date and currency
  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: dateFormat, date: '$createdAt' } },
          currency: '$currency',
        },
        revenue: { $sum: '$amount' },
        transactions: { $sum: 1 },
      },
    },
    { $sort: { '_id.date': 1, '_id.currency': 1 } },
  ];

  const revenueDataByCurrency = await Transaction.aggregate(pipeline);

  // Group timeline data by date
  const timelineMap = new Map();
  revenueDataByCurrency.forEach(item => {
    const date = item._id.date;
    const currency = item._id.currency || 'USD';
    const revenue = item.revenue || 0;
    
    if (!timelineMap.has(date)) {
      timelineMap.set(date, {
        date,
        revenueUSD: 0,
        revenueEGP: 0,
        revenue: 0,
        transactions: 0,
      });
    }
    
    const timelineItem = timelineMap.get(date);
    if (currency === 'EGP') {
      timelineItem.revenueEGP += revenue;
    } else {
      timelineItem.revenueUSD += revenue;
    }
    timelineItem.revenue += revenue;
    timelineItem.transactions += item.transactions || 0;
  });

  const timeline = Array.from(timelineMap.values());

  // Get total revenue by currency
  const totalRevenueByCurrency = await Transaction.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$currency',
        totalRevenue: { $sum: '$amount' },
        totalTransactions: { $sum: 1 },
      },
    },
  ]);

  // Calculate totals
  let totalRevenueUSD = 0;
  let totalRevenueEGP = 0;
  let totalTransactions = 0;

  totalRevenueByCurrency.forEach(item => {
    const currency = item._id || 'USD';
    const revenue = item.totalRevenue || 0;
    const transactions = item.totalTransactions || 0;
    
    if (currency === 'EGP') {
      totalRevenueEGP += revenue;
    } else {
      totalRevenueUSD += revenue;
    }
    totalTransactions += transactions;
  });

  const totalRevenue = totalRevenueUSD + totalRevenueEGP;
  const avgTransaction = totalTransactions > 0 ? (totalRevenue / totalTransactions) : 0;

  return {
    timeline,
    totals: {
      totalRevenue,
      totalRevenueUSD,
      totalRevenueEGP,
      totalTransactions,
      avgTransaction,
    },
  };
}

// Helper function to get job analytics
async function getJobAnalytics(startDate, endDate, period) {
  const dateFormat = getDateFormat(period);
  const matchStage = {
    createdAt: {
      $gte: startDate,
      $lte: endDate,
    },
  };

  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: {
          $dateToString: { format: dateFormat, date: '$createdAt' },
        },
        total: { $sum: 1 },
        open: {
          $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] },
        },
        inProgress: {
          $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] },
        },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
        },
      },
    },
    { $sort: { _id: 1 } },
  ];

  const jobData = await JobPost.aggregate(pipeline);

  // Get totals
  const totalJobs = await JobPost.countDocuments();
  const openJobs = await JobPost.countDocuments({ status: 'open' });
  const inProgressJobs = await JobPost.countDocuments({ status: 'in_progress' });
  const completedJobs = await JobPost.countDocuments({ status: 'completed' });

  return {
    timeline: jobData.map(item => ({
      date: item._id,
      total: item.total || 0,
      open: item.open || 0,
      inProgress: item.inProgress || 0,
      completed: item.completed || 0,
    })),
    totals: {
      total: totalJobs,
      open: openJobs,
      inProgress: inProgressJobs,
      completed: completedJobs,
    },
  };
}

// Helper function to get application analytics
async function getApplicationAnalytics(startDate, endDate, period) {
  const dateFormat = getDateFormat(period);
  const matchStage = {
    createdAt: {
      $gte: startDate,
      $lte: endDate,
    },
  };

  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: {
          $dateToString: { format: dateFormat, date: '$createdAt' },
        },
        total: { $sum: 1 },
        pending: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
        },
        accepted: {
          $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] },
        },
        rejected: {
          $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] },
        },
      },
    },
    { $sort: { _id: 1 } },
  ];

  const applicationData = await JobApplication.aggregate(pipeline);

  // Get totals
  const totalApplications = await JobApplication.countDocuments();
  const pendingApplications = await JobApplication.countDocuments({ status: 'pending' });
  const acceptedApplications = await JobApplication.countDocuments({ status: 'accepted' });
  const rejectedApplications = await JobApplication.countDocuments({ status: 'rejected' });

  return {
    timeline: applicationData.map(item => ({
      date: item._id,
      total: item.total || 0,
      pending: item.pending || 0,
      accepted: item.accepted || 0,
      rejected: item.rejected || 0,
    })),
    totals: {
      total: totalApplications,
      pending: pendingApplications,
      accepted: acceptedApplications,
      rejected: rejectedApplications,
    },
  };
}

// Helper function to get category performance
async function getCategoryPerformance(startDate, endDate) {
  const matchStage = {
    createdAt: {
      $gte: startDate,
      $lte: endDate,
    },
  };

  // Get jobs by category
  const jobsByCategory = await JobPost.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$category',
        jobCount: { $sum: 1 },
      },
    },
    { $sort: { jobCount: -1 } },
    { $limit: 10 },
  ]);

  // Get application counts for each category
  const categoryNames = jobsByCategory.map(c => c._id).filter(Boolean);
  
  if (categoryNames.length === 0) {
    return [];
  }

  const applicationsByCategory = await JobApplication.aggregate([
    {
      $lookup: {
        from: 'jobposts',
        localField: 'jobPost',
        foreignField: '_id',
        as: 'job',
      },
    },
    { $unwind: '$job' },
    {
      $match: {
        'job.category': { $in: categoryNames },
        createdAt: {
          $gte: startDate,
          $lte: endDate,
        },
      },
    },
    {
      $group: {
        _id: '$job.category',
        applicationCount: { $sum: 1 },
      },
    },
  ]);

  // Combine data
  const categoryMap = new Map();
  jobsByCategory.forEach(cat => {
    if (cat._id) {
      categoryMap.set(cat._id, { 
        category: cat._id, 
        jobCount: cat.jobCount, 
        applicationCount: 0 
      });
    }
  });
  applicationsByCategory.forEach(app => {
    if (app._id && categoryMap.has(app._id)) {
      categoryMap.get(app._id).applicationCount = app.applicationCount;
    }
  });

  return Array.from(categoryMap.values());
}

// Helper function to get conversion rates
async function getConversionRates(startDate, endDate) {
  const totalJobs = await JobPost.countDocuments({
    createdAt: { $gte: startDate, $lte: endDate },
  });

  const jobsWithApplications = await JobPost.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $lookup: {
        from: 'jobapplications',
        localField: '_id',
        foreignField: 'jobPost',
        as: 'applications',
      },
    },
    {
      $match: {
        applications: { $ne: [] },
      },
    },
    {
      $count: 'count',
    },
  ]);

  const jobsWithApps = jobsWithApplications[0]?.count || 0;
  const jobToApplicationRate = totalJobs > 0 ? (jobsWithApps / totalJobs) * 100 : 0;

  const totalApplications = await JobApplication.countDocuments({
    createdAt: { $gte: startDate, $lte: endDate },
  });

  const acceptedApplications = await JobApplication.countDocuments({
    status: 'accepted',
    createdAt: { $gte: startDate, $lte: endDate },
  });

  const applicationToAcceptanceRate = totalApplications > 0 
    ? (acceptedApplications / totalApplications) * 100 
    : 0;

  return {
    jobToApplicationRate: parseFloat(jobToApplicationRate.toFixed(2)),
    applicationToAcceptanceRate: parseFloat(applicationToAcceptanceRate.toFixed(2)),
    totalJobs,
    jobsWithApplications: jobsWithApps,
    totalApplications,
    acceptedApplications,
  };
}

// Helper function to get user demographics
async function getUserDemographics() {
  const nationalityData = await User.aggregate([
    {
      $match: {
        active: { $ne: false },
        nationality: { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: '$nationality',
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);

  const roleDistribution = await User.aggregate([
    {
      $match: {
        active: { $ne: false },
      },
    },
    {
      $group: {
        _id: '$role',
        count: { $sum: 1 },
      },
    },
  ]);

  return {
    topNationalities: nationalityData.map(item => ({
      nationality: item._id || 'Unknown',
      count: item.count,
    })),
    roleDistribution: roleDistribution.map(item => ({
      role: item._id,
      count: item.count,
    })),
  };
}

// Helper function to get top metrics
async function getTopMetrics(startDate, endDate) {
  // Top clients by job posts
  const topClients = await JobPost.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: '$client',
        jobCount: { $sum: 1 },
      },
    },
    { $sort: { jobCount: -1 } },
    { $limit: 5 },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'clientInfo',
      },
    },
    { $unwind: '$clientInfo' },
    {
      $project: {
        clientName: '$clientInfo.name',
        clientEmail: '$clientInfo.email',
        jobCount: 1,
      },
    },
  ]);

  // Top students by applications
  const topStudents = await JobApplication.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: '$student',
        applicationCount: { $sum: 1 },
      },
    },
    { $sort: { applicationCount: -1 } },
    { $limit: 5 },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'studentInfo',
      },
    },
    { $unwind: '$studentInfo' },
    {
      $project: {
        studentName: '$studentInfo.name',
        studentEmail: '$studentInfo.email',
        applicationCount: 1,
      },
    },
  ]);

  return {
    topClients,
    topStudents,
  };
}

// Helper function to get date format based on period
function getDateFormat(period) {
  switch (period) {
    case 'day':
      return '%Y-%m-%d';
    case 'week':
      return '%Y-W%V';
    case 'month':
      return '%Y-%m';
    case 'year':
      return '%Y';
    default:
      return '%Y-%m';
  }
}

