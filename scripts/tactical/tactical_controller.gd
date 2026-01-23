# res://scripts/tactical/tactical_controller.gd
extends Node3D
class_name TacticalController

const Damage := preload("res://scripts/tactical/damage.gd")
const Abilities := preload("res://scripts/tactical/abilities.gd")
const TacticalAI := preload("res://scripts/tactical/ai.gd")
const MissionGenerator := preload("res://scripts/tactical/mission_generator.gd")

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
@onready var objective_label: Label = get_node_or_null("../UI/ObjectiveLabel")
@onready var result_panel: Control = get_node_or_null("../UI/ResultPanel")
@onready var result_label: Label = get_node_or_null("../UI/ResultPanel/ResultLabel")
@onready var next_mission_btn: Button = get_node_or_null("../UI/ResultPanel/NextMissionButton")

var grid: GridData
var player_units: Array[Unit] = []
var enemy_units: Array[Unit] = []
var mission_data: Dictionary = {}
var mission_objective: int = MissionGenerator.Objective.ELIMINATE
var mission_extract_cell: Vector2i = Vector2i(-1, -1)
var mission_defend_turns: int = 0
var mission_defend_target_activation: int = 0
var mission_seed: int = 0
var mission_active: bool = false

# Costs / tuning
const MOVE_COST_PER_TILE := 1
const SHOOT_COST := 4
const BASE_WEAPON_AIM := 65
const BASE_RANGE_3D := 11.0
const RANGE_BONUS_PER_LEVEL := 1.0
const HIGHGROUND_AIM_PER_LEVEL := 10
const HALF_COVER_PENALTY := 20
const FULL_COVER_PENALTY := 40

# Reach + hover visuals
var reach_mmi: MultiMeshInstance3D
var reach_mm: MultiMesh
var hover_tile: MeshInstance3D
var cover_indicator: MeshInstance3D
var extract_marker: MeshInstance3D

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
var _tactical_ai: TacticalAI = TacticalAI.new()

# Hotbar
var _hotbar_root: Control
var _hotbar_labels: Array[Label] = []
var _selected_ability: Dictionary = {}

func _ready() -> void:
	_ensure_visuals()
	_ensure_los_visuals()
	_ensure_hotbar_ui()
	_ensure_objective_marker()

	# camera bounds
	var camrig = get_node_or_null("../CameraRig")
	if camrig and camrig.has_method("set_bounds"):
		camrig.set_bounds(map_w, map_h, 1.0)

	timeline.active_unit_changed.connect(_on_active_unit_changed)

	if end_turn_btn:
		end_turn_btn.pressed.connect(_on_end_turn_pressed)
	if next_mission_btn:
		next_mission_btn.pressed.connect(_on_next_mission_pressed)

	_start_new_mission()

func _start_new_mission() -> void:
	_clear_current_mission()

	var w = map_w if map_w != null and map_w > 0 else 16
	var h = map_h if map_h != null and map_h > 0 else 16
	map_w = w
	map_h = h
	grid = GridData.new(w, h)

	mission_seed = randi()
	mission_data = MissionGenerator.generate(mission_seed, w, h)
	mission_objective = int(mission_data.get("objective", MissionGenerator.Objective.ELIMINATE))
	mission_extract_cell = mission_data.get("extract_cell", Vector2i(-1, -1))
	mission_defend_turns = int(mission_data.get("defend_turns", 0))

	_build_map_from_mission()
	_spawn_units_from_mission()

	_update_objective_ui()
	_update_extract_marker()

	if result_panel:
		result_panel.visible = false
	mission_active = true
	if timeline:
		timeline.reset()
		timeline.set_process(true)
		for u in player_units + enemy_units:
			timeline.register_unit(u)
		mission_defend_target_activation = timeline.activation_count + mission_defend_turns
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
	var heights: Dictionary = mission_data.get("heights", {})
	for cell in heights.keys():
		var z = int(heights[cell])
		grid.set_height(cell.x, cell.y, z)

	var obstacles: Array = mission_data.get("obstacles", [])
	for ob in obstacles:
		var cell = ob.get("cell", Vector2i.ZERO)
		var mat = int(ob.get("mat", Damage.MatType.WOOD))
		var hp = int(ob.get("hp", 6))
		grid.set_obstacle(cell.x, cell.y, mat, hp)

