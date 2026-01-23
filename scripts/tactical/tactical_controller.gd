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
const BASE_WEAPON_AIM := 65
const BASE_RANGE_3D := 11.0
const RANGE_BONUS_PER_LEVEL := 1.0
const HIGHGROUND_AIM_PER_LEVEL := 10
const HALF_COVER_PENALTY := 20
const FULL_COVER_PENALTY := 40

func _move_cost_per_tile(u: Unit) -> int:
	if u == null:
		return MOVE_COST_PER_TILE
	var mult = max(0.2, u.get_move_multiplier())
	return max(1, int(round(float(MOVE_COST_PER_TILE) / mult)))

# Reach + hover visuals
var reach_mmi: MultiMeshInstance3D
var reach_mm: MultiMesh
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
	_hide_los_visuals()
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
		var move_cost = _move_cost_per_tile(u)
		var reach_pa = int(floor(float(u.pa) / float(move_cost)))
		_reach_cost = Pathfinding.reachable_with_pa(grid, u.cell, reach_pa)
		_build_reach_overlay(_reach_cost)
	else:
		_reach_cost = {}
		_build_reach_overlay(_reach_cost)

	_selected_ability = {}
	action_mode = ActionMode.MOVE
	_refresh_hotbar(u)
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
		elif etype == "damage":
			_apply_status_damage(u, e)
		elif etype == "heal":
			_apply_status_heal(u, e)
	_update_status_ui(u)

func _apply_status_damage(u: Unit, event: Dictionary) -> void:
	var amount = int(event.get("amount", 0))
	if amount <= 0:
		return
	var dmg_type = int(event.get("dmg_type", Damage.DmgType.PIERCING))
	var true_damage = bool(event.get("true_damage", false))
	var label = String(event.get("name", ""))
	var context := {"true_damage": true_damage, "armor_mult": float(event.get("armor_mult", 1.0))}
	var final_dmg = _compute_final_damage(amount, u, u, dmg_type, false, context)
	var applied = u.apply_damage(final_dmg)
	_spawn_floating_text(u.global_position, "-%d" % applied, "dmg")
	if fx and applied > 0:
		fx.shake_node(u, 0.06, 0.1)
	_spawn_action_ring(u.global_position, Color(0.9, 0.3, 0.2, 0.55))
	_log("%s sofreu %s por %d (HP %d/%d)" % [u.unit_name, label, applied, u.hp, u.max_hp])
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
		shot_preview = _compute_shot_preview(act, enemy)
		_update_los_visuals_for_shot(act, enemy)
	else:
		_hide_los_visuals()

	_update_aoe_preview(target_cell, act)
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
			KEY_0, KEY_ESCAPE:
				action_mode = ActionMode.MOVE
				_selected_ability = {}
				_clear_aoe_preview()
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
			_try_attack(act, enemy, true)
			_after_player_action(act)
			return

		# Move default (attack if clicking enemy)
		var enemy2 = _unit_at_cell(_hover_snap, 1)
		if enemy2 != null:
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
			var enemy = _unit_at_cell(cell, 1)
			var ally = _unit_at_cell(cell, 0)
			var tgt: Unit = enemy if enemy != null else ally
			if tgt == null:
				return
			_cast_ability_on_unit(act, a, tgt)
		Abilities.TargetMode.SELF:
			_cast_ability_on_unit(act, a, act)

	# spend + cd
	act.pa -= cost
	if cd > 0:
		act.set_cd(ability_name, cd)

func _cast_ability_on_cell(caster: Unit, a: Dictionary, cell: Vector2i) -> void:
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
	_pulse_active_marker()

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
	return {
		"hit_bonus": int(a.get("hit_bonus", 0)),
		"crit_bonus": int(a.get("crit_bonus", 0)),
		"tags": a.get("tags", [])
	}

