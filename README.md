# Auto-École

Démo pour [arthurlecomte.fr](https://arthurlecomte.fr) : de petites
voitures apprennent à boucler des circuits 2D par **neuroévolution**.
Chaque voiture perçoit la piste avec 5 capteurs de distance, un petit
réseau de neurones (6 → 8 → 2) décide du volant et du gaz, et un
algorithme génétique (élitisme, tournoi, croisement, mutations
gaussiennes) fait progresser l'école promotion après promotion.

Le visiteur peut :

- regarder l'école apprendre (capteurs du meilleur élève, réseau de
  neurones animé, courbe de progression par promotion) ;
- régler la vitesse (×1 à Max), la taille des promotions et l'audace
  des mutations ;
- choisir parmi 3 circuits prédéfinis, ou **dessiner son circuit** à
  main levée (validé, puis sauvé en `localStorage`) ;
- faire rouler un **champion** pré-entraîné embarqué (un par circuit
  prédéfini).

## Développer

```sh
npm ci
npm run dev       # serveur de développement
npm run build     # fichiers finaux dans dist/
npm run preview   # sert dist/ en local
```

Outillage (Node, sans dépendance) :

```sh
node tools/smoke.js   # valide les circuits + teste que l'évolution progresse
node tools/train.js   # ré-entraîne les champions -> src/tracks/champions.js
```

## Architecture

- `src/sim/` — simulation pure (sans DOM), partagée navigateur/Node :
  réseau (`nn.js`), génétique (`ga.js`), voiture (`car.js`), géométrie
  de piste + raycasts (`track.js`), chef d'orchestre (`simulation.js`).
- `src/tracks/` — 3 circuits prédéfinis et champions générés.
- `src/render/` — piste/voitures, réseau animé, courbe de progression.
- `src/ui/editor.js` — éditeur de tracé à main levée.
- `src/main.js` — boucle « rendu à la demande » : aucun repaint quand
  la scène est immobile (0 rafraîchissement mesuré sur 3 s de pause).

Choix simples assumés : l'éditeur est uniquement à la souris/au doigt
(pas d'alternative clavier — le reste de la démo se pilote entièrement
au clavier) ; les champions sont sélectionnés pour leur robustesse à de
petites perturbations du départ, afin de rester stables d'un moteur
JavaScript à l'autre.

## Licences des assets

Aucun asset externe : tout est dessiné au canvas, police système,
icônes en emoji système. Code sous la licence du dépôt.