func _spawn_units_from_mission() -> void:
	if unit_scene == null:
		push_error("unit_scene não setado no TacticalController")
		return

	var player_spawns: Array = mission_data.get("player_spawns", [])
	var enemy_spawns: Array = mission_data.get("enemy_spawns", [])

	for i in range(player_spawns.size()):
		var cell: Vector2i = player_spawns[i]
		var u := _make_player_unit(i)
		_add_unit(u, cell)

	for i in range(enemy_spawns.size()):
		var ecell: Vector2i = enemy_spawns[i]
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
	_snap_hold_cell = Vector2i(-999, -999)
	_snap_hold_time = 0.0
	_enemy_acted_for_turn = false

	_hide_los_visuals()
	_clear_aoe_preview()

	u.tick_cooldowns()

	if u.team == 0:
		_reach_cost = Pathfinding.reachable_with_pa(grid, u.cell, u.pa)
		_build_reach_overlay(_reach_cost)
	else:
		_reach_cost = {}
		_build_reach_overlay(_reach_cost)

	_selected_ability = {}
	action_mode = ActionMode.MOVE
	_refresh_hotbar(u)
	_refresh_ui(u, Vector2i(-999, -999), null, null)

	var camrig = get_node_or_null("../CameraRig")
	if camrig and camrig.has_method("center_on_world"):
		camrig.center_on_world(u.global_position)

	_check_mission_status()

func _process(delta: float) -> void:
	if not mission_active:
		return
	var act: Unit = timeline.get_active_unit()

	if end_turn_btn:
		end_turn_btn.disabled = (act == null or act.team != 0)

	if act == null:
		hover_tile.visible = false
		cover_indicator.visible = false
		_hide_los_visuals()
		_clear_aoe_preview()
		return

	# Enemy turn
	if act.team == 1:
		hover_tile.visible = false
		cover_indicator.visible = false
		_hide_los_visuals()
		_clear_aoe_preview()
		if not _enemy_acted_for_turn:
			_enemy_acted_for_turn = true
			_tactical_ai.take_turn(self, act)
			_check_mission_status()
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
		_refresh_ui(act, Vector2i(-999, -999), null, null)
		return

	var raw_cell: Vector2i = grid.world_to_cell(hit.position)
	var snapped_cell = _compute_snap_cell(act, raw_cell)
	_hover_snap = snapped_cell

	if _reach_cost.has(snapped_cell):
		hover_tile.visible = true
		var wpos = grid.cell_to_world(snapped_cell.x, snapped_cell.y)
		hover_tile.global_position = wpos + Vector3(0, 0.01, 0)
		hover_tile.rotation = Vector3(-PI/2, 0, 0)

		_update_aoe_preview(snapped_cell, act)

		var threat = _nearest_enemy_to(snapped_cell)
		var cover_info = null
		if threat != null:
			cover_info = LOS.cover_vs_attacker(grid, snapped_cell, threat.cell)
			_draw_cover_indicator(snapped_cell, cover_info)
		else:
			cover_indicator.visible = false

		var enemy = _unit_at_cell(snapped_cell, 1)
		var shot_preview = null
		if enemy != null:
			shot_preview = _compute_shot_preview(act, enemy)
			_update_los_visuals_for_shot(act, enemy)
		else:
			_hide_los_visuals()

		_refresh_ui(act, snapped_cell, cover_info, shot_preview)
	else:
		hover_tile.visible = false
		cover_indicator.visible = false
		_hide_los_visuals()
		_clear_aoe_preview()
		_refresh_ui(act, Vector2i(-999, -999), null, null)

func _unhandled_input(event: InputEvent) -> void:
	if not mission_active:
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

	var name := String(a.get("name", ""))
	var cost := int(a.get("cost_pa", 0))
	var cd := int(a.get("cooldown", 0))
	var target_mode := int(a.get("target_mode", Abilities.TargetMode.CELL))
	var r := int(a.get("range", 0))

	# cooldown / PA
	if act.cd_left(name) > 0:
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
		act.set_cd(name, cd)

