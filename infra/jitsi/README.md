# Jitsi Meet auto-heberge (serveur de dev Pause IA)

Visio integree pour la Fresque, sur `visio.pauseia.fr`, a cote des autres apps
Docker (CiviCRM, Vaultwarden, bots) derriere Caddy. Regle d'or de cette config :
**en cas de tension sur la machine, c'est Jitsi qui ralentit en premier**, pas
les autres services (limites de RAM + priorite CPU basse).

Cible realiste : 1 session de 9, parfois 2 en parallele. Le pic theorique
(3-4 sessions) passera probablement mais reste juste sur 4 Go ; voir la section
RAM.

---

## 1. Liberer de la RAM : arreter Metabase (sans le supprimer)

Metabase (Java) est le plus gros consommateur et n'est plus utilise pour
l'instant. On l'**arrete** (les donnees et l'image restent, on peut le
relancer plus tard) :

```bash
# Trouver le dossier du compose de Metabase (adapter si besoin)
cd /opt/volunteer-apps/apps/metabase 2>/dev/null || cd /opt/volunteer-apps/metabase
sudo docker compose stop          # arret propre, conserve tout
# (pour le relancer un jour : sudo docker compose up -d)
```

Verifier qu'il est bien arrete et voir la RAM recuperee :

```bash
sudo docker ps                    # metabase ne doit plus apparaitre
free -h                           # regarder la colonne "available"
```

Il faut viser **au moins ~2 Go disponibles** ("available") avant de lancer
Jitsi (les limites ci-dessous plafonnent Jitsi a ~3 Go).

---

## 2. DNS + firewall

1. **DNS** : un enregistrement `A` `visio.pauseia.fr` -> `138.199.201.21`
   (et `AAAA` vers l'IPv6 si tu veux). Verifier : `nslookup visio.pauseia.fr`.
2. **Port media UDP 10000** ouvert cote Hetzner (console Cloud > Firewall) **et**
   sur la machine si `ufw` est actif :
   ```bash
   sudo ufw allow 10000/udp
   ```
   (80/443 sont deja ouverts pour Caddy.)

---

## 3. Installer

```bash
# 1. Recuperer ce dossier sur le serveur (via le depot du site, ou scp)
sudo mkdir -p /opt/volunteer-apps/apps/jitsi
# copier docker-compose.yml, env.example ici, puis :
cd /opt/volunteer-apps/apps/jitsi

# 2. Config + secrets
cp env.example .env
# generer 3 secrets et les coller dans .env (JICOFO_COMPONENT_SECRET,
# JICOFO_AUTH_PASSWORD, JVB_AUTH_PASSWORD) :
for k in JICOFO_COMPONENT_SECRET JICOFO_AUTH_PASSWORD JVB_AUTH_PASSWORD; do
  echo "$k=$(openssl rand -hex 16)"
done
# -> reporter ces 3 lignes dans .env (remplacer les lignes vides)
nano .env    # verifier PUBLIC_URL, SERVER_PUBLIC_IP, CONFIG

# 3. Creer les dossiers de config attendus par les images
mkdir -p /opt/volunteer-apps/data/jitsi-cfg/{web/crontabs,transcripts,prosody/config,prosody/prosody-plugins-custom,jicofo,jvb}

# 4. Lancer
sudo docker compose up -d
sudo docker compose ps            # les 4 services doivent etre "Up"
```

---

## 4. Brancher Caddy

Ajouter le bloc de `Caddyfile.snippet` au Caddyfile existant, puis recharger :

```bash
# editer /opt/volunteer-apps/caddy/Caddyfile (y coller le bloc visio.pauseia.fr)
cd /opt/volunteer-apps/caddy
sudo docker compose restart caddy
sudo docker compose logs caddy | grep -i visio   # doit obtenir un certificat
```

Verifier le nom du conteneur web de Jitsi (`sudo docker ps`) : si ce n'est pas
`jitsi-web-1`, ajuster le `reverse_proxy` dans le Caddyfile.

Test : ouvrir `https://visio.pauseia.fr` dans un navigateur, creer un salon, se
connecter depuis un 2e appareil. La video doit passer (sinon, 99 % du temps
c'est le port UDP 10000 non ouvert).

---

## 5. Pointer les liens visio du site vers l'instance

Dans les variables d'environnement Netlify du site, ajouter :

```
VISIO_BASE=https://visio.pauseia.fr
```

Les salons visio generes automatiquement pointeront alors vers ton instance,
sans toucher au code (repli sur meet.jit.si si la variable est absente).

---

## 6. Pourquoi "Jitsi lag en premier" (deja configure)

Dans `docker-compose.yml`, chaque service Jitsi a :

- `mem_limit` : plafond de RAM (web 160m, prosody 320m, jicofo 512m, jvb 2048m,
  total ~3 Go). Jitsi ne pourra jamais grignoter la RAM des autres apps ;
  s'il atteint son plafond, c'est **lui** qui rame ou redemarre, pas CiviCRM.
- `cpu_shares: 512` : moitie moins que le defaut (1024) des autres conteneurs.
  Sous forte charge CPU, l'ordonnanceur **favorise les autres services**.
- `CHANNEL_LAST_N=4` et `RESOLUTION=480` : plafonnent le nombre de flux video
  relayes et leur qualite, ce qui borne la charge du pont au pic.

Pour serrer encore (pic a 3-4 sessions), baisser `RESOLUTION` a 360 et
`CHANNEL_LAST_N` a 3 dans `.env`/compose, ou inciter camera coupee (le tableau
est le coeur de l'atelier).

---

## 7. Surveiller (surtout au 1er atelier multi-sessions)

```bash
watch -n 2 'sudo docker stats --no-stream'   # RAM/CPU par conteneur en direct
free -h                                        # RAM globale
sudo docker compose logs -f jvb                # le pont video
```

Si `available` (free -h) descend sous ~200 Mo pendant un atelier : baisser les
`mem_limit`/qualite, ou envisager de passer le serveur a 8 Go (resize Hetzner,
reversible).

---

## Commandes utiles

```bash
cd /opt/volunteer-apps/apps/jitsi
sudo docker compose ps                 # etat
sudo docker compose logs -f web        # logs de l'interface
sudo docker compose restart            # redemarrer
sudo docker compose down               # arreter Jitsi (les autres apps continuent)
sudo docker compose up -d              # relancer
```

Pour desactiver la visio auto sans arreter Jitsi : retirer `VISIO_BASE` des
variables Netlify (les liens repassent sur meet.jit.si).
