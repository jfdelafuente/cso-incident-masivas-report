/**
 * Utilidades unificadas de fechas y semanas ISO 8601
 * Compatible tanto con ES Modules como con scripts clásicos (window.DateUtils).
 */

const MONTH_NAMES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

/**
 * Obtiene el año y semana ISO 8601 correspondiente a una fecha dada.
 * (Semana comienza en lunes; semana 1 contiene el primer jueves del año).
 * @param {Date} [date] - Fecha a evaluar (por defecto fecha actual)
 * @returns {{ year: number, week: number }}
 */
function getIsoYearWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Lunes=0 ... Domingo=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // Jueves de esta semana
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d - firstThursday) / (7 * 86400000));
  return { year: d.getUTCFullYear(), week };
}

/**
 * Obtiene la fecha (UTC) del lunes de una semana ISO de un año dado.
 * @param {number} year
 * @param {number} week
 * @returns {Date}
 */
function getMondayOfIsoWeek(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = (jan4.getUTCDay() + 6) % 7;
  const monWeek1 = new Date(Date.UTC(year, 0, 4 - dayOfWeek));
  return new Date(monWeek1.getTime() + (week - 1) * 7 * 86400000);
}

/**
 * Genera el rango de fechas formateado en español (Lun - Vie laboral estándar).
 * Ejemplo: "12 – 16 octubre 2026" o "29 junio – 3 julio 2026".
 * @param {number} year
 * @param {number} week
 * @returns {string}
 */
function getWeekDateRange(year, week) {
  const mon = getMondayOfIsoWeek(Number(year), Number(week));
  const fri = new Date(mon.getTime() + 4 * 86400000);

  const mDay = mon.getUTCDate();
  const mMonth = mon.getUTCMonth();
  const mYear = mon.getUTCFullYear();

  const fDay = fri.getUTCDate();
  const fMonth = fri.getUTCMonth();
  const fYear = fri.getUTCFullYear();

  if (mYear !== fYear) {
    return `${mDay} ${MONTH_NAMES_ES[mMonth]} ${mYear} – ${fDay} ${MONTH_NAMES_ES[fMonth]} ${fYear}`;
  } else if (mMonth !== fMonth) {
    return `${mDay} ${MONTH_NAMES_ES[mMonth]} – ${fDay} ${MONTH_NAMES_ES[fMonth]} ${fYear}`;
  } else {
    return `${mDay} – ${fDay} ${MONTH_NAMES_ES[fMonth]} ${fYear}`;
  }
}

/**
 * Formatea una fecha o cadena ISO en formato local legible (DD/MM/AAAA HH:MM).
 * @param {string|Date} dateVal
 * @returns {string}
 */
function formatDisplayDate(dateVal) {
  if (!dateVal) return '';
  const d = typeof dateVal === 'string' ? new Date(dateVal) : dateVal;
  if (isNaN(d.getTime())) return String(dateVal);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

const DateUtils = {
  MONTH_NAMES_ES,
  getIsoYearWeek,
  getMondayOfIsoWeek,
  getWeekDateRange,
  formatDisplayDate,
};

// Exposición global para compatibilidad con scripts no modulares
if (typeof window !== 'undefined') {
  window.DateUtils = DateUtils;
}

// Exportación para ES Modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DateUtils;
}
