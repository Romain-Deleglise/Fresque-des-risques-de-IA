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

## 1. ÉTAT DES LIEUX (à jour)

Tous les points du crash-test en équipe ont été traités. Ce qui suit dit ce qui
a été fait, comment, et ce qu'il reste à surveiller.

### Latence de propagation (~5 s sur toute action) : réglée

La cause racine était bien la **cohérence éventuelle de Netlify Blobs** : après
l'écriture de A, la lecture de B renvoyait l'ancienne valeur pendant plusieurs
secondes, si bien que la boucle d'attente (`hold-poll`) relisait en boucle une
valeur périmée. Trois mécanismes cumulés, chacun facultatif :

1. Pousse WebSocket : après chaque action, le client envoie aux autres, par le
   relais (`infra/curseurs/`), **l'état complet** que le serveur vient de lui
   renvoyer. C'est ce qui fait tout le direct.
2. Attente maintenue resserrée : relecture toutes les 120 ms, 8 s au maximum.
3. Repli si l'état ne peut pas être joint : simple signal `{t:"maj"}`, et les
   autres relisent.

La cohérence forte de Netlify Blobs, elle, **n'est pas disponible ici** : voir
« La cohérence forte est impossible dans ces fonctions » plus bas.

Côté client, chaque action est **rendue localement d'abord** (optimistic UI) :
poser une carte, remplir / vider le pool, retirer une carte.

### Reste du crash-test : traité

| Point remonté | Ce qui a été fait |
|---|---|
| Flèches sans animation, pas de survol | Ligne élastique dès le 1er clic (chez soi et chez les autres, couche `#fleches-live`), halo d'accroche au survol, Échap annule |
| Libellés / notes lents à apparaître | Frappe relayée en direct ; une note est créée côté serveur dès la première saisie |
| Lien visio absent du tableau | Repris de l'atelier à l'ouverture (`R.creer(prenom, code, visio)`) et affiché dans la barre du haut |
| Délai au clic sur une carte | Préchargement des grandes images dès qu'une carte entre dans le pool ou sur le tableau |
| Curseurs illisibles, « mal au cœur », réglables | Cerclés de blanc + ombre, interpolés à chaque frame (lerp), bascule explicite avec message |
| Pool : refonte | Panneau flottant déplaçable et repliable, 8 emplacements fixes (2 x 4), taille réglable, « Remplir » / « Vider » (règles `poolRemplir` / `poolVider`) |
| Réserve pauvre | Cartes illustrées, une rangée qui défile ; glisser-déposer réserve <-> pool |
| Glisser pool -> table échouait parfois | **Cause trouvée** : réserver la carte changeait l'état, donc `rendrePool` reconstruisait le panneau et détruisait l'élément en cours de glissement. Écouteurs au niveau du `document`, zone de dépôt géométrique, panneau figé pendant le glissement |
| Fond noir ne changeait que le tableau | `data-theme` sur `<html>`, mémorisé sous la clé `theme` du site |
| Plein écran masquait les outils | Les barres sont forcées visibles en plein écran |
| Encadrés au survol illisibles | Fonds opaques contrastés, indépendants du thème |

### Codes de session invisibles : fait

Le code reste **technique** (URL + état serveur) et n'apparaît plus nulle part.

- E-mails : plus aucune boîte ni ligne « Code de session ». Chaque destinataire
  reçoit le lien de son rôle (`?ouvrir=` animateur, `?code=` participant).
