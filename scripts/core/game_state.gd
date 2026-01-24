extends Node
class_name GameState

const GearRef := preload("res://scripts/core/gear.gd")

var heroes: Array[Dictionary] = []
var inventory: Array[Dictionary] = []
var campaign: Dictionary = {}
var last_result: Dictionary = {}

const LEVEL_BONUS_CYCLE := ["dex", "agi", "def"]
const BASE_XP_THRESHOLD := 100
const XP_STEP := 50
const INJURY_MISSIONS := 2

func new_game() -> void:
	heroes = [
		_make_hero(1, "Batedor", {
			"hp_max": 20,
			"dex": 12,
			"agi": 14,
			"def": 8,
			"speed": 16,
			"perception": 12,
			"vision_range": 9,
			"pa_max": 8
		}),
		_make_hero(2, "Vanguarda", {
			"hp_max": 24,
			"dex": 8,
			"agi": 8,
			"def": 14,
			"speed": 8,
			"perception": 10,
			"vision_range": 9,
			"pa_max": 8
		})
	]
	inventory = []
	campaign = {
		"seed": randi(),
		"current_mission": 0,
		"completed_missions": [],
		"difficulty_flags": {},
		"gold": 0
	}
	last_result = {}

func apply_mission_result(result: Dictionary) -> void:
	last_result = result.duplicate(true)
	_campaign_apply_result(result)
	_tick_injuries()
	_apply_injuries(result)
	_apply_xp(result)
	_apply_loot(result)

func get_hero_by_id(id: int) -> Dictionary:
	for hero in heroes:
		if int(hero.get("id", -1)) == id:
			return hero
	return {}

func equip_item(hero_id: int, inventory_index: int) -> bool:
	if inventory_index < 0 or inventory_index >= inventory.size():
		return false
	var hero := get_hero_by_id(hero_id)
	if hero.is_empty():
		return false
	var item: Dictionary = inventory[inventory_index]
	var slot := String(item.get("slot", ""))
	if slot.is_empty():
		return false
	var gear: Dictionary = hero.get("gear", {})
	if gear.is_empty():
		gear = {"weapon": null, "armor": null, "trinket": null}
	var existing = gear.get(slot, null)
	if existing != null:
		_apply_item_bonus(hero, existing, -1)
		inventory.append(existing)
	gear[slot] = item
	hero["gear"] = gear
	_apply_item_bonus(hero, item, 1)
	inventory.remove_at(inventory_index)
	return true

func serialize() -> Dictionary:
	return {
		"heroes": _deep_copy_array(heroes),
		"inventory": _deep_copy_array(inventory),
		"campaign": campaign.duplicate(true),
		"last_result": last_result.duplicate(true)
	}

func deserialize(data: Dictionary) -> void:
	heroes = _deep_copy_array(data.get("heroes", []))
	inventory = _deep_copy_array(data.get("inventory", []))
	campaign = data.get("campaign", {}).duplicate(true)
	last_result = data.get("last_result", {}).duplicate(true)
	if heroes.is_empty():
		new_game()

func _make_hero(id: int, name: String, stats: Dictionary) -> Dictionary:
	return {
		"id": id,
		"name": name,
		"stats": stats.duplicate(true),
		"level": 1,
		"xp": 0,
		"gear": {"weapon": null, "armor": null, "trinket": null},
		"kit_id": "starter",
		"injured_for": 0
	}

func _apply_xp(result: Dictionary) -> void:
	var hero_xp: Array = result.get("hero_xp", [])
	for entry in hero_xp:
		var hero_id = int(entry.get("id", -1))
		var hero := get_hero_by_id(hero_id)
		if hero.is_empty():
			continue
		var gained = int(entry.get("xp", 0))
		var xp = int(hero.get("xp", 0)) + gained
		hero["xp"] = xp
		_apply_level_ups(hero)

func _apply_level_ups(hero: Dictionary) -> void:
	var level = int(hero.get("level", 1))
	var xp = int(hero.get("xp", 0))
	while xp >= _xp_threshold(level):
		xp -= _xp_threshold(level)
		level += 1
		var stats: Dictionary = hero.get("stats", {})
		stats["hp_max"] = int(stats.get("hp_max", 0)) + 2
		var bonus_key = LEVEL_BONUS_CYCLE[(level - 2) % LEVEL_BONUS_CYCLE.size()]
		stats[bonus_key] = int(stats.get(bonus_key, 0)) + 1
		hero["stats"] = stats
	hero["level"] = level
	hero["xp"] = xp

func _xp_threshold(level: int) -> int:
	return BASE_XP_THRESHOLD + max(0, level - 1) * XP_STEP

func _apply_loot(result: Dictionary) -> void:
	var loot: Array = result.get("loot", [])
	for item in loot:
		inventory.append(item)
	var gold = int(result.get("gold", 0))
	campaign["gold"] = int(campaign.get("gold", 0)) + gold

func _apply_injuries(result: Dictionary) -> void:
	var injured: Array = result.get("injured_heroes", [])
	for hero_id in injured:
		var hero := get_hero_by_id(int(hero_id))
		if hero.is_empty():
			continue
		hero["injured_for"] = max(int(hero.get("injured_for", 0)), INJURY_MISSIONS)

func _tick_injuries() -> void:
	for hero in heroes:
		var remaining = int(hero.get("injured_for", 0))
		if remaining > 0:
			hero["injured_for"] = remaining - 1

func _campaign_apply_result(result: Dictionary) -> void:
	if result.get("victory", false):
		campaign["current_mission"] = int(campaign.get("current_mission", 0)) + 1
		var completed: Array = campaign.get("completed_missions", [])
		var mid = result.get("mission_id", "")
		if mid != "" and not completed.has(mid):
			completed.append(mid)
		campaign["completed_missions"] = completed

func _apply_item_bonus(hero: Dictionary, item: Dictionary, mult: int) -> void:
	var stats: Dictionary = hero.get("stats", {})
	var bonuses = GearRef.get_stat_bonuses(item)
	for key in bonuses.keys():
		stats[key] = int(stats.get(key, 0)) + int(bonuses[key]) * mult
	hero["stats"] = stats

func _deep_copy_array(arr: Array) -> Array:
	var out: Array = []
	for entry in arr:
		if typeof(entry) == TYPE_DICTIONARY:
			out.append(entry.duplicate(true))
		else:
			out.append(entry)
	return out
