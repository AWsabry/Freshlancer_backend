const Appeal = require('../models/appealModel');
const { Contract } = require('../models/contractModel');
const User = require('../models/userModel');
const Transaction = require('../models/transactionModel');
const Notification = require('../models/notificationModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const sendEmail = require('../utils/email');
const logger = require('../utils/logger');
const { getIO } = require('../websocket');

const roundMoney = (amount) => Math.round((Number(amount) || 0) * 100) / 100;

const getMapValue = (map, key) => (map?.get ? map.get(key) || 0 : map?.[key] || 0);
const setMapValue = (map, key, val) => {
  if (map?.set) {
    map.set(key, val);
    return;
  }
  map[key] = val;
};

// Helper to check if contract has active appeal
exports.checkAppealFreeze = catchAsync(async (contractId) => {
  const hasActive = await Appeal.hasActiveAppeal(contractId);
  if (hasActive) {
    throw AppError.badRequest(
      'This contract has an active appeal. All operations are frozen until the appeal is resolved.',
      'CONTRACT_FROZEN_BY_APPEAL'
    );
  }
});

// Create appeal
exports.createAppeal = catchAsync(async (req, res, next) => {
  const { contractId, reason, description } = req.body;

  if (!contractId || !reason || !description) {
    return next(AppError.badRequest('Contract ID, reason, and description are required', 'APPEAL_MISSING_FIELDS'));
  }

  // Get contract
  const contract = await Contract.findById(contractId);
  if (!contract) {
    return next(AppError.notFound('Contract not found', 'CONTRACT_NOT_FOUND'));
  }

  // Verify user is party to contract
  const isClient = String(contract.client._id || contract.client) === String(req.user._id);
  const isStudent = String(contract.student._id || contract.student) === String(req.user._id);

  if (!isClient && !isStudent) {
    return next(AppError.forbidden('You must be a party to this contract to file an appeal', 'APPEAL_NOT_PARTY'));
  }

  // Check if contract already has active appeal
  const hasActive = await Appeal.hasActiveAppeal(contractId);
  if (hasActive) {
    return next(AppError.badRequest('This contract already has an active appeal', 'APPEAL_ALREADY_EXISTS'));
  }

  // Determine opener and respondent
  const opener = req.user._id;
  const respondent = isClient ? contract.student._id || contract.student : contract.client._id || contract.client;

  // Create appeal
  const appeal = await Appeal.create({
    contract: contractId,
    opener,
    respondent,
    reason,
    description: description.trim(),
    status: 'open',
  });

  // Update contract with active appeal
  contract.activeAppeal = appeal._id;
  await contract.save();

  // Notify respondent
  const frontendUrl = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://freshlancer.online' : 'http://localhost:3000');
  const respondentUser = await User.findById(respondent);

  try {
    const appealPath = `/${respondentUser?.role || 'student'}/appeals?appealId=${appeal._id}`;
    await Notification.create({
      user: respondent,
      type: 'appeal_created',
      title: 'Appeal Filed Against You',
      message: `${req.user.name} has filed an appeal regarding your contract. Please review and respond.`,
      relatedId: appeal._id,
      relatedType: 'Appeal',
      actionUrl: `${frontendUrl}${appealPath}`,
      icon: 'alert',
    });

    if (respondentUser?.email) {
      sendEmail({
        type: 'appeal-created',
        email: respondentUser.email,
        name: respondentUser.name,
        openerName: req.user.name,
        contractId: contractId,
        appealId: appeal._id.toString(),
        reason,
        description: description.trim(),
        dashboardUrl: `${frontendUrl}${appealPath}`,
      }).catch((e) => logger.error('❌ Failed to send appeal-created email:', e.message));
    }
  } catch (e) {
    logger.error('❌ Failed to notify respondent about appeal:', e.message);
  }

  res.status(201).json({
    status: 'success',
    data: { appeal },
    message: 'Appeal created successfully. The contract is now frozen until the appeal is resolved.',
  });
});

// Get my appeals
exports.getMyAppeals = catchAsync(async (req, res, next) => {
  const appeals = await Appeal.find({
    $or: [{ opener: req.user._id }, { respondent: req.user._id }],
  })
    .sort('-createdAt')
    .populate('contract', 'status totalAmount currency projectDescription');

  res.status(200).json({
    status: 'success',
    results: appeals.length,
    data: { appeals },
  });
});

// Get appeal by ID
exports.getAppeal = catchAsync(async (req, res, next) => {
  const appeal = await Appeal.findById(req.params.id);

  if (!appeal) {
    return next(AppError.notFound('Appeal not found', 'APPEAL_NOT_FOUND'));
  }

  // Verify user is party to appeal or admin
  if (req.user.role !== 'admin' && !appeal.isParty(req.user._id)) {
    return next(AppError.forbidden('You do not have access to this appeal', 'APPEAL_ACCESS_DENIED'));
  }

  res.status(200).json({
    status: 'success',
    data: { appeal },
  });
});

// Upload document to appeal
exports.uploadDocument = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(AppError.badRequest('Please upload a file', 'APPEAL_NO_FILE'));
  }

  const appeal = await Appeal.findById(req.params.id);
  if (!appeal) {
    return next(AppError.notFound('Appeal not found', 'APPEAL_NOT_FOUND'));
  }

  // Verify user is party to appeal
  if (req.user.role !== 'admin' && !appeal.isParty(req.user._id)) {
    return next(AppError.forbidden('You do not have access to this appeal', 'APPEAL_ACCESS_DENIED'));
  }

  // Block uploads when appeal is cancelled or messaging is disabled (open/in_review only)
  if (appeal.status !== 'open' && appeal.status !== 'in_review') {
    return next(
      AppError.badRequest(
        'Document upload is not allowed when the appeal is cancelled or messaging is disabled.',
        'APPEAL_UPLOAD_DISABLED'
      )
    );
  }

  // Check document limit
  if (appeal.documents.length >= 10) {
    return next(AppError.badRequest('Maximum 10 documents allowed per appeal', 'APPEAL_DOCUMENT_LIMIT'));
  }

  const filePath = `/uploads/appeal-documents/${req.file.filename}`;
  const document = {
    filename: req.file.originalname,
    url: filePath,
    uploadedBy: req.user._id,
    uploadedAt: Date.now(),
    description: req.body.description?.trim() || '',
  };

  appeal.documents.push(document);
  await appeal.save();

  res.status(200).json({
    status: 'success',
    data: { document, totalDocuments: appeal.documents.length },
    message: 'Document uploaded successfully',
  });
});

