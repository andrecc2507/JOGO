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

func new_game(seed: int = -1) -> void:
	if seed < 0:
		seed = randi()
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
		}, "ranger"),
		_make_hero(2, "Vanguarda", {
			"hp_max": 24,
			"dex": 8,
			"agi": 8,
			"def": 14,
			"speed": 8,
			"perception": 10,
			"vision_range": 9,
			"pa_max": 8
		}, "vanguard"),
		_make_hero(3, "Mística", {
			"hp_max": 18,
			"dex": 9,
			"agi": 10,
			"def": 9,
			"speed": 10,
			"perception": 12,
			"vision_range": 10,
			"pa_max": 8
		}, "mystic")
	]
	inventory = []
	campaign = {
		"seed": seed,
		"day": 1,
		"week": 1,
		"completed_missions": [],
		"difficulty": 1,
		"unlocked_things": [],
		"current_mission": 0,
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

func get_hero(id: int) -> Dictionary:
	for hero in heroes:
		if int(hero.get("id", -1)) == id:
			return hero
	return {}

func get_hero_by_id(id: int) -> Dictionary:
	return get_hero(id)

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

func _make_hero(id: int, name: String, stats: Dictionary, kit_id: String) -> Dictionary:
	var base_stats = stats.duplicate(true)
	var current_stats = stats.duplicate(true)
	return {
		"id": id,
		"nome": name,
		"name": name,
		"base_stats": base_stats,
		"current_stats": current_stats,
		"stats": current_stats,
		"level": 1,
		"lvl": 1,
		"xp": 0,
		"gear": {"weapon": null, "armor": null, "trinket": null},
		"abilities_kit": kit_id,
		"kit_id": kit_id,
		"injuries": {"remaining_missions": 0},
		"injured_for": 0
	}

func _apply_xp(result: Dictionary) -> void:
	var hero_xp: Array = result.get("hero_xp", [])
	for entry in hero_xp:
		var hero_id = int(entry.get("id", -1))
		var hero := get_hero_by_id(hero_id)
		if hero.is_empty():
			continue
		grant_xp(hero_id, int(entry.get("xp", 0)))

func grant_xp(hero_id: int, xp_gain: int) -> void:
	if xp_gain <= 0:
		return
	var hero := get_hero_by_id(hero_id)
	if hero.is_empty():
		return
	var xp = int(hero.get("xp", 0)) + xp_gain
	hero["xp"] = xp
	level_up_if_needed(hero_id)

func level_up_if_needed(hero_id: int) -> void:
	var hero := get_hero_by_id(hero_id)
	if hero.is_empty():
		return
	var level = int(hero.get("level", hero.get("lvl", 1)))
	var xp = int(hero.get("xp", 0))
	var current_stats: Dictionary = hero.get("current_stats", hero.get("stats", {}))
	var base_stats: Dictionary = hero.get("base_stats", current_stats).duplicate(true)
	while xp >= _xp_threshold(level):
		xp -= _xp_threshold(level)
		level += 1
		base_stats["hp_max"] = int(base_stats.get("hp_max", 0)) + 2
		var bonus_key = LEVEL_BONUS_CYCLE[(level - 2) % LEVEL_BONUS_CYCLE.size()]
		base_stats[bonus_key] = int(base_stats.get(bonus_key, 0)) + 1
	current_stats = base_stats.duplicate(true)
	hero["base_stats"] = base_stats
	hero["current_stats"] = current_stats
	hero["stats"] = current_stats
	hero["level"] = level
	hero["lvl"] = level
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
		var injuries: Dictionary = hero.get("injuries", {"remaining_missions": 0})
		injuries["remaining_missions"] = max(int(injuries.get("remaining_missions", 0)), INJURY_MISSIONS)
		hero["injuries"] = injuries

func _tick_injuries() -> void:
	for hero in heroes:
		var remaining = int(hero.get("injured_for", 0))
		if remaining > 0:
			hero["injured_for"] = remaining - 1
		var injuries: Dictionary = hero.get("injuries", {"remaining_missions": 0})
		var missions_left = int(injuries.get("remaining_missions", 0))
		if missions_left > 0:
			injuries["remaining_missions"] = missions_left - 1
			hero["injuries"] = injuries

func _campaign_apply_result(result: Dictionary) -> void:
	if result.get("victory", false):
		campaign["current_mission"] = int(campaign.get("current_mission", 0)) + 1
		var completed: Array = campaign.get("completed_missions", [])
		var mid = result.get("mission_id", "")
		if mid != "" and not completed.has(mid):
			completed.append(mid)
		campaign["completed_missions"] = completed

func _apply_item_bonus(hero: Dictionary, item: Dictionary, mult: int) -> void:
	var stats: Dictionary = hero.get("stats", hero.get("current_stats", {}))
	var bonuses = GearRef.get_stat_bonuses(item)
	for key in bonuses.keys():
		stats[key] = int(stats.get(key, 0)) + int(bonuses[key]) * mult
	hero["stats"] = stats
	hero["current_stats"] = stats

func roll_loot(table_id: String, count: int) -> Array:
	var loot: Array = []
	if count <= 0:
		return loot
	var rng := RandomNumberGenerator.new()
	var seed = int(campaign.get("seed", 0)) + int(campaign.get("current_mission", 0))
	rng.seed = seed
	for i in range(count):
		loot.append(GearRef.create_random_item(rng))
	return loot

func _deep_copy_array(arr: Array) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for entry in arr:
		if typeof(entry) == TYPE_DICTIONARY:
			out.append(entry.duplicate(true))
	return out
