/* ESPACE ANIMATEUR·ICES.

   AUCUN ATTRIBUT `style=` DANS CE FICHIER. Le site sert une CSP stricte
   (`style-src 'self'`, netlify.toml) : un `style="left:…"` ecrit dans du HTML
   y est purement ignore par le navigateur. Premiere version en ligne : les 38
   cartes empilees en haut a gauche, les etiquettes les unes sur les autres et
   les fleches a l'echelle 1. Invisible en local, ou le serveur de test
   n'envoie aucune CSP. On pose donc TOUTES les positions par le CSSOM
   (`el.style.left = …`), que la CSP n'atteint pas, comme le fait deja le
   tableau de la Fresque en ligne.

   Affiche la fresque de reference (site/data/fresque-reference.json) avec le
   meme modele de donnees que la Fresque en ligne : cartes 160x150, fleches {de, vers, libelle}. Rien n'est duplique : les titres et les
   versos viennent de cartes.json, la source unique.

   Le plateau n'est charge qu'apres un clic explicite. Un animateur qui ouvre
   cette page devant sa table ne doit pas divulgacher la fresque par accident.
*/
(function () {
  'use strict';

  var CARTE_W = 160, CARTE_H = 150;   // remplaces par ref.plan.carte au chargement
  var PLAN_W = 2840, PLAN_H = 1750;   // idem : le fichier fait foi
  var cartes = {};      // n -> carte de cartes.json
  var ref = null;       // fresque de reference
  var zoom = 1, cibleN = null, modeCom = false;
  /* Mode edition de la fresque de reference : declare ici parce que le rendu
     des cartes et des liens en depend, et qu'il s'ecrit plus bas. */
  var editionFresque = false, lienChoisi = null;
  var retours = [];   // tous les retours, tels que la fonction les renvoie
  var jeton = '';     // jeton de moderation, garde en memoire seulement

  var $ = function (id) { return document.getElementById(id); };
  var avecRetours = false;   // pose par construireOutil() : retours ou non

  /* Les chaines produites par le script (celles qui ne sont pas dans le HTML).
     La page anglaise sert le meme fichier : sans cette table, elle afficherait
     des messages francais au milieu d'une interface anglaise. */
  var EN = document.documentElement.lang === 'en';
  var T = EN ? {
    aideLecture: 'Click a card to read its back. Drag to move around the fresk.',
    aideCommentaire: 'Click a card to read its back and leave feedback on it.',
    envoi: 'Sending…',
    merci: 'Thank you. Your feedback shows up right away; we review it afterwards.',
    echecEnvoi: 'Could not send. Please try again later.',
    echecAction: 'Action failed.',
    ecrivez: 'Write your feedback before sending.',
    vide: 'No feedback yet. Be the first.',
    anonyme: 'Anonymous',
    attente: 'awaiting review',
    valider: 'Approve', supprimer: 'Delete',
    confirmer: 'Permanently delete this feedback?',
    moderation: 'Moderation enabled',
    lotNom: { 1: 'AI', 2: 'Capabilities', 3: 'Present risks', 4: 'Existential risks', 5: 'Solutions' },
    tousLots: 'All', pleinEcran: 'Full screen', quitterPlein: 'Exit full screen',
    aucunResultat: 'No card matches',
    chargement: 'Loading…',
    echecChargement: 'Could not load. Please reload the page.',
    mene: 'What leads to it', entraine: 'What it leads to',
    repondA: 'What it answers', reponses: 'The answers to it',
    langue: 'en-GB',
    sujets: { carte: 'on a card', atelier: 'the workshop', jeu: 'the card deck',
              deroule: 'the run-through', reference: 'the reference fresk', autre: 'other' },
    lienAucun: 'No particular card', lienLiees: 'Cards already linked to this one',
    lienAutres: 'All the other cards', lienAvec: 'link with',
    deZoomer: 'Zoom out', zoomer: 'Zoom in', chercherCarte: 'Search for a card',
    choixVue: 'Choose a view', vueCartes: 'Cards', vueFresque: 'Fresk',
    modeCommentaires: 'Feedback mode', fermer: 'Close ✕', fermerPanneau: 'Close',
    filtrerLot: 'Filter by batch', provoque: 'leads to', repond: 'answers',
    ongletExpl: 'Explanations', ongletRetours: 'Feedback', titreExpl: 'Explanations',
    retourSurCarte: 'Feedback on this card?', votreRetour: 'Your feedback on this card',
    placeholderRetour: 'What was misunderstood, what is missing, a rewording…',
    concerneLien: 'This is about the link with card', facultatif: 'optional',
    quoiDansLien: 'What is wrong with that link?',
    placeholderLien: 'The direction is reversed, the label is unclear…',
    votrePrenom: 'Your first name', envoyer: 'Send',
    aideGrille: 'Click a card to read it. Filter by batch or search above.',
    lienAvecCarte: 'Link with card', numeroCarte: 'Card',
    corriger: 'Correct this card', champTitre: 'Title', champVerso: 'Back of the card',
    champExplication: 'Explanations', aideParagraphes: 'One blank line between two paragraphs.',
    enregistrerModifs: 'Save changes', annulerModifs: 'Undo my changes',
    publierModifs: 'Publish changes', enregistre: 'Saved as a draft, not published yet.',
    brouillonOublie: 'Draft discarded.', riendApublier: 'No changes to publish.',
    telecharge: 'cartes.json downloaded. Put it in the repository: CI will check it, then someone merges it.',
    publieEnLigne: 'Published. The corrections are live on the site right away.',
    deposer: 'Download cartes.json for the repository',
    aDeposer: 'correction(s) live but not yet in the repository',
    pourquoiDeposer: 'The repository also builds the printed deck: fold the corrections back into it from time to time. This list empties itself once a deployment catches up.',
    prisEnCompte: 'Handled', retourTraite: 'handled',
    modeEdition: 'Edit mode',
    aideEdition: 'Drag a card to move it. Pull its handle onto another card to link them. Click a link to edit it. Arrow keys move the focused card.',
    poigneeLien: 'Draw a link from this card',
    annulerDernier: 'Undo', enregistrerFresque: 'Save the draft',
    oublierFresque: 'Discard the draft', publierFresque: 'Publish the fresk',
    fresqueEnregistree: 'Draft saved, not published yet.',
    fresqueOubliee: 'Draft discarded. The published fresk is back.',
    fresqueTelechargee: 'fresque-reference.json downloaded. Put it in the repository: CI will check it, then someone merges it.',
    brouillonEnCours: 'A draft is in progress, not published yet.',
    nonEnregistre: 'Unsaved changes.',
    quitterEdition: 'Leave edit mode? Changes that have not been saved will be lost.',
    choixLien: 'A link to edit', libelleLien: 'Label', renommerLien: 'Rename',
    supprimerLien: 'Delete this link', nouveauLien: 'New link',
    depuis: 'From', versCarte: 'To', ajouterLien: 'Add the link',
    lienAjoute: 'Link added. Give it a label below.',
    lienRenomme: 'Label updated.', lienSupprime: 'Link deleted.',
    lienExiste: 'That link already exists.',
    memeCarte: 'A card cannot link to itself.',
    aucunLien: 'No link selected.',
    deplacees: 'cards moved', liensPlus: 'links added', liensMoins: 'links removed'
  } : {
    aideLecture: 'Cliquez une carte pour lire son verso. Glissez pour vous déplacer dans la fresque.',
    aideCommentaire: 'Cliquez une carte pour lire son verso et laisser un retour dessus.',
    envoi: 'Envoi…',
    merci: 'Merci, c’est noté. Votre retour est visible tout de suite ; nous le relisons ensuite.',
    echecEnvoi: 'Envoi impossible. Réessayez plus tard.',
    echecAction: 'Action impossible.',
    ecrivez: 'Écrivez votre retour avant d’envoyer.',
    vide: 'Aucun retour pour le moment. Soyez le premier.',
    anonyme: 'Anonyme',
    attente: 'en attente de relecture',
    valider: 'Valider', supprimer: 'Supprimer',
    confirmer: 'Supprimer définitivement ce retour ?',
    moderation: 'Modération activée',
    lotNom: { 1: 'L’IA', 2: 'Capacités', 3: 'Risques actuels', 4: 'Risques existentiels', 5: 'Solutions' },
    tousLots: 'Tous', pleinEcran: 'Plein écran', quitterPlein: 'Quitter le plein écran',
    aucunResultat: 'Aucune carte ne correspond',
    chargement: 'Chargement…',
    echecChargement: 'Chargement impossible. Rechargez la page.',
    mene: 'Ce qui y mène', entraine: 'Ce que ça entraîne',
    repondA: 'Ce à quoi ça répond', reponses: 'Les réponses proposées',
    langue: 'fr-FR',
    sujets: { carte: 'sur une carte', atelier: 'l’atelier', jeu: 'le jeu de cartes',
              deroule: 'le déroulé', reference: 'la fresque de référence', autre: 'autre' },
    lienAucun: 'Aucune carte en particulier', lienLiees: 'Cartes déjà liées à celle-ci',
    lienAutres: 'Toutes les autres cartes', lienAvec: 'lien avec',
    deZoomer: 'Dézoomer', zoomer: 'Zoomer', chercherCarte: 'Chercher une carte',
    choixVue: 'Choisir une vue', vueCartes: 'Cartes', vueFresque: 'Fresque',
    modeCommentaires: 'Mode commentaires', fermer: 'Fermer ✕', fermerPanneau: 'Fermer',
    filtrerLot: 'Filtrer par lot', provoque: 'provoque', repond: 'répond à',
    ongletExpl: 'Explications', ongletRetours: 'Retours', titreExpl: 'Explications',
    retourSurCarte: 'Un retour sur cette carte ?', votreRetour: 'Votre retour sur cette carte',
    placeholderRetour: 'Ce qui a été mal compris, ce qui manque, une reformulation…',
    concerneLien: 'Ça concerne le lien avec la carte', facultatif: 'facultatif',
    quoiDansLien: 'Qu\'est-ce qui pose problème dans ce lien ?',
    placeholderLien: 'Le sens est inversé, le libellé est ambigu…',
    votrePrenom: 'Votre prénom', envoyer: 'Envoyer',
    aideGrille: 'Cliquez une carte pour la lire. Filtrez par lot ou cherchez ci-dessus.',
    lienAvecCarte: 'Lien avec la carte', numeroCarte: 'Carte',
    corriger: 'Corriger cette carte', champTitre: 'Titre', champVerso: 'Verso de la carte',
    champExplication: 'Explications', aideParagraphes: 'Une ligne vide entre deux paragraphes.',
    enregistrerModifs: 'Enregistrer les modifications', annulerModifs: 'Annuler mes modifications',
    publierModifs: 'Publier les modifications', enregistre: 'Enregistré en brouillon, pas encore publié.',
    brouillonOublie: 'Brouillon abandonné.', riendApublier: 'Aucune modification à publier.',
    telecharge: 'cartes.json téléchargé. Déposez-le dans le dépôt : la CI le valide, puis quelqu\'un fusionne.',
    publieEnLigne: 'Publié. Les corrections sont en ligne tout de suite.',
    deposer: 'Télécharger cartes.json pour le dépôt',
    aDeposer: 'correction(s) en ligne, pas encore dans le dépôt',
    pourquoiDeposer: 'Le dépôt fabrique aussi le jeu imprimé : repliez-y les corrections de temps en temps. Cette liste se vide toute seule au déploiement qui la rattrape.',
    prisEnCompte: 'Pris en compte', retourTraite: 'pris en compte',
    modeEdition: 'Mode édition',
    aideEdition: 'Glissez une carte pour la déplacer. Tirez sa poignée vers une autre carte pour les relier. Cliquez un lien pour le modifier. Les flèches du clavier déplacent la carte au focus.',
    poigneeLien: 'Tracer un lien depuis cette carte',
    annulerDernier: 'Annuler', enregistrerFresque: 'Enregistrer le brouillon',
    oublierFresque: 'Abandonner le brouillon', publierFresque: 'Publier la fresque',
    fresqueEnregistree: 'Brouillon enregistré, pas encore publié.',
    fresqueOubliee: 'Brouillon abandonné. La fresque publiée est de retour.',
    fresqueTelechargee: 'fresque-reference.json téléchargé. Déposez-le dans le dépôt : la CI le valide, puis quelqu\'un fusionne.',
    brouillonEnCours: 'Un brouillon est en cours, pas encore publié.',
    nonEnregistre: 'Modifications non enregistrées.',
    quitterEdition: 'Quitter le mode édition ? Les modifications non enregistrées seront perdues.',
    choixLien: 'Un lien à modifier', libelleLien: 'Libellé', renommerLien: 'Renommer',
    supprimerLien: 'Supprimer ce lien', nouveauLien: 'Nouveau lien',
    depuis: 'Depuis', versCarte: 'Vers', ajouterLien: 'Ajouter le lien',
    lienAjoute: 'Lien ajouté. Donnez-lui un libellé ci-dessous.',
    lienRenomme: 'Libellé mis à jour.', lienSupprime: 'Lien supprimé.',
    lienExiste: 'Ce lien existe déjà.',
    memeCarte: 'Une carte ne peut pas se relier à elle-même.',
    aucunLien: 'Aucun lien sélectionné.',
    deplacees: 'cartes déplacées', liensPlus: 'liens ajoutés', liensMoins: 'liens retirés'
  };

  /* ── L'OUTIL, CONSTRUIT UNE SEULE FOIS ────────────────────
     Le meme outil sert sur deux pages : l'accueil de l'espace (en apercu
     deplie, sans retours) et la page Retours (avec retours et moderation).
     Son HTML etait COPIE dans les deux pages : toute evolution devait etre
     ecrite deux fois, et il suffisait d'en oublier une pour que les deux
     pages divergent sans que rien ne le signale.

     Il n'existe donc plus qu'ici. Chaque page ne porte qu'un conteneur vide,
     `<div id="fresque-outil" data-commentaires="oui|non">`, et c'est cet
     attribut qui decide des retours : onglet, pastilles, mode commentaires et
     chargement des retours n'existent pas quand il vaut « non ».

     Pas un seul attribut `style=` ici non plus : la CSP du site les refuse. */
  function construireOutil(hote) {
    var avecRetours = hote.getAttribute('data-commentaires') === 'oui';
    var fermerId = hote.getAttribute('data-fermer') || '';
    var h = [];

    h.push('<div class="fresque-zone" id="fresque-zone">');
    h.push('<div class="barre">');
    h.push('<div class="barre-g">');
    h.push('<button type="button" class="btn-outil" id="zoom-moins" aria-label="' + T.deZoomer + '">−</button>');
    h.push('<span class="zoom-val" id="zoom-val">100&nbsp;%</span>');
    h.push('<button type="button" class="btn-outil" id="zoom-plus" aria-label="' + T.zoomer + '">+</button>');
    h.push('<button type="button" class="btn-outil" id="plein-ecran">' + T.pleinEcran + '</button>');
    h.push('<label class="recherche"><span class="visuellement-cache" id="recherche-label">'
      + T.chercherCarte + '</span><input type="search" id="recherche" placeholder="' + T.chercherCarte
      + '…" aria-labelledby="recherche-label" autocomplete="off"></label>');
    h.push('</div>');
    h.push('<div class="barre-d">');
    /* SELECTEUR DE VUE, A DROITE. Deux boutons plutot qu'une liste deroulante :
       il n'y a que deux positions, et on doit voir laquelle est active sans
       l'ouvrir. A droite parce qu'il commande ce qu'on regarde, alors que la
       gauche rassemble ce qui agit sur l'affichage en cours (zoom, recherche). */
    h.push('<div class="vues" role="group" aria-label="' + T.choixVue + '">');
    h.push('<button type="button" class="btn-vue" id="vue-cartes" aria-pressed="false">' + T.vueCartes + '</button>');
    h.push('<button type="button" class="btn-vue est-active" id="vue-fresque" aria-pressed="true">' + T.vueFresque + '</button>');
    h.push('</div>');
    if (avecRetours) {
      h.push('<label class="bascule"><input type="checkbox" id="mode-commentaires"><span>'
        + T.modeCommentaires + '</span></label>');
      /* LE MODE EDITION N'APPARAIT QU'AVEC LE JETON. Deplacer les cartes de la
         fresque de reference n'est pas une lecture : c'est la preparation d'une
         publication. L'offrir a qui passe serait promettre une action que la
         fonction refusera. majEdition() le revele a la saisie du jeton. */
      h.push('<label class="bascule" id="bascule-edition" hidden><input type="checkbox" id="mode-edition"><span>'
        + T.modeEdition + '</span></label>');
      h.push('<button type="button" class="btn-outil" id="publier-modifs" hidden></button>');
      /* DEUX ACTIONS DISTINCTES, ET C'EST VOULU. « Publier » met en ligne tout
         de suite ; « Telecharger » replie les corrections dans le depot, qui
         fabrique le jeu imprime. On publie souvent, on replie de temps en
         temps : les confondre obligeait a passer par le depot pour corriger une
         virgule, et c'est ce qui rendait la correction d'une explication
         inabordable sans savoir coder. */
      h.push('<button type="button" class="btn-outil" id="deposer-modifs" hidden></button>');
      h.push('<button type="button" class="btn-outil quitter-plein" id="quitter-plein">' + T.fermer + '</button>');
    } else if (fermerId) {
      h.push('<button type="button" class="btn-outil quitter-plein" id="' + fermerId + '">' + T.fermer + '</button>');
    }
    h.push('</div></div>');

    h.push('<div class="lots" id="lots" role="group" aria-label="' + T.filtrerLot + '"></div>');
    h.push('<p class="cle-fleches"><span><span class="cle-trait cle-cause" aria-hidden="true"></span> '
      + T.provoque + '</span><span><span class="cle-trait cle-reponse" aria-hidden="true"></span> '
      + T.repond + '</span></p>');
    h.push('<p class="muted barre-aide" id="barre-aide">' + T.aideLecture + '</p>');

    /* ── LA BARRE D'EDITION ─────────────────────────────────
       Le geste (glisser une carte, tirer un lien) est le chemin rapide ; cette
       barre est le chemin precis, et le seul praticable au clavier. Les deux
       ecrivent par les memes fonctions : il n'y a pas une verite a la souris et
       une autre ailleurs. Rien ici n'est un surgissement place a la main : la
       CSP du site refuse les positions en attribut, et un panneau flottant mal
       place vaut moins qu'une barre qui reste ou on l'a laissee. */
    if (avecRetours) {
      h.push('<div class="barre-edition" id="barre-edition" hidden>');
      h.push('<div class="edition-rang">');
      h.push('<strong class="edition-titre">' + T.nouveauLien + '</strong>');
      h.push('<label for="f-de">' + T.depuis + '</label><select id="f-de"></select>');
      h.push('<label for="f-vers">' + T.versCarte + '</label><select id="f-vers"></select>');
      h.push('<button type="button" class="btn-outil" id="f-ajouter">' + T.ajouterLien + '</button>');
      h.push('</div>');
      h.push('<div class="edition-rang">');
      h.push('<label for="f-choix">' + T.choixLien + '</label><select id="f-choix"></select>');
      h.push('<label for="f-libelle">' + T.libelleLien + '</label>');
      h.push('<input id="f-libelle" type="text" maxlength="60" autocomplete="off">');
      h.push('<button type="button" class="btn-outil" id="f-renommer">' + T.renommerLien + '</button>');
      h.push('<button type="button" class="btn-outil btn-danger" id="f-supprimer">' + T.supprimerLien + '</button>');
      h.push('</div>');
      h.push('<div class="edition-rang">');
      h.push('<button type="button" class="btn-outil" id="f-annuler" disabled>' + T.annulerDernier + '</button>');
      h.push('<button type="button" class="btn-outil" id="f-enregistrer">' + T.enregistrerFresque + '</button>');
      h.push('<button type="button" class="btn-outil" id="f-oublier" hidden>' + T.oublierFresque + '</button>');
      h.push('<button type="button" class="btn-outil btn-fort" id="f-publier">' + T.publierFresque + '</button>');
      h.push('<p class="etat" id="f-etat" role="status" aria-live="polite"></p>');
      h.push('</div>');
      h.push('</div>');
    }
    h.push('<p class="etat" id="chargement" role="status" aria-live="polite">' + T.chargement + '</p>');

    h.push('<div id="plateau-hote" hidden>');
    /* Deux niveaux, et ce n'est pas superflu : `plateau` garde toujours sa
       taille et porte la mise a l'echelle, `sizer` prend la taille APRES
       echelle. Sans lui, le cadre ne sait pas quelle surface faire defiler. */
    h.push('<div class="plateau-cadre" id="plateau-cadre"><div class="plateau-sizer" id="plateau-sizer">');
    h.push('<div class="plateau" id="plateau"><svg class="liens" id="liens" aria-hidden="true"></svg>');
    h.push('<div class="cartes" id="cartes"></div><div class="etiquettes" id="etiquettes"></div>');
    h.push('</div></div></div>');
    // La vue Cartes : une grille, sans zoom ni defilement interne.
    h.push('<div class="grille-cartes" id="grille-cartes" hidden></div>');
    h.push('</div>');

    /* Le panneau est DANS la zone : hors de l'element passe en plein ecran, le
       navigateur ne le dessine pas, et cliquer une carte ne montrait plus rien. */
    h.push('<aside class="panneau" id="panneau" hidden aria-labelledby="panneau-titre">');
    h.push('<div class="panneau-onglets" id="panneau-onglets" role="tablist">');
    h.push('<button type="button" class="onglet est-actif" id="onglet-expl" role="tab" aria-selected="true" aria-controls="volet-expl">'
      + T.ongletExpl + '</button>');
    if (avecRetours) {
      h.push('<button type="button" class="onglet" id="onglet-retours" role="tab" aria-selected="false" aria-controls="volet-retours">'
        + T.ongletRetours + '<span class="onglet-nb" id="onglet-retours-nb" hidden></span></button>');
    }
    h.push('<button type="button" class="panneau-fermer" id="panneau-fermer" aria-label="' + T.fermerPanneau + '">✕</button>');
    h.push('</div>');
    h.push('<div class="panneau-corps">');
    h.push('<div class="volet" id="volet-expl" role="tabpanel" aria-labelledby="onglet-expl">');
    h.push('<img class="panneau-img" id="panneau-img" src="" alt="">');
    h.push('<h3 id="panneau-titre"></h3>');
    h.push('<div class="panneau-verso" id="panneau-verso"></div>');
    // Bloc « Explications » : masque tant que la carte n'en a pas.
    h.push('<div class="panneau-explication" id="panneau-explication" hidden></div>');
    h.push('<div class="panneau-liens" id="panneau-liens"></div>');
    /* CORRIGER LA CARTE LA OU ON LIT CE QU'ON LUI REPROCHE. Le bloc n'existe
       que sur la page Retours, et ne se montre qu'une fois le jeton de
       moderation saisi : on corrige un texte publie, pas une note personnelle. */
    if (avecRetours) {
      h.push('<div class="panneau-edition" id="panneau-edition" hidden>');
      h.push('<h4>' + T.corriger + '</h4>');
      h.push('<label for="e-titre">' + T.champTitre + '</label>');
      h.push('<input id="e-titre" type="text" maxlength="120">');
      h.push('<label for="e-verso">' + T.champVerso + '</label>');
      h.push('<textarea id="e-verso" rows="5"></textarea>');
      h.push('<label for="e-expl">' + T.champExplication + ' <span class="opt">(' + T.facultatif + ')</span></label>');
      h.push('<textarea id="e-expl" rows="4"></textarea>');
      h.push('<p class="aide-edition muted">' + T.aideParagraphes + '</p>');
      h.push('<div class="edition-actions">');
      h.push('<button type="button" class="btn btn-1" id="e-enregistrer">' + T.enregistrerModifs + '</button>');
      h.push('<button type="button" class="btn btn-2" id="e-annuler">' + T.annulerModifs + '</button>');
      h.push('</div>');
      h.push('<p class="etat" id="e-etat" role="status" aria-live="polite"></p>');
      h.push('</div>');
    }
    h.push('</div>');
    if (avecRetours) {
      h.push('<div class="volet" id="volet-retours" role="tabpanel" aria-labelledby="onglet-retours" hidden>');
      h.push('<ul class="retours retours-carte" id="retours-carte"></ul>');
      h.push('<div class="panneau-commentaire" id="panneau-commentaire" hidden>');
      h.push('<h4>' + T.retourSurCarte + '</h4>');
      h.push('<label class="visuellement-cache" for="c-texte">' + T.votreRetour + '</label>');
      h.push('<textarea id="c-texte" rows="3" maxlength="2000" placeholder="' + T.placeholderRetour + '"></textarea>');
      h.push('<label for="c-lien">' + T.concerneLien + ' <span class="opt">(' + T.facultatif + ')</span></label>');
      h.push('<select id="c-lien"><option value="">' + T.lienAucun + '</option></select>');
      /* Le champ n'apparait qu'une fois un lien choisi : demander ce qui pose
         probleme dans un lien qu'on n'a pas designe n'a pas de sens. */
      h.push('<div id="c-lien-bloc" hidden>');
      h.push('<label for="c-lien-texte">' + T.quoiDansLien + ' <span class="opt">(' + T.facultatif + ')</span></label>');
      h.push('<textarea id="c-lien-texte" rows="2" maxlength="2000" placeholder="' + T.placeholderLien + '"></textarea>');
      h.push('</div>');
      h.push('<label class="visuellement-cache" for="c-nom">' + T.votrePrenom + '</label>');
      h.push('<input id="c-nom" type="text" maxlength="40" placeholder="' + T.votrePrenom + ' (' + T.facultatif + ')">');
      h.push('<button type="button" class="btn btn-1" id="c-envoi">' + T.envoyer + '</button>');
      h.push('<p class="etat" id="c-etat" role="status" aria-live="polite"></p>');
      h.push('</div></div>');
    }
    h.push('</div></aside>');
    h.push('</div>');

    hote.innerHTML = h.join('');
    return avecRetours;
  }

  /* ── Chargement ─────────────────────────────────────────── */
  function charger() {
    return Promise.all([
      /* LE CALQUE DES CORRECTIONS PUBLIEES, par-dessus le fichier : c'est ici
         qu'on corrige, c'est donc ici d'abord qu'on doit voir le resultat. */
      fetch(RACINE + 'data/cartes.json').then(function (r) { return r.json(); })
        .then(function (d) { return window.CalqueCartes ? window.CalqueCartes.appliquer(d) : d; }),
      fetch(RACINE + 'data/fresque-reference.json').then(function (r) { return r.json(); })
    ]).then(function (res) {
      res[0].cartes.forEach(function (c) { cartes[c.n] = c; });
      ref = res[1];
      // Les dimensions viennent du fichier : ajouter une carte en bas de plan
      // ne doit pas obliger a retoucher ce script.
      if (ref.plan) {
        PLAN_W = ref.plan.largeur || PLAN_W;
        PLAN_H = ref.plan.hauteur || PLAN_H;
        if (ref.plan.carte) {
          CARTE_W = ref.plan.carte.largeur || CARTE_W;
          CARTE_H = ref.plan.carte.hauteur || CARTE_H;
        }
      }
      $('plateau').style.width = PLAN_W + 'px';
      $('plateau').style.height = PLAN_H + 'px';
    });
  }

  /* RECHARGER LES SEULS TEXTES. charger() relit aussi la fresque de reference :
     l'appeler apres une publication effacerait, sans prevenir, le plan qu'on
     est peut-etre en train de deplacer en mode edition. */
  function rechargerTextes() {
    return fetch(RACINE + 'data/cartes.json').then(function (r) { return r.json(); })
      .then(function (d) { return window.CalqueCartes ? window.CalqueCartes.appliquer(d) : d; })
      .then(function (d) { d.cartes.forEach(function (c) { cartes[c.n] = c; }); });
  }

  /* ── Rendu du plateau ───────────────────────────────────── */
  function centre(n) {
    var p = ref.tableau.cartes.find(function (c) { return c.n === n; });
    return p ? { x: p.x + CARTE_W / 2, y: p.y + CARTE_H / 2 } : null;
  }

  /* Ramene le trait au bord de la carte plutot qu'a son centre : sans cela les
     fleches disparaissent sous les vignettes et les tetes ne se voient plus. */
  function bord(depuis, vers) {
    var dx = vers.x - depuis.x, dy = vers.y - depuis.y;
    if (!dx && !dy) return depuis;
    var mx = CARTE_W / 2 + 6, my = CARTE_H / 2 + 6;
    var t = Math.min(Math.abs(dx) ? mx / Math.abs(dx) : Infinity,
                     Math.abs(dy) ? my / Math.abs(dy) : Infinity);
    return { x: depuis.x + dx * t, y: depuis.y + dy * t };
  }

  function dessinerLiens() {
    var svg = $('liens');
    svg.setAttribute('viewBox', '0 0 ' + PLAN_W + ' ' + PLAN_H);
    svg.setAttribute('width', PLAN_W);
    svg.setAttribute('height', PLAN_H);
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var NS = 'http://www.w3.org/2000/svg';
    ref.tableau.fleches.forEach(function (f) {
      var a = centre(f.de), b = centre(f.vers);
      if (!a || !b) return;
      var p1 = bord(a, b), p2 = bord(b, a);

      /* TRAITS COURBES. Soixante-cinq droites qui se croisent donnent un
         entrelacs ou l'oeil ne peut plus suivre un seul fil. Une courbe legere,
         toujours du meme cote, separe les traits qui partagent un trajet et
         rend chaque lien suivable du depart a l'arrivee. La fleche est de
         longueur constante : la courbure croit avec la distance, sans jamais
         devenir un detour. */
      var dx = p2.x - p1.x, dy = p2.y - p1.y;
      var lg = Math.hypot(dx, dy) || 1;
      var creux = Math.min(70, lg * 0.09);
      var cx = (p1.x + p2.x) / 2 - (dy / lg) * creux;
      var cy = (p1.y + p2.y) / 2 + (dx / lg) * creux;

      // Tangente a l'arrivee d'une quadratique : la direction (p2 - c).
      var ang = Math.atan2(p2.y - cy, p2.x - cx);
      var t = 13;
      var tx = p2.x - Math.cos(ang) * 4, ty = p2.y - Math.sin(ang) * 4;
      // Point median de la courbe, la ou se pose le libelle.
      var mx = (p1.x + 2 * cx + p2.x) / 4, my = (p1.y + 2 * cy + p2.y) / 4;

      var g = document.createElementNS(NS, 'g');
      g.dataset.de = f.de;
      g.dataset.vers = f.vers;
      g.dataset.id = f.id;
      /* UNE REPONSE N'EST PAS UNE CAUSE. Les fleches du lot 5 disent « repond
         a », pas « provoque ». Dessinees comme les autres, elles se lisent a
         l'envers : on croit que la solution cause le risque. Trait discontinu
         et couleur du lot : deux semantiques, deux traitements. */
      if (cartes[f.de] && cartes[f.de].lot === 5) g.setAttribute('class', 'reponse');

      var trait = document.createElementNS(NS, 'path');
      trait.setAttribute('d', 'M' + p1.x + ',' + p1.y + ' Q' + cx + ',' + cy + ' ' + tx + ',' + ty);
      trait.setAttribute('fill', 'none');

      var tete = document.createElementNS(NS, 'polygon');
      tete.setAttribute('class', 'tete');
      tete.setAttribute('points', [
        tx + ',' + ty,
        (tx - Math.cos(ang - 0.42) * t) + ',' + (ty - Math.sin(ang - 0.42) * t),
        (tx - Math.cos(ang + 0.42) * t) + ',' + (ty - Math.sin(ang + 0.42) * t)
      ].join(' '));

      var txt = document.createElementNS(NS, 'text');
      txt.setAttribute('class', 'halo');
      txt.setAttribute('x', mx);
      txt.setAttribute('y', my - 5);
      txt.setAttribute('text-anchor', 'middle');
      txt.textContent = f.libelle;

      /* UN TRAIT DE DEUX PIXELS NE SE CLIQUE PAS. En mode edition, on designe
         un lien pour le renommer ou le supprimer : on double donc la courbe
         d'un trait large et transparent, seul a recevoir le pointeur (voir
         `.en-edition .touche` dans la feuille de style). Hors edition il ne
         capte rien, et le survol des cartes continue de passer au travers. */
      var touche = document.createElementNS(NS, 'path');
      touche.setAttribute('class', 'touche');
      touche.setAttribute('d', trait.getAttribute('d'));
      touche.setAttribute('fill', 'none');

      g.appendChild(touche);
      g.appendChild(trait);
      g.appendChild(tete);
      g.appendChild(txt);
      if (editionFresque && f.id === lienChoisi) g.setAttribute('class',
        (g.getAttribute('class') || '') + ' choisi');
      svg.appendChild(g);
    });
  }

  // Couleurs des lots, reprises telles quelles du tableau en ligne : un
  // animateur qui connait l'un reconnait l'autre.
  var LOT_COULEUR = { 1: '#E8811C', 2: '#2f7d4f', 3: '#3b6ea5', 4: '#8a4fb3', 5: '#c1444e' };

  function dessinerCartes() {
    var hote = $('cartes');
    hote.textContent = '';
    ref.tableau.cartes.forEach(function (p) {
      var c = cartes[p.n];
      if (!c) return;
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'c-carte';
      el.dataset.n = p.n;
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
      if (c.lot) el.style.setProperty('--lot', LOT_COULEUR[c.lot] || 'var(--accent)');
      el.setAttribute('aria-label', c.titre);

      var vis = document.createElement('span');
      vis.className = 'vis';
      var img = document.createElement('img');
      img.src = RACINE + c.image.vignette;
      img.alt = '';
      img.loading = 'lazy';
      var num = document.createElement('span');
      num.className = 'num';
      num.textContent = p.n;
      vis.appendChild(img);
      vis.appendChild(num);

      // LE TITRE EST SUR LA CARTE, pas seulement dans une bulle. Sans lui, la
      // fresque vue de loin n'est qu'une mosaique d'images : on ne peut ni la
      // lire ni s'y reperer, il faut cliquer chaque carte pour savoir ce
      // qu'elle dit. C'est ce qui rendait la premiere version illisible.
      var tit = document.createElement('span');
      tit.className = 'tit';
      tit.textContent = c.titre;

      /* Pas de pastille de retours ici : voir majPastilles(). Le plan porte
         deja numeros, lots et fleches ; un chiffre de plus s'y perdait. */
      el.appendChild(vis);
      el.appendChild(tit);
      /* DEUX GESTES SUR LE MEME OBJET, DEUX PRISES DISTINCTES. Glisser le corps
         de la carte la deplace ; tirer cette poignee trace un lien. Sans elle,
         il faudrait un sous-mode a basculer avant chaque geste, et on se
         tromperait une fois sur deux. */
      if (editionFresque) {
        el.classList.add('deplacable');
        var poignee = document.createElement('span');
        poignee.className = 'poignee-lien';
        poignee.setAttribute('aria-hidden', 'true');
        poignee.title = T.poigneeLien;
        el.appendChild(poignee);
      }
      hote.appendChild(el);
    });

    var eti = $('etiquettes');
    eti.textContent = '';
    (ref.tableau.textes || []).forEach(function (t, i) {
      var d = document.createElement('div');
      d.className = 'etiquette';
      d.style.left = t.x + 'px';
      d.style.top = t.y + 'px';
      d.style.setProperty('--lot', LOT_COULEUR[i + 1] || 'var(--accent)');
      d.textContent = t.contenu;
      eti.appendChild(d);
    });
  }

  function echapper(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* CA CONCERNE LE LIEN AVEC LA CARTE X. « Cette carte devrait pointer vers
     l'autre » est le retour le plus frequent, et le plus inexploitable tant
     qu'on ne sait pas de quelle autre il s'agit. Le champ reste facultatif, et
     propose d'abord les cartes DEJA LIEES a celle qu'on commente : c'est sur un
     lien existant que porte neuf fois sur dix la remarque. Les autres cartes
     suivent, pour signaler un lien qui manque. */
  function remplirChoixLien(n, sort, entre, reponses) {
    var sel = $('c-lien');
    if (!sel) return;
    var deja = {}, liees = [];
    [sort, entre, reponses].forEach(function (groupe) {
      groupe.forEach(function (f) {
        var autre = f.de === n ? f.vers : f.de;
        if (autre === n || deja[autre] || !cartes[autre]) return;
        deja[autre] = true; liees.push(autre);
      });
    });
    var autres = Object.keys(cartes).map(Number).filter(function (m) {
      return m !== n && !deja[m];
    }).sort(function (a, b) { return a - b; });

    var option = function (m) {
      return '<option value="' + m + '">' + echapper(m + ' · ' + cartes[m].titre) + '</option>';
    };
    var html = '<option value="">' + echapper(T.lienAucun) + '</option>';
    if (liees.length) {
      html += '<optgroup label="' + echapper(T.lienLiees) + '">'
        + liees.map(option).join('') + '</optgroup>';
    }
    if (autres.length) {
      html += '<optgroup label="' + echapper(T.lienAutres) + '">'
        + autres.map(option).join('') + '</optgroup>';
    }
    sel.innerHTML = html;
    sel.value = '';
  }

  /* ── Mise en avant d'une carte et de ses liens ───────────── */
  function surligner(n) {
    cibleN = n;
    appliquerMiseEnAvant();
  }

  /* ── Filtrer par lot ────────────────────────────────────── */
  var lotActif = null;

  function construireLots() {
    var hote = $('lots');
    if (!hote) return;
    hote.textContent = '';
    var faire = function (n, texte) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'lot-puce' + (lotActif === n ? ' actif' : '');
      b.dataset.lot = n === null ? '' : n;
      b.setAttribute('aria-pressed', String(lotActif === n));
      if (n !== null) b.style.setProperty('--lot', LOT_COULEUR[n]);
      b.textContent = texte;
      hote.appendChild(b);
    };
    faire(null, T.tousLots);
    [1, 2, 3, 4, 5].forEach(function (n) { faire(n, T.lotNom[n]); });
  }

  /* Un seul endroit décide de ce qui est mis en avant : la carte choisie, le
     lot filtré, ou la recherche. Sans cela les trois se marchent dessus et
     l'on voit apparaître des cartes que l'on vient d'écarter. */
  function appliquerMiseEnAvant() {
    var q = ($('recherche') && $('recherche').value || '').trim().toLowerCase();
    var voisins = null;
    if (cibleN != null) {
      voisins = {};
      voisins[cibleN] = true;
      ref.tableau.fleches.forEach(function (f) {
        if (f.de === cibleN) voisins[f.vers] = true;
        if (f.vers === cibleN) voisins[f.de] = true;
      });
    }
    var trouves = 0;
    Array.prototype.forEach.call(document.querySelectorAll('.c-carte'), function (el) {
      var n = +el.dataset.n;
      var c = cartes[n];
      var gardee = true;
      if (lotActif != null && c && c.lot !== lotActif) gardee = false;
      if (q && c && c.titre.toLowerCase().indexOf(q) === -1) gardee = false;
      if (voisins && !voisins[n]) gardee = false;
      if (gardee) trouves++;
      el.classList.toggle('pale', !gardee);
      el.classList.toggle('actif', cibleN != null && n === cibleN);
      el.classList.toggle('trouve', !!q && gardee);
    });
    /* LE MEME FILTRE DES DEUX COTES. Les lots et la recherche sont dans
       l'en-tete commun : changer de vue avec un lot actif doit montrer ce meme
       lot, pas tout recommencer. La grille n'a pas de voisinage : on y cherche
       une carte, on n'y suit pas une chaine. */
    Array.prototype.forEach.call(document.querySelectorAll('.g-carte'), function (el) {
      var n = +el.dataset.n;
      var c = cartes[n];
      var gardee = true;
      if (lotActif != null && c && c.lot !== lotActif) gardee = false;
      if (q && c && c.titre.toLowerCase().indexOf(q) === -1) gardee = false;
      el.classList.toggle('pale', !gardee);
      el.classList.toggle('actif', cibleN != null && n === cibleN);
      el.classList.toggle('trouve', !!q && gardee);
    });
    Array.prototype.forEach.call(document.querySelectorAll('#liens g'), function (g) {
      var lie = cibleN != null && (+g.dataset.de === cibleN || +g.dataset.vers === cibleN);
      var dedans = lotActif == null
        || (cartes[+g.dataset.de] && cartes[+g.dataset.de].lot === lotActif)
        || (cartes[+g.dataset.vers] && cartes[+g.dataset.vers].lot === lotActif);
      g.classList.toggle('vif', lie);
      g.classList.toggle('pale', (cibleN != null && !lie) || (lotActif != null && !dedans));
      // L'aperçu de survol s'efface : sinon il reste allumé sous la sélection,
      // et deux mises en avant concurrentes se superposent.
      if (cibleN != null) g.classList.remove('survol');
    });
    var vide = $('recherche-vide');
    if (vide) vide.hidden = !(q && trouves === 0);
    majLibelles();
  }

  /* APERCU AU SURVOL. Avant de cliquer, on veut savoir ou mene une carte.
     Sans cela il faut ouvrir le panneau, lire, fermer, recommencer ; pour
     trente-huit cartes, c'est un parcours interminable. Le survol n'engage
     rien : il s'efface des qu'on part, et se tait des qu'une carte est
     choisie, pour ne pas concurrencer la selection. */
  function survoler(n) {
    /* PAS DE SURVOL EN EDITION. Les liens sont redessines a chaque pixel
       parcouru : la mise en avant s'allumerait et s'eteindrait sous le geste,
       et on la prendrait pour un bug. */
    if (cibleN != null || editionFresque) return;
    Array.prototype.forEach.call(document.querySelectorAll('#liens g'), function (g) {
      g.classList.toggle('survol', n != null && (+g.dataset.de === n || +g.dataset.vers === n));
    });
  }

  /* ── Panneau de lecture ─────────────────────────────────── */
  function ouvrirPanneau(n) {
    var c = cartes[n];
    if (!c) return;
    $('panneau-img').src = RACINE + c.image.vignette;
    $('panneau-img').alt = c.titre;
    $('panneau-titre').textContent = c.titre;
    $('panneau-verso').innerHTML = (c.verso || []).map(function (p) {
      return '<p>' + echapper(p) + '</p>';
    }).join('');

    /* LE BLOC « EXPLICATIONS ». Le verso tient sur une carte imprimee ; ce
       champ-ci n'est lu qu'a l'ecran et peut aller plus loin. Il est
       facultatif, et les 38 textes restent a ecrire : tant qu'une carte n'en a
       pas, le bloc n'existe pas, plutot qu'un titre suivi de rien. */
    var expl = $('panneau-explication');
    if (expl) {
      var textes = Array.isArray(c.explication) ? c.explication : [];
      expl.innerHTML = textes.length
        ? '<h4>' + echapper(T.titreExpl) + '</h4>' + textes.map(function (pp) {
            return '<p>' + echapper(pp) + '</p>';
          }).join('')
        : '';
      expl.hidden = !textes.length;
    }

    // On revient toujours sur « Explications » : c'est ce qu'on vient lire.
    choisirOnglet('expl');
    majOnglets();
    majOngletNb(n);
    remplirEdition(n);

    /* UNE REPONSE N'ENTRAINE PAS SON RISQUE. Les fleches partant du lot 5
       disent « repond a » : les ranger sous « ce que ca entraine » inverse le
       sens de lecture. On separe donc les causes des reponses, des deux
       cotes du lien. */
    var estReponse = function (f) { return cartes[f.de] && cartes[f.de].lot === 5; };
    var sort = [], entre = [], reponses = [];
    ref.tableau.fleches.forEach(function (f) {
      if (f.de === n && cartes[f.vers]) sort.push(f);
      if (f.vers === n && cartes[f.de]) (estReponse(f) ? reponses : entre).push(f);
    });
    var cSol = cartes[n] && cartes[n].lot === 5;
    /* Les cartes liées sont CLIQUABLES : c'est ainsi qu'on suit une chaîne de
       cause à effet, qui est exactement ce qu'on vient préparer. Une liste de
       titres inertes obligerait à les retrouver à l'œil sur le plateau. */
    var bloc = '';
    var lien = function (n, libelle, avant) {
      var t = '<button type="button" class="vers-carte" data-vers="' + n + '">'
        + echapper(cartes[n].titre) + '</button>';
      var q = '<span class="quoi">' + echapper(libelle) + '</span>';
      return '<li>' + (avant ? t + ' ' + q : q + ' ' + t) + '</li>';
    };
    if (entre.length) {
      bloc += '<h4>' + T.mene + '</h4><ul>'
        + entre.map(function (f) { return lien(f.de, f.libelle + ' →', true); }).join('')
        + '</ul>';
    }
    if (sort.length) {
      bloc += '<h4>' + (cSol ? T.repondA : T.entraine) + '</h4><ul>'
        + sort.map(function (f) { return lien(f.vers, f.libelle + ' →', false); }).join('')
        + '</ul>';
    }
    if (reponses.length) {
      bloc += '<h4 class="h-reponse">' + T.reponses + '</h4><ul class="l-reponse">'
        + reponses.map(function (f) { return lien(f.de, f.libelle + ' →', true); }).join('')
        + '</ul>';
    }
    $('panneau-liens').innerHTML = bloc;

    rendreRetoursCarte(n);
    remplirChoixLien(n, sort, entre, reponses);
    if ($('panneau-commentaire')) $('panneau-commentaire').hidden = !modeCom;
    if ($('c-texte')) $('c-texte').value = '';
    if ($('c-etat')) $('c-etat').textContent = '';
    $('panneau').hidden = false;
    surligner(n);
    // Le plateau se retire sous le panneau : à l'échelle d'ajustement il n'y a
    // aucun défilement horizontal possible, donc une carte de la colonne de
    // droite resterait cachée par le panneau qu'on vient d'ouvrir pour elle.
    document.body.classList.add('panneau-ouvert');
    // On ne réajuste PAS le zoom : le recalculer sur un cadre rétréci ferait
    // rapetisser la fresque à chaque clic, et on finirait par ne plus rien
    // lire. Le cadre perd de la largeur, le défilement compense.
    setTimeout(function () { hauteurCadre(); amenerEnVue(n); }, 30);
  }

  /* Le panneau s'ouvre par-dessus la droite du plateau : sans cela, cliquer une
     carte de la colonne « Solutions » la fait disparaitre derriere le panneau
     au moment meme ou on la selectionne. On fait donc defiler le plateau pour
     garder la carte dans la partie restee visible. */
  function amenerEnVue(n) {
    var p = ref.tableau.cartes.find(function (c) { return c.n === n; });
    var cadre = $('plateau-cadre');
    if (!p || !cadre) return;
    var largeurPanneau = $('panneau').hidden ? 0 : $('panneau').getBoundingClientRect().width;
    var cadreRect = cadre.getBoundingClientRect();
    var visible = Math.max(120, Math.min(cadreRect.right, window.innerWidth - largeurPanneau) - cadreRect.left);
    var x = (p.x + CARTE_W / 2) * zoom;
    var y = (p.y + CARTE_H / 2) * zoom;
    var cibleX = x - visible / 2;
    var cibleY = y - cadre.clientHeight / 2;
    if (cadre.scrollTo) cadre.scrollTo({ left: cibleX, top: cibleY, behavior: 'smooth' });
    else { cadre.scrollLeft = cibleX; cadre.scrollTop = cibleY; }
  }

  function fermerPanneau() {
    $('panneau').hidden = true;
    document.body.classList.remove('panneau-ouvert');
    surligner(null);
    hauteurCadre();
  }

  /* ── Zoom et deplacement ────────────────────────────────── */
  /* LISIBILITE DES LIBELLES. Soixante-cinq libelles affiches en meme temps a
     l'echelle d'ajustement donnent un plat de spaghettis ou rien ne se lit.
     On ne les montre donc que lorsqu'ils sont lisibles (zoom suffisant) ou
     lorsqu'ils repondent a une question posee (une carte selectionnee, dont on
     n'eclaire que les liens). */
  function majLibelles() {
    $('liens').classList.toggle('tous-libelles', cibleN == null && zoom >= 0.55);
  }

  function appliquerZoom() {
    $('plateau').style.transform = 'scale(' + zoom + ')';
    /* LA POIGNEE RESTE ATTRAPABLE A TOUTE ECHELLE. Le plateau s'ouvre a 35 % :
       une poignee de 21 pixels de plan n'en fait plus que 7 a l'ecran, soit
       moins que le pouce le plus fin. On la grossit a mesure qu'on dezoome,
       sans jamais depasser le quart de la carte, ou elle masquerait la
       vignette qu'elle sert a designer. */
    $('plateau').style.setProperty('--poignee',
      Math.round(21 * Math.min(2.2, Math.max(1, 0.75 / zoom))) + 'px');
    $('plateau-sizer').style.width = (PLAN_W * zoom) + 'px';
    $('plateau-sizer').style.height = (PLAN_H * zoom) + 'px';
    $('zoom-val').textContent = Math.round(zoom * 100) + ' %';
  }
  function ajuster() {
    var cadre = $('plateau-cadre');
    var dispo = cadre.clientWidth - 8;
    zoom = Math.max(0.12, Math.min(1, dispo / PLAN_W));
    appliquerZoom();
    hauteurCadre();
  }

  /* Le cadre epouse la hauteur de la fresque une fois mise a l'echelle, sans
     depasser ce que l'ecran peut montrer : autrement il reste une large bande
     vide sous la derniere carte. Appele aussi quand le panneau retrecit le
     cadre, car la fresque y tient alors sur plus de hauteur. */
  function hauteurCadre() {
    var cadre = $('plateau-cadre');
    if (!cadre) return;
    /* EN PLEIN ECRAN, la hauteur vient de la MISE EN PAGE (flex), pas d'ici :
       le cadre remplit ce qui reste sous la barre. Toute arithmetique a base
       de hauteurs laissait quelques pixels de debordement, donc un ascenseur,
       et c'est precisement ce qu'on ne veut pas voir en plein ecran. */
    if (document.fullscreenElement) { cadre.style.height = ''; return; }
    var vue = Math.min(window.innerHeight * 0.72, 760);
    cadre.style.height = Math.min(PLAN_H * zoom + 8, vue) + 'px';
  }

  /* ZOOM D'OUVERTURE. Sur un telephone, ajuster la fresque entiere donne 12 % :
     on voit la forme d'ensemble et pas un seul titre, ce qui ne sert a rien.
     On ouvre donc a une echelle ou les titres se lisent, quitte a faire
     defiler. Le bouton « Ajuster » reste la pour prendre du recul. */
  function zoomInitial() {
    ajuster();
    if (zoom < 0.32) {
      zoom = 0.5;
      appliquerZoom();
      var cadre = $('plateau-cadre');
      cadre.style.height = Math.min(PLAN_H * zoom + 8, Math.min(window.innerHeight * 0.72, 760)) + 'px';
    }
  }

  function glisser(cadre) {
    var actif = false, x0 = 0, y0 = 0, sx = 0, sy = 0;
    cadre.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.c-carte')) return;
      /* EN EDITION, DESIGNER UN LIEN N'EST PAS DEPLACER LA VUE. Sans ce
         garde-fou, `setPointerCapture` sur le cadre reroute le relacher vers
         lui : le `click` se produit alors sur le cadre et non sur le trait, et
         le lien ne se selectionnait jamais. */
      if (editionFresque && e.target.closest && e.target.closest('g[data-id]')) return;
      actif = true; x0 = e.clientX; y0 = e.clientY;
      sx = cadre.scrollLeft; sy = cadre.scrollTop;
      cadre.classList.add('attrape');
      cadre.setPointerCapture(e.pointerId);
    });
    cadre.addEventListener('pointermove', function (e) {
      if (!actif) return;
      cadre.scrollLeft = sx - (e.clientX - x0);
      cadre.scrollTop = sy - (e.clientY - y0);
    });
    ['pointerup', 'pointercancel'].forEach(function (ev) {
      cadre.addEventListener(ev, function () { actif = false; cadre.classList.remove('attrape'); });
    });
  }

  /* LE MEME MODULE SERT DEUX PAGES. Sur l'onglet Retours, la fresque
     s'accompagne des commentaires, du formulaire general et de la moderation.
     Sur l'accueil de l'espace, elle est depliee EN LECTURE SEULE : aucun de ces
     elements n'existe dans la page. `on` evite d'avoir a dupliquer un balisage
     de quarante identifiants juste pour montrer un plateau. */
  function on(id, ev, fn) { var el = $(id); if (el) el.addEventListener(ev, fn); }

  /* ── Commentaires ───────────────────────────────────────── */
  var API = '/.netlify/functions/commentaires';
  /* Chemin vers la racine du site : /animateurs/ est a un niveau,
     /en/facilitators/ a deux. Le HTML le declare, le script s'y fie. */
  var RACINE = document.body.dataset.racine || '../';

  function envoyer(charge, etatEl) {
    etatEl.className = 'etat';
    etatEl.textContent = T.envoi;
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(charge)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok || !d.ok) throw new Error(d.erreur || T.echecEnvoi);
        etatEl.className = 'etat ok';
        etatEl.textContent = T.merci;
        return d;
      });
    }).catch(function (e) {
      etatEl.className = 'etat err';
      etatEl.textContent = e.message || T.echecEnvoi;
      throw e;
    });
  }

  function chargerRetours() {
    return fetch(API)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        retours = d.retours || [];
        majPastilles(d.compte || {});
        rendreRetours();
        if (cibleN != null) rendreRetoursCarte(cibleN);
      })
      .catch(function () { /* la liste est un agrément, pas une dépendance */ });
  }

  /* LE NOMBRE DE RETOURS SE LIT A DEUX ENDROITS, ET PAS TROIS. Sur la vue
     Fresque, une pastille par carte ajoutait un chiffre de plus a un plan deja
     dense, ou se croisent deja numeros, lots et fleches. On la garde donc sur
     la vue Cartes, qui est faite pour parcourir, et sur l'onglet Retours du
     panneau, qui reste visible depuis les deux vues. */
  var compteRetours = {};
  function majPastilles(compte) {
    compteRetours = compte || {};
    Array.prototype.forEach.call(document.querySelectorAll('.g-carte'), function (el) {
      var p = el.querySelector('.pastille');
      if (!p) return;
      var k = compteRetours[el.dataset.n] || 0;
      p.hidden = !k;
      p.textContent = k;
      p.setAttribute('aria-label', k + ' ' + T.ongletRetours.toLowerCase());
    });
    majOngletNb(cibleN);
  }

  /* Le petit chiffre porte par l'onglet « Retours », masque a zero. */
  function majOngletNb(n) {
    var el = $('onglet-retours-nb');
    if (!el) return;
    var k = (n == null) ? 0 : (compteRetours[n] || 0);
    el.hidden = !k;
    el.textContent = k;
  }

  function ligneRetour(r) {
    var quand = new Date(r.date).toLocaleDateString(T.langue,
      { day: 'numeric', month: 'long', year: 'numeric' });
    var quoi = r.carte != null && cartes[r.carte]
      ? cartes[r.carte].titre
      : (T.sujets[r.sujet] || r.sujet);
    if (r.lien != null && cartes[r.lien]) {
      quoi += ' · ' + T.lienAvec + ' ' + r.lien + ' · ' + cartes[r.lien].titre;
    }
    var html = '<li class="' + (r.valide ? '' : 'attente') + (r.traite ? ' traite' : '')
      + '" data-cle="' + echapper(r.cle) + '">'
      + '<div class="meta">'
      + '<strong>' + echapper(r.nom || T.anonyme) + '</strong>'
      + '<span>·</span><span>' + echapper(quoi) + '</span>'
      + '<span>·</span><span>' + echapper(quand) + '</span>'
      + (r.valide ? '' : '<span class="badge-attente">' + T.attente + '</span>')
      + '</div>'
      + '<p class="texte">' + echapper(r.texte) + '</p>';
    /* CE QUI NE VA PAS DANS LE LIEN, sous le retour et rattache a sa fleche.
       Sans le nom de la carte liee, « le sens est inverse » ne designe rien. */
    if (r.lienTexte && r.lien != null && cartes[r.lien]) {
      html += '<p class="texte texte-lien"><span class="quoi-lien">'
        + echapper(T.lienAvecCarte + ' ' + r.lien + ' · ' + cartes[r.lien].titre)
        + '</span> : ' + echapper(r.lienTexte) + '</p>';
    }
    if (jeton) {
      html += '<div class="actions">'
        + (r.valide ? '' : '<button type="button" class="valider">' + T.valider + '</button>')
        + '<button type="button" class="traiter' + (r.traite ? ' est-traite' : '') + '">'
        + T.prisEnCompte + '</button>'
        + '<button type="button" class="supprimer">' + T.supprimer + '</button></div>';
    }
    return html + '</li>';
  }

  function rendreRetours() {
    var hote = $('retours');
    if (!hote) return;
    if (!retours.length) {
      hote.innerHTML = '<li class="retours-vide">' + echapper(T.vide) + '</li>';
      return;
    }
    hote.innerHTML = retours.map(ligneRetour).join('');
  }

  function rendreRetoursCarte(n) {
    var hote = $('retours-carte');
    if (!hote) return;
    var liste = retours.filter(function (r) { return r.carte === n; });
    hote.innerHTML = liste.length ? liste.map(ligneRetour).join('') : '';
  }

  function moderer(cle, action) {
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action, cle: cle, jeton: jeton })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok || !d.ok) throw new Error(d.erreur || T.echecAction);
      });
    }).then(chargerRetours);
  }

  /* ── BROUILLONS DE CARTES ───────────────────────────────────
     On lit les retours sur une carte, on corrige, on passe a la suivante.
     Publier a chaque correction ferait autant de versions de cartes.json qu'il
     y a de virgules deplacees, et chacune devrait etre relue. On accumule donc,
     on relit ensemble, on publie une fois.

     RIEN N'EST ECRIT DANS LE DEPOT D'ICI. « Publier » telecharge le fichier
     complet ; il se depose a la main, la CI le valide, quelqu'un relit. Donner
     a une fonction publique un droit d'ecriture sur le depot, garde par le seul
     jeton de moderation, serait une surface d'attaque pour un gain faible. */
  var API_BROUILLONS = '/.netlify/functions/brouillons';
  var brouillons = {};   // n -> brouillon enregistre

  var publies = [];   // les corrections DEJA en ligne, pas encore dans le depot

  function majBoutonPublier() {
    var b = $('publier-modifs');
    if (b) {
      var n = Object.keys(brouillons).length;
      b.hidden = !jeton || !n;
      b.textContent = T.publierModifs + ' (' + n + ')';
    }
    var d = $('deposer-modifs');
    if (d) {
      d.hidden = !jeton || !publies.length;
      d.textContent = T.deposer + ' (' + publies.length + ')';
      d.title = T.pourquoiDeposer;
    }
  }

  function chargerBrouillons() {
    if (!jeton || !$('panneau-edition')) return Promise.resolve();
    return fetch(API_BROUILLONS + '?jeton=' + encodeURIComponent(jeton))
      .then(function (r2) { return r2.ok ? r2.json() : null; })
      .then(function (d) {
        brouillons = {};
        if (d && d.ok) (d.brouillons || []).forEach(function (b) { brouillons[b.n] = b; });
        /* LE BROUILLON DE LA FRESQUE NE S'APPLIQUE PAS A LA LECTURE. On le
           garde de cote : il ne remplace la fresque publiee qu'une fois entre
           en mode edition. Sinon la page Retours montrerait un plan que
           personne d'autre ne voit, et les retours porteraient sur lui. */
        brouillonFresque = (d && d.ok && d.fresque) ? d.fresque : null;
        publies = (d && d.ok && d.publie) ? d.publie : [];
        majBoutonPublier();
        majEdition();
        if (cibleN != null) remplirEdition(cibleN);
      })
      .catch(function () { /* l'edition reste possible, sans l'etat deja connu */ });
  }

  /* Les champs montrent le texte EFFECTIF : le brouillon s'il existe, sinon la
     carte publiee. Montrer l'original alors qu'un brouillon attend ferait
     reecrire la meme correction, ou l'annuler sans le vouloir. */
  function remplirEdition(n) {
    var bloc = $('panneau-edition');
    if (!bloc) return;
    bloc.hidden = !jeton;
    if (!jeton) return;
    var c = cartes[n] || {}, b = brouillons[n] || {};
    $('e-titre').value = b.titre !== undefined ? b.titre : (c.titre || '');
    $('e-verso').value = (b.verso !== undefined ? b.verso : (c.verso || [])).join('\n\n');
    $('e-expl').value = (b.explication !== undefined ? b.explication : (c.explication || [])).join('\n\n');
    $('e-annuler').hidden = !brouillons[n];
    $('e-etat').textContent = brouillons[n] ? T.enregistre : '';
    $('e-etat').className = 'etat';
    bloc.classList.toggle('a-un-brouillon', !!brouillons[n]);
  }

  function envoyerBrouillon(charge) {
    var etat = $('e-etat');
    etat.className = 'etat';
    etat.textContent = T.envoi;
    return fetch(API_BROUILLONS, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ jeton: jeton }, charge))
    }).then(function (r2) {
      return r2.json().then(function (d) {
        if (!r2.ok || !d.ok) throw new Error(d && d.erreur ? d.erreur : T.echecAction);
        return d;
      });
    }).catch(function (e) {
      etat.className = 'etat err';
      etat.textContent = e.message || T.echecAction;
      throw e;
    });
  }


  /* ── MODE EDITION DE LA FRESQUE DE REFERENCE ────────────────
     La fresque de reference se construisait en editant
     site/data/fresque-reference.json a la main : trente-huit cartes a placer
     coordonnee par coordonnee, soixante-cinq fleches a decrire, et le resultat
     ne se voyait qu'une fois le fichier depose. On deplace donc les cartes la
     ou on les regarde, et on relit avant de publier.

     DEUX ETATS BIEN SEPARES. Le brouillon vit cote serveur (un seul, la fresque
     n'a de sens qu'entiere) et ne se voit qu'avec le jeton ; la fresque publiee
     reste celle que tout le monde lit, y compris sur cette page tant qu'on
     n'est pas entre en edition. Rien de ce qu'on bouge ici n'est visible
     ailleurs avant que le fichier ne soit depose dans le depot.

     COMME POUR LES CARTES : PUBLIER TELECHARGE, IL N'ECRIT PAS. Voir le
     commentaire du bloc des brouillons. */
  var brouillonFresque = null;   // le tableau enregistre cote serveur, s'il existe
  var histoire = [];             // les etats precedents, pour « Annuler »
  var modifie = false;           // quelque chose a bouge depuis le dernier enregistrement
  var MAX_HISTOIRE = 40;

  function clonerTableau(t) { return JSON.parse(JSON.stringify(t || ref.tableau)); }

  /* ON MEMORISE AVANT DE TOUCHER, pas apres : « Annuler » doit rendre l'etat
     d'avant le geste. Appele au PREMIER mouvement d'un glisser, et non au
     clic : sans cela, trente clics sans deplacement rempliraient la pile et
     « Annuler » ne ferait plus rien de visible. */
  function memoriser() {
    histoire.push(clonerTableau());
    if (histoire.length > MAX_HISTOIRE) histoire.shift();
    modifie = true;
    majEdition();
  }

  function etatEdition(texte, erreur) {
    var e = $('f-etat');
    if (!e) return;
    e.className = 'etat' + (erreur ? ' err' : (texte ? ' ok' : ''));
    e.textContent = texte || '';
  }

  function borne(v, max) { return Math.max(0, Math.min(max, Math.round(v))); }

  function fleche(id) {
    return ref.tableau.fleches.find(function (f) { return f.id === id; }) || null;
  }

  function majEdition() {
    var barre = $('barre-edition');
    if (barre) barre.hidden = !editionFresque;
    if ($('bascule-edition')) $('bascule-edition').hidden = !jeton;
    if ($('f-annuler')) $('f-annuler').disabled = !histoire.length;
    if ($('f-oublier')) $('f-oublier').hidden = !brouillonFresque;
    var l = fleche(lienChoisi);
    ['f-libelle', 'f-renommer', 'f-supprimer'].forEach(function (id) {
      if ($(id)) $(id).disabled = !l;
    });
  }

  /* Les listes deroulantes se refont apres chaque changement : un lien supprime
     ne doit pas rester proposable, et une carte retiree du plan ne doit pas
     pouvoir recevoir une fleche que le serveur refuserait. */
  function majSelectsCartes() {
    if (!$('f-de')) return;
    var opts = ref.tableau.cartes.slice().sort(function (a, b) { return a.n - b.n; })
      .map(function (p) {
        var c = cartes[p.n] || {};
        return '<option value="' + p.n + '">' + p.n + ' · ' + echapper(c.titre || '') + '</option>';
      }).join('');
    ['f-de', 'f-vers'].forEach(function (id) {
      var sel = $(id), avant = sel.value;
      sel.innerHTML = opts;
      if (avant) sel.value = avant;
    });
  }

  function majChoixLien() {
    var sel = $('f-choix');
    if (!sel) return;
    sel.innerHTML = '<option value="">' + T.lienAucun + '</option>'
      + ref.tableau.fleches.map(function (f) {
        return '<option value="' + echapper(f.id) + '">' + f.de + ' → ' + f.vers
          + (f.libelle ? ' : ' + echapper(f.libelle) : '') + '</option>';
      }).join('');
    sel.value = lienChoisi || '';
    var l = fleche(lienChoisi);
    if ($('f-libelle')) $('f-libelle').value = l ? l.libelle : '';
    majEdition();
  }

  /* Designer un lien, a la souris sur le plateau comme au clavier dans la
     liste : un seul chemin, pour que les deux montrent toujours la meme chose. */
  function choisirLien(id, focus) {
    lienChoisi = fleche(id) ? id : null;
    majChoixLien();
    dessinerLiens();
    if (focus && lienChoisi && $('f-libelle')) $('f-libelle').focus();
  }

  function idLibre() {
    var pris = {}, i = 1;
    ref.tableau.fleches.forEach(function (f) { pris[f.id] = true; });
    while (pris['f' + i]) i++;
    return 'f' + i;
  }

  function ajouterLien(de, vers) {
    if (de === vers) { etatEdition(T.memeCarte, true); return; }
    var deja = ref.tableau.fleches.some(function (f) { return f.de === de && f.vers === vers; });
    if (deja) {
      /* ON NE CREE PAS UN DOUBLON, ON OUVRE CELUI QUI EXISTE : le serveur
         accepterait deux fleches identiques, et on ne verrait qu'un trait. */
      var v = ref.tableau.fleches.filter(function (f) { return f.de === de && f.vers === vers; })[0];
      choisirLien(v.id, true);
      etatEdition(T.lienExiste, true);
      return;
    }
    memoriser();
    var id = idLibre();
    ref.tableau.fleches.push({ id: id, de: de, vers: vers, bidir: false, libelle: '' });
    lienChoisi = id;
    majSelectsCartes();
    majChoixLien();
    dessinerLiens();
    if ($('f-libelle')) $('f-libelle').focus();
    etatEdition(T.lienAjoute, false);
  }

  function annulerDernier() {
    if (!histoire.length) return;
    ref.tableau = histoire.pop();
    if (!fleche(lienChoisi)) lienChoisi = null;
    majSelectsCartes();
    majChoixLien();
    dessinerCartes();
    dessinerLiens();
    appliquerMiseEnAvant();
    etatEdition(histoire.length ? T.nonEnregistre : '', false);
    majEdition();
  }

  /* ── LE GLISSER-DEPOSER ─────────────────────────────────────
     Une seule paire d'ecouteurs, posee sur le conteneur des cartes : celles-ci
     sont refaites a chaque rendu, et les leur attacher une a une les perdrait a
     chaque redessin. PAS D'ALIGNEMENT AUTOMATIQUE : la carte va ou on la pose.
     Un magnetisme sur grille redresserait des ecarts voulus, et il n'y a pas de
     grille a laquelle se rapporter. */
  var liensDiffere = null;
  function planifierLiens() {
    if (liensDiffere) return;
    liensDiffere = requestAnimationFrame(function () {
      liensDiffere = null;
      dessinerLiens();
      /* Les liens reconstruits ont perdu les classes du filtre par lot et de la
         selection : sans ce rappel, un lot actif se rallumerait en entier des
         qu'on deplace une carte. */
      appliquerMiseEnAvant();
    });
  }

  function versPlan(cx, cy) {
    var r = $('plateau').getBoundingClientRect();
    return { x: (cx - r.left) / zoom, y: (cy - r.top) / zoom };
  }

  function carteSous(cx, cy) {
    var el = document.elementFromPoint(cx, cy);
    var c = el && el.closest ? el.closest('.c-carte') : null;
    return c ? +c.dataset.n : null;
  }

  function tracer(p, cx, cy) {
    var svg = $('liens');
    var NS = 'http://www.w3.org/2000/svg';
    var t = svg.querySelector('.trace');
    if (!t) {
      t = document.createElementNS(NS, 'line');
      t.setAttribute('class', 'trace');
      svg.appendChild(t);
    }
    var fin = versPlan(cx, cy);
    t.setAttribute('x1', p.x + CARTE_W / 2);
    t.setAttribute('y1', p.y + CARTE_H / 2);
    t.setAttribute('x2', fin.x);
    t.setAttribute('y2', fin.y);
  }
  function effacerTrace() {
    var t = $('liens').querySelector('.trace');
    if (t) t.remove();
  }

  function glisserCartes(hote) {
    var el = null, p = null, px0 = 0, py0 = 0, x0 = 0, y0 = 0;
    var versLien = false, bouge = false, memorise = false;

    hote.addEventListener('pointerdown', function (e) {
      if (!editionFresque || e.button) return;
      var c = e.target.closest('.c-carte');
      if (!c) return;
      p = ref.tableau.cartes.find(function (q) { return q.n === +c.dataset.n; });
      if (!p) return;
      el = c;
      versLien = !!(e.target.closest && e.target.closest('.poignee-lien'));
      bouge = false; memorise = false;
      x0 = e.clientX; y0 = e.clientY; px0 = p.x; py0 = p.y;
      /* On preempte le geste : sans cela le navigateur commence une selection
         de texte ou un glisser d'image, et la carte reste collee au pointeur. */
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* sans capture, ca marche encore */ }
    });

    hote.addEventListener('pointermove', function (e) {
      if (!el || !p) return;
      var dx = e.clientX - x0, dy = e.clientY - y0;
      if (!bouge && Math.abs(dx) + Math.abs(dy) < 4) return;
      bouge = true;
      if (versLien) { tracer(p, e.clientX, e.clientY); return; }
      // UN SEUL ETAT MEMORISE POUR TOUT LE GLISSER : une entree par pixel
      // parcouru remplirait la pile et « Annuler » ne reculerait plus que d'un
      // cheveu.
      if (!memorise) { memorise = true; memoriser(); }
      p.x = borne(px0 + dx / zoom, PLAN_W - CARTE_W);
      p.y = borne(py0 + dy / zoom, PLAN_H - CARTE_H);
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
      planifierLiens();
    });

    ['pointerup', 'pointercancel'].forEach(function (ev) {
      hote.addEventListener(ev, function (e) {
        if (!el || !p) return;
        if (versLien) {
          effacerTrace();
          if (bouge) {
            var n = carteSous(e.clientX, e.clientY);
            if (n != null) ajouterLien(p.n, n);
          }
        } else if (bouge) {
          dessinerLiens();
          etatEdition(T.nonEnregistre, false);
        }
        el = null; p = null; versLien = false; bouge = false; memorise = false;
      });
    });
  }

  /* AU CLAVIER AUSSI. Un outil qui ne s'utilise qu'a la souris exclut une
     partie de l'equipe, et le glisser-deposer n'a pas d'equivalent au clavier.
     Les fleches deplacent la carte qui a le focus, de dix pixels, d'un seul
     avec Maj : c'est aussi le seul moyen d'un placement exact. */
  function deplacerAuClavier(e) {
    if (!editionFresque) return;
    var c = e.target.closest ? e.target.closest('.c-carte') : null;
    if (!c) return;
    var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    var p = ref.tableau.cartes.find(function (q) { return q.n === +c.dataset.n; });
    if (!p) return;
    e.preventDefault();
    var pas = e.shiftKey ? 1 : 10;
    memoriser();
    p.x = borne(p.x + d[0] * pas, PLAN_W - CARTE_W);
    p.y = borne(p.y + d[1] * pas, PLAN_H - CARTE_H);
    c.style.left = p.x + 'px';
    c.style.top = p.y + 'px';
    planifierLiens();
    etatEdition(T.nonEnregistre, false);
  }

  /* ENTRER EN EDITION REPREND LE BROUILLON s'il y en a un : on continue ce
     qu'on avait commence, on ne recommence pas sur la version publiee. En
     sortir laisse a l'ecran ce qu'on vient de faire, avec son avertissement :
     effacer sans le dire ce qu'on n'a pas enregistre serait pire. */
  function basculerEdition(actif) {
    if (!actif && modifie && !window.confirm(T.quitterEdition)) {
      if ($('mode-edition')) $('mode-edition').checked = true;
      return;
    }
    editionFresque = !!actif && !!jeton;
    if ($('mode-edition')) $('mode-edition').checked = editionFresque;
    if (editionFresque) {
      basculerVue('fresque');
      fermerPanneau();
      /* Les deux modes se disputent le clic sur une carte : commenter ouvre le
         panneau, editer la deplace. On n'en laisse qu'un actif. */
      if ($('mode-commentaires')) {
        $('mode-commentaires').checked = false;
        $('mode-commentaires').disabled = true;
      }
      modeCom = false;
      majOnglets();
      if (brouillonFresque) {
        ref.tableau = clonerTableau(brouillonFresque);
        modifie = false;
      }
    } else if ($('mode-commentaires')) {
      $('mode-commentaires').disabled = false;
    }
    histoire = [];
    lienChoisi = null;
    // On ne quitte pas la vue Fresque en editant : il n'y a rien a deplacer
    // dans une grille triee par numero.
    ['vue-cartes', 'vue-fresque'].forEach(function (id) {
      if ($(id)) $(id).disabled = editionFresque;
    });
    if ($('plateau')) $('plateau').classList.toggle('en-edition', editionFresque);
    if ($('barre-aide')) $('barre-aide').textContent = editionFresque
      ? T.aideEdition : (modeCom ? T.aideCommentaire : T.aideLecture);
    majSelectsCartes();
    majChoixLien();
    dessinerCartes();
    dessinerLiens();
    appliquerMiseEnAvant();
    etatEdition(editionFresque && brouillonFresque ? T.brouillonEnCours : '', false);
    majEdition();
  }

  function envoyerFresque(charge) {
    etatEdition(T.envoi, false);
    return fetch(API_BROUILLONS, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ jeton: jeton }, charge))
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok || !d.ok) throw new Error(d && d.erreur ? d.erreur : T.echecAction);
        return d;
      });
    }).catch(function (e) {
      etatEdition(e.message || T.echecAction, true);
      throw e;
    });
  }

  function resumeFresque(r) {
    if (!r) return '';
    return [r.cartesDeplacees + ' ' + T.deplacees,
            r.liensAjoutes + ' ' + T.liensPlus,
            r.liensRetires + ' ' + T.liensMoins].join(', ');
  }

  /* ── VUE CARTES ─────────────────────────────────────────────
     Les 38 cartes en grille, par numero croissant, sans zoom ni defilement
     interne. La vue Fresque dit comment les cartes s'enchainent ; celle-ci
     sert a retrouver une carte et a voir d'un coup d'oeil ou les retours se
     concentrent. La carte 0 (l'introduction) en est exclue : elle n'a pas de
     place dans la fresque et n'en a pas davantage ici. */
  var vue = 'fresque';

  function dessinerGrille() {
    var hote = $('grille-cartes');
    if (!hote) return;
    hote.textContent = '';
    Object.keys(cartes).map(Number).filter(function (n) { return n >= 1; })
      .sort(function (a2, b2) { return a2 - b2; })
      .forEach(function (n) {
        var c = cartes[n];
        var el = document.createElement('button');
        el.type = 'button';
        el.className = 'g-carte';
        el.dataset.n = n;
        if (c.lot) el.style.setProperty('--lot', LOT_COULEUR[c.lot] || 'var(--accent)');
        el.setAttribute('aria-label', T.numeroCarte + ' ' + n + ' : ' + c.titre);

        var vis = document.createElement('span');
        vis.className = 'g-vis';
        var img = document.createElement('img');
        img.src = RACINE + c.image.vignette;
        img.alt = '';
        img.loading = 'lazy';
        /* LE NUMERO EN GRAND, AU MILIEU. C'est par lui qu'on cherche une carte
           quand on prepare un atelier : la vignette seule oblige a la
           reconnaitre, le numero se lit. */
        var num = document.createElement('span');
        num.className = 'g-num';
        num.textContent = n;
        vis.appendChild(img);
        vis.appendChild(num);

        var tit = document.createElement('span');
        tit.className = 'g-tit';
        tit.textContent = c.titre;

        el.appendChild(vis);
        el.appendChild(tit);
        /* Pas de pastille sans retours : sur l'accueil, l'outil ne les charge
           pas, et un compteur qui ne compte rien n'a pas a exister. */
        if (avecRetours) {
          var pastille = document.createElement('span');
          pastille.className = 'pastille';
          pastille.hidden = true;
          el.appendChild(pastille);
        }
        // Le clic est traite par le gestionnaire global, comme pour la fresque.
        el.addEventListener('mouseenter', function () { survoler(n); });
        el.addEventListener('mouseleave', function () { survoler(null); });
        hote.appendChild(el);
      });
  }

  /* Changer de vue garde le filtre (on cherchait quelque chose) mais ferme la
     carte ouverte : le panneau d'une carte qu'on ne voit plus desoriente. */
  function basculerVue(v) {
    vue = (v === 'cartes') ? 'cartes' : 'fresque';
    fermerPanneau();
    var surCartes = vue === 'cartes';
    if ($('plateau-cadre')) $('plateau-cadre').hidden = surCartes;
    if ($('grille-cartes')) $('grille-cartes').hidden = !surCartes;
    ['vue-cartes', 'vue-fresque'].forEach(function (id) {
      var b = $(id);
      if (!b) return;
      var actif = (id === 'vue-' + vue);
      b.classList.toggle('est-active', actif);
      b.setAttribute('aria-pressed', actif ? 'true' : 'false');
    });
    // Le zoom et l'aide au deplacement n'ont pas de sens sur une grille.
    ['zoom-moins', 'zoom-plus', 'zoom-val'].forEach(function (id) {
      if ($(id)) $(id).hidden = surCartes;
    });
    if ($('barre-aide')) $('barre-aide').textContent = surCartes
      ? T.aideGrille : (modeCom ? T.aideCommentaire : T.aideLecture);
    /* La legende des fleches ne decrit que la fresque : en vue Cartes elle
       annonce une lecture qui n'existe pas a l'ecran. */
    var cle = document.querySelector('.cle-fleches');
    if (cle) cle.hidden = surCartes;
    appliquerMiseEnAvant();
    if (!surCartes) ajuster();
  }

  /* LES ONGLETS N'APPARAISSENT QUE S'IL Y A DEUX CHOSES A LIRE. Sans le mode
     commentaires -- toujours sur l'accueil, et par defaut sur la page Retours --
     le panneau n'a qu'un contenu : le verso, les explications et les liens. Deux
     onglets dont l'un est seul a servir n'annoncent qu'une fausse promesse. On
     les retire alors, et la croix de fermeture reste a sa place. */
  function majOnglets() {
    var avecOnglets = avecRetours && modeCom;
    var barre = $('panneau-onglets');
    if (barre) barre.classList.toggle('sans-onglets', !avecOnglets);
    ['onglet-expl', 'onglet-retours'].forEach(function (id) {
      if ($(id)) $(id).hidden = !avecOnglets;
    });
    if (!avecOnglets) choisirOnglet('expl');
  }

  /* ── PANNEAU : DEUX ONGLETS ─────────────────────────────────
     Le panneau melait le verso, les liens, les retours et leur formulaire en
     une seule colonne qu'il fallait parcourir en entier. Deux onglets : ce
     qu'on vient lire, et ce qu'on vient dire. */
  function choisirOnglet(quel) {
    var paires = [['onglet-expl', 'volet-expl'], ['onglet-retours', 'volet-retours']];
    paires.forEach(function (x) {
      var o = $(x[0]), v = $(x[1]);
      if (!o || !v) return;
      var actif = (x[0] === 'onglet-' + quel);
      o.classList.toggle('est-actif', actif);
      o.setAttribute('aria-selected', actif ? 'true' : 'false');
      v.hidden = !actif;
    });
  }

  /* ── Mise en route ──────────────────────────────────────────
     LA FRESQUE S'AFFICHE TOUT DE SUITE. Il fallait cliquer « Afficher la
     fresque de reference » pour la voir : un clic de plus a chaque venue, sur
     une page deja reservee, deja hors de la navigation publique et deja
     precedee de son avertissement. Le clic ne protegeait rien, il retardait. */
  (function demarrer() {
    /* L'OUTIL EST BATI AVANT TOUT LE RESTE : chaque fonction d'ici cherche ses
       elements par identifiant, et il n'y en a aucun tant que le conteneur est
       vide. Sans conteneur, la page n'utilise pas l'outil et le script s'arrete
       la, sans erreur (le minuteur et l'antiseche chargent le meme fichier). */
    var hote = $('fresque-outil');
    if (!hote) return;
    avecRetours = construireOutil(hote);

    /* LA LARGEUR DE LA BARRE DE DEFILEMENT, MESUREE. La zone sort de sa colonne
       pour prendre toute la fenetre, ce qui se calcule en `vw` -- or `vw`
       compte la barre de defilement et `%` ne la compte pas. Sans cette
       mesure, la zone depassait d'une demi-barre de chaque cote et la barre
       d'outils etait rognee a gauche. Zero quand la barre se superpose au
       contenu, ce qui est le cas sur telephone. */
    var majBarre = function () {
      var l = window.innerWidth - document.documentElement.clientWidth;
      document.documentElement.style.setProperty('--barre-defilement', (l > 0 ? l : 0) + 'px');
    };
    majBarre();
    window.addEventListener('resize', majBarre);

    var attente = $('chargement');
    charger().then(function () {
      if (attente) attente.hidden = true;
      /* Deux enveloppes a reveler, et pas une seule : celle de l'outil
         (`plateau-hote`, construite ici) et celle de la page, quand elle en a
         une (la section entiere sur Retours, le bloc deplie sur l'accueil). */
      if ($('plateau-hote')) $('plateau-hote').hidden = false;
      if ($('plateau-section')) $('plateau-section').hidden = false;
      if ($('retours-section')) $('retours-section').hidden = false;
      dessinerCartes();
      dessinerGrille();
      dessinerLiens();
      construireLots();
      zoomInitial();
      glisser($('plateau-cadre'));
      glisserCartes($('cartes'));
      majSelectsCartes();
      majChoixLien();
      if ($('retours') || $('retours-carte')) chargerRetours();
    }).catch(function (e) {
      console.error('espace animateurs :', e);
      if (attente) {
        attente.hidden = false;
        attente.className = 'etat err';
        attente.textContent = T.echecChargement;
      }
    });
  })();

  /* UN CLIC AILLEURS REFERME LE PANNEAU, mais « ailleurs » ne doit pas inclure
     ce qui vient de l'ouvrir. Les cartes de la vue Cartes sont hors du plateau :
     sans la premiere ligne, leur propre gestionnaire ouvrait le panneau et
     celui-ci le refermait aussitot, dans le meme clic. */
  document.addEventListener('click', function (e) {
    /* EN EDITION, CLIQUER UNE CARTE LA DEPLACE : ouvrir son verso par-dessus
       masquerait la moitie du plan a chaque geste. Le glisser emet d'ailleurs
       un `click` en fin de course, qui rouvrait le panneau qu'on venait de
       fermer. */
    if (editionFresque && e.target.closest('.c-carte')) return;
    var g = e.target.closest('.g-carte');
    if (g) { ouvrirPanneau(+g.dataset.n); return; }
    var c = e.target.closest('.c-carte');
    if (c) { ouvrirPanneau(+c.dataset.n); return; }
    if (e.target.closest('.barre-edition')) return;
    /* LA BARRE D'OUTILS NE REFERME PAS LA CARTE OUVERTE. Zoomer, chercher,
       publier : aucune de ces actions ne quitte la carte qu'on est en train de
       lire, et les voir la refermer donnait l'impression d'avoir rate son
       clic. Changer de vue la referme, lui, mais explicitement (basculerVue). */
    if (e.target.closest('.panneau') || e.target.closest('.vues')
        || e.target.closest('.barre')) return;
    if (!$('panneau').hidden && !e.target.closest('.plateau')) fermerPanneau();
  });
  $('cartes').addEventListener('mouseover', function (e) {
    var c = e.target.closest('.c-carte');
    if (c) survoler(+c.dataset.n);
  });
  $('cartes').addEventListener('mouseout', function (e) {
    if (e.target.closest('.c-carte')) survoler(null);
  });
  // Au clavier, le focus joue le role du survol : parcourir les cartes a la
  // tabulation doit montrer la meme chose que les parcourir a la souris.
  $('cartes').addEventListener('focusin', function (e) {
    var c = e.target.closest('.c-carte');
    if (c) survoler(+c.dataset.n);
  });
  $('cartes').addEventListener('focusout', function () { survoler(null); });

  $('panneau-fermer').addEventListener('click', fermerPanneau);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('panneau').hidden) fermerPanneau();
  });

  $('plateau-cadre').addEventListener('wheel', function (e) {
    // Sans Ctrl, la molette fait ce qu'elle fait partout : elle defile.
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    zoom = Math.max(0.12, Math.min(1.6, zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    appliquerZoom();
  }, { passive: false });

  $('zoom-plus').addEventListener('click', function () { zoom = Math.min(1.6, zoom * 1.25); appliquerZoom(); });
  $('zoom-moins').addEventListener('click', function () { zoom = Math.max(0.12, zoom / 1.25); appliquerZoom(); });
  /* Le bouton « Ajuster » a ete retire : le recadrage se fait tout seul quand il
     le faut (chargement, plein ecran, depliage de l'apercu). Il reste expose
     ici parce que l'accueil de l'espace deplie la fresque dans un bloc masque,
     qui n'a pas de largeur tant qu'il l'est. */
  window.FresqueRef = { ajuster: ajuster };

  on('mode-commentaires', 'change', function () {
    modeCom = this.checked;
    majOnglets();
    $('barre-aide').textContent = modeCom ? T.aideCommentaire : T.aideLecture;
    if ($('panneau-commentaire')) $('panneau-commentaire').hidden = !modeCom || $('panneau').hidden;
  });

  $('lots').addEventListener('click', function (e) {
    var b = e.target.closest('.lot-puce');
    if (!b) return;
    var n = b.dataset.lot === '' ? null : +b.dataset.lot;
    lotActif = (lotActif === n) ? null : n;
    construireLots();
    appliquerMiseEnAvant();
  });

  var minuteurRecherche = null;
  $('recherche').addEventListener('input', function () {
    // On attend une courte pause : filtrer à chaque frappe sur 38 cartes est
    // sans douleur, mais le panneau ouvert se rafraîchirait sous les doigts.
    clearTimeout(minuteurRecherche);
    minuteurRecherche = setTimeout(appliquerMiseEnAvant, 120);
  });

  /* LE PLEIN ECRAN PORTE SUR TOUTE LA ZONE DE LA FRESQUE, pas sur le seul
     plateau. Le panneau qui montre le verso d'une carte est un FRERE du
     plateau : hors de l'element passe en plein ecran, le navigateur ne le
     dessine pas du tout. On cliquait donc une carte et il ne se passait rien.
     La zone contient desormais la barre d'outils, le plateau et le panneau :
     tout ce qui sert reste atteignable. */
  on('plein-ecran', 'click', function () {
    var cible = $('fresque-zone') || $('plateau-section');
    if (document.fullscreenElement) document.exitFullscreen();
    else if (cible && cible.requestFullscreen) cible.requestFullscreen();
  });
  /* « Fermer ✕ » quitte le plein ecran. Sur l'accueil de l'espace, le meme
     bouton porte un autre identifiant et replie l'apercu : voir apercu.js. */
  on('quitter-plein', 'click', function () {
    if (document.fullscreenElement) document.exitFullscreen();
  });
  document.addEventListener('fullscreenchange', function () {
    if ($('plein-ecran')) $('plein-ecran').textContent = document.fullscreenElement ? T.quitterPlein : T.pleinEcran;
    // La hauteur du cadre est calculée d'après la fenêtre : elle vient de
    // changer du tout au tout.
    setTimeout(ajuster, 60);
  });

  $('panneau-liens').addEventListener('click', function (e) {
    var b = e.target.closest('.vers-carte');
    if (b) ouvrirPanneau(+b.dataset.vers);
  });

  on('form-jeton', 'submit', function (e) {
    e.preventDefault();
    jeton = $('jeton').value.trim();
    chargerBrouillons();
    if (cibleN != null) remplirEdition(cibleN);
    majBoutonPublier();
    var etat = $('jeton-etat');
    etat.className = 'jeton-etat';
    etat.textContent = jeton ? T.moderation : '';
    if (!jeton && editionFresque) basculerEdition(false);
    majEdition();
    // Le jeton n'est pas verifie ici : la fonction le refusera a la premiere
    // action. L'afficher comme « activé » sans l'avoir eprouve serait mentir,
    // mais le verifier a vide couterait un appel pour rien.
    rendreRetours();
    if (cibleN != null) rendreRetoursCarte(cibleN);
  });

  document.addEventListener('click', function (e) {
    var b = e.target.closest('.retours .actions button');
    if (!b) return;
    var li = b.closest('li');
    var action = b.classList.contains('valider') ? 'valider'
      : b.classList.contains('traiter') ? 'traiter' : 'supprimer';
    if (action === 'supprimer' && !confirm(T.confirmer)) return;
    b.disabled = true;
    moderer(li.dataset.cle, action).catch(function (err) {
      b.disabled = false;
      var etat = $('jeton-etat');
      etat.className = 'jeton-etat err';
      etat.textContent = err.message || T.echecAction;
    });
  });

  /* Le champ « qu'est-ce qui pose probleme » n'apparait qu'une fois un lien
     choisi : pose avant, il demande d'expliquer un lien qui n'existe pas. */
  on('c-lien', 'change', function () {
    var bloc = $('c-lien-bloc');
    if (bloc) bloc.hidden = !$('c-lien').value;
  });

  on('e-enregistrer', 'click', function () {
    if (cibleN == null) return;
    envoyerBrouillon({ action: 'enregistrer', n: cibleN,
      titre: $('e-titre').value, verso: $('e-verso').value, explication: $('e-expl').value })
      .then(function () { return chargerBrouillons(); })
      .then(function () {
        $('e-etat').className = 'etat ok';
        $('e-etat').textContent = brouillons[cibleN] ? T.enregistre : T.brouillonOublie;
      })
      .catch(function () { /* l'etat est deja affiche */ });
  });

  on('e-annuler', 'click', function () {
    if (cibleN == null) return;
    envoyerBrouillon({ action: 'oublier', n: cibleN })
      .then(function () { return chargerBrouillons(); })
      .then(function () {
        $('e-etat').className = 'etat ok';
        $('e-etat').textContent = T.brouillonOublie;
      })
      .catch(function () {});
  });

  /* PUBLIER MET EN LIGNE, TOUT DE SUITE. Les corrections vont dans un calque
     que le site applique par-dessus cartes.json : plus de telechargement, plus
     de depot, plus d'attente. Le depot garde son role, mais plus tard et pour
     une autre raison : c'est lui qui fabrique le jeu imprime (bouton
     « Telecharger », ci-dessous). */
  on('publier-modifs', 'click', function () {
    // La carte ouverte au moment du clic : c'est elle qu'on veut revoir corrigee.
    var ouverte = cibleN;
    envoyerBrouillon({ action: 'publier' }).then(function (d) {
      publies = d.publie || [];
      /* ON RELIT CE QU'ON VIENT DE PUBLIER. Sans oublier le calque deja lu,
         l'outil reafficherait l'ancien texte et on croirait que publier n'a
         rien fait. */
      if (window.CalqueCartes) window.CalqueCartes.oublier();
      return rechargerTextes().then(function () {
        dessinerCartes();
        dessinerGrille();
        appliquerMiseEnAvant();
        return chargerBrouillons();
      }).then(function () {
        if (ouverte != null) ouvrirPanneau(ouverte);
        var etat = $('e-etat');
        if (etat) { etat.className = 'etat ok'; etat.textContent = T.publieEnLigne; }
      });
    }).catch(function () { /* l'etat est deja affiche */ });
  });

  /* REPLIER LES CORRECTIONS DANS LE DEPOT. Separe de la publication : le
     fichier se depose a la main, la CI le valide, quelqu'un relit. On le fait
     parce que cartes.json fabrique aussi la planche imprimee, et qu'un site
     corrige devant un jeu de cartes qui ne l'est pas finirait par se voir en
     atelier. Une fois le depot a jour, le calque se vide tout seul. */
  on('deposer-modifs', 'click', function () {
    envoyerBrouillon({ action: 'telecharger' }).then(function (d) {
      var txt = JSON.stringify(d.fichier, null, 2) + '\n';
      var url = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
      var a = document.createElement('a');
      a.href = url; a.download = 'cartes.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      var etat = $('e-etat');
      if (etat) { etat.className = 'etat ok'; etat.textContent = T.telecharge; }
      alerterPublication(d.resume);
    }).catch(function () {});
  });

  /* Ce qu'on vient de telecharger, carte par carte : on relit AVANT de deposer. */
  function alerterPublication(resume) {
    var l = (resume || []).map(function (x) { return 'carte ' + x.n + ' (' + x.champs.join(', ') + ') : ' + x.titre; });
    window.alert(T.telecharge + '\n\n' + l.join('\n'));
  }

  on('mode-edition', 'change', function () { basculerEdition(this.checked); });
  $('cartes').addEventListener('keydown', deplacerAuClavier);

  /* Designer un lien en le cliquant sur le plateau. Hors edition, la couche des
     liens ne recoit pas le pointeur du tout (voir `.liens` et `.touche`). */
  $('liens').addEventListener('pointerdown', function (e) {
    if (!editionFresque) return;
    var g = e.target.closest ? e.target.closest('g[data-id]') : null;
    if (g) choisirLien(g.dataset.id, true);
  });

  on('f-choix', 'change', function () { choisirLien(this.value, false); });
  on('f-ajouter', 'click', function () {
    ajouterLien(+$('f-de').value, +$('f-vers').value);
  });
  on('f-renommer', 'click', function () {
    var l = fleche(lienChoisi);
    if (!l) { etatEdition(T.aucunLien, true); return; }
    memoriser();
    l.libelle = $('f-libelle').value.slice(0, 60).trim();
    majChoixLien();
    dessinerLiens();
    etatEdition(T.lienRenomme, false);
  });
  on('f-supprimer', 'click', function () {
    var l = fleche(lienChoisi);
    if (!l) { etatEdition(T.aucunLien, true); return; }
    memoriser();
    ref.tableau.fleches = ref.tableau.fleches.filter(function (f) { return f.id !== l.id; });
    lienChoisi = null;
    majChoixLien();
    dessinerLiens();
    etatEdition(T.lienSupprime, false);
  });
  on('f-annuler', 'click', annulerDernier);

  on('f-enregistrer', 'click', function () {
    envoyerFresque({ action: 'fresque-enregistrer', tableau: ref.tableau }).then(function (d) {
      brouillonFresque = clonerTableau();
      modifie = false;
      majEdition();
      etatEdition(T.fresqueEnregistree + ' ' + resumeFresque(d.resume), false);
    }).catch(function () { /* l'etat est deja affiche */ });
  });

  on('f-oublier', 'click', function () {
    envoyerFresque({ action: 'fresque-oublier' }).then(function () {
      brouillonFresque = null;
      modifie = false;
      /* On recharge la fresque publiee : garder a l'ecran un plan qu'on vient
         d'abandonner ferait croire qu'il reste quelque part. */
      return charger().then(function () {
        histoire = [];
        lienChoisi = null;
        majSelectsCartes();
        majChoixLien();
        dessinerCartes();
        dessinerLiens();
        appliquerZoom();
        appliquerMiseEnAvant();
        majEdition();
        etatEdition(T.fresqueOubliee, false);
      });
    }).catch(function () {});
  });

  /* PUBLIER TELECHARGE, IL N'ECRIT PAS : meme regle que pour les cartes. Le
     fichier se depose a la main dans le depot, la CI le valide, quelqu'un relit. */
  on('f-publier', 'click', function () {
    envoyerFresque({ action: 'fresque-publier' }).then(function (d) {
      var txt = JSON.stringify(d.fichier, null, 2) + '\n';
      var url = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
      var a = document.createElement('a');
      a.href = url; a.download = 'fresque-reference.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      etatEdition(T.fresqueTelechargee, false);
      window.alert(T.fresqueTelechargee + '\n\n' + resumeFresque(d.resume));
    }).catch(function () {});
  });

  on('vue-cartes', 'click', function () { basculerVue('cartes'); });
  on('vue-fresque', 'click', function () { basculerVue('fresque'); });
  on('onglet-expl', 'click', function () { choisirOnglet('expl'); });
  on('onglet-retours', 'click', function () { choisirOnglet('retours'); });

  on('c-envoi', 'click', function () {
    var texte = $('c-texte').value.trim();
    if (texte.length < 3) {
      $('c-etat').className = 'etat err';
      $('c-etat').textContent = 'Écrivez votre retour avant d’envoyer.';
      return;
    }
    var lien = $('c-lien') ? parseInt($('c-lien').value, 10) : NaN;
    envoyer({
      sujet: 'carte', carte: cibleN, texte: texte,
      lien: isFinite(lien) ? lien : null,
      // Ce qui ne va pas dans ce lien. Le serveur l'efface si aucun lien n'est
      // designe : un texte sans sa fleche serait impossible a rattacher.
      lienTexte: $('c-lien-texte') ? $('c-lien-texte').value.trim() : '',
      nom: $('c-nom').value.trim()
    }, $('c-etat'))
      .then(function () {
        $('c-texte').value = '';
        if ($('c-lien')) $('c-lien').value = '';
        if ($('c-lien-texte')) $('c-lien-texte').value = '';
        if ($('c-lien-bloc')) $('c-lien-bloc').hidden = true;
        return chargerRetours();
      })
      .catch(function () { /* l'état est déjà affiché */ });
  });

  on('form-general', 'submit', function (e) {
    e.preventDefault();
    envoyer({
      sujet: $('g-sujet').value,
      texte: $('g-texte').value.trim(),
      nom: $('g-nom').value.trim(),
      email: $('g-email').value.trim()
    }, $('g-etat'))
      .then(function () { $('g-texte').value = ''; return chargerRetours(); })
      .catch(function () { /* l'état est déjà affiché */ });
  });
})();
