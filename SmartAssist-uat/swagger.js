const swaggerAutogen = require("swagger-autogen")();

const doc = {
  info: {
    title: "Smart Assist API doc",
    description: "Routes Demonstration of the app",
  },
  host: "dev.smartassistapp.in",
  schemes: ["https"],
  securityDefinitions: {
    bearerAuth: {
      type: "apiKey",
      name: "Authorization",
      in: "header",
      description: "Enter your bearer token in the format **Bearer <token>**",
    },
  },
  security: [{ bearerAuth: [] }],
};

const outputFile = "./swagger-output.json";
const routes = ["./server.js"];

/* NOTE: If you are using the express Router, you must pass in the 'routes' only the 
root file where the route starts, such as index.js, app.js, routes.js, etc ... */

swaggerAutogen(outputFile, routes, doc);
