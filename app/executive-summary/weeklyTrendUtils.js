const pickNestedValue = (source, paths = []) => {
  if (!source) {
    return undefined;
  }

  for (const path of paths) {
    if (!path) {
      continue;
    }

    const segments = Array.isArray(path) ? path : String(path).split(".");
    let current = source;
    let valid = true;

    for (const segment of segments) {
      if (current == null) {
        valid = false;
        break;
      }
      current = current[segment];
    }

    if (!valid || current == null) {
      continue;
    }

    return current;
  }

  return undefined;
};

const pickNestedString = (source, paths = []) => {
  const value = pickNestedValue(source, paths);
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return undefined;
};

const parseDateValue = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const dateFromNumber = new Date(value * (value > 1e12 ? 1 : 1000));
    if (!Number.isNaN(dateFromNumber.valueOf())) {
      return dateFromNumber;
    }
  }

  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      const timestamp = numeric * (numeric > 1e12 ? 1 : 1000);
      const dateFromNumeric = new Date(timestamp);
      if (!Number.isNaN(dateFromNumeric.valueOf())) {
        return dateFromNumeric;
      }
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.valueOf())) {
      return parsed;
    }
  }

  return null;
};

const DEFAULT_ACTIVITY_DATE_PATHS = [
  "activityDate",
  "tanggal",
  "date",
  "created_at",
  "createdAt",
  "updated_at",
  "updatedAt",
  "time",
  "waktu",
  "publishedAt",
  "published_at",
  "timestamp",
  "rekap.tanggal",
  "rekap.date",
  "rekap.created_at",
  "rekap.createdAt",
];

const resolveRecordDate = (record, extraPaths = []) => {
  if (!record) {
    return null;
  }

  const normalizedPaths = Array.isArray(extraPaths)
    ? extraPaths
    : typeof extraPaths === "string"
    ? [extraPaths]
    : [];
  const candidatePaths = [...normalizedPaths, ...DEFAULT_ACTIVITY_DATE_PATHS];

  for (const path of candidatePaths) {
    const rawValue = pickNestedValue(record, [path]);
    const parsed = parseDateValue(rawValue);
    if (parsed) {
      return { raw: rawValue, parsed };
    }
  }

  return null;
};

const groupRecordsByWeek = (records, { getDate, datePaths } = {}) => {
  if (!Array.isArray(records) || records.length === 0) {
    return [];
  }

  const extractor =
    typeof getDate === "function"
      ? getDate
      : (record) => {
          const resolved = resolveRecordDate(record, datePaths);
          if (resolved) {
            return resolved.parsed;
          }
          return null;
        };

  const buckets = new Map();

  records.forEach((record) => {
    if (!record) {
      return;
    }

    const rawDate = extractor(record);
    const parsedDate = parseDateValue(rawDate);

    if (!parsedDate) {
      return;
    }

    const startOfDayUtc = new Date(
      Date.UTC(
        parsedDate.getUTCFullYear(),
        parsedDate.getUTCMonth(),
        parsedDate.getUTCDate(),
      ),
    );
    const weekday = startOfDayUtc.getUTCDay();
    const diffToMonday = weekday === 0 ? -6 : 1 - weekday;
    startOfDayUtc.setUTCDate(startOfDayUtc.getUTCDate() + diffToMonday);
    startOfDayUtc.setUTCHours(0, 0, 0, 0);

    const key = startOfDayUtc.toISOString().slice(0, 10);
    let bucket = buckets.get(key);
    if (!bucket) {
      const endDate = new Date(startOfDayUtc);
      endDate.setUTCDate(endDate.getUTCDate() + 6);
      bucket = {
        key,
        start: startOfDayUtc,
        end: endDate,
        records: [],
      };
      buckets.set(key, bucket);
    }

    bucket.records.push(record);
  });

  return Array.from(buckets.values()).sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
};

const shouldShowWeeklyTrendCard = ({
  showPlatformLoading,
  platformError,
  hasMonthlyPlatforms,
  cardHasRecords,
}) => {
  if (showPlatformLoading) {
    return true;
  }

  if (platformError && !hasMonthlyPlatforms) {
    return true;
  }

  return Boolean(cardHasRecords);
};

const formatWeekRangeLabel = (start, end, locale = "id-ID") => {
  if (!(start instanceof Date) || Number.isNaN(start.valueOf())) {
    return "";
  }

  const resolvedEnd =
    end instanceof Date && !Number.isNaN(end.valueOf())
      ? end
      : new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);

  const formatter = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  });

  const startLabel = formatter.format(start);
  const endLabel = formatter.format(resolvedEnd);

  if (startLabel === endLabel) {
    return startLabel;
  }

  return `${startLabel} – ${endLabel}`;
};

export {
  pickNestedValue,
  pickNestedString,
  parseDateValue,
  resolveRecordDate,
  groupRecordsByWeek,
  shouldShowWeeklyTrendCard,
  formatWeekRangeLabel,
};
