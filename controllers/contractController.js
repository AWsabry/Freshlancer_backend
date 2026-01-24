const { Contract } = require('../models/contractModel');
const JobApplication = require('../models/jobApplicationModel');
const User = require('../models/userModel');
const Transaction = require('../models/transactionModel');
const Notification = require('../models/notificationModel');
const Appeal = require('../models/appealModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const paymobService = require('../utils/payment/paymob');
const paypalService = require('../utils/payment/paypal');
const sendEmail = require('../utils/email');
const logger = require('../utils/logger');

function getRequestIp(req) {
  // trust proxy is enabled in app.js; req.ip should be ok
  return req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
}

function buildUserSnapshot(userDoc) {
  if (!userDoc) return null;
  const u = userDoc.toObject ? userDoc.toObject() : userDoc;

  return {
    userId: u._id,
    role: u.role,
    name: u.name,
    email: u.email,
    phone: u.phone || null,
    location: u.location || null,
    clientProfile: u.clientProfile
      ? {
          companyName: u.clientProfile.companyName || null,
          companySize: u.clientProfile.companySize || null,
          industry: u.clientProfile.industry || null,
          companyWebsite: u.clientProfile.companyWebsite || null,
        }
      : null,
    studentProfile: u.studentProfile
      ? {
          major: u.studentProfile.major || null,
          experienceLevel: u.studentProfile.experienceLevel || null,
          yearsOfExperience: u.studentProfile.yearsOfExperience || null,
          university: u.studentProfile.university || null,
          universityLink: u.studentProfile.universityLink || null,
        }
      : null,
    capturedAt: new Date().toISOString(),
  };
}

function requireParty(contract, userId) {
  const uid = userId.toString();
  const clientId = contract.client?._id ? contract.client._id.toString() : contract.client.toString();
  const studentId = contract.student?._id ? contract.student._id.toString() : contract.student.toString();
  return clientId === uid || studentId === uid;
}

function requireClientParty(contract, userId) {
  const uid = userId.toString();
  const clientId = contract.client?._id ? contract.client._id.toString() : contract.client.toString();
  return clientId === uid;
}

function requireStudentParty(contract, userId) {
  const uid = userId.toString();
  const studentId = contract.student?._id ? contract.student._id.toString() : contract.student.toString();
  return studentId === uid;
}

function roundMoney(val) {
  if (val === undefined || val === null) return val;
  const num = typeof val === 'string' ? Number(val) : val;
  if (!Number.isFinite(num)) return val;
  return Math.round(num * 100) / 100;
}

function normalizeMilestonesInput(input) {
  if (!Array.isArray(input)) return input;
  if (input.length === 0) return input;

  // Already in schema shape
  if (input[0] && typeof input[0] === 'object' && input[0].plan) return input;

  // Accept simplified shape: [{title, description, percent, expectedDuration}]
  return input.map((m) => ({
    plan: {
      title: m?.title,
      description: m?.description,
      percent: m?.percent,
      expectedDuration: m?.expectedDuration,
    },
    state: {
      status: 'unfunded',
      fundedAmount: 0,
    },
  }));
}

function clip(val, max = 280) {
  const s = val === undefined || val === null ? '' : String(val);
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function formatMilestonesForDiff(milestones) {
  const arr = Array.isArray(milestones) ? milestones : [];
  return arr
    .map((m) => {
      const title = m?.plan?.title ?? m?.title ?? '';
      const percent = m?.plan?.percent ?? m?.percent ?? '';
      const dur = m?.plan?.expectedDuration ?? m?.expectedDuration ?? '';
      return `${title} (${percent}%)${dur ? ` - ${dur}` : ''}`;
    })
    .join(', ');
}

function snapshotContractTerms(contract) {
  return {
    projectDescription: contract.projectDescription || '',
    expectedDuration: contract.expectedDuration || '',
    totalAmount: contract.totalAmount,
    currency: contract.currency,
    milestonesSummary: formatMilestonesForDiff(contract.milestones),
  };
}

function buildChanges(oldSnap, nextContract) {
  const nextSnap = snapshotContractTerms(nextContract);
  const changes = [];

  if ((oldSnap.projectDescription || '') !== (nextSnap.projectDescription || '')) {
    changes.push({
      field: 'projectDescription',
      label: 'Project description',
      before: clip(oldSnap.projectDescription, 280),
      after: clip(nextSnap.projectDescription, 280),
    });
  }
  if (Number(oldSnap.totalAmount) !== Number(nextSnap.totalAmount) || oldSnap.currency !== nextSnap.currency) {
    changes.push({
      field: 'pricing',
      label: 'Total / currency',
      before: `${oldSnap.currency} ${oldSnap.totalAmount}`,
      after: `${nextSnap.currency} ${nextSnap.totalAmount}`,
    });
  }
  if ((oldSnap.expectedDuration || '') !== (nextSnap.expectedDuration || '')) {
    changes.push({
      field: 'expectedDuration',
      label: 'Contract duration',
      before: oldSnap.expectedDuration || '—',
      after: nextSnap.expectedDuration || '—',
    });
  }
  if ((oldSnap.milestonesSummary || '') !== (nextSnap.milestonesSummary || '')) {
    changes.push({
      field: 'milestones',
      label: 'Milestones',
      before: clip(oldSnap.milestonesSummary, 500),
      after: clip(nextSnap.milestonesSummary, 500),
    });
  }

  return changes;
}

// Get my contracts (client or student)
exports.getMyContracts = catchAsync(async (req, res) => {
  const filter = {
    $or: [{ client: req.user._id }, { student: req.user._id }],
  };

  const contracts = await Contract.find(filter).sort('-createdAt');

  res.status(200).json({
    status: 'success',
    results: contracts.length,
    data: {
      contracts,
    },
  });
});

// Get single contract (party only)
exports.getContract = catchAsync(async (req, res, next) => {
  const contract = await Contract.findById(req.params.id);
  if (!contract) return next(AppError.notFound('Contract not found', 'CONTRACT_NOT_FOUND'));

  if (!requireParty(contract, req.user._id) && req.user.role !== 'admin') {
    return next(AppError.forbidden('You do not have access to this contract', 'CONTRACT_FORBIDDEN'));
  }

  res.status(200).json({
    status: 'success',
    data: { contract },
  });
});

// Create contract from accepted application (client only)
exports.createFromApplication = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'client') {
    return next(AppError.forbidden('Only clients can create contracts', 'CONTRACT_CLIENT_ONLY'));
  }

  const application = await JobApplication.findById(req.params.applicationId).populate([
    { path: 'student', select: 'name email phone role studentProfile location' },
    { path: 'jobPost', select: 'title description budget client status' },
  ]);

  if (!application) {
    return next(AppError.notFound('Application not found', 'APPLICATION_NOT_FOUND'));
  }

  if (application.status !== 'accepted') {
    return next(
      AppError.badRequest(
        'You can only create a contract for an accepted application',
        'CONTRACT_APPLICATION_NOT_ACCEPTED'
      )
    );
  }

  const jobClientId = application.jobPost.client._id
    ? application.jobPost.client._id.toString()
    : application.jobPost.client.toString();
  if (jobClientId !== req.user._id.toString()) {
    return next(AppError.forbidden('You can only create contracts for your own jobs', 'CONTRACT_NOT_OWNER'));
  }

  // Prevent duplicates unless the only existing contract is cancelled (client can create another)
  const existing = await Contract.findOne({
    jobApplication: application._id,
    status: { $ne: 'cancelled' },
  });
  if (existing) {
    return next(AppError.conflict('A contract already exists for this application', 'CONTRACT_ALREADY_EXISTS'));
  }

  // Defaults from application + job post
  const totalAmount = application.proposedBudget?.amount || application.jobPost?.budget?.max || 1;
  const currency = application.proposedBudget?.currency || application.jobPost?.budget?.currency || 'USD';
  const expectedDuration =
    req.body.expectedDuration ||
    application.estimatedDuration ||
    application.jobPost?.projectDuration ||
    '1-2 weeks';

  const contract = await Contract.create({
    jobPost: application.jobPost._id,
    jobApplication: application._id,
    client: req.user._id,
    student: application.student._id,
    projectDescription: req.body.projectDescription || application.jobPost.description,
    paymentMethod: 'escrow_milestones',
    expectedDuration,
    currency,
    totalAmount: roundMoney(totalAmount),
    milestones: normalizeMilestonesInput(req.body.milestones), // optional; model will default to single milestone if empty
    status: 'pending_signatures',
  });

  // Notify + email both parties (best-effort)
  try {
    const frontendUrl =
      process.env.FRONTEND_URL ||
      (process.env.NODE_ENV === 'production'
        ? 'https://freshlancer.online'
        : 'http://localhost:3000');

    await Notification.create([
      {
        user: contract.student,
        type: 'contract_created',
        title: 'New Contract Created',
        message: `A contract has been created for "${application.jobPost.title}". Review and sign when ready.`,
        relatedId: contract._id,
        relatedType: 'Contract',
        actionUrl: `${frontendUrl}/student/contracts`,
        icon: 'contract',
      },
      {
        user: contract.client,
        type: 'contract_created',
        title: 'Contract Created',
        message: `Your contract for "${application.jobPost.title}" is ready. Waiting for signatures.`,
        relatedId: contract._id,
        relatedType: 'Contract',
        actionUrl: `${frontendUrl}/client/contracts`,
        icon: 'contract',
      },
    ]);

    // Emails (async)
    sendEmail({
      type: 'contract-created',
      email: application.student.email,
      name: application.student.name,
      contractId: contract._id.toString(),
      jobTitle: application.jobPost.title,
      totalAmount: contract.totalAmount,
      currency: contract.currency,
      contractUrl: `${frontendUrl}/student/contracts`,
      dashboardUrl: `${frontendUrl}/student/contracts`,
    }).catch((e) => logger.error('❌ Failed to send contract-created email (student):', e.message));

    sendEmail({
      type: 'contract-created',
      email: req.user.email,
      name: req.user.name,
      contractId: contract._id.toString(),
      jobTitle: application.jobPost.title,
      totalAmount: contract.totalAmount,
      currency: contract.currency,
      contractUrl: `${frontendUrl}/client/contracts`,
      dashboardUrl: `${frontendUrl}/client/contracts`,
    }).catch((e) => logger.error('❌ Failed to send contract-created email (client):', e.message));
  } catch (e) {
    logger.error('❌ Contract create notifications failed:', e.message);
  }

  res.status(201).json({
    status: 'success',
    data: { contract },
  });
});

