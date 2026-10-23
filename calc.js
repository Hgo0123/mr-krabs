/* Fonctions de calcul pures : aucune dépendance au DOM ni au stockage.
   Montants en centimes (entiers en entrée, flottants possibles en sortie :
   l'arrondi ne se fait qu'à l'affichage). Dates locales au format AAAA-MM-JJ. */
(function (root) {
  'use strict';

  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
    'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

  const pad = (n) => String(n).padStart(2, '0');

  function toISO(y, m, d) {
    return `${y}-${pad(m)}-${pad(d)}`;
  }

  function parseISO(s) {
    const [y, m, d] = s.split('-').map(Number);
    return { y, m, d };
  }

  function monthKey(y, m) {
    return `${y}-${pad(m)}`;
  }

  function todayISO(now = new Date()) {
    return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  function daysInMonth(y, m) {
    return new Date(y, m, 0).getDate();
  }

  /** Jour de la semaine, 0 = lundi … 6 = dimanche. */
  function weekdayIndex(y, m, d) {
    return (new Date(y, m - 1, d).getDay() + 6) % 7;
  }

  function addMonths(y, m, delta) {
    const t = y * 12 + (m - 1) + delta;
    return { y: Math.floor(t / 12), m: (((t % 12) + 12) % 12) + 1 };
  }

  /** Semaines lundi → dimanche, coupées aux limites du mois. */
  function getWeeks(y, m) {
    const dim = daysInMonth(y, m);
    const weeks = [];
    let start = 1;
    while (start <= dim) {
      const end = Math.min(dim, start + 6 - weekdayIndex(y, m, start));
      weeks.push({ start, end, days: end - start + 1 });
      start = end + 1;
    }
    return weeks;
  }

  function budgetForMonth(data, key) {
    const overrides = data.monthlyBudgets || {};
    return Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : data.defaultBudget;
  }

  function expensesOfMonth(expenses, y, m) {
    const prefix = monthKey(y, m) + '-';
    return expenses.filter((e) => e.date.startsWith(prefix));
  }

  function sumAmounts(expenses) {
    return expenses.reduce((s, e) => s + e.amount, 0);
  }

  /** Total et tags utilisés pour chaque jour du mois (index 1..dim). */
  function totalsByDay(expenses, y, m) {
    const dim = daysInMonth(y, m);
    const days = Array.from({ length: dim + 1 }, () => ({ total: 0, tagIds: [] }));
    for (const e of expensesOfMonth(expenses, y, m)) {
      const day = days[parseISO(e.date).d];
      day.total += e.amount;
      if (!day.tagIds.includes(e.tagId)) day.tagIds.push(e.tagId);
    }
    return days;
  }

  /**
   * Calcule le résumé d'un mois et le budget de chaque semaine.
   *
   * Budget fixe par semaine, sans report :
   *   prévu(S) = budget × joursDeS / joursDuMois
   * Les économies ou dépassements d'une semaine sont visibles (écart = prévu − dépensé)
   * mais ne modifient pas le prévu des semaines suivantes.
   */
  function computeMonth({ budget, expenses, year, month, today }) {
    const dim = daysInMonth(year, month);
    const byDay = totalsByDay(expenses, year, month);
    const spent = byDay.reduce((s, d) => s + d.total, 0);

    const t = parseISO(today);
    const viewIdx = year * 12 + month;
    const todayIdx = t.y * 12 + t.m;
    const isCurrentMonth = viewIdx === todayIdx;
    const todayDay = isCurrentMonth ? t.d : null;

    let currentWeek = null;

    const weeks = getWeeks(year, month).map((w, index) => {
      let status;
      if (viewIdx < todayIdx) status = 'past';
      else if (viewIdx > todayIdx) status = 'future';
      else if (w.end < todayDay) status = 'past';
      else if (w.start > todayDay) status = 'future';
      else status = 'current';

      let wSpent = 0;
      for (let d = w.start; d <= w.end; d++) wSpent += byDay[d].total;

      const planned = budget * w.days / dim;
      const week = {
        ...w,
        index,
        status,
        planned,
        spent: wSpent,
        remaining: planned - wSpent,
      };

      if (status === 'current') {
        week.daysLeftInWeek = w.end - todayDay + 1;
        week.perDay = week.remaining / week.daysLeftInWeek;
        currentWeek = week;
      }
      return week;
    });

    return {
      year,
      month,
      budget,
      spent,
      remaining: budget - spent,
      ratio: budget > 0 ? spent / budget : (spent > 0 ? Infinity : 0),
      isCurrentMonth,
      todayDay,
      byDay,
      weeks,
      currentWeek,
    };
  }

  /** Répartition des dépenses du mois par tag, triée du plus gros au plus petit. */
  function totalsByTag(expenses, tags, y, m) {
    const month = expensesOfMonth(expenses, y, m);
    const total = sumAmounts(month);
    const map = new Map();
    for (const e of month) map.set(e.tagId, (map.get(e.tagId) || 0) + e.amount);
    const rows = [];
    for (const [tagId, amount] of map) {
      const tag = tags.find((tg) => tg.id === tagId) || { id: tagId, name: tagId, color: '#95A5A6' };
      rows.push({ tag, amount, share: total ? amount / total : 0 });
    }
    rows.sort((a, b) => b.amount - a.amount || a.tag.name.localeCompare(b.tag.name, 'fr'));
    return { total, rows };
  }

  /** "12,50" / "12.5" / "12" → centimes entiers ; null si invalide ou ≤ 0. */
  function parseAmount(str) {
    const s = String(str ?? '').replace(/[\s  €]/g, '').replace(',', '.');
    if (!/^(\d{1,7}(\.\d{0,2})?|\.\d{1,2})$/.test(s)) return null;
    const [int, frac = ''] = s.split('.');
    const cents = Number(int || 0) * 100 + Number((frac + '00').slice(0, 2));
    return cents > 0 ? cents : null;
  }

  /** Centimes → "12,50" pour préremplir un champ. */
  function centsToInput(cents) {
    const c = Math.round(cents);
    const frac = c % 100;
    return frac ? `${Math.floor(c / 100)},${pad(frac)}` : String(c / 100);
  }

  const euroFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  const euroFmt0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

  /** Centimes → "12,50 €" (arrondi au centime). */
  function formatEuros(cents) {
    return euroFmt.format((Math.round(cents) || 0) / 100);
  }

  /** Version compacte pour les cases du calendrier. */
  function formatCompact(cents) {
    const c = Math.round(cents) || 0;
    if (Math.abs(c) >= 10000) return euroFmt0.format(c / 100);
    return centsToInput(c);
  }

  function monthLabel(y, m) {
    const name = MONTHS[m - 1];
    return `${name[0].toUpperCase()}${name.slice(1)} ${y}`;
  }

  function weekLabel(m, week) {
    const mo = MONTHS_SHORT[m - 1];
    return week.start === week.end ? `${week.start} ${mo}` : `${week.start} → ${week.end} ${mo}`;
  }

  function dayLabel(iso) {
    const { y, m, d } = parseISO(iso);
    const wd = WEEKDAYS[weekdayIndex(y, m, d)];
    return `${wd[0].toUpperCase()}${wd.slice(1)} ${d === 1 ? '1er' : d} ${MONTHS[m - 1]}`;
  }

  root.Calc = {
    MONTHS, MONTHS_SHORT,
    toISO, parseISO, monthKey, todayISO, daysInMonth, weekdayIndex, addMonths,
    getWeeks, budgetForMonth, expensesOfMonth, sumAmounts, totalsByDay,
    computeMonth, totalsByTag,
    parseAmount, centsToInput, formatEuros, formatCompact,
    monthLabel, weekLabel, dayLabel,
  };
})(typeof window !== 'undefined' ? window : globalThis);
