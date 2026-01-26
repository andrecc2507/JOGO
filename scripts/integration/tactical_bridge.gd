extends Node

const MissionGeneratorRef := preload("res://scripts/tactical/mission_generator.gd")
const BiomeMapGeneratorRef := preload("res://scripts/tactical/biome_map_generator.gd")
const AfterActionReportScene := preload("res://scene/ui/after_action_report.tscn")
const POST_MISSION_SCENE_PATH := "res://scene/ui/post_mission_screen.tscn"

# COMO USAR:
# 1) Chame start_mission(seed) com MissionSeed.
# 2) O bridge monta roster/consumables e abre o tático.
# 3) complete_mission(result) aplica o resultado e mostra AAR.

const TACTICAL_SCENE_PATH := "res://scene/tactical_battle.tscn"
const MACRO_SCENE_PATH := "res://scene/ui/map_screen.tscn"
const DEMO_TEMPLATE_ID := "demo_day0_loop"
const TACTICAL_TYPES := ["SKIRMISH", "ASSASSINATE", "DEFEND", "ESCORT", "CAPTURE", "STEALTH"]

var active_mission_seed: MissionSeed
var last_result: MissionResult
var _pending_config: Dictionary = {}
var _aar_instance: Control

func _ready() -> void:
	add_to_group("tactical_bridge")

func start_mission(seed: MissionSeed) -> void:
	if seed == null:
		return
	active_mission_seed = seed
	var world_state = _get_world_state()
	if world_state != null:
		world_state.ensure_roster_seeded_if_empty()
	var is_demo := String(seed.template_id) == DEMO_TEMPLATE_ID
	var demo_classes: Array = []
	var demo_seed := int(seed.seed)
	if is_demo:
		var rng := RandomNumberGenerator.new()
		rng.randomize()
		demo_seed = int(rng.randi())
		if world_state != null:
			var selection: Array = world_state.progression.get("demo_class_selection", [])
			for entry in selection:
				var class_id := String(entry)
				if class_id != "":
					demo_classes.append(class_id)
			world_state.progression.erase("demo_class_selection")
	var roster: Array = []
	if world_state != null:
		var party_ids: Array = seed.party_ids if seed.party_ids != null else []
		if party_ids.is_empty() and world_state.get("active_party_ids") != null:
			party_ids = world_state.active_party_ids
		for hero in world_state.roster:
			if bool(hero.get("dead", false)):
				continue
			if party_ids.is_empty() or party_ids.has(String(hero.get("id", ""))):
				roster.append(hero.duplicate(true))
	var mission_def = _build_tactical_mission(seed, world_state, demo_seed, is_demo, demo_classes)
	_pending_config = {
		"mission": mission_def,
		"roster": roster,
		"seed": demo_seed,
		"mission_seed": seed,
		"consumables": seed.consumables,
		"demo_classes": demo_classes
	}
	var tactical := _find_tactical_controller()
	if tactical != null:
		tactical.start_mission(_pending_config, roster)
		return
	get_tree().change_scene_to_file(TACTICAL_SCENE_PATH)
	call_deferred("_deferred_start_mission")

func complete_mission(result: MissionResult) -> void:
	last_result = result
	var world_state = _get_world_state()
	var roster_before = _snapshot_roster(world_state)
	if world_state != null:
		world_state.apply_mission_result(result)
	var roster_after = _snapshot_roster(world_state)
	var hero_deltas = _build_hero_deltas(result, roster_before, roster_after)
	if world_state != null:
		world_state.progression["last_mission_result"] = result.serialize()
		world_state.progression["last_mission_hero_deltas"] = hero_deltas
	get_tree().change_scene_to_file(POST_MISSION_SCENE_PATH)

func _deferred_start_mission() -> void:
	var tactical := _find_tactical_controller()
	if tactical == null:
		return
	var roster: Array = _pending_config.get("roster", [])
	tactical.start_mission(_pending_config, roster)

