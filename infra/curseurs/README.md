# Relais temps réel (serveur de dev Pause IA)

Petit service WebSocket qui répète des messages **éphémères** entre les membres
d'une même session de la Fresque en ligne : positions de curseur, tracé de
flèche en cours, **carte en cours de déplacement** (`gliss`), frappe en direct
(libellés, notes), l'état du tableau poussé après chaque action, et un simple
`{t:"maj"}` qui dit aux autres de relire l'état tout de suite au lieu
d'attendre leur prochain sondage. **Sans état, sans données conservées** : l'autorité et la
mémoire du tableau restent côté Netlify Blobs. Si ce service est arrêté ou
injoignable, **le site continue de fonctionner normalement** : le client se
dégrade en silence (pas de curseurs, propagation un peu moins directe via le
sondage, rien d'autre ne change).

Servi sur `wss://curseurs.pauseia.fr`, derrière Caddy, à côté des autres apps.

---

## Installer

```bash
# 1. Recuperer ce dossier sur le serveur (depot du site, ou scp) dans :
sudo mkdir -p /opt/volunteer-apps/apps/curseurs
sudo chown $USER:$USER /opt/volunteer-apps/apps/curseurs
# copier server.js, package.json, Dockerfile, docker-compose.yml ici
cd /opt/volunteer-apps/apps/curseurs

# 2. Construire et lancer
sudo docker compose up -d --build
sudo docker compose ps          # le conteneur "curseurs" doit etre Up
```

## Brancher Caddy

Ajouter le bloc de `Caddyfile.snippet` au Caddyfile, puis recharger :

```bash
# editer /opt/volunteer-apps/caddy/Caddyfile (ajouter le bloc curseurs.pauseia.fr)
cd /opt/volunteer-apps/caddy
sudo docker compose restart caddy
sudo docker compose logs caddy --tail 20 | grep -i curseurs   # certificat obtenu
```

Le DNS `curseurs.pauseia.fr` doit pointer vers le serveur (le wildcard
`*.pauseia.fr` suffit, comme pour `visio`).

## Vérifier

```bash
# Handshake WebSocket (doit repondre 101 Switching Protocols)
curl -sS -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  "https://curseurs.pauseia.fr/?code=TESTAB" | head -5
```

Côté site : rien à faire de plus. Le client se connecte automatiquement à
`wss://curseurs.pauseia.fr` (déjà autorisé dans la CSP du site). Le bouton
« Curseurs » de la barre d'outils permet à chacun·e de masquer/afficher les
curseurs des autres.

## Mettre a jour (apres un changement de `server.js`)

Le relais tourne dans un conteneur construit a partir de ce dossier : il ne se
met pas a jour tout seul quand le depot du site change. Apres une modification
de `server.js`, il faut recopier le fichier sur le serveur et reconstruire.

**Mise a jour en cours (a faire) : messages `gliss` / `gliss0`, garde-fou de
debit (150 messages/s par connexion, au-dela le message est jete sans couper la
connexion ; un usage normal plafonne vers 50/s), et CARTE DE VISITE.**

La carte de visite (`{t:"bonjour", v, caps}`, envoyee a chaque connexion) est ce
qui empeche le probleme de se reproduire : le client connait la version qu'il
lui faut, et si le relais est en retard il le DIT (console, et message a
l'animateur) au lieu de laisser des fonctions disparaitre en silence. Version
attendue actuellement : **3**. Ils portent le
deplacement d'une carte pendant le geste, pour que tout le monde voie la carte
bouger en direct. Tant que le relais n'est pas mis a jour, il les ignore :
personne ne voit les deplacements en cours, mais rien ne casse et tout le reste
(pose des cartes vue en quelques dizaines de millisecondes, curseurs, fleches)
continue de fonctionner.

```bash
cd /opt/volunteer-apps/apps/curseurs
# recopier server.js (et package.json / Dockerfile s'ils ont change) depuis le depot
sudo docker compose up -d --build
sudo docker compose ps                   # "curseurs" doit etre Up (recemment demarre)
sudo docker compose logs --tail 20 curseurs
```

La coupure dure quelques secondes. Les clients se reconnectent seuls (backoff
2 s, 4 s, 8 s...) et, entre-temps, le site continue de fonctionner : la
propagation retombe simplement sur le sondage HTTP.

### Verifier que la BONNE version tourne

Un `101 Switching Protocols` prouve seulement que le relais repond : l'ancienne
version repond pareil. Pour verifier que c'est bien le fichier attendu qui
tourne dans le conteneur, comparer son empreinte a celle du depot :

```bash
# sur le serveur
sudo docker exec curseurs md5sum /app/server.js
# dans le depot, la meme commande doit donner la meme empreinte
md5sum infra/curseurs/server.js
```

Deux empreintes identiques = le conteneur execute bien la version du depot.
Si elles different, le `docker compose up -d --build` n'a pas pris le nouveau
fichier (souvent parce qu'il n'a pas ete recopie dans
`/opt/volunteer-apps/apps/curseurs/`).

## Commandes utiles

```bash
cd /opt/volunteer-apps/apps/curseurs
sudo docker compose logs -f curseurs     # logs
sudo docker compose restart              # redemarrer
sudo docker compose down                 # arreter (le site fonctionne sans)
sudo docker stats --no-stream curseurs   # RAM/CPU (plafonne a 128 Mo)
```

## Notes

- **Ressources** : négligeable (un relais de petits messages JSON). Plafonné à
  128 Mo et priorité CPU basse, il cède avant les autres services.
- **Capacité** : largement suffisant pour vos sessions (≤ 9 personnes, quelques
  sessions en parallèle). Garde-fou à 30 connexions par session.
- **Sécurité** : le service ne fait que répéter des positions x/y et un prénom
  entre membres d'un même code de session ; aucune donnée n'est stockée.
