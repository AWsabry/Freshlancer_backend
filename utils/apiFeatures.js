class ApiFeatures {
  constructor(query, queryString) {
    this.query = query;
    this.queryString = queryString;
  }

  filter() {
    //remove excluded from query (filter)
    const queryObj = { ...this.queryString };
    const excluded = ['sort', 'page', 'limit', 'fields'];
    excluded.forEach((el) => delete queryObj[el]);
    //add $ to query (filter)
    let queryStr = JSON.stringify(queryObj);
    queryStr = JSON.parse(
      queryStr.replace(/\b(gte|gt|lt|lte)\b/g, (el) => `$${el}`)
    );
    this.query = this.query.find(queryStr);
    return this;
  }

  sort() {
    if (this.queryString.sort) {
      const sortQuery = this.queryString.sort.split(',').join(' ');
      this.query = this.query.sort(sortQuery);
    } else this.query = this.query.sort('name');
    return this;
  }

  select() {
    if (this.queryString.fields) {
      const fieldsQuery = this.queryString.fields.split(',').join(' ');
      this.query = this.query.select(fieldsQuery);
    } else this.query = this.query.select('-__v');
    return this;
  }

  paginate() {
    const page = this.queryString.page * 1 || 1;
    const limit = this.queryString.limit * 1 || 100;
    const skip = (page - 1) * limit;
    this.query = this.query.skip(skip).limit(limit);
    return this;
  }
}
module.exports = ApiFeatures;
