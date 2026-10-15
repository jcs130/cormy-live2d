"""Copy a YSM pack and separate eligible coplanar north/south mesh faces.

This is an explicit asset migration, not a client renderer patch. The input is
never written. Requires Pillow only when converting WebP author avatars for YSM
2.4 compatibility. No network access or game processes are used.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import shutil


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def hashes(root: Path) -> dict[str, str]:
    return {p.relative_to(root).as_posix(): sha256(p)
            for p in sorted(root.rglob('*')) if p.is_file()}


def read_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write_json(path: Path, value) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n',
                    encoding='utf-8')


def pack_path(root: Path, relative: str) -> Path:
    path = (root / relative.replace('\\', '/')).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise ValueError(f'Invalid pack file: {relative!r}')
    return path


def eligible(cube: dict) -> bool:
    size, origin, uv = cube.get('size'), cube.get('origin'), cube.get('uv')
    return (isinstance(size, list) and len(size) == 3
            and isinstance(origin, list) and len(origin) == 3
            and all(isinstance(n, (int, float)) and math.isfinite(n)
                    for n in size + origin)
            and size[0] > 0 and size[1] > 0 and size[2] == 0
            and cube.get('inflate', 0) == 0
            and isinstance(uv, dict) and set(uv) == {'north', 'south'})


def migrate(source: Path, output: Path, thickness: float,
            expected: int | None, version: str | None,
            remove_bones: list[str] | None = None) -> dict:
    source, output = source.resolve(strict=True), output.resolve()
    if not source.is_dir() or output.exists() or output.is_relative_to(source):
        raise ValueError('Output must be a new directory outside the source pack')
    if not math.isfinite(thickness) or not 0 < thickness <= 0.05:
        raise ValueError('Thickness must be greater than 0 and at most 0.05 model units')
    if any(p.is_symlink() for p in source.rglob('*')):
        raise ValueError('Resolve pack symlinks before migration')
    before = hashes(source)
    metadata = read_json(source / 'ysm.json')
    original_meta = copy.deepcopy(metadata)
    models = metadata['files']['player']['model']
    changes, rewritten, originals, removed = [], {}, {}, []
    requested_bones = set(remove_bones or [])
    found_bones = set()
    for relative in sorted(set(models.values())):
        path = pack_path(source, relative)
        relative = path.relative_to(source).as_posix()
        data = read_json(path)
        originals[relative] = copy.deepcopy(data)
        for gi, geo in enumerate(data.get('minecraft:geometry', [])):
            for bi, bone in enumerate(geo.get('bones', [])):
                if bone.get('name') in requested_bones:
                    found_bones.add(bone['name'])
                    removed.append({'file': relative, 'geometry': gi, 'bone': bi,
                                    'name': bone['name'],
                                    'cubes': copy.deepcopy(bone.get('cubes', []))})
                    bone['cubes'] = []
                for ci, cube in enumerate(bone.get('cubes', [])):
                    if eligible(cube):
                        old_z = cube['origin'][2]
                        cube['origin'][2] = old_z - thickness / 2
                        cube['size'][2] = thickness
                        changes.append({'file': relative, 'geometry': gi,
                                        'bone': bi, 'cube': ci, 'originZ': old_z})
        rewritten[relative] = data
    if found_bones != requested_bones:
        raise ValueError(f'Unknown removal bones: {sorted(requested_bones - found_bones)}')
    if not changes or (expected is not None and len(changes) != expected):
        raise ValueError(f'Eligible face count {len(changes)} does not match {expected}')

    avatars = []
    for author in metadata.get('metadata', {}).get('authors', []):
        relative = author.get('avatar', '')
        if not relative.lower().endswith('.webp'):
            continue
        original = pack_path(source, relative)
        png_relative = original.relative_to(source).with_suffix('.png').as_posix()
        if (source / png_relative).exists():
            raise ValueError(f'Avatar conversion would overwrite {png_relative}')
        avatars.append((relative, png_relative))
        author['avatar'] = png_relative
    if version is not None:
        metadata['metadata']['version'] = version
    if avatars:
        from PIL import Image
    shutil.copytree(source, output)
    for relative, data in rewritten.items():
        write_json(output / relative, data)
    for relative, png_relative in avatars:
        with Image.open(pack_path(source, relative)) as image:
            image.convert('RGBA').save(output / png_relative, format='PNG')
    write_json(output / 'ysm.json', metadata)

    # Verify the actual output, including byte identity of all unrelated files.
    for relative, expected_data in rewritten.items():
        actual = read_json(output / relative)
        if actual != expected_data:
            raise AssertionError(f'Output serialization mismatch: {relative}')
        reverted = copy.deepcopy(actual)
        for change in (c for c in changes if c['file'] == relative):
            cube = reverted['minecraft:geometry'][change['geometry']]['bones'][change['bone']]['cubes'][change['cube']]
            patched = actual['minecraft:geometry'][change['geometry']]['bones'][change['bone']]['cubes'][change['cube']]
            if not math.isclose(patched['origin'][2] + patched['size'][2] / 2,
                                change['originZ'], abs_tol=1e-12):
                raise AssertionError('Plane center moved')
            cube['origin'][2], cube['size'][2] = change['originZ'], 0
        for removal in (r for r in removed if r['file'] == relative):
            bone = reverted['minecraft:geometry'][removal['geometry']]['bones'][removal['bone']]
            if bone['cubes']:
                raise AssertionError('Removed accessory still has geometry')
            if 'cubes' in originals[relative]['minecraft:geometry'][removal['geometry']]['bones'][removal['bone']]:
                bone['cubes'] = removal['cubes']
            else:
                del bone['cubes']
        if reverted != originals[relative]:
            raise AssertionError(f'Unexpected geometry change: {relative}')
    if read_json(output / 'ysm.json') != metadata:
        raise AssertionError('Unexpected metadata change')
    for original, png in avatars:
        with Image.open(source / original) as a, Image.open(output / png) as b:
            if a.convert('RGBA').tobytes() != b.convert('RGBA').tobytes():
                raise AssertionError('Avatar pixels changed')
    after = hashes(output)
    allowed = set(rewritten) | {'ysm.json'}
    for relative, digest in before.items():
        if relative not in allowed and after.get(relative) != digest:
            raise AssertionError(f'Unrelated pack file changed: {relative}')
    if hashes(source) != before:
        raise AssertionError('Source pack changed during migration')
    report = {
        'schema': 'ysm-zero-depth-migration/v1',
        'thicknessModelUnits': thickness,
        'thicknessBlocks': thickness / 16,
        'changedPlanes': len(changes),
        'modelCounts': {name: sum(c['file'] == name for c in changes)
                        for name in rewritten},
        'sourceVersion': original_meta.get('metadata', {}).get('version'),
        'outputVersion': metadata.get('metadata', {}).get('version'),
        'avatarConversions': [{'from': a, 'to': b} for a, b in avatars],
        'sourceUnchanged': True,
        'unrelatedFilesByteIdentical': True,
        'planeCentersPreserved': True,
        'geometryOnlyDeclaredChanges': True,
        'removedAccessories': [{k: v for k, v in r.items() if k != 'cubes'}
                               | {'removedCubes': len(r['cubes'])} for r in removed],
        'sourceSha256': before, 'outputSha256': after,
        'changes': changes,
    }
    write_json(output / 'render-fix-report.json', report)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--thickness', type=float, default=0.01)
    parser.add_argument('--expect-planes', type=int)
    parser.add_argument('--version')
    parser.add_argument('--remove-bone', action='append', default=[],
                        help='Explicit accessory bone whose cubes will be removed; skeleton is kept')
    args = parser.parse_args()
    result = migrate(args.source, args.output, args.thickness,
                     args.expect_planes, args.version, args.remove_bone)
    print(json.dumps({k: v for k, v in result.items()
                      if k not in {'sourceSha256', 'outputSha256', 'changes'}},
                     ensure_ascii=False, indent=2))
