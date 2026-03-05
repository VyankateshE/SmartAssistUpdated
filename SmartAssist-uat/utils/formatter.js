const moment = require("moment");

//trim string value
const trimStringValues = (values) => {
  return values.map((value) => {
    if (!value) {
      return null;
    }
    return value.trim();
  });
};

//format date
const formatDate = (dateVal) => {
  if (!dateVal) {
    return null;
  }
  return moment(dateVal, "DD-MM-YYYY").local().format("YYYY-MM-DD");
};

module.exports = { trimStringValues, formatDate };
