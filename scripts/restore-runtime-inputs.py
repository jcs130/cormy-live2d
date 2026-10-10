"""Restore curated runtime controls around a freshly exported no-yaw rig."""
from pathlib import Path
import hashlib
import json
import shutil
from repair_vts_config import repaired

root = Path(__file__).resolve().parents[1]
curated = root/'source/runtime-inputs'

def write(file, data):
    file.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf8')

def zero_motion(curve):
    segments = curve['Segments']
    # Cubism motion segment encoding: initial time/value, then linear,
    # Bezier, stepped or inverse-stepped endpoints. Preserve timing/counts.
    segments[1] = 0
    i = 2
    while i < len(segments):
        kind = segments[i]
        if kind == 1:
            for j in [i+2, i+4, i+6]:
                segments[j] = 0
            i += 7
        elif kind in [0, 2, 3]:
            segments[i+2] = 0
            i += 3
        else:
            raise ValueError(f'Unknown motion segment {kind}')

for file in curated.rglob('*.json'):
    data = json.loads(file.read_text(encoding='utf-8-sig'))
    if file.name.endswith('.motion3.json'):
        for curve in data.get('Curves', []):
            if curve.get('Target') == 'Parameter' and curve.get('Id') == 'ParamAngleX':
                zero_motion(curve)
    if file.name.endswith('.exp3.json'):
        data['Parameters'] = [p for p in data.get('Parameters', []) if p['Id'] != 'ParamAngleX']
    if file.name == 'Cormy.vtube.json':
        repaired(data)
        data['Name'] = 'Cormy NoTurn'
        data['ModelID'] = hashlib.sha256(b'Cormy-Live2D-v6.7-no-head-yaw').hexdigest()[:32]
        data['ParameterSettings'] = [p for p in data['ParameterSettings'] if p.get('OutputLive2D') != 'ParamAngleX']
        data['Hotkeys'] = [h for h in data['Hotkeys'] if h.get('File') != 'Cormy.shake.motion3.json']
    if file.name == 'cortico.profile.json':
        data['id'] = 'VTS-Cormy-NoTurn'
        data['label'] = '可米 Cormy · 正面版'
        data['vtsModelName'] = 'Cormy NoTurn'
        data['wiring']['FaceAngleX'] = {'neutral': 0, 'scale': 0, 'clamp': [0, 0]}
        data['caveat'] = 'v6.7：左右转头在模型绑定中关闭。保留 v6.4 正脸、16 表情、6 动作、自然眨眼、口型、歪头、耳灯及尾巴物理。'
    write(file, data)

for folder in ['VTubeStudio/Cormy', 'model']:
    target = root/folder
    for file in curated.rglob('*'):
        if file.is_file() and (file.suffix == '.json' or file.name == 'Cormy.icon.png') and file.name != 'Cormy.cdi3.json':
            out = target/file.relative_to(curated)
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(file, out)
    physics_file = target/'Cormy.physics3.json'
    physics = json.loads(physics_file.read_text(encoding='utf8'))
    for group in physics['PhysicsSettings']:
        for item in group.get('Input', []):
            if item.get('Source', {}).get('Id') == 'ParamAngleX':
                item['Weight'] = 0
    write(physics_file, physics)

print('Curated controls restored. Head-yaw tracking, motion and physics input disabled.')
