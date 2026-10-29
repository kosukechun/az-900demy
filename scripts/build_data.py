"""Build the quiz from the editable Q1-Q6 UTF-8 text files and answer tables."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEARN = 'https://learn.microsoft.com/'
SOURCES = {
    'risk': ('リスクベースのアクセス制御', LEARN+'en-us/entra/id-protection/concept-identity-protection-policies'),
    'join': ('Entra参加の対応OS', LEARN+'en-us/entra/identity/devices/concept-directory-join'),
    'labels': ('秘密度ラベル', LEARN+'en-us/purview/sensitivity-labels'),
    'locks': ('リソースのロック', LEARN+'en-us/azure/azure-resource-manager/management/lock-resources'),
    'actions': ('Azure Monitorの通知先', LEARN+'en-us/azure/azure-monitor/alerts/action-groups'),
    'backup': ('Azure Backupの概要', LEARN+'en-us/azure/backup/backup-overview'),
    'backup-policy': ('バックアップのAzure Policy', LEARN+'en-us/azure/backup/backup-azure-auto-enable-backup'),
    'support': ('サポートプランの比較', 'https://azure.microsoft.com/en-us/support/plans/'),
    'files': ('Azure Filesの接続方式', LEARN+'en-us/azure/storage/files/storage-files-networking-overview'),
    'lifecycle': ('モダンライフサイクルポリシー', LEARN+'en-us/lifecycle/policies/modern'),
    'blueprints': ('Blueprintsの概要と移行案内', LEARN+'en-us/azure/governance/blueprints/overview'),
    'storage-limits': ('ストレージの制限', LEARN+'en-us/azure/storage/common/scalability-targets-standard-account'),
    'sla': ('AzureのSLA', 'https://azure.microsoft.com/en-us/support/legal/sla/'),
}
def read_questions():
    questions = []
    for group in range(1,7):
        source = (ROOT/f'data/Q{group}.txt').read_text(encoding='utf-8')
        blocks = re.split(r'^=== (Q[1-6]-\d{2}) ===\s*$',source,flags=re.M)
        assert not blocks[0].strip(), f'Unexpected preamble in Q{group}.txt'
        for ident,body in zip(blocks[1::2],blocks[2::2]):
            prompt,choice_text=body.strip().split('\n--- 選択肢 ---\n',1)
            choices=[]
            for line in choice_text.splitlines():
                if not line.strip(): continue
                label,text=line.split('. ',1)
                assert label==chr(65+len(choices)), f'{ident}: choice order'
                assert text.strip(), f'{ident}: empty choice'
                choices.append({'text':text})
            assert len(choices)>=2 and prompt.strip(), ident
            questions.append(dict(id=ident,group=f'Q{group}',number=int(ident[-2:]),prompt=prompt.strip(),choices=choices))
        assert sum(q['group']==f'Q{group}' for q in questions)==70, f'Q{group}: expected 70 questions'
    return questions

def build():
    questions = read_questions()
    answers = {}
    for group in range(1,7):
        lines = (ROOT/f'data/answers-Q{group}.tsv').read_text(encoding='utf-8').splitlines()
        assert len(lines) == 70, f'Q{group}: expected 70 answers, got {len(lines)}'
        for line in lines:
            fields = line.split('|')
            number, key, explanation = fields[:3]
            ident = f'Q{group}-{number}'
            assert ident not in answers, f'Duplicate answer: {ident}'
            accepted = [] if key=='?' else [[int(v)-1 for v in a.split(',')] for a in key.split(';')]
            sources = [{'title':SOURCES[s][0], 'url':SOURCES[s][1]} for s in fields[3:] if s]
            answers[ident] = dict(accepted=accepted, ungraded=key=='?', explanation=explanation, sources=sources)
    public = []
    for q in questions:
        q.update(answers[q['id']])
        q['multiple'] = any(len(a)>1 for a in q['accepted'])
        assert q['choices'], q['id']
        assert all(0<=v<len(q['choices']) for a in q['accepted'] for v in a), q['id']
        assert all(c['text'] for c in q['choices']), f'Missing accessible choice text: {q["id"]}'
        if q['id']=='Q3-06': q['notice'] = '元画像に下の選択肢が写っていないため、この問題は解説のみです。'
        public.append(q)
    assert len(public)==420 and len(answers)==420
    (ROOT/'data/questions.js').write_text('/* Generated from Q1-Q6.txt and answers-Q1-Q6.tsv by scripts/build_data.py. */\nwindow.AZ_QUESTIONS = '+json.dumps(public,ensure_ascii=False,separators=(',',':'))+';\n', encoding='utf-8')
    ungraded = [q['id'] for q in public if q['ungraded']]
    print(f'Built {len(public)} questions: {len(public)-len(ungraded)} scored, {len(ungraded)} explanation-only.')
    print('Explanation-only:', ', '.join(ungraded))

if __name__=='__main__': build()
