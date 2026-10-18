# -*- coding: utf-8 -*-
import io, re, json
import os as _os
S=_os.path.join(_os.path.dirname(_os.path.abspath(__file__)),'..','inputs')+_os.sep
frags=[l for l in io.open(S+'quest_fragments.txt',encoding='utf-8').read().split('\n') if l]

MONTH={'橘月':'Tachibana','鳴神月':'Narukami','愛逢月':'Love','月見月':'Moon-View','紅葉月':'Maple',
'鏡Fest月':'Mirror Fest','竜潜月':'Dragon','氷月':'Ice Month','初春月':'Early Spring','麗月':'Rei',
'夢見月':'Dream','花残月':'Blossom','狭雲月':'Cloud','常夏月':'Summer','涼月':'Suzu','秋風月':'Autumn',
'菊月':'Kiku','時雨月':'Shigure','神楽月':'Kagura','春待月':'Spring','霞初月':'Hazy Dawn','初花月':'First Flower',
'桜月':'Sakura','卯月':'Uzuki','皐月':'Satsuki','水無月':'Minazuki','文月':'Fumizuki','葉月':'Hazuki',
'長月':'Nagatsuki','神無月':'Kannazuki','霜月':'Shimotsuki','師走':'Shiwasu','睦月':'Mutsuki','如月':'Kisaragi'}
ELEM={'火':'Fire','水':'Water','雷':'Bolt','氷':'Ice','土':'Earth'}
GOLDRANK={'逸品級':'Fine','お宝級':'Treasure','財宝級':'Fortune','秘宝級':'Secret Treasure'}
DIFF={'母':'Mother','義理':'Obligation','友':'Friend','本命':'True Love','大本命':'True Love+'}