func _cast_ability_on_cell(caster: Unit, a: Dictionary, cell: Vector2i) -> void:
	var tags: Array = a.get("tags", [])
	if tags.has("MOVEMENT"):
		_try_move_with_overwatch_triggers(caster, cell)
		return
	if tags.has("AOE"):
		_cast_aoe_on_cell(cell, int(a.get("dmg", 0)), int(a.get("aoe_radius", 0)), int(a.get("dmg_type", Damage.DmgType.EXPLOSIVE)))
		_rebuild_obstacles_visual()
		return

func _cast_ability_on_unit(caster: Unit, a: Dictionary, target: Unit) -> void:
	var tags: Array = a.get("tags", [])
	if tags.has("HEAL"):
		var amt = int(a.get("heal", 0))
		target.apply_heal(amt)
		_log("%s curou %s (+%d)" % [caster.unit_name, target.unit_name, amt])
		return

	var cast_time = int(a.get("cast_time", 0))
	if cast_time > 0:
		caster.casting = true
		caster.casting_ability = a
		caster.casting_target_cell = target.cell
		caster.casting_target_unit_id = target.get_instance_id()
		_log("%s começou a conjurar %s..." % [caster.unit_name, String(a.get("name",""))])
		caster.pa = 0
		return

	var dmg = int(a.get("dmg", 0))
	if dmg > 0:
		_apply_direct_damage(caster, target, dmg, int(a.get("dmg_type", Damage.DmgType.PIERCING)))

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

	_apply_direct_damage(caster, target, int(a.get("dmg", 0)), int(a.get("dmg_type", Damage.DmgType.PIERCING)))

func _on_end_turn_pressed() -> void:
	var act: Unit = timeline.get_active_unit()
	if act == null or act.team != 0:
		return
	act.pa = 0

func _after_player_action(act: Unit) -> void:
	_reach_cost = Pathfinding.reachable_with_pa(grid, act.cell, act.pa)
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

func _refresh_ui(u: Unit, hover_cell: Vector2i, cover_info, shot_preview) -> void:
	var base = "Turno:%s | HP:%d/%d | PA:%d/%d | SPD:%d" % [u.unit_name, u.hp, u.max_hp, u.pa, u.pa_max, u.speed]
	if u.overwatch:
		base += " | OVERWATCH"

	if hover_cell.x < -100:
		ui_label.text = base
		aim_label.text = ""
		return

	var move_cost = int(_reach_cost.get(hover_cell, -1))
	var cover_txt = "Cover:NONE"
	if cover_info != null:
		cover_txt = "Cover:%s(%s)" % [cover_info.type, cover_info.dir_name]

	var shot_txt = ""
	if shot_preview != null:
		shot_txt = "Shot:%d%% %s rng %.1f/%.1f" % [shot_preview.hit, shot_preview.los_txt, shot_preview.dist, shot_preview.max_range]

	ui_label.text = "%s | Mover:%dPA | %s" % [base, move_cost, cover_txt]
	aim_label.text = shot_txt

func _update_objective_ui() -> void:
	if objective_label == null:
		return
	objective_label.text = _mission_objective_text()

func _mission_objective_text() -> String:
	match mission_objective:
		MissionGenerator.Objective.ELIMINATE:
			return "Objetivo: Eliminar todos os inimigos."
		MissionGenerator.Objective.EXTRACT:
			return "Objetivo: Extrair na célula (%d, %d)." % [mission_extract_cell.x, mission_extract_cell.y]
		MissionGenerator.Objective.DEFEND:
			return "Objetivo: Defender por %d turnos." % mission_defend_turns
		_:
			return "Objetivo: ..."

func _set_result_panel(visible: bool, title: String, detail: String = "") -> void:
	if result_panel:
		result_panel.visible = visible
	if result_label:
		if detail.is_empty():
			result_label.text = title
		else:
			result_label.text = "%s\n%s" % [title, detail]
	if next_mission_btn:
		next_mission_btn.disabled = not visible

# ---------------- Raycast ----------------

