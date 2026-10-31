#!/usr/bin/env python3
"""Build Cucoloris Lab from src/ into one self-contained page.

    python3 build.py            writes dist/cucoloris-lab.html and index.html

src/page.html   the page markup and styles (ends with the opening <script> tag)
src/app.js      the application; /*@@PART name@@*/ markers pull in src/parts/name.js
src/parts/      one file per subsystem (see docs/HOUDINI.md for the map)

The web version, the Claude artifact and any production host all load the same built page:
there is one codebase, and a host only adds window.CUCOLORIS_HOST before it (docs/HOUDINI.md)."""
import os, re, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')

def inline(text, seen=()):
    def part(m):
        name = m.group(1)
        if name in seen: raise SystemExit(f'part {name} includes itself')
        return inline(open(os.path.join(SRC, 'parts', name + '.js')).read(), seen + (name,))
    return re.sub(r'/\*@@PART (\w+)@@\*/', part, text)

def build():
    page = open(os.path.join(SRC, 'page.html')).read().rstrip('\n')
    js = inline(open(os.path.join(SRC, 'app.js')).read())
    body = page + '\n' + js + '\n</script>\n'
    os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
    open(os.path.join(ROOT, 'dist', 'cucoloris-lab.html'), 'w').write(body)
    # the GitHub Pages copy: the same page inside a full HTML document
    i = body.index('</style>') + len('</style>')
    head, rest = body[:i], body[i:]
    doc = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
           '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
           '<meta name="description" content="Simulated water caustics and tree shadows for light gobos: seamless, loopable, physically based.">\n'
           '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,-apple-system,"Segoe UI",sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>\n'
           f'{head}\n</head>\n<body>\n{rest}\n</body>\n</html>\n')
    open(os.path.join(ROOT, 'index.html'), 'w').write(doc)
    return body

if __name__ == '__main__':
    b = build()
    print(f'built dist/cucoloris-lab.html ({len(b) // 1024} KB) and index.html')