// Update contract terms (client or student, pre-sign only)
exports.updateContract = catchAsync(async (req, res, next) => {
  const contract = await Contract.findById(req.params.id);
  if (!contract) return next(AppError.notFound('Contract not found', 'CONTRACT_NOT_FOUND'));

  if (!requireParty(contract, req.user._id) && req.user.role !== 'admin') {
    return next(AppError.forbidden('You do not have access to this contract', 'CONTRACT_FORBIDDEN'));
  }

  if (!['draft', 'pending_signatures'].includes(contract.status)) {
    return next(
      AppError.badRequest(
        'This contract can no longer be edited',
        'CONTRACT_NOT_EDITABLE'
      )
    );
  }

  const allowed = ['projectDescription', 'expectedDuration', 'totalAmount', 'currency', 'milestones'];
  for (const key of Object.keys(req.body || {})) {
    if (!allowed.includes(key)) {
      return next(
        AppError.badRequest(`Field "${key}" cannot be edited`, 'CONTRACT_FIELD_NOT_EDITABLE')
      );
    }
  }

  const before = snapshotContractTerms(contract);

  // Apply updates
  if (req.body.projectDescription !== undefined) contract.projectDescription = req.body.projectDescription;
  if (req.body.expectedDuration !== undefined) contract.expectedDuration = req.body.expectedDuration;
  if (req.body.totalAmount !== undefined) contract.totalAmount = req.body.totalAmount;
  if (req.body.currency !== undefined) contract.currency = req.body.currency;
  if (req.body.milestones !== undefined) contract.milestones = normalizeMilestonesInput(req.body.milestones);

  const changes = buildChanges(before, contract);
  if (changes.length === 0) {
    // Don't save or create confirmations/logs if nothing actually changed
    return res.status(200).json({
      status: 'success',
      data: { contract },
    });
  }

  const pendingUpdatedAt = Date.now();
  if (changes.length > 0) {
    // Require the other party to confirm the edit before they can sign
    contract.pendingConfirmation = {
      required: true,
      updatedBy: req.user._id,
      updatedAt: pendingUpdatedAt,
      changes,
      confirmedBy: null,
      confirmedAt: null,
    };
  }

  await contract.save();

  // Append to change log (best effort; should not bump contract version)
  try {
    contract.changeLog = Array.isArray(contract.changeLog) ? contract.changeLog : [];
    contract.changeLog.push({
      version: contract.version,
      updatedBy: req.user._id,
      updatedAt: pendingUpdatedAt,
      changes,
      confirmedBy: null,
      confirmedAt: null,
    });
    await contract.save({ validateBeforeSave: false });
  } catch (e) {
    // ignore log write failure
  }

  // Notify other party (best-effort)
  try {
    const frontendUrl =
      process.env.FRONTEND_URL ||
      (process.env.NODE_ENV === 'production'
        ? 'https://freshlancer.online'
        : 'http://localhost:3000');

    const updatedBy = req.user?.name || 'A user';
    const otherUserId = requireClientParty(contract, req.user._id) ? contract.student : contract.client;
    await Notification.create({
      user: otherUserId,
      type: 'contract_updated',
      title: 'Contract Updated',
      message: `${updatedBy} updated the contract terms. Please review and sign again if needed.`,
      relatedId: contract._id,
      relatedType: 'Contract',
      actionUrl: `${frontendUrl}/${otherUserId.toString() === contract.student.toString() ? 'student' : 'client'}/contracts`,
      icon: 'contract',
    });

    // Emails (async)
    const commonEmail = {
      type: 'contract-updated',
      contractId: contract._id.toString(),
      updatedBy,
      version: contract.version,
      contractUrl: `${frontendUrl}/client/contracts`,
      dashboardUrl: `${frontendUrl}/client/contracts`,
    };

    const clientDoc = await User.findById(contract.client).select('name email');
    const studentDoc = await User.findById(contract.student).select('name email');
    if (clientDoc?.email) {
      sendEmail({ ...commonEmail, email: clientDoc.email, name: clientDoc.name, contractUrl: `${frontendUrl}/client/contracts`, dashboardUrl: `${frontendUrl}/client/contracts` })
        .catch((e) => logger.error('❌ Failed to send contract-updated email (client):', e.message));
    }
    if (studentDoc?.email) {
      sendEmail({ ...commonEmail, email: studentDoc.email, name: studentDoc.name, contractUrl: `${frontendUrl}/student/contracts`, dashboardUrl: `${frontendUrl}/student/contracts` })
        .catch((e) => logger.error('❌ Failed to send contract-updated email (student):', e.message));
    }
  } catch (e) {
    logger.error('❌ Contract update notifications failed:', e.message);
  }

  res.status(200).json({
    status: 'success',
    data: { contract },
  });
});

