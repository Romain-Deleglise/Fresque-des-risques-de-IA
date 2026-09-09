# Relais des curseurs en direct (serveur de dev Pause IA)

Petit service WebSocket qui répète les positions de curseur entre les membres
d'une même session de la Fresque en ligne. **Sans état, sans données
conservées.** Si ce service est arrêté ou injoignable, **le site continue de
fonctionner normalement** : le client se dégrade en silence (pas de curseurs,
rien d'autre ne change).

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
