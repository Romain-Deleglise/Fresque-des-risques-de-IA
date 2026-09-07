#!/usr/bin/env python3
"""Genere la planche d'impression PDF des cartes (recto/verso, duplex bord long).

Source : les PDF 2 pages (recto + verso) de contenus/cartes/ (nommes
"Carte NN - ...pdf", page 1 = recto, page 2 = verso).
Sortie : site/telechargements/fresque-des-risques-de-l-ia-cartes.pdf
         (A4 paysage, 4 cartes par feuille, feuilles recto puis verso).

Deux etapes :
 1. Imposition vectorielle avec pikepdf (aucune perte) -> gros fichier.
 2. Compression avec Ghostscript.

IMPORTANT sur la compression : les visuels sont des aplats de couleurs vives
sur fond noir. Un JPEG trop compresse (qualite basse) fait apparaitre un halo
gris granuleux (bruit de moustique) autour des bords nets : encadres de lot,
neurones, textes. On garde donc une qualite JPEG tres elevee (97). Ne pas
baisser sous 95 sans revalider visuellement les cartes a fond noir (1, 22...).

Dependances : pikepdf, ghostscript (binaire `gs`).
Usage        : python3 scripts/generer-planche.py
"""

import re
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    from pikepdf import Pdf, Rectangle
except ImportError:
    sys.exit("pikepdf manquant. Installez-le avec : pip install pikepdf")

RACINE = Path(__file__).resolve().parent.parent
SRC = RACINE / "contenus" / "cartes"
OUT = RACINE / "site" / "telechargements" / "fresque-des-risques-de-l-ia-cartes.pdf"

W, H = 841.89, 595.28              # A4 paysage (points)
cw, ch = W / 2, H / 2
# cellules : 0=haut-gauche 1=haut-droite 2=bas-gauche 3=bas-droite
CELLS = [Rectangle(0, ch, cw, H), Rectangle(cw, ch, W, H),
         Rectangle(0, 0, cw, ch), Rectangle(cw, 0, W, ch)]
SWAP = {0: 1, 1: 0, 2: 3, 3: 2}   # miroir colonnes pour le duplex bord long

JPEG_Q = 97                        # voir la note d'en-tete : ne pas descendre sous 95
DPI = 300


def num(p):
    m = re.match(r"\s*Carte\s+(\d+)", p.name)
    return int(m.group(1)) if m else 10 ** 6


def imposer(brut):
    sources = sorted([p for p in SRC.glob("*.pdf")], key=num)
    if not sources:
        sys.exit(f"Aucun PDF de carte trouve dans {SRC}")
    pdfs = [Pdf.open(str(p)) for p in sources]        # garder ouverts
    recto = [pdf.pages[0] for pdf in pdfs]
    verso = [pdf.pages[1] if len(pdf.pages) > 1 else pdf.pages[0] for pdf in pdfs]

    out = Pdf.new()
    for g in range(0, len(sources), 4):
        grp = list(range(g, min(g + 4, len(sources))))
        pr = out.add_blank_page(page_size=(W, H))     # feuille recto
        for i, idx in enumerate(grp):
            pr.add_overlay(recto[idx], CELLS[i])
        pv = out.add_blank_page(page_size=(W, H))     # feuille verso (colonnes inversees)
        for j in range(4):
            s = SWAP[j]
            if s < len(grp) and (g + s) < len(sources):
                pv.add_overlay(verso[grp[s]], CELLS[j])
    out.save(str(brut))
    return len(sources), len(out.pages)


def compresser(brut, cible):
    subprocess.run([
        "gs", "-q", "-dNOPAUSE", "-dBATCH", "-dSAFER",
        "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.5",
        "-dDownsampleColorImages=true", f"-dColorImageResolution={DPI}",
        "-dColorImageDownsampleType=/Bicubic",
        "-dDownsampleGrayImages=true", f"-dGrayImageResolution={DPI}",
        "-dGrayImageDownsampleType=/Bicubic",
        "-dAutoFilterColorImages=false", "-dColorImageFilter=/DCTEncode",
        "-dAutoFilterGrayImages=false", "-dGrayImageFilter=/DCTEncode",
        f"-dJPEGQ={JPEG_Q}",
        f"-sOutputFile={cible}", str(brut),
    ], check=True)


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        brut = Path(td) / "brut.pdf"
        nb, pages = imposer(brut)
        compresser(brut, OUT)
    mo = OUT.stat().st_size / 1e6
    print(f"planche ecrite : {OUT}")
    print(f"  {nb} cartes, {pages} pages, {mo:.1f} Mo (JPEG q{JPEG_Q}, {DPI} dpi)")


if __name__ == "__main__":
    main()
