# -*- coding: utf-8 -*-
import io,re,json
S='/tmp/opencode/skillfix/'
W={'大剣':'Great Sword','片手剣':'Sword & Shield','双剣':'Dual Blades','太刀':'Long Sword','鎚':'Hammer',
'ハンマー':'Hammer','狩猟笛':'Hunting Horn','ランス':'Lance','ガンランス':'Gunlance','剣斧':'Switch Axe',
'スラッシュアックス':'Switch Axe','盾斧':'Charge Blade','操虫棍':'Insect Glaive','弓':'Bow','軽弩':'Light Bowgun',
'ライトボウガン':'Light Bowgun','重弩':'Heavy Bowgun','ヘビィボウガン':'Heavy Bowgun','アクセルアックス':'Accel Axe','槍':'Lance','銃槍':'Gunlance'}
ELEM={'火':'Fire','水':'Water','雷':'Bolt','氷':'Ice','土':'Earth'}
def wlist(s): return ' / '.join(W.get(x,x) for x in re.split(r'[、・]',s))
def wonly(s): return ' / '.join(W.get(x,x) for x in re.split(r'[・、]',s))

EX={
'大剣のみ出撃可能です。テストです。':'Only Great Sword can deploy. This is a test.',
'片手剣以外で出撃可能＆狩技Ｐ増加量半減です。テストです。':'Can deploy with anything but Sword & Shield; Art P gain halved. This is a test.',
'シエルが仲間になっている':'Ciel is a companion','シエルレベル制限5':'Ciel level limit 5','エレーミアが仲間になっている':'Eremia is a companion','エレーミアレベル制限5':'Eremia level limit 5',
'ラコリスが仲間になっている':'Lacoris is a companion','ラコリスレベル制限5':'Lacoris level limit 5','ヴァルトが仲間になっている':'Valt is a companion','ヴァルトレベル制限5':'Valt level limit 5',
'ベルクが仲間になっている':'Belk is a companion','ベルクレベル制限5':'Belk level limit 5',
'シエルレベル制限20以上':'Ciel level limit 20+','エレーミアレベル制限20以上':'Eremia level limit 20+','ラコリスレベル制限20以上':'Lacoris level limit 20+',
'ヴァルトレベル制限20以上':'Valt level limit 20+','ベルクレベル制限20以上':'Belk level limit 20+',
'シエルレベル制限30以上':'Ciel level limit 30+','エレーミアレベル制限30以上':'Eremia level limit 30+','ラコリスレベル制限30以上':'Lacoris level limit 30+',
'ヴァルトレベル制限30以上':'Valt level limit 30+','ベルクレベル制限30以上':'Belk level limit 30+',
'【同種】武器指定テスト':'[Same] Weapon Spec Test','【同種】防具指定テスト':'[Same] Armor Spec Test',
'【複合】武器と防具指定テスト':'[Mixed] Weapon+Armor Spec Test','【固定】お守り指定テスト':'[Fixed] Charm Spec Test',
'【複数】お守り複数指定テスト':'[Multi] Multiple Charm Spec Test','【複合】一式指定テスト':'[Mixed] Full Set Spec Test',
'【複合】お守り組み合わせテスト':'[Mixed] Charm Combination Test','【固定】装備無し指定テスト':'[Fixed] No-Equip Spec Test',
'【複数】装備無し指定テスト':'[Multi] No-Equip Spec Test','【複合】装備無し組み合わせテスト':'[Mixed] No-Equip Combination Test',
'【条件複合】パワーアップ不可':'[Mixed Cond] No Power-Up','【条件複合】シエルレベル制限':'[Mixed Cond] Ciel level limit',
'【条件複合】エレーミアレベル制限':'[Mixed Cond] Eremia level limit','【条件複合】ラコリスレベル制限':'[Mixed Cond] Lacoris level limit',
'【条件複合】ヴァルトレベル制限':'[Mixed Cond] Valt level limit','【条件複合】ベルクレベル制限':'[Mixed Cond] Belk level limit',
'トライアルクエストテスト':'Trial Quest Test','トライアルクエスト':'Trial Quest',
'鎚・剣斧限定【装備・ステータス固定】':'Hammer / Switch Axe only [Equipment & Stats Fixed]',
'弓・剣斧限定【装備・ステータス固定】':'Bow / Switch Axe only [Equipment & Stats Fixed]',
'鎚・ライトボウガン限定【装備・ステータス固定】':'Hammer / Light Bowgun only [Equipment & Stats Fixed]',
'鎚・双剣限定【装備・ステータス固定】':'Hammer / Dual Blades only [Equipment & Stats Fixed]',
'装備ステータス固定・オート不可・マルチのみ':'Equipment/stats fixed, no auto, multi only',
'条件：オトモアイルーが同行':'Condition: Palico accompanies','訓練所専用の装備です':'Training-area exclusive equipment',
'ソロ限定・剣士限定・ブースト不可':'Solo / Blademaster only, no Boost','チュートリアル大剣装備':'Tutorial Great Sword equipment',
'チュートリアル太刀装備':'Tutorial Long Sword equipment','チュートリアルハンマー装備':'Tutorial Hammer equipment',
'武器、防具、ステータス固定\nコンティニュー不可':'Weapon, armor and stats fixed\nNo continues',
'ソロ限定・スリジエ系武器限定':'Solo only, Seregios-series weapons only',
'ソロ限定・笹飾系武器限定・復活不可':'Solo only, bamboo-decoration weapons only, no revival',
'４つの装備から選択可能':'Choose from 4 equipment sets','ソロ限定\n七つの大罪コラボ武器限定\nコンティニュー不可\nオトモ・パートナー同行不可':'Solo only\nSeven Deadly Sins collab weapons only\nNo continues\nNo Palico/Partner',
'ガムート・アグナ亜種炸裂装備限定\nオトモ・パートナー同行不可\nソロ限定・コンティニュー不可':'Gammoth / Glacial Agnaktor blast equipment only\nNo Palico/Partner\nSolo only, no continues',
'雷属性のハンマーのみ・コンティニュー不可':'Bolt-element Hammer only, no continues',
'HR1以上\n条件文テスト\n3行目':'HR1+\nCondition text test\nLine 3',
'★6武器が報酬に登場！':'★6 weapons now in rewards!','★6武器秘伝書出現中！':'★6 weapon secret manuals appearing!',
'ソロ限定\n感染中和スニークロッド系統限定\nコンティニュー不可\nオトモ・パートナー同行不可':'Solo only\nFrenzy-Neutralizing Sneak Rod line only\nNo continues\nNo Palico/Partner',
'ソロ限定\n包丁シリーズ限定\nコンティニュー不可\nオトモ・パートナー同行不可':'Solo only\nKitchen Knife series only\nNo continues\nNo Palico/Partner',
'ソロ限定\n装備固定\nコンティニュー不可':'Solo only\nEquipment fixed\nNo continues',
'HR150以上・マルチ限定・ガンナー系武器限定\nコンティニュー不可':'HR150+, multi only, Gunner weapons only\nNo continues',
'マルチ限定・装備固定\nコンティニュー不可':'Multi only, equipment fixed\nNo continues',
'幻界深域専用の装備です':'Phantom Depths exclusive equipment',
'スラッシュアックスのみ\nパートナー同行不可\nコンティニュー不可':'Switch Axe only\nNo Partner\nNo continues',
'火属性双剣のみ\nコンティニュー不可':'Fire-element Dual Blades only, no continues',
'装備固定\nコンティニュー不可':'Equipment fixed\nNo continues',
'雷属性ヘビィボウガンのみ\nコンティニュー不可':'Bolt-element Heavy Bowgun only, no continues',
'土属性太刀のみ\nコンティニュー不可':'Earth-element Long Sword only, no continues',
'ソロ限定\n装備固定\nコンティニュー不可\nオトモ・パートナー同行不可':'Solo only\nEquipment fixed\nNo continues\nNo Palico/Partner',
'超レア10倍\nソロ限定':'Super Rare x10\nSolo only',
'HR150以上・マルチ限定・特効武器種限定\nコンティニュー不可':'HR150+, multi only, effective weapon type only\nNo continues',
'コラボ武器限定\nソロ限定・同行不可・コンテ禁止':'Collab weapons only\nSolo only, no companions, no continues',
'武器＆頭胴脚はコラボ装備限定':'Weapon & head/body/leg are collab equipment only',
'イベント武器限定\nソロ限定・同行不可・コンテ禁止':'Event weapons only\nSolo only, no companions, no continues',
'特効武器種限定　\nパラメータ上限　攻2950　防2950':'Effective weapon type only\nParameter cap ATK 2950 DEF 2950',
'特効武器種限定\nパラメータ上限　攻2950　防2950':'Effective weapon type only\nParameter cap ATK 2950 DEF 2950',
'HR150以上・マルチ限定・特効武器種限定\nコンティニュー不可・土属性武器限定':'HR150+, multi only, effective weapon type only\nNo continues, Earth-element weapons only',
'コラボ武器限定・HR100以上限定\nソロ限定・同行不可・コンテ禁止':'Collab weapons only, HR100+\nSolo only, no companions, no continues',
'マルチ限定・特効武器種・水属性武器限定\nパラメータ上限　攻2000　防2000\nブースト・マシマシ不可':'Multi only, effective weapon type, Water-element weapons only\nParameter cap ATK 2000 DEF 2000\nNo Boost/Max',
'HR150以上・マルチ限定・氷属性武器限定\nコンティニュー不可・超レア武器禁止':'HR150+, multi only, Ice-element weapons only\nNo continues, Super Rare weapons banned',
'ソロ限定・装備固定\nコンティニュー不可\nブースト・マシマシ不可':'Solo only, equipment fixed\nNo continues\nNo Boost/Max',
'イベント武器＆防具\nレークス・エクエスメッサ系\nアイオーン・マグナソルナ系限定\nHR30以上・ソロ限定・同行不可\nコンテ・ブースト・マシマシ不可':'Event weapon & armor\nLacus/Eques Messer line\nAion/Magnasolna line only\nHR30+, solo only, no companions\nNo continues/Boost/Max',
'ソロ限定・雷属性武器限定\n特効武器種限定':'Solo only, Bolt-element weapons only\nEffective weapon type only',
'クエスト武器＆防具\n散影斬刀・エクエスカピール系\nぽわめる系・深域調査隊（胴）限定\nHR30以上・ソロ限定・同行不可\nコンテ・ブースト・マシマシ不可\n輝月陽アルクリテスⅡ不可':'Quest weapon & armor\nSankagei Zanto/Eques Capile line\nPowamel line, Phantom Survey Corps (body) only\nHR30+, solo only, no companions\nNo continues/Boost/Max\nNo Kigetsuyo Alcrites II',
'特効武器種限定\nパラメータ上限　攻3100　防3100':'Effective weapon type only\nParameter cap ATK 3100 DEF 3100',
'ソロ限定・水属性武器限定\n特効武器種限定':'Solo only, Water-element weapons only\nEffective weapon type only',
'HR30以上推奨':'HR30+ recommended',
'コラボ武器限定・HR30以上限定\nソロ限定・同行不可・コンテ禁止':'Collab weapons only, HR30+\nSolo only, no companions, no continues',
'ソロ限定・火属性武器限定\n特効武器種限定':'Solo only, Fire-element weapons only\nEffective weapon type only',
'特効武器種限定\nパラメータ上限　攻2600　防2600':'Effective weapon type only\nParameter cap ATK 2600 DEF 2600',
'HR150以上・マルチ限定・特効武器種限定\nコンティニュー不可\nパラメータ上限　防2700':'HR150+, multi only, effective weapon type only\nNo continues\nParameter cap DEF 2700',
'クエスト武器＆防具\nリーリエ系・ピュレ・ジュスト系\n輝月陽アポツェクロン系\nスカルダ/スパイオ系\n深域調査隊（頭）限定\nHR30以上・ソロ限定・同行不可\nコンテ・ブースト・マシマシ不可':'Quest weapon & armor\nLilie/Pure/Just line\nKigetsuyo Apotzekron line\nSkalda/Spaio line\nPhantom Survey Corps (head) only\nHR30+, solo only, no companions\nNo continues/Boost/Max',
'ソロ限定・氷属性武器限定\n特効武器種限定':'Solo only, Ice-element weapons only\nEffective weapon type only',
'特効武器種限定\n雷狐竜・金獅子・幻帝獣武器限定\nパラメータ上限　攻2500　防2500':'Effective weapon type only\nThunderbubble Mizutsune/Rajang/Phantom Emperor weapons only\nParameter cap ATK 2500 DEF 2500',
'雷狐竜・金獅子・幻帝獣武器限定\nパラメータ上限　攻2500　防2500':'Thunderbubble Mizutsune/Rajang/Phantom Emperor weapons only\nParameter cap ATK 2500 DEF 2500',
'メイの錬成短剣系限定\nHR30以上限定\nソロ限定・同行不可・コンテ禁止':"Mei's Alchemy Dagger line only\nHR30+\nSolo only, no companions, no continues",
'クエスト武器＆防具\nロワ・ニャール系・海醒砲フォボス系\nキュアノス系\n深域調査隊（腰）限定\nHR30以上・ソロ限定・同行不可\nコンテ・ブースト・マシマシ不可\nオート不可\nXF-11アンフィスⅡ不可':'Quest weapon & armor\nRoi/Nyar line, Sea-Awakening Cannon Phobos line\nCureanos line\nPhantom Survey Corps (waist) only\nHR30+, solo only, no companions\nNo continues/Boost/Max\nNo auto\nNo XF-11 Amphis II',
'クエスト武器＆防具\n花宴弓系・カウロ系\nミューズの唄系\nクラウンハンマー系\nぽわめる系\n鬼伝・童伝系限定\nHR30以上・ソロ限定・同行不可\nコンテ・ブースト・マシマシ不可\nオート不可・花散里系不可':'Quest weapon & armor\nFloral Banquet Bow line, Cauro line\nMuse Song line\nCrown Hammer line\nPowamel line\nOni-den/Dou-den line only\nHR30+, solo only, no companions\nNo continues/Boost/Max\nNo auto, no Hanachirasato line',
'HR150以上・マルチ限定・コンティニュー不可\n赫火竜、炎王龍、天晶龍、爆氷竜、\n黒冠龍、輝鎚竜　武器限定':'HR150+, multi only, no continues\nBrutal Rathalos, Teostra, Eo Garudia, Iceblast Brachydios,\nMorudomunto, Shiningrock Uragaan weapons only',
'チュクチュク・暁系武器限定\nHR30以上限定\nソロ限定・同行不可・コンテ禁止':'Chukuchuku/Akatsuki line weapons only\nHR30+\nSolo only, no companions, no continues',
'マルチ限定・特効武器種・火/水属性武器限定\nパラメータ上限　攻2300　防2300\nブースト・マシマシ不可':'Multi only, effective weapon type, Fire/Water-element weapons only\nParameter cap ATK 2300 DEF 2300\nNo Boost/Max',
'覇竜・陸海竜武器、ディーゼル系武器限定\n登竜門クエストで入手可能な武器は除く':'Akantor/Landconquest Lagiacrus weapons, Diesel line only\nExcludes weapons obtainable from Gate of Trials quests',
'Xバスター系武器限定\nHR30以上限定\nソロ限定・同行不可・コンテ禁止':'X-Buster line weapons only\nHR30+\nSolo only, no companions, no continues',
'ボーンホルン系\nミューズの唄系\n花散里系・花宴弓系・カウロ系\nクラウンハンマー系限定\nHR30以上・ソロ限定・同行不可\nコンテ・ブースト・マシマシ不可\nオート不可':'Bone Horn line\nMuse Song line\nHanachirasato line, Floral Banquet Bow line, Cauro line\nCrown Hammer line only\nHR30+, solo only, no companions\nNo continues/Boost/Max\nNo auto',
'特効武器種限定\nパラメータ上限　攻3250　防3250':'Effective weapon type only\nParameter cap ATK 3250 DEF 3250',
'ソロ限定・土属性武器限定\n特効武器種限定':'Solo only, Earth-element weapons only\nEffective weapon type only',
'兇暴竜・霞龍武器、アーウィン系武器限定\n登竜門クエストで入手可能な武器は除く':'Savage Deviljho/Chameleos weapons, Irwin line only\nExcludes weapons obtainable from Gate of Trials quests',
'ジカンザックス・ゆみ系限定\nHR30以上限定\nソロ限定・同行不可・コンテ禁止':'Jikanzax/Yumi line only\nHR30+\nSolo only, no companions, no continues',
'クエスト武器＆防具\nリベッツレーネ系\nロストピアアクセル系\n歌唄ノ鎚系・リエットシリーズ系\n深域調査隊（脚）限定\nHR30以上・ソロ限定・同行不可\nコンテ・ブースト・マシマシ不可\nオート不可\n輝月陽アルデュナミスⅡ系不可':'Quest weapon & armor\nRivetsrehne line\nLostpeer Accel line\nUtauta no Tsuchi line, Riette series line\nPhantom Survey Corps (leg) only\nHR30+, solo only, no companions\nNo continues/Boost/Max\nNo auto\nNo Kigetsuyo Aldunamis II line',
'雷狐竜・昂獅子武器、リーン・バーン系武器限定\n登竜門クエストで入手可能な武器は除く':'Thunderbubble Mizutsune/Rajang weapons, Lean/Burn line only\nExcludes weapons obtainable from Gate of Trials quests',
'クエスト武器＆防具\nロストピアエッジ系\n歌唄ノ弓系・リカンテシリーズ系\n深域調査隊シリーズ系限定\nHR30以上・ソロ限定・同行不可\nコンテ・ブースト・マシマシ不可\nオート不可\n最終決戦型フリーゲン系不可\n皇鎚ギガギガス・極不可':'Quest weapon & armor\nLostpeer Edge line\nUtauta no Yumi line, Ricante series line\nPhantom Survey Corps series only\nHR30+, solo only, no companions\nNo continues/Boost/Max\nNo auto\nNo Final Battle Friegein line\nNo Emperor Hammer Gigagigas: Ultimate',
'ガシャコンブレイカー系限定\nHR30以上限定\nソロ限定・同行不可・コンテ禁止':'Gashapon Breaker line only\nHR30+\nSolo only, no companions, no continues',
'HR150以上・マルチ限定・コンティニュー不可\n赫火竜、炎王龍、天晶龍、烈迅竜、\n霞龍、兇暴竜　武器限定':'HR150+, multi only, no continues\nBrutal Rathalos, Teostra, Eo Garudia, Fierce Nargacuga,\nChameleos, Savage Deviljho weapons only',
'アイアンソードSP系限定\nHR30以上限定\nソロ限定・同行不可・コンテ禁止':'Iron Sword SP line only\nHR30+\nSolo only, no companions, no continues',
'黒冠龍・輝鎚竜武器、専用ニャン検武器限定\n登竜門クエストで入手可能な武器は除く':'Morudomunto/Shiningrock Uragaan weapons, exclusive Nyanken weapons only\nExcludes weapons obtainable from Gate of Trials quests',
'炎王龍・天晶龍武器、忍刀黒解斬系武器限定\n登竜門クエストで入手可能な武器は除く':'Teostra/Eo Garudia weapons, Shinobi Blade Black-Kaizan line only\nExcludes weapons obtainable from Gate of Trials quests',
'覇竜・陸海竜武器、木鼓達磨系武器限定\n登竜門クエストで入手可能な武器は除く':'Akantor/Landconquest Lagiacrus weapons, Tree-Drum Daruma line only\nExcludes weapons obtainable from Gate of Trials quests',
'特効武器種限定\nHR150以上・マルチ限定・コンティニュー不可':'Effective weapon type only\nHR150+, multi only, no continues',
'輝鎚竜武器・極地凍牙竜武器および\nヴァイラス系武器限定\n登竜門クエストで入手可能な武器は除く':'Shiningrock Uragaan weapons, Polar Frozen Barioth weapons and\nVirus line weapons only\nExcludes weapons obtainable from Gate of Trials quests',
'鞠水竜武器・極地烈迅竜武器および\nライアン系武器限定\n登竜門クエストで入手可能な武器は除く':'Whitewater Plesioth weapons, Polar Fierce Nargacuga weapons and\nRyan line weapons only\nExcludes weapons obtainable from Gate of Trials quests',
'昂獅子武器・極地電竜武器および\nペインキラー系武器限定\n登竜門クエストで入手可能な武器は除く':'Rajang weapons, Polar Astalos weapons and\nPainkiller line weapons only\nExcludes weapons obtainable from Gate of Trials quests',
'ソロ限定・装備固定\nコンティニュー不可\nブースト・マシマシ不可\nパラメータ上限　攻2500　防2500':'Solo only, equipment fixed\nNo continues\nNo Boost/Max\nParameter cap ATK 2500 DEF 2500',
}

