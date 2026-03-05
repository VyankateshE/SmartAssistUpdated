require("dotenv").config();

// Middleware for Basic Auth
const basicAuth = (req, res, next) => {
  console.log("Auth header received:", req.headers["authorization"]);

  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Basic ")) {
    console.log("Missing or invalid auth header format");
    return res.status(401).json({ message: "Missing Authorization Header" });
  }

  const base64Credentials = authHeader.split(" ")[1];
  const credentials = Buffer.from(base64Credentials, "base64").toString(
    "utf-8"
  );
  const [username, password] = credentials.split(":");

  console.log("Decoded username:", username);
  console.log("Expected username:", process.env.BASIC_AUTH_USER);

  if (
    username === process.env.BASIC_AUTH_USER &&
    password === process.env.BASIC_AUTH_PASS
  ) {
    console.log("Authentication successful");
    return next();
  } else {
    console.log("Authentication failed");
    return res.status(401).json({ message: "Invalid Credentials" });
  }
};

module.exports = basicAuth;
