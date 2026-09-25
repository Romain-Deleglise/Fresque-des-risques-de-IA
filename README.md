# La Fresque des risques de l'IA

Site et outils de **La Fresque des risques de l'IA** : un atelier collaboratif de
38 cartes (environ 2 h) pour comprendre ensemble les enjeux de l'intelligence
artificielle, sans prérequis technique. Adapté de la Fresque de la sécurité de
l'IA du [CeSIA](https://www.securite-ia.fr/), inspiré de la
[Fresque du Climat](https://fresqueduclimat.org/), porté par
[Pause IA](https://pauseia.fr/).

En ligne : **https://fresquedesrisquesdelia.org**

> 📘 **Documentation technique complète** : [`docs/DOCUMENTATION.md`](docs/DOCUMENTATION.md)
> (architecture, pages, fonctions serverless, e-mails, modèle de données,
> déploiement, sécurité, variables d'environnement, conventions).

## En bref

Le projet est fait de **briques indépendantes** (le site survit à une panne d'un
service) :

1. **Site vitrine statique** (`site/`) : accueil, à propos, animer, participer,
   Fresque en ligne, guide, mentions légales. 100 % statique, aucun framework.
2. **Programmation d'ateliers** : liste publique, inscriptions et e-mails
   transactionnels (fonction `ateliers` + Resend).
3. **Fresque en ligne** : tableau collaboratif multi-participants via la fonction
   `fresque` et Netlify Blobs (pool commun de cartes, flèches, notes, curseurs en
   direct, temps réel par « hold-poll »).
4. **Services auto-hébergés** (`infra/`) : visioconférence Jitsi et relais de
   curseurs WebSocket, sur le serveur Pause IA, tous deux optionnels.
5. **Extras** : registre de contacts + espace `/admin/`, newsletter (CiviCRM),
   mesure d'audience sans cookie.

Principes : sobriété, vie privée par défaut (aucun cookie ni traceur tiers),
CSP stricte (aucune requête externe), accessibilité WCAG 2.1 AA, bilingue FR/EN.

## Lancer en local

Le site est 100 % statique :

```bash
cd site && python3 -m http.server 8000
# http://localhost:8000
```

Les fonctions serverless nécessitent la Netlify CLI (`netlify dev`) pour router
`/.netlify/functions/*`.

## Tests

```bash
npm test        # règles pures + garde-fous + ateliers + validation cartes.json
```

Détail : validation de `cartes.json` (39 entrées, 0..38, une carte intro),
règles des sessions, limitation de débit, règles des ateliers. Un audit
d'accessibilité (axe-core + Playwright) tourne aussi en CI.

## Contenu des cartes

Toutes les cartes vivent dans la source unique **`site/data/cartes.json`**
(titre, verso, lot, chemins d'images). Pour corriger un texte, éditez la ligne
concernée : aucune compilation. Voir la doc, section « Les cartes », pour la
génération des visuels et du PDF imprimable.

## Alertes « prochains ateliers »

Une personne qui a assisté à un atelier, ou qui n'en a pas trouvé près de chez
elle, peut demander à être prévenue. La promesse est étroite et tenue par le
code, pas par la bonne volonté :

- **au plus un e-mail par semaine** et par personne, quel que soit le nombre
  d'ateliers ;
- **rien à annoncer = rien d'envoyé.** Pas de « rien cette semaine » ;
- **tout dans le même message** : les ateliers en ligne et ceux de chaque
  département choisi.

Qui reçoit quoi, exhaustivement (table de vérité vérifiée par
`serveur/tests/alertes.test.mjs`) :

| Choix de la personne | Atelier en ligne | Atelier dans son rayon | Atelier plus loin |
| --- | --- | --- | --- |
| En ligne **et** près de chez moi | reçoit | reçoit | rien |
| En ligne uniquement | reçoit | rien | rien |
| Près de chez moi uniquement | rien | reçoit | rien |

Sont en plus écartés : les ateliers privés, passés, complets, ou à plus de
60 jours.

**Communes : liste fermée, et un rayon.** Les deux côtés — le formulaire
d'abonnement (`/participer/#alertes`) et celui de programmation d'un atelier —
font choisir une commune dans les **34 875 communes françaises** (code INSEE,
source : Code officiel géographique de l'INSEE). Aucune saisie libre n'est
acceptée : « Lyon », « lyon » et « Lyon 7e » ne se rencontreraient jamais.

La comparaison se fait ensuite sur les **distances**, pas sur les noms : exiger
la commune exacte ferait rater à quelqu'un de Villeurbanne l'atelier de Lyon, à
quatre kilomètres.

Le rayon par défaut **s'adapte à la commune** : 50 km autour de Paris, c'est
Melun ; 50 km en Lozère, c'est deux bourgs. `scripts/generer-communes.mjs`
calcule pour chaque commune le plus petit rayon parmi 15 / 30 / 50 / 100 km qui
met ~800 000 personnes à portée. Le seuil est volontairement généreux : au
démarrage il y aura peu d'ateliers, mieux vaut un peu trop large que rien
pendant six mois. La personne peut toujours le changer.

Les coordonnées restent **côté serveur** (`serveur/src/communes-coords.txt`) ;
le navigateur ne charge que `site/data/communes.txt` (nom, code, code postal,
rayon proposé), et seulement au moment où quelqu'un cherche sa commune.

Régénérer après une fusion de communes : `node scripts/generer-communes.mjs`
(demande un accès réseau ; les fichiers produits sont versionnés).

Désabonnement en un clic depuis le lien en bas de chaque message
(`/alertes/?d=<jeton>`) : l'adresse est **effacée**, pas désactivée.

Envoi hebdomadaire : fonction planifiée `alertes-envoi` (mardi 9 h UTC, voir
`netlify.toml`). L'espace d'administration affiche le nombre d'abonnés et le
classement des communes en attente, ce qui indique où programmer le
prochain atelier.

## Espace d'administration

`/admin/`, ouvert par `ADMIN_TOKEN`. La clé n'est gardée que le temps de
l'onglet. On y trouve :

- les **contacts** (suivi, export CSV, désinscription et effacement RGPD) ;
- les **retours et témoignages** déposés sur `/retour/` et `/temoignage/`.
  Publier un témoignage l'affiche sur la page d'accueil — un test le vérifie,
  parce que cette chaîne a déjà été cassée une fois : le bouton marquait le
  témoignage sans rien changer à la page ;
- les **alertes** : nombre d'abonnés et classement des communes en attente ;
- les **ateliers programmés**, publics comme privés, à venir comme passés.
  L'équipe peut en **annuler** un : l'animateur·ice et les inscrit·es sont
  prévenu·es par le circuit d'e-mails existant, pas par un second recopié à
  côté (`netlify/functions/ateliers.js` l'exporte) ;
- les **animateur·ices à relancer** : ont animé au moins une fois, rien depuis
  plus de quatre mois, et rien de prévu. Relancer quelqu'un qui anime dans dix
  jours est le meilleur moyen de passer pour un robot, donc un atelier à venir
  suffit à l'exclure. Au plus une relance par personne et par semestre : la
  date est écrite avant l'envoi, pour qu'un plantage entre les deux ne relance
  jamais deux fois. Règles dans `serveur/src/animateurs.js`, testées.

## Déploiement

Hébergé sur **Netlify** : `publish = "site"`, fonctions dans
`netlify/functions/`, fonctions planifiées (rappels) via `netlify.toml`. Un merge
sur `main` déclenche le déploiement. Les **secrets** (Resend, CiviCRM) sont en
variables d'environnement Netlify, jamais dans le dépôt (liste dans la doc).

## Signaler un bug

Ouvrez une [issue GitHub](https://github.com/romain-deleglise/fresque-des-risques-de-ia/issues)
ou écrivez à [contact@pauseia.fr](mailto:contact@pauseia.fr).

## Licences

- **Code** : [GPL-3.0](LICENSE).
- **Contenus** (cartes, textes, guide) : [CC BY-SA 4.0](LICENSE-CONTENUS).
  Attribution : « Adapté du CeSIA, inspiré de la Fresque du Climat ».
