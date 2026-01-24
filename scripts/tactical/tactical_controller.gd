# res://scripts/tactical/tactical_controller.gd
extends Node3D
class_name TacticalController

const MissionGeneratorRef := preload("res://scripts/tactical/mission_generator.gd")
const CombatFXRef := preload("res://scripts/tactical/combat_fx.gd")

enum ActionMode { MOVE, SHOOT, ABILITY }
var action_mode: int = ActionMode.MOVE

@export var unit_scene: PackedScene
@export var map_w: int = 16
@export var map_h: int = 16

@onready var units_root: Node3D = $Units
@onready var obstacles_root: Node3D = $Obstacles
@onready var timeline: TimelineManager = $"../TimelineManager"
@onready var ui_label: Label = $"../UI/TurnLabel"
@onready var aim_label: Label = $"../UI/AimLabel"
@onready var end_turn_btn: Button = get_node_or_null("../UI/EndTurnButton")
@onready var _cam: Camera3D = get_node_or_null("../CameraRig/Camera3D") as Camera3D

var grid: GridData
var player_units: Array[Unit] = []
var enemy_units: Array[Unit] = []
var mission := {}
var mission_state := {"completed": false, "failed": false, "turns": 0}
var mission_objective_type := "KILL_ALL"
var mission_objective_text := ""
var mission_extract_cell: Vector2i = Vector2i(-1, -1)
var mission_turn_limit: int = 0
var mission_seed: int = 0
var mission_active: bool = false
var _last_active_team := -1

# Mission UI
var mission_panel: Control
var mission_objective_label: Label
var mission_progress_label: Label
var end_screen: Control
var end_title_label: Label
var end_reason_label: Label
var restart_button: Button

# Costs / tuning
const MOVE_COST_PER_TILE := 1
const SHOOT_COST := 4
const MELEE_COST := 3
const MELEE_AIM_BASE := 75
const OA_COST := 2
const OA_HIT_PENALTY := 10
const OA_DMG_MULT := 0.7
const DAMAGE_VARIANCE_MIN := 0.9
const DAMAGE_VARIANCE_MAX := 1.1
const CRIT_MULT := 1.5
const BASE_WEAPON_AIM := 65
const BASE_RANGE_3D := 11.0
const RANGE_BONUS_PER_LEVEL := 1.0
const HIGHGROUND_AIM_PER_LEVEL := 10
const HALF_COVER_PENALTY := 20
const FULL_COVER_PENALTY := 40

@export var DEBUG_LOGS: bool = true

func _step_move_cost(u: Unit, from: Vector2i, to: Vector2i) -> int:
	if u == null or grid == null:
		return MOVE_COST_PER_TILE
	return Pathfinding.step_cost(grid, from, to, u)

# Reach + hover visuals
var reach_mmi: MultiMeshInstance3D
var reach_mm: MultiMesh
var target_mmi: MultiMeshInstance3D
var target_mm: MultiMesh
var hover_tile: MeshInstance3D
var cover_indicator: MeshInstance3D
var extract_marker: MeshInstance3D
var active_ring: MeshInstance3D
var active_arrow: MeshInstance3D
var target_ring: MeshInstance3D
var _active_ring_mat: StandardMaterial3D
var _active_arrow_mat: StandardMaterial3D
var _target_ring_mat: StandardMaterial3D
var _hover_ring_mat: StandardMaterial3D
var _target_ring_base_color: Color = Color(1.0, 0.65, 0.2, 0.6)
var _hover_valid_move: Color = Color(0.2, 0.9, 0.4, 0.55)
var _hover_valid_shoot: Color = Color(1.0, 0.2, 0.2, 0.6)
var _hover_valid_ability: Color = Color(0.85, 0.65, 0.25, 0.6)
var _hover_invalid: Color = Color(0.4, 0.4, 0.4, 0.35)
var _hover_blocked: Color = Color(0.35, 0.1, 0.1, 0.45)
var target_flash_timer := 0.0
var _flash_target_cell := Vector2i(-999, -999)

var fx: CombatFX

# Obstacles visuals
var obstacle_mesh := {} # Dictionary {Vector2i: MeshInstance3D}

# LOS visuals
var los_mesh_instance: MeshInstance3D
var los_immediate: ImmediateMesh
var los_mat_ok: StandardMaterial3D
var los_mat_blocked: StandardMaterial3D
var blocker_tile: MeshInstance3D
var blocker_ghost: MeshInstance3D

# AOE preview
var aoe_preview_mmi: MultiMeshInstance3D
var aoe_preview_mm: MultiMesh
var _aoe_cells: Array[Vector2i] = []

# Path preview
var path_mesh_instance: MeshInstance3D
var path_immediate: ImmediateMesh
var path_mat_ok: StandardMaterial3D
var path_mat_risky: StandardMaterial3D
var _hover_path_cost: int = -1
var _hover_path_risky: bool = false

# Hover / path state
var _reach_cost := {}
var _hover_snap := Vector2i(-999, -999)

# Snap smoothing
var _snap_hold_cell := Vector2i(-999, -999)
var _snap_hold_time := 0.0

# Enemy AI gate
var _enemy_acted_for_turn: bool = false

# Hotbar
var _hotbar_root: Control
var _hotbar_labels: Array[Label] = []
var _selected_ability: Dictionary = {}

# Combat log
const LOG_BUFFER_MAX := 100
var _log_buffer: Array[String] = []
var _log_panel: Control
var _log_scroll: ScrollContainer
var _log_label: RichTextLabel

# Status UI
var _status_label: Label
var _missing_cam_logged: bool = false

# Turn order UI
var _turn_panel: Control
var _turn_label: Label

func _ready() -> void:
	_ensure_visuals()
	_ensure_action_markers()
	_ensure_los_visuals()
	_ensure_hotbar_ui()
	_ensure_objective_marker()
	_ensure_mission_ui()
	_ensure_fx()
	_ensure_log_ui()
	_ensure_status_ui()
	_ensure_turn_order_ui()
	if _cam == null:
		_cam = get_node_or_null("../CameraRig/Pivot/Camera3D") as Camera3D

	# camera bounds
	var camrig = get_node_or_null("../CameraRig")
	if camrig and camrig.has_method("set_bounds"):
		camrig.set_bounds(map_w, map_h, 1.0)

	timeline.active_unit_changed.connect(_on_active_unit_changed)
	timeline.turn_ending.connect(_on_turn_ending)

	if end_turn_btn:
		end_turn_btn.pressed.connect(_on_end_turn_pressed)
	if restart_button:
		restart_button.pressed.connect(_on_restart_pressed)

	_start_new_mission()

func _start_new_mission() -> void:
	_clear_current_mission()

	var w = map_w if map_w != null and map_w > 0 else 16
	var h = map_h if map_h != null and map_h > 0 else 16
	map_w = w
	map_h = h
	grid = GridData.new(w, h)

	mission = MissionGeneratorRef.generate(w, h)
	mission_seed = int(mission.get("seed", 0))
	mission_objective_type = String(mission.get("objective_type", "KILL_ALL"))
	mission_objective_text = String(mission.get("objective_text", ""))
	mission_extract_cell = mission.get("extract_cell", Vector2i(-1, -1))
	mission_turn_limit = int(mission.get("turn_limit", 0))
	mission_state = {"completed": false, "failed": false, "turns": 0}
	_last_active_team = -1
	_log_buffer.clear()
	_update_log_ui()

	_build_map_from_mission()
	_spawn_units_from_mission()

	_update_mission_ui()
	_update_extract_marker()

	if end_screen:
		end_screen.visible = false
	mission_active = true
	if timeline:
		timeline.reset()
		timeline.set_process(true)
		for u in player_units + enemy_units:
			timeline.register_unit(u)
	action_mode = ActionMode.MOVE
	_selected_ability = {}

	_rebuild_obstacles_visual()
	_reach_cost = {}
	_clear_aoe_preview()
	_hide_los_visuals()

	var camrig = get_node_or_null("../CameraRig")
	if camrig and camrig.has_method("set_bounds"):
		camrig.set_bounds(w, h, 1.0)

func _clear_current_mission() -> void:
	for u in player_units:
		if is_instance_valid(u):
			u.queue_free()
	for e in enemy_units:
		if is_instance_valid(e):
			e.queue_free()
	player_units.clear()
	enemy_units.clear()

	for k in obstacle_mesh.keys():
		var m = obstacle_mesh[k]
		if is_instance_valid(m):
			m.queue_free()
	obstacle_mesh.clear()

	if extract_marker:
		extract_marker.visible = false

	_reach_cost = {}
	_clear_aoe_preview()
	_clear_target_overlay()
	_hide_los_visuals()
	_hide_path_preview()
	mission_active = false

func _build_map_from_mission() -> void:
	var heights: Dictionary = mission.get("heights", {})
	for cell in heights.keys():
		var z = int(heights[cell])
		grid.set_height(cell.x, cell.y, z)

	var obstacles: Array = mission.get("obstacles", [])
	for ob in obstacles:
		var cell = ob.get("cell", Vector2i.ZERO)
		var mat = int(ob.get("mat", Damage.MatType.WOOD))
		var hp = int(ob.get("hp", 6))
		grid.set_obstacle(cell.x, cell.y, mat, hp)

func _spawn_units_from_mission() -> void:
	if unit_scene == null:
		push_error("unit_scene não setado no TacticalController")
		return

	var player_spawns: Array = mission.get("player_spawns", [])
	var enemy_spawns: Array = mission.get("enemy_spawns", [])
	var player_count = max(2, player_spawns.size())
	var enemy_count = max(3, enemy_spawns.size())

	for i in range(player_count):
		var cell: Vector2i = _spawn_cell_for_player(i, player_spawns)
		var u := _make_player_unit(i)
		_add_unit(u, cell)

	for i in range(enemy_count):
		var ecell: Vector2i = _spawn_cell_for_enemy(i, enemy_spawns)
		var e := _make_enemy_unit(i)
		_add_unit(e, ecell)

func _make_player_unit(idx: int) -> Unit:
	var u: Unit = unit_scene.instantiate()
	if idx == 0:
		u.unit_name = "Batedor"
		u.dex = 12
		u.agi = 14
		u.def = 8
		u.speed = 16
	else:
		u.unit_name = "Vanguarda"
		u.dex = 8
		u.agi = 8
		u.def = 14
		u.speed = 8
	u.team = 0
	u.abilities = Abilities.default_kit()
	return u

func _make_enemy_unit(idx: int) -> Unit:
	var u: Unit = unit_scene.instantiate()
	u.unit_name = "Monstro %d" % (idx + 1)
	u.team = 1
	u.dex = 10
	u.agi = 10
	u.def = 10
	u.speed = 10
	u.abilities = Abilities.default_kit()
	return u

func _add_unit(u: Unit, c: Vector2i) -> void:
	u.cell = c
	u.position = grid.cell_to_world(c.x, c.y)
	units_root.add_child(u)
	if u.team == 0:
		player_units.append(u)
	else:
		enemy_units.append(u)

func _on_active_unit_changed(u: Unit) -> void:
	if not mission_active:
		return
	if u == null:
		return
	if u.team == 0 and _last_active_team != 0:
		mission_state["turns"] = int(mission_state.get("turns", 0)) + 1
	_update_mission_ui()
	_last_active_team = u.team
	_snap_hold_cell = Vector2i(-999, -999)
	_snap_hold_time = 0.0
	_enemy_acted_for_turn = false

	_hide_los_visuals()
	_clear_aoe_preview()

	u.overwatch_used = false
	u.overwatch = false
	u.tick_cooldowns()
	var status_events = u.tick_statuses_turn_start()
	_handle_status_events(u, status_events, "start")
	_update_status_ui(u)

	var stunned_on_start = false
	for e in status_events:
		if String(e.get("type", "")) == "stun":
			stunned_on_start = true
			break
	if stunned_on_start:
		_log("%s está atordoado e perde o turno!" % u.unit_name)
		_spawn_floating_text(u.global_position, "STUN!", "status")
		u.pa = 0
		if timeline != null and timeline.has_method("force_end_active_turn"):
			timeline.force_end_active_turn()
		return

	if u.team == 0:
		_reach_cost = Pathfinding.reachable_with_pa(grid, u.cell, u.pa, u)
		_build_reach_overlay(_reach_cost)
	else:
		_reach_cost = {}
		_build_reach_overlay(_reach_cost)

	_selected_ability = {}
	action_mode = ActionMode.MOVE
	_refresh_hotbar(u)
	_clear_target_overlay()
	_refresh_ui(u, Vector2i(-999, -999), Vector2i(-999, -999), null, null, _evaluate_ability_target(u, Vector2i(-999, -999)))

	var camrig = get_node_or_null("../CameraRig")
	if camrig and camrig.has_method("center_on_world"):
		camrig.center_on_world(u.global_position)

	_update_active_ring(u)
	_update_turn_order_ui()
	_update_status_ui(u)

	_check_mission_status()

func _on_turn_ending(u: Unit) -> void:
	if u == null:
		return
	_handle_status_events(u, u.tick_statuses_turn_end(), "end")
	_update_status_ui(u)

func _handle_status_events(u: Unit, events: Array[Dictionary], timing: String) -> void:
	if events.is_empty():
		return
	for e in events:
		var etype = String(e.get("type", ""))
		if etype == "stun":
			u.pa = 0
			if timing != "start":
				_log("%s está STUNNED (%s)" % [u.unit_name, timing])
				_spawn_floating_text(u.global_position, "STUN!", "status")
				_spawn_action_ring(u.global_position, Color(1.0, 0.9, 0.2, 0.55))
		elif etype == "expire":
			var sname = String(e.get("name", ""))
			_log("%s: %s expirou." % [u.unit_name, sname])
		elif etype == "damage":
			_apply_status_damage(u, e)
		elif etype == "heal":
			_apply_status_heal(u, e)
		elif etype == "vulnerable":
			_log("%s está vulnerável!" % u.unit_name)
	_update_status_ui(u)

