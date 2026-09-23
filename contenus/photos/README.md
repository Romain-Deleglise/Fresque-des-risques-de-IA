# Photos d'atelier (originaux)

Déposez ici les photos **telles quelles**, à leur taille d'origine. Rien à
redimensionner, rien à renommer précisément : `python3 scripts/generer-photos.py`
produit les variantes web dans `site/assets/img/photos/`.

## Ce qui est attendu

- **Format** : JPEG, PNG ou WebP. Une photo d'iPhone en HEIC doit être
  convertie en JPEG avant (Aperçu sur Mac, ou « Exporter » depuis Photos).
- **Taille** : au moins 1600 px de large. Plus grand est mieux, le script
  réduit mais n'agrandit jamais.
- **Cadrage** : paysage de préférence. Le portrait fonctionne mais occupe
  beaucoup de hauteur dans la galerie.
- **Nom** : libre et parlant, il devient l'adresse du fichier. « Atelier Lyon
  mars 2026.jpg » donne `atelier-lyon-mars-2026-800.webp`. Deux photos qui
  donneraient le même nom sont signalées, pas écrasées.

## Vie privée : à lire avant de déposer

Le script **retire les métadonnées** (date, modèle d'appareil et surtout
coordonnées GPS) : une photo de téléphone publiée telle quelle donne l'adresse
exacte du lieu de l'atelier, que personne n'a accepté de publier en se faisant
prendre en photo.

Il ne peut rien faire, en revanche, pour ce qui est **dans l'image** :

- préférez les photos **sans visage identifiable** : la table, les cartes
  disposées, des mains, des personnes de dos ou floues ;
- pour toute photo où quelqu'un est reconnaissable, **demandez son accord**
  avant de déposer le fichier. Un accord oral suffit à condition de l'avoir
  vraiment demandé ; à l'écrit c'est mieux ;
- attention aux écrans, badges, tableaux et feuilles de présence visibles à
  l'arrière-plan : ils portent souvent des noms.

Une photo retirée du dépôt plus tard reste dans l'historique Git. Le tri se
fait donc **avant** le dépôt, pas après.
