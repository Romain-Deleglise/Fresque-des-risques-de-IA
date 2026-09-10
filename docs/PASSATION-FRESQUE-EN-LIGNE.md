# Passation - Fresque en ligne (tableau collaboratif temps réel)

Document destiné à une autre IA / un·e développeur·se pour **poursuivre le travail
en autonomie**. Il décrit l'état du projet, les contraintes, comment tester, et
surtout la **liste priorisée des problèmes restants** (issus d'un vrai crash-test
en équipe) avec, pour chacun, la cause probable, les fichiers concernés et une
piste de correction.

> Convention absolue du projet : **aucun tiret long** (« — ») nulle part (code,
> contenu, commits, docs). Utiliser le tiret simple, les deux-points ou les
> parenthèses. Vérifier `grep -n "—"` avant chaque commit.

---

## 0. Démarrage rapide (contexte à lire en premier)

- **Architecture générale** : `README.md` + `docs/DOCUMENTATION.md` (à jour :
  pile, pages, fonctions serverless, modèle de données, e-mails, déploiement).
- **Site** : 100 % statique (`site/`), aucune étape de build. Back = fonctions
  Netlify (`netlify/functions/`). État = Netlify Blobs. Règles pures testées
  dans `serveur/src/` + `serveur/tests/`.
- **Le cœur du sujet ici** = la Fresque en ligne : `site/en-ligne/session/`
  (client `session.js`, `index.html`, styles `../atelier/board.css` +
  `session.css`) et la fonction `netlify/functions/fresque.js` (règles pures
  `serveur/src/regles.js`).

### Git / workflow
- Brancher depuis `origin/main`. Branche de travail courante : **`claude/fresque-suite-5`**.
- Après merge d'une branche, repartir de `main` à jour, créer une nouvelle
  branche `claude/fresque-suite-N+1` avec un commit vide.
- Commits : finir le message par
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (adapter si autre IA).
- **Ne jamais committer de secret** (clé Resend, clés CiviCRM). Les secrets sont
  des variables d'environnement Netlify. La clé Resend ne doit JAMAIS apparaître
  dans le dépôt.
- **Important** : le client (session.js) et la CSP ne s'activent en prod qu'après
  **déploiement de la branche sur Netlify** (merge sur `main`).

### Tester en local
```bash
# Site statique
cd site && python3 -m http.server 8099     # http://localhost:8099

# Tests
npm test                                    # node --test (règles, limites, ateliers) + valide cartes.json
node serveur/tests/regles.test.mjs          # règles du tableau (doit afficher "X réussis, 0 échoués")

# Audit accessibilité (Chromium pré-installé dans cet environnement)
PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  BASE=http://localhost:8099 node scripts/audit-a11y.mjs
```
- Les fonctions Netlify ne tournent pas avec `python -m http.server`. Pour
  tester le client sans back, **mocker `fetch` via Playwright** (`page.route`)
  comme dans les scripts de test jetables (voir historique). Chromium :
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, import
  `playwright-core/index.mjs`.
- On ne peut PAS exécuter les fonctions Netlify ni atteindre la prod depuis cet
  environnement (proxy). Valider la logique par les tests purs + mocks.

### Services auto-hébergés déjà en place (serveur Hetzner Pause IA)
- **Visio Jitsi** : `https://visio.pauseia.fr` (docker, derrière Caddy). Setup :
  `infra/jitsi/`. Variable Netlify `VISIO_BASE=https://visio.pauseia.fr` pour que
  les salons auto pointent dessus.
- **Relais curseurs** : `wss://curseurs.pauseia.fr` (docker Node, `infra/curseurs/`).
  Sans état, optionnel. La CSP du site (`netlify.toml`) l'autorise déjà
  (`connect-src ... wss://curseurs.pauseia.fr`).
- **Alerte e-mail** : un script cron sur le serveur alerte `contact@pauseia.fr`
  si un conteneur Jitsi tombe (via Resend, expéditeur `onboarding@resend.dev`).

---

## 1. CAUSE RACINE LA PLUS PROBABLE DE LA LATENCE (à traiter en priorité)

