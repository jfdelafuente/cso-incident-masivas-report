#!/usr/bin/env python3
"""Diagnostic dump of every shape's text + position in a PPTX file.

Not part of the app -- a throwaway helper to inspect the geometry of the
old manual-format PPTX before writing the real importer, since shapes have
no meaningful names (all "TextBox N"/"Grupo N") and column assignment has
to be reconstructed from (x, y) position instead.

Usage: python dump_pptx_shapes.py archivo.pptx
"""
from pathlib import Path
import sys
try:
    from pptx import Presentation
    from pptx.util import Emu
except ImportError:
    Presentation = None
    Emu = None


def emu_to_in(v):
    return round(Emu(v).inches, 2) if v is not None else None


def walk(shapes, depth=0):
    for shape in shapes:
        left, top = emu_to_in(shape.left), emu_to_in(shape.top)
        width, height = emu_to_in(shape.width), emu_to_in(shape.height)
        text = ""
        if shape.has_text_frame:
            text = shape.text_frame.text.replace("\n", " \\n ").strip()
        prefix = "  " * depth
        print(f"{prefix}[{shape.shape_type}] pos=({left},{top}) size=({width},{height}) text={text!r}")
        if shape.shape_type == 6:  # GROUP
            walk(shape.shapes, depth + 1)


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print("Uso: python dump_pptx_shapes.py <archivo.pptx>")
        sys.exit(0 if len(sys.argv) >= 2 and sys.argv[1] in ("-h", "--help") else 1)

    if Presentation is None:
        print(
            "ERROR: La librería 'python-pptx' no está instalada.\n"
            "Instálala con:\n"
            "  pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org python-pptx",
            file=sys.stderr,
        )
        sys.exit(1)

    file_path = Path(sys.argv[1])
    if not file_path.is_file():
        print(f"Error: El archivo '{file_path}' no existe o no es un fichero válido.", file=sys.stderr)
        sys.exit(1)

    prs = Presentation(str(file_path))
    for i, slide in enumerate(prs.slides, 1):
        print(f"\n=================== SLIDE {i} ===================")
        walk(slide.shapes)


if __name__ == "__main__":
    main()
