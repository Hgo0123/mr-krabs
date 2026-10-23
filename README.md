# Budget — PWA de suivi de budget mensuel

Petite application web personnelle pour noter ses dépenses au quotidien et savoir
**combien il reste à dépenser cette semaine**. HTML/CSS/JS vanilla, sans dépendance,
sans build, données stockées uniquement dans le navigateur (`localStorage`).

```
index.html     page unique
styles.css     styles (thème clair / sombre automatique)
app.js         affichage et interactions
calc.js        fonctions de calcul pures (semaines, budget, montants)
storage.js     localStorage, validation, migrations, export/import
manifest.json  manifeste PWA
sw.js          service worker (cache first, versionné)
icons/         icônes 180, 192 et 512 px
tests.html     tests des calculs, à ouvrir dans un navigateur
```

## Tester en local

**Rapide :** ouvrir `index.html` directement dans un navigateur. Tout fonctionne,
sauf le service worker (les navigateurs ne l'activent pas sur `file://`).

**Comme en production (avec le mode hors ligne) :** lancer un petit serveur depuis le dossier :

```bash
python3 -m http.server 8000
```

puis ouvrir <http://localhost:8000/>.

**Tests :** ouvrir `tests.html` (directement ou via le serveur). La page affiche
« N tests réussis » en vert, ou la liste des échecs en rouge. Les tests couvrent
notamment l'exemple du brief (161,54 €), un mois qui commence un lundi, un mois
dépassé, un mois vide, la saisie des montants et l'aller-retour export/import.

Pour tester sur l'iPhone avant de déployer : lancer le serveur avec
`python3 -m http.server 8000 --bind 0.0.0.0` et ouvrir `http://<IP-de-l-ordi>:8000/`
dans Safari (même Wi-Fi). Sans HTTPS, le service worker ne s'active pas : le mode
hors ligne ne se teste qu'une fois déployé.

## Déployer sur GitHub Pages

1. Créer un dépôt sur GitHub (par exemple `budget`).
2. Envoyer les fichiers à la racine du dépôt :
   ```bash
   git init
   git add .
   git commit -m "Appli budget"
   git branch -M main
   git remote add origin https://github.com/<utilisateur>/budget.git
   git push -u origin main
   ```
3. Sur GitHub : **Settings → Pages → Build and deployment**, source
   « Deploy from a branch », branche `main`, dossier `/ (root)`, puis **Save**.
4. Après une minute, l'appli est en ligne sur `https://<utilisateur>.github.io/budget/`.

Tous les chemins sont relatifs : l'appli fonctionne depuis ce sous-dossier sans
modification.

### Publier une mise à jour

Le service worker sert les fichiers depuis son cache. Pour que l'iPhone récupère
une nouvelle version :

1. modifier les fichiers ;
2. **incrémenter `VERSION` dans `sw.js`** (`'v1'` → `'v2'`) ;
3. committer et pousser.

Au lancement suivant, le nouveau service worker télécharge les fichiers et
supprime l'ancien cache ; la nouvelle version s'affiche au lancement d'après
(fermer complètement l'appli puis la rouvrir).

Si tu ajoutes un fichier à l'appli, ajoute-le aussi à la liste `FILES` de `sw.js`.

## Ajouter l'appli à l'écran d'accueil de l'iPhone

1. Ouvrir l'adresse GitHub Pages dans **Safari** (pas Chrome : sur iOS, l'ajout
   en PWA se fait depuis Safari).
2. Toucher le bouton **Partager** (carré avec une flèche vers le haut).
3. Choisir **Sur l'écran d'accueil**, garder le nom « Budget », puis **Ajouter**.
4. Lancer l'appli depuis son icône : elle s'ouvre en plein écran.

Après cette première ouverture, elle fonctionne aussi en mode avion.

⚠️ Sur iPhone, les données de l'appli installée sont séparées de celles de Safari,
et iOS peut les effacer si l'appli n'est pas ouverte pendant longtemps.
**Exporte régulièrement tes données** (Réglages → Exporter mes données : la feuille
de partage permet de les enregistrer dans Fichiers ou de se les envoyer).
Un rappel s'affiche dans les Réglages si le dernier export date de plus de 30 jours.

## Règles de calcul

- Les montants sont stockés en centimes entiers ; l'arrondi ne se fait qu'à l'affichage.
- Les semaines vont du lundi au dimanche, coupées aux limites du mois.
- Budget prévu d'une semaine S (fixe) : `budget du mois × jours de S / jours du mois`.
- **Pas de report** : ce qui est économisé ou dépassé une semaine s'affiche
  (`+129,00 €` en vert, `−57,00 €` en rouge) mais ne change pas le budget des
  semaines suivantes.
- Semaine en cours : reste = prévu − dépenses de la semaine ; par jour = reste / jours
  restants dans la semaine (aujourd'hui compris).

## Format des données

Une seule clé `localStorage` : `budget-app-data`, contenant le JSON décrit dans le
brief (`version`, `defaultBudget`, `monthlyBudgets`, `tags`, `expenses`), plus deux
champs pratiques : `lastTagId` (dernier tag utilisé, présélectionné à la saisie) et
`lastExportAt` (date du dernier export). Le champ `version` sert aux migrations
futures (voir `migrate()` dans `storage.js`).