// Confirm latest changes (the other party must confirm before signing)
exports.confirmContractChanges = catchAsync(async (req, res, next) => {
  const contract = await Contract.findById(req.params.id);
  if (!contract) return next(AppError.notFound('Contract not found', 'CONTRACT_NOT_FOUND'));

  if (!requireParty(contract, req.user._id) && req.user.role !== 'admin') {
    return next(AppError.forbidden('You do not have access to this contract', 'CONTRACT_FORBIDDEN'));
  }

  if (!contract.pendingConfirmation?.required) {
    return next(AppError.badRequest('No pending changes to confirm', 'CONTRACT_NO_PENDING_CONFIRMATION'));
  }

  const updatedById = contract.pendingConfirmation.updatedBy?._id
    ? contract.pendingConfirmation.updatedBy._id.toString()
    : contract.pendingConfirmation.updatedBy?.toString();

  if (updatedById && updatedById === req.user._id.toString()) {
    return next(
      AppError.badRequest(
        'You cannot confirm your own changes. The other party must confirm.',
        'CONTRACT_CONFIRM_SELF_NOT_ALLOWED'
      )
    );
  }

  contract.pendingConfirmation.required = false;
  contract.pendingConfirmation.confirmedBy = req.user._id;
  contract.pendingConfirmation.confirmedAt = Date.now();

  // Mark last matching change log entry as confirmed
  try {
    const pendingAt = contract.pendingConfirmation.updatedAt
      ? new Date(contract.pendingConfirmation.updatedAt).getTime()
      : null;
    const updatedById = contract.pendingConfirmation.updatedBy?._id
      ? contract.pendingConfirmation.updatedBy._id.toString()
      : contract.pendingConfirmation.updatedBy?.toString();

    if (pendingAt && updatedById && Array.isArray(contract.changeLog)) {
      for (let i = contract.changeLog.length - 1; i >= 0; i--) {
        const entry = contract.changeLog[i];
        const entryUpdatedById = entry.updatedBy?._id ? entry.updatedBy._id.toString() : entry.updatedBy?.toString();
        const entryAt = entry.updatedAt ? new Date(entry.updatedAt).getTime() : null;
        if (!entry.confirmedAt && entryUpdatedById === updatedById && entryAt === pendingAt) {
          entry.confirmedBy = req.user._id;
          entry.confirmedAt = contract.pendingConfirmation.confirmedAt;
          break;
        }
      }
    }
  } catch (e) {
    // best effort
  }

  await contract.save();

  // Notify other party (best-effort)
  try {
    const frontendUrl =
      process.env.FRONTEND_URL ||
      (process.env.NODE_ENV === 'production'
        ? 'https://freshlancer.online'
        : 'http://localhost:3000');

    const otherUserId = requireClientParty(contract, req.user._id) ? contract.student : contract.client;
    await Notification.create({
      user: otherUserId,
      type: 'contract_updated',
      title: 'Contract Changes Confirmed',
      message: `${req.user?.name || 'The other party'} confirmed the latest contract changes. You can proceed to sign.`,
      relatedId: contract._id,
      relatedType: 'Contract',
      actionUrl: `${frontendUrl}/${otherUserId.toString() === contract.student.toString() ? 'student' : 'client'}/contracts`,
      icon: 'contract',
    });
  } catch (e) {
    // best effort
  }

  res.status(200).json({
    status: 'success',
    data: { contract },
  });
});