// Send message in appeal chat
exports.sendMessage = catchAsync(async (req, res, next) => {
  const { content } = req.body;

  if (!content || !content.trim()) {
    return next(AppError.badRequest('Message content is required', 'APPEAL_MESSAGE_EMPTY'));
  }

  const appeal = await Appeal.findById(req.params.id);
  if (!appeal) {
    return next(AppError.notFound('Appeal not found', 'APPEAL_NOT_FOUND'));
  }

  // Verify user is party to appeal or admin
  if (req.user.role !== 'admin' && !appeal.isParty(req.user._id)) {
    return next(AppError.forbidden('You do not have access to this appeal', 'APPEAL_ACCESS_DENIED'));
  }

  const message = {
    sender: req.user._id,
    content: content.trim(),
    attachments: req.body.attachments || [],
    timestamp: Date.now(),
    isRead: false,
  };

  appeal.messages.push(message);
  await appeal.save();

  // Emit via WebSocket
  try {
    const io = getIO();
    const room = `appeal-${appeal._id}`;
    const populatedMessage = await Appeal.findById(appeal._id).populate('messages.sender', 'name email photo role');
    const lastMessage = populatedMessage.messages[populatedMessage.messages.length - 1];

    io.to(room).emit('new-message', {
      _id: lastMessage._id,
      sender: {
        id: lastMessage.sender._id.toString(),
        name: lastMessage.sender.name,
        email: lastMessage.sender.email,
        role: lastMessage.sender.role,
      },
      content: lastMessage.content,
      attachments: lastMessage.attachments,
      timestamp: lastMessage.timestamp,
      isRead: lastMessage.isRead,
    });
  } catch (e) {
    logger.error('❌ Failed to emit WebSocket message:', e.message);
  }

  // Notify other party
  const otherPartyId = String(appeal.opener._id || appeal.opener) === String(req.user._id)
    ? appeal.respondent._id || appeal.respondent
    : appeal.opener._id || appeal.opener;

  const frontendUrl = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://freshlancer.online' : 'http://localhost:3000');

  try {
    const otherParty = await User.findById(otherPartyId).select('role email name');
    const role = otherParty?.role || 'student';
    const appealPath = `/${role}/appeals?appealId=${appeal._id}`;
    await Notification.create({
      user: otherPartyId,
      type: 'appeal_message',
      title: 'New Message in Appeal',
      message: `${req.user.name} sent a message in the appeal chat.`,
      relatedId: appeal._id,
      relatedType: 'Appeal',
      actionUrl: `${frontendUrl}${appealPath}`,
      icon: 'message',
    });

    if (otherParty?.email) {
      sendEmail({
        type: 'appeal-message',
        email: otherParty.email,
        name: otherParty.name,
        senderName: req.user.name,
        appealId: appeal._id.toString(),
        dashboardUrl: `${frontendUrl}${appealPath}`,
      }).catch((e) => logger.error('❌ Failed to send appeal-message email:', e.message));
    }
  } catch (e) {
    logger.error('❌ Failed to notify about appeal message:', e.message);
  }

  res.status(200).json({
    status: 'success',
    data: { message },
    message: 'Message sent successfully',
  });
});