- **Un e-mail = un rôle** : aucun envoi n'est plus adressé à la fois à
  l'animateur·ice et aux inscrit·es. Les envois collectifs partent en **Cci seul**
  (`lib/mail.js` met l'expéditeur comme destinataire visible).
- Atelier privé : nouveau lien de participation `/participer/?atelier=CODE` +
  op serveur `voir`. Auparavant un atelier privé n'était rejoignable par
  personne (`validerInscription` le refusait), le lien corrige ce trou.
- Session : la puce « Code » a quitté la barre du haut ; les champs code du
  lobby sont des `input type="hidden"` remplis depuis l'URL ; sans lien, la
  colonne « Rejoindre » ne montre qu'une note renvoyant à l'e-mail.
- Participer : « Gérer un atelier existant » est un bloc replié, ouvert par
  `?gerer=CODE#gerer`, dont les formulaires ne demandent que l'e-mail.

### Second crash-test : traité aussi

| Point remonté | Ce qui a été fait |
|---|---|
| Le dézoom sous 50 % déformait les cartes | Comportement `#monde.loin` entièrement supprimé (CSS et JS). Une carte posée rétrécit, un point c'est tout. L'image exportée, qui reprenait la hauteur réelle des éléments, redevient correcte du même coup |
| Actions enchaînées : carte qui disparaît, qui revient au jeu, « Poser » à recliquer 100 fois | **Cause trouvée et reproduite** : chaque clic envoyait une requête concurrente, toutes lisaient le même état et s'écrasaient (lire-modifier-écrire). Les actions passent maintenant par une **file côté client** (une seule en vol), et `muter()` vérifie lui-même que son écriture a bien été retenue quand la plateforme ne le dit pas |
| « Pool » | L'interface dit **Réserve** (commune), et le jeu complet de l'animateur·ice **Jeu de cartes**. Le code garde `pool` partout (id, classes, ops) |
| Le panneau masque le tableau au dézoom | Panneau en bas à droite par défaut ; « Tout voir » cadre le **contenu** et le centre dans la zone libre ; le plan peut déborder juste assez pour se dégager du panneau ; le panneau reste toujours entièrement dans la scène |
| Étiquettes de flèche sous les cartes dans l'export | Dessinées en second passage, par-dessus |

Effet de bord assumé : le panneau des participants passe à **gauche**, la
réserve occupant désormais la droite.

### Temps réel : l'état transite par le relais, plus par le magasin

Constat de terrain : seules les choses qui passaient par le relais WebSocket
(curseurs, tracé de flèche, frappe des libellés) étaient réellement en direct.
Tout le reste attendait plusieurs secondes. Mesure sur banc d'essai, avec des
lectures volontairement en retard de 4 s : une carte posée mettait 4,1 s à
apparaître chez l'autre, contre **89 ms** après correction.

La cause n'est pas le signal mais la LECTURE. [Netlify Blobs sert des lectures
éventuellement cohérentes, propagées « dans les 60 secondes »](https://docs.netlify.com/build/data-and-storage/netlify-blobs/).
Dire aux autres « relisez » (message `maj`) ne servait donc à rien : ils
relisaient la valeur périmée. On fait maintenant transiter **l'état complet**
par le relais (`{t:"etat", s}`), tel que le serveur vient de le renvoyer à son
auteur. Le magasin reste l'autorité et la mémoire ; le sondage tourne en fond et
corrige tout écart. C'est le schéma classique des tableaux collaboratifs :
relais de diffusion pour le direct, base pour la persistance.

Deux garde-fous :
- on n'applique un état reçu que s'il est **strictement plus récent** que le
  sien. Deux personnes qui agissent depuis la même version produisent deux états
  portant le même numéro suivant : appliquer celui de l'autre faisait bouger une
  carte toute seule ou disparaître une flèche ;
- on n'applique un état reçu que s'il porte bien le numéro attendu.

### La cohérence forte est impossible dans ces fonctions (incident, réglé)

À ne pas retenter. `netlify/functions/fresque.js` est une fonction au format
« lambda » (`exports.handler` + `connectLambda`). Dans ce format,
`@netlify/blobs` ne reçoit du runtime que `edgeURL` ; `uncachedEdgeURL`, la
seule adresse capable de servir une lecture fortement cohérente, **n'existe
pas** (voir `connectLambda` dans `node_modules/@netlify/blobs/dist/main.cjs`).
Toute requête demandant `consistency: "strong"` y lève `BlobsConsistencyError`.

Posée sur le magasin (`getStore({ name, consistency: "strong" })`), l'option
s'applique à **chaque appel**, écritures et suppressions comprises. Livrée
ainsi, elle a mis tout le service à terre : « Erreur du service de sessions »
dès l'ouverture d'un atelier, pour toutes les opérations. Le repli prévu ne
servait à rien, puisqu'il relisait par le même client, toujours en cohérence
forte.

Le magasin est donc lu normalement, et le direct ne dépend pas de lui. Le
test `serveur/tests/fresque-session.test.mjs` refuse maintenant toute demande de
cohérence forte : si quelqu'un la remet, les six tests tombent.

**Le relais doit être redéployé** (nouveau type de message et limites de taille
relevées) : voir `infra/curseurs/README.md`. Sans cela le direct retombe sur le
sondage.

### Le temps réel, refait en trois couches (le point important)

Le jeu était illisible : plusieurs secondes entre le geste de quelqu'un et ce
que les autres voyaient, des cartes qui « bougeaient toutes seules », une carte
posée qui n'arrivait jamais puis repartait dans la réserve. Deux causes, toutes
les deux corrigées.

**Cause 1 : le battement de présence réécrivait le tableau.** À chaque sondage,
le serveur lisait le document de session (lecture *éventuellement cohérente*,
donc potentiellement vieille de plusieurs secondes), y posait l'horodatage de
présence, et le réécrivait **entier, sans changer le numéro de version**. Il
remettait donc le tableau dans son état d'avant, en silence et sans que rien ne
puisse le détecter : même version, contenu plus ancien. Avec huit personnes qui
sondent, cela arrivait en permanence. Le garde-fou `onlyIfMatch` n'a jamais pu
l'arrêter, puisqu'il n'existe pas dans `@netlify/blobs` 8.x. La présence vit
maintenant dans **son propre magasin** (`fresque-presence`, un document
`{ id: horodatage }` par session) : perdre un battement n'a aucune conséquence,
et le document de session n'est plus écrit que par de vraies actions.

**Cause 2 : la propagation passait par le magasin.** Elle ne pouvait donc pas
être plus rapide que sa cohérence. C'est le schéma que tout le monde a résolu
de la même façon (Figma, Excalidraw, Liveblocks, Supabase Realtime) :
**trois couches**, et la base n'est jamais sur le chemin du direct.

| Couche | Contenu | Transport | Enregistré |
|---|---|---|---|
| Éphémère | curseurs, flèche en cours, **carte en cours de déplacement** | relais WS | non |
| Provisoire | l'action qu'on vient de faire, poussée **avant** la réponse du serveur | relais WS | non |
| Autoritaire | l'état du tableau | fonction Netlify + Blobs | oui |

Concrètement :
1. `agir()` applique l'action chez soi, puis **diffuse tout de suite sa vue
   optimiste** (`_prov` à l'intérieur de `s`, parce que le relais ne recopie que
   ce champ). Les autres l'affichent sans attendre le serveur.
2. Un rendu provisoire **ne fait jamais avancer le numéro de version** : l'état
   autoritaire qui porte le même numéro sera donc bien appliqué ensuite et
   corrigera si le serveur a refusé. Un filet de 2,5 s redemande l'état complet
   si aucune confirmation n'arrive.
3. Pendant qu'on déplace une carte, le **geste** est relayé (`gliss`, ~30/s,
   quelques octets). Chez les autres, la vraie carte bouge si elle est déjà sur
   le tableau, sinon un fantôme la représente. Rien n'est enregistré.
