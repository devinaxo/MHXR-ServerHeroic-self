#!/usr/bin/env python3
"""Rebuild the material names with pixel-accurate word wrapping and shortening.

The name box draws with a proportional font, breaks at a fixed pixel width with
no word preference, and DOES honor \\r\\n. So we wrap at word boundaries and, when
a name still does not fit two lines, shorten it. 2 lines is a hard rule.

  monster:  tier initial -> drop it -> shorten the base to its last word -> split
            the glued prefix at a dot
  other:    template + lexicon abbreviations -> drop [..] -> drop leading words
            -> keep the tail, hard-chop to two lines

Base is the committed materiali.json / dictionary (HEAD), so this is re-runnable.
    python3 lavoro-traduzione/materiali/retranslate-materiali.py [--apply]
"""
import json, subprocess, struct, pathlib, sys, re

REPO = pathlib.Path(__file__).resolve().parents[2]
APPLY = '--apply' in sys.argv
W = 300

def _widths():
    b = (REPO / 'lavoro-traduzione/materiali/build/font/font0_high').read_bytes()
    w, i = {}, 0x4c
    while i + 16 <= len(b):
        c = struct.unpack_from('<I', b, i)[0]
        if 0x20 <= c <= 0x7e:
            w[chr(c)] = b[i + 9]
        i += 16
    return w
FW = _widths()
def pix(s): return sum(FW.get(c, 20) for c in s)

RENAME = {}
for jp_el, en_el in {'火炎':'Fire','水冷':'Water','土崩':'Earth','雷鳴':'Thunder','氷結':'Ice'}.items():
    RENAME[f'{jp_el}練糸']  = f'{en_el} Silk'
    RENAME[f'{jp_el}上練糸'] = f'{en_el} Silk+'
    RENAME[f'{jp_el}剛練糸'] = f'{en_el} Silk++'
RENAME['純血晶'] = 'Life Crystal'
RENAME['高純血晶'] = 'Life Crystal+'

TEMPLATE = [('Subjugation','Subj.'),('Special','Sp.'),('Reward','Rwd.'),('Reagent','Rgnt.'),
            ('Refining','Rfn.'),('Augmenting','Aug.'),('Sublimation','Subl.'),('Elixir','Elxr'),
            ('Sellable','S'),('Age 37','37')]
LEX2 = [('Corroded','Corr.'),('Ancient','Anc.'),('Common','Cmn.'),('Secret','Sec.'),('Manual','Man.'),
        ('Dragon','Drg.'),('Phantom','Phm.'),('Crystal','Cry.'),('Spirit','Sprt.'),('Thunder','Thdr.'),
        ('Moon','Mn.'),('Clash','Clsh.'),('Battle','Btl.'),('Material','Matl.'),('Sharpening','Shrp.'),
        ('Furnace','Furn.'),('Powder','Pwdr.'),('Wraith','Wrth.')]

def lex(s, full=True):
    for a, b in TEMPLATE:
        s = s.replace(a, b)
    if full:
        for a, b in LEX2:
            s = s.replace(a, b)
    return s

QUAL = {'Steel','Vicious','Blast','Twin','Reinforced'}
VAR = {'Abyssal','Azure','Baleful','Black','Blazing','Cherry','Crimson','Emerald','Enma',
       'Explosive','Fiercewater','Flame','Frozen','Glacial','Gold','Grand','Great','Green',
       'Iceblast','Immortal','Ivory','Jade','Landconquest','Life','Lucent','Moonlit','Nether',
       'Orb','Peak','Heat','Emperor','Thunder','Pink','Purple','Purgatory','Raging','Royal',
       'Rust','Sand','Savage','Scorching','Shiningrock','Silver','Stygian','Thunderbubble',
       'Violet','Virulent','White','Whitewater'}
P2 = ['True Core','Hollow Core','Flame Orb','Aqua Orb','Earth Orb','Thunder Orb','Frost Orb']

def split_tokens(text):
    toks = []
    for w in re.findall(r'\[[^\]]*\]|\S+', text):
        while pix(w) > W and '.' in w[:-1]:
            i = w.rfind('.')
            toks.append(w[:i + 1]); w = w[i + 1:]
        toks.append(w)
    return toks

