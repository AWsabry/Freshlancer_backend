const path = require('path');
const swaggerJSDoc = require('swagger-jsdoc');

const port = process.env.PORT || 8080;
const serverFromEnv = process.env.BASE_URL;
const servers = serverFromEnv
  ? [{ url: serverFromEnv, description: 'Configured server' }]
  : [
      {
        url: `http://localhost:${port}`,
        description: 'Local development (default; override with BASE_URL)',
      },
    ];

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Freshlancer API',
      version: '1.0.0',
      description:
        'OpenAPI documentation for the Freshlancer backend. For protected routes, call **POST /api/v1/users/login**, copy the token from the response, then use **Authorize** and paste: `Bearer <token>`. The API also accepts the JWT in a `jwt` cookie.',
    },
    servers,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT from login response, sent as: Authorization: Bearer <token>',
        },
      },
    },
  },
  apis: [
    path.join(__dirname, 'openapiPaths.js'),
    path.join(__dirname, '../routers', '*.js'),
    path.join(__dirname, '../app.js'),
  ],
};

module.exports = swaggerJSDoc(options);
