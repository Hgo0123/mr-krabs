# Brief — PWA de suivi de budget mensuel

## 1. Objectif

Une petite application web personnelle, installée sur l'écran d'accueil de mon iPhone (PWA), pour noter mes dépenses au quotidien. Elle doit me montrer en un coup d'œil où j'en suis de mon budget du mois et **combien il me reste à dépenser cette semaine**.

Usage : une seule personne, un seul appareil (iPhone, Safari). Langue : français. Devise : euro.

---

## 2. Contraintes techniques

- **PWA statique** : HTML, CSS et JavaScript vanilla, **sans framework ni étape de build**. On doit pouvoir ouvrir `index.html` et que ça marche.
- **Aucune dépendance externe** : pas de CDN. Le graphique est dessiné en SVG à la main, pour que l'appli fonctionne entièrement hors ligne.
- **Stockage local** : `localStorage`, sous une seule clé (`budget-app-data`) contenant un objet JSON versionné. Aucun serveur, aucun compte.
- **Hébergement prévu** : GitHub Pages (HTTPS). Tous les chemins doivent être relatifs, car l'appli sera servie depuis un sous-dossier.
- **PWA iOS** :
  - `manifest.json` avec `"display": "standalone"`, nom, couleurs et icônes 192 et 512 px ;
  - `<link rel="apple-touch-icon">` (180 px) et `<meta name="apple-mobile-web-app-capable">` ;
  - prise en compte des safe areas avec `env(safe-area-inset-*)`, pour l'encoche et la barre du bas ;
  - service worker qui met en cache tous les fichiers de l'appli (stratégie *cache first*), avec un numéro de version pour forcer la mise à jour.
- **Mobile first** : conçu pour un iPhone en portrait (375–430 px de large), zones tactiles de 44 px minimum, pas de zoom intempestif (champs en `font-size: 16px` minimum). Thème clair et thème sombre automatiques (`prefers-color-scheme`).
- **La semaine commence le lundi.**

---

## 3. Modèle de données

```json
{
  "version": 1,
  "defaultBudget": 80000,
  "monthlyBudgets": { "2026-10": 75000 },
  "tags": [
    { "id": "food",    "name": "Nourriture", "color": "#E8833A" },
    { "id": "leisure", "name": "Loisirs",    "color": "#4A90D9" },
    { "id": "clothes", "name": "Vêtements",  "color": "#9B59B6" },
    { "id": "shop",    "name": "Achats",     "color": "#27AE60" },
    { "id": "other",   "name": "Autre",      "color": "#95A5A6" }
  ],
  "expenses": [
    { "id": "uuid", "date": "2026-10-19", "amount": 1250, "tagId": "food", "createdAt": "2026-10-19T12:31:00Z" }
  ]
}
```

Règles :

- **Tous les montants sont stockés en centimes, en nombres entiers**, pour éviter les erreurs d'arrondi. Ils sont affichés au format français : `12,50 €`.
- `date` est une date locale au format `AAAA-MM-JJ`, sans heure, pour éviter les décalages de fuseau horaire.
- Le budget d'un mois vaut `monthlyBudgets["AAAA-MM"]` s'il existe, sinon `defaultBudget`.
- Le tag **« Autre »** existe toujours et ne peut pas être supprimé. Quand on supprime un autre tag, ses dépenses passent dans « Autre ». L'utilisateur est prévenu par une confirmation indiquant le nombre de dépenses concernées.
- Le champ `version` permet de migrer les données si le format change plus tard.

---

## 4. Écrans et navigation

Une barre d'onglets en bas : **Mois** · **Stats** · **Réglages**.

### 4.1 Onglet « Mois » (écran principal)

**En-tête**
- Nom du mois et année (« Octobre 2026 »), avec des flèches ‹ › pour changer de mois. Un appui sur le titre ramène au mois en cours.

**Bandeau résumé**
- Budget du mois, total dépensé, reste du mois.
- Une barre de progression qui passe à l'orange au-delà de 80 % et au rouge en cas de dépassement.
- **Mise en avant principale**, pour le mois en cours uniquement : « Il te reste **X €** cette semaine », avec en dessous « soit environ Y € par jour » (voir le calcul en section 5).