def wrap_tokens(toks):
    lines, cur = [], ''
    for t in toks:
        cand = f'{cur} {t}' if cur else t
        if cur and pix(cand) > W:
            lines.append(cur); cur = t
        else:
            cur = cand
    if cur:
        lines.append(cur)
    return lines

def fits(text):
    toks = split_tokens(text)
    if any(pix(t) > W for t in toks):
        return None
    L = wrap_tokens(toks)
    return L if len(L) <= 2 else None

def chop2(text):
    toks = split_tokens(text)
    lines = wrap_tokens(toks)
    if len(lines) <= 2:
        return '\r\n'.join(lines)
    kept, cur, n = [], '', 1
    for t in toks:
        cand = f'{cur} {t}' if cur else t
        if cur and pix(cand) > W:
            if n >= 2:
                break
            kept.append(cur); cur = t; n += 1
        else:
            cur = cand
    if cur:
        kept.append(cur)
    return '\r\n'.join(kept[:2])

def parse(en):
    mod = ''
    for g in (' α',' β',' γ'):
        if en.endswith(g):
            mod = g.strip(); en = en[:-2]; break
    t = en.split(); part = None
    if len(t) >= 2 and t[-1] == 'I' and t[-2] in ('Award','Proof'):
        part = ' '.join(t[-2:]); t = t[:-2]
    if part is None:
        for p in P2:
            pw = p.split()
            if t[-len(pw):] == pw:
                part = p; t = t[:-len(pw)]; break
    if part is None:
        part = t[-1]; t = t[:-1]
    part = part.replace('Proof', 'Award')
    q = []
    while t and t[0] in QUAL: q.append(t.pop(0))
    a = []
    while t and t[0] in VAR: a.append(t.pop(0))
    return q, a, ' '.join(t), part, mod

def monster(en):
    q, a, base, part, mod = parse(en)
    short = base.split()[-1] if ' ' in base else base
    for q2, a2, b2 in ((q, a, base), ([], a, base), ([], a, short), ([], [], base), ([], [], short)):
        pre = ''.join(x[0] + '.' for x in q2) + ''.join(x[0] + '.' for x in a2) + b2
        txt = lex(f'{pre} {part}' + (f' {mod}' if mod else ''))
        L = fits(txt)
        if L:
            return '\r\n'.join(L)
    return chop2(lex(f'{short} {part}' + (f' {mod}' if mod else '')))

def compress(text, k):
    """Abbreviate every word longer than k+1 letters to its first k + '.', inside
    brackets too. Keeps the brackets, so nothing becomes unclosed."""
    out = []
    for w in re.findall(r'\[[^\]]*\]|\S+', text):
        if w.startswith('[') and w.endswith(']'):
            core = ''.join(ch for ch in w[1:-1] if ch.isalnum())
            out.append('[' + (core[:k] + '.' if len(core) > k + 1 else w[1:-1]) + ']')
        else:
            core = ''.join(ch for ch in w if ch.isalnum())
            out.append(core[:k] + '.' if len(core) > k + 1 else w)
    return ' '.join(out)

BASE_MAP = {
    "Undying Hunter's Soul": "Hunter's Soul",
    "Undying Path of Supremacy": "Supremacy",
    "Butterfly Arc Rhythm": "Arc Rhythm",
    "Butterfly Dance, Bee Sting": "Butterfly Dance",
    "Lion-Dragon's Heavenly Ascent": "Heavenly Ascent",
    "Transcendent Technique": "Technique",
    "Special Suppression Technique": "Suppression",
    "Brilliant Talent in Bloom": "Talent in Bloom",
    "Death Butterfly Offbeat": "Butterfly Offbeat",
    "Mechanical Contraption": "Contraption",
    "Brilliant Radiance": "Radiance",
    "Deep Crimson Black Orb": "Crimson Orb",
    "Jet-Black Wings": "Black Wings",
    "Model 12 Rumbling Engine": "Rumbling Engine",
    "Model 42 Rumbling Engine": "Rumbling Engine",
}
MARKER = {'Zero':'Z','Ultimate':'U','Cadence':'Cad','Tempest':'Tmp','Mighty':'M','Extreme':'Ex',
          'Custom':'Cust','Blossoming':'Blos','Precept':'Prc','Flame':'Fl','Mark':'Mk','Heaven':'Hvn',
          'Radiance':'Rad','Sublime':'Sbl'}
