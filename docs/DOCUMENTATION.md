# Documentation technique - La Fresque des risques de l'IA

Documentation complète du site web et de ses services, à destination des
mainteneur·es et contributeur·ices. Elle décrit l'architecture, chaque page,
chaque fonction serverless, le modèle de données, les e-mails, le déploiement,
la sécurité et les conventions du projet.

> Convention d'écriture du projet : **pas de tirets longs** (« tiret cadratin »)
> dans le code, les contenus ou cette documentation. On utilise le tiret simple,
> les deux-points ou les parenthèses.

---

## 1. Présentation

**La Fresque des risques de l'IA** est un atelier collaboratif de 38 cartes
(environ 2 heures) pour comprendre ensemble les enjeux de l'intelligence
artificielle, sans prérequis technique. Les participant·es relient les cartes
sur un grand tableau pour dresser une vue d'ensemble : comment l'IA fonctionne,
ce qu'elle sait faire, ses impacts, ses risques et les solutions disponibles.

- **Porté par** : l'association [Pause IA](https://pauseia.fr/).
- **Filiation** : adapté de la Fresque de la sécurité de l'IA du CeSIA,
  inspiré de la Fresque du Climat.
- **Domaine** : `fresquedesrisquesdelia.org` (le `.fr` redirige vers le `.org`).
- **Bilingue** : français (par défaut) et anglais (`/en/`).

Le site remplit trois missions :

1. **Faire connaître** l'atelier et donner envie d'y participer ou de l'animer.
2. **Distribuer le matériel libre** : le jeu de cartes (PDF) et le guide d'animation.
3. **Outiller les ateliers** : programmation d'ateliers avec inscriptions et
   e-mails, et un tableau collaboratif pour animer à distance.

---

## 2. Architecture d'ensemble

Le projet est conçu en **briques indépendantes** : si un service tombe, le reste
du site continue de fonctionner (dégradation progressive systématique).

```
Navigateur (HTML/CSS/JS statiques, aucune dépendance runtime)
        │
        │  fetch (même origine uniquement, CSP stricte)
        ▼
Fonctions serverless Netlify (/.netlify/functions/*)
        │
        ├── Netlify Blobs  (état : ateliers, sessions, audience, limites)
        ├── Resend         (envoi d'e-mails transactionnels)
        └── CiviCRM        (inscriptions newsletter)
```

- **Front** : site 100 % statique (aucun framework, aucune étape de build).
  Servi tel quel par Netlify depuis le dossier `site/`.
- **Back** : fonctions serverless Node (CommonJS) dans `netlify/functions/`.
  Le serveur est l'autorité ; le client n'a jamais de secret.
- **État** : [Netlify Blobs](https://docs.netlify.com/blobs/overview/) (stockage
  clé/valeur), jamais de base de données à administrer.
- **Règles métier pures** : dans `serveur/src/` (aucune I/O), testées avec
  `node --test`, réutilisées par les fonctions.

### Principes directeurs

- **Sobriété** : design volontairement simple, « non-IA », rapide.
- **Vie privée par défaut** : aucun cookie, aucun traceur tiers, données minimales.
- **CSP stricte** : aucune requête vers un domaine tiers (polices, scripts et
  images sont auto-hébergés). Vérifié en CI.
- **Accessibilité** : WCAG 2.1 AA, audité en CI (axe-core).
- **Bilingue** intégral FR/EN avec `hreflang`.

---

## 3. Pile technique

| Domaine | Choix |
|---|---|
| Front | HTML + CSS + JavaScript « vanilla », aucun framework, aucun bundler |
| Thème | Variables CSS (`custom properties`), clair/sombre (système + bascule) |
| Polices | Auto-hébergées en `.woff2` : Saira Condensed (titres), Montserrat (UI), Roboto Slab (texte) |
| Back | Fonctions Netlify (Node 20, CommonJS `exports.handler`) |
| État | Netlify Blobs (`@netlify/blobs`) |
| E-mail | Resend (HTTP API) via `lib/mail.js` |
| Newsletter | CiviCRM API4 via `subscribe.js` |
| Visio auto | Jitsi Meet (`meet.jit.si`), salon généré à la volée |
| Tests | `node --test` (règles pures) + validation `cartes.json` + audit a11y |
| CI | GitHub Actions (`.github/workflows/ci.yml`) |
| Hébergement | Netlify (site statique + functions + scheduled functions) |
| Licence code | GPL-3.0 · Licence contenus : CC BY-SA 4.0 |

---

## 4. Arborescence du dépôt