// Close appeal (opener only)
exports.closeAppeal = catchAsync(async (req, res, next) => {
  const appeal = await Appeal.findById(req.params.id);
  if (!appeal) {
    return next(AppError.notFound('Appeal not found', 'APPEAL_NOT_FOUND'));
  }

  // Only opener can close
  if (String(appeal.opener._id || appeal.opener) !== String(req.user._id)) {
    return next(AppError.forbidden('Only the appeal opener can close the appeal', 'APPEAL_CLOSE_FORBIDDEN'));
  }

  if (appeal.status !== 'open') {
    return next(AppError.badRequest('Only open appeals can be closed', 'APPEAL_NOT_OPEN'));
  }

  appeal.status = 'closed_by_opener';
  await appeal.save();

  // Clear contract activeAppeal
  const contract = await Contract.findById(appeal.contract);
  if (contract) {
    contract.activeAppeal = null;
    await contract.save();
  }

  // Notify respondent
  const frontendUrl = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://freshlancer.online' : 'http://localhost:3000');
  const respondent = await User.findById(appeal.respondent).select('role email name');
  const respondentRole = respondent?.role || 'student';
  const appealPath = `/${respondentRole}/appeals?appealId=${appeal._id}`;

  try {
    await Notification.create({
      user: appeal.respondent,
      type: 'appeal_closed',
      title: 'Appeal Closed',
      message: `${req.user.name} has closed the appeal. The contract is now active again.`,
      relatedId: appeal._id,
      relatedType: 'Appeal',
      actionUrl: `${frontendUrl}${appealPath}`,
      icon: 'check',
    });

    if (respondent?.email) {
      sendEmail({
        type: 'appeal-closed',
        email: respondent.email,
        name: respondent.name,
        openerName: req.user.name,
        appealId: appeal._id.toString(),
        dashboardUrl: `${frontendUrl}${appealPath}`,
      }).catch((e) => logger.error('❌ Failed to send appeal-closed email:', e.message));
    }
  } catch (e) {
    logger.error('❌ Failed to notify about appeal closure:', e.message);
  }

  res.status(200).json({
    status: 'success',
    data: { appeal },
    message: 'Appeal closed successfully. The contract is now active again.',
  });
});

