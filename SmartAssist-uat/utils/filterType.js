const moment = require("moment-timezone");

const dateConfig = {
  DAY: {
    getStartDate: (today, timezone) =>
      moment.tz(today, timezone).startOf("day"),
  },
  YESTERDAY: {
    getStartDate: (today, timezone) =>
      moment.tz(today, timezone).subtract(1, "day").startOf("day"),
    getEndDate: (today, timezone) =>
      moment.tz(today, timezone).subtract(1, "day").endOf("day"),
  },

  WEEK: {
    getStartDate: (today, timezone) =>
      moment.tz(today, timezone).startOf("isoWeek"),
    getEndDate: (today, timezone) => moment.tz(today, timezone).endOf("day"),
  },
  LAST_WEEK: {
    getStartDate: (today, timezone) =>
      moment.tz(today, timezone).subtract(1, "week").startOf("isoWeek"),
    getEndDate: (today, timezone) =>
      moment.tz(today, timezone).subtract(1, "week").endOf("isoWeek"),
  },
  MTD: {
    getStartDate: (today, timezone) =>
      moment.tz(today, timezone).startOf("month"),
  },
  LAST_MONTH: {
    getStartDate: (today, timezone) =>
      moment.tz(today, timezone).subtract(1, "month").startOf("month"),
    getEndDate: (today, timezone) =>
      moment.tz(today, timezone).subtract(1, "month").endOf("month"),
  },
  QTD: {
    getStartDate: (today, timezone) => {
      const m = moment.tz(today, timezone);
      const quarterStartMonth = Math.floor(m.month() / 3) * 3;
      return m.month(quarterStartMonth).startOf("month");
    },
  },
  LAST_QUARTER: {
    getStartDate: (today, timezone) => {
      const m = moment.tz(today, timezone).subtract(1, "quarter");
      const quarterStartMonth = Math.floor(m.month() / 3) * 3;
      return m.month(quarterStartMonth).startOf("month");
    },
    getEndDate: (today, timezone) => {
      const m = moment.tz(today, timezone).subtract(1, "quarter");
      const quarterStartMonth = Math.floor(m.month() / 3) * 3;
      return m.month(quarterStartMonth + 2).endOf("month");
    },
  },
  SIX_MONTH: {
    getStartDate: (today, timezone) =>
      moment.tz(today, timezone).subtract(6, "months").startOf("day"),
  },
  YTD: {
    getStartDate: (today, timezone) => {
      const m = moment.tz(today, timezone);
      const fiscalYear = m.month() >= 3 ? m.year() : m.year() - 1;
      return moment.tz([fiscalYear, 3, 1], timezone).startOf("day");
    },
  },
  LIFETIME: {
    getStartDate: (today, timezone) =>
      moment.tz("1900-01-01", timezone).startOf("day"),
  },
};

const getDateRange = (type = "DAY", timezone = "Asia/Kolkata") => {
  const today = moment().tz(timezone);
  const config = dateConfig[type];

  const start = config
    .getStartDate(today, timezone)
    .format("YYYY-MM-DD HH:mm:ss");

  const end = config.getEndDate
    ? config.getEndDate(today, timezone).format("YYYY-MM-DD HH:mm:ss")
    : moment.tz(today, timezone).endOf("day").format("YYYY-MM-DD HH:mm:ss");

  return {
    start,
    end,
  };
};

const groupDataByHour = (records, dateFields, timezone = "Asia/Kolkata") => {
  const fields = Array.isArray(dateFields) ? dateFields : [dateFields];
  const hourCounts = {};
  for (let i = 0; i < 24; i++) {
    hourCounts[`${i.toString().padStart(2, "0")}:00`] = 0;
  }

  const parseHour = (value) => {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number" || /^\d+$/.test(String(value).trim())) {
      const num = Number(value);

      const ms = num < 1e12 ? num * 1000 : num;
      const m = moment.tz(ms, timezone);
      return m.isValid() ? m.hour() : null;
    }

    const s = String(value).trim();
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
      const fmt = s.split(":").length === 2 ? "HH:mm" : "HH:mm:ss";
      const m = moment.tz(s, fmt, timezone);
      return m.isValid() ? m.hour() : null;
    }

    const m1 = moment.tz(s, timezone);
    if (m1.isValid()) return m1.hour();

    // fallback parse
    const m2 = moment(s);
    return m2.isValid() ? m2.hour() : null;
  };

  records.forEach((record) => {
    let hour = null;
    for (const f of fields) {
      if (record && record[f]) {
        hour = parseHour(record[f]);
        if (hour !== null) break;
      }
    }
    if (hour !== null) {
      const label = `${hour.toString().padStart(2, "0")}:00`;
      hourCounts[label] = (hourCounts[label] || 0) + 1;
    }
  });

  return Object.entries(hourCounts).map(([hour, count]) => ({ hour, count }));
};

