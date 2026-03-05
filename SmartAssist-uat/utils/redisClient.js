const redis = require("redis");
require("dotenv").config();

let client;

const initRedis = async () => {
  if (!client) {
    client = redis.createClient({
      username: process.env.CLIENT_USERNAME || "default",
      password: process.env.CLIENT_PWD,
      socket: {
        host: process.env.CLIENT_HOST,
        port: Number(process.env.CLIENT_PORT),
        tls: process.env.NODE_ENV === "production" ? {} : undefined,
      },
    });

    client.on("error", (err) => console.error("Redis Client Error", err));

    await client.connect();
    console.log("✅ Redis connected");
  }
  return client;
};

const getClient = () => {
  if (!client) {
    throw new Error("Redis client not initialized. Call initRedis() first.");
  }
  return client;
};

module.exports = { initRedis, getClient };
