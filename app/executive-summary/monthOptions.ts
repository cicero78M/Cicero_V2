export type MonthOption = {
  key: string;
  label: string;
};

export const buildMonthKey = (year: number, monthIndexZeroBased: number): string => {
  const monthNumber = String(monthIndexZeroBased + 1).padStart(2, "0");
  return `${year}-${monthNumber}`;
};

export const extractYearFromMonthKey = (monthKey: string | null | undefined): number | null => {
  if (typeof monthKey !== "string") {
    return null;
  }

  const [yearPart] = monthKey.split("-");
  const parsedYear = Number.parseInt(yearPart, 10);
  return Number.isFinite(parsedYear) ? parsedYear : null;
};

export const createMonthOptionFromKey = (
  monthKey: string | null | undefined,
  locale: string = "id-ID",
): MonthOption | null => {
  if (typeof monthKey !== "string") {
    return null;
  }

  const [yearPart, monthPart] = monthKey.split("-");
  const year = Number.parseInt(yearPart, 10);
  const month = Number.parseInt(monthPart, 10);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return null;
  }

  const monthIndexZeroBased = Math.min(Math.max(month, 1), 12) - 1;
  const displayDate = new Date(year, monthIndexZeroBased, 1);
  const monthFormatter = new Intl.DateTimeFormat(locale, { month: "long" });

  return {
    key: buildMonthKey(year, monthIndexZeroBased),
    label: `${monthFormatter.format(displayDate)} ${year}`,
  };
};

export const generateMonthOptions = ({
  year,
  locale,
}: {
  year?: number | null;
  locale?: string;
} = {}): MonthOption[] => {
  const now = new Date();
  const targetYear = Number.isFinite(year) ? (year as number) : now.getFullYear();
  const monthFormatter = new Intl.DateTimeFormat(locale ?? "id-ID", {
    month: "long",
  });

  return Array.from({ length: 12 }, (_, index) => {
    const displayDate = new Date(targetYear, index, 1);
    return {
      key: buildMonthKey(targetYear, index),
      label: `${monthFormatter.format(displayDate)} ${targetYear}`,
    };
  });
};

export const mergeAvailableMonthOptions = ({
  availableYears,
  locale = "id-ID",
  now = new Date(),
}: {
  availableYears?: Array<number | string | null | undefined> | null;
  locale?: string;
  now?: Date;
} = {}): MonthOption[] => {
  const optionsByKey = new Map<string, MonthOption>();
  const normalizedYears = Array.isArray(availableYears)
    ? Array.from(
        new Set(
          availableYears
            .map((year) => {
              const parsed = Number.parseInt(String(year ?? ""), 10);
              return Number.isFinite(parsed) ? parsed : null;
            })
            .filter(
              (year): year is number => typeof year === "number" && Number.isFinite(year),
            ),
        ),
      )
        .sort((a, b) => a - b)
    : [];

  const monthOptionsForYears = normalizedYears.map((year) =>
    generateMonthOptions({ year, locale }),
  );

  for (const options of monthOptionsForYears) {
    for (const option of options) {
      optionsByKey.set(option.key, option);
    }
  }

  if (Array.isArray(availableYears)) {
    for (const entry of availableYears) {
      if (typeof entry === "string" && entry.includes("-")) {
        const option = createMonthOptionFromKey(entry, locale);
        if (option) {
          optionsByKey.set(option.key, option);
        }
      }
    }
  }

  if (now instanceof Date && !Number.isNaN(now.getTime())) {
    const currentYear = now.getFullYear();
    const currentMonthIndex = now.getMonth();

    for (let monthIndex = 0; monthIndex <= currentMonthIndex; monthIndex += 1) {
      const option = createMonthOptionFromKey(buildMonthKey(currentYear, monthIndex), locale);
      if (option) {
        optionsByKey.set(option.key, option);
      }
    }
  }

  const byYear = new Map<number, MonthOption[]>();
  for (const option of optionsByKey.values()) {
    const year = extractYearFromMonthKey(option.key);
    if (year === null) {
      continue;
    }
    if (!byYear.has(year)) {
      byYear.set(year, []);
    }
    byYear.get(year)?.push(option);
  }

  const sortedYears = Array.from(byYear.keys()).sort((a, b) => a - b);

  const result: MonthOption[] = [];
  for (const year of sortedYears) {
    const options = byYear.get(year);
    if (!options) {
      continue;
    }
    options.sort((a, b) => a.key.localeCompare(b.key));
    result.push(...options);
  }

  return result.sort((a, b) => b.key.localeCompare(a.key));
};
