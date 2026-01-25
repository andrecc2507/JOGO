extends RefCounted
class_name RPGStats

const STAT_KEYS := ["STR", "DEX", "AGI", "VIT", "INT"]

static func _safe_stats_dict(stats: Dictionary) -> Dictionary:
	var out := {}
	for key in STAT_KEYS:
		out[key] = int(stats.get(key, 0))
	return out

static func collect_item_stats(unit: Unit) -> Dictionary:
	if unit == null:
		return {}
	var totals := {"STR": 0, "DEX": 0, "AGI": 0, "VIT": 0, "INT": 0}
	for slot in unit.get_equipment_slots():
		var item: Dictionary = unit.equipped.get(slot, null)
		if item == null:
			continue
		var stats: Dictionary = item.get("stats", {})
		for key in totals.keys():
			totals[key] += int(stats.get(key, 0))
	return totals

static func collect_skill_stats(unit: Unit) -> Dictionary:
	if unit == null:
		return {}
	var totals := {"STR": 0, "DEX": 0, "AGI": 0, "VIT": 0, "INT": 0}
	var skills = unit.unlocked_skills if unit.unlocked_skills != null else {}
	if skills.is_empty():
		return totals
	var classes_db := RPGClassesDB.new()
	for skill_id in skills.keys():
		if not bool(skills.get(skill_id, false)):
			continue
		var def: Dictionary = classes_db.get_skill(skill_id)
		var effects: Dictionary = def.get("effects", {})
		var stats: Dictionary = effects.get("stats", {})
		for key in totals.keys():
			totals[key] += int(stats.get(key, 0))
	return totals

static func compute_final_stats(unit: Unit) -> Dictionary:
	if unit == null:
		return {}
	var base_stats = _safe_stats_dict(unit.base_stats)
	var item_stats = collect_item_stats(unit)
	var skill_stats = collect_skill_stats(unit)
	var final_stats := {}
	for key in STAT_KEYS:
		final_stats[key] = int(base_stats.get(key, 0)) + int(item_stats.get(key, 0)) + int(skill_stats.get(key, 0))
	var base_hp = int(unit.base_hp)
	var base_mp = int(unit.base_mp)
	var hp = base_hp + int(final_stats.get("VIT", 0)) * 6
	var mp = base_mp + int(final_stats.get("INT", 0)) * 5
	return {
		"stats": final_stats,
		"hp": hp,
		"mp": mp
	}

static func physical_damage(weapon_base: int, stats: Dictionary, mods_skill: int = 0) -> int:
	var str_val = int(stats.get("STR", 0))
	var dex_val = int(stats.get("DEX", 0))
	return int(round(float(weapon_base) + float(str_val) * 0.7 + float(dex_val) * 0.25 + float(mods_skill)))

static func magical_damage(spell_base: int, stats: Dictionary, mods_skill: int = 0) -> int:
	var int_val = int(stats.get("INT", 0))
	return int(round(float(spell_base) + float(int_val) * 0.9 + float(mods_skill)))

static func hit_chance(base_aim: int, stats_attacker: Dictionary, stats_defender: Dictionary, mods_cover: int, mods_skill: int, mods_hit_zone: int) -> int:
	var dex_val = int(stats_attacker.get("DEX", 0))
	var agi_val = int(stats_defender.get("AGI", 0))
	var hit = base_aim + dex_val * 2 - agi_val * 2 + mods_cover + mods_skill + mods_hit_zone
	return clamp(hit, 1, 95)

static func proc_chance(base_proc: float, stats_attacker: Dictionary, stats_defender: Dictionary, mods: float) -> float:
	var int_val = float(stats_attacker.get("INT", 0))
	var vit_val = float(stats_defender.get("VIT", 0))
	var chance = base_proc + int_val * 0.4 - vit_val * 0.3 + mods
	return clamp(chance, 0.0, 70.0)

static func dodge_chance(stats: Dictionary) -> float:
	return clamp(float(stats.get("AGI", 0)), 0.0, 35.0)
