extends Node

const MissionGeneratorRef := preload("res://scripts/tactical/mission_generator.gd")
const AfterActionReportScene := preload("res://scene/ui/after_action_report.tscn")

const TACTICAL_SCENE_PATH := "res://scene/main.tscn"
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
		for hero in world_state.roster:
			if not bool(hero.get("dead", false)):
				roster.append(hero.duplicate(true))
	var mission_def = _build_tactical_mission(seed, world_state)
	_pending_config = {
		"mission": mission_def,
		"roster": roster,
		"seed": seed.seed,
		"mission_seed": seed
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
	var missions = MissionGeneratorRef.generate_hub_missions(seed.seed, day_value)
	var mission_def: Dictionary = {}
	if not missions.is_empty():
		mission_def = missions[0].get("mission", {})
	mission_def["id"] = seed.mission_id
	mission_def["seed"] = seed.seed
	mission_def["boss_id"] = seed.boss_id
	return mission_def

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

func _get_world_state() -> Node:
	return get_tree().get_first_node_in_group("world_state")
