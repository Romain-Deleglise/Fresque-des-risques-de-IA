# Contribuer

Merci de votre intérêt pour La Fresque des risques de l'IA !

## Corriger un texte de carte
Éditez `site/data/cartes.json` (une ligne par carte, `verso` = tableau de
paragraphes), puis vérifiez avec `node scripts/valider-cartes.mjs`.

## Proposer une modification
1. Créez une branche.
2. Faites vos changements ; gardez le site fonctionnel sans JavaScript pour le
   contenu essentiel (les téléchargements notamment).
3. Aucune requête vers un domaine tiers (polices auto-hébergées, pas de CDN).
4. Ouvrez une pull request décrivant le changement.

## Principes à respecter
- Zéro barrière à l'entrée : pas de compte, pas de traceur, pas de cookie de suivi.
- Accessibilité : navigation clavier, focus visible, respect de `prefers-reduced-motion`.
- Sobriété : accueil léger, pas de dépendance lourde.

## Signaler un bug
Ouvrez une issue ou écrivez à contact@pauseia.fr.