func _apply_status_damage(u: Unit, event: Dictionary) -> void:
	var amount = int(event.get("amount", 0))
	if amount <= 0:
		return
	var dmg_type = int(event.get("dmg_type", Damage.DmgType.PIERCING))
	var true_damage = bool(event.get("true_damage", false))
	var label = String(event.get("name", ""))
	var context := {"true_damage": true_damage, "armor_mult": float(event.get("armor_mult", 1.0))}
	var result = Damage.apply_damage(amount, u, u, dmg_type, false, context, 1.0, CRIT_MULT)
	var applied = int(result.get("applied", 0))
	_spawn_floating_text(u.global_position, "-%d" % applied, "dmg")
	if fx and applied > 0:
		fx.shake_node(u, 0.06, 0.1)
	_spawn_action_ring(u.global_position, Color(0.9, 0.3, 0.2, 0.55))
	_log("%s sofreu %s por %d %s (HP %d/%d)" % [u.unit_name, label, applied, Damage.type_name(dmg_type), u.hp, u.max_hp])
	if u.dead:
		_on_unit_died(u)

func _apply_status_heal(u: Unit, event: Dictionary) -> void:
	var amount = int(event.get("amount", 0))
	if amount <= 0:
		return
	var applied = u.apply_heal(amount)
	_spawn_floating_text(u.global_position, "+%d" % applied, "heal")
	_spawn_action_ring(u.global_position, Color(0.3, 1.0, 0.4, 0.65))
	_log("%s regenerou %d (HP %d/%d)" % [u.unit_name, applied, u.hp, u.max_hp])

func _process(delta: float) -> void:
	if not mission_active or mission_state.get("completed", false) or mission_state.get("failed", false):
		return
	var act: Unit = timeline.get_active_unit()

	if end_turn_btn:
		end_turn_btn.disabled = (act == null or act.team != 0)
	_update_turn_order_ui()

	if act == null:
		hover_tile.visible = false
		cover_indicator.visible = false
		_hide_los_visuals()
		_clear_aoe_preview()
		_hide_path_preview()
		if active_ring:
			active_ring.visible = false
		if active_arrow:
			active_arrow.visible = false
		if target_ring:
			target_ring.visible = false
		return

	_update_active_ring(act)
	_update_target_flash(delta)

	# Enemy turn
	if act.team == 1:
		hover_tile.visible = false
		cover_indicator.visible = false
		_hide_los_visuals()
		_clear_aoe_preview()
		_hide_path_preview()
		if target_ring and target_flash_timer <= 0.0:
			target_ring.visible = false
		if not _enemy_acted_for_turn:
			_enemy_acted_for_turn = true
			_enemy_take_turn(act)
			_check_mission_status()
		if target_flash_timer > 0.0:
			_update_target_ring(act, _flash_target_cell)
		return

	# Resolve cast if any (1-turn cast resolves on next activation)
	if act.casting:
		_resolve_cast_if_ready(act)
		_after_player_action(act)
		_refresh_hotbar(act)

	# Player hover
	_snap_hold_time = max(0.0, _snap_hold_time - delta)

	var hit = _raycast_to_board()
	if hit == null:
		hover_tile.visible = false
		cover_indicator.visible = false
		_hide_los_visuals()
		_clear_aoe_preview()
		_hide_path_preview()
		var ability_preview = _evaluate_ability_target(act, Vector2i(-999, -999))
		_refresh_ui(act, Vector2i(-999, -999), Vector2i(-999, -999), null, null, ability_preview)
		_update_target_ring_for_context(act, Vector2i(-999, -999), ability_preview)
		return

	var raw_cell: Vector2i = grid.world_to_cell(hit.position)
	if not grid.in_bounds(raw_cell.x, raw_cell.y):
		hover_tile.visible = false
		cover_indicator.visible = false
		_hide_los_visuals()
		_clear_aoe_preview()
		_hide_path_preview()
		var ability_preview2 = _evaluate_ability_target(act, Vector2i(-999, -999))
		_refresh_ui(act, Vector2i(-999, -999), Vector2i(-999, -999), null, null, ability_preview2)
		_update_target_ring_for_context(act, Vector2i(-999, -999), ability_preview2)
		return
	var snapped_cell = _compute_snap_cell(act, raw_cell)
	_hover_snap = snapped_cell
	var move_cell = snapped_cell if _reach_cost.has(snapped_cell) else Vector2i(-999, -999)
	var target_cell = raw_cell

	var cover_info = null
	if move_cell.x >= 0:
		var threat = _nearest_enemy_to(move_cell)
		if threat != null:
			cover_info = LOS.cover_vs_attacker(grid, move_cell, threat.cell)
			_draw_cover_indicator(move_cell, cover_info)
		else:
			cover_indicator.visible = false
	else:
		cover_indicator.visible = false

	var enemy = _unit_at_cell(target_cell, 1)
	var shot_preview = null
	if enemy != null:
		var dist = abs(act.cell.x - enemy.cell.x) + abs(act.cell.y - enemy.cell.y)
		var is_melee = dist <= 1
		var base_dmg = _get_base_attack_damage(act, is_melee)
		var ctx = {"melee": is_melee, "base_dmg": base_dmg, "dmg_type": Damage.DmgType.PIERCING}
		shot_preview = _compute_shot_preview(act, enemy, ctx)
		_update_los_visuals_for_shot(act, enemy)
	else:
		_hide_los_visuals()

	_update_aoe_preview(target_cell, act)
	_update_path_preview(act, move_cell)
	var ability_preview3 = _evaluate_ability_target(act, target_cell)
	_update_hover_ring(act, move_cell, target_cell, enemy, shot_preview, ability_preview3)
	_refresh_ui(act, move_cell, target_cell, cover_info if move_cell.x >= 0 else null, shot_preview, ability_preview3)
	_update_target_ring_for_context(act, target_cell, ability_preview3)

func _unhandled_input(event: InputEvent) -> void:
	if not mission_active or mission_state.get("completed", false) or mission_state.get("failed", false):
		return
	var act: Unit = timeline.get_active_unit()
	if act == null or act.team != 0:
		return

	# Hotbar keys
	if event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_Q: _select_hotbar(act, "Q")
			KEY_W: _select_hotbar(act, "W")
			KEY_E: _select_hotbar(act, "E")
			KEY_R: _select_hotbar(act, "R")
			KEY_F1:
				DEBUG_LOGS = not DEBUG_LOGS
				_log("DEBUG LOGS: %s" % ("ON" if DEBUG_LOGS else "OFF"))
			KEY_0, KEY_ESCAPE:
				action_mode = ActionMode.MOVE
				_selected_ability = {}
				_clear_aoe_preview()
				_clear_target_overlay()
				_refresh_hotbar(act)
				return

	# Right click: overwatch toggle
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_RIGHT:
		if act.overwatch:
			act.overwatch = false
			_refresh_hotbar(act)
			return
		if act.spend_pa(SHOOT_COST):
			act.overwatch = true
			act.pa = 0
			_refresh_hotbar(act)
		return

	# Left click
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		if not _reach_cost.has(_hover_snap):
			return

		# Ability mode
		if action_mode == ActionMode.ABILITY and not _selected_ability.is_empty():
			_execute_selected_ability(act, _hover_snap)
			_after_player_action(act)
			_refresh_hotbar(act)
			return

		# Shoot mode (optional: you can set action_mode = SHOOT elsewhere)
		if action_mode == ActionMode.SHOOT:
			var enemy = _unit_at_cell(_hover_snap, 1)
			if enemy == null:
				return
			if _manhattan(act.cell, enemy.cell) <= 1:
				_try_melee_attack(act, enemy, true)
			else:
				_try_attack(act, enemy, true)
			_after_player_action(act)
			return

		# Move default (attack if clicking enemy)
		var enemy2 = _unit_at_cell(_hover_snap, 1)
		if enemy2 != null:
			if _manhattan(act.cell, enemy2.cell) <= 1:
				_try_melee_attack(act, enemy2, true)
			else:
				_try_attack(act, enemy2, true)
			_after_player_action(act)
			return

		_try_move_with_overwatch_triggers(act, _hover_snap)
		_after_player_action(act)

func _select_hotbar(act: Unit, key: String) -> void:
	_selected_ability = {}
	for a in act.abilities:
		if String(a.get("hotkey", "")) == key:
			_selected_ability = a
			break
	action_mode = ActionMode.ABILITY if not _selected_ability.is_empty() else ActionMode.MOVE
	_refresh_hotbar(act)
	_build_target_overlay_for_ability(act, _selected_ability)

func _execute_selected_ability(act: Unit, cell: Vector2i) -> void:
	var a := _selected_ability
	if a.is_empty():
		return

	var ability_name := String(a.get("name", ""))
	var cost := int(a.get("cost_pa", 0))
	var cd := int(a.get("cooldown", 0))
	var target_mode := int(a.get("target_mode", Abilities.TargetMode.CELL))
	var r := int(a.get("range", 0))

	# cooldown / PA
	if act.cd_left(ability_name) > 0:
		return
	if act.pa < cost:
		return

	# range check (manhattan)
	if r > 0:
		if abs(cell.x - act.cell.x) + abs(cell.y - act.cell.y) > r:
			return

	# resolve target
	match target_mode:
		Abilities.TargetMode.CELL:
			_cast_ability_on_cell(act, a, cell)
		Abilities.TargetMode.UNIT:
			var tgt: Unit = _unit_at_cell(cell, 0)
			if tgt == null:
				tgt = _unit_at_cell(cell, 1)
			if tgt == null or not _is_valid_ability_target_unit(act, a, tgt):
				return
			_cast_ability_on_unit(act, a, tgt)
		Abilities.TargetMode.SELF:
			_cast_ability_on_unit(act, a, act)

	# spend + cd
	act.pa -= cost
	if cd > 0:
		act.set_cd(ability_name, cd)

func _cast_ability_on_cell(caster: Unit, a: Dictionary, cell: Vector2i) -> void:
	var cast_time = int(a.get("cast_time", 0))
	if cast_time > 0:
		caster.casting = true
		caster.casting_ability = a
		caster.casting_target_cell = cell
		caster.casting_target_unit_id = 0
		_log("%s começou a conjurar %s..." % [caster.unit_name, String(a.get("name",""))])
		caster.pa = 0
		return

	_apply_ability_effects_on_cell(caster, a, cell)
	_pulse_active_marker()

func _apply_ability_effects_on_cell(caster: Unit, a: Dictionary, cell: Vector2i) -> void:
	var effects = _ability_effects(a)
	for effect in effects:
		var etype = String(effect.get("type", ""))
		if etype == "dash":
			_flash_target_at_cell(cell)
			_try_move_with_overwatch_triggers(caster, cell)
		elif etype == "aoe":
			_flash_target_at_cell(cell)
			_update_unit_facing(caster, caster.cell, cell)
			_apply_aoe_effect(caster, a, effect, cell)
			_rebuild_obstacles_visual()

func _cast_ability_on_unit(caster: Unit, a: Dictionary, target: Unit) -> void:
	_update_unit_facing(caster, caster.cell, target.cell)

	var cast_time = int(a.get("cast_time", 0))
	if cast_time > 0:
		caster.casting = true
		caster.casting_ability = a
		caster.casting_target_cell = target.cell
		caster.casting_target_unit_id = target.get_instance_id()
		_log("%s começou a conjurar %s..." % [caster.unit_name, String(a.get("name",""))])
		caster.pa = 0
		return

	_apply_ability_effects_on_unit(caster, target, a)
	_pulse_active_marker()

func _resolve_cast_if_ready(caster: Unit) -> void:
	var a = caster.casting_ability
	if a.is_empty():
		caster.casting = false
		return

	var target_id = caster.casting_target_unit_id
	if target_id == 0:
		var target_cell = caster.casting_target_cell
		caster.casting = false
		caster.casting_ability = {}
		if target_cell.x < 0:
			_log("%s concluiu a conjuração, mas o alvo não existe mais." % caster.unit_name)
			return
		_apply_ability_effects_on_cell(caster, a, target_cell)
		_pulse_active_marker()
		return
	var target: Unit = null
	for u in player_units:
		if u.get_instance_id() == target_id:
			target = u
			break
	for e in enemy_units:
		if e.get_instance_id() == target_id:
			target = e
			break

	caster.casting = false
	caster.casting_ability = {}

	if target == null or target.dead:
		_log("%s concluiu a conjuração, mas o alvo não existe mais." % caster.unit_name)
		return

	_apply_ability_effects_on_unit(caster, target, a)
	_pulse_active_marker()

func _context_from_ability(a: Dictionary) -> Dictionary:
	var tags: Array = a.get("tags", [])
	var is_melee = tags.has("MELEE")
	return {
		"hit_bonus": int(a.get("hit_bonus", 0)),
		"crit_bonus": int(a.get("crit_bonus", 0)),
		"tags": tags,
		"melee": is_melee
	}

func _ability_effects(a: Dictionary) -> Array:
	var effects: Array = a.get("effects", [])
	return effects

func _ability_damage_amount(a: Dictionary) -> int:
	var total = int(a.get("dmg", 0))
	for effect in _ability_effects(a):
		if String(effect.get("type", "")) == "damage":
			total += int(effect.get("amount", 0))
	return total

func _ability_primary_damage_type(a: Dictionary) -> int:
	for effect in _ability_effects(a):
		if String(effect.get("type", "")) == "damage":
			return int(effect.get("dmg_type", a.get("dmg_type", Damage.DmgType.PIERCING)))
	return int(a.get("dmg_type", Damage.DmgType.PIERCING))

func _ability_has_effect(a: Dictionary, effect_type: String) -> bool:
	for effect in _ability_effects(a):
		if String(effect.get("type", "")) == effect_type:
			return true
	return false