func _ability_effects(a: Dictionary) -> Array:
	var effects: Array = a.get("effects", [])
	return effects

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
			var dmg = int(effect.get("amount", 0))
			if dmg <= 0:
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
			var result = _resolve_attack(caster, target, dmg, dmg_type, ctx)
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

	var dmg = int(a.get("dmg", 0))
	if dmg > 0:
		var dmg_type2 = int(a.get("dmg_type", Damage.DmgType.PIERCING))
		var ctx2 = _context_from_ability(a)
		var res = _resolve_attack(caster, target, dmg, dmg_type2, ctx2)
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
			"on_hit": dmg > 0
		}
		if a.has("status_alt_id") and _should_use_alt_status(a, target):
			effect2["name"] = String(a.get("status_alt_id", status_id))
			effect2["potency"] = float(a.get("status_alt_potency", effect2["potency"]))
		_apply_status_effect(caster, target, effect2, hit_success)

func _apply_status_effect(caster: Unit, target: Unit, effect: Dictionary, hit_success: bool) -> void:
	var name = String(effect.get("name", "")).to_upper()
	if name == "":
		return
	if bool(effect.get("on_hit", false)) and not hit_success:
		return
	var chance = float(effect.get("chance", 1.0))
	if chance <= 0.0:
		return
	if chance < 1.0 and randf() > chance:
		return
	if name in ["STUN", "BLEED", "SLOW"]:
		var caster_power = caster.will
		if name in ["BLEED", "SLOW"]:
			caster_power = caster.dex
		if target.status_save_check(name, caster_power):
			_log("%s resistiu %s!" % [target.unit_name, name])
			_spawn_floating_text(target.global_position, "RESIST!", "resist")
			return

	var turns = int(effect.get("turns", 1))
	var stacks = max(1, int(effect.get("stacks", 1)))
	var potency = float(effect.get("potency", 0.0))
	var flags = effect.get("flags", effect.get("params", {}))
	var final_turns = target.compute_applied_duration(name, turns)
	var final_potency = target.compute_applied_potency(name, potency)
	target.add_status(name, final_turns, final_potency, stacks, flags, caster.get_instance_id())
	_log("%s aplicou %s em %s" % [caster.unit_name, name, target.unit_name])
	_spawn_floating_text(target.global_position, "%s!" % name, "status")
	_update_status_ui(target)

func _on_end_turn_pressed() -> void:
	var act: Unit = timeline.get_active_unit()
	if act == null or act.team != 0:
		return
	act.pa = 0

func _after_player_action(act: Unit) -> void:
	var move_cost = _move_cost_per_tile(act)
	var reach_pa = int(floor(float(act.pa) / float(move_cost)))
	_reach_cost = Pathfinding.reachable_with_pa(grid, act.cell, reach_pa)
	_build_reach_overlay(_reach_cost)
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

	var move_cost_tiles = int(_reach_cost.get(move_cell, -1)) if move_cell.x >= 0 else -1
	var move_cost = move_cost_tiles * _move_cost_per_tile(u) if move_cost_tiles >= 0 else -1
	var cover_txt = "Cover:NONE"
	if cover_info != null:
		cover_txt = "Cover:%s(%s)" % [cover_info.type, cover_info.dir_name]

	if move_cell.x < 0:
		ui_label.text = base
	else:
		ui_label.text = "%s | Mover:%dPA | %s" % [base, move_cost, cover_txt]

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
		aim_lines.append("Hit:%d%% | %s | Range:%.1f/%.1f | Cover:%s | High:%+d" % [
			shot_preview.hit,
			los_txt,
			shot_preview.dist,
			shot_preview.max_range,
			cover_type,
			high_txt
		])
		if flank_bonus > 0:
			aim_lines.append("Flanco:%s (+%d hit)" % [flank_txt, flank_bonus])
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

func _try_move_with_overwatch_triggers(u: Unit, dest: Vector2i) -> void:
	_flash_target_at_cell(dest)
	var path = Pathfinding.find_path(grid, u.cell, dest)
	if path.is_empty():
		return
	var move_cost = _move_cost_per_tile(u)
	var moved = false
	for i in range(1, path.size()):
		if u.pa <= 0:
			break
		var step: Vector2i = path[i]
		if not u.spend_pa(move_cost):
			break
		_update_unit_facing(u, u.cell, step)
		u.cell = step
		u.position = grid.cell_to_world(step.x, step.y)
		moved = true
		_trigger_overwatch_on_movement(u)
	if moved:
		_pulse_active_marker()