EX={
'お試し!':'Trial!','激昂したRajang':'Enraged Rajang','Duel! Watermelon割り!':'Duel! Watermelon Split!',
'真のFighter':'True Fighter','新たなCrystal のStory':'Story of a New Crystal',
'ふたりのKnightとひとりのGirl':'Two Knights and One Girl','狩りのCourt':'Hunting Court',
'あのGirlのためにどこまでも':'Anywhere for That Girl','おCandy なChoco Fest':'Candy Choco Fest',
'White DragonのGuardianたち':'Guardians of the White Dragon','夜叉/修羅収集Quest':'Yasha/Shura Collection Quest',
'Night SkyにWishう星Festり':'Star Fest Wishing on the Night Sky','[Multi Limited ] [二頭Hunt ]':'[Multi Limited] [Twin Hunt]',
'[期間Limited ] [Unmeasurable]':'[Period Limited] [Unmeasurable]','ゼニーBonus !':'Zenny Bonus!',
'幻と豪火Ruler of 者':'Ruler of Phantom and Flame','最前線Bonus Quest':'Frontline Bonus Quest',
'[Extreme] Test 用':'[Extreme] Test','x四大Ruler of 者':'Ruler of the Four Great',
'[Super Extreme - Gear Fixed - 体験版]':'[Super Extreme - Gear Fixed - Trial]',
'[フェアリーテイルCollab ]':'[Fairy Tail Collab]','獄雷と冥晶Ruler of 者':'Ruler of Hell-Thunder and Nef-Garmat',
'金銀劇毒Ruler of 者':'Ruler of Gold, Silver and Venom','鋼と刃Ruler of 者':'Ruler of Steel and Blade',
'門外不出、A級鍋具材の在処':'Secret A-Rank Pot Ingredients','おともだち救出大作戦!':'Friend Rescue Operation!',
'Fractured Isles 成人式':'Fractured Isles Coming of Age','恋のスイーツジュエル':'Sweet Jewel of Love',
'堕転に抗う者たち':'Those Who Resist the Fall','血と汗と涙を流せ!':'Spill Blood, Sweat and Tears!',
'目指せ頂点!新入生争奪戦':'Aim for the Top! Freshman Battle',
'生き残りをかけたDecisive Battle':'Decisive Battle for Survival','[生放送Memorial ]':'[Live Broadcast Memorial]',
'戦場ごとぶった斬れ!':'Slash Through the Whole Battlefield!','続 - 真のFighterへの道':'Continued - Path to the True Fighter',
'Slay !月下の鬼影':'Slay! Demon Shadow Under the Moon','恐るべき天声同化':'Dreadful Assimilation',
'2号機、会敵!':'Unit-02, Engage!','業を背負いし鋼':'Steel Bearing Karma','吹き荒れる新風':'Raging New Wind',
'イレギュラーをSlay せよ!':'Slay the Irregular!','激昂したRajang!':'Enraged Rajang!','王の誕生':'Birth of a King',
'俺、Hunt !':'I Hunt!','物資Defense Front':'Supply Defense Front','デビルHunter':'Devil Hunter',
'[第一話]':'[Episode 1]','[第二話]':'[Episode 2]','[第三話]':'[Episode 3]','状態異常に注意!':'Beware of Status Ailments!',
'爆破待ったなし':'Explosion Imminent','怒りの鳥竜種 - ロード':'Wrath of the Bird Wyvern - Lord',
'大憤怒のGore Magala':"Gore Magala's Great Rage",'Azure Rathalosを射ち落とせ':'Shoot Down Azure Rathalos',
'砂嵐注意報!':'Sandstorm Warning!','Lagiacrus希少種':'Lagiacrus Rare Species',
'Supremacy OrbWeapon ライトボウガン':'Supremacy Orb Weapon Light Bowgun','Supremacy OrbWeapon ランス':'Supremacy Orb Weapon Lance',
'Hunter Intro Quest [火]':'Hunter Intro Quest [Fire]','Hunter Intro Quest [氷]':'Hunter Intro Quest [Ice]',
'Hunter Intro Quest [土]':'Hunter Intro Quest [Earth]','Hunter Intro Quest [水]':'Hunter Intro Quest [Water]',
'Hunter Intro Quest [雷]':'Hunter Intro Quest [Bolt]','アクセルアックス':'Accel Axe',
'Supremacy OrbWeapon ガンランス':'Supremacy Orb Weapon Gunlance','射程Ruler of 者':'Ruler of Range',
'Blue-Red Encounter!一戦目':'Blue-Red Encounter! Round 1','Blue-Red Encounter!二戦目':'Blue-Red Encounter! Round 2',
'Blue-Red Encounter!三戦目':'Blue-Red Encounter! Round 3','Blue-Red Encounter!四戦目':'Blue-Red Encounter! Round 4',
'Blue-Red Encounter!五戦目':'Blue-Red Encounter! Round 5','Clash 初日!Mizutsune!':'Clash Day 1! Mizutsune!',
'Supremacy OrbWeapon ヘビィボウガン':'Supremacy Orb Weapon Heavy Bowgun','Intercept 戦 Morudomunto!':'Intercept Battle Morudomunto!',
'覚醒スキル':'Awakening Skill','Supremacy OrbWeapon アクセルアックス':'Supremacy Orb Weapon Accel Axe',
'Eo GarudiaIntercept 戦':'Eo Garudia Intercept Battle','Raid! 激昂したRajang!':'Raid! Enraged Rajang!',
'双Thunder動 《鋼》':'Twin Thunder Roar 《Steel》','水没林の強者 《炸 - 鋼》':'Strong One of the Flooded Forest 《Blast - Steel》',
'剛拳爆砕 《凶》':'Iron Fist Blast 《Fierce》','鳥竜の品格 《鋼 - 凶》':'Dignity of the Bird Wyvern 《Steel - Fierce》',
'極限震域 《炸》':'Extreme Quake Zone 《Blast》','四色裂破 《鋼》':'Four-Color Burst 《Steel》',
'黒白の双角 《凶》':'Black-White Twin Horns 《Fierce》','同属乱舞 《炸 - 凶》':'Kindred Wild Dance 《Blast - Fierce》',
'特 - CashGoruruー Tour':'Special - Cash Goruru Tour','特 - CashGoruruー Tour!':'Special - Cash Goruru Tour!',
'[おせち]':'[Osechi]','Hunter 。をプロデュース':'Produce a Hunter.','エク学生の日常':'Daily Life of Explore Academy Students',
'私、部活始めるってよ':"I'm Starting a Club",'[第四話 END1]':'[Episode 4 END1]','学校から帰ろう!':'Let\'s Go Home from School!',
'[第四話 END2]':'[Episode 4 END2]','けいおんぶ!':'Light Music Club!','[第四話 END3]':'[Episode 4 END3]',
'テニスのお姫様':'Tennis Princess','[第五話 TRUE END]':'[Episode 5 TRUE END]',
'レウスの中心で、愛を叫ぶ':'Shout Love from the Center of Rathalos','[準備運動]':'[Warm-Up]',
'まずはChallenge だ!!':'First, a Challenge!!','[肩慣らし]':'[Limbering Up]',
'Gear を強化しないと厳しいぞ!':'You Must Upgrade Your Gear!','[練習]':'[Practice]',
'フェイジョア島クラスだな!!':'Feijoa Island Class!!','[演習]':'[Exercise]','クプアス島クラスだな!!':'Cupuas Island Class!!',
'[実戦1]':'[Combat 1]','ここから実戦だ、気を抜くな!':'Real Combat From Here, Stay Sharp!','[実戦2]':'[Combat 2]',
'カニステル島クラスだな!':'Canistel Island Class!','[実戦3]':'[Combat 3]','マラクジャIslesにお別れだ!':'Farewell to Malachite Isles!',
'さあ、訓練もラストスパートだ!':'Now, the Final Spurt of Training!','最後だ、一気に駆け抜けろ!':'The Last One, Run Through!',
'[Special 訓練]':'[Special Training]','Hammerで気絶を狙え!':'Aim to Stun with the Hammer!','ファミ通App':'Famitsu App',
'プレゼントQuest':'Present Quest','[チャレンジQuest ]':'[Challenge Quest]','ファミ通AppからのChallenge':'Challenge from Famitsu App',
'[左眼の剣]':'[Sword of the Left Eye]','[戴きの冠]':'[Crown of Bestowal]','[財宝の処]':'[Treasure Place]',
'[掴む栄光]':'[Grasped Glory]','[激闘の証]':'[Proof of Fierce Battle]','[冒険の心]':'[Heart of Adventure]',
'[新たな刻]':'[New Era]','[背負う力]':'[Power to Bear]','[仲間の灯]':'[Light of Comrades]','[自尊の心]':'[Heart of Pride]',
'[悠久の夢]':'[Eternal Dream]','神速のブルBullfango':'Godspeed Blue Bullfango','小粒でも侮るべからず':"Don't Underestimate the Small",
'超危険!ヘビープレス':'Super Dangerous! Heavy Press','毒吐きダンシング!':'Poison-Spitting Dancing!',
'連続サマーソルト!':'Continuous Somersault!','豪火なCarnival':'Blazing Carnival','[???級]':'[??? Rank]',
'Intercept 戦!Nef-Garmat!':'Intercept Battle! Nef-Garmat!','永遠のWatermelonたち':'Eternal Watermelons',
'ほの暗い海の底から':'From the Dim Depths of the Sea','西瓜のいけにえ':'Watermelon Sacrifice','ダンテandレディ':'Dante and Lady',
'極小のおFest':'Tiny Fest','暑中、水かけFest':'Midsummer Water-Splashing Fest','60秒チャレンジ!':'60-Second Challenge!',
'Arzurosの後ろに立つな':"Don't Stand Behind Arzuros",'恐怖!空を舞うBnahabra':'Terror! Bnahabra Dancing in the Sky',
'泥と氷のクラッシャー!':'Mud and Ice Crusher!','怪劇!毒々Carnival':'Bizarre Show! Poisonous Carnival',
'乱入!BarrothFeral':'Intruder! Feral Barroth','乱入!Gold Rathian':'Intruder! Gold Rathian',
'乱入!Crimson QurupecoFeral':'Intruder! Feral Crimson Qurupeco','乱入!Silver Rathalos':'Intruder! Silver Rathalos',
'巨大なる猪Festり':'Giant Boar Fest','Dracophage Bug弾をかわせ!':'Dodge the Dracophage Bug Shots!','回転率上昇中!':'Rotation Rate Rising!',
'お試し!誰でもInsect Glaive!':'Trial! Insect Glaive for Everyone!','Invasion! Lagiacrus希少種!':'Invasion! Lagiacrus Rare Species!',
'Raid! Lagiacrus希少種!':'Raid! Lagiacrus Rare Species!','お年Orb Quest!':'New Year Orb Quest!',
'シエルへのNew Year Gift':'New Year Gift for Ciel','エレーミアへのNew Year Gift':'New Year Gift for Eremia',
'ラコリスへのNew Year Gift':'New Year Gift for Lacoris','ヴァルトへのNew Year Gift':'New Year Gift for Valt',
'ベルクへのNew Year Gift':'New Year Gift for Belk','残り福!':'Remaining Fortune!','ZinogreFFBE種':'Zinogre FFBE Species',
'Seregios(十六人Multi )_Test':'Seregios (16-Player Multi) Test','[対Tigrex]':'[vs Tigrex]','Great Apypos十六人':'Great Apypos 16-Player',
'[Super Ultimate] [シャガルWeapon ]':'[Super Ultimate] [Shagaru Weapon]','[取得難度999]':'[Difficulty 999]',
'プロHunter 資格検定':'Pro Hunter Qualification Exam','空前絶後の花嫁修業!':'Unprecedented Bride Training!',
'無事クリアできますように':'May You Clear It Safely','Gear Fixed Quest Kai 修':'Gear Fixed Quest Kai Shu',
'[七つの大罪Collab ]':'[Seven Deadly Sins Collab]','Challenge! 絶望降臨!':'Challenge! Despair Descends!',
'Gear Fixed Quest Kai 修2':'Gear Fixed Quest Kai Shu 2','[対Glavenus]':'[vs Glavenus]','狂王':'Mad King',
'Nargacuga水忍種':'Nargacuga Water Ninja Species','乱闘!Sand Barioth!':'Brawl! Sand Barioth!','乱闘!Lagiacrus!':'Brawl! Lagiacrus!',
'乱闘!Black Diablos!':'Brawl! Black Diablos!','乱闘!Flame Rathalos!':'Brawl! Flame Rathalos!',
'[条件文Test 用] [Extreme]':'[Condition Test] [Extreme]','単騎、Hunting Groundを走る!':'Ride Solo Through the Hunting Ground!',
'[バイオハザードCollab ]':'[Resident Evil Collab]','Challenge! リアル - Survival !':'Challenge! Real - Survival!',
'サンリオTest Quest':'Sanrio Test Quest','古龍Ruler of 者':'Ruler of Elder Dragons','幻の食材を求めて':'Seek the Phantom Ingredient',
'復刻!デビルHunter':'Reprint! Devil Hunter','[サンリオキャラCollab ]':'[Sanrio Characters Collab]',
'Challenge! 再 - 救出大作戦!':'Challenge! Again - Rescue Operation!','大人への通過儀礼':'Rite of Passage to Adulthood',
'部位破壊が今ならお得!':'Part Breaks Are a Bargain Now!','〆の一撃!大回転斬り!':'Finishing Blow! Great Spinning Slash!',
'大晦日!最後の一撃を狙え!':"New Year's Eve! Aim for the Last Blow!",'New Year !最初の一撃を狙え!':'New Year! Aim for the First Blow!',
'New Year 更なる躍進!ジャンプ!':'New Year Further Leap! Jump!','狩人ならオドらにゃ損!乱舞!':'A Hunter Must Dance! Wild Dance!',
'闇夜に現れし山神 一夜目':'Mountain God in the Dark Night, Night 1','闇夜に現れし山神 二夜目':'Mountain God in the Dark Night, Night 2',
'闇夜に現れし山神 三夜目':'Mountain God in the Dark Night, Night 3','Challenge! 凶兆の暗雲 一夜目':'Challenge! Dark Clouds of Omen Night 1',
'Challenge! 凶兆の暗雲 二夜目':'Challenge! Dark Clouds of Omen Night 2','Challenge! 凶兆の暗雲 三夜目':'Challenge! Dark Clouds of Omen Night 3',
'Astalosと交わす拳 R.1':'Fists Crossed with Astalos R.1','Astalosと交わす拳 R.2':'Fists Crossed with Astalos R.2',
'Astalosと交わす拳 R.3':'Fists Crossed with Astalos R.3','Astalosと交わす拳 R.4':'Fists Crossed with Astalos R.4',
'Challenge! 導きIlluminating 焔 R.1':'Challenge! Guiding Illuminating Flame R.1','Challenge! 導きIlluminating 焔 R.2':'Challenge! Guiding Illuminating Flame R.2',
'Challenge! 導きIlluminating 焔 R.3':'Challenge! Guiding Illuminating Flame R.3','Challenge! 導きIlluminating 焔 R.4':'Challenge! Guiding Illuminating Flame R.4',
'古龍Ruler of 者II':'Ruler of Elder Dragons II','恋のレジスタンス':'Love Resistance','Chameleos2頭版':'Chameleos Twin Version',
'射程Ruler of 者II':'Ruler of Range II','混沌Ruler of 者':'Ruler of Chaos','Challenge! 伝説の冒険家':'Challenge! Legendary Adventurer',
'Challenge! 皇女の誇り':'Challenge! Pride of the Princess','Challenge! 革命前夜':'Challenge! Eve of Revolution',
'Challenge! ルフの導き':'Challenge! Guidance of Ruf','[ EffectiveWeapon 種Limited ]':'[Effective Weapon Type Limited]',
'[一部Collab Gear Limited ]':'[Some Collab Gear Limited]','[Multi Limited ] ゼニーBonus !':'[Multi Limited] Zenny Bonus!',
'[Solo Limited ] ゼニーBonus !':'[Solo Limited] Zenny Bonus!','混沌Ruler of 者II':'Ruler of Chaos II',
'[フォトジェニックQuest ]':'[Photogenic Quest]','インスタ映えを狙え!':'Aim for the Insta-Worthy Shot!',
'Challenge! 帰宅部のMastery':'Challenge! Mastery of the Homeward Club','Challenge! 魔球を得し者':'Challenge! Bearer of the Magic Ball',
'Challenge! 刹那を射抜く射手':'Challenge! Archer Piercing the Moment','Clash 初日!Zinogre!':'Clash Day 1! Zinogre!',
'Teostraマップ変更版':'Teostra Map Change Version','アズガルムド':'Azgarumud','Clash 初日!Nargacuga!':'Clash Day 1! Nargacuga!',
'獣竜Ruler of 者':'Ruler of Brute Wyverns','Challenge! Dragon Slayingを焼く炎':'Challenge! Flame That Burns Dragon Slaying',
'Challenge! 決意の絶対零度':'Challenge! Absolute Zero of Resolve','Challenge! 星霊たちとの絆':'Challenge! Bonds with the Star Spirits',
'Challenge! 妖精女王のDual Blades!':"Challenge! Fairy Queen's Dual Blades!",'Challenge! 燃え尽きる屍':'Challenge! Corpse Burning Out',
'Challenge! ナイフサバイバー':'Challenge! Knife Survivor','Challenge! 邪を打ち砕く果実':'Challenge! Fruit That Smashes Evil',
'Clash 初日!Glavenus!':'Clash Day 1! Glavenus!','獣竜Ruler of 者II':'Ruler of Brute Wyverns II','Arrives !秘技':'Arrives! Secret Art',
'[*7ドロップTest ]':'[*7 Drop Test]','地獄Ruler of 者':'Ruler of Hell','Challenge! 斬滅、凶王の刃':'Challenge! Slaying, Blade of the Evil King',
'Challenge! 誇り高き八咫烏':'Challenge! Proud Yatagarasu','Challenge! カラクリ兵器 - 暁丸':'Challenge! Karakuri Weapon - Akatsukimaru',
'飛竜Ruler of 者':'Ruler of Wyverns','七夕Fest[Super Extreme]':'Tanabata Fest [Super Extreme]',
"['18_07] [Long Sword - 土Weapon Limited ]":"['18_07] [Long Sword - Earth Weapon Limited]",
"['18_07] [ Effective - 土Weapon Limited ]":"['18_07] [Effective - Earth Weapon Limited]",
"['18_07] [Great Sword - 土Weapon Limited ]":"['18_07] [Great Sword - Earth Weapon Limited]",
"['18_07] [Dual Blades - 土Weapon Limited ]":"['18_07] [Dual Blades - Earth Weapon Limited]",
'お試し!秘技':'Trial! Secret Art','飛竜Ruler of 者II':'Ruler of Wyverns II','一掃せし真空の刃':'Vacuum Blade That Swept Away',
'ヨーガの導きをIlluminating 者':'Bearer Illuminating the Guidance of Yoga','美しき狂気の仮面':'Mask of Beautiful Madness',
'闇の力を統べし双腕':'Twin Arms Ruling the Power of Darkness','夏恋Fest[Super Extreme]':'Summer Love Fest [Super Extreme]',
'アズガルムドandRathalos':'Azgarumud and Rathalos','Clash アズガルムド':'Clash Azgarumud','疾風Hunt !冥晶黒冠!':'Gale Hunt! Nef-Garmat Morudomunto!',
'Challenge! 爆裂の鬼狩り':'Challenge! Explosive Demon Hunt','Challenge! 迅雷の鬼狩り':'Challenge! Thunderclap Demon Hunt',
'Challenge! 猪突の鬼狩り':'Challenge! Reckless Demon Hunt','Challenge! 炎陽の鬼狩り':'Challenge! Blazing Sun Demon Hunt',
'Solo Raid! TigrexのTraining !':'Solo Raid! Tigrex Training!','単騎、Hunting Groundを走る!II':'Ride Solo Through the Hunting Ground! II',
'疾風Hunt !冥晶黒冠!II':'Gale Hunt! Nef-Garmat Morudomunto! II','Solo Raid! GlavenusのTraining !':'Solo Raid! Glavenus Training!',
'Final 救済者':'Final Savior','理性蒸発':'Reason Evaporates','驚異のアイドルフェス':'Amazing Idol Fest','午前の光よ':'Light of the Morning',
"['18_10] [火Great SwordLimited ]":"['18_10] [Fire Great Sword Limited]","['18_10] [火Insect GlaiveLimited ]":"['18_10] [Fire Insect Glaive Limited]",
'Challenge! 加速兵装Test':'Challenge! Accelerator Arms Test','Challenge! 飛翔兵装Test':'Challenge! Flight Arms Test',
'Challenge! 爆砕兵装Test':'Challenge! Blast Arms Test','Challenge! 音響兵装Test':'Challenge! Sonic Arms Test',
'Challenge! Kai 修兵装Test':'Challenge! Kai Shu Arms Test',"['18_11] [氷重砲Limited ]":"['18_11] [Ice Heavy Cannon Limited]",
'Solo Raid! Kushala DaoraのTraining !':'Solo Raid! Kushala Daora Training!','酷寒霹靂Ruler of 者':'Ruler of Bitter Cold and Thunderbolt',
'Solo Raid! Sand BariothのTraining !':'Solo Raid! Sand Barioth Training!','酷寒霹靂Ruler of 者II':'Ruler of Bitter Cold and Thunderbolt II',
'Challenge! 異邦より来たる双刃':'Challenge! Twin Blades from a Foreign Land','[年末]':'[Year-End]',
'天晶を纏いし者':'Bearer Clad in Eo Garudia','Challenge! 烈風の刃':'Challenge! Blade of the Gale',
'New Year Challenge "鏡餅"':'New Year Challenge "Kagami Mochi"','New Year Challenge "一富士"':'New Year Challenge "First Fuji"',
'[Hot] [火 - Water EffectiveWeapon Limited ]':'[Hot] [Fire - Water Effective Weapon Limited]',
'New Year Challenge "紅白"':'New Year Challenge "Red and White"','New Year Challenge "大食漢"':'New Year Challenge "Big Eater"',
'New Year Challenge "初日の出"':'New Year Challenge "First Sunrise"','Challenge! 青い伝説':'Challenge! Blue Legend',
'Solo Raid! AstalosのTraining !':'Solo Raid! Astalos Training!','Challenge! レジスタンスの戦士':'Challenge! Resistance Warrior',
'Solo Raid! Fiercewater NargacugaのTraining !':'Solo Raid! Fiercewater Nargacuga Training!','天晶を纏いし者II':'Bearer Clad in Eo Garudia II',
'Challenge! Hammerモード':'Challenge! Hammer Mode','Challenge! 断風のOrdeal':'Challenge! Ordeal of the Cutting Wind',
'*8ドロップ確認用':'*8 Drop Confirmation','乱世の覇者[Part 1]':'Ruler of the Turbulent Age [Part 1]',
'乱世の覇者[Part 2]':'Ruler of the Turbulent Age [Part 2]','地獄門':'Hell Gate','Co-op Hunt Front II[氷結]':'Co-op Hunt Front II [Freezing]',
'Co-op Hunt Front II[土崩]':'Co-op Hunt Front II [Earth Collapse]','Co-op Hunt Front III[氷結]':'Co-op Hunt Front III [Freezing]',
'Lagiacrusの城塞 《鋼》':'Lagiacrus Fortress 《Steel》','Co-op Hunt Front III[土崩]':'Co-op Hunt Front III [Earth Collapse]',
'二千刃に抗う者 《炸》':'Those Who Resist Two Thousand Blades 《Blast》','砂原の共演 《鋼》':'Co-Starring in the Sand Field 《Steel》',
'忘却と邂逅 《凶》':'Oblivion and Encounter 《Fierce》','闘鬼騒乱':'Fighting Demon Uprising','Co-op Hunt Front IV[氷結]':'Co-op Hunt Front IV [Freezing]',
'爆雪連峰 《炸》':'Blizzard Range 《Blast》','Co-op Hunt Front IV[土崩]':'Co-op Hunt Front IV [Earth Collapse]',
'凍土春眠 《鋼》':'Spring Sleep in the Frozen Soil 《Steel》','Co-op Hunt Front V[氷結]':'Co-op Hunt Front V [Freezing]',
'Co-op Hunt Front V[土崩]':'Co-op Hunt Front V [Earth Collapse]','単騎、Hunting Groundを走る!III':'Ride Solo Through the Hunting Ground! III',
'[Melon] 結晶100Festり':'[Melon] Crystal 100 Fest','[Academy] 結晶100Festり':'[Academy] Crystal 100 Fest',
'ヴァンパイア*5確定':'Vampire *5 Guaranteed','SFV*5確定':'SFV *5 Guaranteed',
'Slay Battle 9xRare 1-Type Guar.(剣)':'Slay Battle 9xRare 1-Type Guar. (Blade)','Slay Battle 9xRare 1-Type Guar.(ガ)':'Slay Battle 9xRare 1-Type Guar. (Gunner)',
'Explorer [マラクジャIsles]':'Explorer [Malachite Isles]','Explorer [ヴォルヒールIsles]':'Explorer [Volhier Isles]',
'Slay Battle 10xRare 1-Type Guar.(剣)':'Slay Battle 10xRare 1-Type Guar. (Blade)','Slay Battle 10xRare 1-Type Guar.(ガ)':'Slay Battle 10xRare 1-Type Guar. (Gunner)',
'Secret Manual Guar.(氷Invasion )':'Secret Manual Guar. (Ice Invasion)','Secret Manual Guar.(土Raid )':'Secret Manual Guar. (Earth Raid)',
'Secret Manual Guar.(土Invasion )':'Secret Manual Guar. (Earth Invasion)','Secret Manual Guar.(雷Raid )':'Secret Manual Guar. (Bolt Raid)',
'Secret Manual Guar.(雷Invasion )':'Secret Manual Guar. (Bolt Invasion)','Secret Manual Guar.(水Raid )':'Secret Manual Guar. (Water Raid)',
'Secret Manual Guar.(水Invasion )':'Secret Manual Guar. (Water Invasion)','Secret Manual Guar.(火Raid )':'Secret Manual Guar. (Fire Raid)',
'Secret Manual Guar.(火Invasion )':'Secret Manual Guar. (Fire Invasion)','Secret Manual Guar.(氷Raid )':'Secret Manual Guar. (Ice Raid)',
'Secret Manual Guar.(戦獄)':'Secret Manual Guar. (Battle Hell)','Secret Manual Guar.(脈動)':'Secret Manual Guar. (Pulsation)',
'Secret Manual Guar.(ユーフォ etc.)':'Secret Manual Guar. (UFO etc.)','Rare Gear Guar. - 2周年':'Rare Gear Guar. - 2nd Anniversary',
'大Rare Gear Guar. - 2周年':'Great Rare Gear Guar. - 2nd Anniversary','Explorer [ダブルIsles]':'Explorer [Double Isles]',
'Explorer [タブラディンIsles]':'Explorer [Tabradin Isles]','レアArmor Guar. - 2周年':'Rare Armor Guar. - 2nd Anniversary',
'レア頭Armor Guar. - 2周年':'Rare Head Armor Guar. - 2nd Anniversary','レア胴Armor Guar. - 2周年':'Rare Body Armor Guar. - 2nd Anniversary',
'レア腕Armor Guar. - 2周年':'Rare Arm Armor Guar. - 2nd Anniversary','レア腰Armor Guar. - 2周年':'Rare Waist Armor Guar. - 2nd Anniversary',
'レア脚Armor Guar. - 2周年':'Rare Leg Armor Guar. - 2nd Anniversary','修正確認用チケクエ1':'Fix Check Ticket Quest 1',
'修正確認用チケクエ2':'Fix Check Ticket Quest 2','Secret Manual Guar.(機Glaive、倍構Bow etc.)':'Secret Manual Guar. (Machine Glaive, Twin Bow etc.)',
'オトモクエ[サボり軽減]':'Palico Quest [Less Laziness]','サンリオRare Gear Guar.':'Sanrio Rare Gear Guar.',
'レアWeapon Guar. - 年末New Year':'Rare Weapon Guar. - Year-End New Year','レアArmor Guar. - 年末New Year':'Rare Armor Guar. - Year-End New Year',
'レアWeapon Guar.SP - 年末New Year':'Rare Weapon Guar.SP - Year-End New Year','Super Ultimateレア玉素材RushII':'Super Ultimate Rare Orb Material Rush II',
'Super Ultimateレア玉素材RushIII':'Super Ultimate Rare Orb Material Rush III','SaGa CollabGear 排出':'SaGa Collab Gear Drop',
'[新春強化] Rare Gear 20':'[New Year Enhancement] Rare Gear 20','[新春強化] Rare Gear Guar.':'[New Year Enhancement] Rare Gear Guar.',
'[1904前半] Nyan Search*5':'[1904 First Half] Nyan Search*5','[1904前半] Nyan Search*6':'[1904 First Half] Nyan Search*6',
'[極地耐性] Rare Gear 10':'[Polar Res] Rare Gear 10','[極地耐性] Rare Gear Guar.':'[Polar Res] Rare Gear Guar.',
}

