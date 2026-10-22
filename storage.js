/* Lecture/écriture localStorage, validation, migrations, export/import. */
(function (root) {
  'use strict';

  const KEY = 'budget-app-data';
  const CURRENT_VERSION = 1;
  const OTHER_ID = 'other';

  const PALETTE = ['#E8833A', '#4A90D9', '#9B59B6', '#27AE60', '#95A5A6',
    '#E74C3C', '#E5B80B', '#1ABC9C', '#E84393', '#8D6E63'];

  function defaultData() {
    return {
      version: CURRENT_VERSION,
      defaultBudget: 80000,
      monthlyBudgets: {},
      tags: [
        { id: 'food', name: 'Nourriture', color: '#E8833A' },
        { id: 'leisure', name: 'Loisirs', color: '#4A90D9' },
        { id: 'clothes', name: 'Vêtements', color: '#9B59B6' },
        { id: 'shop', name: 'Achats', color: '#27AE60' },
        { id: OTHER_ID, name: 'Autre', color: '#95A5A6' },
      ],
      expenses: [],
      lastTagId: 'food',
      lastExportAt: null,
    };
  }

  function uuid() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    const b = new Uint8Array(16);
    root.crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  /** Fait passer des données d'une ancienne version au format actuel. */
  function migrate(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Format de fichier non reconnu.');
    const data = { ...raw };
    if (data.version === undefined) data.version = 1;
    if (typeof data.version !== 'number') throw new Error('Numéro de version invalide.');
    if (data.version > CURRENT_VERSION) {
      throw new Error('Ces données viennent d’une version plus récente de l’appli.');
    }
    // Exemple pour plus tard :
    // if (data.version === 1) { …transformation…; data.version = 2; }
    return data;
  }

  const isCents = (n) => Number.isInteger(n) && n >= 0;
  const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
  const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

  /** Vérifie et normalise des données (déjà migrées). Lève une erreur lisible si invalide. */
  function validate(d) {
    if (!isCents(d.defaultBudget)) throw new Error('Budget par défaut invalide.');

    const monthlyBudgets = {};
    if (d.monthlyBudgets != null) {
      if (typeof d.monthlyBudgets !== 'object' || Array.isArray(d.monthlyBudgets)) throw new Error('Budgets mensuels invalides.');
      for (const [k, v] of Object.entries(d.monthlyBudgets)) {
        if (!MONTH_RE.test(k) || !isCents(v)) throw new Error(`Budget du mois « ${k} » invalide.`);
        monthlyBudgets[k] = v;
      }
    }

    if (!Array.isArray(d.tags)) throw new Error('Liste des tags manquante.');
    const tags = [];
    for (const t of d.tags) {
      if (!t || typeof t.id !== 'string' || !t.id || typeof t.name !== 'string' || !COLOR_RE.test(t.color)) {
        throw new Error('Un tag est invalide.');
      }
      if (tags.some((x) => x.id === t.id)) throw new Error(`Tag en double : ${t.id}.`);
      tags.push({ id: t.id, name: t.name, color: t.color });
    }
    if (!tags.some((t) => t.id === OTHER_ID)) tags.push({ id: OTHER_ID, name: 'Autre', color: '#95A5A6' });

    if (!Array.isArray(d.expenses)) throw new Error('Liste des dépenses manquante.');
    const ids = new Set();
    const expenses = d.expenses.map((e) => {
      if (!e || typeof e.id !== 'string' || !DATE_RE.test(e.date) || !Number.isInteger(e.amount) || e.amount <= 0) {
        throw new Error('Une dépense est invalide.');
      }
      if (ids.has(e.id)) throw new Error('Identifiant de dépense en double.');
      ids.add(e.id);
      return {
        id: e.id,
        date: e.date,
        amount: e.amount,
        tagId: tags.some((t) => t.id === e.tagId) ? e.tagId : OTHER_ID,
        createdAt: typeof e.createdAt === 'string' ? e.createdAt : new Date().toISOString(),
      };
    });

    return {
      version: CURRENT_VERSION,
      defaultBudget: d.defaultBudget,
      monthlyBudgets,
      tags,
      expenses,
      lastTagId: tags.some((t) => t.id === d.lastTagId) ? d.lastTagId : tags[0].id,
      lastExportAt: typeof d.lastExportAt === 'string' ? d.lastExportAt : null,
    };
  }

  function parse(text) {
    let raw;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error('Le fichier n’est pas un JSON valide.');
    }
    return validate(migrate(raw));
  }

  function load() {
    let text = null;
    try {
      text = root.localStorage.getItem(KEY);
    } catch (e) {
      console.error('localStorage indisponible', e);
      return defaultData();
    }
    if (!text) return defaultData();
    try {
      return parse(text);
    } catch (e) {
      // On garde une copie des données illisibles plutôt que de les écraser.
      console.error('Données illisibles, sauvegardées sous', KEY + '-corrupt', e);
      try { root.localStorage.setItem(KEY + '-corrupt', text); } catch { /* ignore */ }
      return defaultData();
    }
  }

  function save(data) {
    try {
      root.localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('Échec de la sauvegarde', e);
      return false;
    }
  }

  function serialize(data) {
    return JSON.stringify(data, null, 2);
  }

  /**
   * Exporte les données : feuille de partage iOS si disponible, sinon téléchargement.
   * Renvoie l'horodatage d'export en cas de succès, null si l'utilisateur annule.
   */
  async function exportData(data, todayIso) {
    const stamp = new Date().toISOString();
    const json = serialize({ ...data, lastExportAt: stamp });
    const name = `budget-${todayIso}.json`;
    const blob = new Blob([json], { type: 'application/json' });

    let file = null;
    try { file = new File([blob], name, { type: 'application/json' }); } catch { /* vieux navigateurs */ }

    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return stamp;
      } catch (e) {
        if (e && e.name === 'AbortError') return null;
        // Partage refusé pour une autre raison : on tente le téléchargement.
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return stamp;
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Impossible de lire le fichier.'));
      reader.readAsText(file);
    });
  }

  async function importFile(file) {
    return parse(await readFile(file));
  }

  root.Store = {
    KEY, CURRENT_VERSION, OTHER_ID, PALETTE,
    defaultData, uuid, migrate, validate, parse, load, save, serialize,
    exportData, importFile,
  };
})(typeof window !== 'undefined' ? window : globalThis);
