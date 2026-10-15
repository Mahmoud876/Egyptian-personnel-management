"""One offline, physical-size label document shared by preview and printing."""
import base64
import html
import re
from functools import lru_cache
from pathlib import Path

from barcode import Code128
from barcode.writer import SVGWriter

LABEL_CSP = "default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:"


@lru_cache(maxsize=1)
def font_data():
    return base64.b64encode((Path(__file__).parent / "assets/cairo-arabic-400-normal.woff2").read_bytes()).decode("ascii")


def render_label(barcode: str, name: str, police_number: str, year: int) -> str:
    if not re.fullmatch(r"[0-9]{12}", barcode):
        raise ValueError("INVALID_LABEL_BARCODE")
    graphic = Code128(barcode, writer=SVGWriter()).render({"module_width": .25, "module_height": 8,
        "quiet_zone": 2.5, "margin_top": 1, "margin_bottom": 1, "write_text": False})
    svg = graphic.decode("utf-8")
    svg = svg[svg.index("<svg"):]
    return f'''<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="{LABEL_CSP}">
<title>ملصق المجند</title><style>
@font-face{{font-family:LabelCairo;src:url(data:font/woff2;base64,{font_data()}) format('woff2');font-weight:400}}
@page{{size:50mm 25mm;margin:0}}
*{{box-sizing:border-box}}html,body{{margin:0;padding:0;width:50mm;height:25mm;background:white;color:black}}
.label{{width:50mm;height:25mm;padding:1mm;display:grid;grid-template-rows:10mm 3mm 7mm 3mm;
text-align:center;break-inside:avoid;break-after:avoid;font-family:LabelCairo,Tahoma,Arial,sans-serif}}
.bars{{display:flex;justify-content:center;align-items:center;direction:ltr}}
.bars svg{{display:block;flex-shrink:0;width:30.25mm;height:10mm;shape-rendering:crispEdges}}
.digits{{font:8pt/3mm monospace;direction:ltr}}
.name{{font-size:9pt;line-height:1.1;min-height:0;overflow-wrap:anywhere}}
.ids{{font-size:8pt;line-height:3mm;white-space:nowrap;direction:ltr}}
</style></head><body><main class="label">
<div class="bars">{svg}</div><div class="digits">{barcode}</div>
<div class="name">{html.escape(name)}</div>
<div class="ids">{html.escape(police_number)} / {int(year)}</div>
</main></body></html>'''