// Cancel contract during appeal (both parties can request, but both must agree or admin can force)
exports.cancelContract = catchAsync(async (req, res, next) => {
  const appeal = await Appeal.findById(req.params.id);
  if (!appeal) {
    return next(AppError.notFound('Appeal not found', 'APPEAL_NOT_FOUND'));
  }

  // Verify user is party to appeal or admin
  if (req.user.role !== 'admin' && !appeal.isParty(req.user._id)) {
    return next(AppError.forbidden('You do not have access to this appeal', 'APPEAL_ACCESS_DENIED'));
  }

  const contract = await Contract.findById(appeal.contract);
  if (!contract) {
    return next(AppError.notFound('Contract not found', 'CONTRACT_NOT_FOUND'));
  }

  // Only clients and admins can cancel contracts (students cannot)
  if (req.user.role !== 'admin') {
    // Check if user is the client
    const isClient = String(contract.client._id || contract.client) === String(req.user._id);
    if (!isClient) {
      return next(AppError.forbidden('Only the client can cancel the contract during an appeal', 'CONTRACT_CANCEL_FORBIDDEN'));
    }
  }

  // Calculate total escrow to refund
  const fundedMilestones = contract.milestones.filter((m) => m.state.status === 'funded' || m.state.status === 'submitted' || m.state.status === 'approved');
  const escrowByCurrency = {};

  fundedMilestones.forEach((milestone) => {
    const currency = contract.currency;
    const amount = roundMoney(milestone.state.fundedAmount || milestone.state.amount || 0);
    if (amount > 0) {
      escrowByCurrency[currency] = (escrowByCurrency[currency] || 0) + amount;
    }
  });

  // Refund escrow to client
  const client = await User.findById(contract.client);
  if (!client) {
    return next(AppError.serverError('Client not found', 'CLIENT_NOT_FOUND'));
  }

  if (!client.wallet) client.wallet = {};
  if (!client.wallet.balances) client.wallet.balances = new Map();
  if (!client.wallet.escrow) client.wallet.escrow = new Map();

  // Process refunds for each currency
  const refundTransactions = [];

  for (const [currency, totalAmount] of Object.entries(escrowByCurrency)) {
    if (totalAmount <= 0) continue;

    const currentEscrow = getMapValue(client.wallet.escrow, currency);
    const refundAmount = roundMoney(Math.min(totalAmount, currentEscrow));

    if (refundAmount > 0) {
      // Move from escrow to balance
      setMapValue(client.wallet.escrow, currency, roundMoney(currentEscrow - refundAmount));
      const currentBalance = getMapValue(client.wallet.balances, currency);
      setMapValue(client.wallet.balances, currency, roundMoney(currentBalance + refundAmount));

      // Create refund transaction
      const refundTx = await Transaction.create({
        user: contract.client,
        type: 'escrow_refund',
        amount: refundAmount,
        currency,
        status: 'completed',
        paymentGateway: 'wallet',
        paymentMethod: 'wallet',
        relatedId: contract._id,
        relatedType: 'Contract',
        description: `Escrow refund for cancelled contract (Appeal ID: ${appeal._id})`,
        metadata: {
          appealId: appeal._id.toString(),
          contractId: contract._id.toString(),
          refundReason: 'contract_cancelled_during_appeal',
        },
      });

      refundTransactions.push(refundTx);
    }
  }

  client.wallet.updatedAt = Date.now();
  await client.save({ validateBeforeSave: false });

  // Update contract status
  contract.status = 'cancelled';
  contract.activeAppeal = null;
  await contract.save();

  // Update appeal status
  appeal.status = 'cancelled';
  await appeal.save();

  // Notify both parties
  const frontendUrl = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://freshlancer.online' : 'http://localhost:3000');
  const student = await User.findById(contract.student);

  try {
    await Notification.create([
      {
        user: contract.client,
        type: 'contract_cancelled',
        title: 'Contract Cancelled',
        message: `Your contract has been cancelled. Escrow funds have been refunded to your wallet.`,
        relatedId: contract._id,
        relatedType: 'Contract',
        actionUrl: `${frontendUrl}/client/contracts`,
        icon: 'alert',
      },
      {
        user: contract.student,
        type: 'contract_cancelled',
        title: 'Contract Cancelled',
        message: `Your contract has been cancelled due to an appeal.`,
        relatedId: contract._id,
        relatedType: 'Contract',
        actionUrl: `${frontendUrl}/student/contracts`,
        icon: 'alert',
      },
    ]);

    if (client?.email) {
      sendEmail({
        type: 'contract-cancelled',
        email: client.email,
        name: client.name,
        contractId: contract._id.toString(),
        refundAmount: Object.entries(escrowByCurrency)
          .map(([cur, amt]) => `${cur} ${roundMoney(amt).toFixed(2)}`)
          .join(', '),
        dashboardUrl: `${frontendUrl}/client/contracts`,
      }).catch((e) => logger.error('❌ Failed to send contract-cancelled email to client:', e.message));
    }

    if (student?.email) {
      sendEmail({
        type: 'contract-cancelled',
        email: student.email,
        name: student.name,
        contractId: contract._id.toString(),
        dashboardUrl: `${frontendUrl}/student/contracts`,
      }).catch((e) => logger.error('❌ Failed to send contract-cancelled email to student:', e.message));
    }
  } catch (e) {
    logger.error('❌ Failed to notify about contract cancellation:', e.message);
  }

  res.status(200).json({
    status: 'success',
    data: {
      appeal,
      contract,
      refundTransactions,
      refundedAmounts: escrowByCurrency,
    },
    message: 'Contract cancelled and escrow refunded successfully',
  });
});