// Sign contract (client or student)
exports.signContract = catchAsync(async (req, res, next) => {
  const contract = await Contract.findById(req.params.id);
  if (!contract) return next(AppError.notFound('Contract not found', 'CONTRACT_NOT_FOUND'));

  if (!requireParty(contract, req.user._id) && req.user.role !== 'admin') {
    return next(AppError.forbidden('You do not have access to this contract', 'CONTRACT_FORBIDDEN'));
  }

  if (!['draft', 'pending_signatures'].includes(contract.status)) {
    return next(
      AppError.badRequest('This contract cannot be signed in its current state', 'CONTRACT_NOT_SIGNABLE')
    );
  }

  // If there are pending changes, block the non-editor from signing until they confirm
  if (contract.pendingConfirmation?.required) {
    const updatedById = contract.pendingConfirmation.updatedBy?._id
      ? contract.pendingConfirmation.updatedBy._id.toString()
      : contract.pendingConfirmation.updatedBy?.toString();
    if (updatedById && updatedById !== req.user._id.toString()) {
      return next(
        AppError.badRequest(
          'Contract was updated. Please confirm the changes before signing.',
          'CONTRACT_CHANGES_NOT_CONFIRMED'
        )
      );
    }
  }

  const typedName = typeof req.body.typedName === 'string' ? req.body.typedName.trim() : '';
  const drawnSignatureDataUrl =
    typeof req.body.drawnSignatureDataUrl === 'string' ? req.body.drawnSignatureDataUrl.trim() : '';

  if (!typedName && !drawnSignatureDataUrl) {
    return next(
      AppError.badRequest(
        'Provide at least a typed name or a drawn signature',
        'CONTRACT_SIGNATURE_REQUIRED'
      )
    );
  }

  const ipAddress = getRequestIp(req);
  const userAgent = req.get('user-agent') || '';

  // Ensure currentContractHash is up to date
  await contract.validate();

  const signaturePayload = {
    typedName: typedName || undefined,
    drawnSignatureDataUrl: drawnSignatureDataUrl || undefined,
    signedAt: Date.now(),
    ipAddress,
    userAgent,
    contractHash: contract.currentContractHash,
    contractVersion: contract.version,
  };

  if (requireClientParty(contract, req.user._id)) {
    contract.clientSignature = signaturePayload;
    // Capture snapshot at first client sign
    const clientDoc = await User.findById(contract.client);
    contract.clientSnapshot = buildUserSnapshot(clientDoc);
  } else if (requireStudentParty(contract, req.user._id)) {
    contract.studentSignature = signaturePayload;
    const studentDoc = await User.findById(contract.student);
    contract.studentSnapshot = buildUserSnapshot(studentDoc);
  } else {
    return next(AppError.forbidden('Only contract parties can sign', 'CONTRACT_SIGN_FORBIDDEN'));
  }

  // If both signed for same hash/version -> mark signed
  const clientOk =
    contract.clientSignature?.signedAt &&
    contract.clientSignature?.contractHash === contract.currentContractHash;
  const studentOk =
    contract.studentSignature?.signedAt &&
    contract.studentSignature?.contractHash === contract.currentContractHash;

  if (clientOk && studentOk) {
    contract.status = 'signed';
    contract.signedAt = Date.now();
  } else {
    contract.status = 'pending_signatures';
  }

  await contract.save();

  // Notify + email (best-effort)
  try {
    const frontendUrl =
      process.env.FRONTEND_URL ||
      (process.env.NODE_ENV === 'production'
        ? 'https://freshlancer.online'
        : 'http://localhost:3000');

    const signerName = req.user?.name || 'A user';
    const clientDoc = await User.findById(contract.client).select('name email');
    const studentDoc = await User.findById(contract.student).select('name email');

    if (contract.status === 'signed') {
      await Notification.create([
        {
          user: contract.client,
          type: 'contract_signed',
          title: 'Contract Signed',
          message:
            'Both parties have signed the contract. You can now fund the first milestone (deposit goes to escrow and cannot be withdrawn until milestone approval).',
          relatedId: contract._id,
          relatedType: 'Contract',
          actionUrl: `${frontendUrl}/client/contracts`,
          icon: 'contract',
        },
        {
          user: contract.student,
          type: 'contract_signed',
          title: 'Contract Signed',
          message:
            'Both parties have signed the contract. The client can now deposit the first milestone to escrow. You cannot withdraw until the milestone is approved.',
          relatedId: contract._id,
          relatedType: 'Contract',
          actionUrl: `${frontendUrl}/student/contracts`,
          icon: 'contract',
        },
      ]);

      if (clientDoc?.email) {
        sendEmail({
          type: 'contract-signed',
          email: clientDoc.email,
          name: clientDoc.name,
          contractId: contract._id.toString(),
          jobTitle: contract.jobPost?.title,
          signedAt: contract.signedAt || Date.now(),
          contractUrl: `${frontendUrl}/client/contracts`,
          dashboardUrl: `${frontendUrl}/client/contracts`,
        }).catch((e) => logger.error('❌ Failed to send contract-signed email (client):', e.message));
      }
      if (studentDoc?.email) {
        sendEmail({
          type: 'contract-signed',
          email: studentDoc.email,
          name: studentDoc.name,
          contractId: contract._id.toString(),
          jobTitle: contract.jobPost?.title,
          signedAt: contract.signedAt || Date.now(),
          contractUrl: `${frontendUrl}/student/contracts`,
          dashboardUrl: `${frontendUrl}/student/contracts`,
        }).catch((e) => logger.error('❌ Failed to send contract-signed email (student):', e.message));
      }
    } else {
      const otherUserId = requireClientParty(contract, req.user._id) ? contract.student : contract.client;
      await Notification.create({
        user: otherUserId,
        type: 'contract_signed',
        title: 'Signature Added',
        message: `${signerName} signed the contract. Your signature is required to finalize it.`,
        relatedId: contract._id,
        relatedType: 'Contract',
        actionUrl: `${frontendUrl}/${otherUserId.toString() === contract.student.toString() ? 'student' : 'client'}/contracts`,
        icon: 'contract',
      });
    }
  } catch (e) {
    logger.error('❌ Contract sign notifications failed:', e.message);
  }

  res.status(200).json({
    status: 'success',
    data: { contract },
  });
});