Le crash-test remonte des **délais de ~5 secondes** pour propager TOUTE action
(poser/déplacer une carte, flèche, note, ajout au pool) entre participants. Un
`hold-poll` a été mis en place côté serveur (`fresque.js`, op `etat` : la requête
est maintenue jusqu'à changement de version, ~0,3 s attendu), donc le délai de
5 s ne vient probablement PAS du polling client mais d'une des causes suivantes,
par ordre de probabilité :

1. **Cohérence éventuelle de Netlify Blobs.** Les lectures Blobs ne sont pas
   fortement cohérentes par défaut : après une écriture par l'utilisateur A, la
   lecture par l'utilisateur B peut renvoyer l'ancienne valeur pendant plusieurs
   secondes. Le `hold-poll` relit en boucle mais voit la même valeur périmée -> ~5 s.
   **Piste** : passer les lectures d'état en **cohérence forte**. Dans
   `fresque.js`, les lectures `getWithMetadata(cle(code), { type: "json" })`
   (fonction `lire`) et la boucle du hold-poll doivent utiliser
   `{ type: "json", consistency: "strong" }`. Tester l'impact réel (un historique
   du projet évoquait d'éviter `consistency:"strong"` ; revalider, car c'est
   précisément ce qui corrige la propagation temps réel).
2. **Démarrages à froid + surcoût par requête** des fonctions serverless.
3. **Limite architecturale du modèle poll-sur-Blobs** pour du vrai temps réel.

### Recommandation de fond (si la cohérence forte ne suffit pas)
Faire transiter les **actions du tableau par le relais WebSocket** déjà déployé
(`infra/curseurs/`, actuellement dédié aux curseurs). Le serveur Blobs resterait
l'autorité/persistance, mais la **diffusion** des changements passerait par le
WebSocket (push) au lieu du poll. C'est le chemin le plus sûr vers un ressenti
« direct ». Concrètement : généraliser le relais pour rediffuser un message
`{t:"maj"}` quand quelqu'un agit, ce qui déclenche chez les autres un `etat`
immédiat (ou transporter directement le diff). Gros chantier mais décisif.

**Tant que la latence de fond n'est pas réglée, les « feedbacks temps réel »
ci-dessous (flèche live, frappe live) doivent être rendus LOCALEMENT d'abord
(optimistic UI), pour ne pas dépendre de l'aller-retour serveur.**

---

## 2. LISTE PRIORISÉE DES PROBLÈMES (crash-test équipe)

Légende fichiers : `CS` = `site/en-ligne/session/session.js` ;
`HTML` = `site/en-ligne/session/index.html` ;
`CSS` = `site/en-ligne/atelier/board.css` ;
`SRV` = `netlify/functions/fresque.js` ;
`REGLES` = `serveur/src/regles.js`.

### P0 - Latence de propagation (~5 s sur tout)
- **Symptôme** : poser/déplacer une carte, flèche, note, ajout au pool : ~5 s
  avant que les autres voient. Clic sur une carte : délai d'affichage.
- **Cause probable** : section 1 (cohérence Blobs).
- **Fichiers** : `SRV` (op `etat` + `lire`), éventuellement relais WebSocket.
- **Fix** : cohérence forte sur les lectures ; sinon push WebSocket. **C'est le
  point n°1, tout le reste en dépend.**

### P0 - Retour visuel immédiat (optimistic UI) manquant
Même une fois la latence réduite, l'acteur doit voir son action instantanément
en local (déjà le cas pour le glisser de carte ; à généraliser).
- **Poser une carte** : rendre la carte localement dès le clic/drop, avant la
  confirmation serveur (`CS` : `agir({op:"poserCarte"...})` -> créer l'élément
  tout de suite, réconcilier à la réponse).
- **Ajout au pool (animateur)** : idem, afficher la carte dans le pool
  immédiatement en local.

### P1 - Flèches : tracé en direct + survol d'accroche
- **Symptôme** : aucune animation pendant le tracé ; la flèche « saute »
  plusieurs secondes après. Attendu : dès qu'on clique la 1re carte, une ligne
  élastique (rubber-band) suit le curseur en direct pour TOUT le monde ; effet de
  survol sur les cartes pour montrer qu'on peut y accrocher le début/la fin.
- **Fichiers** : `CS` (`clicFleche`, `dessinerFleches`, handlers pointer),
  `CSS` (styles hover carte en mode flèche).
