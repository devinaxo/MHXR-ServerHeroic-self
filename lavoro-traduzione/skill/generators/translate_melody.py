# -*- coding: utf-8 -*-
import json,io,unicodedata
def cell(s): return sum(2 if unicodedata.east_asian_width(c) in ('W','F') else 1 for c in s)
def wrap(s,maxw=32):
    out=[]
    for para in s.split('\n'):
        cur=''
        for word in para.split(' '):
            cand=(cur+' '+word) if cur else word
            if cur and cell(cand)>maxw: out.append(cur); cur=word
            else: cur=cand
        out.append(cur)
    return '\n'.join(out)
NM={}
def n(jp,en): NM[jp]=en
n('旋律無し','No Melody')
for jp,en in [('癒しの音色','Healing Tone'),('心地よき残響','Soothing Echo'),('爽涼の旋律','Refreshing Melody'),
('精霊奏','Spirit Song'),('加護の音色','Blessing Tone'),('頼もしき残響','Dependable Echo'),('鉄心の旋律','Ironheart Melody'),
('狩護奏','Hunt Guard Song'),('奮起の音色','Rousing Tone'),('心震わす残響','Stirring Echo'),('激情の旋律','Passion Melody'),
('撃竜奏','Dragon Strike Song'),('勇壮の音色','Valiant Tone'),('勇ましき残響','Brave Echo'),('魂の旋律','Soul Melody'),
('太陽奏','Sun Song'),('大地の音色','Earth Tone'),('円かに包む残響','Wrapping Echo'),('豊穣の旋律','Abundance Melody'),
('天麗奏','Heavenly Song'),('鼓舞の音色','Inspiration Tone'),('激励奏','Encouragement Song'),('友愛の音色','Friendship Tone')]:
    for tag,s in [('小','S'),('中','M'),('大','L')]: n(f'{jp}【{tag}】',f'{en} [{s}]')
for jp,en in [('リオメタル','Rio Metal'),('アカデミック・リオメタル','Academic Rio Metal'),('薄氷恋鼓','Thin-Ice Love Drum'),
('遥咲紅歌','Far-Bloom Red Song'),('蝶々舞々','Butterfly Dance'),('気高き漆黒奏','Noble Jet-Black Song'),
('響き絶えぬ雷鳴','Endless Thunder Roar'),('戦魂巡り','War-Soul Pilgrimage'),('四神協奏','Four Gods Concerto'),
('バリバリハンティング','Buzz-Buzz Hunting'),('深淵に誘う輪舞曲','Abyss-Inviting Rondo'),('聖騎幻想曲','Holy Knight Fantasy'),
('轟鑼囃子','Roaring Gong Fest'),('炎鐘灼弾','Flame Bell Scorch'),('千竜戦譜','Thousand Dragon Score'),
('虹螺旋の鎮魂歌','Rainbow Spiral Requiem'),('エメラルドハウル','Emerald Howl'),('クローバーマーチ','Clover March'),
('鈴ノ音ナルニマカセテ','Leave It to the Bell'),('ブレイズノーツ','Blaze Notes'),('歩音舞音','Step Dance Notes'),
('ストリームロア','Stream Roar'),('洋館に響く鳴き声','Manor Echoing Cry'),('スパイシーアイス','Spicy Ice'),
('ぐでぐでした声','Slurred Voice'),('怒怒音頭','Angry Ondo'),('タッチ・ザ・ジョーカー','Touch the Joker'),
('アブソリュート・フレイム','Absolute Flame'),('プリンスリングベル','Prince Ring Bell'),('アメジストブリーズ','Amethyst Breeze'),
('轟け、覇神蛮声','Roar, Supreme Voice'),('ピカチンアラベスク','Spark Arabesque'),('遍く紅なる空に','To the Crimson Sky'),
('ロックハートピュア','Rock Heart Pure'),('ヴィーナス・リ・コラール','Venus Re Chorale'),('夢幻想曲','Dream Fantasy'),
('ドラゴン・ハーモニクス','Dragon Harmonics'),('六星協奏曲','Six-Star Concerto'),('ライトニングハウル','Lightning Howl'),
('義勇の漆黒奏','Brave Jet-Black Song'),('蝶々落々','Butterfly Falling'),('バーニングノーツ','Burning Notes'),
('メイドインブルー','Made in Blue'),('ふぁにーはにーまじっく','Funny Honey Magic'),('ソヌス・ミラ','Sonus Mira'),
('エメラルドオアシス','Emerald Oasis'),('スカーレットドラマ','Scarlet Drama'),('闇より此の翼賜ふ','Wings from Darkness'),
('ガオガオ☆リズム','Gao-Gao☆Rhythm'),('戦魂黄泉巡り','Underworld War-Soul'),('アイアンハートピュア','Iron Heart Pure'),
('廻れよ廻れ、常しえに','Spin On, Forever')]:
    n(jp,en)
