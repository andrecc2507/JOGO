class_name RPGDebugRunner
extends Node

const RPGClassesRef := preload("res://scripts/rpg/classes_db.gd")
const RPGItemsRef := preload("res://scripts/rpg/items_db.gd")
const RPGStatsRef := preload("res://scripts/rpg/stats.gd")
const RPGProgressionRef := preload("res://scripts/rpg/progression.gd")

func create_test_unit(class_id: String, level: int) -> Unit:
	var unit := Unit.new()
	unit._sync_base_stats()
	unit.apply_class(class_id)
	unit.level = clamp(level, 1, RPGProgressionRef.MAX_LEVEL)
	RPGProgressionRef.ensure_level_points(unit)
	unit._recalc_derived()
	_print_unit_summary(unit)
	return unit

func equip_test_item(unit: Unit, item_id: String) -> void:
	if unit == null:
		return
	var before = RPGStatsRef.compute_final_stats(unit)
	var item = RPGItemsRef.get_item(item_id)
	if item.is_empty():
		print("Item inválido: %s" % item_id)
		return
	unit.equip(item)
	var after = RPGStatsRef.compute_final_stats(unit)
	print("Equipou %s (%s)" % [item.get("name", item_id), item_id])
	_print_stats_delta(before.get("stats", {}), after.get("stats", {}))
	print("HP %d -> %d | MP %d -> %d" % [int(before.get("hp", 0)), int(after.get("hp", 0)), int(before.get("mp", 0)), int(after.get("mp", 0))])

func unlock_skill(unit: Unit, skill_id: String) -> void:
	if unit == null:
		return
	var ok = unit.unlock_skill(skill_id)
	if ok:
		print("Skill desbloqueada: %s" % skill_id)
		unit._recalc_derived()
		_print_unit_summary(unit)
	else:
		print("Falha ao desbloquear %s (prereq/SP)" % skill_id)

func _print_unit_summary(unit: Unit) -> void:
	var stats_pack = RPGStatsRef.compute_final_stats(unit)
	var stats: Dictionary = stats_pack.get("stats", {})
	var hp = int(stats_pack.get("hp", 0))
	var mp = int(stats_pack.get("mp", 0))
	var aim = RPGStatsRef.hit_chance(65, stats, {"AGI": 10}, 0, 0, 0)
	var dmg = RPGStatsRef.physical_damage(unit.get_weapon_base_atk(), stats, 0)
	print("[%s] Lvl %d | STR:%d DEX:%d AGI:%d VIT:%d INT:%d" % [unit.rpg_class_id, unit.level, stats.get("STR", 0), stats.get("DEX", 0), stats.get("AGI", 0), stats.get("VIT", 0), stats.get("INT", 0)])
	print("HP:%d MP:%d | Aim base:%d%% | Dmg base:%d" % [hp, mp, aim, dmg])

func _print_stats_delta(before: Dictionary, after: Dictionary) -> void:
	for key in ["STR", "DEX", "AGI", "VIT", "INT"]:
		var b = int(before.get(key, 0))
		var a = int(after.get(key, 0))
		if b != a:
			print("%s: %d -> %d" % [key, b, a])
