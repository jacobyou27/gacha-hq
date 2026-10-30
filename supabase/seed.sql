-- Gacha HQ — reference seed (v1). Safe to re-run: existing rows are left alone.
-- Run after 0001_init.sql. Characters here are a STARTER set; the full master
-- lists live in the Gacha Roster sheet ("Characters" tab) and can be imported
-- later via the admin page or a CSV → insert.

insert into public.games
  (id, name, sort_order, stamina_name, stamina_per_day, stamina_cap,
   dupe_label, weapon_label, class_label, element_label, max_dupes, max_level,
   version_anchor, version_anchor_date, version_length_days)
values
  ('genshin', 'Genshin',          1, 'Resin',            180, 200, 'Constellation', 'Weapon',     'Weapon type', 'Element',   6, 90, '7.1', '2026-09-22', 42),
  ('hsr',     'Honkai: Star Rail',2, 'Trailblaze Power', 240, 300, 'Eidolon',       'Light Cone', 'Path',        'Type',      6, 80, '4.6', '2026-09-28', null),
  ('zzz',     'Zenless Zone Zero',3, 'Battery',          320, 240, 'Mindscape',     'W-Engine',   'Specialty',   'Attribute', 6, 60, '3.3', '2026-10-21', 42),
  ('wuwa',    'Wuthering Waves',  4, 'Waveplate',        240, 240, 'Sequence',      'Weapon',     'Weapon type', 'Attribute', 6, 90, '3.7', '2026-09-30', 42)
on conflict (id) do nothing;