ST={
'自然回復・小':'Natural Regen (S)','自然回復・中':'Natural Regen (M)','自然回復・大':'Natural Regen (L)',
'ダメージ軽減・小':'Damage Cut (S)','ダメージ軽減・中':'Damage Cut (M)','ダメージ軽減・大':'Damage Cut (L)',
'攻撃力アップ・小':'ATK Up (S)','攻撃力アップ・中':'ATK Up (M)','攻撃力アップ・大':'ATK Up (L)',
'自然回復+攻撃力アップ':'Regen + ATK Up','自然回復+ダメージ軽減':'Regen + DMG Cut','ダメージアップ':'Damage Up',
'自然回復+自然武技P回復':'Regen + Art P','ダメージ軽減':'Damage Cut',
}
ES={
'旋律効果無し':'No melody effect','体力を回復し続ける':'Continuously heals HP','ダメージを軽減する':'Reduces damage',
'攻撃力がアップ':'ATK is up','体力を回復し続け\n攻撃力がアップ':'Heals HP and raises ATK',
'体力を回復し続け\nダメージを軽減する':'Heals HP and cuts damage','与えるダメージが\n上がる':'Raises damage dealt',
'体力と武技Pを回復し続ける':'Heals HP and Art P over time',
}
EX={
'旋律効果無し':'No melody effect.',
'全員の与えるダメージが1.5倍になる':'All allies deal 1.5x damage.',
}
for N in ['5','7','10','15','20','22','30','40','50','100']:
    EX[f'全員の体力を{N}ずつ回復し続ける']=f'All allies regain {N} HP over time.'
for N in ['5','7','10','15','20','30','40','50','70','90']:
    EX[f'全員の受けるダメージを{N}%減らす']=f'All allies take {N}% less damage.'
for N in ['2','3','5','7','10','15','20']:
    EX[f'全員の攻撃力を{N}%上げる']=f'All allies ATK +{N}%.'
EX['全員の体力を\nゆっくりと100ずつ回復し続ける']='All allies slowly regain\n100 HP over time.'
EX['全員の体力を100ずつ回復し続ける\n（柄殴りのゲージ増加量が多い）']='All allies regain 100 HP\nover time. (Larger gauge from\nhandle-bash.)'
EX['全員の体力をゆっくりと150ずつ回復し\n続ける（柄殴りのゲージ増加量が少ない）']='All allies slowly regain 150 HP\nover time. (Smaller gauge from\nhandle-bash.)'
EX['全員の体力を素早く10ずつ回復し続ける']='All allies quickly regain\n10 HP over time.'
EX['全員の体力を素早く15ずつ回復し続ける']='All allies quickly regain\n15 HP over time.'
for N,M in [('5','1'),('7','2'),('10','3'),('15','4'),('20','5'),('22','5'),('30','6'),('5','5'),('5','10'),('10','5'),('10','15'),('15','15'),('20','15'),('20','20')]:
    EX[f'全員の体力を{N}ずつ回復し続け\n攻撃力を{M}%上げる']=f'All regain {N} HP over time;\nATK +{M}%.'
for N,M in [('5','5'),('7','7'),('10','10'),('10','15'),('10','20'),('15','15'),('15','25'),('20','20'),('22','20'),('30','30'),('5','10'),('5','20'),('5','30'),('3','30'),('15','20')]:
    EX[f'全員の体力を{N}ずつ回復し続け\n受けるダメージを{M}%減らす']=f'All regain {N} HP over time;\ntake {M}% less damage.'
for N,M in [('10','1'),('15','1'),('20','1'),('15','2'),('22','2'),('30','2'),('10','2')]:
    EX[f'全員の体力を{N}ずつ回復し続け\n武技Pを{M}ずつ回復し続ける']=f'All regain {N} HP and {M} Art P\nover time.'
EX['全員の体力を50ずつ回復し続け\n攻撃力を6%上げる']='All regain 50 HP over time;\nATK +6%.'
EX['全員の体力を50ずつ回復し続け\n攻撃力を20%上げる']='All regain 50 HP over time;\nATK +20%.'
EX['全員の体力を素早く10ずつ回復し続け\n攻撃力を30%上げる']='All quickly regain 10 HP\nover time; ATK +30%.'
EX['全員の体力を10ずつ回復し続け攻撃力を\n6%上げる（柄殴りのゲージ増加量が多い）']='All regain 10 HP over time;\nATK +6%. (Larger gauge\nfrom handle-bash.)'
EX['全員の体力を15ずつ回復し続ける\n（柄殴りのゲージ増加量が多い）']='All allies regain 15 HP\nover time. (Larger gauge\nfrom handle-bash.)'
EX['全員の与えるダメージが1.3倍になる\n（柄殴りのゲージ増加量が多い）']='All allies deal 1.3x damage.\n(Larger gauge from handle-bash.)'
# add any missed explanation keys dynamically check later
NM2={k:(cell(v)<=32) for k,v in NM.items()}
print('names',len(NM),'over',[k for k,v in NM.items() if cell(v)>32])
print('status',len(ST),'over',[v for v in ST.values() if cell(v)>32])
print('explain',len(EX),'overlines',[ (k,l) for k,v in EX.items() for l in wrap(v).split('\n') if cell(l)>32])
json.dump({'name':NM,'status':ST,'explain':{k:wrap(v) for k,v in EX.items()},'explainStatus':ES},
          io.open('/tmp/opencode/skillfix/melody_en.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
print('saved melody_en.json')