func _build_tactical_mission(seed: MissionSeed, world_state: Node, seed_override: int = 0, is_demo: bool = false, demo_classes: Array = []) -> Dictionary:
	var day_value = 1
	if world_state != null:
		day_value = int(world_state.day)
	var mission_def: Dictionary = {}
	var map_profile: Dictionary = seed.map_profile if seed.map_profile != null else {}
	var effective_seed := seed_override if seed_override != 0 else seed.seed
	var normalized_type := _normalize_mission_type(seed)
	if is_demo:
		var biome_id := seed.biome_id if seed.biome_id != "" else "forest"
		var demo_profile := {
			"map_size_range": [16, 16],
			"cover_density": 0.45,
			"height_levels": 2
		}
		var biome_map := BiomeMapGeneratorRef.generate(effective_seed, biome_id, "SKIRMISH", 0, demo_profile)
		mission_def = biome_map
		mission_def["type"] = "SKIRMISH"
		mission_def["mission_type"] = "SKIRMISH"
		mission_def["objective_type"] = "KILL_ALL"
		mission_def["requires_extract"] = false
		mission_def["enemy_profile"] = _demo_enemy_profile_for_classes(demo_classes)
		_apply_map_size_from_profile(mission_def)
		_apply_demo_spawns(mission_def)
	else:
		if map_profile.is_empty():
			var missions = MissionGeneratorRef.generate_hub_missions(effective_seed, day_value)
			if not missions.is_empty():
				mission_def = missions[0].get("mission", {})
		else:
			var mission_type := normalized_type
			var difficulty := _difficulty_from_risk(int(seed.risk))
			mission_def = MissionGeneratorRef.generate_from_seed(effective_seed, mission_type, map_profile, difficulty)
		if map_profile.is_empty() and seed.map_id == "" and seed.biome_id != "":
			var mission_type_fallback := normalized_type
			var difficulty_fallback := _difficulty_from_risk(int(seed.risk))
			var biome_map := BiomeMapGeneratorRef.generate(effective_seed, seed.biome_id, mission_type_fallback, difficulty_fallback, {})
			mission_def.merge(biome_map, true)
			_apply_map_size_from_profile(mission_def)
	mission_def["id"] = seed.mission_id
	mission_def["seed"] = effective_seed
	mission_def["boss_id"] = seed.boss_id
	if is_demo:
		mission_def["type"] = "SKIRMISH"
		mission_def["mission_type"] = "SKIRMISH"
		if not mission_def.has("biome_id"):
			mission_def["biome_id"] = seed.biome_id
	else:
		mission_def["type"] = normalized_type
		mission_def["mission_type"] = normalized_type
		mission_def["biome_id"] = seed.biome_id
	mission_def["map_id"] = seed.map_id
	mission_def["stealth"] = String(mission_def.get("type", "")).to_upper() == "STEALTH"
	var objective_text := _objective_text_from_seed(seed)
	if objective_text != "":
		mission_def["objective_text"] = objective_text
	return mission_def

func _normalize_mission_type(seed: MissionSeed) -> String:
	var raw_type := String(seed.mission_type if seed.mission_type != "" else seed.type).strip_edges().to_upper()
	if raw_type == "":
		return "SKIRMISH"
	if TACTICAL_TYPES.has(raw_type):
		return raw_type
	match raw_type:
		"SCOUT", "PATROL", "INVESTIGATE":
			return "STEALTH"
		"RAID", "STRIKE":
			return "ASSASSINATE"
		"DEFENSE":
			return "DEFEND"
		"ESCORT_MISSION":
			return "ESCORT"
		"TAKEOVER", "SECURE":
			return "CAPTURE"
	return "SKIRMISH"

func _objective_text_from_seed(seed: MissionSeed) -> String:
	if seed == null:
		return ""
	var objectives: Array = seed.objectives if seed.objectives != null else []
	if objectives.is_empty():
		return ""
	var lines: Array[String] = []
	for obj in objectives:
		if obj is Dictionary:
			var text := String(obj.get("description", obj.get("text", ""))).strip_edges()
			if text != "":
				lines.append(text)
		elif obj is String:
			var label := String(obj).strip_edges()
			if label != "":
				lines.append(label)
	return "\n".join(lines)

func _demo_enemy_profile_for_classes(demo_classes: Array) -> Array:
	var class_ids: Array[String] = []
	for entry in demo_classes:
		var class_id := String(entry).strip_edges().to_upper()
		if class_id != "":
			class_ids.append(class_id)
	if class_ids.is_empty():
		class_ids = ["GUERREIRO", "ARCANO", "ARQUEIRO", "PATRULHEIRO"]
	var profile: Array = []
	for class_id in class_ids:
		profile.append({
			"archetype": "acolyte",
			"count": 1,
			"class_id": class_id
		})
	return profile

