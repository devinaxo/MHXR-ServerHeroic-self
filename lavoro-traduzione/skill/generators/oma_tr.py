# -*- coding: utf-8 -*-
import json, io, re, unicodedata
def cell(s): return sum(2 if unicodedata.east_asian_width(c) in ('W','F') else 1 for c in s)
import os as _os
S=_os.path.join(_os.path.dirname(_os.path.abspath(__file__)),'..','inputs')+_os.sep
recs=json.load(io.open(S+'omamori_names.json',encoding='utf-8'))
names=[r['name'] for r in recs]

ELEM={'火':'Fire','水':'Water','雷':'Bolt','氷':'Ice','土':'Earth'}
KIND={'宝石':'Jewel','貴石':'Gemstone','宝紋':'Crest','貴紋':'Gem Crest','禁宝紋':'Crest','禁貴紋':'Gem Crest'}
SIZE={'小':'Small','中':'Medium','大':'Large','超':'Super','極':'Ultimate'}
MONCLASS={'牙獣':'Fanged Beast','獣竜':'Brute Wyvern','牙竜':'Fanged Wyvern','海竜':'Sea Wyvern',
'魚竜':'Piscine','飛竜':'Wyvern','草食':'Herbivore','甲虫':'Beetle','鳥竜':'Bird Wyvern'}
CORE={'コア':'Core','守護':'Guard','誓い':'Oath','願い':'Wish','香り':'Scent','達人':'Master','ための':'Aid','罪＞':'Sin'}
WEAP={'大剣':'Great Sword','太刀':'Long Sword','片手剣':'Sword & Shield','双剣':'Dual Blades','鎚':'Hammer',
'狩猟笛':'Hunting Horn','槍':'Lance','銃槍':'Gunlance','剣斧':'Switch Axe','盾斧':'Charge Blade',
'操虫棍':'Insect Glaive','弓':'Bow','軽弩':'Light Bowgun','重弩':'Heavy Bowgun','爆斧':'Blast Axe'}
VAR={'壱':'I','弐':'II','参':'III','鋼膜':'Steel','凶暴':'Sav','烈迅竜':'Fierce Nargacuga','爆氷竜':'Iceblast Brachydios',
'電竜':'Astalos','泡狐竜':'Mizutsune','斬竜':'Glavenus','巨獣':'Gammoth','水無首領':'Minazuki Leader','文月首領':'Fumizuki Leader',
'葉月災凶':'Hazuki Calamity','長月災凶':'Nagatsuki Calamity','神無月豪火':'Kannazuki Blaze','霜月尾斧':'Shimotsuki Tail-Axe',
'師走泡狐':'Shiwasu Mizutsune','睦月千刃':'Mutsuki Seregios','赫火竜':'Brutal Rathalos','尾爆竜':'Blast Duramboros',
'如月凍牙':'Kisaragi Frozen Fang','卯月雷狼':'Uzuki Thunder Wolf','皐月迅竜':'Satsuki Nargacuga','水無月斬竜':'Minazuki Glavenus',
'文月翠水':'Fumizuki Jade Water','葉月凍戈':'Hazuki Frozen Halberd','長月海竜':'Nagatsuki Sea Wyvern','神無月泡狐':'Kannazuki Mizutsune',
'霜月金火':'Shimotsuki Gold Fire','鬼武者':'Onimusha','睦月凍牙':'Mutsuki Frozen Fang','如月天廻':'Kisaragi Shagaru',
'弥生獄狼':'Yayoi Stygian','幻帝獣':'Phantom Emperor','18新年':'18 New Year',"'18_03":"'18_03",'弥生廻世':'Yayoi World-Ruler','卯月翔刃':'Uzuki Soaring Blade',
'皐月翔刃':'Satsuki Soaring Blade','年末年始':'Year-End/New Year'}
CONF=json.load(io.open('lavoro-traduzione/quest/mostri.json',encoding='utf-8'))['confermati']
MON={'轟竜':'Tigrex','紫水獣':'Purple Ludroth','水竜':'Plesioth','凶怪竜':'Virulent Gigginox',
'豪火竜':'Flame Rathalos','金火竜':'Gold Rathian','銀火竜':'Silver Rathalos','凍牙竜':'Frozen Barioth',
'月迅竜':'Lucent Nargacuga','白兎獣':'White Lagombi','毒怪竜':'Purple Gypceros','幻獣':'Kirin',
'冥晶龍':'Nef-Garmat','黒蝕竜':'Gore Magala','土砂竜':'Barroth','緑迅竜':'Green Nargacuga',
'紅彩鳥':'Crimson Qurupeco','雷狼竜':'Zinogre','命狼竜':'Immortal Zinogre','千刃竜':'Seregios',
'鋼鎚竜':'Uragaan','天廻龍':'Shagaru Magala','金獅子':'Rajang','霞龍':'Chameleos','炎王龍':'Teostra',
'黒冠龍':'Morudomunto','覇竜':'Akantor','雷狐竜':'Thunderbubble Mizutsune','兇暴竜':'Savage Deviljho',
'天晶龍':'Eo Garudia','輝鎚竜':'Shiningrock Uragaan','陸海竜':'Landconquest Lagiacrus','鋼龍':'Kushala Daora',
'迅竜':'Nargacuga','電竜':'Astalos','泡狐竜':'Mizutsune','斬竜':'Glavenus','巨獣':'Gammoth'}
MON.update(CONF)
FORB={'兇暴':'Savage Deviljho','冥晶':'Nef-Garmat','天廻':'Shagaru Magala','天晶':'Eo Garudia','巨獣':'Gammoth',
'幻獣':'Kirin','月迅':'Lucent Nargacuga','獄狼':'Stygian Zinogre','豪火':'Flame Rathalos','轟竜':'Tigrex',
'迅竜':'Nargacuga','金火':'Gold Rathian','金獅子':'Rajang','黒冠':'Morudomunto','黒角':'Black Diablos'}
FORB.update(WEAP)
SKILLN={'休息術':'Rest','乱打術':'Flurry','会心術':'Affinity','受身術':'Breakfall','ブースター':'Booster',
'耐雪術':'Snow Res','根性術':'Grit','破壊手当':'Break Bonus','毒護身':'Poison Guard','武技師':'Art Master',
'耐泥術':'Mud Res','精霊加護':'Spirit Blessing','武技P増幅':'Art P Boost','錬成術':'Alchemy',
'ネコ神様':'Cat God','シャガル':'Shagaru'}