// Admin: Get all appeals
exports.getAllAppeals = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'admin') {
    return next(AppError.forbidden('Only admins can view all appeals', 'APPEAL_ADMIN_ONLY'));
  }

  const { status, page = 1, limit = 50, contractId, openerId, respondentId, startDate, endDate } = req.query;

  const query = {};
  if (status) query.status = status;
  if (contractId) query.contract = contractId;
  if (openerId) query.opener = openerId;
  if (respondentId) query.respondent = respondentId;

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      query.createdAt.$lte = endDateTime;
    }
  }

  const skip = (page - 1) * limit;

  const [appeals, totalCount] = await Promise.all([
    Appeal.find(query)
      .sort('-createdAt')
      .skip(skip)
      .limit(parseInt(limit)),
    Appeal.countDocuments(query),
  ]);

  res.status(200).json({
    status: 'success',
    results: appeals.length,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: parseInt(page),
    data: { appeals },
  });
});

// Admin: Update appeal status
exports.updateAppealStatus = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'admin') {
    return next(AppError.forbidden('Only admins can update appeal status', 'APPEAL_ADMIN_ONLY'));
  }

  const { status } = req.body;
  const appeal = await Appeal.findById(req.params.id);

  if (!appeal) {
    return next(AppError.notFound('Appeal not found', 'APPEAL_NOT_FOUND'));
  }

  appeal.status = status;
  if (status === 'in_review') {
    // Status changed to in_review
  }

  await appeal.save();

  res.status(200).json({
    status: 'success',
    data: { appeal },
    message: 'Appeal status updated successfully',
  });
});

