const express = require('express');
const categoryController = require('../controllers/categoryController');
const authController = require('../controllers/authController');

const router = express.Router();

// Public routes - get active categories
router.get('/', categoryController.getAllCategories);

// Admin route for getting all categories (including inactive)
// CRITICAL: This must be defined BEFORE /:id route to work correctly
router.get(
  '/admin/all',
  authController.protect,
  authController.restrictTo('admin'),
  categoryController.getAllCategoriesAdmin
);

// Public route - get single category by ID
// Must be after /admin/all to avoid route conflicts
router.get('/:id', categoryController.getCategory);

// Admin routes for CRUD operations
router.use(authController.protect, authController.restrictTo('admin'));
router.post('/', categoryController.createCategory);
router.patch('/:id', categoryController.updateCategory);
router.delete('/:id', categoryController.deleteCategory);
router.delete('/:id/hard', categoryController.hardDeleteCategory);

module.exports = router;