THEMES={
'卯月暴征':'Uzuki Conquest','皐月暴征':'Satsuki Conquest','水無月天雷':'Minazuki Skybolt','文月天雷':'Fumizuki Skybolt',
'葉月黒獄':'Hazuki Black Prison','長月黒獄':'Nagatsuki Black Prison','神無月轟暴':'Kannazuki Roar','霜月轟暴':'Shimotsuki Roar',
'師走星黒':'Shiwasu Star-Black','睦月星黒':'Mutsuki Star-Black','如月廻世':'Kisaragi World-Ruler',
'火攻撃':'Fire ATK','水攻撃':'Water ATK','雷攻撃':'Bolt ATK','土攻撃':'Earth ATK','氷攻撃':'Ice ATK',
'復帰応援':'Comeback Support','無':'Void','幸運':'Fortune','新米激励':'Rookie Boost','幸運回復':'Lucky Recovery','運':'Luck',
'戦国乱世':'Sengoku Chaos','夏恋祭衝突P':'Summer Love Clash P','チャレンジャー':'Challenger','鬼滅':'Demon Slayer',
'MPS':'MPS','水霧探索':'Mist Survey','L.C.L.':'L.C.L.','錬金術師':'Alchemist','おせち探索':'Osechi Survey',
'新春':'New Year','ロックマンX':'Mega Man X','ジオウ':'Zi-O','焦土探索':'Scorched Survey','エグゼイド':'Ex-Aid',
'支援者':'Supporter','橘月':'Tachibana','鳴神月':'Narukami','愛逢月':'Love','月見月':'Moon-View','紅葉月':'Maple',
'鏡祭月':'Mirror','竜潜月':'Dragon','氷月':'Ice Month','初春月':'Early Spring','麗月':'Rei','夢見月':'Dream',
'花残月':'Blossom','狭雲月':'Cloud','常夏月':'Summer','涼月':'Suzu','秋風月':'Autumn','菊月':'Kiku',
'時雨月':'Shigure','神楽月':'Kagura','春待月':'Spring','霞初月':'Hazy Dawn','初花月':'First Flower','桜月':'Sakura',
'卯月':'Uzuki','皐月':'Satsuki','水無月':'Minazuki','文月':'Fumizuki','葉月':'Hazuki','長月':'Nagatsuki',
'神無月':'Kannazuki','霜月':'Shimotsuki','師走':'Shiwasu','睦月':'Mutsuki','如月':'Kisaragi',
'NERV':'NERV','永遠':'Eternity','彦星':'Hikoboshi','＜強欲':'<Greed','洋館':'Mansion',
'キノコ狩り名人':'Mushroom Master','リンゴ':'Apple','大人':'Adult','ジュエルマニア':'Jewel Mania',
'バルバッド':'Barbad','会計':'Accounting','ムーンライト':'Moonlight','S.T.A.R.S.':'S.T.A.R.S.','使徒':'Apostle',
'ファイトマネー':'Fight Money','騎士':'Knight','幻影':'Phantom','ヒメサマン':'Himesaman',
'あふれる気持ち':'Overflowing Feelings','甘さ増量':'Extra Sweet','フルブライト':'Full Bright','ムラオサ':'Village Head',
'卯月翔刃':'Uzuki Soaring Blade','皐月翔刃':'Satsuki Soaring Blade','水無首領':'Minazuki Leader','文月首領':'Fumizuki Leader',
'葉月災凶':'Hazuki Calamity','長月災凶':'Nagatsuki Calamity','地殻探索':'Crust Survey','激雷探索':'Thunder Survey',
'陽炎探索':'Heat Haze Survey','氷河探索':'Glacier Survey','バビロン':'Babylon','投影':'Projection','花火':'Fireworks',
'ダークバット':'Dark Bat','神無月豪火':'Kannazuki Blaze','霜月尾斧':'Shimotsuki Tail-Axe','師走泡狐':'Shiwasu Mizutsune',
'睦月千刃':'Mutsuki Seregios','如月凍牙':'Kisaragi Frozen Fang','卯月雷狼':'Uzuki Thunder Wolf','皐月迅竜':'Satsuki Nargacuga',
'水無月斬竜':'Minazuki Glavenus','弥生獄狼':'Yayoi Stygian','葉月凍戈':'Hazuki Frozen Halberd','霜月金火':'Shimotsuki Gold Fire',
'神無月泡狐':'Kannazuki Mizutsune','長月海竜':'Nagatsuki Sea Wyvern','文月翠水':'Fumizuki Jade Water','睦月凍牙':'Mutsuki Frozen Fang',
'如月天廻':'Kisaragi Shagaru','鬼武者':'Onimusha','進化前解放':'Pre-Evolution Unlock','進化後解放':'Post-Evolution Unlock',
'放送記念':'Broadcast Memorial','七夕祭衝突P':'Tanabata Clash P','豪運':'Great Luck',
}
for n in ['対12/29','対12/30','対12/31','対1/1','対1/2','対1/3']: THEMES[n]='vs '+n[1:]

