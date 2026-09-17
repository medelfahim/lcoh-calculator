/* Calculateur LCOH — interface
 * © 2026 Mohamed EL FAHIM — Tous droits réservés.
 */
(function () {
  'use strict';
  var E = window.LCOH;
  var SCHEMA = E.SCHEMA;
  var AUTHOR = 'Mohamed EL FAHIM';

  var PRESETS = [
    { id: 'ref', name: 'Référence Europe 20 MW', values: {
      ratedCapacity: 20000, specificEnergy: 52.4, systemCost: 1666, degradationRate: 0.12,
      projectLifetime: 25, stackDurability: 80000, fullLoadHours: 4000, discountRate: 6,
      electricityCost: 57.78, gridFee: 26.7, energyTax: 33, stackReplacementCost: 15, fixedOpex: 2 } },
    { id: 'ma', name: 'Maroc solaire + éolien (illustratif)', values: {
      ratedCapacity: 100000, specificEnergy: 52.4, systemCost: 1400, degradationRate: 0.12,
      projectLifetime: 25, stackDurability: 80000, fullLoadHours: 5500, discountRate: 8,
      electricityCost: 30, gridFee: 0, energyTax: 0, stackReplacementCost: 15, fixedOpex: 2,
      waterConsumption: 20, waterCost: 1.5, constructionYears: 2 } },
    { id: 'opt', name: 'Optimiste 2030 (illustratif)', values: {
      ratedCapacity: 100000, specificEnergy: 50, systemCost: 700, degradationRate: 0.1,
      projectLifetime: 25, stackDurability: 90000, fullLoadHours: 5000, discountRate: 6,
      electricityCost: 25, gridFee: 0, energyTax: 0, stackReplacementCost: 12, fixedOpex: 2,
      waterConsumption: 20, waterCost: 1.5 } }
  ];

  var UNITS = { 'EUR/kW': '€/kW', 'EUR/MWh': '€/MWh', 'EUR/m3': '€/m³', '%/1000h': '% par 1000 h' };

  var GROUPS = [
    ['Électrolyseur', [
      ['ratedCapacity', 'Puissance nominale', "Puissance électrique de l'électrolyseur (1 MW = 1000 kW)."],
      ['specificEnergy', 'Consommation spécifique', "Électricité consommée par kg d'H₂ produit. 33,3 kWh/kg correspondrait à un rendement de 100 % (PCI)."],
      ['degradationRate', 'Dégradation', "Perte de production par tranche de 1000 heures de fonctionnement."],
      ['stackDurability', 'Durabilité du stack', "Heures de fonctionnement avant remplacement du stack."]]],
    ['Investissement', [
      ['systemCost', 'Coût du système', "CAPEX installé par kW : électrolyseur, balance of plant, ingénierie."],
      ['stackReplacementCost', 'Remplacement de stack', "Coût de chaque remplacement, en % du CAPEX initial."],
      ['fixedOpex', 'OPEX fixe', "Maintenance, personnel, assurance — en % du CAPEX par an."],
      ['constructionYears', 'Durée de construction', "Le CAPEX est étalé sur cette période avant la mise en service."],
      ['residualValue', 'Valeur résiduelle', "Valeur récupérée en fin de projet, en % du CAPEX."],
      ['decommissioningCost', 'Démantèlement', "Coût de démantèlement en fin de projet, en % du CAPEX."]]],
    ['Exploitation', [
      ['fullLoadHours', 'Heures pleine charge', "Heures équivalentes à pleine puissance par an (8760 h = fonctionnement continu)."],
      ['projectLifetime', 'Durée de vie du projet', "Durée d'exploitation prise en compte."],
      ['discountRate', "Taux d'actualisation réel", "Coût du capital hors inflation (WACC réel)."]]],
    ['Énergie & eau', [
      ['electricityCost', "Prix de l'électricité", "Prix de l'électricité renouvelable livrée (PPA ou coût de production)."],
      ['gridFee', 'Frais de réseau', "Tarif d'accès au réseau. 0 si production sur site."],
      ['energyTax', "Taxes sur l'énergie", "Taxes et contributions sur l'électricité consommée."],
      ['waterConsumption', "Consommation d'eau", "Eau consommée par kg d'H₂ (≈ 10 L en stœchiométrie, 15–25 L avec traitement)."],
      ['waterCost', "Coût de l'eau", "Coût de l'eau traitée ou dessalée."]]]
  ];

  var BREAKDOWN_LABELS = {
    capex: 'Investissement (CAPEX)', electricity: 'Électricité', gridFee: 'Frais de réseau',
    energyTax: 'Taxes énergie', fixedOpex: 'OPEX fixe', water: 'Eau',
    stackReplacement: 'Remplacements de stack', residualValue: 'Valeur résiduelle',
    decommissioning: 'Démantèlement'
  };

  var RANGES = [
    ['electricityCost', function (v) { return [v - 20, v + 20]; }, '±20 €/MWh'],
    ['systemCost', function (v) { return [v * 0.7, v * 1.3]; }, '±30 %'],
    ['fullLoadHours', function (v) { return [v - 1000, v + 1000]; }, '±1000 h/an'],
    ['specificEnergy', function (v) { return [v - 3, v + 3]; }, '±3 kWh/kg'],
    ['discountRate', function (v) { return [v - 2, v + 2]; }, '±2 pts'],
    ['stackDurability', function (v) { return [v * 0.75, v * 1.25]; }, '±25 %'],
    ['gridFee', function (v) { return [v * 0.5, v * 1.5]; }, '±50 %'],
    ['energyTax', function (v) { return [v * 0.5, v * 1.5]; }, '±50 %'],
    ['projectLifetime', function (v) { return [v - 5, v + 5]; }, '±5 ans']
  ];

  var $ = function (id) { return document.getElementById(id); };
  var fieldsEl = $('fields');
  var labelOf = {}, inputs = {}, known = {}, lastResult = null, lastRaw = null;
  GROUPS.forEach(function (g) { g[1].forEach(function (f) { known[f[0]] = 1; labelOf[f[0]] = f[1]; }); });
  var extra = Object.keys(SCHEMA).filter(function (k) { return !known[k]; });
  var groups = GROUPS.slice();
  if (extra.length) groups.push(['Autres', extra.map(function (k) { return [k, k, '']; })]);

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var fmt = function (x, d) { return Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }); };
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2200); }

  groups.forEach(function (g) {
    var fs = document.createElement('fieldset');
    fs.innerHTML = '<legend>' + esc(g[0]) + '</legend>';
    g[1].forEach(function (f) {
      var key = f[0], rule = SCHEMA[key];
      if (!rule) return;
      var row = document.createElement('div');
      row.className = 'field';
      row.innerHTML = '<label for="f_' + key + '">' + esc(f[1]) +
        (f[2] ? '<span class="tip" title="' + esc(f[2]) + '" aria-label="' + esc(f[2]) + '">ⓘ</span>' : '') +
        (rule.required ? '' : '<span class="opt">optionnel</span>') +
        '<span class="unit">' + esc(UNITS[rule.unit] || rule.unit) + '</span></label>' +
        '<input id="f_' + key + '" name="' + key + '" type="number" inputmode="decimal" step="any"' +
        (rule.min !== undefined ? ' min="' + rule.min + '"' : '') +
        (rule.max !== undefined ? ' max="' + rule.max + '"' : '') + '>';
      fs.appendChild(row);
      inputs[key] = row.querySelector('input');
    });
    fieldsEl.appendChild(fs);
  });

  // --- Scénarios
  var presetsEl = $('presets');
  PRESETS.forEach(function (p) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = p.name; b.dataset.id = p.id;
    b.addEventListener('click', function () { applyValues(p.values); markPreset(p.id); compute(); });
    presetsEl.appendChild(b);
  });
  function markPreset(id) {
    Array.prototype.forEach.call(presetsEl.children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.id === id)); });
  }
  function applyValues(vals) {
    Object.keys(inputs).forEach(function (k) {
      var v = vals[k] !== undefined ? vals[k] : SCHEMA[k].default;
      inputs[k].value = v === undefined ? '' : v;
    });
  }

  function readInputs() {
    var raw = {};
    Object.keys(inputs).forEach(function (k) {
      var s = inputs[k].value.trim().replace(',', '.');
      if (s !== '') raw[k] = Number(s);
    });
    return raw;
  }

  function renderBreakdown(b, total) {
    var keys = Object.keys(b).filter(function (k) { return Math.abs(b[k]) > 1e-6; });
    var max = Math.max.apply(null, keys.map(function (k) { return b[k] > 0 ? b[k] : 0; }).concat([1e-9]));
    var negSpace = Math.max.apply(null, keys.map(function (k) { return b[k] < 0 ? -b[k] : 0; }).concat([0]));
    var span = max + negSpace, zero = negSpace / span * 100;
    $('breakdown').innerHTML = keys.sort(function (a, c) { return b[c] - b[a]; }).map(function (k) {
      var v = b[k], w = Math.abs(v) / span * 100, left = v >= 0 ? zero : zero - w;
      return '<div class="bar"><span>' + esc(BREAKDOWN_LABELS[k] || k) + '</span><div class="track"><div class="fill' + (v < 0 ? ' neg' : '') +
        '" style="left:' + left + '%;width:' + w + '%"></div></div><span class="v">' + fmt(v, 2) +
        '<small>' + fmt(v / total * 100, 0) + ' %</small></span></div>';
    }).join('');
  }

  function renderTornado(raw, base) {
    var rows = [];
    RANGES.forEach(function (r) {
      var key = r[0], rule = SCHEMA[key];
      if (raw[key] === undefined || !rule) return;
      if ((key === 'gridFee' || key === 'energyTax') && raw[key] === 0) return;
      var rg = r[1](raw[key]).map(function (x) {
        if (rule.min !== undefined) x = Math.max(rule.min, x);
        if (rule.max !== undefined) x = Math.min(rule.max, x);
        return x;
      });
      try {
        var lo = E.computeLcoh(Object.assign({}, raw, obj(key, rg[0]))).lcoh;
        var hi = E.computeLcoh(Object.assign({}, raw, obj(key, rg[1]))).lcoh;
        rows.push({ key: key, lo: lo, hi: hi, desc: r[2], amp: Math.abs(hi - lo) });
      } catch (e) { /* plage hors domaine : ignorée */ }
    });
    rows.sort(function (a, c) { return c.amp - a.amp; });
    var min = Math.min.apply(null, rows.map(function (r) { return Math.min(r.lo, r.hi); }).concat([base]));
    var max = Math.max.apply(null, rows.map(function (r) { return Math.max(r.lo, r.hi); }).concat([base]));
    var span = (max - min) || 1;
    var pos = function (x) { return (x - min) / span * 100; };
    $('tornado').innerHTML = rows.map(function (r) {
      var seg = function (x, cls) { return '<div class="fill ' + cls + '" style="left:' + Math.min(pos(x), pos(base)) + '%;width:' + Math.abs(pos(x) - pos(base)) + '%"></div>'; };
      return '<div class="tor"><span>' + esc(labelOf[r.key] || r.key) + ' <span class="rng">' + esc(r.desc) + '</span></span>' +
        '<div><div class="track">' + seg(r.lo, 'lo') + seg(r.hi, 'hi') + '<div class="axis" style="left:' + pos(base) + '%"></div></div>' +
        '<div class="rng">' + fmt(r.lo, 2) + ' → ' + fmt(r.hi, 2) + ' €/kg</div></div></div>';
    }).join('') +
      '<div class="legend"><span><i class="sw" style="background:var(--accent)"></i>Paramètre à sa borne basse</span>' +
      '<span><i class="sw" style="background:var(--accent2)"></i>Paramètre à sa borne haute</span>' +
      '<span><i class="sw" style="background:var(--ink)"></i>Cas de base (' + fmt(base, 2) + ' €/kg)</span></div>';
  }
  function obj(k, v) { var o = {}; o[k] = v; return o; }

  function verdict(v) {
    var el = $('verdict');
    if (v <= 3) { el.className = 'verdict good'; el.textContent = 'Bas — proche des objectifs de coût de l’hydrogène vert'; }
    else if (v <= 6) { el.className = 'verdict mid'; el.textContent = 'Intermédiaire'; }
    else { el.className = 'verdict bad'; el.textContent = 'Élevé — voir les postes dominants ci-dessous'; }
  }

  function compute() {
    var raw = readInputs();
    var errEl = $('errors');
    Object.keys(inputs).forEach(function (k) { inputs[k].classList.remove('bad'); });
    try {
      var r = E.computeLcoh(raw);
      lastResult = r; lastRaw = raw;
      errEl.hidden = true;
      $('lcoh').textContent = fmt(r.lcoh, 2);
      verdict(r.lcoh);
      var d = r.diagnostics || {};
      var k = [
        [fmt(d.totalCapex / 1e6, 1) + ' M€', 'CAPEX total'],
        [fmt(d.firstYearProduction / 1e3, 0) + ' t/an', 'Production 1re année'],
        [fmt(d.totalProduction / 1e6, 1) + ' kt', 'Production sur la durée de vie'],
        [fmt(d.capacityFactor * 100, 1) + ' %', 'Facteur de charge'],
        [fmt(d.lhvEfficiency * 100, 1) + ' %', 'Rendement (PCI)'],
        [String(d.replacementCount) + (d.replacementYears && d.replacementYears.length ? ' · an ' + d.replacementYears.map(function (y) { return fmt(y, 1); }).join(', ') : ''), 'Remplacements de stack']
      ];
      $('kpis').innerHTML = k.map(function (x) { return '<div class="kpi"><b>' + esc(x[0]) + '</b><span>' + esc(x[1]) + '</span></div>'; }).join('');
      renderBreakdown(r.breakdown, r.lcoh);
      renderTornado(raw, r.lcoh);
    } catch (e) {
      lastResult = null;
      $('lcoh').textContent = '–';
      $('verdict').className = 'verdict'; $('verdict').textContent = '';
      errEl.hidden = false;
      var issues = e.issues || [e.message];
      errEl.innerHTML = issues.map(function (i) {
        var key = String(i).split(/[\s=]/)[0];
        if (inputs[key]) inputs[key].classList.add('bad');
        return '• ' + esc(labelOf[key] ? String(i).replace(key, labelOf[key]) : i);
      }).join('<br>');
      $('breakdown').innerHTML = ''; $('tornado').innerHTML = ''; $('kpis').innerHTML = '';
    }
  }

  // --- Lien partageable (paramètres dans l'URL)
  function shareUrl() {
    var raw = readInputs();
    var q = Object.keys(raw).map(function (k) { return k + '=' + encodeURIComponent(raw[k]); }).join('&');
    return location.origin + location.pathname + '#' + q;
  }
  function loadFromHash() {
    if (!location.hash || location.hash.length < 2) return false;
    var vals = {};
    location.hash.slice(1).split('&').forEach(function (kv) {
      var p = kv.split('='); if (SCHEMA[p[0]] && p[1] !== undefined) vals[p[0]] = Number(decodeURIComponent(p[1]));
    });
    if (!Object.keys(vals).length) return false;
    applyValues(vals); return true;
  }

  $('share').addEventListener('click', function () {
    var url = shareUrl();
    history.replaceState(null, '', url);
    var done = function () { toast('Lien copié — il ouvre ce scénario exact'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt('Copiez ce lien :', url); });
    else prompt('Copiez ce lien :', url);
  });

  $('csv').addEventListener('click', function () {
    if (!lastResult) { toast('Corrigez les paramètres avant l’export'); return; }
    var lines = [['Calculateur LCOH - ' + AUTHOR], [], ['Paramètre', 'Valeur', 'Unité']];
    Object.keys(lastRaw).forEach(function (k) { lines.push([labelOf[k] || k, lastRaw[k], UNITS[SCHEMA[k].unit] || SCHEMA[k].unit]); });
    lines.push([], ['Poste', '€/kg']);
    Object.keys(lastResult.breakdown).forEach(function (k) { lines.push([BREAKDOWN_LABELS[k] || k, lastResult.breakdown[k].toFixed(4)]); });
    lines.push(['LCOH total', lastResult.lcoh.toFixed(4)]);
    var csv = '﻿' + lines.map(function (l) { return l.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(';'); }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'lcoh-scenario.csv'; document.body.appendChild(a); a.click(); a.remove();
  });

  $('print').addEventListener('click', function () { window.print(); });
  $('form').addEventListener('input', function () { markPreset(null); compute(); });
  $('year').textContent = new Date().getFullYear();

  if (loadFromHash()) markPreset(null); else { applyValues(PRESETS[0].values); markPreset('ref'); }
  compute();
})();
