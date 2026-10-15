/**
 * Utilidades de formateo, sanitización y validación de incidencias.
 * Compatible con ES Modules y scripts clásicos (window.FormatUtils).
 */

/**
 * Escapa caracteres especiales HTML para evitar inyección o rotura de etiquetas.
 * @param {any} val
 * @returns {string}
 */
function esc(val) {
  return String(val == null ? '' : val).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

/**
 * Determina el título a mostrar o recurre a Categoría · Sistema.
 * @param {object} inc
 * @returns {string}
 */
function titleOrCat(inc) {
  if (!inc) return 'Incidencia';
  return inc.title || [inc.category, inc.system].filter(Boolean).join(' · ') || 'Incidencia';
}

/**
 * Trunca un texto a una longitud máxima añadiendo puntos suspensivos.
 * @param {string} text
 * @param {number} maxLen
 * @returns {string}
 */
function truncate(text, maxLen = 140) {
  if (!text || text.length <= maxLen) return text || '';
  return text.slice(0, maxLen - 1).trim() + '…';
}

/**
 * Valida la completitud de los datos de una incidencia para diapositivas.
 * Devuelve estado y lista de campos pendientes para feedback al editor.
 * @param {object} inc
 * @returns {{ isValid: boolean, missingFields: string[], warnings: string[] }}
 */
function validateIncident(inc) {
  const missingFields = [];
  const warnings = [];

  if (!inc) {
    return { isValid: false, missingFields: ['Datos no disponibles'], warnings: [] };
  }

  if (!inc.title || !inc.title.trim()) {
    missingFields.push('Título');
  }

  if (!inc.date || !inc.date.trim()) {
    warnings.push('Fecha');
  }

  const isRed = /^(RED|Otras)/.test(inc.group || '');
  if (isRed) {
    // En RED se espera impacto o métricas cuantitativas
    if (!inc.metrics && !inc.impact) {
      missingFields.push('Métricas o Impacto');
    }
  } else {
    // En IT se espera texto de impacto
    if (!inc.impact || !inc.impact.trim()) {
      missingFields.push('Impacto');
    }
  }

  if (!inc.cause || !inc.cause.trim()) {
    warnings.push('Causa');
  }

  if (!inc.solution || !inc.solution.trim()) {
    warnings.push('Solución');
  }

  return {
    isValid: missingFields.length === 0,
    missingFields,
    warnings,
  };
}

const FormatUtils = {
  esc,
  titleOrCat,
  truncate,
  validateIncident,
};

if (typeof window !== 'undefined') {
  window.FormatUtils = FormatUtils;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FormatUtils;
}