**Calendrier**
- Grille de 7 colonnes (L M M J V S D) avec tous les jours du mois. Les cases hors du mois sont vides ou grisées.
- Chaque jour affiche son numéro et, s'il y a des dépenses, le total du jour en petit. Optionnel : des petites pastilles aux couleurs des tags utilisés ce jour-là.
- Le jour d'aujourd'hui est mis en évidence.
- **Un appui sur un jour** ouvre un panneau (bottom sheet) avec :
  - la liste des dépenses du jour (montant et tag) ;
  - pour chaque dépense, un bouton pour la modifier et un pour la supprimer (avec confirmation) ;
  - un bouton « Ajouter une dépense ce jour-là ».

**Récap semaine par semaine** (sous le calendrier)
- Une ligne par semaine du mois (voir la définition en section 5), avec les dates (« 19 → 25 oct. »), le montant dépensé et le montant prévu.
- Semaines passées : dépensé / prévu, puis l'écart en vert ou en rouge.
- Semaine en cours : mise en évidence, avec le reste disponible.
- Semaines à venir : montant prévu, en grisé.

**Bouton « + » flottant**, en bas à droite, au-dessus de la barre d'onglets.

### 4.2 Saisie d'une dépense (bottom sheet)

S'ouvre depuis le bouton « + » ou depuis le panneau d'un jour.

- **Montant** : champ avec `inputmode="decimal"` pour afficher le pavé numérique de l'iPhone. Il accepte la virgule et le point, et reçoit le focus automatiquement à l'ouverture.
- **Tag** : des puces colorées, et on en touche une pour la sélectionner. Par défaut, c'est le dernier tag utilisé qui est présélectionné.
- **Date** : par défaut aujourd'hui, ou le jour depuis lequel on a ouvert le panneau. Elle est modifiable avec un `<input type="date">`.
- Bouton **Enregistrer**, désactivé tant que le montant n'est pas un nombre supérieur à 0.
- En mode modification, le même formulaire s'ouvre prérempli, avec en plus un bouton « Supprimer ».
- Après l'enregistrement, le panneau se ferme et le calendrier ainsi que les totaux se mettent à jour immédiatement.

### 4.3 Onglet « Stats »

- Sélecteur de mois, synchronisé avec l'onglet Mois.
- **Graphique en anneau (donut) en SVG** montrant la répartition des dépenses du mois par tag, avec le total au centre.
- En dessous, la liste des tags triés du plus gros au plus petit : pastille de couleur, nom, montant et pourcentage.
- Si le mois ne contient aucune dépense, afficher un message vide clair.

### 4.4 Onglet « Réglages »

