#!/usr/bin/env python3
"""Genere les variantes web des photos d'atelier.

Lit les originaux deposes dans contenus/photos/ (n'importe quelle taille,
JPEG / PNG / WebP / HEIC deja converti) et produit dans
site/assets/img/photos/ deux variantes WebP par photo :

    <nom>-800.webp    (vignette de la galerie)
    <nom>-1600.webp   (photo mise en avant, accueil)

Le nom de sortie est celui du fichier source, en minuscules, accents retires,
espaces remplaces par des tirets. Aucun agrandissement : une photo de 900 px
de large ne produit pas de variante 1600.

LES METADONNEES SONT RETIREES. Une photo de telephone transporte la date, le
modele d'appareil et souvent les COORDONNEES GPS du lieu. Publier ca revient a
publier l'adresse ou l'atelier a eu lieu, ce que personne n'a accepte en se
faisant prendre en photo.

Dependance : Pillow  ->  pip install Pillow
Usage       : python3 scripts/generer-photos.py
"""

import re
import sys
import unicodedata
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("Pillow manquant. Installez-le avec : pip install Pillow")

RACINE = Path(__file__).resolve().parent.parent
SRC = RACINE / "contenus" / "photos"
DST = RACINE / "site" / "assets" / "img" / "photos"
VARIANTES = {"800": 800, "1600": 1600}
EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
QUALITE = 80


def ardoise(nom: str) -> str:
    """Nom de fichier sûr : minuscules, sans accent, sans espace."""
    base = unicodedata.normalize("NFKD", nom)
    base = "".join(c for c in base if not unicodedata.combining(c))
    base = base.lower().replace("_", "-")
    base = re.sub(r"[^a-z0-9]+", "-", base).strip("-")
    return base or "photo"


def main():
    if not SRC.is_dir():
        sys.exit(f"Dossier source introuvable : {SRC}")
    DST.mkdir(parents=True, exist_ok=True)

    sources = [f for f in sorted(SRC.iterdir())
               if f.suffix.lower() in EXTENSIONS and f.name.lower() != "readme.md"]
    if not sources:
        print(f"Aucune photo dans {SRC.relative_to(RACINE)} : rien a faire.")
        return

    generes, vus = 0, {}
    for src in sources:
        nom = ardoise(src.stem)
        if nom in vus:
            print(f"  ATTENTION doublon de nom : {src.name} et {vus[nom].name} donnent « {nom} ». Ignore.")
            continue
        vus[nom] = src
        try:
            img = Image.open(src)
        except Exception as e:  # noqa: BLE001
            print(f"  ERREUR lecture {src.name} : {e}")
            continue
        # Redresse selon l'orientation EXIF, PUIS retire toutes les metadonnees :
        # sans le redressement prealable, une photo prise en portrait sortirait
        # couchee une fois l'EXIF jete.
        img = ImageOps.exif_transpose(img).convert("RGB")
        propre = Image.new("RGB", img.size)
        propre.paste(img)          # copie des pixels seuls : aucun EXIF ne suit

        petite = min(VARIANTES.values())
        for suffixe, largeur in sorted(VARIANTES.items(), key=lambda kv: kv[1]):
            # Jamais d'agrandissement : on saute une variante plus large que
            # l'original, sauf la plus petite, qui sert toujours de vignette.
            if propre.width < largeur and largeur != petite:
                continue
            ech = min(1.0, largeur / propre.width)
            taille = (max(1, round(propre.width * ech)), max(1, round(propre.height * ech)))
            sortie = DST / f"{nom}-{suffixe}.webp"
            propre.resize(taille, Image.LANCZOS).save(sortie, "WEBP", quality=QUALITE, method=6)
            print(f"  {sortie.relative_to(RACINE)}  ({taille[0]}x{taille[1]}, "
                  f"{sortie.stat().st_size // 1024} Ko)")
            generes += 1

    print(f"\n✅ {generes} variante(s) engendree(s) a partir de {len(vus)} photo(s).")
    print("   Les metadonnees (date, appareil, GPS) ont ete retirees.")


if __name__ == "__main__":
    main()
