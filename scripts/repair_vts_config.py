"""Repair the VTS screen-button sentinel without losing personal mappings.

The installed VTS 1.35.10 HotkeyConfigItem indexes button selectors using
ScreenButtonID - 1 unless ID is -1. Zero is not the unassigned value.
"""
from pathlib import Path
import json

def repaired(data):
    edits=[]
    for hotkey in data.get('Hotkeys',[]):
        triggers=hotkey.setdefault('Triggers',{})
        button=triggers.get('ScreenButton',-1)
        if button==0 or 'ScreenButton' not in triggers:
            triggers['ScreenButton']=-1
            edits.append({'hotkey':hotkey.get('Name'),'from':button,'to':-1})
        elif not isinstance(button,int) or button < -1 or button > 8:
            raise ValueError('Unsupported VTS screen-button value: '+str(button))
    data.setdefault('FileReferences',{})['Icon']='Cormy.icon.png'
    return edits

if __name__=='__main__':
    root=Path(__file__).resolve().parents[1]
    path=root/'VTubeStudio/Cormy/Cormy.vtube.json'
    data=json.loads(path.read_text(encoding='utf-8-sig'))
    edits=repaired(data)
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'repaired':edits,'icon':data['FileReferences']['Icon']},ensure_ascii=False))
