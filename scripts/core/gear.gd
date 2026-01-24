extends Node

const SLOT_WEAPON := "weapon"
const SLOT_ARMOR := "armor"
const SLOT_TRINKET := "trinket"
const SLOTS := [SLOT_WEAPON, SLOT_ARMOR, SLOT_TRINKET]

const WEAPON_NAMES := ["Fuzil", "Pistola", "Carabina", "Lança"]
const ARMOR_NAMES := ["Jaqueta", "Colete", "Placas", "Manto"]
const TRINKET_NAMES := ["Pingente", "Amuleto", "Anel", "Chip"]

static func create_random_item(rng: RandomNumberGenerator) -> Dictionary:
	if rng == null:
		rng = RandomNumberGenerator.new()
		rng.randomize()
	var slot = SLOTS[rng.randi_range(0, SLOTS.size() - 1)]
	var item: Dictionary = {
		"id": int(Time.get_ticks_msec()) + rng.randi_range(0, 999),
		"slot": slot
	}
	match slot:
		SLOT_WEAPON:
			item["name"] = WEAPON_NAMES[rng.randi_range(0, WEAPON_NAMES.size() - 1)]
			item["aim_bonus"] = rng.randi_range(3, 8)
			item["range_bonus"] = rng.randi_range(0, 2)
			item["dex_bonus"] = rng.randi_range(0, 1)
		SLOT_ARMOR:
			item["name"] = ARMOR_NAMES[rng.randi_range(0, ARMOR_NAMES.size() - 1)]
			item["armor"] = rng.randi_range(1, 4)
			item["hp_bonus"] = rng.randi_range(2, 6)
			item["def_bonus"] = rng.randi_range(0, 2)
		SLOT_TRINKET:
			item["name"] = TRINKET_NAMES[rng.randi_range(0, TRINKET_NAMES.size() - 1)]
			item["hp_bonus"] = rng.randi_range(0, 4)
			item["agi_bonus"] = rng.randi_range(0, 2)
			item["vision_bonus"] = rng.randi_range(0, 2)
	return item

static func get_stat_bonuses(item: Dictionary) -> Dictionary:
	var bonuses: Dictionary = {}
	bonuses["hp_max"] = int(item.get("hp_bonus", 0))
	bonuses["dex"] = int(item.get("dex_bonus", 0))
	bonuses["agi"] = int(item.get("agi_bonus", 0))
	bonuses["def"] = int(item.get("def_bonus", int(item.get("armor", 0))))
	bonuses["speed"] = int(item.get("speed_bonus", 0))
	bonuses["pa_max"] = int(item.get("pa_bonus", 0))
	bonuses["vision_range"] = int(item.get("vision_bonus", 0))
	return bonuses

static func format_item(item: Dictionary) -> String:
	if item.is_empty():
		return ""
	var parts: Array[String] = []
	for key in ["hp_bonus", "dex_bonus", "agi_bonus", "def_bonus", "armor", "speed_bonus", "aim_bonus", "range_bonus", "vision_bonus"]:
		if int(item.get(key, 0)) != 0:
			parts.append("%s %+d" % [key, int(item.get(key, 0))])
	var stats = "; ".join(parts)
	return "%s (%s)" % [String(item.get("name", "Item")), stats]
