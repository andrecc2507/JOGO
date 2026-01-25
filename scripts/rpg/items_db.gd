extends RefCounted
class_name RPGItemsDB

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

static func items_by_type(item_type: String) -> Array:
	var items := []
	for id in _load_items().keys():
		var item: Dictionary = _items_cache[id]
		if String(item.get("type", item.get("slot", ""))) == item_type:
			items.append(item)
	return items

static func items_by_tier_and_tags(item_type: String, tier: int, tags: Array) -> Array:
	var matches := []
	for item in items_by_type(item_type):
		if int(item.get("tier", 1)) != tier:
			continue
		var item_tags: Array = item.get("tags", [])
		var ok = true
		for tag in tags:
			if not item_tags.has(tag):
				ok = false
				break
		if ok:
			matches.append(item)
	return matches