POETIC = {'Undying','Special','Transcendent','Butterfly','Brilliant','Radiant','Noble','Demon',
          'Beast','Death','True',"Lion-Dragon's","Hunter's","Spirit's","Heaven's","Princess's",
          'Ninth','Sealed','Reckless','Sweeping','Flash','True','Mighty'}
MOON_KIND = {'Refining Elixir':'Ref','Augmenting Elixir':'Aug','Sublimation Elixir':'Subl',
             'Test Reagent':'TstRgnt'}

def collab(prefix):
    base, _, marker = prefix.partition(':')
    base = base.strip()
    if base in BASE_MAP:
        short = BASE_MAP[base]
    else:
        ws = base.split()
        while len(ws) > 2 and ws[0] in POETIC:
            ws.pop(0)
        short = ' '.join(ws[-2:])
    if marker.strip():
        m = marker.strip()
        short = f'{short} {MARKER.get(m, m[:3])}'
    return short

def two_line(a, b):
    """Return a\\r\\nb with each side compressed (same k) until both lines fit W."""
    for k in (12, 10, 8, 6, 5, 4, 3, 2, 1):
        la = a if pix(a) <= W else compress(a, k)
        lb = b if pix(b) <= W else compress(b, k)
        if pix(la) <= W and pix(lb) <= W:
            return f'{la}\r\n{lb}'
    return f'{a}\r\n{b}'

def other(en):
    m = re.match(r'^(.+?) Moon Subjugation (Refining Elixir|Augmenting Elixir|Sublimation Elixir|Test Reagent)$', en)
    if m:
        return two_line(m.group(1), f'MnSbj {MOON_KIND[m.group(2)]}')
    c = re.match(r'^(.*) \[([^\]]+)\]$', en)
    if c:
        return two_line(collab(c.group(1)), f'[{c.group(2)}]')
    base = lex(en)
    for cand in [lex(en, full=False), lex(en, full=True)] + [compress(base, k) for k in (6, 5, 4, 3, 2, 1)]:
        L = fits(cand)
        if L:
            return '\r\n'.join(L)
    return chop2(compress(base, 1))

def main():
    base_diz = json.loads(subprocess.check_output(['git','-C',str(REPO),'show','HEAD:tools-js/dizionario-materiali.json']))
    base_mat = json.loads(subprocess.check_output(['git','-C',str(REPO),'show','HEAD:src/json/materiali.json']))
    mostro = {r['nome']: r.get('mostro', 0) for r in base_mat}

    new = {}; over = []
    for jp, en in base_diz.items():
        if jp in RENAME:
            L = fits(RENAME[jp]); new[jp] = '\r\n'.join(L) if L else RENAME[jp]; continue
        ne = monster(en) if (mostro.get(jp, 0) > 0 and not en.startswith('(')) else other(en)
        if ne.count('\r\n') > 1 or any(pix(t) > W for t in ne.split('\r\n')):
            over.append((en, ne))
        new[jp] = ne

    one = sum(1 for v in new.values() if '\r\n' not in v)
    print(f'entries: {len(new)}  one-line: {one}  still over: {len(over)}')
    print('\n=== flavor/collab cuts ===')
    for jp, en in base_diz.items():
        if en.startswith(('Undying','Morning-Practice','Lion-Dragon','Dragon\u2019s Dormancy',"Dragon's Dormancy",
                          'Brilliant Talent','Transcendent','Butterfly','Special Suppression')):
            print(f'  {en!r:56} -> {new[jp]!r}')
            if sum(1 for e in base_diz.values() if e.startswith(('Undying','Morning-Practice'))) and jp==list(base_diz)[0]: pass
    print('\n=== still over (first 12) ===')
    for en, ne in over[:12]:
        print(f'  {en!r:50} -> {ne!r}')

    if APPLY:
        for r in base_mat:
            if r['nome'] in new:
                r['en'] = new[r['nome']]
        (REPO/'src/json/materiali.json').write_text(json.dumps(base_mat, ensure_ascii=False, indent=1), encoding='utf-8')
        (REPO/'tools-js/dizionario-materiali.json').write_text(json.dumps(new, ensure_ascii=False, indent=1), encoding='utf-8')
        print('\nAPPLIED')

if __name__ == '__main__':
    main()