def tr(s):
    if s in EX: return EX[s]
    lines=s.split('\n'); out=[]
    for ln in lines:
        r=tr_line(ln)
        if r is None: return None
        out.append(r)
    return '\n'.join(out)

def tr_line(ln):
    if ln in EX: return EX[ln]
    m=re.match(r'^コンテ(?:ィニュー)?不可・(.+)限定$',ln)
    if m: return 'No continues, '+wonly(m.group(1))+' only'
    m=re.match(r'^プレイヤー＆パートナー：(.*?)限定、パラメーター上限：攻防(\d+)、コンティニュー不可$',ln)
    if m: return f'Player & Partner: {wonly(m.group(1))} only, parameter cap ATK/DEF {m.group(2)}, no continues'
    m=re.match(r'^プレイヤー＆パートナー：パラメーター上限：攻防(\d+)、コンティニュー不可$',ln)
    if m: return f'Player & Partner: parameter cap ATK/DEF {m.group(1)}, no continues'
    # HR..限定
    m=re.match(r'^HR(\d+)以上・(.+)限定$',ln)
    if m: return f'HR{m.group(1)}+, {wlist(m.group(2))} only'
    m=re.match(r'^(.+)限定$',ln)
    if m and all(x in W for x in re.split(r'[、・]',m.group(1))):
        return f'{wlist(", ".join(re.split(r"・",m.group(1))))} only'
    if ln=='コンティニュー不可' or ln=='コンテ不可': return 'No continues'
    if ln=='コンテ禁止': return 'No continues'
    if ln=='ソロ限定': return 'Solo only'
    if ln=='マルチ限定': return 'Multi only'
    if ln=='同行不可': return 'No companions'
    if ln=='オトモ・パートナー同行不可': return 'No Palico/Partner'
    if ln=='パートナー同行不可': return 'No Partner'
    if ln=='オトモアイルー同行不可': return 'No Palico'
    if ln=='特効武器種限定': return 'Effective weapon type only'
    if ln=='ブースト・マシマシ不可': return 'No Boost/Max'
    if ln=='オート不可': return 'No auto'
    if ln=='装備固定': return 'Equipment fixed'
    m=re.match(r'^(.+)属性武器限定$',ln)
    if m and m.group(1) in ELEM: return f'{ELEM[m.group(1)]}-element weapons only'
    m=re.match(r'^(火|水|雷|氷|土)/(火|水|雷|氷|土)属性武器限定$',ln)
    if m: return f'{ELEM[m.group(1)]}/{ELEM[m.group(2)]}-element weapons only'
    m=re.match(r'^パラメータ上限　攻(\d+)　防(\d+)$',ln)
    if m: return f'Parameter cap ATK {m.group(1)} DEF {m.group(2)}'
    m=re.match(r'^パラメータ上限　防(\d+)$',ln)
    if m: return f'Parameter cap DEF {m.group(1)}'
    m=re.match(r'^マルチ限定・特効武器種・(.+)属性武器限定$',ln)
    if m and m.group(1) in ELEM: return f'Multi only, effective weapon type, {ELEM[m.group(1)]}-element weapons only'
    return None

miss=[]
res={}
for s in io.open(S+'tech_jp.txt',encoding='utf-8').read().split('\n@@@\n'):
    t=tr(s)
    if t is None or 'None' in str(t):
        miss.append(s)
    else:
        res[s]=t
import json
json.dump(res,io.open(S+'tech_en.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
print('translated',len(res),'missing lines:',len(miss))
for m in miss[:40]: print('  MISS',repr(m))
