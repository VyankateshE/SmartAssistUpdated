require("dotenv").config();
const logger = require("../middlewares/fileLogs/maximizerLogs");
const axios = require("axios");
const FormData = require("form-data");

const createUserInMax = async (user) => {
  try {
    const form = new FormData();

    form.append("name", user.name);
    form.append("username", user.excellence);
    form.append("password", user.password);
    form.append("dealer_id", user.dealer_id);
    form.append("email", user.email);
    form.append("mobile", user.phone);
    form.append("department", "sales");
    const response = await axios.post(process.env.NEW_USER_MAX, form, {
      headers: {
        ...form.getHeaders(),

        "api-key": "sOcru#pKG9ONzPO",
        "client-id": "kfuW5oWb",
      },
    });

    logger.info(`user created on maximizer: ${JSON.stringify(response.data)}`);
    console.log(`user created on maximizer: ${JSON.stringify(response.data)}`);
    // return response.data;
  } catch (err) {
    console.error("Maximizer API err:", err.response?.data || err.message);
    logger.error(
      `Failed to create user in maximizer: ${
        err.response?.data?.message || err.message
      }`
    );
  }
};
const suspendUserInMax = async (user) => {
  try {
    const form = new FormData();

    // form.append("name", user.name || "Mustafa");
    form.append("username", user.excellence);
    form.append("email", user.email);
    // form.append("password", user.password || "Test@1234");
    // form.append("dealer_id", user.dealer_id) || "10206";
    // form.append("mobile", user.phone || "9090090900");
    // form.append("department", "sales");
    const response = await axios.post(process.env.REMOVE_USER_MAX, form, {
      headers: {
        ...form.getHeaders(),

        "api-key": "sOcru#pKG9ONzPO",
        "client-id": "kfuW5oWb",
      },
    });

    logger.info(
      `user suspended on maximizer: ${JSON.stringify(response.data)}`
    );
    console.log(
      `user suspended on maximizer: ${JSON.stringify(response.data)}`
    );
    // return response.data;
  } catch (err) {
    console.error("Maximizer API err:", err.response?.data || err.message);
    logger.error(
      `Failed to suspend user in maximizer: ${
        err.response?.data?.message || err.message
      }`
    );
  }
};

module.exports = {
  createUserInMax,
  suspendUserInMax,
};
