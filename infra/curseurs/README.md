# Relais temps réel (serveur de dev Pause IA)

Petit service WebSocket qui répète des messages **éphémères** entre les membres
d'une même session de la Fresque en ligne : positions de curseur, tracé de
flèche en cours, frappe en direct (libellés, notes), et un simple `{t:"maj"}`
qui dit aux autres de relire l'état tout de suite au lieu d'attendre leur
prochain sondage. **Sans état, sans données conservées** : l'autorité et la
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
de `server.js` (par exemple l'ajout des messages temps reel `maj`, `fl`, `lib`,
`note`), il faut recopier le fichier sur le serveur et reconstruire :

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