func _raycast_to_board():
	var cam: Camera3D = get_viewport().get_camera_3d()

	# fallback: seu path real no scene tree
	if cam == null:
		cam = get_node_or_null("../CameraRig/Yaw/Pitch/SpringArm3D/Camera3D") as Camera3D

	if cam == null:
		return null

	var mp = get_viewport().get_mouse_position()
	var from = cam.project_ray_origin(mp)
	var dir = cam.project_ray_normal(mp)
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
	var path = Pathfinding.find_path(grid, u.cell, dest)
	if path.is_empty():
		return
	for i in range(1, path.size()):
		if u.pa <= 0:
			break
		var step: Vector2i = path[i]
		if not u.spend_pa(MOVE_COST_PER_TILE):
			break
		u.cell = step
		u.position = grid.cell_to_world(step.x, step.y)
		_trigger_overwatch_on_movement(u)

# ---------------- Damage helpers ----------------

func _apply_damage_with_type(raw: int, armor: int, dmg_type: int) -> int:
	var eff_armor := float(armor)
	match dmg_type:
		Damage.DmgType.PIERCING: eff_armor *= 0.75
		Damage.DmgType.MELTING: eff_armor *= 0.50
		Damage.DmgType.EXPLOSIVE: eff_armor *= 0.85
		_: pass
	return Damage.apply_armor(raw, int(round(eff_armor)))

func _apply_direct_damage(attacker: Unit, defender: Unit, base_dmg: int, dmg_type: int) -> void:
	var armor = int(defender.get_armor_value() + defender.get_def_bonus() * 0.25)
	var final_dmg = _apply_damage_with_type(base_dmg, armor, dmg_type)
	defender.apply_damage(final_dmg)
	_log("%s acertou %s por %d (HP %d/%d)" % [attacker.unit_name, defender.unit_name, final_dmg, defender.hp, defender.max_hp])
	if defender.dead:
		_on_unit_died(defender)

func _try_attack(attacker: Unit, defender: Unit, spend_cost: bool) -> void:
	if spend_cost and not attacker.spend_pa(SHOOT_COST):
		return

	var preview = _compute_shot_preview(attacker, defender)
	if preview == null:
		return
	if not preview.has_los:
		return
	if preview.dist > preview.max_range:
		return

	var roll = randi_range(1, 100)
	if roll > preview.hit:
		return

	var block = clamp(defender.def * 2, 0, 60)
	if randi_range(1, 100) <= block:
		_log("%s bloqueou o ataque!" % defender.unit_name)
		return

	var raw_dmg = max(1, attacker.get_weapon_dmg() + 5 + int(attacker.dex * 0.5))
	_apply_direct_damage(attacker, defender, raw_dmg, Damage.DmgType.PIERCING)

func _compute_shot_preview(attacker: Unit, defender: Unit):
	var pts = LOS.line(attacker.cell, defender.cell)
	var blocker = _first_blocker_cell(pts)

	var has_los = (blocker == null)
	var dist = LOS.dist3d(grid, attacker.cell, defender.cell)

	var h_att = grid.get_height(attacker.cell.x, attacker.cell.y)
	var h_def = grid.get_height(defender.cell.x, defender.cell.y)
	var dh = h_att - h_def
	var max_range = (BASE_RANGE_3D + attacker.get_weapon_range_bonus()) + max(0, dh) * RANGE_BONUS_PER_LEVEL

	var cover = LOS.cover_vs_attacker(grid, defender.cell, attacker.cell)
	var cover_pen = 0
	if cover.type == "HALF": cover_pen = HALF_COVER_PENALTY
	elif cover.type == "FULL": cover_pen = FULL_COVER_PENALTY

	var high_bonus = max(0, dh) * HIGHGROUND_AIM_PER_LEVEL
	var hit = BASE_WEAPON_AIM + attacker.get_weapon_aim_bonus() + attacker.dex * 2 - defender.agi * 2 + high_bonus - cover_pen
	hit = clamp(hit, 1, 95)

	return {
		"has_los": has_los,
		"los_txt": "LOS" if has_los else "NO_LOS",
		"hit": int(hit),
		"dist": float(dist),
		"max_range": float(max_range),
		"cover": cover,
		"blocker": blocker
	}

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
	if mission_objective != MissionGenerator.Objective.EXTRACT:
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
	var hq := QuadMesh.new()
	hq.size = Vector2(1.0, 1.0)
	hover_tile.mesh = hq
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
	if int(_selected_ability.get("aoe_radius", 0)) <= 0:
		_clear_aoe_preview()
		return

	var r = int(_selected_ability.get("aoe_radius", 0))
	_aoe_cells = _cells_in_manhattan_radius(center, r)

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

