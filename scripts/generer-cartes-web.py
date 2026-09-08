#!/usr/bin/env python3
"""Genere les variantes web des cartes depuis les PDF 2 pages (recto + verso)
de contenus/cartes/ (page 1 = recto, page 2 = verso).

Le numero et le titre sont deja dans l'image : meme cadrage recto/verso.
On rasterise le PDF a haute definition (Ghostscript), puis on produit du WebP.

Sorties :
    site/assets/img/cartes/NN-{560,900}.webp         (recto responsive)
    site/assets/img/cartes/NN-verso-{560,900}.webp   (verso responsive)
    site/assets/img/cartes-hd/NN.webp                (recto pleine def)
    site/assets/img/cartes-verso/NN.webp             (verso pleine def)

IMPORTANT sur la qualite : les visuels sont des aplats vifs sur fond noir.
Un WebP trop compresse fait apparaitre un leger halo autour des bords nets.
On garde donc une qualite elevee (95). Ne pas descendre sous 92 sans
revalider visuellement les cartes a fond noir (1, 22...).

Dependances : Pillow, ghostscript (binaire `gs`).
Usage        : python3 scripts/generer-cartes-web.py
"""

import re
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow manquant. Installez-le avec : pip install Pillow")

RACINE = Path(__file__).resolve().parent.parent
SRC = RACINE / "contenus" / "cartes"
CARTES = RACINE / "site" / "assets" / "img" / "cartes"
HD = RACINE / "site" / "assets" / "img" / "cartes-hd"
VERSO = RACINE / "site" / "assets" / "img" / "cartes-verso"

DPI = 320               # ~1862 px de large : texte du verso net apres downscale
LARGEURS = [560, 900]
Q = 95                  # voir la note d'en-tete : ne pas descendre sous 92
NB_ATTENDU = 39


def num(nom):
    m = re.match(r"\s*Carte\s+(\d+)", nom)
    return int(m.group(1)) if m else None


def rendu(pdf, page, out_png):
    subprocess.run(["gs", "-q", "-dNOPAUSE", "-dBATCH", "-sDEVICE=png16m",
                    f"-r{DPI}", f"-dFirstPage={page}", f"-dLastPage={page}",
                    "-dTextAlphaBits=4", "-dGraphicsAlphaBits=4",
                    f"-sOutputFile={out_png}", str(pdf)], check=True)


def sauver(img, chemin, largeur):
    h = round(img.height * largeur / img.width)
    img.resize((largeur, h), Image.LANCZOS).save(chemin, "WEBP", quality=Q, method=6)


def main():
    for d in (CARTES, HD, VERSO):
        d.mkdir(parents=True, exist_ok=True)

    cartes = {}
    for f in SRC.glob("*.pdf"):
        n = num(f.name)
        if n is None:
            print("ignore (num?):", f.name)
            continue
        if n in cartes:
            sys.exit(f"doublon carte {n}: {f.name} et {cartes[n].name}")
        cartes[n] = f

    if len(cartes) != NB_ATTENDU:
        print(f"ATTENTION: {len(cartes)} cartes trouvees (attendu {NB_ATTENDU})")

    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        for n in sorted(cartes):
            nn = f"{n:02d}"
            pdf = cartes[n]
            recto_png = td / f"{nn}_r.png"
            verso_png = td / f"{nn}_v.png"
            rendu(pdf, 1, recto_png)
            rendu(pdf, 2, verso_png)
            recto = Image.open(recto_png).convert("RGB")
            verso = Image.open(verso_png).convert("RGB")
            recto.save(HD / f"{nn}.webp", "WEBP", quality=Q, method=6)
            verso.save(VERSO / f"{nn}.webp", "WEBP", quality=Q, method=6)
            for w in LARGEURS:
                sauver(recto, CARTES / f"{nn}-{w}.webp", w)
                sauver(verso, CARTES / f"{nn}-verso-{w}.webp", w)
            print("ok", nn, recto.size)
    print("termine:", len(cartes), "cartes")


if __name__ == "__main__":
    main()