const groupData = (records, dateField, type, timezone = "Asia/Kolkata") => {
  if (!records.length) return [];

  const { start: rangeStart, end: rangeEnd } = getDateRange(type, timezone);
  const startMoment = moment.tz(rangeStart, timezone);
  const endMoment = moment.tz(rangeEnd, timezone);

  const buckets = [];

  if (["DAY", "YESTERDAY"].includes(type)) {
    // Hourly grouping
    let current = startMoment.clone().startOf("hour");
    while (current.isSameOrBefore(endMoment)) {
      buckets.push({
        label: current.format("HH:00"),
        start: current.clone(),
        end: current.clone().endOf("hour"),
        count: 0,
      });
      current.add(1, "hour");
    }
  } else if (["WEEK", "LAST_WEEK"].includes(type)) {
    // Daily grouping with full date
    let current = startMoment.clone().startOf("day");
    while (current.isSameOrBefore(endMoment)) {
      buckets.push({
        label: current.format("ddd, DD MMM"),
        start: current.clone(),
        end: current.clone().endOf("day"),
        count: 0,
      });
      current.add(1, "day");
    }
  } else if (["MTD", "LAST_MONTH"].includes(type)) {
    // Weekly grouping like "Wk of 01 Sep"
    let current = startMoment.clone().startOf("isoWeek");
    while (current.isSameOrBefore(endMoment)) {
      const weekEnd = moment.min(current.clone().endOf("isoWeek"), endMoment);
      buckets.push({
        label: `Wk of ${current.format("DD MMM")}`,
        start: current.clone(),
        end: weekEnd,
        count: 0,
      });
      current.add(1, "week");
    }
  } else if (["QTD", "LAST_QUARTER"].includes(type)) {
    // Monthly grouping with short month name (no year)
    let current = startMoment.clone().startOf("month");
    while (current.isSameOrBefore(endMoment)) {
      buckets.push({
        label: current.format("MMM"),
        start: current.clone(),
        end: current.clone().endOf("month"),
        count: 0,
      });
      current.add(1, "month");
    }
  } else if (type === "SIX_MONTH") {
    // Monthly grouping with month+year
    let current = startMoment.clone().startOf("month");
    while (current.isSameOrBefore(endMoment)) {
      buckets.push({
        label: current.format("MMM YYYY"),
        start: current.clone(),
        end: current.clone().endOf("month"),
        count: 0,
      });
      current.add(1, "month");
    }
  } else if (type === "YTD") {
    // Quarterly grouping like "Apr - Jun"
    let current = startMoment.clone().startOf("quarter");
    while (current.isSameOrBefore(endMoment)) {
      const quarterEnd = moment.min(
        current.clone().endOf("quarter"),
        endMoment
      );
      buckets.push({
        label: `${current.format("MMM")} - ${quarterEnd.format("MMM")}`,
        start: current.clone(),
        end: quarterEnd,
        count: 0,
      });
      current.add(1, "quarter");
    }
  } else {
    // Default daily grouping
    let current = startMoment.clone().startOf("day");
    while (current.isSameOrBefore(endMoment)) {
      buckets.push({
        label: current.format("DD MMM"),
        start: current.clone(),
        end: current.clone().endOf("day"),
        count: 0,
      });
      current.add(1, "day");
    }
  }

  // Fill counts
  records.forEach((record) => {
    const date = moment(record[dateField]).tz(timezone);
    const bucket = buckets.find((b) =>
      date.isBetween(b.start, b.end, null, "[]")
    );
    if (bucket) bucket.count++;
  });

  return buckets.map((b) => ({ label: b.label, count: b.count }));
};

module.exports = { getDateRange, groupData, groupDataByHour };