func _ability_aoe_radius(a: Dictionary) -> int:
	for effect in _ability_effects(a):
		if String(effect.get("type", "")) == "aoe":
			return int(effect.get("radius", a.get("aoe_radius", 0)))
	return int(a.get("aoe_radius", 0))

func _apply_ability_effects_on_unit(caster: Unit, target: Unit, a: Dictionary) -> void:
	if target == null or target.dead:
		return
	var effects = _ability_effects(a)
	var hit_success = false
	for effect in effects:
		var etype = String(effect.get("type", ""))
		if etype == "damage":
			var effect_dmg = int(effect.get("amount", 0))
			if effect_dmg <= 0:
				continue
			_flash_target_at_cell(target.cell)
			_spawn_action_ring(target.global_position, Color(0.9, 0.4, 0.2, 0.65))
			var dmg_type = int(effect.get("dmg_type", Damage.DmgType.PIERCING))
			var ctx = _context_from_ability(a)
			if effect.has("hit_bonus"):
				ctx["hit_bonus"] = int(effect.get("hit_bonus", 0))
			if effect.has("crit_bonus"):
				ctx["crit_bonus"] = int(effect.get("crit_bonus", 0))
			if effect.has("true_damage"):
				ctx["true_damage"] = bool(effect.get("true_damage", false))
			if effect.has("armor_mult"):
				ctx["armor_mult"] = float(effect.get("armor_mult", 1.0))
			var result = _resolve_attack(caster, target, effect_dmg, dmg_type, ctx)
			if result.get("result", "") in ["HIT", "CRIT"]:
				hit_success = true
		elif etype == "heal":
			var amt = int(effect.get("amount", 0))
			if amt <= 0:
				continue
			var applied = target.apply_heal(amt)
			_flash_target_at_cell(target.cell)
			_spawn_floating_text(target.global_position, "+%d" % applied, "heal")
			_spawn_action_ring(target.global_position, Color(0.3, 1.0, 0.4, 0.65))
			_log("%s curou %s (+%d)" % [caster.unit_name, target.unit_name, applied])
		elif etype == "apply_status":
			_apply_status_effect(caster, target, effect, hit_success)

	var base_dmg = int(a.get("dmg", 0))
	if base_dmg > 0:
		var dmg_type2 = int(a.get("dmg_type", Damage.DmgType.PIERCING))
		var ctx2 = _context_from_ability(a)
		var res = _resolve_attack(caster, target, base_dmg, dmg_type2, ctx2)
		if res.get("result", "") in ["HIT", "CRIT"]:
			hit_success = true

	var status_id = String(a.get("status_id", ""))
	if status_id != "":
		var effect2 = {
			"name": status_id,
			"turns": int(a.get("status_duration", 1)),
			"potency": float(a.get("status_potency", 0.0)),
			"stacks": int(a.get("status_stacks", 1)),
			"flags": a.get("status_flags", {}),
			"on_hit": base_dmg > 0
		}
		if a.has("status_alt_id") and _should_use_alt_status(a, target):
			effect2["name"] = String(a.get("status_alt_id", status_id))
			effect2["potency"] = float(a.get("status_alt_potency", effect2["potency"]))
		_apply_status_effect(caster, target, effect2, hit_success)

func _apply_status_effect(caster: Unit, target: Unit, effect: Dictionary, hit_success: bool) -> void:
	var status_name = String(effect.get("name", "")).to_upper()
	if status_name == "":
		return
	if bool(effect.get("on_hit", false)) and not hit_success:
		return
	var chance = float(effect.get("chance", 1.0))
	if chance <= 0.0:
		return
	if chance < 1.0 and randf() > chance:
		return
	if status_name in ["STUN", "BLEED", "SLOW", "ROOT", "BURN", "VULNERABLE"]:
		var caster_power = caster.will
		if status_name in ["BLEED", "SLOW", "ROOT"]:
			caster_power = caster.dex
		if target.status_save_check(status_name, caster_power):
			_log("%s resistiu %s!" % [target.unit_name, status_name])
			_spawn_floating_text(target.global_position, "RESIST!", "resist")
			return

	var turns = int(effect.get("turns", 1))
	var stacks = max(1, int(effect.get("stacks", 1)))
	var potency = float(effect.get("potency", 0.0))
	var flags = effect.get("flags", effect.get("params", {}))
	var final_turns = target.compute_applied_duration(status_name, turns)
	var final_potency = target.compute_applied_potency(status_name, potency)
	target.add_status(status_name, final_turns, final_potency, stacks, flags, caster.get_instance_id())
	_log("%s aplicou %s em %s (%dT | p:%.2f)" % [caster.unit_name, status_name, target.unit_name, final_turns, final_potency])
	_spawn_floating_text(target.global_position, "%s!" % status_name, "status")
	_update_status_ui(target)

func _on_end_turn_pressed() -> void:
	var act: Unit = timeline.get_active_unit()
	if act == null or act.team != 0:
		return
	act.pa = 0

func _after_player_action(act: Unit) -> void:
	_reach_cost = Pathfinding.reachable_with_pa(grid, act.cell, act.pa, act)
	_build_reach_overlay(_reach_cost)
	if action_mode == ActionMode.ABILITY:
		_build_target_overlay_for_ability(act, _selected_ability)
	_check_mission_status()

# ---------------- UI ----------------

func _ensure_hotbar_ui() -> void:
	var ui = get_node_or_null("../UI")
	if ui == null:
		return

	_hotbar_root = ui.get_node_or_null("Hotbar") as Control
	if _hotbar_root == null:
		_hotbar_root = Control.new()
		_hotbar_root.name = "Hotbar"
		_hotbar_root.anchor_left = 0.0
		_hotbar_root.anchor_right = 0.0
		_hotbar_root.anchor_top = 1.0
		_hotbar_root.anchor_bottom = 1.0
		_hotbar_root.offset_left = 12
		_hotbar_root.offset_right = 420
		_hotbar_root.offset_top = -64
		_hotbar_root.offset_bottom = -12
		ui.add_child(_hotbar_root)

	_hotbar_labels.clear()
	var keys = ["Q","W","E","R"]
	for i in range(4):
		var l = Label.new()
		l.position = Vector2(8 + i*100, 0)
		l.size = Vector2(96, 56)
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.text = "%s: -" % keys[i]
		_hotbar_root.add_child(l)
		_hotbar_labels.append(l)

func _refresh_hotbar(act: Unit) -> void:
	if _hotbar_labels.is_empty():
		return
	var keys = ["Q","W","E","R"]
	for i in range(4):
		var key = keys[i]
		var txt = "%s: -" % key
		for a in act.abilities:
			if String(a.get("hotkey","")) == key:
				var nm = String(a.get("name",""))
				var cost = int(a.get("cost_pa",0))
				var cd = act.cd_left(nm)
				txt = "%s %s (%dPA)" % [key, nm, cost]
				if cd > 0:
					txt += "\nCD:%d" % cd
				if action_mode == ActionMode.ABILITY and not _selected_ability.is_empty() and String(_selected_ability.get("hotkey","")) == key:
					txt += "\n[SELECTED]"
				break
		_hotbar_labels[i].text = txt

func _refresh_ui(u: Unit, move_cell: Vector2i, _target_cell: Vector2i, cover_info, shot_preview, ability_preview: Dictionary) -> void:
	var base = "Turno:%s | HP:%d/%d | PA:%d/%d | SPD:%d" % [u.unit_name, u.hp, u.max_hp, u.pa, u.pa_max, u.speed]
	var status_txt = u.get_status_summary()
	if status_txt != "":
		base += " | STATUS:%s" % status_txt
	if u.overwatch:
		base += " | OVERWATCH"

	var move_cost = int(_reach_cost.get(move_cell, -1)) if move_cell.x >= 0 else -1
	var cover_txt = "Cover:NONE"
	if cover_info != null:
		cover_txt = "Cover:%s(%s)" % [cover_info.type, cover_info.dir_name]

	if move_cell.x < 0:
		ui_label.text = base
	else:
		var zoc_warn = " | OA RISK" if _hover_path_risky else ""
		ui_label.text = "%s | Mover:%dPA%s | %s" % [base, move_cost, zoc_warn, cover_txt]

	var aim_lines: Array[String] = []
	if shot_preview != null:
		var range_ok = shot_preview.dist <= shot_preview.max_range
		var los_txt = "LOS" if shot_preview.has_los else "SEM LOS"
		var cover_type = "NONE"
		if shot_preview.cover != null:
			cover_type = String(shot_preview.cover.type)
		var flank_txt = String(shot_preview.flank)
		var flank_bonus = int(shot_preview.flank_bonus)
		var high_txt = int(shot_preview.high_bonus)
		var atk_type = String(shot_preview.attack_type)
		aim_lines.append("Hit:%d%% | %s | %s | Range:%.1f/%.1f | Cover:%s | High:%+d" % [
			shot_preview.hit,
			los_txt,
			atk_type,
			shot_preview.dist,
			shot_preview.max_range,
			cover_type,
			high_txt
		])
		if shot_preview.has("dmg_est"):
			var dmg_est: Dictionary = shot_preview.dmg_est
			var dmg_txt = "Dmg:%d-%d" % [int(dmg_est.get("min", 0)), int(dmg_est.get("max", 0))]
			if int(dmg_est.get("crit_min", 0)) > 0:
				dmg_txt += " | Crit:%d-%d (%.0f%%)" % [
					int(dmg_est.get("crit_min", 0)),
					int(dmg_est.get("crit_max", 0)),
					float(dmg_est.get("crit_chance", 0.0))
				]
			aim_lines.append(dmg_txt)
		if flank_bonus > 0:
			aim_lines.append("Flanco:%s (+%d hit)" % [flank_txt, flank_bonus])
		if shot_preview.get("backstab", false):
			aim_lines.append("Backstab:+25% dmg")
		if not shot_preview.has_los:
			aim_lines.append("SEM LOS")
		elif not range_ok:
			aim_lines.append("FORA DO ALCANCE")

	if action_mode == ActionMode.ABILITY and not _selected_ability.is_empty():
		var ability_name = String(_selected_ability.get("name", ""))
		var cost = int(_selected_ability.get("cost_pa", 0))
		var cd = u.cd_left(ability_name)
		var rng = int(_selected_ability.get("range", 0))
		var tm = int(_selected_ability.get("target_mode", Abilities.TargetMode.CELL))
		var tm_txt = _ability_target_mode_label(tm)
		aim_lines.append("Ability:%s | Custo:%dPA | CD:%d | Alcance:%d | Alvo:%s" % [ability_name, cost, cd, rng, tm_txt])
		var reason = String(ability_preview.get("reason", ""))
		if reason != "":
			aim_lines.append(reason)
		if ability_preview.has("dmg_est"):
			var ad: Dictionary = ability_preview.dmg_est
			var dmg_txt2 = "Dano:%d-%d" % [int(ad.get("min", 0)), int(ad.get("max", 0))]
			if int(ad.get("crit_min", 0)) > 0:
				dmg_txt2 += " | Crit:%d-%d (%.0f%%)" % [
					int(ad.get("crit_min", 0)),
					int(ad.get("crit_max", 0)),
					float(ad.get("crit_chance", 0.0))
				]
			aim_lines.append(dmg_txt2)

	aim_label.text = "" if aim_lines.is_empty() else "\n".join(aim_lines)

func _ensure_mission_ui() -> void:
	var ui = get_node_or_null("../UI")
	if ui == null:
		return

	mission_panel = ui.get_node_or_null("MissionPanel") as Control
	if mission_panel == null:
		mission_panel = Panel.new()
		mission_panel.name = "MissionPanel"
		mission_panel.anchor_left = 0.0
		mission_panel.anchor_right = 0.0
		mission_panel.anchor_top = 0.0
		mission_panel.anchor_bottom = 0.0
		mission_panel.offset_left = 12
		mission_panel.offset_top = 12
		mission_panel.offset_right = 360
		mission_panel.offset_bottom = 96
		ui.add_child(mission_panel)

	mission_objective_label = mission_panel.get_node_or_null("ObjectiveLabel") as Label
	if mission_objective_label == null:
		mission_objective_label = Label.new()
		mission_objective_label.name = "ObjectiveLabel"
		mission_objective_label.position = Vector2(12, 8)
		mission_objective_label.size = Vector2(330, 32)
		mission_objective_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		mission_panel.add_child(mission_objective_label)

	mission_progress_label = mission_panel.get_node_or_null("ProgressLabel") as Label
	if mission_progress_label == null:
		mission_progress_label = Label.new()
		mission_progress_label.name = "ProgressLabel"
		mission_progress_label.position = Vector2(12, 44)
		mission_progress_label.size = Vector2(330, 32)
		mission_progress_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		mission_panel.add_child(mission_progress_label)

	end_screen = ui.get_node_or_null("EndScreen") as Control
	if end_screen == null:
		end_screen = Panel.new()
		end_screen.name = "EndScreen"
		end_screen.anchor_left = 0.5
		end_screen.anchor_top = 0.5
		end_screen.anchor_right = 0.5
		end_screen.anchor_bottom = 0.5
		end_screen.offset_left = -180
		end_screen.offset_top = -120
		end_screen.offset_right = 180
		end_screen.offset_bottom = 120
		end_screen.visible = false
		ui.add_child(end_screen)

	end_title_label = end_screen.get_node_or_null("TitleLabel") as Label
	if end_title_label == null:
		end_title_label = Label.new()
		end_title_label.name = "TitleLabel"
		end_title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		end_title_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		end_title_label.anchor_left = 0.5
		end_title_label.anchor_top = 0.0
		end_title_label.anchor_right = 0.5
		end_title_label.anchor_bottom = 0.0
		end_title_label.offset_left = -140
		end_title_label.offset_top = 12
		end_title_label.offset_right = 140
		end_title_label.offset_bottom = 48
		end_screen.add_child(end_title_label)

	end_reason_label = end_screen.get_node_or_null("ReasonLabel") as Label
	if end_reason_label == null:
		end_reason_label = Label.new()
		end_reason_label.name = "ReasonLabel"
		end_reason_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		end_reason_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		end_reason_label.anchor_left = 0.5
		end_reason_label.anchor_top = 0.0
		end_reason_label.anchor_right = 0.5
		end_reason_label.anchor_bottom = 0.0
		end_reason_label.offset_left = -160
		end_reason_label.offset_top = 52
		end_reason_label.offset_right = 160
		end_reason_label.offset_bottom = 92
		end_reason_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		end_screen.add_child(end_reason_label)

	restart_button = end_screen.get_node_or_null("RestartButton") as Button
	if restart_button == null:
		restart_button = Button.new()
		restart_button.name = "RestartButton"
		restart_button.text = "Reiniciar"
		restart_button.anchor_left = 0.5
		restart_button.anchor_top = 0.0
		restart_button.anchor_right = 0.5
		restart_button.anchor_bottom = 0.0
		restart_button.offset_left = -70
		restart_button.offset_top = 98
		restart_button.offset_right = 70
		restart_button.offset_bottom = 130
		end_screen.add_child(restart_button)

