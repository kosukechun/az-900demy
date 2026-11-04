"""Build the quiz from editable UTF-8 question, answer and glossary files."""
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
    'files': ('Azure Filesの接続方式', LEARN+'en-us/azure/storage/files/storage-files-introduction'),
    'lifecycle': ('モダンライフサイクルポリシー', LEARN+'en-us/lifecycle/policies/modern'),
    'blueprints': ('Blueprintsの概要と移行案内', LEARN+'en-us/azure/governance/blueprints/overview'),
    'storage-limits': ('ストレージの制限', LEARN+'en-us/azure/storage/common/scalability-targets-standard-account'),
    'sla': ('AzureのSLA', 'https://azure.microsoft.com/en-us/support/legal/sla/'),
}
SOURCES.update(json.loads((ROOT/'data/reference-sources.json').read_text(encoding='utf-8')))
META = json.loads((ROOT/'data/content-meta.json').read_text(encoding='utf-8'))
GLOSSARY = []
for line in (ROOT/'data/glossary.tsv').read_text(encoding='utf-8').splitlines():
    term, patterns, role, source = line.split('|')
    GLOSSARY.append(dict(term=term, patterns=patterns.split(','), role=role, source=source))

def learning_terms(q):
    # Prioritize the answer's role, then the context; never add unrelated distractors.
    texts = [' '.join(q['choices'][i]['text'] for a in q['accepted'] for i in a), q['prompt'], q['explanation']]
    found = []
    for text in texts:
        candidates = [g for g in GLOSSARY if any(re.search(p,text,re.I) for p in g['patterns'])]
        # Specific product names should take precedence over generic parent concepts.
        candidates.sort(key=lambda g: max(len(p) for p in g['patterns'] if re.search(p,text,re.I)),reverse=True)
        for g in candidates:
            if g['term'] not in [t['term'] for t in found]: found.append(g)
            if len(found)==3: return found
    return found
def read_questions():
    questions = []
    for group, total in META['groups'].items():
        source = (ROOT/f'data/{group}.txt').read_text(encoding='utf-8')
        blocks = re.split(r'^=== (Q\d+-\d{2}) ===\s*$',source,flags=re.M)
        assert not blocks[0].strip(), f'Unexpected preamble in {group}.txt'
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
            questions.append(dict(id=ident,group=group,number=int(ident[-2:]),prompt=prompt.strip(),choices=choices))
        assert sum(q['group']==group for q in questions)==total, f'{group}: expected {total} questions'
    return questions

def build():
    questions = read_questions()
    answers = {}
    for group, total in META['groups'].items():
        lines = (ROOT/f'data/answers-{group}.tsv').read_text(encoding='utf-8').splitlines()
        assert len(lines) == total, f'{group}: expected {total} answers, got {len(lines)}'
        for line in lines:
            fields = line.split('|')
            number, key, explanation = fields[:3]
            ident = f'{group}-{number}'
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
        terms = learning_terms(q)
        q['terms'] = [dict(term=g['term'],role=g['role']) for g in terms]
        if not q['sources']:
            for g in terms:
                if g['source']:
                    title,url=SOURCES[g['source']]
                    q['sources']=[dict(title=title,url=url)]
                    break
        if q['id'] in META['revisedIds']:
            q['revision']=2
            q['checkedAt']=META['checkedAt']
        if q['group']=='Q7':
            q['checkedAt']=META['checkedAt']
            pages=[2,2,3,3,4,4,4,5,5,5,6,6,6,6,7,7,7,8,8,8,9,9,9,10,10,11,11,11,12,12,13,13,14,14,15,15,15,16,16,16]
            q['origin']=dict(file='mogimondai.pdf',question=q['number'],page=pages[q['number']-1])
        public.append(q)
    assert len(public)==sum(META['groups'].values()) and len(answers)==len(public)
    assert all(q['accepted'] and not q['ungraded'] for q in public), 'All questions must be answerable'
    (ROOT/'data/questions.js').write_text('/* Generated by scripts/build_data.py. */\nwindow.AZ_QUESTIONS = '+json.dumps(public,ensure_ascii=False,separators=(',',':'))+';\n', encoding='utf-8')
    ungraded = [q['id'] for q in public if q['ungraded']]
    print(f'Built {len(public)} questions: {len(public)-len(ungraded)} scored, {len(ungraded)} explanation-only.')
    print('Explanation-only:', ', '.join(ungraded))

if __name__=='__main__': build()