# ---------------- Damage helpers ----------------

func _apply_damage_with_type(raw: int, armor: int, dmg_type: int) -> int:
	var eff_armor := float(armor)
	match dmg_type:
		Damage.DmgType.PIERCING: eff_armor *= 0.75
		Damage.DmgType.MELTING: eff_armor *= 0.50
		Damage.DmgType.EXPLOSIVE: eff_armor *= 0.85
		_: pass
	return Damage.apply_armor(raw, int(round(eff_armor)))

func _compute_final_damage(base: int, _attacker: Unit, defender: Unit, dmg_type: int, crit: bool, context: Dictionary) -> int:
	var dmg = max(1, base)
	if crit:
		dmg = int(round(float(dmg) * 1.5))
	if bool(context.get("true_damage", false)):
		return int(round(float(dmg) * defender.get_damage_taken_multiplier(dmg_type)))
	var armor_mult = float(context.get("armor_mult", 1.0))
	var def_bonus = defender.get_def_bonus() + defender.get_def_bonus_from_status()
	var armor = int((defender.get_armor_value() + def_bonus * 0.25) * armor_mult)
	var mitigated = _apply_damage_with_type(dmg, armor, dmg_type)
	return int(round(float(mitigated) * defender.get_damage_taken_multiplier(dmg_type)))

func _try_attack(attacker: Unit, defender: Unit, spend_cost: bool) -> void:
	if spend_cost and not attacker.spend_pa(SHOOT_COST):
		return

	_update_unit_facing(attacker, attacker.cell, defender.cell)
	var raw_dmg = max(1, attacker.get_weapon_dmg() + 5 + int(attacker.dex * 0.5))
	_resolve_attack(attacker, defender, raw_dmg, Damage.DmgType.PIERCING, {"tags": ["RANGED"]})
	_pulse_active_marker()

func _roll_to_hit(attacker: Unit, defender: Unit, context: Dictionary, preview: Dictionary) -> bool:
	var hit = int(context.get("override_hit", preview.get("hit", 0)))
	hit = clamp(hit, 1, 95)
	var roll = randi_range(1, 100)
	return roll <= hit

func _roll_block_or_evade(attacker: Unit, defender: Unit, _context: Dictionary) -> String:
	var block = clamp((defender.def + defender.get_def_bonus_from_status()) * 2, 0, 45)
	var evade = clamp(5 + int(round(float(defender.agi - attacker.dex) * 1.0)), 5, 25)
	if randi_range(1, 100) <= block:
		return "BLOCK"
	if randi_range(1, 100) <= evade:
		return "EVADE"
	return "NONE"

func _roll_crit(attacker: Unit, defender: Unit, context: Dictionary) -> bool:
	var base = 10.0 + float(attacker.dex - defender.agi) * 0.5
	base += float(context.get("crit_bonus", 0))
	var chance = clamp(base, 5.0, 30.0)
	return randf_range(0.0, 100.0) <= chance