4. Le point de dépôt d'une carte posée au clic est choisi **par le client** et
   non plus tiré au hasard par le serveur : sans cela il était impossible de
   montrer la carte avant sa réponse.
5. Côté serveur, une action n'est plus appliquée sur une lecture **prouvée
   périmée** (le client envoie la version qu'il a sous les yeux), et le sondage
   ne sert jamais un état plus vieux que celui que le client possède déjà.

**Mesuré** (banc à deux navigateurs, vrai relais, magasin volontairement en
retard de 3 s et fonction à 350 ms) :

| Mesure | Avant | Après |
|---|---|---|
| Déplacement d'une carte vu par les autres **pendant** le geste | invisible | **20 ms** |
| Pose d'une carte vue par les autres | 376 ms (et des secondes avec le bug de présence) | **23 ms** |
| Fantôme d'une carte tirée de la réserve | invisible | **19 ms** |
| Tableaux identiques des deux côtés après 5 poses | - | oui |

Mêmes chiffres avec un magasin en retard de **6 s** et une fonction à 900 ms.

**Le relais doit être redéployé** pour les messages `gliss` (voir
`infra/curseurs/README.md`). Sans cela, les déplacements en cours ne se voient
pas ; tout le reste fonctionne déjà.

### Ce qu'on a repris aux autres architectures (et ce qu'on a écarté)

Après le passage en trois couches, on a relu ce que font Figma, le netcode des
jeux en réseau et les guides WebSocket de production, puis **cherché ces
faiblesses-là dans notre code, avec un banc**. Deux existaient vraiment.

**Faille 1, confirmée : notre propre action clignotait.** Tant que le serveur
n'a pas confirmé une action, elle n'existe que chez nous. En appliquant
l'état reçu de quelqu'un d'autre, notre carte disparaissait de notre écran puis
revenait. C'est le problème que le netcode résout par le **rejeu des entrées non
acquittées** : on repart de l'état reçu, puis on réapplique par-dessus ce qui
est encore en vol (`enVol` / `rejouerEnVol()`). Mesuré avant : clignotement.
Après : plus aucun.

**Faille 2, confirmée et plus grave : une action perdue au réseau restait à
l'écran pour toujours.** Le `catch` ne faisait rien : l'action n'était nulle
part sauf chez son auteur, qui voyait une carte que personne d'autre n'avait, et
que rien ne venait jamais corriger (sa version était déjà à jour, donc l'état du
serveur était ignoré). Trois remèdes, tous standards :
- **renvoi** (2 tentatives, 400 puis 800 ms) : une coupure passagère est
  rattrapée toute seule ;
- **clé d'idempotence** sur chaque action : le serveur retient les 40 dernières
  et refuse de rejouer. Sans elle, un renvoi créait DEUX flèches ou DEUX notes ;
- **annulation** si ça ne passe toujours pas : on redemande l'état complet et on
  le dit à la personne, plutôt que d'afficher un tableau qui ment.

**Écriture conditionnelle enfin réelle.** `onlyIfMatch` n'existait pas dans
`@netlify/blobs` 8.x : l'option était ignorée en silence, donc deux personnes
qui agissaient en même temps se recouvraient et une action disparaissait sans
trace. `ateliers.js` et `collect.js` s'appuyaient dessus eux aussi, pour rien.
Le paquet est passé en **10.7.13**, où le magasin compare vraiment l'etag et
répond `{ modified: false }` ; `muter()` rejoue alors, avec une attente
croissante pour laisser le magasin rattraper son retard. Le code marche encore
si la plateforme ne rend pas de verdict : on retombe simplement sur l'ancien
comportement plutôt que de bloquer. **Non vérifiable hors de Netlify** : à
surveiller au premier atelier (voir section 2).

**Écarté, et pourquoi.**
- **CRDT (Yjs, Automerge) ou OT.** Figma les a écartés pour la même raison que
  nous : leur complexité sert un monde décentralisé, or tout passe ici par un
  seul serveur qui définit l'ordre. La granularité naturelle du conflit (une
  carte, une flèche) rend le dernier-écrivain-gagne suffisant et attendu.