// Admin: Resolve appeal
exports.resolveAppeal = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'admin') {
    return next(AppError.forbidden('Only admins can resolve appeals', 'APPEAL_ADMIN_ONLY'));
  }

  const { decision, adminNotes } = req.body;

  if (!decision) {
    return next(AppError.badRequest('Decision is required', 'APPEAL_DECISION_REQUIRED'));
  }

  const appeal = await Appeal.findById(req.params.id);
  if (!appeal) {
    return next(AppError.notFound('Appeal not found', 'APPEAL_NOT_FOUND'));
  }

  appeal.status = 'resolved';
  appeal.adminDecision = decision;
  appeal.adminNotes = adminNotes?.trim() || '';
  appeal.resolvedAt = Date.now();
  appeal.resolvedBy = req.user._id;

  await appeal.save();

  // Clear contract activeAppeal
  const contract = await Contract.findById(appeal.contract);
  if (contract) {
    contract.activeAppeal = null;
    await contract.save();
  }

  // Notify both parties
  const frontendUrl = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://freshlancer.online' : 'http://localhost:3000');
  const opener = await User.findById(appeal.opener).select('role email name');
  const respondent = await User.findById(appeal.respondent).select('role email name');
  const openerRole = opener?.role || 'student';
  const respondentRole = respondent?.role || 'student';

  try {
    await Notification.create([
      {
        user: appeal.opener,
        type: 'appeal_resolved',
        title: 'Appeal Resolved',
        message: `Your appeal has been resolved. Decision: ${decision}`,
        relatedId: appeal._id,
        relatedType: 'Appeal',
        actionUrl: `${frontendUrl}/${openerRole}/appeals?appealId=${appeal._id}`,
        icon: 'check',
      },
      {
        user: appeal.respondent,
        type: 'appeal_resolved',
        title: 'Appeal Resolved',
        message: `The appeal against you has been resolved. Decision: ${decision}`,
        relatedId: appeal._id,
        relatedType: 'Appeal',
        actionUrl: `${frontendUrl}/${respondentRole}/appeals?appealId=${appeal._id}`,
        icon: 'check',
      },
    ]);

    if (opener?.email) {
      sendEmail({
        type: 'appeal-resolved',
        email: opener.email,
        name: opener.name,
        decision,
        adminNotes: adminNotes?.trim() || '',
        appealId: appeal._id.toString(),
        dashboardUrl: `${frontendUrl}/${openerRole}/appeals?appealId=${appeal._id}`,
      }).catch((e) => logger.error('❌ Failed to send appeal-resolved email to opener:', e.message));
    }

    if (respondent?.email) {
      sendEmail({
        type: 'appeal-resolved',
        email: respondent.email,
        name: respondent.name,
        decision,
        adminNotes: adminNotes?.trim() || '',
        appealId: appeal._id.toString(),
        dashboardUrl: `${frontendUrl}/${respondentRole}/appeals?appealId=${appeal._id}`,
      }).catch((e) => logger.error('❌ Failed to send appeal-resolved email to respondent:', e.message));
    }
  } catch (e) {
    logger.error('❌ Failed to notify about appeal resolution:', e.message);
  }

  res.status(200).json({
    status: 'success',
    data: { appeal },
    message: 'Appeal resolved successfully',
  });
});

// Admin: Add admin note
exports.addAdminNote = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'admin') {
    return next(AppError.forbidden('Only admins can add notes', 'APPEAL_ADMIN_ONLY'));
  }

  const { note } = req.body;
  const appeal = await Appeal.findById(req.params.id);

  if (!appeal) {
    return next(AppError.notFound('Appeal not found', 'APPEAL_NOT_FOUND'));
  }

  appeal.adminNotes = (appeal.adminNotes || '') + (appeal.adminNotes ? '\n\n' : '') + `[${new Date().toISOString()}] ${note?.trim() || ''}`;
  await appeal.save();

  res.status(200).json({
    status: 'success',
    data: { appeal },
    message: 'Admin note added successfully',
  });
});
