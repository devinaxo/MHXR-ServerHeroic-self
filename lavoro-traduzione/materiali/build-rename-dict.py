#!/usr/bin/env python3
"""Build the {old_en -> new_en} dictionary the pack edit needs.

The client pack already holds English names, so translating it again means
mapping the OLD English (committed materiali.json) to the NEW English (working
tree). Output: lavoro-traduzione/materiali/item-rename.json

    python3 lavoro-traduzione/materiali/build-rename-dict.py
"""
import json, subprocess, collections, pathlib

REPO = pathlib.Path(__file__).resolve().parents[2]
OLD = json.loads(subprocess.check_output(['git', '-C', str(REPO), 'show', 'HEAD:src/json/materiali.json']))
NEW = json.loads((REPO / 'src/json/materiali.json').read_text(encoding='utf-8'))

old_by = {r['id']: r.get('en', '') for r in OLD}
new_by = {r['id']: r.get('en', '') for r in NEW}

mapping = {}
coll = collections.defaultdict(set)
for i, n in new_by.items():
    o = old_by.get(i)
    if o is None or o == n:
        continue
    mapping[o] = n
    coll[o].add(n)

dupes = {o: v for o, v in coll.items() if len(v) > 1}
out = REPO / 'lavoro-traduzione/materiali/item-rename.json'
out.write_text(json.dumps(mapping, ensure_ascii=False, indent=1), encoding='utf-8')
print(f'changed rows: {sum(1 for i in new_by if old_by.get(i) not in (None, new_by[i]))}')
print(f'distinct keys: {len(mapping)}  collisions: {len(dupes)}')
if dupes:
    for o, v in list(dupes.items())[:10]:
        print('  !', o, '->', v)
print('wrote', out.relative_to(REPO))