- **Diffuser des deltas plutôt que l'état complet.** Diviserait le trafic par
  ~20, mais un état fait 4 Ko et on est huit : ce n'est pas un problème.
- **Journal d'opérations + rattrapage au reconnect.** Notre sondage tenu avec
  numéro de version fait déjà ce rattrapage.

**La suite logique, si un jour ça ne suffit plus** : déplacer l'autorité dans le
relais, sur votre propre serveur. Les règles (`serveur/src/regles.js`) sont
pures et déjà partagées ; un processus par session en mémoire donnerait une
sérialisation parfaite (plus aucune écriture perdue) et supprimerait Blobs du
chemin, qui ne servirait plus qu'à la sauvegarde. C'est exactement le modèle
Figma, et l'infrastructure est déjà là.

### Homonymes et lisibilité des curseurs

- **Deux fois le même prénom.** La seconde personne est maintenant refusée à
  l'entrée (`prenom_pris` dans `serveur/src/regles.js`) avec une consigne
  utile : ajouter la première lettre de son nom de famille. La comparaison
  ignore la casse, les accents et les espaces, et ne regarde que les personnes
  présentes, pour qu'un prénom libéré par un départ ne bloque personne. La
  numérotation `Antoine ·1 / ·2` reste dans la liste des participants, mais
  seulement comme filet pour les sessions ouvertes avant ce changement.
