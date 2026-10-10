"""Package the authored PNGs and their reproducible sources; no game changes."""
import datetime as dt
import hashlib
import json
from pathlib import Path
import zipfile

ROOT=Path(__file__).resolve().parents[1]
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def main():
    excluded={'manifest.json','SHA256SUMS.txt','Cormy-Vanilla-Skins-v3.zip'}
    files=sorted(p for p in ROOT.rglob('*') if p.is_file() and p.name not in excluded
                 and 'node_modules' not in p.parts and '__pycache__' not in p.parts)
    entries=[{'file':p.relative_to(ROOT).as_posix(),'bytes':p.stat().st_size,'sha256':digest(p)} for p in files]
    manifest={'character':'Cormy / 可米','version':'3.0.0','kind':'vanilla-minecraft-skin',
              'createdAt':dt.datetime.now(dt.timezone.utc).isoformat(),
              'recommended':'cormy-slim-64x64.png','modelTypes':['slim','classic'],
              'conceptGenerator':'built-in image_gen','finalTexture':'Authored native 64x64 UV texels',
              'prompt':'reference/prompts.json','validation':'validation.json',
              'gameSkinApplied':False,'gameServiceTouched':False,'ysmChanged':False,'files':entries}
    (ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (ROOT/'SHA256SUMS.txt').write_text(''.join(f"{e['sha256']}  {e['file']}\n" for e in entries),encoding='utf-8')
    archive=ROOT/'Cormy-Vanilla-Skins-v3.zip'
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for p in [*files,ROOT/'manifest.json',ROOT/'SHA256SUMS.txt']:
            z.write(p,'Cormy-Vanilla-Skins-v3/'+p.relative_to(ROOT).as_posix())
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        for e in entries:
            assert hashlib.sha256(z.read('Cormy-Vanilla-Skins-v3/'+e['file'])).hexdigest()==e['sha256']
    print(json.dumps({'file':str(archive),'bytes':archive.stat().st_size,'files':len(entries)+2,'sha256':digest(archive)},ensure_ascii=False))
if __name__=='__main__':main()
