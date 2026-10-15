"""Check the actual SVG output with an independent decoder at printer resolutions."""
import re
import xml.etree.ElementTree as ET

import pytest
import zxingcpp

from app.recruits.labels import render_label


@pytest.mark.parametrize("dpi", [203, 300])
@pytest.mark.parametrize("value", ["202610000001", "202649999999", "000000000000"])
def test_label_barcode_decodes_at_physical_size(dpi, value):
    html = render_label(value, "أحمد محمد حسن عبد الرحمن", "123456", 2026)
    svg = ET.fromstring(re.search(r"<svg.*?</svg>", html, re.S).group(0))
    assert float(svg.attrib["width"].removesuffix("mm")) == pytest.approx(30.25)
    assert float(svg.attrib["height"].removesuffix("mm")) == pytest.approx(10)
    scale = dpi / 25.4
    width, height = round(30.25 * scale), round(10 * scale)
    pixels = bytearray([255]) * (width * height)
    bars = [r for r in svg.iter("{http://www.w3.org/2000/svg}rect") if 'fill:black' in r.attrib.get('style', '')]
    assert bars
    left = min(float(r.attrib['x'].removesuffix('mm')) for r in bars)
    right = max(float(r.attrib['x'].removesuffix('mm')) + float(r.attrib['width'].removesuffix('mm')) for r in bars)
    assert left == pytest.approx(2.5) and 30.25 - right == pytest.approx(2.5)
    for rect in bars:
        x, y, w, h = (float(rect.attrib[k].removesuffix('mm')) for k in ['x', 'y', 'width', 'height'])
        for py in range(round(y * scale), round((y + h) * scale)):
            start, end = round(x * scale), round((x + w) * scale)
            pixels[py * width + start:py * width + end] = b'\x00' * (end - start)
    result = zxingcpp.read_barcode(memoryview(pixels).cast('B', shape=[height, width]))
    assert result is not None and result.text == value
    assert result.format == zxingcpp.BarcodeFormat.Code128


def test_label_preserves_full_name_escapes_content_and_embeds_offline_font():
    name = 'عبد الرحمن ' * 15 + '<script>unsafe</script>'
    html = render_label('202610000001', name, '123&456', 2026)
    assert 'عبد الرحمن ' * 15 in html
    assert '&lt;script&gt;unsafe&lt;/script&gt;' in html and '<script>' not in html
    assert '123&amp;456 / 2026' in html
    assert 'data:font/woff2;base64,' in html
    assert '@page{size:50mm 25mm;margin:0}' in html
    assert 'overflow:hidden' not in html
