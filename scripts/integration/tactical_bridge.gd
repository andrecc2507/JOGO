extends Node

const MissionGeneratorRef := preload("res://scripts/tactical/mission_generator.gd")
const AfterActionReportScene := preload("res://scene/ui/after_action_report.tscn")

# COMO USAR:
# 1) Chame start_mission(seed) com MissionSeed.
# 2) O bridge monta roster/consumables e abre o tático.
# 3) complete_mission(result) aplica o resultado e mostra AAR.

const TACTICAL_SCENE_PATH := "res://scene/tactical_battle.tscn"
const MACRO_SCENE_PATH := "res://scene/ui/map_screen.tscn"

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
	var mission_def = _build_tactical_mission(seed, world_state)
	_pending_config = {
		"mission": mission_def,
		"roster": roster,
		"seed": seed.seed,
		"mission_seed": seed,
		"consumables": seed.consumables
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
	_present_aar(result, hero_deltas)

func _deferred_start_mission() -> void:
	var tactical := _find_tactical_controller()
	if tactical == null:
		return
	var roster: Array = _pending_config.get("roster", [])
	tactical.start_mission(_pending_config, roster)

func _build_tactical_mission(seed: MissionSeed, world_state: Node) -> Dictionary:
	var day_value = 1
	if world_state != null:
		day_value = int(world_state.day)
	var mission_def: Dictionary = {}
	var map_profile: Dictionary = seed.map_profile if seed.map_profile != null else {}
	if map_profile.is_empty():
		var missions = MissionGeneratorRef.generate_hub_missions(seed.seed, day_value)
		if not missions.is_empty():
			mission_def = missions[0].get("mission", {})
	else:
		var mission_type := String(seed.mission_type if seed.mission_type != "" else seed.type)
		var difficulty := _difficulty_from_risk(int(seed.risk))
		mission_def = MissionGeneratorRef.generate_from_seed(seed.seed, mission_type, map_profile, difficulty)
	mission_def["id"] = seed.mission_id
	mission_def["seed"] = seed.seed
	mission_def["boss_id"] = seed.boss_id
	mission_def["type"] = seed.mission_type if seed.mission_type != "" else seed.type
	mission_def["map_id"] = seed.map_id
	mission_def["biome_id"] = seed.biome_id
	mission_def["stealth"] = String(mission_def.get("type", "")).to_upper() == "STEALTH"
	return mission_def

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
