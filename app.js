/* Affichage et interactions. La logique de calcul est dans calc.js, le stockage dans storage.js. */
(function () {
  'use strict';

  const C = window.Calc;
  const S = window.Store;

  const ICONS = {
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.2"/></svg>',
    donut: '<svg viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="20" stroke-dasharray="6 5"/></svg>',
  };

  const now = new Date();
  const state = {
    data: S.load(),
    y: now.getFullYear(),
    m: now.getMonth() + 1,
    tab: 'month',
    sheet: null,        // { type: 'day', date } | { type: 'expense', id?, date }
    paletteFor: null,   // id du tag dont la palette est ouverte
  };

  const $ = (id) => document.getElementById(id);
  const fmt = C.formatEuros;
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ESC[ch]);
  const today = () => C.todayISO();

  function tagById(id) {
    const tags = state.data.tags;
    return tags.find((t) => t.id === id) || tags.find((t) => t.id === S.OTHER_ID);
  }

  function persist() {
    if (!S.save(state.data)) toast('Impossible d’enregistrer sur cet appareil');
  }

  /** « d’octobre » / « de mars » */
  function deMonth(y, m) {
    const name = C.MONTHS[m - 1];
    return (/^[aeiouyéè]/.test(name) ? 'd’' : 'de ') + `${name} ${y}`;
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ---------------------------------------------------------------------------
  // Rendu
  // ---------------------------------------------------------------------------

  function render() {
    if (state.tab === 'month') renderMonth();
    else if (state.tab === 'stats') renderStats();
    else renderSettings();
  }

  function monthBar() {
    const t = C.parseISO(today());
    const isCurrent = t.y === state.y && t.m === state.m;
    return `
      <header class="monthbar">
        <button type="button" class="icon-btn" data-action="prev-month" aria-label="Mois précédent">${ICONS.prev}</button>
        <h1><button type="button" class="title-btn" data-action="this-month" aria-label="${esc(C.monthLabel(state.y, state.m))}${isCurrent ? '' : ', revenir au mois en cours'}">
          ${esc(C.monthLabel(state.y, state.m))}${isCurrent ? '' : '<small>Revenir à aujourd’hui</small>'}
        </button></h1>
        <button type="button" class="icon-btn" data-action="next-month" aria-label="Mois suivant">${ICONS.next}</button>
      </header>`;
  }

  function computeView() {
    const budget = C.budgetForMonth(state.data, C.monthKey(state.y, state.m));
    return C.computeMonth({ budget, expenses: state.data.expenses, year: state.y, month: state.m, today: today() });
  }

  function heroHtml(r) {
    const w = r.currentWeek;
    if (!w) return '';
    if (w.remaining < 0) {
      return `
        <section class="hero over" aria-label="Cette semaine">
          <p class="lead">Semaine dépassée de</p>
          <strong class="big num">${fmt(-w.remaining)}</strong>
          <p class="sub">Prévu cette semaine : ${fmt(w.planned)}</p>
        </section>`;
    }
    const perDay = w.daysLeftInWeek > 1
      ? `soit environ <b class="num">${fmt(w.perDay)}</b> par jour`
      : `dernier jour de la semaine`;
    return `
      <section class="hero" aria-label="Cette semaine">
        <p class="lead">Il te reste</p>
        <strong class="big num">${fmt(w.remaining)}</strong>
        <p class="sub">cette semaine · ${perDay}</p>
      </section>`;
  }

  function summaryHtml(r) {
    const pct = r.budget > 0 ? Math.min(100, r.ratio * 100) : (r.spent > 0 ? 100 : 0);
    const level = r.spent > r.budget ? 'over' : r.ratio > 0.8 ? 'warn' : '';
    return `
      <section class="card" aria-label="Résumé du mois">
        <dl class="summary-grid" style="margin:0">
          <div><dt>Budget</dt><dd class="num">${fmt(r.budget)}</dd></div>
          <div><dt>Dépensé</dt><dd class="num">${fmt(r.spent)}</dd></div>
          <div><dt>Reste du mois</dt><dd class="num ${r.remaining < 0 ? 'danger' : ''}">${fmt(r.remaining)}</dd></div>
        </dl>
        <div class="progress ${level}" role="progressbar" aria-label="Part du budget dépensée"
             aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}">
          <span style="width:${pct.toFixed(1)}%"></span>
        </div>
        ${r.remaining < 0 ? `<p class="alert">Budget dépassé de ${fmt(-r.remaining)}</p>` : ''}
      </section>`;
  }

  function calendarHtml(r) {
    const { year: y, month: m } = r;
    const todayIso = today();
    const cells = [];
    for (let i = 0; i < C.weekdayIndex(y, m, 1); i++) cells.push('<span class="blank"></span>');
    for (let d = 1; d < r.byDay.length; d++) {
      const iso = C.toISO(y, m, d);
      const { total, tagIds } = r.byDay[d];
      const cls = ['day'];
      if (iso === todayIso) cls.push('today');
      else if (iso > todayIso) cls.push('future');
      const dots = tagIds.slice(0, 4).map((id) => `<i style="background:${tagById(id).color}"></i>`).join('');
      const label = `${C.dayLabel(iso)}${total ? ', ' + fmt(total) : ''}${iso === todayIso ? ", aujourd’hui" : ''}`;
      cells.push(`
        <button type="button" class="${cls.join(' ')}" data-action="open-day" data-date="${iso}" aria-label="${esc(label)}">
          <span class="n">${d}</span>
          ${total ? `<span class="t num">${C.formatCompact(total)}</span>` : ''}
          <span class="dots">${dots}</span>
        </button>`);
    }
    return `
      <section class="card calendar" aria-label="Calendrier">
        <div class="cal-head" aria-hidden="true"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span></div>
        <div class="cal-grid">${cells.join('')}</div>
      </section>`;
  }

  function weeksHtml(r) {
    const rows = r.weeks.map((w) => {
      const dates = `${esc(C.weekLabel(r.month, w))}<small>${w.days} j</small>`;
      if (w.status === 'past') {
        const diff = w.planned - w.spent;
        const sign = Math.round(diff) > 0 ? '+' : Math.round(diff) < 0 ? '−' : '';
        return `
          <li class="week past">
            <span class="dates">${dates}</span>
            <span class="main num ${diff < 0 ? 'danger' : 'good'}">${sign}${fmt(Math.abs(diff))}</span>
            <span class="detail num">${fmt(w.spent)} / ${fmt(w.planned)}</span>
            <span class="detail right">${diff < 0 ? 'dépassé' : 'économisé'}</span>
          </li>`;
      }
      if (w.status === 'current') {
        const over = w.remaining < 0;
        return `
          <li class="week current ${over ? 'over' : ''}">
            <span class="dates">${dates}<span class="badge">en cours</span></span>
            <span class="main num">${over ? 'dépassée de ' + fmt(-w.remaining) : 'reste ' + fmt(w.remaining)}</span>
            <span class="detail num">${fmt(w.spent)} / ${fmt(w.planned)}</span>
            <span class="detail right">dépensé / prévu</span>
          </li>`;
      }
      return `
        <li class="week future">
          <span class="dates">${dates}</span>
          <span class="main num">${fmt(w.planned)}</span>
          <span class="detail">${w.spent ? fmt(w.spent) + ' déjà saisis' : ''}</span>
          <span class="detail right">prévu</span>
        </li>`;
    });
    return `
      <h2 class="section-title">Semaine par semaine</h2>
      <ul class="card weeks" style="list-style:none;padding:4px 0">${rows.join('')}</ul>`;
  }

  function renderMonth() {
    const r = computeView();
    $('view-month').innerHTML = monthBar() + heroHtml(r) + summaryHtml(r) + calendarHtml(r) + weeksHtml(r);
  }

  function donutSvg(rows, total) {
    const R = 70, SW = 26, CIRC = 2 * Math.PI * R;
    const gap = rows.length > 1 ? 2 : 0;
    let offset = 0;
    const segs = rows.map(({ tag, amount }) => {
      const len = (amount / total) * CIRC;
      const seg = `<circle cx="100" cy="100" r="${R}" fill="none" stroke="${tag.color}" stroke-width="${SW}"
        stroke-dasharray="${Math.max(0, len - gap).toFixed(2)} ${CIRC.toFixed(2)}"
        stroke-dashoffset="${(-offset).toFixed(2)}"><title>${esc(tag.name)} : ${fmt(amount)}</title></circle>`;
      offset += len;
      return seg;
    });
    return `
      <svg viewBox="0 0 200 200" role="img" aria-label="Répartition des dépenses par tag">
        <g transform="rotate(-90 100 100)">${segs.join('')}</g>
      </svg>`;
  }

  function renderStats() {
    const { total, rows } = C.totalsByTag(state.data.expenses, state.data.tags, state.y, state.m);
    let body;
    if (!total) {
      body = `
        <section class="card empty">
          ${ICONS.donut}
          <strong>Aucune dépense en ${esc(C.MONTHS[state.m - 1])}</strong>
          Ajoute une dépense avec le bouton + pour voir la répartition par tag.
        </section>`;
    } else {
      const pctFmt = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });
      body = `
        <section class="card">
          <div class="donut-wrap">
            ${donutSvg(rows, total)}
            <div class="donut-center"><small>Total</small><strong class="num">${fmt(total)}</strong></div>
          </div>
        </section>
        <h2 class="section-title">Par tag</h2>
        <section class="card" style="padding:4px 16px">
          <ul class="tag-rows">
            ${rows.map(({ tag, amount, share }) => `
              <li>
                <i style="background:${tag.color}"></i>
                <span class="name">${esc(tag.name)}</span>
                <span class="pct num">${share < 0.005 ? '< 1 %' : pctFmt.format(share)}</span>
                <span class="amt num">${fmt(amount)}</span>
              </li>`).join('')}
          </ul>
        </section>`;
    }
    $('view-stats').innerHTML = monthBar() + body;
  }

  function renderSettings() {
    const d = state.data;
    const key = C.monthKey(state.y, state.m);
    const hasOverride = Object.prototype.hasOwnProperty.call(d.monthlyBudgets, key);
    const monthBudget = C.budgetForMonth(d, key);

    const tagsHtml = d.tags.map((t) => {
      const locked = t.id === S.OTHER_ID;
      const palette = state.paletteFor === t.id ? `
        <div class="palette" role="group" aria-label="Couleur de ${esc(t.name)}">
          ${S.PALETTE.map((c) => `
            <button type="button" data-action="set-color" data-id="${esc(t.id)}" data-color="${c}"
              aria-pressed="${c.toLowerCase() === t.color.toLowerCase()}" aria-label="Couleur ${c}" style="--c:${c}"><i></i></button>`).join('')}
        </div>` : '';
      return `
        <li>
          <div class="tag-line">
            <button type="button" class="swatch-btn" data-action="toggle-palette" data-id="${esc(t.id)}"
              aria-label="Changer la couleur de ${esc(t.name)}" aria-expanded="${state.paletteFor === t.id}" style="--c:${t.color}"><i></i></button>
            <input class="input" type="text" value="${esc(t.name)}" data-tag-name="${esc(t.id)}" maxlength="24"
              aria-label="Nom du tag" autocomplete="off" enterkeyhint="done">
            ${locked
              ? `<span class="lock" title="Ce tag ne peut pas être supprimé" aria-label="Ce tag ne peut pas être supprimé">${ICONS.lock}</span>`
              : `<button type="button" class="icon-btn del" data-action="del-tag" data-id="${esc(t.id)}" aria-label="Supprimer ${esc(t.name)}">${ICONS.trash}</button>`}
          </div>
          ${palette}
        </li>`;
    }).join('');

    let backupInfo = 'Aucun export pour l’instant.';
    let reminder = '';
    if (d.lastExportAt) {
      const when = new Date(d.lastExportAt);
      backupInfo = `Dernier export : le ${when.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.`;
      const days = Math.floor((Date.now() - when.getTime()) / 86400000);
      if (days > 30) reminder = `Ton dernier export date d’il y a ${days} jours. Pense à sauvegarder tes données.`;
    } else if (d.expenses.length) {
      reminder = 'Tu n’as encore jamais exporté tes données. Un export régulier évite de tout perdre.';
    }

    $('view-settings').innerHTML = `
      <h1 class="page-title">Réglages</h1>

      <h2 class="section-title">Budget</h2>
      <section class="card">
        <div class="setting">
          <label class="field-label" for="default-budget">Budget mensuel par défaut</label>
          <div class="money-input">
            <input id="default-budget" class="input num" type="text" inputmode="decimal" autocomplete="off"
              enterkeyhint="done" value="${C.centsToInput(d.defaultBudget)}">
          </div>
        </div>
        <div class="setting">
          <label class="field-label" for="month-budget">Budget ${esc(deMonth(state.y, state.m))}</label>
          <div class="money-input">
            <input id="month-budget" class="input num" type="text" inputmode="decimal" autocomplete="off"
              enterkeyhint="done" value="${C.centsToInput(monthBudget)}">
          </div>
          <p class="hint">${hasOverride
            ? `Budget spécifique à ce mois. <button type="button" class="link-btn" data-action="reset-month-budget">Revenir au budget par défaut</button>`
            : 'Ce mois utilise le budget par défaut. Modifie le montant pour le remplacer. Le mois se change dans l’onglet Mois.'}</p>
        </div>
      </section>

      <h2 class="section-title">Tags</h2>
      <section class="card">
        <ul class="tag-edit">${tagsHtml}</ul>
        <form class="add-tag" data-form="add-tag">
          <input id="new-tag" class="input" type="text" placeholder="Nouveau tag" maxlength="24" autocomplete="off"
            aria-label="Nom du nouveau tag" enterkeyhint="done">
          <button type="submit" class="btn btn-secondary">${ICONS.plus}Ajouter</button>
        </form>
      </section>

      <h2 class="section-title">Sauvegarde</h2>
      <section class="card">
        <div class="backup-actions">
          <button type="button" class="btn btn-primary" data-action="export">Exporter mes données</button>
          <button type="button" class="btn btn-secondary" data-action="import">Importer</button>
        </div>
        <p class="backup-info">${backupInfo} L’import remplace toutes les données actuelles.</p>
        ${reminder ? `<div class="reminder">${ICONS.alert}<span>${reminder}</span></div>` : ''}
      </section>

      <p class="footer-note">Tes données restent uniquement sur cet appareil.<br><a href="tests.html">Tests des calculs</a></p>`;
  }

  // ---------------------------------------------------------------------------
  // Bottom sheet
  // ---------------------------------------------------------------------------

  let sheetCloseTimer = null;

  function showSheet(html) {
    const sheet = $('sheet');
    const backdrop = $('sheet-backdrop');
    clearTimeout(sheetCloseTimer);
    $('sheet-body').innerHTML = html;
    if (sheet.hidden || !sheet.classList.contains('show')) {
      sheet.hidden = false;
      backdrop.hidden = false;
      sheet.style.transform = '';
      void sheet.offsetHeight; // force la transition
      sheet.classList.add('show');
      backdrop.classList.add('show');
      document.body.classList.add('sheet-open');
    }
    sheet.scrollTop = 0;
  }

  function closeSheet() {
    const sheet = $('sheet');
    const backdrop = $('sheet-backdrop');
    state.sheet = null;
    sheet.classList.remove('show');
    backdrop.classList.remove('show');
    sheet.style.transform = '';
    document.body.classList.remove('sheet-open');
    if (document.activeElement && sheet.contains(document.activeElement)) document.activeElement.blur();
    clearTimeout(sheetCloseTimer);
    sheetCloseTimer = setTimeout(() => {
      sheet.hidden = true;
      backdrop.hidden = true;
      $('sheet-body').innerHTML = '';
    }, 300);
  }

  function sheetHeader(title, subtitle) {
    return `
      <div class="sheet-header">
        <div>
          <h2 id="sheet-title">${esc(title)}</h2>
          ${subtitle ? `<p class="num">${esc(subtitle)}</p>` : ''}
        </div>
        <button type="button" class="icon-btn" data-action="close-sheet" aria-label="Fermer">${ICONS.close}</button>
      </div>`;
  }

  function openDay(date) {
    state.sheet = { type: 'day', date };
    const list = state.data.expenses
      .filter((e) => e.date === date)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const total = C.sumAmounts(list);
    const items = list.map((e) => {
      const tag = tagById(e.tagId);
      return `
        <li>
          <i class="tagdot" style="background:${tag.color}"></i>
          <span class="name">${esc(tag.name)}</span>
          <span class="amt num">${fmt(e.amount)}</span>
          <button type="button" class="icon-btn" data-action="edit-exp" data-id="${esc(e.id)}" aria-label="Modifier ${fmt(e.amount)} ${esc(tag.name)}">${ICONS.edit}</button>
          <button type="button" class="icon-btn del" data-action="del-exp" data-id="${esc(e.id)}" aria-label="Supprimer ${fmt(e.amount)} ${esc(tag.name)}">${ICONS.trash}</button>
        </li>`;
    }).join('');
    showSheet(`
      ${sheetHeader(C.dayLabel(date), list.length ? `Total : ${fmt(total)}` : '')}
      ${list.length ? `<ul class="exp-list">${items}</ul>` : '<p class="empty-day">Aucune dépense ce jour-là.</p>'}
      <button type="button" class="btn btn-primary btn-block" data-action="add-on-day" data-date="${date}">
        ${ICONS.plus}Ajouter une dépense ce jour-là
      </button>`);
  }

  function openExpenseForm({ id = null, date = today() } = {}) {
    const existing = id ? state.data.expenses.find((e) => e.id === id) : null;
    if (id && !existing) return;
    const tagId = existing ? existing.tagId : tagById(state.data.lastTagId).id;
    state.sheet = { type: 'expense', id, date: existing ? existing.date : date, tagId };

    const chips = state.data.tags.map((t) => `
      <button type="button" class="chip" data-action="pick-tag" data-id="${esc(t.id)}"
        aria-pressed="${t.id === tagId}" style="--c:${t.color}"><i></i>${esc(t.name)}</button>`).join('');

    showSheet(`
      <form id="exp-form" novalidate>
        ${sheetHeader(existing ? 'Modifier la dépense' : 'Nouvelle dépense')}
        <label class="field-label" for="exp-amount">Montant</label>
        <div class="amount-field">
          <input id="exp-amount" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00"
            enterkeyhint="done" value="${existing ? C.centsToInput(existing.amount) : ''}">
          <span aria-hidden="true">€</span>
        </div>
        <span class="field-label" id="tag-label">Tag</span>
        <div class="chips" role="group" aria-labelledby="tag-label">${chips}</div>
        <label class="field-label" for="exp-date">Date</label>
        <input id="exp-date" class="input" type="date" required value="${state.sheet.date}">
        <div class="form-actions">
          ${existing ? '<button type="button" class="btn btn-danger" data-action="form-delete">Supprimer</button>' : ''}
          <button type="submit" class="btn btn-primary" id="exp-save">Enregistrer</button>
        </div>
      </form>`);

    updateSaveButton();
    // Appel synchrone dans le geste de l'utilisateur : nécessaire pour qu'iOS ouvre le clavier.
    const input = $('exp-amount');
    input.focus({ preventScroll: true });
    if (existing) input.setSelectionRange(0, input.value.length);
  }

  function updateSaveButton() {
    const amount = C.parseAmount($('exp-amount').value);
    const date = $('exp-date').value;
    $('exp-save').disabled = !(amount && /^\d{4}-\d{2}-\d{2}$/.test(date));
  }

  function saveExpense() {
    const amount = C.parseAmount($('exp-amount').value);
    const date = $('exp-date').value;
    if (!amount || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const { id, tagId } = state.sheet;
    const data = state.data;

    if (id) {
      const e = data.expenses.find((x) => x.id === id);
      if (!e) return;
      Object.assign(e, { amount, date, tagId });
    } else {
      data.expenses.push({ id: S.uuid(), date, amount, tagId, createdAt: new Date().toISOString() });
    }
    data.lastTagId = tagId;
    persist();
    closeSheet();

    // On affiche le mois de la dépense pour qu'elle soit visible tout de suite.
    const p = C.parseISO(date);
    state.y = p.y;
    state.m = p.m;
    render();
    toast(`${id ? 'Dépense modifiée' : 'Dépense ajoutée'} · ${fmt(amount)}`);
  }

  function deleteExpense(id, { reopenDay } = {}) {
    const e = state.data.expenses.find((x) => x.id === id);
    if (!e) return;
    const tag = tagById(e.tagId);
    if (!confirm(`Supprimer la dépense de ${fmt(e.amount)} (${tag.name}) du ${C.dayLabel(e.date).toLowerCase()} ?`)) return;
    state.data.expenses = state.data.expenses.filter((x) => x.id !== id);
    persist();
    render();
    if (reopenDay) openDay(e.date);
    else closeSheet();
    toast('Dépense supprimée');
  }

  // Glisser le panneau vers le bas pour le fermer (depuis la poignée ou l'en-tête).
  function setupSheetDrag() {
    const sheet = $('sheet');
    let startY = null;
    let dy = 0;
    sheet.addEventListener('touchstart', (ev) => {
      const handle = ev.target.closest('.sheet-grabber, .sheet-header');
      if (!handle || ev.target.closest('button, input') || sheet.scrollTop > 0) return;
      startY = ev.touches[0].clientY;
      dy = 0;
      sheet.classList.add('dragging');
    }, { passive: true });
    sheet.addEventListener('touchmove', (ev) => {
      if (startY === null) return;
      dy = Math.max(0, ev.touches[0].clientY - startY);
      sheet.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    const end = () => {
      if (startY === null) return;
      startY = null;
      sheet.classList.remove('dragging');
      if (dy > 90) closeSheet();
      else sheet.style.transform = '';
    };
    sheet.addEventListener('touchend', end);
    sheet.addEventListener('touchcancel', end);
  }

  // ---------------------------------------------------------------------------
  // Réglages
  // ---------------------------------------------------------------------------

  function deleteTag(id) {
    if (id === S.OTHER_ID) return;
    const tag = state.data.tags.find((t) => t.id === id);
    if (!tag) return;
    const count = state.data.expenses.filter((e) => e.tagId === id).length;
    const other = tagById(S.OTHER_ID);
    const msg = `Supprimer le tag « ${tag.name} » ?` + (count
      ? `\n\n${count} dépense${count > 1 ? 's' : ''} passer${count > 1 ? 'ont' : 'a'} dans « ${other.name} ».`
      : '\n\nAucune dépense n’utilise ce tag.');
    if (!confirm(msg)) return;
    for (const e of state.data.expenses) if (e.tagId === id) e.tagId = S.OTHER_ID;
    state.data.tags = state.data.tags.filter((t) => t.id !== id);
    if (state.data.lastTagId === id) state.data.lastTagId = S.OTHER_ID;
    if (state.paletteFor === id) state.paletteFor = null;
    persist();
    renderSettings();
    toast('Tag supprimé');
  }

  function addTag(name) {
    name = name.trim();
    if (!name) return;
    const tags = state.data.tags;
    if (tags.some((t) => t.name.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr'))) {
      toast('Ce tag existe déjà');
      return;
    }
    const used = new Set(tags.map((t) => t.color.toLowerCase()));
    const color = S.PALETTE.find((c) => !used.has(c.toLowerCase())) || S.PALETTE[tags.length % S.PALETTE.length];
    // « Autre » reste en dernier.
    const otherIdx = tags.findIndex((t) => t.id === S.OTHER_ID);
    const tag = { id: 't-' + S.uuid().slice(0, 8), name, color };
    if (otherIdx === -1) tags.push(tag);
    else tags.splice(otherIdx, 0, tag);
    persist();
    renderSettings();
    toast(`Tag « ${name} » ajouté`);
  }

  function renameTag(input) {
    const tag = state.data.tags.find((t) => t.id === input.dataset.tagName);
    if (!tag) return;
    const name = input.value.trim();
    if (!name) {
      input.value = tag.name;
      return;
    }
    if (name !== tag.name) {
      tag.name = name;
      persist();
      toast('Tag renommé');
    }
    input.value = name;
  }

  function changeDefaultBudget(input) {
    const cents = C.parseAmount(input.value);
    if (!cents) {
      toast('Montant invalide');
      input.value = C.centsToInput(state.data.defaultBudget);
      return;
    }
    state.data.defaultBudget = cents;
    persist();
    renderSettings();
    toast('Budget par défaut enregistré');
  }

  function changeMonthBudget(input) {
    const key = C.monthKey(state.y, state.m);
    if (input.value.trim() === '') {
      delete state.data.monthlyBudgets[key];
    } else {
      const cents = C.parseAmount(input.value);
      if (!cents) {
        toast('Montant invalide');
        input.value = C.centsToInput(C.budgetForMonth(state.data, key));
        return;
      }
      state.data.monthlyBudgets[key] = cents;
    }
    persist();
    renderSettings();
    toast(`Budget ${deMonth(state.y, state.m)} enregistré`);
  }

  async function doExport() {
    try {
      const stamp = await S.exportData(state.data, today());
      if (!stamp) return;
      state.data.lastExportAt = stamp;
      persist();
      renderSettings();
      toast('Export prêt');
    } catch (e) {
      console.error(e);
      toast('L’export a échoué');
    }
  }

  async function doImport(file) {
    try {
      const data = await S.importFile(file);
      const n = data.expenses.length;
      const msg = `Remplacer toutes tes données par celles du fichier ?\n\n`
        + `Le fichier contient ${n} dépense${n > 1 ? 's' : ''} et ${data.tags.length} tags.\n`
        + `Tes ${state.data.expenses.length} dépenses actuelles seront effacées.`;
      if (!confirm(msg)) return;
      state.data = data;
      state.paletteFor = null;
      persist();
      render();
      toast('Données importées');
    } catch (e) {
      alert(`Import impossible : ${e.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Navigation et événements
  // ---------------------------------------------------------------------------

  function switchTab(tab) {
    state.tab = tab;
    for (const t of ['month', 'stats', 'settings']) $(`view-${t}`).hidden = t !== tab;
    document.querySelectorAll('.tabbar button').forEach((b) => {
      if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    $('fab').hidden = tab === 'settings';
    state.paletteFor = null;
    render();
    window.scrollTo(0, 0);
  }

  function shiftMonth(delta) {
    const n = C.addMonths(state.y, state.m, delta);
    state.y = n.y;
    state.m = n.m;
    render();
  }

  const actions = {
    'prev-month': () => shiftMonth(-1),
    'next-month': () => shiftMonth(1),
    'this-month': () => {
      const t = C.parseISO(today());
      state.y = t.y;
      state.m = t.m;
      render();
    },
    'open-day': (el) => openDay(el.dataset.date),
    'close-sheet': () => closeSheet(),
    'add-on-day': (el) => openExpenseForm({ date: el.dataset.date }),
    'edit-exp': (el) => openExpenseForm({ id: el.dataset.id }),
    'del-exp': (el) => deleteExpense(el.dataset.id, { reopenDay: true }),
    'form-delete': () => deleteExpense(state.sheet.id),
    'pick-tag': (el) => {
      state.sheet.tagId = el.dataset.id;
      document.querySelectorAll('#exp-form .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === el)));
    },
    'toggle-palette': (el) => {
      state.paletteFor = state.paletteFor === el.dataset.id ? null : el.dataset.id;
      renderSettings();
    },
    'set-color': (el) => {
      const tag = state.data.tags.find((t) => t.id === el.dataset.id);
      if (!tag) return;
      tag.color = el.dataset.color;
      state.paletteFor = null;
      persist();
      renderSettings();
    },
    'del-tag': (el) => deleteTag(el.dataset.id),
    'reset-month-budget': () => {
      delete state.data.monthlyBudgets[C.monthKey(state.y, state.m)];
      persist();
      renderSettings();
      toast('Budget par défaut rétabli pour ce mois');
    },
    export: () => doExport(),
    import: () => $('import-input').click(),
  };

  document.addEventListener('click', (ev) => {
    const tabBtn = ev.target.closest('.tabbar button');
    if (tabBtn) {
      switchTab(tabBtn.dataset.tab);
      return;
    }
    const el = ev.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
  });

  $('fab').addEventListener('click', () => openExpenseForm({ date: today() }));
  $('sheet-backdrop').addEventListener('click', closeSheet);

  document.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (ev.target.id === 'exp-form') saveExpense();
    else if (ev.target.dataset.form === 'add-tag') addTag($('new-tag').value);
  });

  document.addEventListener('input', (ev) => {
    if (ev.target.id === 'exp-amount' || ev.target.id === 'exp-date') updateSaveButton();
  });

  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.id === 'default-budget') changeDefaultBudget(t);
    else if (t.id === 'month-budget') changeMonthBudget(t);
    else if (t.dataset.tagName) renameTag(t);
    else if (t.id === 'import-input') {
      const file = t.files && t.files[0];
      t.value = '';
      if (file) doImport(file);
    }
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && state.sheet) closeSheet();
    // « Entrée » dans un champ des réglages : valider et fermer le clavier.
    if (ev.key === 'Enter' && ev.target.matches('#default-budget, #month-budget, [data-tag-name]')) {
      ev.preventDefault();
      ev.target.blur();
    }
  });

  // Au retour dans l'appli (le lendemain par exemple), on rafraîchit « aujourd'hui ».
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.tab !== 'settings') render();
  });

  setupSheetDrag();
  render();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker non enregistré', e));
    });
  }
})();