- **Fix** :
  - Local d'abord : en mode `fleche`, après le 1er clic, dessiner une ligne
    provisoire de la carte de départ jusqu'au curseur (listener `pointermove`
    sur la scène, SVG dans `#fleches`). Supprimer au 2e clic / annulation.
  - Survol : quand `etat.outil` est une flèche, ajouter une classe sur
    `.c-carte:hover` (halo/accroche visible). Voir `setOutil` qui pose déjà
    `outil-fleche` sur la scène.
  - Diffusion live du point mobile aux autres : passerait idéalement par le
    WebSocket (éphémère, comme le ping), sinon rester local pour l'acteur.

### P1 - Libellés de flèches et commentaires : frappe en direct
- **Symptôme** : les libellés de flèches et les notes mettent longtemps à
  apparaître ; souhait : voir le texte s'afficher **au fur et à mesure de la
  frappe** chez les autres.
- **Fichiers** : `CS` (`selFleche`/`commitLib` ~throttle 350 ms déjà ;
  `editerTexte`/`creerNoteLocale` n'envoient qu'au blur), `REGLES`
  (`libellerFleche`, `modifierTexte`).
- **Fix** : envoyer le contenu throttlé pendant la frappe (input), pas seulement
  au blur ; côté réception, mettre à jour le texte même si l'élément n'est pas
  en cours d'édition localement. Dépend aussi de P0 pour le ressenti.

### P1 - Visio absente du tableau
- **Symptôme** : le lien Jitsi de l'atelier n'apparaît pas dans le dashboard de
  session (l'animateur ne retrouve pas le lien visio une fois dans le tableau).
- **Cause** : quand l'animateur ouvre la session via `?ouvrir=CODE`, l'état de
  session créé ne reçoit pas le `visio` de l'atelier. `rendreVocal` (CS) sait
  afficher `vue.lienVocal`, mais `lienVocal` n'est pas pré-rempli.
- **Fichiers** : `SRV` (op `creer` : quand un code d'atelier réservé est ouvert,
  lire l'atelier dans le store `fresque-ateliers` et initialiser
  `session.lienVocal = atelier.visio`), `REGLES` (`creer` accepte un lienVocal
  initial), `CS` (`rendreVocal` OK).
- **Fix** : injecter le lien visio de l'atelier dans la session à l'ouverture.

### P1 - Curseurs : lisibilité, confort, réglage
- **Couleurs illisibles** : flèche + prénom ne s'adaptent pas au fond (souvent
  invisibles). `CS` `couleurCurseur` (palette fixe) + `CSS` `.curseur-live`.
  Fix : contour/halo de contraste (liseré clair + ombre foncée) indépendant du
  fond ; ou couleur de texte calculée selon le fond courant.
- **Mal au cœur (trop de mouvement)** : les curseurs sautent. Fix : interpoler
  la position (lerp/ease via `requestAnimationFrame`) entre deux mises à jour au
  lieu de « téléporter » ; lisser sans ajouter de latence perçue.
- **Activer/désactiver** : un bouton `#btn-curseurs` existe déjà (masque les
  curseurs des autres). Le rendre plus évident / proposer un réglage clair.

### P1 - Pool et réserve : refonte demandée
- **Réserve (deck animateur)** : afficher les cartes **avec leur illustration**
  (comme le pool), pas seulement le texte. `CS` `construireDeck`/`rendreDeck`,
  `CSS` `.deck-carte`.
- **Glisser-déposer temps réel animateur réserve <-> pool** : n'existe pas
  (seulement clic). À créer (drag depuis la réserve vers le pool et inversement).
- **Pool = 8 emplacements fixes, jolis, pré-définis** (ex. 2 de large x 4 de
  haut), **panneau déplaçable** librement sur l'écran, **repliable/dépliable**.
  Aujourd'hui le pool est une rangée en bas (`CSS` `.pool`, `CS` `rendrePool`).
  Refondre en grille 8 cases + rendre le panneau draggable + mémoriser position.
- **Glisser-déposer pool -> table échoue parfois** (en plus du délai). Revoir
  `CS` (`demarrerGlissePool`/`glisserPoolUp`/`zoneDepot`) : fiabiliser la
  détection de zone et le relâchement ; tester multi-cas.
- **Options animateur** : « remplir le pool » et « vider le pool » (tout
  enlever). `REGLES` : ajouter ops `poolVider` (vide `s.pool`) et éventuellement
  `poolRemplir`. `CS` : boutons dans l'entête du pool.

