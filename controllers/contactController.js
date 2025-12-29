const Contact = require('../models/contactModel');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const sendEmail = require('../utils/email');
const logger = require('../utils/logger');

// Create a new contact submission (public - no auth required)
exports.createContact = catchAsync(async (req, res, next) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    return next(new AppError('All fields are required', 400));
  }

  const contact = await Contact.create({
    name,
    email,
    subject,
    message,
  });

  // Send email to support@freshlancer.online asynchronously
  sendEmail({
    type: 'contact-form',
    email: 'support@freshlancer.online',
    name: 'Support Team',
    subject: `New Contact Form Submission: ${subject}`,
    contactName: name,
    contactEmail: email,
    contactSubject: subject,
    contactMessage: message,
  })
    .then(() => {
      logger.info('✅ Contact form email sent to support@freshlancer.online:', {
        contactId: contact._id,
        from: email,
        subject: subject,
      });
    })
    .catch(err => {
      logger.error('❌ Failed to send contact form email:', {
        error: err.message,
        contactId: contact._id,
        from: email,
        subject: subject,
      });
    });

  res.status(201).json({
    status: 'success',
    message: 'Thank you for contacting us! We will get back to you soon.',
    data: {
      contact: {
        id: contact._id,
        name: contact.name,
        email: contact.email,
        subject: contact.subject,
        createdAt: contact.createdAt,
      },
    },
  });
});

// Get all contact submissions (admin only)
exports.getAllContacts = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Filter options
  const filter = {};
  if (req.query.status) {
    filter.status = req.query.status;
  }
  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { email: { $regex: req.query.search, $options: 'i' } },
      { subject: { $regex: req.query.search, $options: 'i' } },
    ];
  }

  const contacts = await Contact.find(filter)
    .sort('-createdAt')
    .skip(skip)
    .limit(limit)
    .populate('repliedBy', 'name email');

  const total = await Contact.countDocuments(filter);

  res.status(200).json({
    status: 'success',
    results: contacts.length,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    data: {
      contacts,
    },
  });
});

// Get a single contact submission (admin only)
exports.getContact = catchAsync(async (req, res, next) => {
  const contact = await Contact.findById(req.params.id).populate(
    'repliedBy',
    'name email'
  );

  if (!contact) {
    return next(new AppError('Contact submission not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      contact,
    },
  });
});

// Update contact status (admin only)
exports.updateContactStatus = catchAsync(async (req, res, next) => {
  const { status } = req.body;

  if (!['new', 'read', 'replied', 'archived'].includes(status)) {
    return next(
      new AppError(
        'Invalid status. Must be: new, read, replied, or archived',
        400
      )
    );
  }

  const contact = await Contact.findByIdAndUpdate(
    req.params.id,
    { status, updatedAt: Date.now() },
    { new: true, runValidators: true }
  );

  if (!contact) {
    return next(new AppError('Contact submission not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      contact,
    },
  });
});

// Reply to contact (admin only)
exports.replyToContact = catchAsync(async (req, res, next) => {
  const { replyMessage } = req.body;

  if (!replyMessage || replyMessage.trim().length === 0) {
    return next(new AppError('Reply message is required', 400));
  }

  const contact = await Contact.findByIdAndUpdate(
    req.params.id,
    {
      status: 'replied',
      repliedAt: Date.now(),
      repliedBy: req.user._id,
      replyMessage: replyMessage.trim(),
      updatedAt: Date.now(),
    },
    { new: true, runValidators: true }
  );

  if (!contact) {
    return next(new AppError('Contact submission not found', 404));
  }

  res.status(200).json({
    status: 'success',
    message: 'Reply sent successfully',
    data: {
      contact,
    },
  });
});

// Delete contact submission (admin only)
exports.deleteContact = catchAsync(async (req, res, next) => {
  const contact = await Contact.findByIdAndDelete(req.params.id);

  if (!contact) {
    return next(new AppError('Contact submission not found', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

// Get contact statistics (admin only)
exports.getContactStats = catchAsync(async (req, res, next) => {
  const total = await Contact.countDocuments();
  const newCount = await Contact.countDocuments({ status: 'new' });
  const readCount = await Contact.countDocuments({ status: 'read' });
  const repliedCount = await Contact.countDocuments({ status: 'replied' });
  const archivedCount = await Contact.countDocuments({ status: 'archived' });

  res.status(200).json({
    status: 'success',
    data: {
      stats: {
        total,
        new: newCount,
        read: readCount,
        replied: repliedCount,
        archived: archivedCount,
      },
    },
  });
});