-- rarity: 5 = 5★ / S-rank, 4 = 4★ / A-rank
-- is_limited: counts toward pulls (limited banner 5★). Standard-banner 5★, 4★ and free units are false.
insert into public.characters (game_id, name, rarity, element, weapon_type, version, is_limited, is_free) values
  -- Genshin
  ('genshin', 'Traveler',        5, 'Any',     'Sword',    '1.0', false, true),
  ('genshin', 'Hu Tao',          5, 'Pyro',    'Polearm',  '1.3', true,  false),
  ('genshin', 'Raiden Shogun',   5, 'Electro', 'Polearm',  '2.1', true,  false),
  ('genshin', 'Kaedehara Kazuha',5, 'Anemo',   'Sword',    '1.6', true,  false),
  ('genshin', 'Zhongli',         5, 'Geo',     'Polearm',  '1.1', true,  false),
  ('genshin', 'Yelan',           5, 'Hydro',   'Bow',      '2.7', true,  false),
  ('genshin', 'Nahida',          5, 'Dendro',  'Catalyst', '3.2', true,  false),
  ('genshin', 'Neuvillette',     5, 'Hydro',   'Catalyst', '4.1', true,  false),
  ('genshin', 'Furina',          5, 'Hydro',   'Sword',    '4.2', true,  false),
  ('genshin', 'Arlecchino',      5, 'Pyro',    'Polearm',  '4.6', true,  false),
  ('genshin', 'Xilonen',         5, 'Geo',     'Sword',    '5.1', true,  false),
  ('genshin', 'Mavuika',         5, 'Pyro',    'Claymore', '5.3', true,  false),
  ('genshin', 'Skirk',           5, 'Cryo',    'Sword',    '5.7', true,  false),
  ('genshin', 'Diluc',           5, 'Pyro',    'Claymore', '1.0', false, false),
  ('genshin', 'Jean',            5, 'Anemo',   'Sword',    '1.0', false, false),
  ('genshin', 'Qiqi',            5, 'Cryo',    'Sword',    '1.0', false, false),
  ('genshin', 'Mona',            5, 'Hydro',   'Catalyst', '1.0', false, false),
  ('genshin', 'Keqing',          5, 'Electro', 'Sword',    '1.0', false, false),
  ('genshin', 'Tighnari',        5, 'Dendro',  'Bow',      '3.0', false, false),
  ('genshin', 'Dehya',           5, 'Pyro',    'Claymore', '3.5', false, false),
  ('genshin', 'Bennett',         4, 'Pyro',    'Sword',    '1.0', false, false),
  ('genshin', 'Xingqiu',         4, 'Hydro',   'Sword',    '1.0', false, false),
  ('genshin', 'Xiangling',       4, 'Pyro',    'Polearm',  '1.0', false, false),
  ('genshin', 'Fischl',          4, 'Electro', 'Bow',      '1.0', false, false),
  ('genshin', 'Sucrose',         4, 'Anemo',   'Catalyst', '1.0', false, false),
  -- Honkai: Star Rail
  ('hsr', 'Trailblazer',  5, 'Any',       'Destruction',  '1.0', false, true),
  ('hsr', 'March 7th',    4, 'Ice',       'Preservation', '1.0', false, true),
  ('hsr', 'Kafka',        5, 'Lightning', 'Nihility',     '1.2', true,  false),
  ('hsr', 'Ruan Mei',     5, 'Ice',       'Harmony',      '1.6', true,  false),
  ('hsr', 'Acheron',      5, 'Lightning', 'Nihility',     '2.1', true,  false),
  ('hsr', 'Aventurine',   5, 'Imaginary', 'Preservation', '2.1', true,  false),
  ('hsr', 'Robin',        5, 'Physical',  'Harmony',      '2.2', true,  false),
  ('hsr', 'Firefly',      5, 'Fire',      'Destruction',  '2.3', true,  false),
  ('hsr', 'Feixiao',      5, 'Wind',      'Hunt',         '2.5', true,  false),
  ('hsr', 'Sunday',       5, 'Imaginary', 'Harmony',      '2.7', true,  false),
  ('hsr', 'The Herta',    5, 'Ice',       'Erudition',    '3.0', true,  false),
  ('hsr', 'Castorice',    5, 'Quantum',   'Remembrance',  '3.2', true,  false),
  ('hsr', 'Bronya',       5, 'Wind',      'Harmony',      '1.0', false, false),
  ('hsr', 'Himeko',       5, 'Fire',      'Erudition',    '1.0', false, false),
  ('hsr', 'Welt',         5, 'Imaginary', 'Nihility',     '1.0', false, false),
  ('hsr', 'Gepard',       5, 'Ice',       'Preservation', '1.0', false, false),
  ('hsr', 'Clara',        5, 'Physical',  'Destruction',  '1.0', false, false),
  ('hsr', 'Yanqing',      5, 'Ice',       'Hunt',         '1.0', false, false),
  ('hsr', 'Bailu',        5, 'Lightning', 'Abundance',    '1.0', false, false),
  ('hsr', 'Tingyun',      4, 'Lightning', 'Harmony',      '1.0', false, false),
  ('hsr', 'Pela',         4, 'Ice',       'Nihility',     '1.0', false, false),
  -- Zenless Zone Zero
  ('zzz', 'Anby Demara',  4, 'Electric', 'Stun',    '1.0', false, true),
  ('zzz', 'Nicole Demara',4, 'Ether',    'Support', '1.0', false, true),
  ('zzz', 'Billy Kid',    4, 'Physical', 'Attack',  '1.0', false, true),
  ('zzz', 'Ellen Joe',    5, 'Ice',      'Attack',  '1.0', true,  false),
  ('zzz', 'Zhu Yuan',     5, 'Ether',    'Attack',  '1.0', true,  false),
  ('zzz', 'Jane Doe',     5, 'Physical', 'Anomaly', '1.1', true,  false),
  ('zzz', 'Caesar King',  5, 'Physical', 'Defense', '1.2', true,  false),
  ('zzz', 'Burnice White',5, 'Fire',     'Anomaly', '1.2', true,  false),
  ('zzz', 'Yanagi',       5, 'Electric', 'Anomaly', '1.3', true,  false),
  ('zzz', 'Hoshimi Miyabi',5,'Frost',    'Anomaly', '1.4', true,  false),
  ('zzz', 'Evelyn Chevalier',5,'Fire',   'Attack',  '1.5', true,  false),
  ('zzz', 'Astra Yao',    5, 'Ether',    'Support', '1.5', true,  false),
  ('zzz', 'Vivian Banshee',5,'Ether',    'Anomaly', '2.0', true,  false),
  ('zzz', 'Yixuan',       5, 'Ether',    'Rupture', '2.0', true,  false),
  ('zzz', 'Von Lycaon',   5, 'Ice',      'Stun',    '1.0', false, false),
  ('zzz', 'Koleda Belobog',5,'Fire',     'Stun',    '1.0', false, false),
  ('zzz', 'Grace Howard', 5, 'Electric', 'Anomaly', '1.0', false, false),
  ('zzz', 'Alexandrina Sebastiane',5,'Electric','Support','1.0', false, false),
  ('zzz', 'Soldier 11',   5, 'Fire',     'Attack',  '1.0', false, false),
  ('zzz', 'Nekomata',     5, 'Physical', 'Attack',  '1.0', false, false),
  -- Wuthering Waves
  ('wuwa', 'Rover',        5, 'Any',     'Sword',      '1.0', false, true),
  ('wuwa', 'Jinhsi',       5, 'Spectro', 'Broadblade', '1.1', true,  false),
  ('wuwa', 'Changli',      5, 'Fusion',  'Sword',      '1.1', true,  false),
  ('wuwa', 'Shorekeeper',  5, 'Spectro', 'Rectifier',  '1.3', true,  false),
  ('wuwa', 'Camellya',     5, 'Havoc',   'Sword',      '1.4', true,  false),
  ('wuwa', 'Carlotta',     5, 'Glacio',  'Pistols',    '2.0', true,  false),
  ('wuwa', 'Zani',         5, 'Spectro', 'Gauntlets',  '2.3', true,  false),
  ('wuwa', 'Cartethyia',   5, 'Aero',    'Sword',      '2.4', true,  false),
  ('wuwa', 'Ciaccona',     5, 'Aero',    'Pistols',    '2.4', true,  false),
  ('wuwa', 'Phrolova',     5, 'Havoc',   'Rectifier',  '2.5', true,  false),
  ('wuwa', 'Jianxin',      5, 'Aero',    'Gauntlets',  '1.0', false, false),
  ('wuwa', 'Lingyang',     5, 'Glacio',  'Gauntlets',  '1.0', false, false),
  ('wuwa', 'Encore',       5, 'Fusion',  'Rectifier',  '1.0', false, false),
  ('wuwa', 'Calcharo',     5, 'Electro', 'Broadblade', '1.0', false, false),
  ('wuwa', 'Verina',       5, 'Spectro', 'Rectifier',  '1.0', false, false),
  ('wuwa', 'Sanhua',       4, 'Glacio',  'Sword',      '1.0', false, false),
  ('wuwa', 'Yangyang',     4, 'Aero',    'Sword',      '1.0', false, true),
  ('wuwa', 'Chixia',       4, 'Fusion',  'Pistols',    '1.0', false, true),
  ('wuwa', 'Baizhi',       4, 'Glacio',  'Rectifier',  '1.0', false, true)
on conflict (game_id, name) do nothing;

-- Admins: see supabase/migrations/0002_admin_emails.sql (allow-list lives in the database).