### P2 - Thème : changer TOUTE la page, pas que le tableau
- **Symptôme** : le bouton fond noir/blanc ne change que la zone tableau ;
  attendu : bascule du thème de **toute la page**.
- **Fichiers** : `CS` (`appliquerCanvas`/handler `#btn-sombre` : pose
  `canvas-noir`/`canvas-blanc` sur la scène). Fix : appliquer `data-theme` sur
  `document.documentElement` (le CSS de board.css réagit déjà à
  `:root[data-theme="dark"]`), pour couvrir toute la page.

### P2 - Plein écran : garder la barre d'outils
- **Symptôme** : en plein écran, la barre d'outils disparaît ; il faut la
  garder visible.
- **Fichiers** : `CS` (plein écran / `majBarres`), `CSS` (`.barres-cachees`,
  `.plein-css`). Fix : ne pas masquer `.toolbar` en plein écran (ou une version
  compacte toujours visible).

### P2 - Hovers / encadrés illisibles
- **Symptôme** : certains encadrés au survol (tooltips, `.survol-carte`, etc.)
  ont la même couleur que le fond -> illisibles.
- **Fichiers** : `CSS` (`.survol-carte`, `.curseur-nom`, infobulles). Fix :
  forcer un fond contrasté + bordure, indépendant du thème.

---

## 3. CHANTIER EN COURS : supprimer TOUS les codes de session visibles

