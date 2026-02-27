const moment = require("moment-timezone");

const Range = {
  day: { amount: 1, unit: "days" },
  week: { amount: 7, unit: "days" },
  quarter: { amount: 3, unit: "months" },
  year: { amount: 1, unit: "years" },
};

const getRangeDate = (rangeType) => {
  const range = Range[rangeType];
  if (!range) return null;
  return moment().subtract(range.amount, range.unit).format("YYYY-MM-DD");
};

module.exports = { getRangeDate };