func _update_mission_ui() -> void:
	if mission_objective_label == null or mission_progress_label == null:
		return
	var objective = mission_objective_text
	if objective.is_empty():
		match mission_objective_type:
			"KILL_ALL":
				objective = "Elimine todos os inimigos."
			"EXTRACT":
				objective = "Chegue no ponto de extração."
			"SURVIVE":
				objective = "Proteja o aliado por %d turnos." % mission_turn_limit
			_:
				objective = "..."
	mission_objective_label.text = "Objetivo: %s" % objective

	var progress = ""
	match mission_objective_type:
		"KILL_ALL":
			progress = "Inimigos restantes: %d" % enemy_units.size()
		"EXTRACT":
			var extracted = 0
			for u in player_units:
				if u.cell == mission_extract_cell:
					extracted += 1
			progress = "Extração: %d/%d" % [extracted, max(1, player_units.size())]
		"SURVIVE":
			progress = "Turnos: %d/%d" % [int(mission_state.get("turns", 0)), mission_turn_limit]
		_:
			progress = ""
	mission_progress_label.text = progress

func _show_end_screen(title: String, detail: String = "") -> void:
	if end_screen:
		end_screen.visible = true
	if end_title_label:
		end_title_label.text = title
	if end_reason_label:
		end_reason_label.text = detail

# ---------------- Raycast ----------------

func _raycast_to_board():
	if _cam == null:
		_cam = get_node_or_null("../CameraRig/Camera3D") as Camera3D
	if _cam == null:
		_cam = get_viewport().get_camera_3d()
	if _cam == null:
		if not _missing_cam_logged:
			_missing_cam_logged = true
			_log("Aviso: câmera não encontrada para raycast.")
		return null

	var mp = get_viewport().get_mouse_position()
	var from = _cam.project_ray_origin(mp)
	var dir = _cam.project_ray_normal(mp)
	var to = from + dir * 200.0

	var space = get_world_3d().direct_space_state
	var query = PhysicsRayQueryParameters3D.create(from, to)
	var res = space.intersect_ray(query)
	if res.is_empty():
		return null
	return res


# ---------------- Units & movement ----------------

func _unit_at_cell(c: Vector2i, team_id: int) -> Unit:
	var arr = enemy_units if team_id == 1 else player_units
	for u in arr:
		if u.cell == c:
			return u
	return null

func _get_zoc_cells(u: Unit) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	if u == null or u.dead:
		return out
	var r = 1 + u.get_melee_range_bonus()
	for dx in range(-r, r + 1):
		for dy in range(-r, r + 1):
			if abs(dx) + abs(dy) > r:
				continue
			if dx == 0 and dy == 0:
				continue
			var c = u.cell + Vector2i(dx, dy)
			if grid.in_bounds(c.x, c.y):
				out.append(c)
	return out

func _is_in_enemy_zoc(cell: Vector2i, team: int) -> bool:
	var enemies = enemy_units if team == 0 else player_units
	for e in enemies:
		if e == null or e.dead:
			continue
		if _get_zoc_cells(e).has(cell):
			return true
	return false

func _zoc_attackers_for_step(mover: Unit, from: Vector2i, to: Vector2i) -> Array[Unit]:
	var out: Array[Unit] = []
	if mover == null:
		return out
	var enemies = enemy_units if mover.team == 0 else player_units
	for e in enemies:
		if e == null or e.dead:
			continue
		var r = 1 + e.get_melee_range_bonus()
		var dist_from = abs(e.cell.x - from.x) + abs(e.cell.y - from.y)
		var dist_to = abs(e.cell.x - to.x) + abs(e.cell.y - to.y)
		var leaving = dist_from <= r and dist_to > r
		if not leaving:
			continue
		if not _can_opportunity_attack(e):
			continue
		out.append(e)
	return out

func _try_move_with_overwatch_triggers(u: Unit, dest: Vector2i) -> void:
	if u.get_move_multiplier() <= 0.0:
		_log("%s está enraizado e não pode se mover." % u.unit_name)
		return
	_flash_target_at_cell(dest)
	var path = Pathfinding.find_path(grid, u.cell, dest, u)
	if path.is_empty():
		return
	var moved = false
	for i in range(1, path.size()):
		if u.pa <= 0:
			break
		var step: Vector2i = path[i]
		var step_cost = _step_move_cost(u, u.cell, step)
		if step_cost <= 0 or step_cost >= INF:
			break
		var attackers = _zoc_attackers_for_step(u, u.cell, step)
		for atk in attackers:
			_try_opportunity_attack(atk, u)
			if u.dead:
				return
		if not u.spend_pa(step_cost):
			break
		_update_unit_facing(u, u.cell, step)
		u.cell = step
		u.position = grid.cell_to_world(step.x, step.y)
		moved = true
		_trigger_overwatch_on_movement(u)
	if moved:
		_pulse_active_marker()

# ---------------- Damage helpers ----------------

func _get_base_attack_damage(attacker: Unit, melee: bool) -> int:
	if attacker == null:
		return 1
	if melee:
		return max(1, attacker.get_weapon_dmg() + 4 + int(attacker.dex * 0.5) + attacker.get_melee_dmg_bonus())
	return max(1, attacker.get_weapon_dmg() + 5 + int(attacker.dex * 0.5))

func _apply_damage_with_type(raw: int, armor: int, dmg_type: int) -> int:
	var eff_armor := float(armor)
	match dmg_type:
		Damage.DmgType.PIERCING: eff_armor *= 0.75
		Damage.DmgType.MELTING: eff_armor *= 0.50
		Damage.DmgType.EXPLOSIVE: eff_armor *= 0.85
		_: pass
	return Damage.apply_armor(raw, int(round(eff_armor)))

func _compute_damage_detail(base: int, _attacker: Unit, defender: Unit, dmg_type: int, crit: bool, context: Dictionary, variance_mult: float) -> Dictionary:
	return Damage.compute_detail(base, _attacker, defender, dmg_type, crit, context, variance_mult, CRIT_MULT)

func _compute_final_damage(base: int, attacker: Unit, defender: Unit, dmg_type: int, crit: bool, context: Dictionary) -> int:
	var detail = _compute_damage_detail(base, attacker, defender, dmg_type, crit, context, 1.0)
	return int(detail.final)

func _crit_chance(attacker: Unit, defender: Unit, context: Dictionary) -> float:
	var base = 10.0 + float(attacker.dex - defender.agi) * 0.5
	base += float(context.get("crit_bonus", 0))
	return clamp(base, 5.0, 30.0)

func _estimate_damage_range(base: int, attacker: Unit, defender: Unit, dmg_type: int, context: Dictionary) -> Dictionary:
	var preview_range = Damage.compute_preview(base, attacker, defender, dmg_type, context, DAMAGE_VARIANCE_MIN, DAMAGE_VARIANCE_MAX, CRIT_MULT)
	return {
		"min": int(preview_range.get("min", 0)),
		"max": int(preview_range.get("max", 0)),
		"crit_min": int(preview_range.get("crit_min", 0)),
		"crit_max": int(preview_range.get("crit_max", 0)),
		"crit_chance": _crit_chance(attacker, defender, context)
	}

func _try_melee_attack(attacker: Unit, defender: Unit, spend_cost: bool) -> void:
	if attacker == null or defender == null:
		return
	if _manhattan(attacker.cell, defender.cell) > 1:
		return
	if spend_cost and not attacker.spend_pa(MELEE_COST):
		return

	_update_unit_facing(attacker, attacker.cell, defender.cell)
	var raw_dmg = _get_base_attack_damage(attacker, true)
	_resolve_attack(attacker, defender, raw_dmg, Damage.DmgType.PIERCING, {
		"tags": ["MELEE"],
		"melee": true,
		"skip_range_los": true
	})
	_pulse_active_marker()

func _try_attack(attacker: Unit, defender: Unit, spend_cost: bool) -> void:
	if spend_cost and not attacker.spend_pa(SHOOT_COST):
		return

	_update_unit_facing(attacker, attacker.cell, defender.cell)
	var raw_dmg = _get_base_attack_damage(attacker, false)
	_resolve_attack(attacker, defender, raw_dmg, Damage.DmgType.PIERCING, {"tags": ["RANGED"]})
	_pulse_active_marker()

func _try_opportunity_attack(attacker: Unit, defender: Unit) -> void:
	if attacker == null or defender == null:
		return
	if attacker.dead or attacker.is_stunned():
		return
	if attacker.oa_used_this_turn:
		return
	if attacker.pa < OA_COST:
		return
	var melee_range = 1 + attacker.get_melee_range_bonus()
	if _manhattan(attacker.cell, defender.cell) > melee_range:
		return
	if not attacker.spend_pa(OA_COST):
		return

	attacker.oa_used_this_turn = true
	_update_unit_facing(attacker, attacker.cell, defender.cell)
	var raw_dmg = _get_base_attack_damage(attacker, true)
	raw_dmg = int(round(float(raw_dmg) * OA_DMG_MULT))
	_log("OA! %s -> %s" % [attacker.unit_name, defender.unit_name])
	_spawn_floating_text(defender.global_position, "OA!", "status")
	_resolve_attack(attacker, defender, raw_dmg, Damage.DmgType.PIERCING, {
		"tags": ["MELEE", "OA"],
		"melee": true,
		"ignore_cover": true,
		"hit_bonus": -OA_HIT_PENALTY,
		"skip_range_los": true
	})

func _can_opportunity_attack(attacker: Unit) -> bool:
	if attacker == null or attacker.dead or attacker.is_stunned():
		return false
	if attacker.oa_used_this_turn:
		return false
	return attacker.pa >= OA_COST

func _roll_to_hit(_attacker: Unit, _defender: Unit, context: Dictionary, preview: Dictionary) -> Dictionary:
	var hit = int(context.get("override_hit", preview.get("hit", 0)))
	hit = clamp(hit, 1, 95)
	var roll = randi_range(1, 100)
	return {"hit": roll <= hit, "roll": roll, "chance": hit}

func _roll_block_or_evade(attacker: Unit, defender: Unit, _context: Dictionary) -> Dictionary:
	var block = clamp((defender.def + defender.get_def_bonus_from_status()) * 2, 0, 45)
	var evade = clamp(5 + int(round(float(defender.agi - attacker.dex) * 1.0)), 5, 25)
	var roll_block = randi_range(1, 100)
	if roll_block <= block:
		return {"result": "BLOCK", "roll": roll_block, "chance": block}
	var roll_evade = randi_range(1, 100)
	if roll_evade <= evade:
		return {"result": "EVADE", "roll": roll_evade, "chance": evade}
	return {"result": "NONE", "roll": roll_evade, "chance": evade}

func _roll_crit(attacker: Unit, defender: Unit, context: Dictionary) -> Dictionary:
	var chance = _crit_chance(attacker, defender, context)
	var roll = randf_range(0.0, 100.0)
	return {"crit": roll <= chance, "roll": roll, "chance": chance}

func _count_enemies_adjacent_to(u: Unit) -> int:
	if u == null:
		return 0
	var enemies = enemy_units if u.team == 0 else player_units
	var count = 0
	for e in enemies:
		if e == null or e.dead:
			continue
		if _manhattan(u.cell, e.cell) <= 1:
			count += 1
	return count

func _is_flanked(defender: Unit, attacker: Unit) -> bool:
	if defender == null or attacker == null:
		return false
	if _manhattan(defender.cell, attacker.cell) > 1:
		return false
	var allies = player_units if attacker.team == 0 else enemy_units
	for a in allies:
		if a == null or a.dead or a == attacker:
			continue
		if _manhattan(defender.cell, a.cell) <= 1:
			return true
	return false

func _is_backstab(defender: Unit, attacker: Unit) -> bool:
	if defender == null or attacker == null:
		return false
	if _manhattan(defender.cell, attacker.cell) > 1:
		return false
	return _count_enemies_adjacent_to(attacker) == 0