Objectif demandé : le code de session reste **technique** (dans les URL `?code=`
/ `?ouvrir=` et l'état serveur) mais **n'apparaît jamais** à l'utilisateur. Tout
se fait par liens.

### Déjà fait (committé sur `claude/fresque-suite-5`)
- **E-mails** : plus aucun « Code de session » affiché (confirmations animateur /
  participant, déplacement, rappels veille + 1 h, invitation `.ics`). Les boutons
  portent le code dans le lien : `?ouvrir=CODE` (animateur), `?code=CODE`
  (participant). Rappels : bouton « Rejoindre » (participants) + lien discret
  « Ouvrez votre session » (animateur). Atelier privé : « lien de participation à
  partager ». Lien « déplacer » -> `/participer/?gerer=CODE#gerer`.
- **Page Participer** : bloc « Gérer un atelier existant » repliable ; récap
  post-création supprimé (message court renvoyant à l'e-mail) ; l'ancre `#gerer`
  ouvre le bloc (JS dans `site/assets/js/ateliers.js`).

### RESTE À FAIRE (non committé, volontairement annulé pour garder un arbre sain)
La partie **front de la session** n'a pas été terminée car elle cassait la page.
À réaliser proprement :
1. **Barre du haut** (`HTML` `.topbar`) : retirer la puce `#code-chip`
   (`Code … copier`). Garder `#btn-partager` (« Copier le lien d'invitation »).
2. **Lobby** (`HTML`) : masquer les champs code. `#anim-code` et `#join-code`
   deviennent des `input type="hidden"` (le code vient de l'URL). Le prénom
   suffit. Ajouter une note dans la colonne « Rejoindre » pour le cas sans lien
   (« ouvrez le lien reçu par e-mail »).
3. **GOTCHA IMPORTANT** : `session.js` référence `E["code-chip"]` et
   `E["code-val"]` (handler de copie du code + `demarrer()` qui fait
   `E["code-val"].textContent = code`) et l'i18n `setFirst("#code-chip", ...)`.
   Si on retire ces éléments du HTML **sans garder des gardes** (`if (E[...])`),
   l'init plante (appel sur `undefined`) et **toute la session casse**. C'est
   exactement ce qui est arrivé ; l'édition a été annulée. Donc : d'abord
   neutraliser/guarder ces références dans `session.js`, puis retirer le HTML.
4. **Gérer un atelier** (`site/participer/index.html` + `site/assets/js/ateliers.js`) :
   pré-remplir le code (masqué) depuis `?gerer=CODE` pour que l'animateur ne le
   tape jamais (ne renseigne que son e-mail). Forms `#form-deplacer` /
   `#form-annuler` : champ `code` en hidden, rempli depuis l'URL.

---

## 4. Carte des fichiers clés (Fresque en ligne)

- `site/en-ligne/session/index.html` : structure (lobby, topbar, toolbar, scène
  `#scene`/`#monde`, pool `#pool`, deck `#deck`, panneau participants, modal
  carte, aide `#aide-pop`).
- `site/en-ligne/session/session.js` (~1300 lignes) : tout le client. Repères :
  - `etat` (état local), `api()`, identité (jetons localStorage).
  - Lobby : `?ouvrir=` / `?code=` / `?s=` (reprise), `lobbyRole`, `demarrer`.
  - Boucle réseau : `boucle()`, `POLL_RAPIDE/LENT`, `activite()`, `pollerVite()`.
  - `appliquerEtat` -> `rendreParticipants` / `rendrePool` / `rendreDeck` /
    `rendreVocal` / `rendreTableau` / `rendrePing` (gardes de signature pour
    éviter le churn DOM).
  - Cartes : `creerElCarte`, `glisserCarte` (drag + suppression du clic
    parasite), `selCarte` + barre d'actions animateur (remettre au pool /
    réserve).
  - Flèches : `dessinerFleches` (SVG), `majFleches` (coalescé rAF), `selFleche`.
  - Notes : `creerElTexte`, `editerTexte`, `creerNoteLocale`.
  - Pool drag&drop : `demarrerGlissePool`, `glisserPoolMove`, `glisserPoolUp`,
    `zoneDepot`.
  - Curseurs : `connecterCurseurs`, `envoyerCurseur`, `recevoirCurseur`,
    `couleurCurseur`, `basculerCurseurs` (bouton `#btn-curseurs`).
  - Ping : `montrerPing` / `rendrePing` (clic droit).
  - Tutoriels : `lancerTuto` / `montrerEtape` / `positionnerTuto` (coach-marks,
    `S.tutoAnim` / `S.tutoPart`).
  - Vue : `applyView`, `zoomVers`, `toutVoir`, plein écran, `majBarres`.
- `site/en-ligne/atelier/board.css` : styles du tableau (cartes, pool, deck,
  flèches, curseurs, ping, tuto, barre d'actions). **Partagé**, ne pas déplacer.
- `netlify/functions/fresque.js` : API session (creer/rejoindre/etat/agir),
  hold-poll, TTL, balayage, limites.
- `serveur/src/regles.js` : règles pures (pool, réservations, poser/retirer,
  flèches, textes, ping, présence). Tests : `serveur/tests/regles.test.mjs`
  (42 tests). **Toute nouvelle règle doit avoir un test.**

---

## 5. Principes à respecter

- **Robustesse / dégradation** : une panne d'un service ne doit pas casser le
  site. Les curseurs/visio sont optionnels (échec silencieux). Garder ce principe.
- **Serveur = autorité** : le client propose, le serveur tranche (ex. une seule
  prise de carte possible en concurrence). Les nouveautés doivent préserver ça.
- **Vie privée** : pas de cookie ni traceur tiers ; e-mails jamais exposés entre
  participants (Cci). CSP stricte (tout en même origine sauf
  `wss://curseurs.pauseia.fr`).
- **Accessibilité** : viser 0 violation axe-core (script `scripts/audit-a11y.mjs`).
- **Bilingue** FR/EN : ajouter les deux variantes des chaînes (`S` dans session.js,
  `T` dans ateliers.js).
- **Tests** avant commit : `npm test` + `node serveur/tests/regles.test.mjs` +
  `grep -n "—"` (aucun tiret long) + `node --check` sur les fichiers JS modifiés.

---

## 6. Ordre de travail conseillé

1. **P0 latence** (cohérence Blobs / WebSocket) : débloque le ressenti global.
2. **Optimistic UI** (poser carte, pool) : retour immédiat local.
3. **Flèches live + survol d'accroche** ; **frappe live** libellés/notes.
4. **Visio dans le tableau** (injection du lien à l'ouverture).
5. **Refonte pool** (8 cases, déplaçable, repliable) + **réserve illustrée** +
   **drag réserve<->pool** + **remplir/vider** + fiabiliser le drop pool->table.
6. **Curseurs** (contraste + lissage anti-mal-de-cœur).
7. **Thème toute la page**, **plein écran garde la barre**, **hovers lisibles**.
8. **Finir la suppression des codes visibles** côté session (section 3, avec le
   GOTCHA des gardes session.js).

Bon courage. Tout est sur `claude/fresque-suite-5` (repartir de `main` si mergé).