- **Étiquette des curseurs.** Les deux cernes (foncé puis blanc) sont
  maintenant posés à l'EXTÉRIEUR de la pastille, et le corps est passé de
  .68rem à .78rem. Le liseré blanc intérieur d'avant mangeait la pastille de
  couleur et rapprochait le blanc du texte du blanc du fond : sur un tableau
  clair, le prénom se lisait mal. Les sept couleurs gardent au moins 5,2:1 avec
  le texte blanc.

### Notes et libellés : deux courses corrigées

- **Note fantôme.** Taper vite puis cliquer ailleurs créait DEUX notes : la
  première lettre partait en création, et le `blur`, ne voyant pas encore
  d'identifiant, en créait une seconde avec le texte complet. Restait une note
  « n » sur le tableau, qu'on retrouvait en trop dans l'image exportée. Le texte
  est maintenant mis de côté et envoyé à la réponse de la création.
- **Libellé de flèche.** `commitLib()` lisait la variable partagée `editLib`,
  remise à `null` par `deselect()` : un envoi étalé encore en attente levait une
  erreur silencieuse dans un minuteur, et le libellé se perdait. Le champ est
  capturé dans la fermeture, et l'envoi en attente est annulé à la désélection.

### Sur la mesure du temps réel (piège)

Mesurer depuis Playwright le contenu d'un onglet d'ARRIÈRE-PLAN donne des
délais faux : les évaluations attendent que l'onglet reprenne la main, ce qui
faisait lire « 4 s » là où la flèche était affichée en 25 ms. Mesurer DANS la
page (boucle lancée avant l'action, qui note l'instant du changement) donne les
vrais chiffres. Le banc `direct.mjs` journalise aussi l'arrivée des messages du
relais, ce qui permet de séparer ce qui vient de l'émetteur de ce qui vient du
récepteur.

## 2. À SURVEILLER EN PRODUCTION

Rien de ce qui suit n'est testable hors de Netlify : à vérifier au premier
atelier réel.

1. **L'écriture conditionnelle, maintenant réelle.** Le paquet est passé de
   `@netlify/blobs` 8.x (où `onlyIfMatch` était ignoré en silence) à 10.7.13, où
   le magasin compare vraiment l'etag. Rien de cela n'est testable hors de
   Netlify. À surveiller : des refus « Trop de monde écrit en même temps »
   répétés signifieraient que les lectures sont trop en retard pour que le
   verrou converge ; il faudrait alors allonger l'attente entre les essais dans
   `muter()`, ou passer à l'autorité en mémoire (voir section 1).
