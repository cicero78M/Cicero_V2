// src/utils/sqlPriority.js
import { PRIORITY_USER_NAMES } from './constants.js';

export function buildPriorityOrderClause(columnSql, pushParam) {
  const priorityNames = PRIORITY_USER_NAMES.map(name => name.toUpperCase());
  const fallbackRank = priorityNames.length + 1;

  const whenClauses = priorityNames.map((name, index) => {
    const paramIndex = pushParam(name);
    return `WHEN UPPER(${columnSql}) = $${paramIndex} THEN ${index + 1}`;
  });

  const priorityCase = `CASE
      ${whenClauses.join('\n      ')}
      ELSE ${fallbackRank}
    END`;

  return { priorityCase, fallbackRank };
}