func _cast_aoe_on_cell(center: Vector2i, dmg: int, radius: int, dmg_type: int) -> void:
	_try_explosion_on_cell(center, dmg, radius, dmg_type)

	for u in player_units.duplicate():
		_apply_aoe_damage_to_unit(u, center, dmg, radius, dmg_type)
	for e in enemy_units.duplicate():
		_apply_aoe_damage_to_unit(e, center, dmg, radius, dmg_type)

func _apply_aoe_damage_to_unit(u: Unit, center: Vector2i, dmg: int, radius: int, dmg_type: int) -> void:
	if u.dead:
		return
	var d = abs(u.cell.x - center.x) + abs(u.cell.y - center.y)
	if d > radius:
		return
	var falloff = max(0.35, 1.0 - float(d) * 0.25)
	var raw = int(round(float(dmg) * falloff))
	var armor = int(u.get_armor_value() + u.get_def_bonus() * 0.25)
	var final_dmg = _apply_damage_with_type(raw, armor, dmg_type)
	u.apply_damage(final_dmg)
	_log("AOE atingiu %s por %d (HP %d/%d)" % [u.unit_name, final_dmg, u.hp, u.max_hp])
	if u.dead:
		_on_unit_died(u)

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
				_apply_direct_damage(s, mover, 4, Damage.DmgType.PIERCING)
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

	var prev = _compute_shot_preview(enemy, target)
	if prev.has_los and prev.dist <= prev.max_range and enemy.pa >= SHOOT_COST:
		_try_attack(enemy, target, true)
		return

	var steps = min(4, enemy.pa)
	for i in range(steps):
		var next = _step_toward(enemy.cell, target.cell)
		if next == enemy.cell:
			break
		if not grid.in_bounds(next.x, next.y) or not grid.is_walkable(next.x, next.y):
			break
		if _unit_at_cell(next, 0) != null or _unit_at_cell(next, 1) != null:
			break
		if not enemy.spend_pa(1):
			break
		enemy.cell = next
		enemy.position = grid.cell_to_world(next.x, next.y)
		_trigger_overwatch_on_movement(enemy)

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
	_check_mission_status()

# ---------------- Mission results ----------------

func _check_mission_status() -> void:
	if not mission_active:
		return
	if player_units.is_empty():
		_handle_defeat("Todos os aliados foram derrotados.")
		return

	match mission_objective:
		MissionGenerator.Objective.ELIMINATE:
			if enemy_units.is_empty():
				_handle_victory("Inimigos eliminados.")
		MissionGenerator.Objective.EXTRACT:
			for u in player_units:
				if u.cell == mission_extract_cell:
					_handle_victory("Extração alcançada.")
					return
		MissionGenerator.Objective.DEFEND:
			if timeline != null and timeline.activation_count >= mission_defend_target_activation:
				_handle_victory("Defesa concluída.")
				return
			if enemy_units.is_empty():
				_handle_victory("Inimigos eliminados.")
				return

func _handle_victory(reason: String) -> void:
	if not mission_active:
		return
	mission_active = false
	if timeline:
		timeline.set_process(false)
	if end_turn_btn:
		end_turn_btn.disabled = true
	_set_result_panel(true, "Vitória!", reason)

func _handle_defeat(reason: String) -> void:
	if not mission_active:
		return
	mission_active = false
	if timeline:
		timeline.set_process(false)
	if end_turn_btn:
		end_turn_btn.disabled = true
	_set_result_panel(true, "Derrota", reason)

func _on_next_mission_pressed() -> void:
	_start_new_mission()

# ---------------- Misc helpers ----------------

func _log(msg: String) -> void:
	print(msg)