// Fund a milestone (client only) -> creates escrow_deposit transaction
exports.fundMilestone = catchAsync(async (req, res, next) => {
  const contract = await Contract.findById(req.params.id);
  if (!contract) return next(AppError.notFound('Contract not found', 'CONTRACT_NOT_FOUND'));

  // Check for active appeal
  const hasActive = await Appeal.hasActiveAppeal(contract._id);
  if (hasActive) {
    return next(
      AppError.badRequest(
        'This contract has an active appeal. All operations are frozen until the appeal is resolved.',
        'CONTRACT_FROZEN_BY_APPEAL'
      )
    );
  }

  if (req.user.role !== 'client' || !requireClientParty(contract, req.user._id)) {
    return next(AppError.forbidden('Only the contract client can fund milestones', 'CONTRACT_FUND_FORBIDDEN'));
  }

  if (!['signed', 'active'].includes(contract.status)) {
    return next(
      AppError.badRequest('Contract must be signed before funding milestones', 'CONTRACT_NOT_SIGNED')
    );
  }

  const milestone = contract.milestones.id(req.params.milestoneId);
  if (!milestone) {
    return next(AppError.notFound('Milestone not found', 'CONTRACT_MILESTONE_NOT_FOUND'));
  }

  // Enforce sequential funding: only the first unfinished milestone can be funded
  const milestonesArr = Array.isArray(contract.milestones) ? contract.milestones : [];
  const requestedIdx = milestonesArr.findIndex((m) => m?._id?.toString() === milestone._id.toString());
  if (requestedIdx === -1) {
    return next(AppError.notFound('Milestone not found', 'CONTRACT_MILESTONE_NOT_FOUND'));
  }
  const blocking = milestonesArr.slice(0, requestedIdx).find((m) => m?.state?.status !== 'released');
  if (blocking) {
    return next(
      AppError.badRequest(
        'You must complete and release previous milestones before funding this one',
        'CONTRACT_MILESTONE_OUT_OF_ORDER'
      )
    );
  }

  if (milestone.state.status !== 'unfunded') {
    return next(
      AppError.badRequest('This milestone is already funded or beyond', 'CONTRACT_MILESTONE_NOT_UNFUNDED')
    );
  }

  const principalAmount = roundMoney(milestone.state.amount);
  if (!principalAmount || principalAmount <= 0) {
    return next(AppError.badRequest('Invalid milestone amount', 'CONTRACT_MILESTONE_AMOUNT_INVALID'));
  }

  const currency = contract.currency;
  const paymentGateway = currency === 'EGP' ? 'paymob' : 'paypal';

  // Fees (client pays extra; escrow is funded by principal only)
  const PLATFORM_FEE_RATE = 0.1; // 10%
  const TRANSACTION_FEE_RATE = 0.03; // 3%
  const platformFee = roundMoney(principalAmount * PLATFORM_FEE_RATE);
  const transactionFee = roundMoney(principalAmount * TRANSACTION_FEE_RATE);
  const totalCharge = roundMoney(principalAmount + platformFee + transactionFee);

  // Create pending escrow_deposit transaction
  const tx = await Transaction.create({
    user: req.user._id,
    type: 'escrow_deposit',
    amount: totalCharge,
    currency,
    status: 'pending',
    paymentMethod: 'credit_card',
    relatedId: contract._id,
    relatedType: 'Contract',
    description: `Escrow deposit for contract milestone: ${milestone.plan.title}`,
    payer: contract.client,
    payee: contract.student,
    metadata: {
      paymentType: 'contract_escrow_deposit',
      contractId: contract._id.toString(),
      milestoneId: milestone._id.toString(),
      gateway: paymentGateway,
      principalAmount,
      platformFee,
      transactionFee,
      totalCharge,
      feeRates: {
        platform: PLATFORM_FEE_RATE,
        transaction: TRANSACTION_FEE_RATE,
      },
    },
  });

  // Gateway response details
  if (currency === 'EGP') {
    // Create Paymob intention and return clientSecret
    const user = await User.findById(req.user._id);
    const nameParts = (user?.name || 'User').split(' ');
    const firstName = nameParts[0] || 'User';
    const lastName = nameParts.slice(1).join(' ') || 'User';

    const paymentIntention = await paymobService.createPaymentIntention({
      amount: totalCharge,
      currency: 'EGP',
      items: [
        {
          name: `Contract escrow: ${contract._id.toString()}`,
          amount: totalCharge,
          description: `Milestone: ${milestone.plan.title} (Escrow: ${principalAmount}, Fees: ${platformFee + transactionFee})`,
          quantity: 1,
        },
      ],
      customer: {
        firstName,
        lastName,
        email: user.email,
        extras: {
          userId: user._id.toString(),
          paymentType: 'contract_escrow_deposit',
          transactionId: tx._id.toString(),
          contractId: contract._id.toString(),
          milestoneId: milestone._id.toString(),
          principalAmount,
          platformFee,
          transactionFee,
          totalCharge,
        },
      },
      billingData: {
        email: user.email,
        firstName,
        lastName,
        phoneNumber: user.phone || '+201000000000',
      },
      extras: {
        transaction_id: tx._id.toString(),
        contract_id: contract._id.toString(),
        milestone_id: milestone._id.toString(),
        principal_amount: principalAmount,
        platform_fee: platformFee,
        transaction_fee: transactionFee,
        total_charge: totalCharge,
      },
    });

    tx.metadata.set('intentionId', paymentIntention.intentionId);
    tx.metadata.set('clientSecret', paymentIntention.clientSecret);
    await tx.save();

    return res.status(200).json({
      status: 'success',
      data: {
        transaction: tx,
        gateway: 'paymob',
        clientSecret: paymentIntention.clientSecret,
        intentionId: paymentIntention.intentionId,
      },
    });
  }

  // USD (PayPal) will be implemented in backend-payments-escrow todo
  const baseUrl = process.env.BASE_URL;
  const frontendUrl = process.env.FRONTEND_URL;
  if (!baseUrl || !frontendUrl) {
    return next(AppError.serverError('Server URLs are not configured', 'URLS_NOT_CONFIGURED'));
  }

  const { orderId, approvalUrl } = await paypalService.createOrder({
    amount: totalCharge,
    currency,
    description: `Escrow deposit for milestone: ${milestone.plan.title}`,
    customId: tx._id.toString(),
    returnUrl: `${baseUrl}/api/v1/paypal/capture?tx=${tx._id.toString()}`,
    cancelUrl: `${frontendUrl}/payment/failed?reason=cancelled`,
  });

  tx.paymentGateway = 'paypal';
  tx.paymentMethod = 'paypal';
  if (tx.metadata?.set) {
    tx.metadata.set('paypalOrderId', orderId);
    tx.metadata.set('paypalApprovalUrl', approvalUrl);
  } else {
    tx.metadata = {
      ...(tx.metadata?.toObject ? tx.metadata.toObject() : tx.metadata),
      paypalOrderId: orderId,
      paypalApprovalUrl: approvalUrl,
    };
  }
  await tx.save();

  return res.status(200).json({
    status: 'success',
    data: {
      transaction: tx,
      gateway: 'paypal',
      orderId,
      approvalUrl,
    },
  });
});

