# La Fresque des risques de l'IA

Site et outils de **La Fresque des risques de l'IA** — un atelier collaboratif de
38 cartes (environ 2 h) pour comprendre ensemble les enjeux de l'intelligence
artificielle, sans prérequis technique. Adapté de la Fresque de la sécurité de
l'IA du [CeSIA](https://www.securite-ia.fr/), inspiré de la
[Fresque du Climat](https://fresqueduclimat.org/), porté par
[Pause IA](https://pauseia.fr/).

Le projet comporte **deux briques indépendantes** (le site survit à une panne du
service) :

1. **Site vitrine statique** — accueil, à propos, page « Fresque en ligne ».
   Objectif principal : faire télécharger les cartes et le guide. *(Réalisé.)*
2. **Service de sessions temps réel** — l'outil d'atelier en ligne (un animateur,
   jusqu'à 8 participants, tableau noir partagé). *(À venir — la page affiche
   « bientôt » en attendant.)*

## État d'avancement

- [x] Structure du dépôt, licences, CI
- [x] Site vitrine : accueil, à propos, Fresque en ligne (placeholder)
- [x] `cartes.json` (source unique des contenus) + schéma + validation CI
- [x] Éventail de cartes d'exemple (cartes 1, 4, 12) avec retournement au clic/clavier
- [ ] **Textes de verso des cartes** à renseigner (`[A COMPLETER]` dans `cartes.json`)
- [ ] **Images des cartes** à déposer et convertir en variantes web (voir ci-dessous)
- [ ] **PDF** (cartes + guide) à déposer dans `site/telechargements/`
- [ ] **Polices** `.woff2` à déposer dans `site/assets/fonts/`
- [ ] Cartes **37 et 38** manquantes dans les sources (à fournir par Pause IA)
- [ ] Service de sessions temps réel (`serveur/`)

## Lancer le site en local

Le site est 100 % statique. Un simple serveur de fichiers suffit :

```bash
cd site && python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Valider les données des cartes

```bash
node scripts/valider-cartes.mjs
```

Vérifie que `cartes.json` contient bien 39 entrées (0 à 38), des numéros uniques
et une seule carte d'introduction. Exécuté aussi en intégration continue.

## Corriger le texte d'une carte

Tout le contenu vit dans **`site/data/cartes.json`** (exigence A15.2). Pour
corriger un titre ou un texte de verso, éditez la ligne correspondante — aucune
compilation. Le `verso` est un **tableau de paragraphes**.

## Ajouter les visuels des cartes

1. Déposez les images haute résolution dans `contenus/cartes/`, nommées
   `01.png`, `02.jpg`, … (voir `contenus/cartes/README.md` pour la
   correspondance avec les fichiers fournis).
2. Générez les deux variantes web par carte (`560 px` et `900 px`, WebP) dans
   `site/assets/img/cartes/`, nommées `NN-560.webp` et `NN-900.webp` (B3.7).
   Tant qu'elles ne sont pas là, le site dégrade proprement (cadre + titre).

## Signaler un bug

Ouvrez une [issue GitHub](https://github.com/romain-deleglise/fresque-des-risques-de-ia/issues)
ou écrivez à [contact@pauseia.fr](mailto:contact@pauseia.fr).

## Licences

- **Code** : [GPL-3.0](LICENSE) *(à confirmer par Pause IA — décision ouverte du cahier des charges)*.
- **Contenus** (cartes, textes, guide) : [CC BY-SA 4.0](LICENSE-CONTENUS).

## Documentation

Le cahier des charges complet est le document de référence pour toutes les
exigences (Partie A « ce que l'on veut », Partie B « spécifications techniques »,
annexes et checklist de recette).