func _resolve_attack(attacker: Unit, defender: Unit, base_dmg: int, dmg_type: int, context: Dictionary) -> Dictionary:
	var ctx := context.duplicate(true)
	ctx["base_dmg"] = base_dmg
	ctx["dmg_type"] = dmg_type
	var preview = _compute_shot_preview(attacker, defender, ctx)
	if preview == null:
		return {"result": "INVALID"}
	if preview.get("backstab", false):
		ctx["damage_mult"] = float(ctx.get("damage_mult", 1.0)) * 1.25
	var skip_range = bool(context.get("skip_range_los", false))
	if not skip_range:
		if not preview.has_los or preview.dist > preview.max_range:
			return {"result": "NO_LOS", "preview": preview}
	if not bool(context.get("skip_action_ring", false)):
		_spawn_action_ring(attacker.global_position, Color(0.4, 0.8, 1.0, 0.5))

	var hit_info = _roll_to_hit(attacker, defender, context, preview)
	if not bool(context.get("force_hit", false)) and not bool(hit_info.get("hit", false)):
		_flash_target_at_cell(defender.cell)
		if fx:
			fx.spawn_tracer(attacker.global_position + Vector3(0, 0.6, 0), defender.global_position + Vector3(0, 0.6, 0))
		_spawn_floating_text(defender.global_position, "MISS", "miss")
		_spawn_action_ring(defender.global_position, Color(0.5, 0.5, 0.5, 0.5))
		_log("%s errou %s (roll %d/%d)" % [attacker.unit_name, defender.unit_name, int(hit_info.get("roll", 0)), int(hit_info.get("chance", preview.hit))])
		return {"result": "MISS", "preview": preview}

	var block_res = _roll_block_or_evade(attacker, defender, context)
	if String(block_res.get("result", "NONE")) != "NONE":
		var block_txt = "bloqueou" if String(block_res.get("result", "")) == "BLOCK" else "esquivou"
		_log("%s %s o ataque! (roll %d/%d)" % [
			defender.unit_name,
			block_txt,
			int(block_res.get("roll", 0)),
			int(block_res.get("chance", 0))
		])
		_flash_target_at_cell(defender.cell)
		if fx:
			fx.spawn_tracer(attacker.global_position + Vector3(0, 0.6, 0), defender.global_position + Vector3(0, 0.6, 0))
		var txt = "BLOCK" if String(block_res.get("result", "")) == "BLOCK" else "EVADE"
		_spawn_floating_text(defender.global_position, txt, "block")
		_spawn_action_ring(defender.global_position, Color(0.65, 0.65, 0.65, 0.55))
		return {"result": String(block_res.get("result", "")), "preview": preview}

	var crit_info = _roll_crit(attacker, defender, context)
	var crit = bool(crit_info.get("crit", false))
	var variance = randf_range(DAMAGE_VARIANCE_MIN, DAMAGE_VARIANCE_MAX)
	var result = Damage.apply_damage(base_dmg, attacker, defender, dmg_type, crit, ctx, variance, CRIT_MULT)
	var detail: Dictionary = result.get("detail", {})
	var applied = int(result.get("applied", 0))
	_flash_target_at_cell(defender.cell)
	if fx:
		fx.spawn_tracer(attacker.global_position + Vector3(0, 0.6, 0), defender.global_position + Vector3(0, 0.6, 0))
	var dmg_text = "CRIT -%d" % applied if crit else "-%d" % applied
	_spawn_floating_text(defender.global_position, dmg_text, "dmg")
	if fx and applied > 0:
		fx.shake_node(defender, 0.08, 0.12)
	_spawn_action_ring(defender.global_position, Color(1.0, 0.25, 0.2, 0.65))
	var crit_txt = " CRIT" if crit else ""
	_log("%s%s acertou %s (roll %d/%d | crit %.1f%%) por %d %s (var %.2f | armor %d | mult %.2f | HP %d/%d)" % [
		attacker.unit_name,
		crit_txt,
		defender.unit_name,
		int(hit_info.get("roll", 0)),
		int(hit_info.get("chance", preview.hit)),
		float(crit_info.get("chance", 0.0)),
		applied,
		Damage.type_name(dmg_type),
		float(variance),
		int(detail.get("armor", 0)),
		float(detail.get("mult", 1.0)),
		defender.hp,
		defender.max_hp
	])
	if defender.dead:
		_on_unit_died(defender)
	return {"result": "CRIT" if crit else "HIT", "damage": applied, "preview": preview}

func _compute_shot_preview(attacker: Unit, defender: Unit, context: Dictionary = {}, from_cell: Vector2i = Vector2i(-999, -999)):
	var att_cell = attacker.cell if from_cell.x < 0 else from_cell
	var pts = LOS.line(att_cell, defender.cell)
	var blocker = _first_blocker_cell(pts)

	var has_los = (blocker == null)
	var dist = LOS.dist3d(grid, att_cell, defender.cell)
	if bool(context.get("melee", false)):
		has_los = true
		blocker = null

	var h_att = grid.get_height(att_cell.x, att_cell.y)
	var h_def = grid.get_height(defender.cell.x, defender.cell.y)
	var dh = h_att - h_def
	var max_range = (BASE_RANGE_3D + attacker.get_weapon_range_bonus()) + max(0, dh) * RANGE_BONUS_PER_LEVEL

	var cover = LOS.cover_vs_attacker(grid, defender.cell, att_cell)
	var cover_pen = 0
	if cover.type == "HALF": cover_pen = HALF_COVER_PENALTY
	elif cover.type == "FULL": cover_pen = FULL_COVER_PENALTY

	var flanked = _is_flanked(defender, attacker)
	var backstab = _is_backstab(defender, attacker)
	var flank_bonus = 15 if flanked else 0
	var flank = "NONE"
	if backstab:
		flank = "BACKSTAB"
	elif flanked:
		flank = "FLANK"

	var high_bonus = max(0, dh) * HIGHGROUND_AIM_PER_LEVEL
	if bool(context.get("melee", false)):
		max_range = 1.0
		cover_pen = 0
	if bool(context.get("ignore_cover", false)):
		cover_pen = 0
	var hit = BASE_WEAPON_AIM + attacker.get_weapon_aim_bonus() + attacker.dex * 2 - defender.agi * 2 + high_bonus - cover_pen + flank_bonus
	if bool(context.get("melee", false)):
		hit = MELEE_AIM_BASE + attacker.get_melee_aim_bonus() + attacker.dex * 2 - defender.agi * 2 + high_bonus + flank_bonus
	hit -= attacker.get_aim_penalty()
	hit -= defender.get_def_bonus_from_status()
	hit += int(context.get("hit_bonus", 0))
	hit = clamp(hit, 1, 95)

	var dmg_est: Dictionary = {}
	if context.has("base_dmg"):
		var base_dmg = int(context.get("base_dmg", 0))
		var dmg_type = int(context.get("dmg_type", Damage.DmgType.PIERCING))
		if base_dmg > 0:
			var preview_ctx = context.duplicate(true)
			if backstab:
				preview_ctx["damage_mult"] = float(preview_ctx.get("damage_mult", 1.0)) * 1.25
			dmg_est = _estimate_damage_range(base_dmg, attacker, defender, dmg_type, preview_ctx)

	return {
		"has_los": has_los,
		"los_txt": "LOS" if has_los else "NO_LOS",
		"hit": int(hit),
		"dist": float(dist),
		"max_range": float(max_range),
		"high_bonus": int(high_bonus),
		"cover": cover,
		"blocker": blocker,
		"flank": flank,
		"flank_bonus": flank_bonus,
		"cover_pen": cover_pen,
		"backstab": backstab,
		"attack_type": "MELEE" if bool(context.get("melee", false)) else "RANGED",
		"dmg_est": dmg_est
	}

func _compute_shot_preview_from_cell(attacker: Unit, defender: Unit, from_cell: Vector2i, context: Dictionary = {}) -> Dictionary:
	return _compute_shot_preview(attacker, defender, context, from_cell)

func _cardinal_dir(from: Vector2i, to: Vector2i) -> Vector2i:
	var dx = to.x - from.x
	var dy = to.y - from.y
	if abs(dx) >= abs(dy):
		return Vector2i(1, 0) if dx > 0 else Vector2i(-1, 0)
	return Vector2i(0, 1) if dy > 0 else Vector2i(0, -1)

func _update_unit_facing(u: Unit, from_cell: Vector2i, to_cell: Vector2i) -> void:
	if u == null:
		return
	if from_cell == to_cell:
		return
	u.facing_dir = _cardinal_dir(from_cell, to_cell)

# ---------------- Cover indicator ----------------

func _draw_cover_indicator(cell: Vector2i, cover_info: Dictionary) -> void:
	if cover_info == null or cover_info.type == "NONE":
		cover_indicator.visible = false
		return
	cover_indicator.visible = true
	var wpos = grid.cell_to_world(cell.x, cell.y) + Vector3(0, 0.02, 0)
	var d: Vector2i = cover_info.dir
	cover_indicator.global_position = wpos + Vector3(d.x * 0.38, 0, d.y * 0.38)

	var rot_y = 0.0
	if cover_info.dir_name == "N": rot_y = PI
	elif cover_info.dir_name == "S": rot_y = 0.0
	elif cover_info.dir_name == "E": rot_y = -PI/2
	elif cover_info.dir_name == "W": rot_y = PI/2
	cover_indicator.rotation = Vector3(-PI/2, rot_y, 0)

# ---------------- LOS visuals ----------------

func _ensure_los_visuals() -> void:
	los_mesh_instance = MeshInstance3D.new()
	add_child(los_mesh_instance)

	los_immediate = ImmediateMesh.new()
	los_mesh_instance.mesh = los_immediate
	los_mesh_instance.visible = false

	los_mat_ok = StandardMaterial3D.new()
	los_mat_ok.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	los_mat_ok.albedo_color = Color(0.2, 1.0, 0.2, 0.9)

	los_mat_blocked = StandardMaterial3D.new()
	los_mat_blocked.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	los_mat_blocked.albedo_color = Color(1.0, 0.2, 0.2, 0.9)

	blocker_tile = MeshInstance3D.new()
	add_child(blocker_tile)
	var bq := QuadMesh.new()
	bq.size = Vector2(1.0, 1.0)
	blocker_tile.mesh = bq
	blocker_tile.visible = false
	blocker_tile.rotation = Vector3(-PI/2, 0, 0)

	blocker_ghost = MeshInstance3D.new()
	add_child(blocker_ghost)
	var box := BoxMesh.new()
	box.size = Vector3(1.0, 1.0, 1.0)
	blocker_ghost.mesh = box
	blocker_ghost.visible = false

func _hide_los_visuals() -> void:
	if los_mesh_instance:
		los_mesh_instance.visible = false
	if blocker_tile:
		blocker_tile.visible = false
	if blocker_ghost:
		blocker_ghost.visible = false

# ---------------- Objective marker ----------------

func _ensure_objective_marker() -> void:
	if extract_marker:
		return
	extract_marker = MeshInstance3D.new()
	add_child(extract_marker)
	var quad := QuadMesh.new()
	quad.size = Vector2(1.0, 1.0)
	extract_marker.mesh = quad
	extract_marker.rotation = Vector3(-PI/2, 0, 0)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color = Color(0.2, 0.6, 1.0, 0.45)
	extract_marker.material_override = mat
	extract_marker.visible = false

func _update_extract_marker() -> void:
	if extract_marker == null:
		return
	if mission_objective_type != "EXTRACT":
		extract_marker.visible = false
		return
	if grid == null:
		extract_marker.visible = false
		return
	var c = mission_extract_cell
	if not grid.in_bounds(c.x, c.y):
		extract_marker.visible = false
		return
	var wpos = grid.cell_to_world(c.x, c.y)
	extract_marker.global_position = wpos + Vector3(0, 0.02, 0)
	extract_marker.visible = true

func _first_blocker_cell(pts: Array[Vector2i]):
	if pts.size() <= 2:
		return null
	for i in range(1, pts.size() - 1):
		var c: Vector2i = pts[i]
		if grid.in_bounds(c.x, c.y) and not grid.is_walkable(c.x, c.y):
			return c
	return null

func _update_los_visuals_for_shot(attacker: Unit, defender: Unit) -> void:
	var pts = LOS.line(attacker.cell, defender.cell)
	var blocker = _first_blocker_cell(pts)
	var ok = (blocker == null)

	los_immediate.clear_surfaces()
	los_immediate.surface_begin(Mesh.PRIMITIVE_LINE_STRIP, (los_mat_ok if ok else los_mat_blocked))
	for c in pts:
		var p = grid.cell_to_world(c.x, c.y) + Vector3(0, 0.35, 0)
		los_immediate.surface_add_vertex(p)
	los_immediate.surface_end()
	los_mesh_instance.visible = true

	if blocker != null:
		var wpos = grid.cell_to_world(blocker.x, blocker.y)
		blocker_tile.visible = true
		blocker_tile.global_position = wpos + Vector3(0, 0.01, 0)

		blocker_ghost.visible = true
		blocker_ghost.global_position = wpos + Vector3(0, 0.5, 0)
	else:
		blocker_tile.visible = false
		blocker_ghost.visible = false

# ---------------- Visual overlays ----------------

func _ensure_visuals() -> void:
	reach_mmi = MultiMeshInstance3D.new()
	add_child(reach_mmi)

	reach_mm = MultiMesh.new()
	reach_mm.transform_format = MultiMesh.TRANSFORM_3D
	reach_mm.instance_count = 0
	reach_mmi.multimesh = reach_mm

	var quad := QuadMesh.new()
	quad.size = Vector2(1.0, 1.0)
	reach_mm.mesh = quad

	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color = Color(0.2, 0.9, 0.4, 0.22)
	reach_mmi.material_override = mat

	target_mmi = MultiMeshInstance3D.new()
	add_child(target_mmi)

	target_mm = MultiMesh.new()
	target_mm.transform_format = MultiMesh.TRANSFORM_3D
	target_mm.instance_count = 0
	target_mmi.multimesh = target_mm

	var tquad := QuadMesh.new()
	tquad.size = Vector2(1.0, 1.0)
	target_mm.mesh = tquad

	var tmat := StandardMaterial3D.new()
	tmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	tmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	tmat.albedo_color = Color(0.9, 0.6, 0.2, 0.22)
	target_mmi.material_override = tmat

	hover_tile = MeshInstance3D.new()
	add_child(hover_tile)
	hover_tile.mesh = _make_ring_mesh()
	_hover_ring_mat = _make_ring_material(_hover_valid_move)
	hover_tile.material_override = _hover_ring_mat
	hover_tile.visible = false
	hover_tile.rotation = Vector3(-PI/2, 0, 0)

	cover_indicator = MeshInstance3D.new()
	add_child(cover_indicator)
	var cq := QuadMesh.new()
	cq.size = Vector2(0.22, 0.5)
	cover_indicator.mesh = cq
	cover_indicator.visible = false
	cover_indicator.rotation = Vector3(-PI/2, 0, 0)

	aoe_preview_mmi = MultiMeshInstance3D.new()
	add_child(aoe_preview_mmi)

	aoe_preview_mm = MultiMesh.new()
	aoe_preview_mm.transform_format = MultiMesh.TRANSFORM_3D
	aoe_preview_mm.instance_count = 0
	aoe_preview_mmi.multimesh = aoe_preview_mm

	var aq := QuadMesh.new()
	aq.size = Vector2(1.0, 1.0)
	aoe_preview_mm.mesh = aq

	path_mesh_instance = MeshInstance3D.new()
	add_child(path_mesh_instance)
	path_immediate = ImmediateMesh.new()
	path_mesh_instance.mesh = path_immediate
	path_mesh_instance.visible = false

	path_mat_ok = StandardMaterial3D.new()
	path_mat_ok.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	path_mat_ok.albedo_color = Color(0.2, 0.9, 0.4, 0.85)

	path_mat_risky = StandardMaterial3D.new()
	path_mat_risky.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	path_mat_risky.albedo_color = Color(1.0, 0.3, 0.2, 0.85)

