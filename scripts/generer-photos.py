#!/usr/bin/env python3
"""Genere les variantes web des photos d'atelier.

Lit les originaux deposes dans contenus/photos/ (n'importe quelle taille,
JPEG / PNG / WebP / HEIC deja converti) et produit dans
site/assets/img/photos/ deux variantes WebP par photo :

    <nom>-400.webp    (vignette de la galerie)
    <nom>-800.webp    (photo moyenne)
    <nom>-1600.webp   (photo mise en avant, accueil)

Chaque fichier porte sa largeur REELLE. Une photo source de 1024 px ne produit
donc pas de fichier « -1600 » : elle s'arrete a -1024, et le `srcset` de la page
reste honnete.

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
# Largeurs VISEES. Le fichier produit porte sa largeur REELLE, jamais la
# largeur visee : une source de 575 px ne devient pas un fichier « -800 » large
# de 575, qui mentirait au `srcset` de la page et ferait choisir au navigateur
# une image trop petite pour la place qu'il lui donne.
LARGEURS = (400, 800, 1600)
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

        # Jamais d'agrandissement : une largeur visee au-dela de l'original est
        # ramenee a l'original, et les doublons qui en resultent sont ecartes.
        faites = set()
        for visee in LARGEURS:
            largeur = min(visee, propre.width)
            if largeur in faites:
                continue
            faites.add(largeur)
            hauteur = max(1, round(propre.height * largeur / propre.width))
            sortie = DST / f"{nom}-{largeur}.webp"
            propre.resize((largeur, hauteur), Image.LANCZOS).save(sortie, "WEBP", quality=QUALITE, method=6)
            print(f"  {sortie.relative_to(RACINE)}  ({largeur}x{hauteur}, "
                  f"{sortie.stat().st_size // 1024} Ko)")
            generes += 1

    print(f"\n✅ {generes} variante(s) engendree(s) a partir de {len(vus)} photo(s).")
    print("   Les metadonnees (date, appareil, GPS) ont ete retirees.")


if __name__ == "__main__":
    main()