2. **Envoi en Cci seul** via Resend (`to` = adresse d'expédition). Si Resend le
   refusait, les e-mails collectifs (rappels, annulation, déplacement aux
   inscrit·es) ne partiraient pas ; ceux à l'animateur·ice passeraient quand même.
3. **Actions renvoyées.** Une action qui échoue au réseau est maintenant
   renvoyée deux fois, avec une clé d'idempotence qui empêche le doublon. Si un
   jour vous voyez une flèche ou une note en double, c'est là qu'il faut
   regarder (`dejaFait` / `noterIdem` dans `serveur/src/regles.js`).
4. **Relais temps réel** : `infra/curseurs/server.js` a changé (messages `maj`,
   `fl`, `lib`, `note`). Le conteneur ne se met pas à jour tout seul : voir
   `infra/curseurs/README.md`, section « Mettre a jour ».

Test qui couvre les trois d'un coup : programmer un atelier **privé** en ligne,
s'inscrire avec une seconde adresse via le lien de participation, puis ouvrir la
session dans deux navigateurs.

## 3. PISTES SI LA LATENCE RÉSISTE

La diffusion passe déjà entièrement par le relais (état complet poussé après
chaque action) ; le magasin n'est plus sur le chemin du direct. S'il restait de
la latence, elle viendrait de l'aller-retour vers la fonction, pas de la
lecture : la piste serait alors d'appliquer l'action chez les autres **avant**
la réponse du serveur, en s'appuyant sur le numéro de version pour corriger
après coup.


## 4. Carte des fichiers clés (Fresque en ligne)

- `site/en-ligne/session/index.html` : structure (lobby, topbar, toolbar, scène
  `#scene`/`#monde`, pool `#pool`, deck `#deck`, panneau participants, modal
  carte, aide `#aide-pop`).
- `site/en-ligne/session/session.js` (~1800 lignes) : tout le client. Repères :
  - `etat` (état local), `api()`, identité (jetons localStorage).
  - Lobby : `?ouvrir=` / `?code=` / `?s=` (reprise), `lobbyRole`, `demarrer`.
  - Boucle réseau : `boucle()`, `POLL_RAPIDE/LENT`, `activite()`, `pollerVite()`.
  - `appliquerEtat` -> `rendreParticipants` / `rendrePool` / `rendreDeck` /
    `rendreVocal` / `rendreTableau` / `rendrePing` (gardes de signature pour
    éviter le churn DOM).
  - Cartes : `creerElCarte`, `glisserCarte` (drag + suppression du clic
    parasite), `selCarte` + barre d'actions animateur (remettre au pool /
    réserve).
  - Optimiste : `agir(intention, apres)` -> `appliquerOptimiste` ; `etat.attente`
    empêche un état serveur de même version d'écraser le rendu local.
  - Flèches : `dessinerFleches` (SVG), `majFleches` (coalescé rAF), `selFleche` ;
    tracé en direct dans `#fleches-live` (`suivreFleche`, `dessinerFlechesLive`).
  - Notes : `creerElTexte`, `editerTexte`, `creerNoteLocale` (création serveur
    dès la première frappe), `frappe()` pour l'envoi étalé.
  - Pool : `rendrePool` (grille de 8 cases), `placerPool` / `glisserPanneauPool`
    (panneau déplaçable), `demarrerGlissePool` / `glisserPoolUp` / `zoneDepot`
    (dépôt géométrique), `demarrerGlisseDeck` (réserve -> pool).
  - Temps réel : `connecterCurseurs`, `envoyerWS`, `recevoirRelais` (`maj`, `fl`,
    `lib`, `note`), `lisserCurseurs` (interpolation), `basculerCurseurs`.
  - Ping : `montrerPing` / `rendrePing` (clic droit).
  - Tutoriels : `lancerTuto` / `montrerEtape` / `positionnerTuto` (coach-marks,
    `S.tutoAnim` / `S.tutoPart`).
  - Vue : `applyView`, `zoomVers`, `toutVoir`, plein écran, `majBarres`.
- `site/en-ligne/atelier/board.css` : styles du tableau (cartes, pool, deck,
  flèches, curseurs, ping, tuto, barre d'actions). **Partagé**, ne pas déplacer.
- `netlify/functions/fresque.js` : API session (creer/rejoindre/etat/agir),
  lecture simple (pas de cohérence forte, voir plus haut), hold-poll, TTL,
  balayage, limites.
- `netlify/functions/ateliers.js` : ateliers et e-mails. Les fonctions `lien*()`
  construisent tous les liens porteurs du code ; op `voir` pour les ateliers
  privés. **Un e-mail = un rôle** (voir `rappels.js` / `rappel-imminent.js`).
- `infra/curseurs/server.js` : relais temps réel (déployé à la main sur le
  serveur Hetzner, voir son README).
- `serveur/src/regles.js` : règles pures (pool, réservations, poser/retirer,
  flèches, textes, ping, présence). Tests : `serveur/tests/regles.test.mjs`
  (50 tests). **Toute nouvelle règle doit avoir un test.**

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

## 6. Où reprendre

Le crash-test est purgé. Les prochaines étapes utiles, par ordre d'intérêt :

1. Vérifier les points de la section 2 sur un atelier réel.
2. Rejouer un crash-test à 8 personnes : c'est le seul moyen de trouver la
   prochaine série de frictions.
3. Si la latence résiste malgré tout, la piste de la section 3.

Bon courage.