// Student submits milestone as done
exports.submitMilestone = catchAsync(async (req, res, next) => {
  const contract = await Contract.findById(req.params.id);
  if (!contract) return next(AppError.notFound('Contract not found', 'CONTRACT_NOT_FOUND'));

  // Check for active appeal
  const hasActive = await Appeal.hasActiveAppeal(contract._id);
  if (hasActive) {
    return next(
      AppError.badRequest(
        'This contract has an active appeal. All operations are frozen until the appeal is resolved.',
        'CONTRACT_FROZEN_BY_APPEAL'
      )
    );
  }

  if (req.user.role !== 'student' || !requireStudentParty(contract, req.user._id)) {
    return next(AppError.forbidden('Only the contract student can submit milestones', 'CONTRACT_SUBMIT_FORBIDDEN'));
  }

  const milestone = contract.milestones.id(req.params.milestoneId);
  if (!milestone) return next(AppError.notFound('Milestone not found', 'CONTRACT_MILESTONE_NOT_FOUND'));

  if (!['funded', 'submitted'].includes(milestone.state.status)) {
    return next(
      AppError.badRequest('Milestone must be funded before it can be submitted', 'CONTRACT_MILESTONE_NOT_FUNDED')
    );
  }

  milestone.state.status = 'submitted';
  milestone.state.submittedAt = Date.now();

  if (contract.status === 'signed') contract.status = 'active';

  await contract.save();

  // Notify client + email (best-effort)
  try {
    const frontendUrl =
      process.env.FRONTEND_URL ||
      (process.env.NODE_ENV === 'production'
        ? 'https://freshlancer.online'
        : 'http://localhost:3000');

    await Notification.create({
      user: contract.client,
      type: 'milestone_submitted',
      title: 'Milestone Submitted',
      message: `The student submitted milestone "${milestone.plan.title}". Review and approve to release payment.`,
      relatedId: contract._id,
      relatedType: 'Contract',
      actionUrl: `${frontendUrl}/client/contracts`,
      icon: 'contract',
    });

    const clientDoc = await User.findById(contract.client).select('name email');
    if (clientDoc?.email) {
      sendEmail({
        type: 'milestone-submitted',
        email: clientDoc.email,
        name: clientDoc.name,
        contractId: contract._id.toString(),
        milestoneTitle: milestone.plan.title,
        submittedAt: milestone.state.submittedAt || Date.now(),
        contractUrl: `${frontendUrl}/client/contracts`,
        dashboardUrl: `${frontendUrl}/client/contracts`,
      }).catch((e) => logger.error('❌ Failed to send milestone-submitted email:', e.message));
    }
  } catch (e) {
    logger.error('❌ Milestone submit notifications failed:', e.message);
  }

  res.status(200).json({
    status: 'success',
    data: { contract },
  });
});

