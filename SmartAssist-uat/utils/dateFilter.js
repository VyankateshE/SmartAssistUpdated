const moment = require("moment-timezone");

const today = new Date();
const oneWeekLater = new Date();
const oneWeekBefore = new Date();
const yesterday = new Date();

oneWeekLater.setDate(today.getDate() + 7);
oneWeekBefore.setDate(today.getDate() - 7);
yesterday.setDate(today.getDate() - 1);

const todayDate = moment().tz("Asia/Kolkata").format("YYYY-MM-DD");
const oneWeekLaterDate = moment(oneWeekLater).format("YYYY-MM-DD");
const oneWeekBeforeDate = moment(oneWeekBefore).format("YYYY-MM-DD");
const yesterdayDate = moment(yesterday).format("YYYY-MM-DD");

const now = moment.tz("Asia/Kolkata").format("HH:mm:ss");
const CurrentDate = () =>
  moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

const twoDaysAgo = moment
  .tz("Asia/Kolkata")
  .subtract(2, "days")
  .format("YYYY-MM-DD HH:mm:ss");

//greetings
const greet = (fname, lname) => {
  if (fname.length < 3) {
    const currentTime = moment().tz("Asia/Kolkata").format("HH:mm");
    if (currentTime >= "06:00" && currentTime < "12:00") {
      return `Good Morning! ${lname}`;
    } else if (currentTime >= "12:00" && currentTime < "18:00") {
      return `Good Afternoon! ${lname}`;
    } else {
      return `Good Evening! ${lname}`;
    }
  } else {
    const currentTime = moment().tz("Asia/Kolkata").format("HH:mm");
    if (currentTime >= "06:00" && currentTime < "12:00") {
      return `Good Morning! ${fname}`;
    } else if (currentTime >= "12:00" && currentTime < "18:00") {
      return `Good Afternoon! ${fname}`;
    } else {
      return `Good Evening! ${fname}`;
    }
  }
};

const dateController = {
  now,
  todayDate,
  oneWeekLaterDate,
  oneWeekBeforeDate,
  yesterdayDate,
  twoDaysAgo,
  CurrentDate,
  greet,
};

module.exports = dateController;