func _resolve_attack(attacker: Unit, defender: Unit, base_dmg: int, dmg_type: int, context: Dictionary) -> Dictionary:
	var preview = _compute_shot_preview(attacker, defender, context)
	if preview == null:
		return {"result": "INVALID"}
	var skip_range = bool(context.get("skip_range_los", false))
	if not skip_range:
		if not preview.has_los or preview.dist > preview.max_range:
			return {"result": "NO_LOS", "preview": preview}
	if not bool(context.get("skip_action_ring", false)):
		_spawn_action_ring(attacker.global_position, Color(0.4, 0.8, 1.0, 0.5))

	if not bool(context.get("force_hit", false)) and not _roll_to_hit(attacker, defender, context, preview):
		_flash_target_at_cell(defender.cell)
		if fx:
			fx.spawn_tracer(attacker.global_position + Vector3(0, 0.6, 0), defender.global_position + Vector3(0, 0.6, 0))
		_spawn_floating_text(defender.global_position, "MISS", "miss")
		_spawn_action_ring(defender.global_position, Color(0.5, 0.5, 0.5, 0.5))
		_log("%s errou %s (%d%%)" % [attacker.unit_name, defender.unit_name, int(preview.hit)])
		return {"result": "MISS", "preview": preview}

	var block_res = _roll_block_or_evade(attacker, defender, context)
	if block_res != "NONE":
		_log("%s %s o ataque!" % [defender.unit_name, "bloqueou" if block_res == "BLOCK" else "esquivou"])
		_flash_target_at_cell(defender.cell)
		if fx:
			fx.spawn_tracer(attacker.global_position + Vector3(0, 0.6, 0), defender.global_position + Vector3(0, 0.6, 0))
		var txt = "BLOCK" if block_res == "BLOCK" else "EVADE"
		_spawn_floating_text(defender.global_position, txt, "block")
		_spawn_action_ring(defender.global_position, Color(0.65, 0.65, 0.65, 0.55))
		return {"result": block_res, "preview": preview}

	var crit = _roll_crit(attacker, defender, context)
	var final_dmg = _compute_final_damage(base_dmg, attacker, defender, dmg_type, crit, context)
	var applied = defender.apply_damage(final_dmg)
	_flash_target_at_cell(defender.cell)
	if fx:
		fx.spawn_tracer(attacker.global_position + Vector3(0, 0.6, 0), defender.global_position + Vector3(0, 0.6, 0))
	var dmg_text = "CRIT -%d" % applied if crit else "-%d" % applied
	_spawn_floating_text(defender.global_position, dmg_text, "dmg")
	if fx and applied > 0:
		fx.shake_node(defender, 0.08, 0.12)
	_spawn_action_ring(defender.global_position, Color(1.0, 0.25, 0.2, 0.65))
	var crit_txt = " CRIT" if crit else ""
	_log("%s%s acertou %s por %d (HP %d/%d)" % [attacker.unit_name, crit_txt, defender.unit_name, applied, defender.hp, defender.max_hp])
	if defender.dead:
		_on_unit_died(defender)
	return {"result": "CRIT" if crit else "HIT", "damage": applied, "preview": preview}

func _compute_shot_preview(attacker: Unit, defender: Unit, context: Dictionary = {}, from_cell: Vector2i = Vector2i(-999, -999)):
	var att_cell = attacker.cell if from_cell.x < 0 else from_cell
	var pts = LOS.line(att_cell, defender.cell)
	var blocker = _first_blocker_cell(pts)

	var has_los = (blocker == null)
	var dist = LOS.dist3d(grid, att_cell, defender.cell)

	var h_att = grid.get_height(att_cell.x, att_cell.y)
	var h_def = grid.get_height(defender.cell.x, defender.cell.y)
	var dh = h_att - h_def
	var max_range = (BASE_RANGE_3D + attacker.get_weapon_range_bonus()) + max(0, dh) * RANGE_BONUS_PER_LEVEL

	var cover = LOS.cover_vs_attacker(grid, defender.cell, att_cell)
	var cover_pen = 0
	if cover.type == "HALF": cover_pen = HALF_COVER_PENALTY
	elif cover.type == "FULL": cover_pen = FULL_COVER_PENALTY

	var flank = _get_flank_state(att_cell, defender)
	var flank_bonus = 0
	if flank == "SIDE":
		flank_bonus = 15
	elif flank == "BACK":
		flank_bonus = 25
	if flank != "FRONT":
		if flank == "SIDE":
			cover_pen = int(round(float(cover_pen) * 0.5))
		else:
			cover_pen = 0

	var high_bonus = max(0, dh) * HIGHGROUND_AIM_PER_LEVEL
	var hit = BASE_WEAPON_AIM + attacker.get_weapon_aim_bonus() + attacker.dex * 2 - defender.agi * 2 + high_bonus - cover_pen + flank_bonus
	hit -= attacker.get_aim_penalty()
	hit -= defender.get_def_bonus_from_status()
	hit += int(context.get("hit_bonus", 0))
	hit = clamp(hit, 1, 95)

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
		"cover_pen": cover_pen
	}

func _compute_shot_preview_from_cell(attacker: Unit, defender: Unit, from_cell: Vector2i, context: Dictionary = {}) -> Dictionary:
	return _compute_shot_preview(attacker, defender, context, from_cell)

