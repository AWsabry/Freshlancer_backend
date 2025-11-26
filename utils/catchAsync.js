module.exports = (fn) => (req, res, next) => {
  fn(req, res, next).catch(next);
};
//catch(err => next(err)) is the same as catch(next)
//we should return a function because we want to use it in the route handler
//we just pass the function to the catchAsync function and it will return a new function with the catch method
