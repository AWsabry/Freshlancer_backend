const Category = require('../models/categoryModel');
const JobPost = require('../models/jobPostModel');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// Get all categories (public - for students and clients)
exports.getAllCategories = catchAsync(async (req, res, next) => {
  const query = { isActive: true };
  
  const categories = await Category.find(query).sort({ name: 1 });



  res.status(200).json({
    status: 'success',
    results: categories.length,
    data: {
      categories,
    },
  });
});

// Get single category
exports.getCategory = catchAsync(async (req, res, next) => {
  const category = await Category.findById(req.params.id);

  if (!category) {
    return next(new AppError('No category found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      category,
    },
  });
});

// Create category (admin only)
exports.createCategory = catchAsync(async (req, res, next) => {
  // Check if category with same name already exists
  const existingCategory = await Category.findOne({
    name: { $regex: new RegExp(`^${req.body.name}$`, 'i') },
  });

  if (existingCategory) {
    return next(new AppError('Category with this name already exists', 400));
  }

  const categoryData = {
    ...req.body,
    createdBy: req.user._id,
  };

  const category = await Category.create(categoryData);

  res.status(201).json({
    status: 'success',
    data: {
      category,
    },
  });
});

// Update category (admin only)
exports.updateCategory = catchAsync(async (req, res, next) => {
  const category = await Category.findById(req.params.id);

  if (!category) {
    return next(new AppError('No category found with that ID', 404));
  }

  const oldName = category.name;

  // Check if name is being updated and if it conflicts with existing category
  if (req.body.name && req.body.name !== category.name) {
    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${req.body.name}$`, 'i') },
      _id: { $ne: req.params.id },
    });

    if (existingCategory) {
      return next(new AppError('Category with this name already exists', 400));
    }
  }

  Object.assign(category, req.body);
  await category.save();

  // IMPORTANT: Job posts store category as a STRING (category name).
  // If category name changes, update existing job posts to preserve integrity.
  if (req.body.name && req.body.name !== oldName) {
    await JobPost.updateMany(
      { category: oldName },
      { $set: { category: category.name } }
    );
  }

  res.status(200).json({
    status: 'success',
    data: {
      category,
    },
  });
});

// Delete category (admin only) - soft delete by setting isActive to false
exports.deleteCategory = catchAsync(async (req, res, next) => {
  const category = await Category.findById(req.params.id);

  if (!category) {
    return next(new AppError('No category found with that ID', 404));
  }

  // Check if category is being used by any job posts
  const jobsUsingCategory = await JobPost.countDocuments({
    category: category.name,
  });

  if (jobsUsingCategory > 0) {
    return next(
      new AppError(
        `Cannot delete category. It is being used by ${jobsUsingCategory} job post(s). Please deactivate it instead.`,
        400
      )
    );
  }

  // Soft delete by setting isActive to false
  category.isActive = false;
  await category.save();

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

// Hard delete category (admin only) - only if no jobs use it
exports.hardDeleteCategory = catchAsync(async (req, res, next) => {
  const category = await Category.findById(req.params.id);

  if (!category) {
    return next(new AppError('No category found with that ID', 404));
  }

  // Check if category is being used by any job posts
  const jobsUsingCategory = await JobPost.countDocuments({
    category: category.name,
  });

  if (jobsUsingCategory > 0) {
    return next(
      new AppError(
        `Cannot delete category. It is being used by ${jobsUsingCategory} job post(s).`,
        400
      )
    );
  }

  await Category.findByIdAndDelete(req.params.id);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

// Get all categories including inactive (admin only)
// Returns ALL categories globally, regardless of who created them
exports.getAllCategoriesAdmin = catchAsync(async (req, res, next) => {
  // Get ALL categories globally (including inactive) - no filter on createdBy
  const categories = await Category.find({}).sort({ name: 1 }).populate({
    path: 'createdBy',
    select: 'name email',
  });

  // Get job count for each category
  const categoriesWithCounts = await Promise.all(
    categories.map(async (category) => {
      const jobCount = await JobPost.countDocuments({ category: category.name });
      return {
        ...category.toObject(),
        jobCount,
      };
    })
  );
  console.log("categoriesWithCounts" + categoriesWithCounts);
  console.log("categories" + categories);

  res.status(200).json({
    status: 'success',
    results: categoriesWithCounts.length,
    data: {
      categories: categories,
    },
  });
});