X={'火':'Fire','水':'Water','雷':'Bolt','氷':'Ice','土':'Earth','小':'Small','中':'Medium','大':'Large','超':'Super','極':'Ultimate',
'戦':'Battle','心':'Heart','耐雪':'Snow Res','小試':'Test S','中試':'Test M','大試':'Test L','超試':'Test XL','真':'True','永':'Eternal'}
X.update(ELEM); X.update(MONCLASS)

def tr_x(x):
    if x in X: return X[x]
    m=re.match(r'^(.+?)の(小|中|大|超|極)$',x)
    if m:
        base=CORE.get(m.group(1),m.group(1))
        return f'{SIZE[m.group(2)]} {base}'
    return None
def tr_theme(t):
    if t in THEMES: return THEMES[t]
    m=re.match(r'^第(\d+)回衝突P$',t)
    if m: return m.group(1)+'th Clash P'
    return None
def vs(t):
    mb=re.match(r'^(.+?)【(.+)】$',t)
    if mb:
        mon=MON.get(mb.group(1)); va=VAR.get(mb.group(2),mb.group(2))
        if mon: return f'vs {mon} [{va}]'
    mon=MON.get(t)
    if mon: return f'vs {mon}'
    if t=='襲来': return 'vs Invasion'
    tt=tr_theme(t)
    if tt: return 'vs '+tt
    return None
