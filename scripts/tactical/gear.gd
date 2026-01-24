extends RefCounted
class_name Gear

const SLOT_WEAPON := "weapon"
const SLOT_ARMOR := "armor"
const SLOT_CHARM := "charm"
const SLOT_ACCESSORY := "accessory"
const SLOTS := [SLOT_WEAPON, SLOT_ARMOR, SLOT_CHARM]

static var _items_cache: Dictionary = {}

static func _load_items() -> Dictionary:
	if not _items_cache.is_empty():
		return _items_cache
	if not FileAccess.file_exists("res://content/items.json"):
		return {}
	var file := FileAccess.open("res://content/items.json", FileAccess.READ)
	if file == null:
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if parsed is Dictionary:
		_items_cache = parsed.get("items", {})
	return _items_cache

static func get_item(item_id: String) -> Dictionary:
	if item_id == "":
		return {}
	return _load_items().get(item_id, {})

static func get_all_items() -> Dictionary:
	return _load_items()

static func get_random_item_id(rng: RandomNumberGenerator) -> String:
	var items := _load_items()
	if items.is_empty():
		return ""
	var keys := items.keys()
	if rng == null:
		rng = RandomNumberGenerator.new()
		rng.randomize()
	return String(keys[rng.randi_range(0, keys.size() - 1)])

static func slot_name(slot: String) -> String:
	return slot.to_upper()