func _ensure_action_markers() -> void:
	if active_ring != null and target_ring != null and active_arrow != null:
		return
	active_ring = MeshInstance3D.new()
	active_ring.name = "ActiveRing"
	add_child(active_ring)
	active_ring.mesh = _make_ring_mesh()
	_active_ring_mat = _make_ring_material(Color(0.2, 0.8, 1.0, 0.6))
	active_ring.material_override = _active_ring_mat
	active_ring.visible = false
	active_ring.rotation = Vector3(-PI/2, 0, 0)

	active_arrow = MeshInstance3D.new()
	active_arrow.name = "ActiveArrow"
	add_child(active_arrow)
	active_arrow.mesh = _make_arrow_mesh()
	_active_arrow_mat = _make_ring_material(Color(0.2, 0.8, 1.0, 0.8))
	active_arrow.material_override = _active_arrow_mat
	active_arrow.visible = false

	target_ring = MeshInstance3D.new()
	target_ring.name = "TargetRing"
	add_child(target_ring)
	target_ring.mesh = _make_ring_mesh()
	_target_ring_mat = _make_ring_material(_target_ring_base_color)
	target_ring.material_override = _target_ring_mat
	target_ring.visible = false
	target_ring.rotation = Vector3(-PI/2, 0, 0)

func _make_ring_mesh() -> Mesh:
	var torus := TorusMesh.new()
	torus.outer_radius = 0.42
	torus.inner_radius = 0.375
	if torus.has_property("ring_segments"):
		torus.ring_segments = 24
		torus.radial_segments = 12
	else:
		torus.ring_sides = 24
		torus.sides = 12
	return torus

func _make_arrow_mesh() -> Mesh:
	var cone := CylinderMesh.new()
	cone.top_radius = 0.0
	cone.bottom_radius = 0.18
	cone.height = 0.45
	cone.radial_segments = 16
	return cone

func _make_ring_material(color: Color) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color = color
	mat.emission_enabled = true
	mat.emission = Color(color.r, color.g, color.b)
	return mat

func _ensure_fx() -> void:
	if fx != null:
		return
	fx = CombatFXRef.new()
	fx.name = "CombatFX"
	add_child(fx)

func _ensure_log_ui() -> void:
	var ui = get_node_or_null("../UI")
	if ui == null:
		return

	_log_panel = ui.get_node_or_null("CombatLogPanel") as Control
	if _log_panel == null:
		_log_panel = Panel.new()
		_log_panel.name = "CombatLogPanel"
		_log_panel.anchor_left = 0.0
		_log_panel.anchor_right = 0.0
		_log_panel.anchor_top = 1.0
		_log_panel.anchor_bottom = 1.0
		_log_panel.offset_left = 12
		_log_panel.offset_right = 360
		_log_panel.offset_top = -260
		_log_panel.offset_bottom = -100
		ui.add_child(_log_panel)

	_log_scroll = _log_panel.get_node_or_null("LogScroll") as ScrollContainer
	if _log_scroll == null:
		_log_scroll = ScrollContainer.new()
		_log_scroll.name = "LogScroll"
		_log_scroll.position = Vector2(6, 6)
		_log_scroll.size = Vector2(336, 150)
		_log_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		_log_panel.add_child(_log_scroll)

	_log_label = _log_scroll.get_node_or_null("LogLabel") as RichTextLabel
	if _log_label == null:
		_log_label = RichTextLabel.new()
		_log_label.name = "LogLabel"
		_log_label.fit_content = true
		_log_label.scroll_active = true
		_log_label.scroll_following = true
		_log_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		_log_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_log_scroll.add_child(_log_label)
	_update_log_ui()

func _update_log_ui() -> void:
	if _log_label == null:
		return
	_log_label.text = "\n".join(_log_buffer)
	if _log_label.get_line_count() > 0:
		_log_label.scroll_to_line(_log_label.get_line_count() - 1)

func _ensure_status_ui() -> void:
	var ui = get_node_or_null("../UI")
	if ui == null:
		return
	_status_label = ui.get_node_or_null("StatusLabel") as Label
	if _status_label == null:
		_status_label = Label.new()
		_status_label.name = "StatusLabel"
		_status_label.anchor_left = 0.0
		_status_label.anchor_right = 0.0
		_status_label.anchor_top = 1.0
		_status_label.anchor_bottom = 1.0
		_status_label.offset_left = 12
		_status_label.offset_right = 520
		_status_label.offset_top = -100
		_status_label.offset_bottom = -70
		_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		ui.add_child(_status_label)
	_update_status_ui(null)

func _update_status_ui(u: Unit) -> void:
	if _status_label == null:
		return
	if u == null:
		_status_label.text = "STATUS: -"
		return
	var summary = u.get_status_summary()
	_status_label.text = "STATUS: %s" % (summary if summary != "" else "-")

func _ensure_turn_order_ui() -> void:
	var ui = get_node_or_null("../UI")
	if ui == null:
		return
	_turn_panel = ui.get_node_or_null("TurnOrderPanel") as Control
	if _turn_panel == null:
		_turn_panel = Panel.new()
		_turn_panel.name = "TurnOrderPanel"
		_turn_panel.anchor_left = 1.0
		_turn_panel.anchor_right = 1.0
		_turn_panel.anchor_top = 0.0
		_turn_panel.anchor_bottom = 0.0
		_turn_panel.offset_left = -240
		_turn_panel.offset_right = -12
		_turn_panel.offset_top = 12
		_turn_panel.offset_bottom = 140
		ui.add_child(_turn_panel)

	_turn_label = _turn_panel.get_node_or_null("TurnOrderLabel") as Label
	if _turn_label == null:
		_turn_label = Label.new()
		_turn_label.name = "TurnOrderLabel"
		_turn_label.position = Vector2(10, 8)
		_turn_label.size = Vector2(210, 110)
		_turn_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		_turn_panel.add_child(_turn_label)
	_update_turn_order_ui()

func _update_turn_order_ui() -> void:
	if _turn_label == null or timeline == null:
		return
	if not timeline.has_method("get_turn_preview"):
		return
	var preview: Array = timeline.get_turn_preview(6)
	if preview.is_empty():
		_turn_label.text = "Ordem: -"
		return
	var lines: Array[String] = ["Ordem:"]
	for u in preview:
		if u == null:
			continue
		lines.append("%s [T%d]" % [u.unit_name, u.team])
	_turn_label.text = "\n".join(lines)

func _ability_target_mode_label(tm: int) -> String:
	match tm:
		Abilities.TargetMode.CELL:
			return "CELL"
		Abilities.TargetMode.UNIT:
			return "UNIT"
		Abilities.TargetMode.SELF:
			return "SELF"
		_:
			return "?"

func _is_valid_ability_target_unit(act: Unit, ability: Dictionary, target: Unit) -> bool:
	if act == null or target == null:
		return false
	var wants_allies = _ability_targets_allies(ability)
	if wants_allies:
		return target.team == act.team
	return target.team != act.team

func _evaluate_ability_target(act: Unit, cell: Vector2i) -> Dictionary:
	var result := {"valid": false, "reason": "", "target_mode": Abilities.TargetMode.CELL, "target_unit": null, "target_cell": cell}
	if act == null or _selected_ability.is_empty():
		return result
	if grid == null:
		return result
	var ability_name = String(_selected_ability.get("name", ""))
	var cost = int(_selected_ability.get("cost_pa", 0))
	var cd = act.cd_left(ability_name)
	var target_mode = int(_selected_ability.get("target_mode", Abilities.TargetMode.CELL))
	result.target_mode = target_mode
	if cd > 0:
		result.reason = "COOLDOWN"
		return result
	if act.pa < cost:
		result.reason = "SEM PA"
		return result

	if target_mode == Abilities.TargetMode.SELF:
		result.valid = true
		result.target_unit = act
		result.target_cell = act.cell
		return result

	if not grid.in_bounds(cell.x, cell.y):
		result.reason = "ALVO INVÁLIDO"
		return result

	var r = int(_selected_ability.get("range", 0))
	if r > 0 and abs(cell.x - act.cell.x) + abs(cell.y - act.cell.y) > r:
		result.reason = "FORA DO ALCANCE"
		return result

	if target_mode == Abilities.TargetMode.CELL:
		if _ability_has_effect(_selected_ability, "dash") and not grid.is_walkable(cell.x, cell.y):
			result.reason = "BLOQUEADO"
			return result
		result.valid = true
		return result
	if target_mode == Abilities.TargetMode.UNIT:
		var tgt = _unit_at_cell(cell, 0)
		if tgt == null:
			tgt = _unit_at_cell(cell, 1)
		if tgt == null or not _is_valid_ability_target_unit(act, _selected_ability, tgt):
			result.reason = "SEM ALVO"
			return result
		result.valid = true
		result.target_unit = tgt
		var base_dmg = _ability_damage_amount(_selected_ability)
		if base_dmg > 0:
			var dmg_type = _ability_primary_damage_type(_selected_ability)
			var ctx = _context_from_ability(_selected_ability)
			if _is_backstab(tgt, act):
				ctx["damage_mult"] = float(ctx.get("damage_mult", 1.0)) * 1.25
			result.dmg_est = _estimate_damage_range(base_dmg, act, tgt, dmg_type, ctx)
		return result

	return result

func _update_hover_ring(act: Unit, move_cell: Vector2i, target_cell: Vector2i, enemy: Unit, shot_preview, ability_preview: Dictionary) -> void:
	if hover_tile == null or _hover_ring_mat == null or grid == null:
		return
	var should_show = false
	var color = _hover_invalid
	var ring_cell = target_cell

	if enemy != null and shot_preview != null and action_mode != ActionMode.ABILITY:
		should_show = true
		var valid_shot = shot_preview.has_los and shot_preview.dist <= shot_preview.max_range
		color = _hover_valid_shoot if valid_shot else _hover_blocked
		ring_cell = target_cell
	else:
		match action_mode:
			ActionMode.MOVE:
				if move_cell.x >= 0:
					should_show = true
					color = _hover_valid_move
					ring_cell = move_cell
				elif grid.in_bounds(target_cell.x, target_cell.y):
					should_show = true
					color = _hover_invalid
			ActionMode.SHOOT:
				if enemy != null and shot_preview != null:
					should_show = true
					var valid = shot_preview.has_los and shot_preview.dist <= shot_preview.max_range
					color = _hover_valid_shoot if valid else _hover_blocked
				elif grid.in_bounds(target_cell.x, target_cell.y):
					should_show = true
					color = _hover_invalid
			ActionMode.ABILITY:
				if ability_preview.get("valid", false):
					should_show = true
					color = _hover_valid_ability
					if ability_preview.get("target_mode", Abilities.TargetMode.CELL) == Abilities.TargetMode.SELF:
						ring_cell = act.cell
				elif grid.in_bounds(target_cell.x, target_cell.y):
					should_show = true
					color = _hover_invalid

	_hover_ring_mat.albedo_color = color
	_hover_ring_mat.emission = Color(color.r, color.g, color.b)
	if not should_show:
		hover_tile.visible = false
		return

	var wpos = grid.cell_to_world(ring_cell.x, ring_cell.y)
	hover_tile.global_position = wpos + Vector3(0, 0.02, 0)
	hover_tile.rotation = Vector3(-PI/2, 0, 0)
	hover_tile.visible = true

func _update_target_ring_for_context(act: Unit, target_cell: Vector2i, ability_preview: Dictionary) -> void:
	if target_ring == null or _target_ring_mat == null or grid == null:
		return
	if act == null:
		target_ring.visible = false
		return
	if target_flash_timer > 0.0:
		_update_target_ring(act, _flash_target_cell)
		return
	if action_mode == ActionMode.ABILITY and not _selected_ability.is_empty():
		if not ability_preview.get("valid", false):
			target_ring.visible = false
			return
		var color = _hover_valid_ability
		_target_ring_mat.albedo_color = color
		_target_ring_mat.emission = Color(color.r, color.g, color.b)
		var tm = int(ability_preview.get("target_mode", Abilities.TargetMode.CELL))
		if tm == Abilities.TargetMode.SELF:
			var pos = grid.cell_to_world(act.cell.x, act.cell.y)
			target_ring.global_position = pos + Vector3(0, 0.02, 0)
		elif tm == Abilities.TargetMode.UNIT and ability_preview.get("target_unit", null) != null:
			var u: Unit = ability_preview.get("target_unit", null)
			var pos_u = grid.cell_to_world(u.cell.x, u.cell.y)
			target_ring.global_position = pos_u + Vector3(0, 0.02, 0)
		else:
			var wpos = grid.cell_to_world(target_cell.x, target_cell.y)
			target_ring.global_position = wpos + Vector3(0, 0.02, 0)
		target_ring.visible = true
		return

	var enemy = _unit_at_cell(target_cell, 1)
	var ally = _unit_at_cell(target_cell, 0)
	var target_unit = enemy if enemy != null else ally
	if target_unit == null:
		target_ring.visible = false
		return
	var color2 = _target_ring_base_color
	_target_ring_mat.albedo_color = color2
	_target_ring_mat.emission = Color(color2.r, color2.g, color2.b)
	target_ring.global_position = target_unit.global_position + Vector3(0, 0.02, 0)
	target_ring.visible = true