def structured(n):
    m=re.match(r'^(.*?)の(.+?)(宝石|貴石)(【(.+)】)?$',n)
    if not m: return None
    t=tr_theme(m.group(1)); x=tr_x(m.group(2)); k=KIND[m.group(3)]
    if t and x:
        out=f'{t} {x} {k}'
        if m.group(5): out+=f' [{VAR.get(m.group(5),m.group(5))}]'
        return out
    return None

EX={
'装備無し':'No Equipment','有効期限テストA':'Expiry Test A','有効期限テストB':'Expiry Test B',
'解放条件テストA':'Unlock Condition Test A','解放条件テストB':'Unlock Condition Test B','解放条件テストC':'Unlock Condition Test C',
'技玉スキルテストA':'Skill Orb Skill Test A','技玉スキルテストB':'Skill Orb Skill Test B',
'幸運+10%開発チェック用':'Fortune +10% Dev Check','幸運+20%開発チェック用':'Fortune +20% Dev Check',
'金運開発チェック用':'Wealth Dev Check','テスト用データ':'Test Data',
'剣士プロハンター資格':'Blademaster Pro Hunter License','ガンナープロハンター資格':'Gunner Pro Hunter License',
'ハンター講座受講証':'Hunter Course Ticket','ハンター講座マナビ証':'Hunter Course Study Pass',
'ハンター講座修了認定証書':'Hunter Course Diploma','ガンナー講座受講証':'Gunner Course Ticket',
'ガンナー講座マナビ証':'Gunner Course Study Pass','ガンナー修了認定証書':'Gunner Course Diploma',
'ビューティー加工【剣士】':'Beauty [Blademaster]','ビューティー加工【ガンナー】':'Beauty [Gunner]',
}
def translate(n):
    if n in EX: return EX[n]
    m=re.match(r'^大人のための(小|中|大|超|極)(宝石|貴石)$',n)
    if m: return f'Adult {SIZE[m.group(1)]} {KIND[m.group(2)]}'
    # trial-only
    m=re.match(r'^トライアル専用(火|水|雷|氷|土)(宝石|貴石)$',n)
    if m: return f'Trial {ELEM[m.group(1)]} {KIND[m.group(2)]}'
    # forbidden
    m=re.match(r'^禁断(.+?)(β|γ)?の(宝紋|貴紋|禁宝紋|禁貴紋)([ⅠⅡ])?$',n)
    if m:
        g=m.group(2); base=m.group(1)
        b=FORB.get(base,base); gs=(' '+g) if g else ''
        k=KIND[m.group(3)]; suf={'Ⅰ':' I','Ⅱ':' II'}.get(m.group(4),'')
        return f'Forbidden {b}{gs} {k}{suf}'
    # shagaru crests
    m=re.match(r'^シャガル用(火|水|雷|氷|土)?(宝紋|貴紋)(【(.+)】)?$',n)
    if m:
        el=(ELEM[m.group(1)]+' ') if m.group(1) else ''
        out=f'Shagaru {el}{KIND[m.group(2)]}'
        if m.group(4): out+=f' [{VAR.get(m.group(4),m.group(4))}]'
        return out
    # skill crests with element
    m=re.match(r'^(.+?)の(火|水|雷|氷|土)?(宝紋|貴紋)$',n)
    if m and m.group(1) in SKILLN:
        el=(ELEM[m.group(2)]+' ') if m.group(2) else ''
        return f'{SKILLN[m.group(1)]} {el}{KIND[m.group(3)]}'
    # vs monster + element/size
    m=re.match(r'^対(.+?)の(.+?)(宝石|貴石)(【(.+)】)?$',n)
    if m:
        v=vs(m.group(1)) or (('vs '+ELEM[m.group(1)]) if m.group(1) in ELEM else None)
        x=tr_x(m.group(2))
        if v and x:
            out=f'{v} {x} {KIND[m.group(3)]}'
            if m.group(5): out+=f' [{m.group(5)}]'
            return out
    # vs monster jewel
    m=re.match(r'^対(.+?)の(宝石|貴石)(Ⅱ)?$',n)
    if m:
        v=vs(m.group(1)); 
        if v: return f'{v} {KIND[m.group(2)]}'+(' II' if m.group(3) else '')
    m=re.match(r'^対(.+?)の(宝石|貴石)【(.+)】$',n)
    if m:
        v=vs(m.group(1))
        if v: return f'{v} {KIND[m.group(2)]} [{VAR.get(m.group(3),m.group(3))}]'
    # eternal G
    m=re.match(r'^(.+?)の永(宝石|貴石)G$',n)
    if m:
        t=tr_theme(m.group(1)) or m.group(1)
        return f'{t} Eternal {KIND[m.group(2)]} G'
    # revised
    m=re.match(r'^(.+?)の(小|中|大)(宝石|貴石)・改$',n)
    if m:
        t=tr_theme(m.group(1)) or m.group(1)
        return f'{t} {SIZE[m.group(2)]} {KIND[m.group(3)]} (Revised)'
    # unlocked suffix
    m=re.match(r'^(.*?)・解(【(.+)】)?$',n)
    if m:
        base=structured(m.group(1)) or tr_theme(m.group(1))
        if base:
            return base+' (Unlocked)'+(f' [{VAR.get(m.group(3),m.group(3))}]' if m.group(3) else '')
    # skill crests
    m=re.match(r'^(.+?)の(宝紋|貴紋)$',n)
    if m and m.group(1) in SKILLN:
        return f'{SKILLN[m.group(1)]} {KIND[m.group(2)]}'
    # theme-only jewel with variant tag
    m=re.match(r'^(.+?)の(宝石|貴石)【(.+)】$',n)
    if m:
        t=tr_theme(m.group(1))
        if t: return f'{t} {KIND[m.group(2)]} [{m.group(3)}]'
    # theme-only jewel
    m=re.match(r'^(.+?)の(宝石|貴石)$',n)
    if m:
        t=tr_theme(m.group(1))
        if t: return f'{t} {KIND[m.group(2)]}'
    # check names
    m=re.match(r'^(剣士|ガンナー)チェック用【(火|水|雷|氷|土)】$',n)
    if m:
        who='Blademaster' if m.group(1)=='剣士' else 'Gunner'
        return f'{who} Check [{ELEM[m.group(2)]}]'
    m=re.match(r'^上位ダミー☆４_(火|水|雷|氷|土|無)$',n)
    if m:
        el=ELEM.get(m.group(1),'Void'); return f'High Dummy ★4 {el}'
    m=re.match(r'^スキル(\d+)・技玉(\d+)(種)?チェック用$',n)
    if m:
        return f'Skill {m.group(1)} / Orb {m.group(2)}'+(' Types' if m.group(3) else '')+' Check'
    m=re.match(r'^試用【(.+)】$',n)
    if m:
        TR={'期':'Period','時':'Time','回':'Count','入手':'Obtain','解放':'Unlock','再':'Re'}
        return 'Trial ['+'/'.join(TR.get(p,p) for p in m.group(1).split('・'))+']'
    # fallback structured
    out=structured(n)
    if out: return out
    return None

miss=[]
for n in names:
    e=translate(n)
    if not e: miss.append(n)
print('translated',len(names)-len(miss),'/',len(names),'missing',len(miss))
io.open(S+'oma_miss.txt','w',encoding='utf-8').write('\n'.join(miss))
for x in miss: print('  MISS',x)
