const createResponse = (res, status, message, data = null) => {
  return res.status(status).json({
    status,
    message,
    data,
  });
};

const responses = {
  success: (res, message, data) => createResponse(res, 200, message, data),
  created: (res, message, data) => createResponse(res, 201, message, data),
  badRequest: (res, message) => createResponse(res, 400, message),
  unauthorized: (res, message) => createResponse(res, 401, message),
  forbidden: (res, message) => createResponse(res, 403, message),
  notFound: (res, message) => createResponse(res, 404, message),
  serverError: (res, message) => createResponse(res, 500, message),
};

module.exports = responses;