func _spawn_action_ring(world_pos: Vector3, color: Color) -> void:
	var ring := MeshInstance3D.new()
	ring.mesh = _make_ring_mesh()
	var mat := _make_ring_material(color)
	ring.material_override = mat
	ring.rotation = Vector3(-PI/2, 0, 0)
	ring.global_position = world_pos + Vector3(0, 0.03, 0)
	ring.scale = Vector3(0.6, 1.0, 0.6)
	add_child(ring)

	var tween = create_tween()
	tween.tween_property(ring, "scale", Vector3(1.4, 1.0, 1.4), 0.35).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(mat, "albedo_color", Color(color.r, color.g, color.b, 0.0), 0.35)
	tween.finished.connect(func():
		if is_instance_valid(ring):
			ring.queue_free()
	)

func _pulse_active_marker() -> void:
	if active_ring == null or active_arrow == null:
		return
	var tween = create_tween()
	active_ring.scale = Vector3.ONE
	active_arrow.scale = Vector3.ONE
	tween.tween_property(active_ring, "scale", Vector3(1.15, 1.0, 1.15), 0.12).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(active_arrow, "scale", Vector3(1.2, 1.2, 1.2), 0.12).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tween.tween_property(active_ring, "scale", Vector3.ONE, 0.18).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	tween.parallel().tween_property(active_arrow, "scale", Vector3.ONE, 0.18).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)

func _update_active_ring(unit: Unit) -> void:
	if active_ring == null or active_arrow == null or unit == null:
		return
	var ring_color = Color(0.2, 0.8, 1.0, 0.65)
	if unit.team == 1:
		ring_color = Color(1.0, 0.2, 0.2, 0.65)
	_active_ring_mat.albedo_color = ring_color
	_active_ring_mat.emission = Color(ring_color.r, ring_color.g, ring_color.b)
	active_ring.visible = true
	var wpos = unit.global_position
	if grid != null:
		wpos = grid.cell_to_world(unit.cell.x, unit.cell.y)
	active_ring.global_position = wpos + Vector3(0, 0.02, 0)
	active_ring.scale = Vector3.ONE

	var arrow_color = ring_color
	arrow_color.a = 0.9
	_active_arrow_mat.albedo_color = arrow_color
	_active_arrow_mat.emission = Color(arrow_color.r, arrow_color.g, arrow_color.b)
	active_arrow.visible = true
	active_arrow.global_position = wpos + Vector3(0, 1.05, 0)
	active_arrow.rotation = Vector3(PI, 0, 0)
	active_arrow.scale = Vector3.ONE

func _update_target_ring(act: Unit, cell: Vector2i) -> void:
	if target_ring == null:
		return
	if act == null or grid == null:
		target_ring.visible = false
		return
	if cell.x < 0 or cell.y < 0 or cell.x >= map_w or cell.y >= map_h:
		target_ring.visible = false
		return

	var unit_target = _unit_at_cell(cell, 0)
	if unit_target == null:
		unit_target = _unit_at_cell(cell, 1)

	target_ring.visible = true
	if unit_target != null:
		target_ring.global_position = unit_target.global_position + Vector3(0, 0.02, 0)
	else:
		var wpos = grid.cell_to_world(cell.x, cell.y)
		target_ring.global_position = wpos + Vector3(0, 0.02, 0)

func _flash_target_at_cell(cell: Vector2i) -> void:
	_flash_target_cell = cell
	target_flash_timer = 0.18

func _update_target_flash(delta: float) -> void:
	if target_ring == null or _target_ring_mat == null:
		return
	if target_flash_timer <= 0.0:
		target_ring.scale = Vector3.ONE
		_target_ring_mat.albedo_color = _target_ring_base_color
		_target_ring_mat.emission = Color(_target_ring_base_color.r, _target_ring_base_color.g, _target_ring_base_color.b)
		return
	target_flash_timer = max(0.0, target_flash_timer - delta)
	var t = target_flash_timer / 0.18
	var pulse = 1.0 + (1.0 - t) * 0.35
	target_ring.scale = Vector3(pulse, 1.0, pulse)
	var alpha = lerp(_target_ring_base_color.a, 0.95, 1.0 - t)
	var flash_color = Color(_target_ring_base_color.r, _target_ring_base_color.g, _target_ring_base_color.b, alpha)
	_target_ring_mat.albedo_color = flash_color
	_target_ring_mat.emission = Color(flash_color.r, flash_color.g, flash_color.b)

func _clear_target_overlay() -> void:
	if target_mm:
		target_mm.instance_count = 0

func _ability_targets_allies(ability: Dictionary) -> bool:
	var tags: Array = ability.get("tags", [])
	for tag in ["BUFF", "HEAL", "REGEN", "WARD"]:
		if tags.has(tag):
			return true
	return false

func _build_target_overlay_for_ability(act: Unit, ability: Dictionary) -> void:
	if target_mm == null:
		return
	if act == null or ability.is_empty() or action_mode != ActionMode.ABILITY:
		_clear_target_overlay()
		return
	var tm = int(ability.get("target_mode", Abilities.TargetMode.CELL))
	if tm == Abilities.TargetMode.SELF:
		_clear_target_overlay()
		return

	var cells: Array[Vector2i] = []
	var rng = int(ability.get("range", 0))
	if tm == Abilities.TargetMode.UNIT:
		var wants_allies = _ability_targets_allies(ability)
		var candidates = player_units if wants_allies else enemy_units
		for u in candidates:
			if u == null or u.dead:
				continue
			if rng > 0 and _manhattan(act.cell, u.cell) > rng:
				continue
			cells.append(u.cell)
	elif tm == Abilities.TargetMode.CELL:
		if rng <= 0:
			cells.append(act.cell)
		else:
			cells = _cells_in_manhattan_radius(act.cell, rng)

	target_mm.instance_count = cells.size()
	for i in range(cells.size()):
		var c: Vector2i = cells[i]
		var wpos = grid.cell_to_world(c.x, c.y) + Vector3(0, 0.004, 0)
		var b = Basis().rotated(Vector3(1,0,0), -PI/2)
		target_mm.set_instance_transform(i, Transform3D(b, wpos))

func _build_reach_overlay(costs: Dictionary) -> void:
	var keys = costs.keys()
	reach_mm.instance_count = keys.size()
	for i in range(keys.size()):
		var c: Vector2i = keys[i]
		var wpos = grid.cell_to_world(c.x, c.y) + Vector3(0, 0.005, 0)
		var b = Basis().rotated(Vector3(1,0,0), -PI/2)
		reach_mm.set_instance_transform(i, Transform3D(b, wpos))

func _hide_path_preview() -> void:
	if path_mesh_instance:
		path_mesh_instance.visible = false
	_hover_path_risky = false
	_hover_path_cost = -1

func _path_has_oa_risk(mover: Unit, path: Array[Vector2i]) -> bool:
	if mover == null:
		return false
	for i in range(1, path.size()):
		var from = path[i - 1]
		var to = path[i]
		var attackers = _zoc_attackers_for_step(mover, from, to)
		for atk in attackers:
			if _can_opportunity_attack(atk):
				return true
	return false

func _update_path_preview(act: Unit, move_cell: Vector2i) -> void:
	if path_mesh_instance == null or grid == null:
		return
	if act == null or move_cell.x < 0 or not _reach_cost.has(move_cell):
		_hide_path_preview()
		return
	var path = Pathfinding.find_path(grid, act.cell, move_cell, act)
	if path.size() < 2:
		_hide_path_preview()
		return

	var total_cost = 0
	for i in range(1, path.size()):
		var step_cost = _step_move_cost(act, path[i - 1], path[i])
		if step_cost >= INF:
			_hide_path_preview()
			return
		total_cost += step_cost
	_hover_path_cost = total_cost
	_hover_path_risky = _path_has_oa_risk(act, path)

	path_immediate.clear_surfaces()
	var mat = path_mat_risky if _hover_path_risky else path_mat_ok
	path_immediate.surface_begin(Mesh.PRIMITIVE_LINE_STRIP, mat)
	for c in path:
		var p = grid.cell_to_world(c.x, c.y) + Vector3(0, 0.06, 0)
		path_immediate.surface_add_vertex(p)
	path_immediate.surface_end()
	path_mesh_instance.visible = true

func _compute_snap_cell(_act: Unit, raw_cell: Vector2i) -> Vector2i:
	var candidates: Array[Vector2i] = []
	for ox in range(-1, 2):
		for oy in range(-1, 2):
			var c = raw_cell + Vector2i(ox, oy)
			if _reach_cost.has(c):
				candidates.append(c)
	if candidates.is_empty():
		return raw_cell

	if _snap_hold_time > 0.0 and _reach_cost.has(_snap_hold_cell):
		return _snap_hold_cell

	var threat = _nearest_enemy_to(raw_cell)
	var threat_cell = threat.cell if threat != null else Vector2i(999,999)

	var best_cell = candidates[0]
	var best_score = -999999
	for c in candidates:
		var score = 0
		score -= abs(c.x - raw_cell.x) + abs(c.y - raw_cell.y)
		if threat != null:
			var info = LOS.cover_vs_attacker(grid, c, threat_cell)
			if info.type == "FULL": score += 100
			elif info.type == "HALF": score += 40
		score -= int(_reach_cost[c]) * 2
		if score > best_score:
			best_score = score
			best_cell = c

	_snap_hold_cell = best_cell
	_snap_hold_time = 0.12
	return best_cell

# ---------------- AOE ----------------

func _clear_aoe_preview() -> void:
	_aoe_cells.clear()
	if aoe_preview_mm:
		aoe_preview_mm.instance_count = 0

func _update_aoe_preview(center: Vector2i, act: Unit) -> void:
	if action_mode != ActionMode.ABILITY or _selected_ability.is_empty():
		_clear_aoe_preview()
		return
	var aoe_radius = _ability_aoe_radius(_selected_ability)
	if aoe_radius <= 0:
		_clear_aoe_preview()
		return
	var tm = int(_selected_ability.get("target_mode", Abilities.TargetMode.CELL))
	if tm == Abilities.TargetMode.SELF:
		_clear_aoe_preview()
		return

	var rng = int(_selected_ability.get("range", 0))
	if rng > 0 and abs(center.x - act.cell.x) + abs(center.y - act.cell.y) > rng:
		_clear_aoe_preview()
		return

	_aoe_cells = _cells_in_manhattan_radius(center, aoe_radius)

	aoe_preview_mm.instance_count = _aoe_cells.size()
	for i in range(_aoe_cells.size()):
		var c: Vector2i = _aoe_cells[i]
		var wpos = grid.cell_to_world(c.x, c.y) + Vector3(0, 0.006, 0)
		var b = Basis().rotated(Vector3(1,0,0), -PI/2)
		aoe_preview_mm.set_instance_transform(i, Transform3D(b, wpos))

func _cells_in_manhattan_radius(center: Vector2i, r: int) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for dx in range(-r, r + 1):
		for dy in range(-r, r + 1):
			if abs(dx) + abs(dy) > r:
				continue
			var c = center + Vector2i(dx, dy)
			if grid.in_bounds(c.x, c.y):
				out.append(c)
	return out

func _apply_aoe_effect(caster: Unit, a: Dictionary, effect: Dictionary, center: Vector2i) -> void:
	var dmg = int(effect.get("amount", 0))
	var radius = int(effect.get("radius", a.get("aoe_radius", 0)))
	var dmg_type = int(effect.get("dmg_type", Damage.DmgType.EXPLOSIVE))
	var wpos = grid.cell_to_world(center.x, center.y)
	_spawn_action_ring(wpos, Color(1.0, 0.6, 0.2, 0.65))
	_try_explosion_on_cell(center, dmg, radius, dmg_type)

	for u in player_units.duplicate():
		_apply_aoe_effect_to_unit(caster, u, a, effect, center, dmg, radius, dmg_type)
	for e in enemy_units.duplicate():
		_apply_aoe_effect_to_unit(caster, e, a, effect, center, dmg, radius, dmg_type)

func _apply_aoe_effect_to_unit(attacker: Unit, u: Unit, a: Dictionary, effect: Dictionary, center: Vector2i, dmg: int, radius: int, dmg_type: int) -> void:
	if u.dead:
		return
	var d = abs(u.cell.x - center.x) + abs(u.cell.y - center.y)
	if d > radius:
		return
	var falloff = max(0.35, 1.0 - float(d) * 0.25)
	var raw = int(round(float(dmg) * falloff))
	var ctx = _context_from_ability(a)
	ctx["skip_range_los"] = true
	ctx["skip_action_ring"] = true
	var result = _resolve_attack(attacker, u, raw, dmg_type, ctx)
	if result.get("result", "") in ["HIT", "CRIT"]:
		var status_effect = effect.get("apply_status", {})
		if status_effect != null and not status_effect.is_empty():
			_apply_status_effect(attacker, u, status_effect, true)

# ---------------- Obstacles ----------------

func _rebuild_obstacles_visual() -> void:
	for k in obstacle_mesh.keys():
		var m = obstacle_mesh[k]
		if is_instance_valid(m):
			m.queue_free()
	obstacle_mesh.clear()

	for y in range(map_h):
		for x in range(map_w):
			if not grid.is_walkable(x, y):
				_spawn_obstacle_mesh(Vector2i(x, y))

