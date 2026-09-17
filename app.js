(function () {
  'use strict';
  var E = window.LCOH;
  var SCHEMA = E.SCHEMA;

  var REF = {
    ratedCapacity: 20000, specificEnergy: 52.4, systemCost: 1666,
    degradationRate: 0.12, projectLifetime: 25, stackDurability: 80000,
    fullLoadHours: 4000, discountRate: 6, electricityCost: 57.78,
    gridFee: 26.7, energyTax: 33, stackReplacementCost: 15, fixedOpex: 2
  };

  var GROUPS = [
    ['Électrolyseur', [
      ['ratedCapacity', 'Puissance nominale'],
      ['specificEnergy', 'Consommation spécifique'],
      ['degradationRate', 'Dégradation'],
      ['stackDurability', 'Durabilité du stack']]],
    ['Investissement', [
      ['systemCost', 'Coût système'],
      ['stackReplacementCost', 'Remplacement de stack'],
      ['fixedOpex', 'OPEX fixe'],
      ['constructionYears', 'Durée de construction'],
      ['residualValue', 'Valeur résiduelle'],
      ['decommissioningCost', 'Démantèlement']]],
    ['Exploitation', [
      ['fullLoadHours', 'Heures pleine charge'],
      ['projectLifetime', 'Durée de vie du projet'],
      ['discountRate', "Taux d'actualisation réel"]]],
    ['Énergie & eau', [
      ['electricityCost', "Prix de l'électricité"],
      ['gridFee', 'Frais de réseau'],
      ['energyTax', "Taxes sur l'énergie"],
      ['waterConsumption', "Consommation d'eau"],
      ['waterCost', "Coût de l'eau"]]]
  ];

  var BREAKDOWN_LABELS = {
    capex: 'CAPEX', electricity: 'Électricité', gridFee: 'Frais de réseau',
    energyTax: "Taxes énergie", fixedOpex: 'OPEX fixe', water: 'Eau',
    stackReplacement: 'Remplacements stack', residualValue: 'Valeur résiduelle',
    decommissioning: 'Démantèlement'
  };

  // Plages absolues réalistes pour le tornado
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

  var fieldsEl = document.getElementById('fields');
  var labelOf = {};
  var inputs = {};
  var known = {};
  GROUPS.forEach(function (g) { g[1].forEach(function (f) { known[f[0]] = 1; labelOf[f[0]] = f[1]; }); });
  var extra = Object.keys(SCHEMA).filter(function (k) { return !known[k]; });
  var groups = GROUPS.slice();
  if (extra.length) groups.push(['Autres', extra.map(function (k) { return [k, k]; })]);

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  groups.forEach(function (g) {
    var fs = document.createElement('fieldset');
    fs.innerHTML = '<legend>' + esc(g[0]) + '</legend>';
    g[1].forEach(function (f) {
      var key = f[0], rule = SCHEMA[key];
      if (!rule) return;
      var row = document.createElement('div');
      row.className = 'field';
      row.innerHTML = '<label for="f_' + key + '">' + esc(f[1]) + '<span class="unit">' + esc(rule.unit) +
        (rule.required ? '' : ' · optionnel') + '</span></label>' +
        '<input id="f_' + key + '" type="number" inputmode="decimal" step="any"' +
        (rule.min !== undefined ? ' min="' + rule.min + '"' : '') +
        (rule.max !== undefined ? ' max="' + rule.max + '"' : '') + '>';
      fs.appendChild(row);
      inputs[key] = row.querySelector('input');
    });
    fieldsEl.appendChild(fs);
  });

  function setDefaults() {
    Object.keys(inputs).forEach(function (k) {
      var v = REF[k] !== undefined ? REF[k] : SCHEMA[k].default;
      inputs[k].value = v === undefined ? '' : v;
    });
  }

  function readInputs() {
    var raw = {};
    Object.keys(inputs).forEach(function (k) {
      var s = inputs[k].value.trim();
      if (s !== '') raw[k] = Number(s);
    });
    return raw;
  }

  var fmt = function (x, d) { return Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }); };

  function renderBreakdown(b) {
    var keys = Object.keys(b).filter(function (k) { return Math.abs(b[k]) > 1e-6; });
    var max = Math.max.apply(null, keys.map(function (k) { return Math.abs(b[k]); }).concat([1e-9]));
    var hasNeg = keys.some(function (k) { return b[k] < 0; });
    var negSpace = hasNeg ? Math.max.apply(null, keys.map(function (k) { return b[k] < 0 ? -b[k] : 0; })) : 0;
    var total = max + negSpace;
    var zero = negSpace / total * 100;
    document.getElementById('breakdown').innerHTML = keys.sort(function (a, c) { return b[c] - b[a]; }).map(function (k) {
      var v = b[k], w = Math.abs(v) / total * 100;
      var left = v >= 0 ? zero : zero - w;
      return '<div class="bar"><span>' + esc(BREAKDOWN_LABELS[k] || k) + '</span><div class="track"><div class="fill' + (v < 0 ? ' neg' : '') +
        '" style="left:' + left + '%;width:' + w + '%"></div></div><span class="v">' + fmt(v, 2) + '</span></div>';
    }).join('');
  }

  function renderTornado(raw, base) {
    var rows = [];
    RANGES.forEach(function (r) {
      var key = r[0], rule = SCHEMA[key];
      if (raw[key] === undefined || !rule) return;
      var rg = r[1](raw[key]).map(function (x) {
        if (rule.min !== undefined) x = Math.max(rule.min, x);
        if (rule.max !== undefined) x = Math.min(rule.max, x);
        return x;
      });
      try {
        var lo = E.computeLcoh(Object.assign({}, raw, (function () { var o = {}; o[key] = rg[0]; return o; })())).lcoh;
        var hi = E.computeLcoh(Object.assign({}, raw, (function () { var o = {}; o[key] = rg[1]; return o; })())).lcoh;
        rows.push({ key: key, lo: lo, hi: hi, desc: r[2], amp: Math.abs(hi - lo) });
      } catch (e) { /* plage hors bornes : ignorée */ }
    });
    rows.sort(function (a, c) { return c.amp - a.amp; });
    var min = Math.min.apply(null, rows.map(function (r) { return Math.min(r.lo, r.hi); }).concat([base]));
    var max = Math.max.apply(null, rows.map(function (r) { return Math.max(r.lo, r.hi); }).concat([base]));
    var span = (max - min) || 1;
    var pos = function (x) { return (x - min) / span * 100; };
    document.getElementById('tornado').innerHTML = rows.map(function (r) {
      var segLo = '<div class="fill lo" style="left:' + Math.min(pos(r.lo), pos(base)) + '%;width:' + Math.abs(pos(r.lo) - pos(base)) + '%"></div>';
      var segHi = '<div class="fill hi" style="left:' + Math.min(pos(r.hi), pos(base)) + '%;width:' + Math.abs(pos(r.hi) - pos(base)) + '%"></div>';
      return '<div class="tor"><span>' + esc(labelOf[r.key] || r.key) + ' <span class="rng">' + esc(r.desc) + '</span></span>' +
        '<div><div class="track">' + segLo + segHi + '<div class="axis" style="left:' + pos(base) + '%"></div></div>' +
        '<div class="rng">' + fmt(r.lo, 2) + ' → ' + fmt(r.hi, 2) + ' €/kg</div></div></div>';
    }).join('') + '<p class="note">Vert : borne basse de la variable · orange : borne haute · trait : cas de base (' + fmt(base, 2) + ' €/kg).</p>';
  }

  function compute() {
    var raw = readInputs();
    var errEl = document.getElementById('errors');
    Object.keys(inputs).forEach(function (k) { inputs[k].classList.remove('bad'); });
    try {
      var r = E.computeLcoh(raw);
      errEl.hidden = true;
      document.getElementById('lcoh').textContent = fmt(r.lcoh, 2);
      var d = r.diagnostics || {};
      var k = [
        [fmt(d.totalCapex / 1e6, 2) + ' M€', 'CAPEX total'],
        [fmt(d.nominalProductionRate, 1) + ' kg/h', 'Débit nominal'],
        [fmt(d.capacityFactor * 100, 1) + ' %', 'Facteur de charge'],
        [fmt(d.lhvEfficiency * 100, 1) + ' %', 'Rendement PCI'],
        [fmt(d.totalProduction / 1e6, 2) + ' kt', 'Production totale'],
        [d.replacementCount + (d.replacementYears && d.replacementYears.length ? ' (an ' + d.replacementYears.map(function (y) { return fmt(y, 1); }).join(', ') + ')' : ''), 'Remplacements de stack']
      ];
      document.getElementById('kpis').innerHTML = k.map(function (x) { return '<div class="kpi"><b>' + esc(x[0]) + '</b><span>' + esc(x[1]) + '</span></div>'; }).join('');
      renderBreakdown(r.breakdown);
      renderTornado(raw, r.lcoh);
    } catch (e) {
      document.getElementById('lcoh').textContent = '–';
      errEl.hidden = false;
      var issues = e.issues || [e.message];
      errEl.innerHTML = issues.map(function (i) { return '• ' + esc(i); }).join('<br>');
      issues.forEach(function (i) { var key = String(i).split(/[\s=]/)[0]; if (inputs[key]) inputs[key].classList.add('bad'); });
      document.getElementById('breakdown').innerHTML = '';
      document.getElementById('tornado').innerHTML = '';
      document.getElementById('kpis').innerHTML = '';
    }
  }

  document.getElementById('form').addEventListener('input', compute);
  document.getElementById('reset').addEventListener('click', function () { setDefaults(); compute(); });
  setDefaults();
  compute();
})();
