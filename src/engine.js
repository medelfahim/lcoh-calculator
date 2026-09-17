/**
 * Moteur de calcul du LCOH (Levelized Cost of Hydrogen)
 * ------------------------------------------------------
 * Formulation continue : aucun découpage en blocs de 1000 h.
 * Toutes les grandeurs sont calculées en heures cumulées réelles,
 * ce qui rend le moteur insensible aux valeurs non entières.
 *
 * Convention : monnaie constante + taux d'actualisation RÉEL.
 * Le résultat est donc un LCOH réel, pré-impôt sur les sociétés.
 */

const LHV_H2 = 33.33; // kWh/kg
const HHV_H2 = 39.40; // kWh/kg

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const SCHEMA = {
  ratedCapacity:       { unit: 'kW',         min: 0.001, max: 1e7,  required: true },
  specificEnergy:      { unit: 'kWh/kg',     min: 30,    max: 100,  required: true },
  systemCost:          { unit: 'EUR/kW',     min: 0,     max: 1e5,  required: true },
  degradationRate:     { unit: '%/1000h',    min: 0,     max: 5,    required: true },
  projectLifetime:     { unit: 'ans',        min: 1,     max: 60,   required: true },
  stackDurability:     { unit: 'h',          min: 1000,  max: 5e5,  required: true },
  fullLoadHours:       { unit: 'h/an',       min: 1,     max: 8784, required: true },
  discountRate:        { unit: '%',          min: -5,    max: 40,   required: true },
  electricityCost:     { unit: 'EUR/MWh',    min: -500,  max: 1e4,  required: true },
  gridFee:             { unit: 'EUR/MWh',    min: 0,     max: 1e4,  required: false, default: 0 },
  energyTax:           { unit: 'EUR/MWh',    min: 0,     max: 1e4,  required: false, default: 0 },
  stackReplacementCost: { unit: '% CAPEX', min: 0,     max: 100,  required: false, default: 0 },
  fixedOpex:           { unit: '% CAPEX/an',min: 0,     max: 50,   required: false, default: 0 },
  waterConsumption:    { unit: 'L/kg',       min: 0,     max: 100,  required: false, default: 0 },
  waterCost:           { unit: 'EUR/m3',     min: 0,     max: 100,  required: false, default: 0 },
  constructionYears:   { unit: 'ans',        min: 0,     max: 10,   required: false, default: 0 },
  residualValue:       { unit: '% CAPEX',    min: 0,     max: 100,  required: false, default: 0 },
  decommissioningCost:{ unit: '% CAPEX',    min: 0,     max: 100,  required: false, default: 0 }
};

class LcohInputError extends Error {
  constructor(issues) {
    super('Entrées invalides : ' + issues.join(' | '));
    this.name = 'LcohInputError';
    this.issues = issues;
  }
}

function validate(raw) {
  const issues = [];
  const p = {};

  for (const [key, rule] of Object.entries(SCHEMA)) {
    const v = raw[key];

    if (v === undefined || v === null || v === '') {
      if (rule.required) { issues.push(`${key} est obligatoire`); continue; }
      p[key] = rule.default;
      continue;
    }
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) { issues.push(`${key} n'est pas un nombre fini`); continue; }
    if (n < rule.min || n > rule.max) {
      issues.push(`${key} = ${n} ${rule.unit} hors bornes [${rule.min}, ${rule.max}]`);
      continue;
    }
    p[key] = n;
  }

  if (issues.length) throw new LcohInputError(issues);

  // Cohérences croisées
  const eff = LHV_H2 / p.specificEnergy;
  if (eff > 1) issues.push(
    `specificEnergy = ${p.specificEnergy} kWh/kg implique un rendement PCI de ` +
    `${(eff * 100).toFixed(0)} %, supérieur à 100 %`
  );
  if (issues.length) throw new LcohInputError(issues);

  return p;
}

// ---------------------------------------------------------------------------
// Production annuelle avec dégradation et remplacements
// ---------------------------------------------------------------------------

/**
 * Production annuelle en kg, en intégrant la dégradation en continu.
 *
 * Hypothèse physique : l'électrolyseur fonctionne à puissance nominale
 * pendant `fullLoadHours` heures équivalentes pleine charge. La dégradation
 * accroît la consommation spécifique, donc la production décroît à énergie
 * constante. Un stack neuf produit à sa performance nominale (pas de
 * décalage d'un cran).
 *
 * Le débit à l'heure cumulée h depuis la dernière remise à neuf vaut :
 *     m(h) = m0 * (1 - d)^(h / 1000)
 * L'intégrale analytique évite toute discrétisation.
 */
function annualProduction(p) {
  const nominalRate = p.ratedCapacity / p.specificEnergy;   // kg/h à l'état neuf
  const k = Math.log(1 - p.degradationRate / 100) / 1000;   // <= 0, par heure

  // Intégrale de m0 * e^(k*h) entre a et b, mesurée depuis la remise à neuf
  const integrate = (a, b) =>
    k === 0 ? nominalRate * (b - a)
            : nominalRate * (Math.exp(k * b) - Math.exp(k * a)) / k;

  const years = [];
  let replacements = [];       // années (décimales) des remplacements
  let hoursSinceNew = 0;       // heures depuis la dernière remise à neuf

  for (let y = 1; y <= Math.ceil(p.projectLifetime); y++) {
    // Dernière année éventuellement partielle
    const frac = Math.min(1, p.projectLifetime - (y - 1));
    let remaining = p.fullLoadHours * frac;
    let kg = 0;

    while (remaining > 1e-12) {
      const toReplacement = p.stackDurability - hoursSinceNew;

      if (toReplacement > remaining + 1e-12) {
        kg += integrate(hoursSinceNew, hoursSinceNew + remaining);
        hoursSinceNew += remaining;
        remaining = 0;
      } else {
        // Le stack atteint sa fin de vie au cours de l'année
        kg += integrate(hoursSinceNew, p.stackDurability);
        remaining -= toReplacement;
        const yearOfReplacement =
          (y - 1) + (p.fullLoadHours * frac - remaining) / (p.fullLoadHours * frac) * frac;
        // Un remplacement n'est engagé que s'il reste de l'exploitation après
        if (remaining > 1e-9 || yearOfReplacement < p.projectLifetime - 1e-9) {
          replacements.push(yearOfReplacement);
        }
        hoursSinceNew = 0;
      }
    }
    years.push({ year: y, fraction: frac, kg });
  }

  // Un remplacement tombant exactement à la fin du projet n'est pas engagé
  replacements = replacements.filter(t => t < p.projectLifetime - 1e-9);

  return { years, replacements, nominalRate };
}