```
.
├── site/                     # Tout ce qui est publié (racine web Netlify)
│   ├── index.html            # Accueil FR
│   ├── a-propos/             # À propos FR
│   ├── devenir-animateur/    # « Animer » FR
│   ├── demander-un-atelier/  # « Participer » FR (liste + programmation)
│   ├── guide/                # Guide d'animation en ligne FR
│   ├── mentions-legales/     # Mentions légales FR
│   ├── en-ligne/             # Fresque en ligne (présentation)
│   │   ├── session/          # Lobby + tableau multi-participants
│   │   └── atelier/          # Tableau solo (démo, sans réseau)
│   ├── en/                   # Toutes les pages en anglais (about, facilitate,
│   │                         #   request-a-workshop, guide, legal, online)
│   ├── stats/                # Tableau de bord d'audience (privé)
│   ├── assets/
│   │   ├── css/              # site.css, fonts.css, stats.css
│   │   ├── js/               # cartes, ateliers, nav, mesure, newsletter, stats
│   │   ├── fonts/            # .woff2 auto-hébergés
│   │   └── img/              # cartes/, cartes-hd/, cartes-verso/, social/, cc/
│   ├── data/                 # cartes.json (+ schéma), config.json
│   ├── telechargements/      # PDF cartes + guide animateur
│   ├── robots.txt, sitemap.xml
│
├── netlify/functions/        # Fonctions serverless
│   ├── ateliers.js           # Programmation, inscription, annulation, déplacement
│   ├── fresque.js            # Sessions temps réel (tableau partagé)
│   ├── rappels.js            # Rappel la veille (planifié)
│   ├── rappel-imminent.js    # Rappel ~1 h avant (planifié)
│   ├── suivi.js              # E-mail de suivi après l'atelier (planifié)
│   ├── collect.js / stats.js # Mesure d'audience sans cookie
│   ├── subscribe.js          # Inscription newsletter -> CiviCRM
│   └── lib/
│       ├── mail.js           # Envoi Resend (gracieux sans clé)
│       └── gabarit.js        # Gabarit HTML commun des e-mails
│
├── serveur/
│   ├── src/                  # Règles PURES (aucune I/O) : ateliers, regles, limites
│   └── tests/                # node --test
│
├── scripts/
│   ├── valider-cartes.mjs    # Valide cartes.json (39 entrées, 0..38, 1 intro)
│   ├── generer-cartes-web.py # Génère les WebP des cartes depuis les PDF (ghostscript + Pillow)
│   ├── generer-planche.py    # Planche d'impression A4 (pikepdf + compression)
│   ├── generer-images.py     # Ancien générateur WebP (sources image, Pillow)
│   └── audit-a11y.mjs        # Audit accessibilité (axe-core + Playwright)
│
├── contenus/                 # Sources des cartes (PDF, illustrations) - non publié
├── netlify.toml              # Config Netlify (publish, functions, headers, cron)
├── package.json              # Scripts de test, dépendance @netlify/blobs
├── .github/workflows/ci.yml  # CI
├── README.md, CONTRIBUTING.md
└── LICENSE (GPL-3.0), LICENSE-CONTENUS (CC BY-SA 4.0)
```

---

## 5. Le site vitrine

### 5.1 Pages

Chaque page FR a son équivalent EN sous `/en/`. Le menu principal comporte
quatre entrées plus le bouton Télécharger.

| Page | URL FR | URL EN | Rôle |
|---|---|---|---|
| Accueil | `/` | `/en/` | Pitch, cartes en avant (hero), aperçu des prochains ateliers, galerie |
| À propos | `/a-propos/` | `/en/about/` | Ce qu'est la Fresque, origine, Pause IA, licence, newsletter, contact |
| Animer | `/devenir-animateur/` | `/en/facilitate/` | Rôle de l'animateur, guide, présentiel/en ligne, lien pour programmer |
| Participer | `/demander-un-atelier/` | `/en/request-a-workshop/` | Liste des ateliers + formulaire de programmation (bascule) |
| Fresque en ligne | `/en-ligne/` | `/en/online/` | Présentation de l'outil (session en direct / solo) |
| Guide | `/guide/` | `/en/guide/` | Guide d'animation en ligne |
| Mentions légales | `/mentions-legales/` | `/en/legal/` | Mentions, hébergeur, données, licence |
| Tableau solo | `/en-ligne/atelier/` | (idem) | Démo du tableau, jouable sans compte ni réseau |
| Session | `/en-ligne/session/` | (idem) | Lobby + tableau multi-participants |
| Stats | `/stats/` | - | Tableau de bord d'audience (non listé, protégeable par clé) |

Note sur le parcours : « Participer » = rejoindre un atelier ; « Animer » = le hub
pour conduire un atelier (présentiel, en ligne, ou programmer) ; « Fresque en
ligne » = l'outil utilisé le jour J. La page Participer héberge à la fois la
liste publique et le formulaire de programmation, via une bascule à deux boutons.

### 5.2 Système de design (`assets/css/site.css`)

Le design repose entièrement sur des **variables CSS** définies sur `:root`,
redéfinies pour le thème sombre.

- **Thème** : trois états. Par défaut on suit `prefers-color-scheme` ; un
  attribut `data-theme="dark|light"` (bascule utilisateur, mémorisée en
  `localStorage`) l'emporte. Voir le bouton de thème dans l'en-tête.
- **Couleurs clés** : `--accent` orange `#E8811C` (décor), `--accent-txt`
  `#B0560A` (texte/boutons, contraste AA), neutres chauds (`--bg`, `--surface`,
  `--ink`, `--ligne`), sémantiques `--ok` / `--err`.
- **Typographie** : `--f-titre` Saira Condensed, `--f-ui` Montserrat,
  `--f-texte` Roboto Slab. Repli système déclaré pour chaque.