func _cardinal_dir(from: Vector2i, to: Vector2i) -> Vector2i:
	var dx = to.x - from.x
	var dy = to.y - from.y
	if abs(dx) >= abs(dy):
		return Vector2i(1, 0) if dx > 0 else Vector2i(-1, 0)
	return Vector2i(0, 1) if dy > 0 else Vector2i(0, -1)

func _get_flank_state(attacker_cell: Vector2i, defender: Unit) -> String:
	var to_attacker = _cardinal_dir(defender.cell, attacker_cell)
	if to_attacker == defender.facing_dir:
		return "FRONT"
	if to_attacker == -defender.facing_dir:
		return "BACK"
	return "SIDE"

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
		var tgt = _unit_at_cell(cell, 1)
		if tgt == null:
			tgt = _unit_at_cell(cell, 0)
		if tgt == null:
			result.reason = "SEM ALVO"
			return result
		result.valid = true
		result.target_unit = tgt
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
	if action_mode != ActionMode.ABILITY or _selected_ability.is_empty():
		target_ring.visible = false
		return
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

func _build_reach_overlay(costs: Dictionary) -> void:
	var keys = costs.keys()
	reach_mm.instance_count = keys.size()
	for i in range(keys.size()):
		var c: Vector2i = keys[i]
		var wpos = grid.cell_to_world(c.x, c.y) + Vector3(0, 0.005, 0)
		var b = Basis().rotated(Vector3(1,0,0), -PI/2)
		reach_mm.set_instance_transform(i, Transform3D(b, wpos))

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

	var prev = _compute_shot_preview(enemy, target)
	if prev.has_los and prev.dist <= prev.max_range and enemy.pa >= SHOOT_COST:
		_try_attack(enemy, target, true)
		return

	var move_cost = _move_cost_per_tile(enemy)
	var reach_pa = int(floor(float(min(4, enemy.pa)) / float(move_cost)))
	var reachable = Pathfinding.reachable_with_pa(grid, enemy.cell, reach_pa)
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

		var dist = abs(cell.x - target.cell.x) + abs(cell.y - target.cell.y)
		score -= float(dist) * 1.5
		if dist <= 1:
			score -= 10.0

		var cost = int(reachable.get(cell, 0))
		score -= float(cost) * 2.0

		if score > best_score:
			best_score = score
			best_cell = cell

	if best_cell != enemy.cell:
		_try_move_with_overwatch_triggers(enemy, best_cell)

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
		if tags.has("BUFF"):
			var score_buff = 50.0
			if tags.has("REGEN") and not enemy.has_status("REGEN"):
				score_buff += 30.0
			if tags.has("WARD") and not enemy.has_status("WARD"):
				score_buff += 30.0
			var hp_pct_buff = float(enemy.hp) / float(enemy.max_hp if enemy.max_hp > 0 else 1)
			score_buff += (1.0 - hp_pct_buff) * 40.0
			if score_buff > best_score:
				best_score = score_buff
				best_pick = {"ability": a, "target": enemy}
			continue
		var range := int(a.get("range", 0))
		for p in player_units:
			if p == null or p.dead:
				continue
			var dist = abs(p.cell.x - enemy.cell.x) + abs(p.cell.y - enemy.cell.y)
			if range > 0 and dist > range:
				continue
			var prev = _compute_shot_preview(enemy, p, _context_from_ability(a))
			if not prev.has_los or prev.dist > prev.max_range:
				continue
			var score = 0.0
			if tags.has("STUN") and not p.has_status("STUN"):
				score += 120.0
			if tags.has("BLEED") and not p.has_status("BLEED"):
				score += 90.0
			if tags.has("SLOW") and not p.has_status("SLOW"):
				score += 70.0
			if tags.has("NUKE") or int(a.get("dmg", 0)) >= 10:
				score += 60.0
			var hp_pct = float(p.hp) / float(p.max_hp if p.max_hp > 0 else 1)
			score += (1.0 - hp_pct) * 40.0
			score -= float(dist) * 2.0
			var cover = LOS.cover_vs_attacker(grid, p.cell, enemy.cell)
			if cover.type == "NONE":
				score += 10.0
			if score > best_score:
				best_score = score
				best_pick = {"ability": a, "target": p}
	return best_pick