- **Budget mensuel par défaut**, modifiable.
- **Budget du mois affiché**, qui permet de remplacer le budget par défaut pour un mois précis, avec un bouton « revenir au budget par défaut ».
- **Gestion des tags** : ajouter, renommer, changer la couleur (une palette d'une dizaine de couleurs prédéfinies suffit) et supprimer (sauf « Autre », voir la section 3).
- **Sauvegarde** :
  - « Exporter mes données » télécharge un fichier `budget-AAAA-MM-JJ.json`. Sur iPhone, il faut passer par la feuille de partage ou un téléchargement compatible avec Safari en mode standalone.
  - « Importer » charge un fichier JSON, vérifie son format, puis **remplace** toutes les données après confirmation.
- Afficher la date du dernier export, et un petit rappel si elle remonte à plus de 30 jours.

---

## 5. Règles de calcul (important)

### Définition des semaines d'un mois

Les semaines vont du lundi au dimanche, **coupées aux limites du mois**. La première et la dernière semaine peuvent donc compter moins de 7 jours.

> Exemple : octobre 2026 commence un jeudi. Ses semaines sont 1→4 (4 jours), 5→11, 12→18, 19→25 et 26→31 (6 jours).

### Budget disponible par semaine (reste réparti)

Ce qui reste du budget au début d'une semaine est réparti **au prorata des jours** restants du mois. Ainsi, économiser une semaine donne plus de marge les semaines suivantes, et trop dépenser en laisse moins.

Pour une semaine S :

```
resteAuDébut(S)   = budget du mois − dépenses du mois datées AVANT le premier jour de S
joursRestants(S)  = nombre de jours entre le premier jour de S et la fin du mois (inclus)
joursDeS          = nombre de jours de S dans le mois
prévu(S)          = max(0, resteAuDébut(S)) × joursDeS / joursRestants(S)
resteSemaine(S)   = prévu(S) − dépenses datées dans S
```

- **Semaine en cours** : afficher `resteSemaine`, ainsi que `resteSemaine / jours restants dans la semaine (aujourd'hui compris)` pour l'indication par jour.
- **Semaines passées** : afficher `prévu(S)` calculé avec la formule ci-dessus, le montant dépensé et l'écart.
- **Semaines futures** : `prévu` est calculé à partir du reste actuel, réparti de la même façon. C'est donc une estimation, qui bouge au fil des dépenses.
- **Dépassement** : si le reste du mois est négatif, l'afficher en rouge (« Budget dépassé de X € ») et mettre le budget disponible des semaines suivantes à 0 €. Si `resteSemaine` est négatif, l'afficher en rouge (« Semaine dépassée de X € »).
- Les arrondis ne se font qu'à l'affichage, au centime.

> Exemple de vérification : budget de 800 €, on est le lundi 19 octobre 2026, et 500 € ont été dépensés du 1er au 18. Il reste 300 € pour 13 jours (du 19 au 31). La semaine du 19 au 25 compte 7 jours, donc `prévu = 300 × 7 / 13 = 161,54 €`, soit environ 23,08 € par jour.

Ces fonctions de calcul doivent être **pures**, c'est-à-dire séparées de l'affichage (par exemple dans `calc.js`), et accompagnées de quelques tests simples. Un fichier `tests.html` qui les exécute dans le navigateur suffit, et doit au minimum couvrir l'exemple ci-dessus, un mois qui commence un lundi, un mois dépassé et un mois vide.

---

## 6. Hors périmètre (ne pas faire)

- Dépenses récurrentes ou automatiques
- Note ou description libre sur une dépense
- Revenus, comptes bancaires, plusieurs devises
- Synchronisation, comptes utilisateur, backend
- Notifications

---

## 7. Livrables attendus

```
/index.html
/styles.css
/app.js          (affichage et interactions)
/calc.js         (fonctions de calcul pures)
/storage.js      (lecture/écriture localStorage, export/import, migrations)
/manifest.json
/sw.js
/icons/          (icônes 180, 192 et 512 px, motif simple et original)
/tests.html
/README.md       (comment tester en local et déployer sur GitHub Pages,
                  puis comment ajouter l'appli à l'écran d'accueil de l'iPhone)
```

---

## 8. Critères d'acceptation

1. Ajoutée à l'écran d'accueil depuis Safari, l'appli s'ouvre en plein écran avec son icône, et fonctionne en mode avion après une première ouverture.
2. On peut ajouter une dépense en moins de 5 secondes : appui sur « + », saisie du montant, choix du tag, Enregistrer.
3. Une dépense ajoutée sans changer la date apparaît sur le jour d'aujourd'hui.
4. On peut ajouter, modifier et supprimer une dépense sur n'importe quel jour.
5. Les totaux par jour, par semaine et par mois, ainsi que le reste de la semaine, sont justes. L'exemple de la section 5 donne bien 161,54 €.
6. Le graphique de l'onglet Stats correspond aux dépenses du mois sélectionné.
7. Les données survivent à la fermeture de l'appli. Un export suivi d'un import redonne exactement les mêmes données.
8. L'affichage est propre sur iPhone, sans débordement horizontal ni élément caché sous l'encoche ou la barre du bas, en thème clair comme en thème sombre.

---

## 9. Ordre de réalisation suggéré

1. `calc.js`, `storage.js` et `tests.html` : la logique d'abord, vérifiée par les tests.
2. Onglet Mois : calendrier, bandeau résumé et récap des semaines.
3. Saisie, modification et suppression des dépenses.
4. Réglages : budget, tags, export/import.
5. Onglet Stats : graphique en anneau.
6. Manifest, service worker et icônes, puis le README de déploiement.
