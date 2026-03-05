const dashboardRateLimit = (key) => {
  const userRequestCounts = new Map();
  const userLastResponse = new Map();

  const WINDOW_MS = 60 * 1000;
  const MAX_REQUESTS = 2;
  return (req, res, next) => {
    const userId = req.userId;
    const now = Date.now();

    // Create a per-user-per-query cache key
    const cacheKey = `${userId}:${req.originalUrl}`;

    if (!userRequestCounts.has(userId)) {
      userRequestCounts.set(userId, { count: 0, timestamp: now });
    }

    const entry = userRequestCounts.get(userId);

    // Reset if expired
    if (now - entry.timestamp > WINDOW_MS) {
      entry.count = 0;
      entry.timestamp = now;
    }

    entry.count++;

    // Over limit -> return cached for THIS QUERY ONLY
    if (entry.count > MAX_REQUESTS) {
      const cached = userLastResponse.get(cacheKey);
      if (cached) {
        return res.json(cached.data);
      }

      return next();
    }

    // Capture and save response per cacheKey
    const originalJson = res.json.bind(res);

    res.json = (body) => {
      userLastResponse.set(cacheKey, {
        data: body,
        timestamp: Date.now(),
      });

      return originalJson(body);
    };

    next();
  };
};

const appDashboardRateLimit = (key) => {
  const userRequestCounts = new Map();
  const userLastResponse = new Map();

  const WINDOW_MS = 60 * 1000;
  const MAX_REQUESTS = 2;
  return (req, res, next) => {
    const userId = req.userId;
    const now = Date.now();

    // Create a per-user-per-query cache key
    const cacheKey = `${userId}:${req.originalUrl}`;

    if (!userRequestCounts.has(userId)) {
      userRequestCounts.set(userId, { count: 0, timestamp: now });
    }

    const entry = userRequestCounts.get(userId);

    // Reset if expired
    if (now - entry.timestamp > WINDOW_MS) {
      entry.count = 0;
      entry.timestamp = now;
    }

    entry.count++;

    // Over limit -> return cached for THIS QUERY ONLY
    if (entry.count > MAX_REQUESTS) {
      const cached = userLastResponse.get(cacheKey);
      if (cached) {
        console.log("Serving from cache for key:", cacheKey);
        return res.json(cached.data);
      }

      return next();
    }

    // Capture and save response per cacheKey
    const originalJson = res.json.bind(res);

    res.json = (body) => {
      userLastResponse.set(cacheKey, {
        data: body,
        timestamp: Date.now(),
      });

      return originalJson(body);
    };

    next();
  };
};

module.exports = { dashboardRateLimit, appDashboardRateLimit };
