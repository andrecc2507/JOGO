extends RefCounted
class_name RPGClassesDB

var _classes_cache: Dictionary = {}
var _skills_cache: Dictionary = {}

func _load_classes() -> Dictionary:
	if not _classes_cache.is_empty():
		return _classes_cache
	if not FileAccess.file_exists("res://content/classes.json"):
		return {}
	var file := FileAccess.open("res://content/classes.json", FileAccess.READ)
	if file == null:
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if parsed is Dictionary:
		_classes_cache = parsed.get("classes", {})
	return _classes_cache

func _load_skills() -> Dictionary:
	if not _skills_cache.is_empty():
		return _skills_cache
	if not FileAccess.file_exists("res://content/skills_web.json"):
		return {}
	var file := FileAccess.open("res://content/skills_web.json", FileAccess.READ)
	if file == null:
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if parsed is Dictionary:
		_skills_cache = parsed.get("skills", {})
	return _skills_cache

func get_class_data(class_id: String) -> Dictionary:
	return _load_classes().get(class_id, {})

func get_all_class_data() -> Dictionary:
	return _load_classes()

func get_skill_data(skill_id: String) -> Dictionary:
	return _load_skills().get(skill_id, {})

func get_skills_for_class(class_id: String) -> Array:
	var out: Array = []
	for skill_id in _load_skills().keys():
		var skill: Dictionary = _skills_cache[skill_id]
		if String(skill.get("class_id", "")) == class_id:
			out.append(skill)
	return out

func get_build(class_id: String, build_id: String) -> Dictionary:
	var cls = get_class_data(class_id)
	var builds: Dictionary = cls.get("builds", {})
	return builds.get(build_id, {})

func list_build_ids(class_id: String) -> Array:
	var cls = get_class_data(class_id)
	var builds: Dictionary = cls.get("builds", {})
	return builds.keys()