// Client approves milestone -> releases escrow (transaction + status)
exports.approveMilestone = catchAsync(async (req, res, next) => {
  const contract = await Contract.findById(req.params.id);
  if (!contract) return next(AppError.notFound('Contract not found', 'CONTRACT_NOT_FOUND'));

  if (req.user.role !== 'client' || !requireClientParty(contract, req.user._id)) {
    return next(AppError.forbidden('Only the contract client can approve milestones', 'CONTRACT_APPROVE_FORBIDDEN'));
  }

  // Check for active appeal
  const hasActive = await Appeal.hasActiveAppeal(contract._id);
  if (hasActive) {
    return next(
      AppError.badRequest(
        'This contract has an active appeal. All operations are frozen until the appeal is resolved.',
        'CONTRACT_FROZEN_BY_APPEAL'
      )
    );
  }

  const milestone = contract.milestones.id(req.params.milestoneId);
  if (!milestone) return next(AppError.notFound('Milestone not found', 'CONTRACT_MILESTONE_NOT_FOUND'));

  if (milestone.state.status !== 'submitted') {
    return next(
      AppError.badRequest(
        'Milestone must be submitted by the student before approval',
        'CONTRACT_MILESTONE_NOT_SUBMITTED'
      )
    );
  }

  milestone.state.status = 'approved';
  milestone.state.approvedAt = Date.now();

  // Create escrow_release transaction(s). (Wallet accounting + PayPal capture not handled here yet)
  const amount = roundMoney(milestone.state.amount);
  const currency = contract.currency;

  // Move funds: client escrow -> student wallet balance
  const [clientUser, studentUser] = await Promise.all([
    User.findById(contract.client),
    User.findById(contract.student),
  ]);

  if (!clientUser || !studentUser) {
    return next(AppError.serverError('Contract users not found', 'CONTRACT_USERS_NOT_FOUND'));
  }

  const getMapValue = (map, key) => (map?.get ? map.get(key) || 0 : map?.[key] || 0);
  const setMapValue = (map, key, val) => {
    if (map?.set) {
      map.set(key, val);
      return;
    }
    // fallback plain object
    map[key] = val;
  };

  if (!clientUser.wallet) clientUser.wallet = {};
  if (!clientUser.wallet.escrow) clientUser.wallet.escrow = new Map();
  if (!studentUser.wallet) studentUser.wallet = {};
  if (!studentUser.wallet.balances) studentUser.wallet.balances = new Map();

  const clientEscrow = getMapValue(clientUser.wallet.escrow, currency);
  if (clientEscrow + 0.0001 < amount) {
    return next(
      AppError.badRequest(
        `Client escrow balance is insufficient to release this milestone (${currency} ${amount})`,
        'WALLET_ESCROW_INSUFFICIENT'
      )
    );
  }

  setMapValue(clientUser.wallet.escrow, currency, roundMoney(clientEscrow - amount));
  const studentBal = getMapValue(studentUser.wallet.balances, currency);
  setMapValue(studentUser.wallet.balances, currency, roundMoney(studentBal + amount));
  clientUser.wallet.updatedAt = Date.now();
  studentUser.wallet.updatedAt = Date.now();

  await Promise.all([
    clientUser.save({ validateBeforeSave: false }),
    studentUser.save({ validateBeforeSave: false }),
  ]);

  // Record release transactions for both parties
  await Transaction.create({
    user: contract.client,
    type: 'escrow_release',
    amount,
    currency,
    status: 'completed',
    paymentGateway: 'wallet',
    paymentMethod: 'wallet',
    relatedId: contract._id,
    relatedType: 'Contract',
    description: `Escrow release for contract milestone: ${milestone.plan.title}`,
    payer: contract.client,
    payee: contract.student,
    metadata: {
      paymentType: 'contract_escrow_release',
      contractId: contract._id.toString(),
      milestoneId: milestone._id.toString(),
    },
  });

  await Transaction.create({
    user: contract.student,
    type: 'escrow_release',
    amount,
    currency,
    status: 'completed',
    paymentGateway: 'wallet',
    paymentMethod: 'wallet',
    relatedId: contract._id,
    relatedType: 'Contract',
    description: `Escrow received for contract milestone: ${milestone.plan.title}`,
    payer: contract.client,
    payee: contract.student,
    metadata: {
      paymentType: 'contract_escrow_release',
      contractId: contract._id.toString(),
      milestoneId: milestone._id.toString(),
    },
  });

  milestone.state.status = 'released';
  milestone.state.releasedAt = Date.now();

  // Mark completed if all released
  const allReleased = contract.milestones.every((m) => m.state.status === 'released');
  contract.status = allReleased ? 'completed' : 'active';

  await contract.save();

  // Notify + email both parties (best-effort)
  try {
    const frontendUrl =
      process.env.FRONTEND_URL ||
      (process.env.NODE_ENV === 'production'
        ? 'https://freshlancer.online'
        : 'http://localhost:3000');

    await Notification.create([
      {
        user: contract.student,
        type: 'payment_received',
        title: 'Payment Received',
        message: `Payment for milestone "${milestone.plan.title}" was released to your wallet.`,
        relatedId: contract._id,
        relatedType: 'Contract',
        actionUrl: `${frontendUrl}/student/contracts`,
        icon: 'payment',
      },
      {
        user: contract.client,
        type: 'payment_released',
        title: 'Payment Released',
        message: `You released payment for milestone "${milestone.plan.title}".`,
        relatedId: contract._id,
        relatedType: 'Contract',
        actionUrl: `${frontendUrl}/client/contracts`,
        icon: 'payment',
      },
      {
        user: contract.student,
        type: 'milestone_approved',
        title: 'Milestone Approved',
        message: `Milestone "${milestone.plan.title}" was approved.`,
        relatedId: contract._id,
        relatedType: 'Contract',
        actionUrl: `${frontendUrl}/student/contracts`,
        icon: 'contract',
      },
    ]);

    const clientDoc = await User.findById(contract.client).select('name email');
    const studentDoc = await User.findById(contract.student).select('name email');
    if (clientDoc?.email) {
      sendEmail({
        type: 'milestone-approved',
        email: clientDoc.email,
        name: clientDoc.name,
        contractId: contract._id.toString(),
        milestoneTitle: milestone.plan.title,
        approvedAt: milestone.state.approvedAt || Date.now(),
        contractUrl: `${frontendUrl}/client/contracts`,
        dashboardUrl: `${frontendUrl}/client/contracts`,
      }).catch((e) => logger.error('❌ Failed to send milestone-approved email (client):', e.message));
    }
    if (studentDoc?.email) {
      sendEmail({
        type: 'escrow-released',
        email: studentDoc.email,
        name: studentDoc.name,
        contractId: contract._id.toString(),
        milestoneTitle: milestone.plan.title,
        amount,
        currency,
        contractUrl: `${frontendUrl}/student/contracts`,
        dashboardUrl: `${frontendUrl}/student/contracts`,
      }).catch((e) => logger.error('❌ Failed to send escrow-released email (student):', e.message));
    }

    if (allReleased) {
      await Notification.create([
        {
          user: contract.client,
          type: 'contract_completed',
          title: 'Contract Completed',
          message: 'All milestones were released. Contract marked as completed.',
          relatedId: contract._id,
          relatedType: 'Contract',
          actionUrl: `${frontendUrl}/client/contracts`,
          icon: 'contract',
        },
        {
          user: contract.student,
          type: 'contract_completed',
          title: 'Contract Completed',
          message: 'All milestones were released. Contract marked as completed.',
          relatedId: contract._id,
          relatedType: 'Contract',
          actionUrl: `${frontendUrl}/student/contracts`,
          icon: 'contract',
        },
      ]);
    }
  } catch (e) {
    logger.error('❌ Milestone approve notifications failed:', e.message);
  }

  res.status(200).json({
    status: 'success',
    data: { contract },
  });
});

