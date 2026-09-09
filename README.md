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