func _spawn_obstacle_mesh(cell: Vector2i) -> void:
	if obstacle_mesh.has(cell):
		return

	var m := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(1.0, 1.0, 1.0)
	m.mesh = box

	var wpos = grid.cell_to_world(cell.x, cell.y)
	m.position = wpos + Vector3(0, 0.5, 0)
	obstacles_root.add_child(m)
	obstacle_mesh[cell] = m

func _try_explosion_on_cell(center: Vector2i, dmg: int, radius: int, dmg_type: int) -> void:
	for dx in range(-radius, radius + 1):
		for dy in range(-radius, radius + 1):
			var c = center + Vector2i(dx, dy)
			if not grid.in_bounds(c.x, c.y):
				continue
			if abs(dx) + abs(dy) > radius:
				continue
			if grid.has_obstacle(c.x, c.y):
				var mat = grid.get_obstacle_mat(c.x, c.y)
				var mult = Damage.mult_vs_material(dmg_type, mat)
				var real = int(round(float(dmg) * mult))
				var destroyed = grid.damage_obstacle(c.x, c.y, real)
				if destroyed:
					_remove_obstacle_mesh(c)

func _remove_obstacle_mesh(cell: Vector2i) -> void:
	if not obstacle_mesh.has(cell):
		return
	var m = obstacle_mesh[cell]
	obstacle_mesh.erase(cell)
	if is_instance_valid(m):
		m.queue_free()

# ---------------- Overwatch + Enemy AI ----------------

func _trigger_overwatch_on_movement(mover: Unit) -> void:
	var shooters = player_units if mover.team == 1 else enemy_units
	for s in shooters:
		if not s.overwatch or s.overwatch_used:
			continue
		var prev = _compute_shot_preview(s, mover)
		if prev.has_los and prev.dist <= prev.max_range:
			var ow_hit = clamp(prev.hit - 20, 1, 95)
			var roll = randi_range(1, 100)
			s.overwatch_used = true
			s.overwatch = false
			if roll <= ow_hit:
				_log("OVERWATCH HIT %s -> %s (%d%%)" % [s.unit_name, mover.unit_name, ow_hit])
				_resolve_attack(s, mover, 4, Damage.DmgType.PIERCING, {"force_hit": true, "skip_range_los": true, "tags": ["RANGED"]})
			else:
				_log("OVERWATCH MISS (%d%%)" % ow_hit)
			break

func _enemy_take_turn(enemy: Unit) -> void:
	if enemy.casting:
		_resolve_cast_if_ready(enemy)
		return

	if player_units.is_empty():
		return
	var target = _nearest_player(enemy.cell)
	if target == null:
		return

	var ability_pick = _choose_enemy_ability(enemy)
	if _manhattan(enemy.cell, target.cell) <= 1 and enemy.pa >= MELEE_COST:
		if ability_pick.is_empty() or float(ability_pick.get("score", 0.0)) < 90.0:
			_try_melee_attack(enemy, target, true)
			return
	if not ability_pick.is_empty():
		var ability = ability_pick.get("ability", {})
		var target_unit: Unit = ability_pick.get("target", null)
		if target_unit != null:
			_cast_ability_on_unit(enemy, ability, target_unit)
			enemy.pa -= int(ability.get("cost_pa", 0))
			var cd := int(ability.get("cooldown", 0))
			if cd > 0:
				enemy.set_cd(String(ability.get("name", "")), cd)
			return

	if _manhattan(enemy.cell, target.cell) <= 1 and enemy.pa >= MELEE_COST:
		_try_melee_attack(enemy, target, true)
		return

	var prev = _compute_shot_preview(enemy, target)
	if prev.has_los and prev.dist <= prev.max_range and enemy.pa >= SHOOT_COST:
		_try_attack(enemy, target, true)
		return

	var reach_pa = min(4, enemy.pa)
	var reachable = Pathfinding.reachable_with_pa(grid, enemy.cell, reach_pa, enemy)
	var keys = reachable.keys()
	keys.shuffle()
	var sample_count = min(5, keys.size())
	var best_cell: Vector2i = enemy.cell
	var best_score = -999999.0
	for i in range(sample_count):
		var cell: Vector2i = keys[i]
		if cell != enemy.cell and (_unit_at_cell(cell, 0) != null or _unit_at_cell(cell, 1) != null):
			continue
		if not grid.is_walkable(cell.x, cell.y):
			continue
		var score = 0.0
		var cover = LOS.cover_vs_attacker(grid, cell, target.cell)
		if cover.type == "FULL":
			score += 60.0
		elif cover.type == "HALF":
			score += 25.0

		var prev_move = _compute_shot_preview_from_cell(enemy, target, cell)
		if prev_move.has_los and prev_move.dist <= prev_move.max_range:
			score += float(prev_move.hit)
		else:
			score -= 10.0
		if prev_move.get("backstab", false):
			score += 25.0
		elif String(prev_move.get("flank", "NONE")) == "FLANK":
			score += 15.0

		var dist = abs(cell.x - target.cell.x) + abs(cell.y - target.cell.y)
		score -= float(dist) * 1.5
		if dist <= 1:
			score -= 10.0

		var cost = int(reachable.get(cell, 0))
		score -= float(cost) * 2.0
		if float(enemy.hp) / float(enemy.max_hp) <= 0.4:
			var path = Pathfinding.find_path(grid, enemy.cell, cell, enemy)
			if not path.is_empty() and _path_has_oa_risk(enemy, path):
				score -= 30.0

		if score > best_score:
			best_score = score
			best_cell = cell

	if best_cell != enemy.cell:
		_try_move_with_overwatch_triggers(enemy, best_cell)

	if _manhattan(enemy.cell, target.cell) <= 1 and enemy.pa >= MELEE_COST:
		_try_melee_attack(enemy, target, true)
		return

	prev = _compute_shot_preview(enemy, target)
	if prev.has_los and prev.dist <= prev.max_range and enemy.pa >= SHOOT_COST:
		_try_attack(enemy, target, true)

func _nearest_player(cell: Vector2i) -> Unit:
	var best: Unit = null
	var best_d = 999999
	for p in player_units:
		var dx = p.cell.x - cell.x
		var dy = p.cell.y - cell.y
		var d = dx*dx + dy*dy
		if d < best_d:
			best_d = d
			best = p
	return best

func _step_toward(from: Vector2i, to: Vector2i) -> Vector2i:
	var dx = to.x - from.x
	var dy = to.y - from.y
	var sx = 0 if dx == 0 else (1 if dx > 0 else -1)
	var sy = 0 if dy == 0 else (1 if dy > 0 else -1)
	if abs(dx) >= abs(dy):
		return from + Vector2i(sx, 0)
	return from + Vector2i(0, sy)

func _nearest_enemy_to(cell: Vector2i) -> Unit:
	if enemy_units.is_empty():
		return null
	var best: Unit = null
	var best_d = 999999
	for e in enemy_units:
		var dx = e.cell.x - cell.x
		var dy = e.cell.y - cell.y
		var d = dx*dx + dy*dy
		if d < best_d:
			best_d = d
			best = e
	return best

# ---------------- Death cleanup ----------------

func _on_unit_died(u: Unit) -> void:
	if player_units.has(u):
		player_units.erase(u)
	if enemy_units.has(u):
		enemy_units.erase(u)

	if timeline != null and timeline.has_method("unregister_unit"):
		timeline.unregister_unit(u)

	u.queue_free()
	_update_mission_ui()
	_check_mission_status()

# ---------------- Mission results ----------------

func _check_mission_status() -> void:
	if not mission_active:
		return
	if mission_state.get("completed", false) or mission_state.get("failed", false):
		return
	if player_units.is_empty():
		_handle_defeat("Todos os aliados foram derrotados.")
		return

	match mission_objective_type:
		"KILL_ALL":
			if enemy_units.is_empty():
				_handle_victory("Inimigos eliminados.")
		"EXTRACT":
			for u in player_units:
				if u.cell == mission_extract_cell:
					_handle_victory("Extração alcançada.")
					return
		"SURVIVE":
			if int(mission_state.get("turns", 0)) >= mission_turn_limit and mission_turn_limit > 0:
				_handle_victory("Defesa concluída.")
				return
			if enemy_units.is_empty():
				_handle_victory("Inimigos eliminados.")
				return

func _handle_victory(reason: String) -> void:
	if not mission_active:
		return
	mission_active = false
	mission_state["completed"] = true
	if timeline:
		timeline.set_process(false)
	if end_turn_btn:
		end_turn_btn.disabled = true
	_show_end_screen("VITÓRIA", reason)

func _handle_defeat(reason: String) -> void:
	if not mission_active:
		return
	mission_active = false
	mission_state["failed"] = true
	if timeline:
		timeline.set_process(false)
	if end_turn_btn:
		end_turn_btn.disabled = true
	_show_end_screen("DERROTA", reason)

func _on_restart_pressed() -> void:
	get_tree().reload_current_scene()

func _spawn_cell_for_player(idx: int, spawns: Array) -> Vector2i:
	if idx < spawns.size():
		return spawns[idx]
	return _fallback_player_spawn(idx)

func _spawn_cell_for_enemy(idx: int, spawns: Array) -> Vector2i:
	if idx < spawns.size():
		return spawns[idx]
	return _fallback_enemy_spawn(idx)

func _fallback_player_spawn(idx: int) -> Vector2i:
	var base = [
		Vector2i(1, map_h - 2),
		Vector2i(2, map_h - 3),
		Vector2i(1, map_h - 4)
	]
	return base[min(idx, base.size() - 1)]

func _fallback_enemy_spawn(idx: int) -> Vector2i:
	var base = [
		Vector2i(map_w - 3, 2),
		Vector2i(map_w - 4, 3),
		Vector2i(map_w - 3, 4),
		Vector2i(map_w - 5, 3)
	]
	return base[min(idx, base.size() - 1)]

# ---------------- Misc helpers ----------------

func _log(msg: String) -> void:
	if not DEBUG_LOGS:
		return
	print(msg)
	_log_buffer.append(msg)
	if _log_buffer.size() > LOG_BUFFER_MAX:
		_log_buffer.pop_front()
	_update_log_ui()

func _spawn_floating_text(world_pos: Vector3, text: String, kind: String = "dmg") -> void:
	if fx == null:
		return
	var color = Color(1.0, 0.9, 0.9, 1.0)
	match kind:
		"heal":
			color = Color(0.3, 1.0, 0.4, 1.0)
		"status":
			color = Color(1.0, 0.8, 0.2, 1.0)
		"resist":
			color = Color(0.9, 0.9, 0.9, 1.0)
		"miss":
			color = Color(0.85, 0.85, 0.85, 1.0)
		"block":
			color = Color(0.7, 0.7, 0.8, 1.0)
		_:
			color = Color(1.0, 0.4, 0.4, 1.0)
	fx.spawn_floating_text(text, world_pos, color)

func _manhattan(a: Vector2i, b: Vector2i) -> int:
	return abs(a.x - b.x) + abs(a.y - b.y)

func _should_use_alt_status(a: Dictionary, target: Unit) -> bool:
	if not a.has("status_alt_id"):
		return false
	if target == null or target.max_hp <= 0:
		return false
	var hp_pct = float(target.hp) / float(target.max_hp)
	return hp_pct >= 0.6

func _choose_enemy_ability(enemy: Unit) -> Dictionary:
	var best_score = -999999.0
	var best_pick: Dictionary = {}
	for a in enemy.abilities:
		var cost := int(a.get("cost_pa", 0))
		if enemy.pa < cost:
			continue
		var ability_name := String(a.get("name", ""))
		if enemy.cd_left(ability_name) > 0:
			continue
		if int(a.get("target_mode", Abilities.TargetMode.UNIT)) != Abilities.TargetMode.UNIT:
			continue
		var tags: Array = a.get("tags", [])
		var ability_range := int(a.get("range", 0))
		for p in player_units:
			if p == null or p.dead:
				continue
			var dist = abs(p.cell.x - enemy.cell.x) + abs(p.cell.y - enemy.cell.y)
			if ability_range > 0 and dist > ability_range:
				continue
			var prev = _compute_shot_preview(enemy, p, _context_from_ability(a))
			if not prev.has_los or prev.dist > prev.max_range:
				continue
			var score = 0.0
			var base_dmg = _ability_damage_amount(a)
			if base_dmg > 0:
				var dmg_type = _ability_primary_damage_type(a)
				var ctx = _context_from_ability(a)
				if _is_backstab(p, enemy):
					ctx["damage_mult"] = float(ctx.get("damage_mult", 1.0)) * 1.25
				var dmg_range = _estimate_damage_range(base_dmg, enemy, p, dmg_type, ctx)
				score += float(dmg_range.get("min", 0) + dmg_range.get("max", 0)) * 0.5
			if tags.has("STUN") and not p.has_status("STUN"):
				score += 120.0
			if tags.has("ROOT") and not p.has_status("ROOT"):
				score += 90.0
			if tags.has("VULNERABLE") and not p.has_status("VULNERABLE"):
				score += 85.0
			if tags.has("BLEED") and not p.has_status("BLEED"):
				score += 80.0
			if tags.has("BURN") and not p.has_status("BURN"):
				score += 80.0
			if tags.has("SLOW") and not p.has_status("SLOW"):
				score += 60.0
			if tags.has("NUKE") or base_dmg >= 10:
				score += 60.0
			var hp_pct = float(p.hp) / float(p.max_hp if p.max_hp > 0 else 1)
			score += (1.0 - hp_pct) * 40.0
			score -= float(dist) * 2.0
			var cover = LOS.cover_vs_attacker(grid, p.cell, enemy.cell)
			if cover.type == "NONE":
				score += 10.0
			if score > best_score:
				best_score = score
				best_pick = {"ability": a, "target": p, "score": score}
	return best_pick
