#!/usr/bin/env python3
"""Genere les variantes web des cartes (B3.7).

Lit les images sources dans contenus/cartes/ (nommees avec le numero de carte
en tete, ex. "4 Automatisation du travail.png"), et produit pour chaque carte
deux variantes WebP dans site/assets/img/cartes/ :

    NN-560.webp   (vignette : tableau et eventail d'accueil)
    NN-900.webp   (carte ouverte en grand)

NN est le numero sur deux chiffres. Seul un redimensionnement vers le bas est
applique (jamais d'agrandissement). Les images dont le numero est ambigu
(plusieurs fichiers pour le meme numero) sont ignorees et signalees : a vous de
renommer ou de retirer le doublon.

Dependance : Pillow  ->  pip install Pillow
Usage       : python3 scripts/generer-images.py
"""

import re
import sys
from pathlib import Path
from collections import defaultdict

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow manquant. Installez-le avec : pip install Pillow")

RACINE = Path(__file__).resolve().parent.parent
SRC = RACINE / "contenus" / "cartes"
DST = RACINE / "site" / "assets" / "img" / "cartes"
VARIANTES = {"560": 560, "900": 900}
EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
QUALITE = 82


def numero(nom: str):
    """Extrait le numero de carte en tete du nom de fichier, ou None."""
    m = re.match(r"\s*(\d+)", nom)
    return int(m.group(1)) if m else None


def main():
    if not SRC.is_dir():
        sys.exit(f"Dossier source introuvable : {SRC}")
    DST.mkdir(parents=True, exist_ok=True)

    par_numero = defaultdict(list)
    for f in sorted(SRC.iterdir()):
        if f.suffix.lower() not in EXTENSIONS or f.name.lower() == "readme.md":
            continue
        n = numero(f.name)
        if n is None:
            print(f"  ignore (pas de numero) : {f.name}")
            continue
        par_numero[n].append(f)

    generes, conflits, ignores = 0, [], []
    for n in sorted(par_numero):
        fichiers = par_numero[n]
        if n == 0:
            ignores.append((n, "carte 0 sans visuel dans l'outil", fichiers))
            continue
        if len(fichiers) > 1:
            conflits.append((n, fichiers))
            continue

        src = fichiers[0]
        try:
            img = Image.open(src)
        except Exception as e:  # noqa: BLE001
            print(f"  ERREUR lecture {src.name} : {e}")
            continue
        img = img.convert("RGB") if img.mode not in ("RGB", "RGBA") else img

        for suffixe, largeur in VARIANTES.items():
            cible = img
            if img.width > largeur:
                hauteur = round(img.height * largeur / img.width)
                cible = img.resize((largeur, hauteur), Image.LANCZOS)
            sortie = DST / f"{n:02d}-{suffixe}.webp"
            fond = cible.convert("RGB") if cible.mode == "RGBA" else cible
            fond.save(sortie, "WEBP", quality=QUALITE, method=6)
        generes += 1
        print(f"  ok carte {n:02d}  <-  {src.name}")

    print(f"\n{generes} carte(s) generee(s) dans {DST.relative_to(RACINE)}")

    if conflits:
        print("\n/!\\ CONFLITS a resoudre (plusieurs fichiers pour un meme numero) :")
        for n, fichiers in conflits:
            print(f"  carte {n:02d} :")
            for f in fichiers:
                print(f"      - {f.name}")
        print("  -> renommez ou retirez le doublon, puis relancez le script.")

    if ignores:
        print("\nIgnores volontairement :")
        for n, raison, fichiers in ignores:
            print(f"  carte {n:02d} ({raison}) : {', '.join(f.name for f in fichiers)}")


if __name__ == "__main__":
    main()