- **Composants** notables : `.btn` (variantes `.btn-1` orange, `.btn-2` contour,
  `.btn-noir`), `.hero` + `.pile` (cartes empilées en éventail, retournement au
  clic), `.galerie`/`.gc`, `.atelier-carte` (carte d'atelier de la liste),
  `.form-atelier` (formulaire de programmation), `.ateliers-vide` (état vide
  actionnable).
- **Responsive** : point de rupture principal à 860 px (empilement du hero et de
  la navigation en menu « hamburger »).

### 5.3 JavaScript client (`assets/js/`)

Tous les scripts appliquent l'**amélioration progressive** : sans JS, le contenu
reste lisible et navigable.

| Fichier | Rôle |
|---|---|
| `cartes.js` | Hero : retournement des cartes (recto/verso). Galerie : construite depuis `data/cartes.json`. Le verso du hero est en dur pour ne dépendre d'aucun réseau. |
| `ateliers.js` | Page Participer : liste des ateliers (op `liste`), inscription (op `inscrire`), bascule Participer/Programmer, formulaire de programmation (op `programmer`), formulaires Annuler et Déplacer, gestion des liens `?annuler=`, `?desister=`. Bilingue via `document.documentElement.lang`. |
| `nav.js` | Menu mobile (hamburger). Ajoute la classe `js-nav` ; sans JS le menu reste visible. |
| `mesure.js` | Mesure d'audience sans cookie : envoie une vue de page anonyme à `collect`. Un simple drapeau de session par onglet, aucun `localStorage` persistant. |
| `newsletter.js` | Formulaire newsletter (À propos) -> fonction `subscribe` -> CiviCRM. |
| `stats.js` | Tableau de bord `/stats/` : lit les agrégats via `stats`. |

Les pages du tableau en ligne ont leurs propres scripts (voir section 11) :
`en-ligne/atelier/board.js` (solo) et `en-ligne/session/session.js` (multi).

### 5.4 Assets

- **Polices** : `assets/fonts/*.woff2` (auto-hébergées, `font-display: swap`,
  `preload` de la police de titre sur l'accueil).
- **Images des cartes** : voir section 6.
- **Réseaux sociaux / favicon** : `assets/img/social/` (`favicon.png`,
  `apple-touch-icon.png`, `partage.jpg` pour Open Graph).
- **Badges Creative Commons** : `assets/img/cc/` (cc, by, sa) auto-hébergés
  pour l'attribution, sans requête externe.

---

## 6. Les cartes

### 6.1 Source unique : `site/data/cartes.json`

Toutes les cartes (contenus et chemins d'images) vivent dans ce fichier unique,
validé par un schéma (`cartes.schema.json`) et par la CI. Structure d'une carte :

```json
{
  "n": 14,                     // numéro (0..38 ; 0 = carte d'introduction)
  "intro": false,              // true seulement pour la carte 0
  "lot": 3,                    // lot de distribution (1 à 5)
  "titre": "Deepfake",
  "verso": ["Texte explicatif..."],
  "image": {
    "vignette": "assets/img/cartes/14-560.webp",       // recto 560 px
    "grand":    "assets/img/cartes/14-900.webp",       // recto 900 px
    "carte":    "assets/img/cartes-hd/14.webp",        // recto HD
    "verso": {                                          // idem pour le dos
      "vignette": "assets/img/cartes/14-verso-560.webp",
      "grand":    "assets/img/cartes/14-verso-900.webp",
      "carte":    "assets/img/cartes-verso/14.webp"
    }
  }
}
```

- **39 cartes au total** : 1 carte d'introduction (n° 0) + 38 cartes de jeu.
- **5 lots** de distribution, qui rythment l'atelier.
- Validation : `node scripts/valider-cartes.mjs` (39 entrées, numéros 0..38
  uniques, exactement une carte `intro`).

### 6.2 Génération des visuels

Les visuels web sont dérivés des cartes finales (PDF 2 pages recto/verso par
carte, dans `contenus/cartes/`). Pour chaque carte on produit, en WebP :

- recto/verso `560` et `900` px (`assets/img/cartes/`),
- recto HD (`assets/img/cartes-hd/`),
- verso HD (`assets/img/cartes-verso/`).

Rendu haute définition (DPI 320, qualité WebP 95) pour que le texte du verso
reste net et sans halo sur les fonds noirs. Script :
`scripts/generer-cartes-web.py` (ghostscript + Pillow, lit les PDF de
`contenus/cartes/`). Le script historique `scripts/generer-images.py` (Pillow,
sources image aplaties sur blanc) est conservé pour référence.

### 6.3 Téléchargements (`site/telechargements/`)

- `fresque-des-risques-de-l-ia-cartes.pdf` : **planche d'impression** A4,
  4 cartes par feuille, recto/verso en vis-à-vis pour une impression duplex
  « bord long » (20 pages, ~6 Mo). Généré par `scripts/generer-planche.py`
  (imposition pikepdf + compression JPEG q97). Une marge de sécurité entoure
  la planche pour éviter le rognage haut/bas à l'impression « taille réelle ».
- `guide-animateur-fresque-des-risques-de-l-ia.pdf` : guide d'animation.

Le bouton « Télécharger » de la navigation pointe directement sur le PDF des
cartes (téléchargement immédiat), avec la consigne d'impression sous le bouton
du hero.

---

## 7. Fonctions serverless (`netlify/functions/`)

Toutes reçoivent un POST JSON `{ op, ... }` (sauf `stats`, en GET), répondent en
JSON, et appellent `connectLambda(event)` en tête de handler (nécessaire à
Netlify Blobs sur les fonctions classiques). Seule `fresque.js` lit en
`consistency: "strong"` (indispensable au temps réel : voir 7.2), avec repli
automatique en lecture normale si la plateforme la refuse.

### 7.1 `ateliers.js` - programmation et inscriptions

Magasin Blobs : `fresque-ateliers`. Règles pures : `serveur/src/ateliers.js`.

| Op | Entrée | Effet |
|---|---|---|
| `programmer` | mode, prénom/mail animateur, date, heure, max, visibilité, (lieu/adresse), (titre), (visioMode/visioUrl) | Crée l'atelier, génère un code de session, envoie l'e-mail de confirmation + invitation `.ics` |
| `liste` | - | Renvoie les ateliers publics visibles au calendrier (7 j après le début), chacun avec un drapeau `ouvert` |
| `voir` | code | Renvoie la fiche d'UN atelier, même privé : c'est le lien de participation (`?atelier=CODE`) qui fait office de laissez-passer. Limité en débit, avec un compteur dédié aux codes inconnus |
| `inscrire` | code, prénom, mail | Inscrit un·e participant·e (jusqu'à 30 min après le début), envoie confirmation + notifie l'animateur. Fonctionne aussi pour un atelier privé : le code, connu par le lien de participation, fait office de laissez-passer |
| `annuler` | code, token OU mail animateur | Supprime l'atelier, prévient les inscrit·es |
| `reprogrammer` | code, token/mail, nouvelle date/heure | Déplace l'atelier, réinitialise les rappels, prévient les inscrit·es avec un nouvel `.ics` |
| `desister` | code, token participant | Retire un·e participant·e, confirme + notifie l'animateur |

Règles temporelles importantes :

- **Inscription** possible jusqu'à **+30 min** après le début (`inscriptionOuverte`).
- **Affichage au calendrier** conservé jusqu'à **7 jours** après le début
  (`visibleCalendrier`) : les ateliers passés restent visibles (grisés, badge
  « Passé », sans bouton Participer). L'aperçu d'accueil ne montre que les
  ateliers à venir ; la page Participer (attribut `data-passes`) montre aussi
  les récents passés.

Visioconférence : `visioMode` vaut `auto` (salon Jitsi généré :
`https://meet.jit.si/FresqueRisquesIA-<code>-<jeton aléatoire>`), `perso` (lien
fourni par l'animateur, validé) ou `aucune`.

### 7.2 `fresque.js` - sessions temps réel

Magasin Blobs : `fresque-sessions`. Règles pures : `serveur/src/regles.js`.
Le serveur est l'autorité.

**Propagation temps réel** (trois mécanismes qui se cumulent, chacun facultatif) :

1. **Lectures en cohérence forte** (`consistency: "strong"`). Par défaut, Blobs
   sert des lectures éventuellement cohérentes : après l'écriture de A, la
   lecture de B pouvait renvoyer l'ancienne valeur pendant plusieurs secondes.
   C'était la cause des ~5 s de latence sur toutes les actions. Repli
   automatique en lecture normale si la plateforme la refuse.
2. **Attente maintenue** (« hold-poll ») : l'op `etat` garde la requête ouverte
   jusqu'à un changement de version (relecture toutes les 120 ms, 8 s max).
3. **Pousse WebSocket** : après chaque action, le client émet un `{t:"maj"}` sur
   le relais (`infra/curseurs/`) ; les autres relisent l'état immédiatement.

Côté client, toute action est en plus rendue **localement d'abord** (optimistic
UI) : celui qui agit ne dépend jamais d'un aller-retour pour voir son geste.

À l'ouverture d'un atelier programmé (code réservé), le lien de visioconférence
de l'atelier est repris dans la session (`lienVocal`), pour que l'animateur le
retrouve dans le panneau Participants sans rouvrir son e-mail.

| Op | Entrée | Sortie |
|---|---|---|
| `creer` | prénom, (code souhaité) | code, jeton, rôle animateur, état |
| `rejoindre` | code, prénom, jeton | jeton, rôle, état (reprise si jeton connu) |
| `etat` | code, jeton, version | état, ou `{ inchange: true }` |
| `agir` | code, jeton, intention | état, ou `{ refus }` |

Cycle de vie d'une session : 12 h d'existence maximum, expiration après 2 h
d'inactivité. Codes à 6 caractères alphanumériques, jetons personnels à 24
caractères.

**Le code de session est purement technique.** Il vit dans les URL et dans
l'état serveur ; il n'est affiché nulle part, ni dans les e-mails, ni sur le
site, et n'est jamais demandé à quiconque. Tout passe par des liens :

| Lien | Pour qui | Effet |
|---|---|---|
| `/en-ligne/session/?ouvrir=CODE&prenom=…` | Animateur | Ouvre (ou reprend) SA session |
| `/en-ligne/session/?code=CODE&prenom=…` | Participant | Rejoint la session |
| `/en-ligne/session/?s=CODE` | Tous | Reprise de sa place après rechargement |
| `/participer/?atelier=CODE` | Invité | Inscription à un atelier, même privé |
| `/participer/?gerer=CODE#gerer` | Animateur | Déplacer / annuler (e-mail à saisir) |
| `/participer/?annuler=CODE&t=…` | Animateur | Annulation en un clic |
| `/participer/?desister=CODE&p=…` | Participant | Désinscription en un clic |

Conséquences côté interface : la barre du haut de la session ne montre plus de
puce « Code », seulement « Copier le lien d'invitation » ; les champs code du
lobby sont des `input type="hidden"` remplis depuis l'URL, et sans lien la
colonne « Rejoindre » n'affiche qu'une note renvoyant à l'e-mail ; sur la page
Participer, « Gérer un atelier existant » est un bloc replié dont les
formulaires ne demandent que l'e-mail.

### 7.3 Fonctions planifiées (cron dans `netlify.toml`)

| Fonction | Fréquence | Rôle |
|---|---|---|
| `rappels.js` | `0 8 * * *` (1×/jour) | Rappel la veille (fenêtre ~26 h), e-mail à l'animateur + participants (Cci) |
| `rappel-imminent.js` | `*/15 * * * *` | Rappel ~1 h avant (fenêtre 40-80 min) |
| `suivi.js` | `0 10 * * *` (1×/jour) | Après l'atelier (3 h à 3 j), remercie et invite à devenir animateur·ice |

Chacune est idempotente (drapeau posé après envoi : `rappelEnvoye`,
`rappelHeureEnvoye`, `suiviEnvoye`) et ne fait rien sans `RESEND_API_KEY`.

### 7.4 Audience : `collect.js` / `stats.js`

Mesure d'audience **sans cookie ni traceur**, même origine. `collect` reçoit une
vue de page anonyme et l'agrège par jour dans le magasin `audience` (aucune IP
stockée, aucun identifiant de visiteur : exemptée de consentement CNIL).
`stats` (GET) lit les agrégats ; l'accès peut être protégé par `AUDIENCE_KEY`.

### 7.4b Contacts et administration : `admin.js` (+ `lib/contacts.js`)

Registre durable des contacts, séparé des ateliers (qui sont purgés 7 j après
leur date). `lib/contacts.js` tient le magasin Blobs `fresque-contacts` : une
entrée par e-mail (clé = empreinte SHA-256 de l'adresse), alimentée par
`ateliers.js` à la programmation (rôle animateur·ice) et à l'inscription (rôle
participant·e), en **best-effort** (une panne du registre ne bloque jamais une
inscription). Chaque entrée garde le prénom, les rôles, le nombre d'ateliers,
les dates de premier/dernier contact, l'historique (borné) et un indicateur de
désinscription.

`admin.js` est l'API de l'espace `/admin/`, **protégée par `ADMIN_TOKEN`**
(comparaison à temps constant ; sans la variable, la fonction renvoie 503). Elle
fournit les statistiques agrégées (nombre d'ateliers, animateur·ices,
participant·es, répartition en ligne/présentiel, ateliers par mois), la liste
des contacts, l'export CSV, et la désinscription/effacement d'un contact (droits
RGPD). La page `site/admin/` (non indexée, `Disallow` dans `robots.txt`) affiche
un tableau de bord ; sa clé est saisie à la connexion et gardée le temps de
l'onglet. Base légale : intérêt légitime, avec mention au moment de la collecte
et effacement sur demande (voir les mentions légales).

### 7.5 Newsletter : `subscribe.js`

Inscrit une adresse à la newsletter via l'API4 de **CiviCRM** (même origine,
aucune requête tierce côté navigateur). Deux groupes possibles (Fresque et
Pause IA). Dégradation propre si le service est indisponible.

### 7.6 Bibliothèques : `lib/mail.js` et `lib/gabarit.js`

- `mail.js` : envoi via **Resend** (POST `api.resend.com/emails`). Sans
  `RESEND_API_KEY`, les actions réussissent quand même (le code s'affiche à
  l'écran) : `configuree()` indique si l'envoi est possible. Gère `html`,
  `text`, `bcc` et pièces jointes (base64, pour les `.ics`).
- `gabarit.js` : gabarit HTML commun des e-mails (en-tête orange, carte blanche,
  pied Pause IA), plus les utilitaires `h` (échappement), `dateLisible`
  (date française), `mailHtml`, `bouton`.

---

## 8. Règles métier pures (`serveur/src/`)

Aucune I/O, donc entièrement testables et réutilisables. Exports principaux :

- `ateliers.js` : `valider`, `validerInscription`, `annulationAutorisee`,
  `validerReprogrammation`, `retraitParticipant`, `inscriptionOuverte`,
  `visibleCalendrier`, `vuePublique`, `vueConfirmation`, `urlValide`.
- `regles.js` : logique des sessions temps réel (`creer`, `rejoindre`,
  `appliquer`, `vue`, `prochainDestinataire`, `nouveauCode`, `jetonAleatoire`).
- `limites.js` : garde-fous de limitation de débit par IP (fenêtres glissantes).

Tests : `serveur/tests/*.test.mjs` (`node --test`). Couvre notamment la
validation de programmation, les plafonds de participants, la fermeture des
inscriptions à +30 min, la fenêtre calendrier de 7 j, le lien visio (auto/perso),
l'annulation, la reprogrammation et la désinscription.

---

## 9. Modèle de données (Netlify Blobs)

### Atelier (`fresque-ateliers`, clé `atelier:<CODE>`)

```
{
  code, mode ("enligne"|"physique"), titre,
  animateur: { prenom, mail },
  date ("YYYY-MM-DD"), heure ("HH:MM"), quandMs (timestamp),
  visibilite ("public"|"prive"), maxParticipants,
  lieu, adresse,                       // si physique
  visio,                               // URL (auto ou perso), optionnelle
  participants: [ { prenom, mail, le, token } ],
  annulToken,                          // secret animateur (annuler/déplacer)
  creeLe,
  rappelEnvoye, rappelHeureEnvoye, suiviEnvoye
}
```

### Session temps réel (`fresque-sessions`, clé `<CODE>`)

État partagé du tableau (cartes posées, liens, notes, participants, rôles,
salon vocal, version). Détails dans `serveur/src/regles.js`. TTL 12 h,
inactivité 2 h.

Les adresses e-mail ne sont **jamais** exposées dans les vues publiques
(`vuePublique` filtre) ni entre participant·es (rappels en Cci).

---

## 10. E-mails transactionnels

Tous partagent le gabarit `lib/gabarit.js` (en-tête orange, carte blanche, pied
Pause IA) et existent en version HTML + texte brut. **Aucun n'affiche de code** :
chaque destinataire reçoit le lien qui correspond à son rôle (voir 7.2).

**Un e-mail = un rôle.** Aucun envoi n'est mixte : quand un événement concerne
l'animateur·ice et les inscrit·es (rappels, déplacement, annulation), ce sont
deux e-mails distincts, avec un texte, un objet et des liens propres à chacun.
L'e-mail collectif part en **Cci seul** (`bcc` sans `to`) : `lib/mail.js` met
alors l'expéditeur comme destinataire visible, donc personne n'y voit l'adresse
de personne, pas même celle de l'animateur·ice.

| E-mail | Déclencheur | Destinataire | Contenu clé |
|---|---|---|---|
| Confirmation animateur | `programmer` | Animateur | Récap, bouton « Ouvrir ma session », lien de participation à partager, visio, guide, `.ics`, liens annuler/déplacer |
| Confirmation participant | `inscrire` | Participant | Récap, boutons rejoindre / visio / contacter l'animateur, `.ics`, désinscription |
| Notification inscription | `inscrire` | Animateur | Compteur d'inscrits, prénoms cliquables (mailto), bouton « écrire à tou·tes » (Cci) |
| Désinscription (participant) | `desister` | Participant | Confirmation + autres ateliers |
| Désinscription (animateur) | `desister` | Animateur | Compteur mis à jour |
| Annulation (animateur) | `annuler` | Animateur | Confirmation, nombre d'inscrit·es prévenu·es, bouton « Programmer un autre atelier » |
| Annulation (inscrit·es) | `annuler` | Inscrit·es (Cci seul) | Atelier annulé, autres ateliers |
| Déplacement (animateur) | `reprogrammer` | Animateur | Confirmation, compteur d'inscrits, « Ouvrir ma session », lien gérer, `.ics` |
| Déplacement (inscrit·es) | `reprogrammer` | Inscrit·es (Cci seul) | Ancienne/nouvelle date, bouton « Rejoindre », `.ics`, désinscription |
| Rappel veille (animateur) | planifié | Animateur | Liste des inscrit·es, « Ouvrir ma session », lien déplacer/annuler |
| Rappel veille (inscrit·es) | planifié | Inscrit·es (Cci seul) | Date, animateur·ice, bouton « Rejoindre », visio |
| Rappel 1 h (animateur) | planifié | Animateur | « Vous animez dans 1 heure », inscrit·es, « Ouvrir ma session » |
| Rappel 1 h (inscrit·es) | planifié | Inscrit·es (Cci seul) | « Ça commence bientôt », bouton « Rejoindre », visio |
| Suivi | planifié | Animateur + participants (Cci) | Remerciement + invitation à animer |

L'invitation calendrier (`.ics`) porte deux alarmes : `-P1D` (la veille) et
`-PT1H` (1 h avant), plus le lien visio comme `URL`.

**Contact avant l'atelier** : le participant peut écrire à l'animateur (bouton
mailto) ; l'animateur peut écrire à un·e inscrit·e (prénom cliquable) ou à tout
le groupe (adresses en copie cachée, pour ne pas exposer les participants entre
eux).

---

## 11. Fresque en ligne (tableau collaboratif)

Deux surfaces partagent la même feuille de style (`en-ligne/atelier/board.css`) :

- **Solo** (`en-ligne/atelier/`) : démo jouable sans compte ni réseau
  (`board.js`). Piochage, pose, liens, notes, zoom, plein écran, export image.
- **Multi** (`en-ligne/session/`) : lobby (créer / rejoindre) puis tableau
  partagé (`session.js`). Rôles animateur/participant, distribution des cartes,
  panneau participants, salon vocal (repris de l'atelier, ou saisi).

Temps réel (voir 7.2 pour le serveur) :

- **Rendu optimiste** : poser une carte, remplir / vider le pool, retirer une
  carte sont affichés localement avant la confirmation serveur.
- **Flèches** : dès le premier clic, une ligne élastique suit le curseur, chez
  soi et chez les autres ; les cartes montrent un halo d'accroche au survol en
  mode « lien ».
- **Frappe en direct** : libellés de flèche et notes s'affichent au fur et à
  mesure chez les autres (relais éphémère), l'enregistrement serveur est étalé.
- **Curseurs** : positions relayées et **interpolées** à chaque frame (plus de
  saccade) ; flèche et prénom cerclés de blanc pour rester lisibles sur tout
  fond ; masquables (bouton « Curseurs »).
- **Pool** : panneau flottant déplaçable et repliable, grille de **8
  emplacements fixes** (2 x 4), taille des cartes réglable, boutons
  « Remplir » / « Vider » pour l'animateur, glisser-déposer réserve <-> pool et
  pool -> tableau.
- **Réserve** (animateur) : jeu complet illustré, une rangée qui défile.
- **Thème** : le bouton « Fond noir » bascule **toute la page** (`data-theme`
  sur `<html>`, mémorisé sous la clé `theme` comme le reste du site).

Robustesse : le démarrage du tableau ne dépend pas d'un chargement unique sans
filet (réessais + message clair) ; le lobby est lisible en thème sombre.

Le branchement du service se configure dans `site/data/config.json`
(`serviceSessions.url` / `.actif`) sans recompiler le site.

---

## 12. Cycle de vie d'un atelier

```
Programmer (animateur)
   -> e-mail confirmation + .ics
   -> apparaît dans la liste publique (si "public")
Inscriptions (participants)   [ouvertes jusqu'à +30 min]
   -> e-mail participant + notif animateur
Rappels                        [veille, puis ~1 h avant]
Jour J : ouverture de la session en ligne (code) OU présentiel
Suivi                          [3 h à 3 j après]
Calendrier : atelier visible 7 j (grisé, "Passé"), puis retiré

À tout moment :
  Annuler (animateur)     -> prévient les inscrit·es
  Déplacer (animateur)    -> nouvelle date + prévient les inscrit·es
  Se désinscrire (participant) -> libère la place + notifie l'animateur
```

---

## 13. Internationalisation

- FR par défaut à la racine, EN sous `/en/`.
- Chaque page déclare `hreflang` (fr, en, x-default) et un `link rel="alternate"`.
- Les scripts client détectent la langue via `document.documentElement.lang`
  et embarquent leurs propres chaînes FR/EN (voir `ateliers.js`, `session.js`).
- Les e-mails et les cartes imprimées sont en français.

---

## 14. Accessibilité

- Cible **WCAG 2.1 AA**, audité en CI avec **axe-core** + Playwright sur toutes
  les pages (`scripts/audit-a11y.mjs`). Objectif : 0 violation.
- Focus visibles, contrastes tenus en clair et sombre, lien d'évitement,
  libellés de formulaire, régions `aria-live` pour les messages.
- Amélioration progressive : tout contenu essentiel est accessible sans JS.

Lancer l'audit en local :

```bash
python3 -m http.server 8099 --directory site &
PW_CHROMIUM=/chemin/vers/chromium BASE=http://localhost:8099 node scripts/audit-a11y.mjs
```

---

## 15. Sécurité et vie privée

- **CSP stricte** (en-têtes dans `netlify.toml`) : `default-src 'self'` ;
  aucun script, police ou image tiers. Vérifié en CI (échec si une URL
  `fonts.googleapis`, `cdn.` etc. apparaît dans `site/`).
- **En-têtes** : `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  no-referrer`, `frame-ancestors 'none'`.
- **Aucun cookie, aucun traceur** : la mesure d'audience est anonyme et agrégée.
- **Données minimales** : pour rejoindre une session, un simple prénom ; les
  sessions sont éphémères (12 h / 2 h d'inactivité). Les e-mails des
  participant·es ne sont jamais exposés (vues publiques filtrées, envois en Cci).
- **Limitation de débit** par IP (`serveur/src/limites.js`, magasin
  `fresque-limites`) sur la création et les inscriptions.
- **Secrets** : uniquement en variables d'environnement Netlify, jamais dans le
  dépôt (clé Resend, secrets CiviCRM).

---

## 16. Déploiement (Netlify)

`netlify.toml` :

- `publish = "site"`, `command = ""` (aucun build).
- `functions = "netlify/functions"`, bundler esbuild.
- Fonctions planifiées : `rappels` (`0 8 * * *`), `rappel-imminent`
  (`*/15 * * * *`), `suivi` (`0 10 * * *`).
- En-têtes de sécurité et de cache (CSS/JS revalidés, polices/images en cache 1 j).
- Redirections 301 du domaine `.fr` vers `https://fresquedesrisquesdelia.org`
  (http et https, avec et sans `www`).

Mise en ligne : un merge sur `main` déclenche le déploiement du dossier `site/`
et des fonctions. Le domaine `.org` est primaire (Netlify DNS) ; le `.fr` est un
alias qui redirige. Certificat Let's Encrypt géré par Netlify.

---

## 17. Variables d'environnement

À définir dans **Netlify -> Site settings -> Environment variables** (jamais
dans le dépôt) :

| Variable | Utilisée par | Rôle |
|---|---|---|
| `RESEND_API_KEY` | mail.js | Clé API Resend. Sans elle, aucun e-mail n'est envoyé |
| `MAIL_FROM` | mail.js | Expéditeur vérifié, ex. `Fresque des risques de l'IA <atelier@pauseia.fr>` |
| `MAIL_REPONSE` | mail.js | (optionnel) Reply-To, ex. `contact@pauseia.fr` |
| `SITE_URL` | ateliers, rappels, suivi | URL publique pour les liens des e-mails |
| `AUDIENCE_KEY` | stats.js | (optionnel) protège la lecture de `/stats/` |
| `ADMIN_TOKEN` | admin.js | Clé secrète de l'espace `/admin/`. Sans elle, l'espace est désactivé (503) |
| `CIVICRM_BASE_URL` | subscribe.js | URL du CRM Pause IA |
| `CIVICRM_API_KEY` | subscribe.js | Clé API CiviCRM |
| `CIVICRM_SITE_KEY` | subscribe.js | Clé de site CiviCRM |
| `CIVICRM_NEWSLETTER_GROUP_ID` | subscribe.js | Groupe « Fresque » (défaut 72) |
| `CIVICRM_PAUSEIA_GROUP_ID` | subscribe.js | Groupe « Pause IA » (défaut 3) |

---

## 18. Développement local

Le site est 100 % statique :

```bash
cd site && python3 -m http.server 8000
# http://localhost:8000
```

Les fonctions serverless ne tournent pas avec un simple serveur de fichiers.
Pour les tester en local, utiliser `netlify dev` (Netlify CLI), qui sert le site
et route `/.netlify/functions/*`.

Tests :

```bash
npm test        # règles + limites + ateliers + validation cartes.json
node --test serveur/tests/ateliers.test.mjs
node scripts/valider-cartes.mjs
```

Régénérer les visuels web des cartes : `scripts/generer-cartes-web.py` ;
la planche d'impression : `scripts/generer-planche.py`
(dépend de Pillow ; le rendu depuis les PDF utilise ghostscript).

---

## 19. Intégration continue (`.github/workflows/ci.yml`)

Sur chaque `push` (main) et `pull_request` :

1. **valider** : validation `cartes.json`, tests des règles de session, tests
   des garde-fous, et vérification qu'aucune requête tierce n'apparaît dans
   `site/` (CSP).
2. **accessibilite** : installe axe + Playwright + Chromium, sert le site, lance
   l'audit WCAG 2.1 A/AA.

---

## 20. Licences

- **Code** : GPL-3.0 (`LICENSE`).
- **Contenus** (cartes, guide, textes de la Fresque) : CC BY-SA 4.0
  (`LICENSE-CONTENUS`). Attribution requise : « Adapté du CeSIA, inspiré de la
  Fresque du Climat », présente en pied de page et mentions légales.

---

## 21. Conventions

- **Pas de tirets longs** nulle part (code, contenus, e-mails, docs).
- **Bilingue** : toute page/chaîne visible a sa version FR et EN.
- **Amélioration progressive** : rien ne casse sans JS ni sans service.
- **Aucune requête tierce** (CSP) : polices, scripts et images auto-hébergés.
- **Secrets** hors du dépôt, uniquement en variables d'environnement.
- **Règles métier pures** dans `serveur/src/`, testées, sans I/O.

---

## 22. Points d'attention et pistes

Opérationnel (hors code) :

- Définir les **variables d'environnement Netlify** (surtout `RESEND_API_KEY`,
  `MAIL_FROM`, `SITE_URL`) : sans elles, aucun e-mail ne part.
- **Tester en conditions réelles** la chaîne complète (programmer, s'inscrire,
  recevoir les e-mails, ouvrir/rejoindre la session).
- Vérifier que la fonction planifiée `rappel-imminent` (`*/15`) est bien acceptée
  dans Netlify -> Functions -> Scheduled.
- **Jitsi** : le salon public `meet.jit.si` peut, selon les périodes, demander au
  premier arrivant de s'authentifier. À valider ; solutions de repli : Framatalk
  ou instance Jitsi auto-hébergée.

Améliorations possibles :

- Retirer le badge « essai » de la Fresque en ligne après un test concluant.
- Ajouter une vraie photo d'atelier sur l'accueil
  (`assets/img/photos/atelier.jpg`, affichée seulement si présente).
- Intégrer un logo définitif (favicon, Open Graph) une fois la piste choisie.
- Le `README.md` d'origine décrit un état antérieur (service « à venir ») :
  cette documentation reflète l'état actuel et fait foi.

---

## 23. Glossaire

- **Atelier** : événement planifié (date, format, animateur), avec inscriptions.
- **Session** : instance temps réel du tableau partagé (un code, des rôles).
- **Lot** : groupe de cartes distribué à une étape de l'atelier (1 à 5).
- **Code de session** : identifiant technique à 6 caractères d'un atelier / d'une
  session. Il circule dans les URL et l'état serveur, il n'est jamais affiché ni
  demandé à l'utilisateur.
- **Jeton** : secret personnel (animateur : annuler/déplacer ; participant :
  reprise de session, désinscription).
- **Blobs** : stockage clé/valeur de Netlify utilisé comme état.
- **Cci** : copie cachée (les destinataires ne se voient pas entre eux).

---

*Documentation générée pour le dépôt de La Fresque des risques de l'IA (Pause IA).
Elle décrit l'état courant du code ; en cas de doute, le code et les tests font foi.*
