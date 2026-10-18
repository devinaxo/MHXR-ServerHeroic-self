# -*- coding: utf-8 -*-
import json,io,re,unicodedata,os
_IN=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','inputs')+os.sep
def cell(s): return sum(2 if unicodedata.east_asian_width(c) in ('W','F') else 1 for c in s)
d=json.load(io.open(_IN+'equipSkillList.json',encoding='utf-8'))
JP=re.compile(r'[\u3041-\u30ff\u4e00-\u9fff]')
bases=[]
for r in d:
    v=r.get('mFilterFindName') or ''
    if v and JP.search(v) and v not in bases: bases.append(v)
CONF=json.load(io.open('lavoro-traduzione/quest/mostri.json',encoding='utf-8'))['confermati']
VAR={'鋼膜':'Steel','凶暴':'Sav'}
ELEM={'火':'Fire','水':'Water','雷':'Bolt','土':'Earth','氷':'Ice'}
KILL={'獣人':'Beastman','草食':'Herbivore','甲虫':'Beetle','牙獣':'Fanged Beast','鳥竜':'Bird Wyvern','飛竜':'Wyvern',
'魚竜':'Piscine','海竜':'Sea Wyvern','獣竜':'Brute Wyvern','牙竜':'Fanged Wyvern','古龍':'Elder',
'暴征翼':'Tempest Wing','凶暴個体':'Savage','豪火竜':'Flame Rathalos','凍牙竜':'Frozen Barioth','黒蝕竜':'Gore Magala',
'凶怪竜':'Virulent Gigginox','天雷騎':'Sky-Thunder Kirin','銀火竜':'Silver Rathalos','冥晶龍':'Nef-Garmat',
'金火竜':'Gold Rathian','命狼竜':'Immortal Zinogre','黒獄卿':'Black-Hell Lord','鋼膜個体':'Steel-Membrane',
'月迅竜':'Lucent Nargacuga','冥海竜':'Abyssal Lagiacrus','使徒種':'Apostle','星黒獣':'Star-Black Beast',
'轟竜':'Tigrex','幻獣':'Kirin','廻世主':'World-Ruler','千刃竜':'Seregios','鋼龍':'Kushala Daora','天廻龍':'Shagaru Magala','轟暴震':'Roaring-Tempest'}
MOON={'睦月':'Mutsuki','如月':'Kisaragi','弥生':'Yayoi','卯月':'Uzuki','皐月':'Satsuki','水無月':'Minazuki','文月':'Fumizuki',
'葉月':'Hazuki','長月':'Nagatsuki','神無月':'Kannazuki','霜月':'Shimotsuki','師走':'Shiwasu','桜月':'Sakura Month',
'菊月':'Kiku Month','涼月':'Suzu Month','氷月':'Ice Month','麗月':'Rei Month','初春月':'Early Spring',
'春待月':'Spring Month','神楽月':'Kagura Month','時雨月':'Shigure Month','秋風月':'Autumn Month',
'常夏月':'Summer Month','狭雲月':'Cloud Month','花残月':'Blossom Month','夢見月':'Dream Month',
'竜潜月':'Dragon Month','鏡祭月':'Mirror Month','紅葉月':'Maple Month','月見月':'Moon-View Month',
'愛逢月':'Love Month','鳴神月':'Narukami Month','橘月':'Tachibana Month','霞初月':'Hazy Dawn Month','初花月':'First Flower'}
EX={
'表示しない':'Hidden','毒耐性':'Poison Res','麻痺耐性':'Para Res','睡眠耐性':'Sleep Res','気絶耐性':'Stun Res',
'火傷耐性':'Burn Res','ずぶ濡れ耐性':'Soaked Res','感電耐性':'Shock Res','雪だるま耐性':'Snowman Res',
'泥まみれ耐性':'Mud Res','爆破やられ耐性':'Blast Res','会心':'Affinity','裂傷耐性':'Bleed Res','泡耐性':'Bubble Res',
'感染耐性':'Frenzy Res','被ダメージアップ耐性':'DMG-Up Res',
'武技師':'Art Master','武技P最大値':'Max Art P','挑戦者':'Challenger','休息':'Rest','破壊手当':'Break Bonus',
'最大体力':'Max HP','ブースター':'Booster','武技効果時間延長':'Art Duration+','ダメージ武技強化':'Damage Art+',
'武技回復量増加':'Art Regen+','攻撃解放':'ATK Unlock','防御解放':'DEF Unlock','体力解放':'HP Unlock','吸血':'Drain',
'防衛者':'Defender','高揚':'Elation','抵抗者':'Resister','序章撃':'Prologue Strike','終章撃':'Finale Strike',
'気迫護':'Spirit Guard','気迫撃':'Spirit Strike','装填技法':'Reload Art','双剣馴らし':'Dual Blades Trained',
'剣斧馴らし':'Switch Axe Trained','笛馴らし':'Horn Trained','盾斧馴らし':'Charge Blade Trained',
'K.O.術':'K.O. Art','バビロンコイン':'Babylon Coin','投影コイン':'Projection Coin','会心手当':'Affinity Bonus',
'軽銃射程':'LBG Range','狂撃':'Frenzy Strike','静養':'Rest','敏捷':'Agility','連装填':'Linked Reload',
'おまけ術':'Bonus Art','一気集中':'Focused','薬師':'Apothecary','溜め砲術':'Charged Shot','練気洗練':'Spirit Refine',
'守備の奏':'Defence Melody','凶暴抑止':'Savage Deter','花火コイン':'Fireworks Coin','ムラオサコイン':'Village Head Coin',
'幸運':'Fortune','弓極':'Bow Master','ガード装填':'Guard Reload','スタミナ最大数':'Max Stamina','ハイセンス':'High Sense',
'ダークバット':'Dark Bat','かぼちゃの力':'Pumpkin Power','かぼちゃの加護':'Pumpkin Blessing','サイコの力':'Psycho Power',
'サイコの加護':'Psycho Blessing','ファイトマネー':'Fight Money','クリスタルの力':'Crystal Power',
'クリスタルの加護':'Crystal Blessing','スタークォーツ':'Star Quartz','ガンスリンガー':'Gunslinger',
'とのさまんじゅう＋':'Lord Dumpling+','カカオ＋':'Cacao+','トノサマンの力':'Lord Sweets Power','トノサマンの加護':'Lord Sweets Blessing',
'ときめきの力':'Heartbeat Power','ときめきの加護':'Heartbeat Blessing','全襲来キラー':'All-Invasion Killer',
'パンケーキ':'Pancake','フルーツ狩人の力':'Fruit Hunter Power','フルーツ狩人の加護':'Fruit Hunter Blessing',
'危機会心':'Crisis Affinity','シンクロ率上昇・攻':'Synchro Rate+ ATK','シンクロ率上昇・防':'Synchro Rate+ DEF',
'不滅の愛の力':'Undying Love Power','不滅の愛の加護':'Undying Love Blessing','歯車コイン':'Gear Coin',
'天晶龍杯狩猟祭フラッグ':'Nef-Garmat Cup Flag','織姫の涙の力':'Weaver Tears Power','織姫の涙の加護':'Weaver Tears Blessing',
'＜強欲の罪＞':'<Greed Sin>','女神の使徒の力':'Goddess Apostle Power','女神の使徒の加護':'Goddess Apostle Blessing',
'捜査能力':'Investigation','使徒のコアコイン':'Apostle Core Coin','S.T.A.R.S.の力':'S.T.A.R.S. Power','S.T.A.R.S.の加護':'S.T.A.R.S. Blessing',
'軽銃長射程':'LBG Long Range','パートナーの心【鋼】':'Partner Heart [Steel]','きのこコイン':'Mushroom Coin',
'鍋奉行の力':'Hotpot Steward Power','鍋奉行の加護':'Hotpot Steward Blessing','リンゴの落しもの':'Fallen Apple',
'カワイイの力':'Cute Power','カワイイの加護':'Cute Blessing','ご祝儀コイン':'Celebration Coin',
'自由と責任の力':'Freedom Power','自由と責任の加護':'Freedom Blessing','活力回避':'Vital Evade',
'アイテム活用回復':'Item Heal','ドーナツ水晶コイン':'Donut Crystal Coin','キラメキ☆の力':'Sparkle Power',
'キラメキ☆の加護':'Sparkle Blessing','堅守回避':'Stalwart Evade','アリババ級の商魂':'Alibaba Merchant Spirit',
'ソロモンの力':'Solomon Power','ソロモンの加護':'Solomon Blessing','おもてなし':'Hospitality','金剛力の力':'Kongou Power',
'金剛盾の加護':'Kongou Shield Blessing','顧問の裁量':'Advisor Discretion','応援団の力':'Cheer Squad Power',
'応援団の加護':'Cheer Squad Blessing','炎まといダメージ減少':'Flame Aura DMG Cut','月の魔力':'Moon Magic',
'滅竜魔道士の力':'Dragon Mage Power','滅竜魔道士の加護':'Dragon Mage Blessing','サバイバル能力':'Survival',
'R.P.D.の力':'R.P.D. Power','R.P.D.の加護':'R.P.D. Blessing','戦国の覇者':'Sengoku Ruler',
'一騎当千の力':'Sengoku Hero Power','一騎当千の加護':'Sengoku Hero Blessing','拳を極めし者':'Fist Master',
'無の拳の力':'Void Fist Power','無の拳の加護':'Void Fist Blessing','運':'Luck','対魔力':'Anti-Magic','鬼滅の恩寵':'Demon Slayer Grace',
'鬼滅の力':'Demon Slayer Power','鬼滅の加護':'Demon Slayer Blessing','地殻調査':'Crust Survey','地殻攻撃':'Crust ATK',
'地殻防御':'Crust DEF','幻界深域の力':'Phantom Depths Power','幻界深域の加護':'Phantom Depths Blessing',
'鬼滅の強撃':'Demon Slayer Crush','幻界深域の強撃':'Phantom Depths Crush','激雷調査':'Thunder Survey',
'激雷防御':'Thunder DEF','黄金律':'Golden Rule','魔力放出':'Mana Release','武の祝福':'War Blessing',
'水霧調査':'Mist Survey','水霧防御':'Mist DEF','プラグ深度オーバー攻':'Plug Depth Over ATK','プラグ深度オーバー防':'Plug Depth Over DEF',
'プラグ深度オーバー撃':'Plug Depth Over Strike','ドライブ蓄積術':'Drive Charge','二連斬り蓄積術':'Double Slash Charge',
'真属性解放蓄積術':'True Element Charge','角砕き蓄積術':'Horn Break Charge','陽炎調査':'Heat Haze Survey',
'陽炎攻撃':'Heat Haze ATK','陽炎防御':'Heat Haze DEF','錬金術の恩寵':'Alchemy Grace','錬金術の力':'Alchemy Power',
'錬金術の加護':'Alchemy Blessing','錬金術の強撃':'Alchemy Crush','おせち調査':'Osechi Survey','おせち攻撃':'Osechi ATK',
'おせち防御':'Osechi DEF','鬼武者の恩寵':'Onimusha Grace','鬼武者の力':'Onimusha Power','鬼武者の加護':'Onimusha Blessing',
'鬼武者の強撃':'Onimusha Crush','新春の恩寵':'New Year Grace','新春の力':'New Year Power','新春の加護':'New Year Blessing',
'新春の強撃':'New Year Crush','アイテムレーダー':'Item Radar','パワードライブ':'Power Drive',
'ショックアブソーバー':'Shock Absorber','ウェポンドライブ':'Weapon Drive','継承者の善徳':'Inheritor Virtue',
'歴代ライダーの力':'Rider Power','歴代ライダーの加護':'Rider Blessing','歴代ライダーの絶技':'Rider Secret Art',
'氷河調査':'Glacier Survey','氷河攻撃':'Glacier ATK','氷河防御':'Glacier DEF','麻痺攻撃減少':'Para ATK Cut',
'天才ゲーマーMの直感':'Gamer M Intuition','天才ゲーマーMの力':'Gamer M Power','天才ゲーマーMの加護':'Gamer M Blessing',
'天才ゲーマーMの絶技':'Gamer M Secret Art','焦土調査':'Scorched Survey','焦土攻撃':'Scorched ATK','焦土防御':'Scorched DEF',
'睡眠攻撃減少':'Sleep ATK Cut','気絶攻撃減少':'Stun ATK Cut','爆破やられ攻撃減少':'Blast ATK Cut','感染攻撃減少':'Frenzy ATK Cut',
'泡攻撃減少':'Bubble ATK Cut','被ダメアップ攻撃減少':'DMG-Up ATK Cut','特異点の恩恵':'Singularity Boon',
'特異点の力':'Singularity Power','特異点の加護':'Singularity Blessing','特異点の絶技':'Singularity Secret Art',
'支援者の恩寵':'Supporter Grace','支援者の力':'Supporter Power','支援者の加護':'Supporter Blessing','支援者の強撃':'Supporter Crush',
'橘月討伐P':'Tachibana Slaying P','激雷攻撃':'Thunder ATK','水霧攻撃':'Mist ATK','暈月討伐P':'Halo Slaying P',
'増幅パーツブレイカー':'Boost Part Breaker','増幅アフターブレイカー':'Boost After Breaker','増幅追い打ち':'Boost Follow-Up',
'増幅乱打':'Boost Flurry','増幅復讐心':'Boost Revenge','増幅会心中毒':'Boost Affinity Poison','増幅攻勢会心術':'Boost Offensive Affinity',
'増幅会心強化':'Boost Affinity Up','増幅最後の抵抗':'Boost Last Stand','豪運':'Great Luck',
'第9回討伐P':'9th Slaying P','第10回討伐P':'10th Slaying P','第11回討伐P':'11th Slaying P','第13回討伐P':'13th Slaying P',
'第14回討伐P':'14th Slaying P','第15回討伐P':'15th Slaying P','第16回討伐P':'16th Slaying P','第17回討伐P':'17th Slaying P',
'第18回討伐P':'18th Slaying P','第2回衝突戦P':'2nd Clash P','第3回衝突P':'3rd Clash P','第4回衝突P':'4th Clash P',
'年末年始衝突P':'New Year Clash P','第5回衝突P':'5th Clash P','第6回衝突P':'6th Clash P','第7回衝突P':'7th Clash P',
'第8回衝突P':'8th Clash P','七夕祭衝突P':'Tanabata Clash P','夏恋祭衝突P':'Summer Love Clash P','第9回衝突P':'9th Clash P',
'第10回衝突P':'10th Clash P','第11回衝突P':'11th Clash P','第12回衝突P':'12th Clash P','第13回衝突P':'13th Clash P',
'第14回衝突P':'14th Clash P','第9回衝突戦の力':'9th Clash Power',
'輝鎚竜杯狩猟祭フラッグ':'Shiningrock Cup Flag','【登竜門】対覇竜':'[Rite] Anti-Akantor','【登竜門】耐覇竜':'[Rite] Akantor Guard',
}
def tr(b):
    if b in EX: return EX[b]
    if b in KILL: return None
    m=re.fullmatch(r'(.+)キラー',b)
    if m and m.group(1) in KILL: return f'{KILL[m.group(1)]} Killer'
    m=re.fullmatch(r'(.+)耐性',b)
    if m and m.group(1) in KILL: return f'{KILL[m.group(1)]} Guard'
    if m and m.group(1) in ELEM: return f'{ELEM[m.group(1)]} Res'
    m=re.fullmatch(r'(.+)属性攻撃',b)
    if m and m.group(1) in ELEM: return f'{ELEM[m.group(1)]} ATK'
    m=re.fullmatch(r'(.+)属性攻撃',b)
    if m and m.group(1).startswith('覇道') and m.group(1)[2:] in ELEM: return f'Supreme {ELEM[m.group(1)[2:]]} ATK'
    m=re.fullmatch(r'覇道(.+)属性攻撃',b)
    if m and m.group(1) in ELEM: return f'Supreme {ELEM[m.group(1)]} ATK'
    m=re.fullmatch(r'覇道(.+)耐性',b)
    if m and m.group(1) in ELEM: return f'Supreme {ELEM[m.group(1)]} Res'
    m=re.fullmatch(r'開眼(.+)撃',b)
    if m and m.group(1) in ELEM: return f'Awakened {ELEM[m.group(1)]} Strike'
    m=re.fullmatch(r'開眼(.+)護',b)
    if m and m.group(1) in ELEM: return f'Awakened {ELEM[m.group(1)]} Guard'
    m=re.fullmatch(r'熟成(.+)撃',b)
    if m and m.group(1) in ELEM: return f'Ripened {ELEM[m.group(1)]} Strike'
    m=re.fullmatch(r'熟成(.+)護',b)
    if m and m.group(1) in ELEM: return f'Ripened {ELEM[m.group(1)]} Guard'
    m=re.fullmatch(r'(.+)極地(\d*)【深度(.+)】耐性',b)
    if m and m.group(1) in ELEM:
        num=m.group(2); return f'{ELEM[m.group(1)]} Pole {num} [Depth {m.group(3)}] Res'.replace('  ',' ')
    m=re.fullmatch(r'(.+)極地(\d*)の絶技',b)
    if m and m.group(1) in ELEM:
        num=m.group(2); return f'{ELEM[m.group(1)]} Pole {num} Secret Art'.replace('  ',' ')
    m=re.fullmatch(r'対(.+)',b)
    if m and m.group(1) in KILL: return f'Anti-{KILL[m.group(1)]}'
    m=re.fullmatch(r'耐(.+)',b)
    if m and m.group(1) in KILL: return f'{KILL[m.group(1)]} Guard'
    m=re.fullmatch(r'([対耐])(.+?)【(.+)】',b)
    if m:
        mon=m.group(2); va=VAR.get(m.group(3),m.group(3))
        en=CONF.get(mon) or ('Enraged '+CONF[mon[2:]]) if (mon.startswith('激昂') and mon[2:] in CONF) else CONF.get(mon)
        if en: return (f'Anti-{en} [{va}]' if m.group(1)=='対' else f'{en} Guard [{va}]')
    m=re.fullmatch(r'([対耐])(.+)',b)
    if m:
        mon=m.group(2)
        en=CONF.get(mon) or (('Enraged '+CONF[mon[2:]]) if (mon.startswith('激昂') and mon[2:] in CONF) else None)
        if en: return (f'Anti-{en}' if m.group(1)=='対' else f'{en} Guard')
    m=re.fullmatch(r'(.+?)(月?)(討伐P|の力|の加護|の絶技)',b)
    if m:
        mo=m.group(1)+'月'
        if mo not in MOON: mo=m.group(1)
        if mo in MOON:
            tag={'討伐P':'Slaying P','の力':'Power','の加護':'Blessing','の絶技':'Secret Art'}[m.group(3)]
            return f'{MOON[mo]} {tag}'
    return None
NM={}
miss=[]
for b in bases:
    en=tr(b)
    if en is None: miss.append(b)
    else: NM[b]=en
print('bases',len(bases),'translated',len(NM),'missing',len(miss))
for b in miss: print('   MISS',b)
io.open(_IN+'equipfilter_miss.txt','w',encoding='utf-8').write('\n'.join(miss))