func _apply_demo_spawns(mission_def: Dictionary) -> void:
	var w = int(mission_def.get("map_w", 16))
	var h = int(mission_def.get("map_h", 16))
	var max_x = max(1, w - 2)
	var max_y = max(1, h - 2)
	var p1 = Vector2i(clamp(1, 1, max_x), clamp(h - 2, 1, max_y))
	var p2 = Vector2i(clamp(2, 1, max_x), clamp(h - 3, 1, max_y))
	var p3 = Vector2i(clamp(3, 1, max_x), clamp(h - 2, 1, max_y))
	var p4 = Vector2i(clamp(2, 1, max_x), clamp(h - 4, 1, max_y))
	var e1 = Vector2i(clamp(w - 2, 1, max_x), clamp(1, 1, max_y))
	var e2 = Vector2i(clamp(w - 3, 1, max_x), clamp(2, 1, max_y))
	var e3 = Vector2i(clamp(w - 4, 1, max_x), clamp(1, 1, max_y))
	var e4 = Vector2i(clamp(w - 3, 1, max_x), clamp(3, 1, max_y))
	mission_def["player_spawns"] = [p1, p2, p3, p4]
	mission_def["enemy_spawns"] = [e1, e2, e3, e4]

func _apply_map_size_from_profile(mission_def: Dictionary) -> void:
	if mission_def.has("map_w") and mission_def.has("map_h"):
		return
	var map_profile: Dictionary = mission_def.get("map_profile", {})
	var size_variant: Variant = map_profile.get("size", mission_def.get("size", Vector2i(16, 16)))
	var size: Vector2i
	if size_variant is Vector2i:
		size = size_variant
	elif size_variant is Vector2:
		var vec2: Vector2 = size_variant
		size = Vector2i(int(vec2.x), int(vec2.y))
	elif size_variant is Dictionary:
		var size_dict: Dictionary = size_variant
		size = Vector2i(int(size_dict.get("x", 16)), int(size_dict.get("y", 16)))
	else:
		return
	mission_def["map_w"] = int(size.x)
	mission_def["map_h"] = int(size.y)

func _difficulty_from_risk(risk: int) -> int:
	if risk >= 7:
		return 2
	if risk >= 4:
		return 1
	return 0

func _present_aar(result: MissionResult, hero_deltas: Array) -> void:
	var root := _find_ui_root()
	if root == null:
		return
	if _aar_instance == null or not is_instance_valid(_aar_instance):
		_aar_instance = AfterActionReportScene.instantiate()
		root.add_child(_aar_instance)
		if _aar_instance.has_signal("continue_pressed"):
			_aar_instance.connect("continue_pressed", Callable(self, "_on_aar_continue"))
	if _aar_instance.has_method("show_report"):
		_aar_instance.show_report(result, hero_deltas)
	_aar_instance.visible = true

func _on_aar_continue() -> void:
	if _aar_instance != null:
		_aar_instance.visible = false
	if get_tree().current_scene != null and get_tree().current_scene.scene_file_path != MACRO_SCENE_PATH:
		get_tree().change_scene_to_file(MACRO_SCENE_PATH)

func _build_hero_deltas(result: MissionResult, before_roster: Array, after_roster: Array) -> Array:
	var deltas: Array = []
	for entry in result.hero_results:
		var hero_id = String(entry.get("id", ""))
		if hero_id == "":
			continue
		var before = _find_hero_in_roster(before_roster, hero_id)
		var after = _find_hero_in_roster(after_roster, hero_id)
		if after.is_empty():
			continue
		var level_before = int(before.get("level", 1)) if not before.is_empty() else int(after.get("level", 1))
		var level_after = int(after.get("level", 1))
		var wounds_before = int(before.get("wounds", 0)) if not before.is_empty() else 0
		var wounds_after = int(after.get("wounds", 0))
		deltas.append({
			"id": hero_id,
			"name": String(after.get("name", entry.get("name", "Hero"))),
			"xp_gain": int(entry.get("xp", 0)),
			"level_before": level_before,
			"level_after": level_after,
			"wounds_delta": max(0, wounds_after - wounds_before),
			"dead": bool(after.get("dead", false))
		})
	return deltas

func _snapshot_roster(world_state: Node) -> Array:
	if world_state == null:
		return []
	return world_state.roster.duplicate(true)

func _find_hero_in_roster(roster: Array, hero_id: String) -> Dictionary:
	for hero in roster:
		if String(hero.get("id", "")) == hero_id:
			return hero
	return {}

func _find_ui_root() -> Node:
	var current = get_tree().current_scene
	if current == null:
		return null
	var ui_layer = current.get_node_or_null("UI")
	if ui_layer != null:
		return ui_layer
	return current

func _find_tactical_controller() -> TacticalController:
	var current = get_tree().current_scene
	if current == null:
		return null
	if current is TacticalController:
		return current
	return current.get_node_or_null("Tactical") as TacticalController

func _get_scene_tree() -> SceneTree:
	var tree := get_tree()
	if tree == null:
		var loop := Engine.get_main_loop()
		if loop is SceneTree:
			tree = loop
	return tree

func _get_world_state() -> Node:
	var tree := _get_scene_tree()
	if tree == null:
		return null
	return tree.get_first_node_in_group("world_state")