// Complete contract after appeal closure (client only)
exports.completeContractAfterAppeal = catchAsync(async (req, res, next) => {
  const contract = await Contract.findById(req.params.id);
  if (!contract) {
    return next(AppError.notFound('Contract not found', 'CONTRACT_NOT_FOUND'));
  }

  // Verify user is the client
  if (String(contract.client._id || contract.client) !== String(req.user._id)) {
    return next(AppError.forbidden('Only the client can complete the contract', 'CONTRACT_COMPLETE_FORBIDDEN'));
  }

  // Check if contract had a recently closed appeal (within last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const closedAppeal = await Appeal.findOne({
    contract: contract._id,
    status: 'closed_by_opener',
    updatedAt: { $gte: sevenDaysAgo },
  });

  if (!closedAppeal) {
    return next(AppError.badRequest('No recently closed appeal found for this contract', 'NO_RECENT_APPEAL'));
  }

  if (contract.status === 'completed') {
    return next(AppError.badRequest('Contract is already completed', 'CONTRACT_ALREADY_COMPLETED'));
  }

  if (contract.status === 'cancelled') {
    return next(AppError.badRequest('Contract is already cancelled', 'CONTRACT_ALREADY_CANCELLED'));
  }

  // Mark contract as completed
  contract.status = 'completed';
  await contract.save();

  // Notify student
  const frontendUrl = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://freshlancer.online' : 'http://localhost:3000');
  const student = await User.findById(contract.student);

  try {
    await Notification.create({
      user: contract.student,
      type: 'contract_completed',
      title: 'Contract Completed',
      message: `${req.user.name} has completed the contract after the appeal was closed.`,
      relatedId: contract._id,
      relatedType: 'Contract',
      actionUrl: `${frontendUrl}/student/contracts?contractId=${contract._id}`,
      icon: 'check',
    });

    if (student?.email) {
      sendEmail({
        type: 'contract-completed',
        email: student.email,
        name: student.name,
        clientName: req.user.name,
        contractId: contract._id.toString(),
        dashboardUrl: `${frontendUrl}/student/contracts?contractId=${contract._id}`,
      }).catch((e) => logger.error('❌ Failed to send contract-completed email:', e.message));
    }
  } catch (e) {
    logger.error('❌ Failed to notify about contract completion:', e.message);
  }

  res.status(200).json({
    status: 'success',
    data: { contract },
    message: 'Contract marked as completed',
  });
});

// Cancel contract after appeal closure (client only)
exports.cancelContractAfterAppeal = catchAsync(async (req, res, next) => {
  const contract = await Contract.findById(req.params.id);
  if (!contract) {
    return next(AppError.notFound('Contract not found', 'CONTRACT_NOT_FOUND'));
  }

  // Verify user is the client
  if (String(contract.client._id || contract.client) !== String(req.user._id)) {
    return next(AppError.forbidden('Only the client can cancel the contract', 'CONTRACT_CANCEL_FORBIDDEN'));
  }

  // Check if contract had a recently closed appeal (within last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const closedAppeal = await Appeal.findOne({
    contract: contract._id,
    status: 'closed_by_opener',
    updatedAt: { $gte: sevenDaysAgo },
  });

  if (!closedAppeal) {
    return next(AppError.badRequest('No recently closed appeal found for this contract', 'NO_RECENT_APPEAL'));
  }

  if (contract.status === 'completed') {
    return next(AppError.badRequest('Contract is already completed', 'CONTRACT_ALREADY_COMPLETED'));
  }

  if (contract.status === 'cancelled') {
    return next(AppError.badRequest('Contract is already cancelled', 'CONTRACT_ALREADY_CANCELLED'));
  }

  // Calculate and refund escrow
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

  const refundTransactions = [];

  for (const [currency, totalAmount] of Object.entries(escrowByCurrency)) {
    if (totalAmount <= 0) continue;

    const currentEscrow = typeof client.wallet.escrow.get === 'function' 
      ? client.wallet.escrow.get(currency) || 0 
      : client.wallet.escrow[currency] || 0;
    
    const newEscrow = Math.max(0, currentEscrow - totalAmount);
    
    if (typeof client.wallet.escrow.set === 'function') {
      client.wallet.escrow.set(currency, newEscrow);
    } else {
      client.wallet.escrow[currency] = newEscrow;
    }

    const currentBalance = typeof client.wallet.balances.get === 'function'
      ? client.wallet.balances.get(currency) || 0
      : client.wallet.balances[currency] || 0;
    
    const newBalance = currentBalance + totalAmount;
    
    if (typeof client.wallet.balances.set === 'function') {
      client.wallet.balances.set(currency, newBalance);
    } else {
      client.wallet.balances[currency] = newBalance;
    }

    refundTransactions.push(
      Transaction.create({
        user: client._id,
        type: 'escrow_refund',
        amount: totalAmount,
        currency,
        status: 'completed',
        paymentGateway: 'wallet',
        paymentMethod: 'wallet',
        relatedId: contract._id,
        relatedType: 'Contract',
        description: `Escrow refund after contract cancellation: ${contract.jobPost?.title || 'Contract'}`,
      })
    );
  }

  await Promise.all(refundTransactions);
  await client.save();

  // Mark contract as cancelled
  contract.status = 'cancelled';
  await contract.save();

  // Notify student
  const frontendUrl = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://freshlancer.online' : 'http://localhost:3000');
  const student = await User.findById(contract.student);

  try {
    await Notification.create({
      user: contract.student,
      type: 'contract_cancelled',
      title: 'Contract Cancelled',
      message: `${req.user.name} has cancelled the contract after the appeal was closed. All escrow funds have been refunded.`,
      relatedId: contract._id,
      relatedType: 'Contract',
      actionUrl: `${frontendUrl}/student/contracts?contractId=${contract._id}`,
      icon: 'x',
    });

    if (student?.email) {
      sendEmail({
        type: 'contract-cancelled',
        email: student.email,
        name: student.name,
        clientName: req.user.name,
        contractId: contract._id.toString(),
        dashboardUrl: `${frontendUrl}/student/contracts?contractId=${contract._id}`,
      }).catch((e) => logger.error('❌ Failed to send contract-cancelled email:', e.message));
    }
  } catch (e) {
    logger.error('❌ Failed to notify about contract cancellation:', e.message);
  }

  res.status(200).json({
    status: 'success',
    data: { contract },
    message: 'Contract cancelled and escrow refunded',
  });
});