// ---------------------------------------------------------------------------
// Calcul principal
// ---------------------------------------------------------------------------

function computeLcoh(raw) {
  const p = validate(raw);
  const r = p.discountRate / 100;
  const df = t => Math.pow(1 + r, t);   // facteur d'actualisation à la date t

  const capex = p.ratedCapacity * p.systemCost;
  const { years, replacements, nominalRate } = annualProduction(p);

  // --- CAPEX étalé sur la période de construction, actualisé à la mise en service
  // t = 0 correspond à la mise en service. La construction se déroule donc
  // sur les dates négatives, ce qui capitalise les décaissements (effet IDC).
  let capexNpv;
  if (p.constructionYears > 0) {
    const n = Math.max(1, Math.round(p.constructionYears));
    const slice = capex / n;
    capexNpv = 0;
    for (let i = 0; i < n; i++) capexNpv += slice * df(p.constructionYears - i - 0.5);
  } else {
    capexNpv = capex;
  }

  // --- Dénominateur : production actualisée (milieu d'année)
  const discountedProduction = years.reduce(
    (s, y) => s + y.kg / df(y.year - 1 + y.fraction / 2), 0
  );
  const totalProduction = years.reduce((s, y) => s + y.kg, 0);

  // --- Énergie consommée : puissance nominale x heures équivalentes
  const energyNpv = years.reduce((s, y) => {
    const mwh = p.ratedCapacity * p.fullLoadHours * y.fraction / 1000;
    return s + mwh / df(y.year - 1 + y.fraction / 2);
  }, 0);

  const electricityNpv = energyNpv * p.electricityCost;
  const gridFeeNpv     = energyNpv * p.gridFee;
  const energyTaxNpv   = energyNpv * p.energyTax;

  // --- OPEX fixe
  const fixedOpexNpv = years.reduce(
    (s, y) => s + capex * p.fixedOpex / 100 * y.fraction / df(y.year - 1 + y.fraction / 2), 0
  );

  // --- Eau
  const waterNpv = years.reduce(
    (s, y) => s + (y.kg * p.waterConsumption / 1000) * p.waterCost
                / df(y.year - 1 + y.fraction / 2), 0
  );

  // --- Remplacements : autant qu'il en faut, chacun à sa date réelle
  const replacementNpv = replacements.reduce(
    (s, t) => s + capex * p.stackReplacementCost / 100 / df(t), 0
  );

  // --- Fin de vie
  const residualNpv = -capex * p.residualValue / 100 / df(p.projectLifetime);
  const decommNpv   =  capex * p.decommissioningCost / 100 / df(p.projectLifetime);

  const contribution = x => (discountedProduction > 0 ? x / discountedProduction : NaN);

  const breakdown = {
    capex:            contribution(capexNpv),
    electricity:      contribution(electricityNpv),
    gridFee:          contribution(gridFeeNpv),
    energyTax:        contribution(energyTaxNpv),
    fixedOpex:        contribution(fixedOpexNpv),
    water:            contribution(waterNpv),
    stackReplacement: contribution(replacementNpv),
    residualValue:    contribution(residualNpv),
    decommissioning:  contribution(decommNpv)
  };

  const lcoh = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return {
    lcoh,
    breakdown,
    convention: 'reel_pre_impot',
    diagnostics: {
      totalCapex: capex,
      nominalProductionRate: nominalRate,          // kg/h
      capacityFactor: p.fullLoadHours / 8760,
      lhvEfficiency: LHV_H2 / p.specificEnergy,
      hhvEfficiency: HHV_H2 / p.specificEnergy,
      totalOperatingHours: p.fullLoadHours * p.projectLifetime,
      replacementCount: replacements.length,
      replacementYears: replacements.map(t => Number(t.toFixed(3))),
      totalProduction,
      discountedProduction,
      firstYearProduction: years[0] ? years[0].kg : 0,
      lastYearProduction: years.length ? years[years.length - 1].kg : 0
    }
  };
}

// ---------------------------------------------------------------------------
// Sensibilité (tornado)
// ---------------------------------------------------------------------------

function sensitivity(raw, variables, swing = 0.2) {
  const base = computeLcoh(raw).lcoh;
  return variables.map(name => {
    const low  = computeLcoh({ ...raw, [name]: raw[name] * (1 - swing) }).lcoh;
    const high = computeLcoh({ ...raw, [name]: raw[name] * (1 + swing) }).lcoh;
    return {
      variable: name,
      low, high, base,
      amplitude: Math.abs(high - low)
    };
  }).sort((a, b) => b.amplitude - a.amplitude);
}

module.exports = { computeLcoh, sensitivity, validate, SCHEMA, LcohInputError, LHV_H2, HHV_H2 };
