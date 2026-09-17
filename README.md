# Calculateur LCOH

Calculateur en ligne du **coût actualisé de l'hydrogène** (*Levelized Cost of Hydrogen*) produit par électrolyse.

**Site : https://medelfahim.github.io/lcoh-calculator/**

## Fonctionnalités

- LCOH en €/kg, mis à jour en temps réel
- Décomposition : CAPEX, électricité, frais de réseau, taxes énergie, OPEX fixe, eau, remplacements de stack, valeur résiduelle, démantèlement
- Indicateurs : débit nominal, facteur de charge, rendement PCI, production totale, dates des remplacements
- Analyse de sensibilité (tornado) sur des plages réalistes par variable
- Validation des entrées avec messages d'erreur explicites
- Calcul 100 % dans le navigateur, aucune donnée envoyée

## Méthode

LCOH = (CAPEX actualisé + Σ coûts actualisés) / Σ production actualisée

- Formulation continue : la dégradation est intégrée analytiquement sur les heures cumulées, `m(h) = m0 · (1 − d)^(h/1000)`. Toute valeur d'heures ou de durabilité est acceptée (4380 h/an, 62 500 h…).
- Remplacements de stack comptés à leur date réelle, autant que nécessaire, et jamais au-delà de la fin du projet.
- CAPEX étalé sur la période de construction (effet IDC).
- Convention : monnaie constante, taux d'actualisation réel, pré-impôt sur les sociétés.
- Les heures saisies sont des heures équivalentes pleine charge.

Cas de référence (20 MW, 52,4 kWh/kg, 1666 €/kW, 4000 h/an, 25 ans, 6 %, 57,78 €/MWh) : **8,63 €/kg**.

## Structure

```
index.html      interface
style.css       styles
app.js          logique d'interface (formulaire, graphiques)
src/engine.js   moteur de calcul (utilisable aussi sous Node.js)
```

## Utilisation en Node.js

```js
const { computeLcoh } = require('./src/engine');
const r = computeLcoh({ ratedCapacity: 20000, specificEnergy: 52.4, systemCost: 1666,
  degradationRate: 0.12, projectLifetime: 25, stackDurability: 80000,
  fullLoadHours: 4000, discountRate: 6, electricityCost: 57.78 });
console.log(r.lcoh, r.breakdown);
```

## Crédits

Inspiré du calculateur open source de Rituraj Borah, moteur réécrit pour corriger les limites de l'architecture en blocs de 1000 heures.

## Auteur et droits

© 2026 **Mohamed EL FAHIM** — Tous droits réservés.

Conception, développement et maintenance : Mohamed EL FAHIM ([@medelfahim](https://github.com/medelfahim)).
Toute reproduction, redistribution ou réutilisation commerciale de ce projet, en tout ou partie, sans autorisation écrite de l'auteur est interdite.
