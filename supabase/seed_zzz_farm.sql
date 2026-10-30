-- ZZZ: per-agent farming attributes (skill-chip family, promotion seal, Expert Challenge mat, Notorious Hunt mat, cost profile, Chain Attack max) for the Battery planner.
-- Run once after seed_hsr_farm.sql (safe to re-run). Source: the ZZZ Battery Planner sheet, Oct 2026.
create temp table _zfarm(name text, rarity int, attribute text, specialty text, farm jsonb, released boolean);
insert into _zfarm values
('Anby Demara',4,'Electric','Stun','{"family":"Specialized Shock Chip","seal":"Buster Certification Seal","boss":"Murderous Obituary","weekly":"Ferocious Grip","profile":"P1","extra_max":12}'::jsonb,true),
('Billy Kid',4,'Physical','Attack','{"family":"Specialized Physical Chip","seal":"Pioneer''s Certification Seal","boss":"Ethereal Pursuit","weekly":"Ferocious Grip","profile":"P1","extra_max":12}'::jsonb,true),
('Nicole Demara',4,'Ether','Support','{"family":"Specialized Ether Chip","seal":"Ruler Certification Seal","boss":"Murderous Obituary","weekly":"Ferocious Grip","profile":"P1","extra_max":12}'::jsonb,true),
('Nekomiya Mana',5,'Physical','Attack','{"family":"Specialized Physical Chip","seal":"Pioneer''s Certification Seal","boss":"Crimson Awe","weekly":"Ferocious Grip","profile":"P1","extra_max":12}'::jsonb,true),
('Soldier 11',5,'Fire','Attack','{"family":"Specialized Burn Chip","seal":"Pioneer''s Certification Seal","boss":"Destructive Advance","weekly":"Finale Dance Shoes","profile":"P1","extra_max":12}'::jsonb,true),
('Corin Wickes',4,'Physical','Attack','{"family":"Specialized Physical Chip","seal":"Pioneer''s Certification Seal","boss":"Crimson Awe","weekly":"Finale Dance Shoes","profile":"P1","extra_max":12}'::jsonb,true),
('Anton Ivanov',4,'Electric','Attack','{"family":"Specialized Shock Chip","seal":"Pioneer''s Certification Seal","boss":"Destructive Advance","weekly":"Living Drive","profile":"P1","extra_max":12}'::jsonb,true),
('Ben Bigger',4,'Fire','Defense','{"family":"Specialized Burn Chip","seal":"Defender Certification Seal","boss":"Steel Malice","weekly":"Living Drive","profile":"P1","extra_max":12}'::jsonb,true),
('Koleda Belobog',5,'Fire','Stun','{"family":"Specialized Burn Chip","seal":"Buster Certification Seal","boss":"Steel Malice","weekly":"Living Drive","profile":"P1","extra_max":12}'::jsonb,true),
('Grace Howard',5,'Electric','Anomaly','{"family":"Specialized Shock Chip","seal":"Controller Certification Seal","boss":"Destructive Advance","weekly":"Living Drive","profile":"P1","extra_max":12}'::jsonb,true),
('Von Lycaon',5,'Ice','Stun','{"family":"Specialized Freeze Chip","seal":"Buster Certification Seal","boss":"Ethereal Pursuit","weekly":"Finale Dance Shoes","profile":"P1","extra_max":12}'::jsonb,true),
('Ellen Joe',5,'Ice','Attack','{"family":"Specialized Freeze Chip","seal":"Pioneer''s Certification Seal","boss":"Murderous Obituary","weekly":"Ferocious Grip","profile":"P1","extra_max":12}'::jsonb,true),
('Alexandrina Sebastiane',5,'Electric','Support','{"family":"Specialized Shock Chip","seal":"Ruler Certification Seal","boss":"Destructive Advance","weekly":"Finale Dance Shoes","profile":"P1","extra_max":12}'::jsonb,true),
('Zhu Yuan',5,'Ether','Attack','{"family":"Specialized Ether Chip","seal":"Pioneer''s Certification Seal","boss":"Ethereal Pursuit","weekly":"Living Drive","profile":"P1","extra_max":12}'::jsonb,true),
('Soukaku',4,'Ice','Support','{"family":"Specialized Freeze Chip","seal":"Ruler Certification Seal","boss":"Murderous Obituary","weekly":"Finale Dance Shoes","profile":"P1","extra_max":12}'::jsonb,true),
('Luciana de Montefio',4,'Fire','Support','{"family":"Specialized Burn Chip","seal":"Ruler Certification Seal","boss":"Steel Malice","weekly":"Ferocious Grip","profile":"P1","extra_max":12}'::jsonb,true),
('Piper Wheel',4,'Physical','Anomaly','{"family":"Specialized Physical Chip","seal":"Controller Certification Seal","boss":"Crimson Awe","weekly":"Finale Dance Shoes","profile":"P1","extra_max":12}'::jsonb,true),
('Qingyi',5,'Electric','Stun','{"family":"Specialized Shock Chip","seal":"Buster Certification Seal","boss":"Ethereal Pursuit","weekly":"Living Drive","profile":"P1","extra_max":12}'::jsonb,true),
('Jane Doe',5,'Physical','Anomaly','{"family":"Specialized Physical Chip","seal":"Controller Certification Seal","boss":"Destructive Advance","weekly":"Ferocious Grip","profile":"P1","extra_max":12}'::jsonb,true),
('Seth Lowell',4,'Electric','Defense','{"family":"Specialized Shock Chip","seal":"Defender Certification Seal","boss":"Falling Fist","weekly":"Living Drive","profile":"P1","extra_max":12}'::jsonb,true),
('Caesar King',5,'Physical','Defense','{"family":"Specialized Physical Chip","seal":"Defender Certification Seal","boss":"Stealth Phantom","weekly":"Scarlet Engine","profile":"P1","extra_max":12}'::jsonb,true),
('Burnice White',5,'Fire','Anomaly','{"family":"Specialized Burn Chip","seal":"Controller Certification Seal","boss":"Stealth Phantom","weekly":"Scarlet Engine","profile":"P1","extra_max":12}'::jsonb,true),
('Tsukishiro Yanagi',5,'Electric','Anomaly','{"family":"Specialized Shock Chip","seal":"Controller Certification Seal","boss":"Destructive Advance","weekly":"Living Drive","profile":"P1","extra_max":12}'::jsonb,true),
('Lighter',5,'Fire','Stun','{"family":"Specialized Burn Chip","seal":"Buster Certification Seal","boss":"Crimson Awe","weekly":"Scarlet Engine","profile":"P1","extra_max":12}'::jsonb,true),
('Hoshimi Miyabi',5,'Frost','Anomaly','{"family":"Specialized Freeze Chip","seal":"Controller Certification Seal","boss":"Thunderous Dragon","weekly":"Sycophant''s Refinement","profile":"P1","extra_max":12}'::jsonb,true),
('Asaba Harumasa',5,'Electric','Attack','{"family":"Specialized Shock Chip","seal":"Pioneer''s Certification Seal","boss":"Thunderous Dragon","weekly":"Sycophant''s Refinement","profile":"P1","extra_max":12}'::jsonb,true),
('Astra Yao',5,'Ether','Support','{"family":"Specialized Ether Chip","seal":"Ruler Certification Seal","boss":"Thunderous Dragon","weekly":"Finale Dance Shoes","profile":"P1","extra_max":12}'::jsonb,true),
('Evelyn Chevalier',5,'Fire','Attack','{"family":"Specialized Burn Chip","seal":"Pioneer''s Certification Seal","boss":"Steel Malice","weekly":"Scarlet Engine","profile":"P1","extra_max":12}'::jsonb,true),
('Soldier 0 - Anby',5,'Electric','Attack','{"family":"Specialized Shock Chip","seal":"Pioneer''s Certification Seal","boss":"Mortal Cleave","weekly":"Living Drive","profile":"P1","extra_max":12}'::jsonb,true),
('Pulchra Fellini',4,'Physical','Stun','{"family":"Specialized Physical Chip","seal":"Buster Certification Seal","boss":"Stealth Phantom","weekly":"Scarlet Engine","profile":"P1","extra_max":12}'::jsonb,true),
('Trigger',5,'Electric','Stun','{"family":"Specialized Shock Chip","seal":"Buster Certification Seal","boss":"Mortal Cleave","weekly":"Ferocious Grip","profile":"P1","extra_max":12}'::jsonb,true),
('Vivian Banshee',5,'Ether','Anomaly','{"family":"Specialized Ether Chip","seal":"Controller Certification Seal","boss":"Thunderous Dragon","weekly":"Sycophant''s Refinement","profile":"P1","extra_max":12}'::jsonb,true),
('Hugo Vlad',5,'Ice','Attack','{"family":"Specialized Freeze Chip","seal":"Pioneer''s Certification Seal","boss":"Murderous Obituary","weekly":"Finale Dance Shoes","profile":"P1","extra_max":12}'::jsonb,true),
('Ju Fufu',5,'Fire','Stun','{"family":"Specialized Burn Chip","seal":"Buster Certification Seal","boss":"Miasmic Elytron","weekly":"Exuvia of Refinement","profile":"P1","extra_max":12}'::jsonb,true),
('Pan Yinhu',4,'Physical','Defense','{"family":"Specialized Physical Chip","seal":"Defender Certification Seal","boss":"Miasmic Elytron","weekly":"Exuvia of Refinement","profile":"P1","extra_max":12}'::jsonb,true),
('Yixuan',5,'Auric Ink','Rupture','{"family":"Specialized Ether Chip","seal":"Arbiter Certification Seal","boss":"Miasmic Elytron","weekly":"Exuvia of Refinement","profile":"P1","extra_max":12}'::jsonb,true),
('Ukinami Yuzuha',5,'Physical','Support','{"family":"Specialized Physical Chip","seal":"Ruler Certification Seal","boss":"Toxic Edge","weekly":"Sycophant''s Refinement","profile":"P1","extra_max":12}'::jsonb,true),
('Alice Thymefield',5,'Physical','Anomaly','{"family":"Specialized Physical Chip","seal":"Controller Certification Seal","boss":"Toxic Edge","weekly":"Sycophant''s Refinement","profile":"P1","extra_max":12}'::jsonb,true),
('Seed',5,'Electric','Attack','{"family":"Specialized Shock Chip","seal":"Pioneer''s Certification Seal","boss":"Mortal Cleave","weekly":"Exuvia of Refinement","profile":"P1","extra_max":12}'::jsonb,true),
('Orphie Magnusson & "Magus"',5,'Fire','Attack','{"family":"Specialized Burn Chip","seal":"Pioneer''s Certification Seal","boss":"Miasmic Elytron","weekly":"Scarlet Engine","profile":"P1","extra_max":12}'::jsonb,true),
('Lucia',5,'Ether','Support','{"family":"Specialized Ether Chip","seal":"Ruler Certification Seal","boss":"Corrupted Dreamsteel","weekly":"Crimson Miasma Spike","profile":"P1","extra_max":12}'::jsonb,true),
('Komano Manato',4,'Fire','Rupture','{"family":"Specialized Burn Chip","seal":"Arbiter Certification Seal","boss":"Corrupted Dreamsteel","weekly":"Crimson Miasma Spike","profile":"P1","extra_max":12}'::jsonb,true),
('Yidhari',5,'Ice','Rupture','{"family":"Specialized Freeze Chip","seal":"Arbiter Certification Seal","boss":"Corrupted Dreamsteel","weekly":"Crimson Miasma Spike","profile":"P1","extra_max":12}'::jsonb,true),
('Dialyn',5,'Physical','Stun','{"family":"Specialized Physical Chip","seal":"Buster Certification Seal","boss":"Stealth Phantom","weekly":"Exuvia of Refinement","profile":"P1","extra_max":12}'::jsonb,true),
('Banyue',5,'Fire','Rupture','{"family":"Specialized Burn Chip","seal":"Arbiter Certification Seal","boss":"Miasmic Elytron","weekly":"Crimson Miasma Spike","profile":"P1","extra_max":12}'::jsonb,true),
('Zhao',5,'Ice','Defense','{"family":"Specialized Freeze Chip","seal":"Defender Certification Seal","boss":"Spiked Corruption Core","weekly":"Clouded Crystalline Substance","profile":"P1","extra_max":12}'::jsonb,true),
('Ye Shunguang',5,'Honed Edge','Attack','{"family":"Specialized Physical Chip","seal":"Pioneer''s Certification Seal","boss":"Spiked Corruption Core","weekly":"Clouded Crystalline Substance","profile":"P1","extra_max":12}'::jsonb,true),
('Sunna',5,'Physical','Support','{"family":"Specialized Physical Chip","seal":"Ruler Certification Seal","boss":"Bloodstained Miasma Feather","weekly":"Clouded Crystalline Substance","profile":"P1","extra_max":12}'::jsonb,true),
('Aria',5,'Ether','Anomaly','{"family":"Specialized Ether Chip","seal":"Controller Certification Seal","boss":"Falling Fist","weekly":"Clouded Crystalline Substance","profile":"P1","extra_max":12}'::jsonb,true),
('Nangong Yu',5,'Ether','Stun','{"family":"Specialized Ether Chip","seal":"Buster Certification Seal","boss":"Spiked Corruption Core","weekly":"Marrow-Draining Thorn","profile":"P1","extra_max":12}'::jsonb,true),
('Cissia',5,'Electric','Attack','{"family":"Specialized Shock Chip","seal":"Pioneer''s Certification Seal","boss":"Bloodstained Miasma Feather","weekly":"Exuvia of Refinement","profile":"P1","extra_max":12}'::jsonb,true),
('Promeia',5,'Ice','Anomaly','{"family":"Specialized Freeze Chip","seal":"Controller Certification Seal","boss":"Toxic Edge","weekly":"Marrow-Draining Thorn","profile":"P1","extra_max":12}'::jsonb,true),
('Starlight - Billy',5,'Physical','Rupture','{"family":"Specialized Physical Chip","seal":"Arbiter Certification Seal","boss":"Bloodstained Miasma Feather","weekly":"Clouded Crystalline Substance","profile":"P1","extra_max":12}'::jsonb,true),
('Pyrois',5,'Ether','Attack','{"family":"Specialized Ether Chip","seal":"Pioneer''s Certification Seal","boss":"Deep Erosion Circuit","weekly":"Timeworn Husk","profile":"P1","extra_max":12}'::jsonb,true),
('Velina Airgid',5,'Wind','Anomaly','{"family":"Specialized Windbite Chip","seal":"Controller Certification Seal","boss":"Deep Erosion Circuit","weekly":"Timeworn Husk","profile":"P1","extra_max":12}'::jsonb,true),
('Norma Hollowell',5,'Fire','Stun','{"family":"Specialized Burn Chip","seal":"Buster Certification Seal","boss":"Deep Erosion Circuit","weekly":"Timeworn Husk","profile":"P1","extra_max":12}'::jsonb,true),
('Sigrid de L''Azur',5,'Ice','Attack','{"family":"Specialized Freeze Chip","seal":"Pioneer''s Certification Seal","boss":"Corrupted Dreamsteel","weekly":"Crimson Miasma Spike","profile":"P1","extra_max":12}'::jsonb,true),
('Remielle',5,'Lumiflux','Anomaly','{"family":"Specialized Lumiflux Chip","seal":"Controller Certification Seal","boss":"Deep Erosion Circuit","weekly":"Timeworn Husk","profile":"P1","extra_max":12}'::jsonb,true),
('Claret',5,'Electric','Armorer','{"family":"Specialized Shock Chip","seal":"Bladebearer Certification Seal","boss":"Imitation Core","weekly":"Counterfeit Nucleus","profile":"P1","extra_max":12}'::jsonb,true),
('Roxy Ifrita Pryce',5,'Wind','Stun','{"family":"Specialized Windbite Chip","seal":"Buster Certification Seal","boss":"Imitation Core","weekly":"Counterfeit Nucleus","profile":"P1","extra_max":12}'::jsonb,true),
('Phoenix Reffaella',5,'Fire','Anomaly','{"family":"Specialized Burn Chip","seal":"Controller Certification Seal","boss":"New Expert Challenge mat (3.3, Phoenix)","weekly":"New Notorious Hunt mat (3.3, Phoenix)","profile":"P1","extra_max":12}'::jsonb,false),
('Severian Lowell',5,'Wind','Attack','{"family":"Specialized Windbite Chip","seal":"Pioneer''s Certification Seal","boss":"New Expert Challenge mat (3.3, Severian)","weekly":"New Notorious Hunt mat (3.3, Severian)","profile":"P1","extra_max":12}'::jsonb,false);
-- agents missing from the master list are added
insert into public.characters (game_id, name, rarity, element, weapon_type, is_limited, is_free, is_released, source, farm)
select 'zzz', z.name, z.rarity, z.attribute, z.specialty, false, false, z.released, 'battery-planner', z.farm
from _zfarm z where not exists (select 1 from public.characters c where c.game_id='zzz' and lower(c.name)=lower(z.name));
update public.characters c set farm = z.farm, element = coalesce(c.element, z.attribute), weapon_type = coalesce(c.weapon_type, z.specialty)
from _zfarm z where c.game_id='zzz' and lower(c.name)=lower(z.name);
-- an unreleased agent's new materials can't be farmed before its banner; the planner locks them until the release date
update public.characters set release_date = coalesce(release_date, '2026-11-11') where game_id='zzz' and name = 'Severian Lowell' and not is_released;
select (select count(*) from public.characters where game_id='zzz' and farm <> '{}'::jsonb) as with_farm,
       (select string_agg(name, ', ') from public.characters where game_id='zzz' and (farm is null or farm = '{}'::jsonb)) as names_without;
drop table _zfarm;
