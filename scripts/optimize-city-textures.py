#!/usr/bin/env python3
"""Create bounded-memory city texture variants; keep original geometry and GLBs.
Requires Python 3 and Pillow (`python -m pip install Pillow`).
"""
import io
import json
from pathlib import Path
import struct
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / 'frontend/public/models/chuncks'


def optimize(source, maximum):
    raw = source.read_bytes()
    assert raw[:4] == b'glTF', 'Materialize the source GLB with git lfs first'
    json_size = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + json_size])
    old_bin = raw[28 + json_size:]
    assert len(doc['buffers']) == 1 and 'uri' not in doc['buffers'][0]
    image_views = {image['bufferView']: image['mimeType'] for image in doc.get('images', [])}
    new_bin = bytearray()
    old_pixels = new_pixels = 0
    for index, view in enumerate(doc['bufferViews']):
        assert view.get('buffer', 0) == 0
        start = view.get('byteOffset', 0)
        payload = old_bin[start:start + view['byteLength']]
        if index in image_views:
            image = Image.open(io.BytesIO(payload))
            old_pixels += image.width * image.height
            image.thumbnail((maximum, maximum), Image.Resampling.LANCZOS)
            new_pixels += image.width * image.height
            output = io.BytesIO()
            if image_views[index] == 'image/jpeg':
                image.convert('RGB').save(output, format='JPEG', quality=88, optimize=True)
            elif image_views[index] == 'image/webp':
                image.save(output, format='WEBP', quality=90, method=4)
            else:
                assert image_views[index] == 'image/png'
                image.save(output, format='PNG', optimize=True)
            payload = output.getvalue()
        new_bin.extend(b'\0' * (-len(new_bin) % 4))
        view['byteOffset'] = len(new_bin)
        view['byteLength'] = len(payload)
        new_bin.extend(payload)
    doc['buffers'][0]['byteLength'] = len(new_bin)
    encoded = json.dumps(doc, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    new_bin.extend(b'\0' * (-len(new_bin) % 4))
    result = struct.pack('<III', 0x46546C67, 2, 28 + len(encoded) + len(new_bin))
    result += struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
    result += struct.pack('<II', len(new_bin), 0x004E4942) + new_bin
    target = source.with_name(source.stem + f'_textures{maximum}.glb')
    target.write_bytes(result)
    # Every non-image buffer view, including Draco geometry, must be identical.
    original = json.loads(raw[20:20 + json_size])
    for i, before in enumerate(original['bufferViews']):
        if i in image_views:
            continue
        after = doc['bufferViews'][i]
        a = before.get('byteOffset', 0)
        b = after['byteOffset']
        assert old_bin[a:a + before['byteLength']] == new_bin[b:b + after['byteLength']]
    assert original['meshes'] == doc['meshes'] and original['nodes'] == doc['nodes']
    print(f'{target.name}: {len(raw):,} -> {len(result):,} bytes; decoded RGBA {old_pixels*4/1e6:.1f} -> {new_pixels*4/1e6:.1f} MB; geometry verified')


if __name__ == '__main__':
    for name in ('chunck_0,0_2x2_blocks_centered.glb', 'chunck_0,0_2x2_roads.glb'):
        for maximum in (512, 1024):
            optimize(MODELS / name, maximum)