NE={
'[逸品級]':'[Fine Rank]','[お宝級]':'[Treasure Rank]','[財宝級]':'[Fortune Rank]','[秘宝級]':'[Secret Treasure Rank]',
'Danger 8レア玉2倍Rush!':'Danger 8 Rare Orb 2x Rush!',
'Special Clash 超Rare Gear 5':'Special Clash Super Rare Gear 5','Special Clash 超Rare Gear 20':'Special Clash Super Rare Gear 20',
'七夕Clash Super Rare Gear Guar.':'Tanabata Clash Super Rare Gear Guar.',
'夏恋Clash Super Rare Gear Guar.':'Summer Love Clash Super Rare Gear Guar.',
}
def tr(f):
    if f in EX: return EX[f]
    if f in NE: return NE[f]
    m=re.match(r'^\[(.+?)級\]$',f)
    if m:
        if m.group(1) in GOLDRANK: return f'[{GOLDRANK[m.group(1)]} Rank]'
    m=re.match(r'^\[(.+?)Choco 級\]$',f)
    if m: return f'[{DIFF[m.group(1)]} Choco Rank]'
    m=re.match(r'^\[(Novice|Intermediate|Advanced|Expert|Extreme) - ひなFestり\]$',f)
    if m: return f'[{m.group(1)} - Hina Fest]'
    m=re.match(r'^\[(Novice|Intermediate|Advanced|Expert|Extreme) - 蒼火\]$',f)
    if m: return f'[{m.group(1)} - Azure Fire]'
    m=re.match(r'^\[(Novice|Intermediate|Advanced|Expert|Extreme) - 桜火\]$',f)
    if m: return f'[{m.group(1)} - Cherry Fire]'
    m=re.match(r'^\[Fest級\] Part (\d+)$',f)
    if m: return f'[Fest Rank] Part {m.group(1)}'
    m=re.match(r'^(Aug|Sep|Ver5\.0Memorial) Cup\[Fest級\] (.+)$',f)
    if m:
        s=m.group(2)
        sub={'第一節':'Section 1','第二節':'Section 2','第三節':'Section 3'}
        s=sub.get(s,s.replace('Final 節','Final Section'))
        return f'{m.group(1)} Cup [Fest Rank] {s}'
    m=re.match(r'^(.+)Limited Slay Event$',f)
    if m and m.group(1) in MONTH: return f'{MONTH[m.group(1)]} Limited Slay Event'
    m=re.match(r'^\[(.+?)\] Event Gear (20|Guar\.)$',f)
    if m and m.group(1) in MONTH: return f'[{MONTH[m.group(1)]}] Event Gear {m.group(2)}'
    m=re.match(r'^(.+?)用強化レア玉Rush!$',f)
    if m: return f'{m.group(1)} Enhanced Rare Orb Rush!'
    m=re.match(r'^(火|水|雷|土|氷)Attribute Rare Orb Mat Rush!$',f)
    if m: return f'{ELEM[m.group(1)]} Attribute Rare Orb Mat Rush!'
    m=re.match(r'^\[(火|水|雷|土|氷)\] (Novice|Advanced|Super(?:I|II|III|IV|V|VI|VII))$',f)
    if m: return f'[{ELEM[m.group(1)]}] {m.group(2)}'
    m=re.match(r'^Seabream Plesioth!1月(\d+)日$',f)
    if m: return f'Seabream Plesioth! Jan {m.group(1)}'
    m=re.match(r'^ゼニーQuest \[Day (\d+)\]$',f)
    if m: return f'Zenny Quest [Day {m.group(1)}]'
    m=re.match(r'^(\d+)(st|nd|rd|th) Clash 超Rare Gear (\d+)$',f)
    if m: return f'{m.group(1)}{m.group(2)} Clash Super Rare Gear {m.group(3)}'
    m=re.match(r'^(\d+)(st|nd|rd|th) Clash 黒羽Weapon (\d+)$',f)
    if m: return f'{m.group(1)}{m.group(2)} Clash Black-Wing Weapon {m.group(3)}'
    m=re.match(r'^七夕Clash 超Rare Gear (\d+)$',f)
    if m: return f'Tanabata Clash Super Rare Gear {m.group(1)}'
    m=re.match(r'^夏恋Clash 超Rare Gear (\d+)$',f)
    if m: return f'Summer Love Clash Super Rare Gear {m.group(1)}'
    m=re.match(r"^\['18_(\d+)\] \[(.+?)Limited \]$",f)
    if m:
        body=m.group(2)
        body=re.sub(r'^(水|火|雷|土|氷)',lambda x:ELEM[x.group(1)],body)
        for _jp,_en in [('剣斧','Switch Axe'),('太刀','Long Sword'),('大剣','Great Sword'),('双剣','Dual Blades'),('片手剣','Sword & Shield'),('操虫棍','Insect Glaive'),('狩猟笛','Hunting Horn'),('鎚','Hammer'),('ランス','Lance'),('ガンランス','Gunlance'),('弓','Bow'),('軽弩','Light Bowgun'),('重弩','Heavy Bowgun')]:
            body=body.replace(_jp,_en)
        return f"['18_{m.group(1)}] [{body} Limited]"
    return None

miss=[f for f in frags if not tr(f)]
D={f:tr(f) for f in frags if tr(f)}
print('translated',len(D),'/',len(frags),'missing',len(miss))
for m in miss: print('  MISS',repr(m))
json.dump(D,io.open(S+'quest_frag_trans.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
