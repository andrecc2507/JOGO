# res://scripts/tactical/tactical_controller.gd
extends Node3D
class_name TacticalController

# COMO USAR:
# 1) Chame start_mission(config, roster) com mission_seed/consumables.
# 2) Use InventoryButton para consumir itens (1 por turno).
# 3) Atualize apenas trechos críticos para evitar quebrar o combate.

const MissionGeneratorRef := preload("res://scripts/tactical/mission_generator.gd")
const ChunkMapGeneratorRef := preload("res://scripts/procgen/chunk_map_generator.gd")
const GearRef := preload("res://scripts/tactical/gear.gd")
const EnemyDBRef := preload("res://scripts/tactical/enemy_db.gd")
const RPGStatsRef := preload("res://scripts/rpg/stats.gd")
const RPGClassesRef := preload("res://scripts/rpg/classes_db.gd")
const RPGItemsRef := preload("res://scripts/rpg/items_db.gd")
const RPGProgressionRef := preload("res://scripts/rpg/progression.gd")
const SettingsRef := preload("res://scripts/core/settings.gd")
const COMBAT_FX_PATH := "res://scripts/tactical/combat_fx.gd"
const LOS_PATH := "res://scripts/tactical/los.gd"
const ABILITIES_PATH := "res://scripts/tactical/abilities.gd"
const AI_PATH := "res://scripts/tactical/ai.gd"
var CombatFXRef = load(COMBAT_FX_PATH)
var _los_helper: RefCounted
var _abilities_helper: RefCounted
var _ai: RefCounted

enum ActionMode { MOVE, SHOOT, ABILITY }
enum AbilityTargetMode { CELL, UNIT, SELF }
var action_mode: int = ActionMode.MOVE
enum ViewMode { VIEW_ALL, VIEW_LEVEL_ONLY }
var view_mode: int = ViewMode.VIEW_ALL
var view_level: int = 0
var view_level_tolerance: int = 0
var _max_height: int = 0

@export var unit_scene: PackedScene
@export var map_w: int = 16
@export var map_h: int = 16
@export var auto_start: bool = false

signal mission_completed(result: Dictionary)

@onready var units_root: Node3D = $Units
@onready var obstacles_root: Node3D = $Obstacles
@onready var timeline = get_node_or_null("../TimelineManager")
@onready var _cam: Camera3D = get_node_or_null("../CameraRig/Camera3D") as Camera3D

var ui_root: Control
var ui_label: Label
var aim_label: Label
var end_turn_btn: Button
var _inventory_button: Button
var _hud_root: Control
var _hud_top_left: VBoxContainer
var _hud_top_right: VBoxContainer
var _hud_bottom_left: VBoxContainer
var _hud_bottom_center: Control
var _hud_bottom_right: VBoxContainer

var grid: GridData
var player_units: Array[Unit] = []
var enemy_units: Array[Unit] = []
var enemy_ghosts_by_id: Dictionary = {}
var mission := {}
var mission_state := {"completed": false, "failed": false, "turns": 0}
var mission_objective_type := "KILL_ALL"
var mission_objective_text := ""
var mission_extract_cell: Vector2i = Vector2i(-1, -1)
var mission_turn_limit: int = 0
var mission_seed: int = 0
var mission_active: bool = false
var mission_objectives: Array = []
var mission_objectives_state: Array = []
var mission_capture_cell: Vector2i = Vector2i(-1, -1)
var mission_target_enemy_id: int = 0
var mission_escort_unit_id: int = 0
var _mission_consumables: Array[String] = []
var _consumables_used: Array[String] = []
var _item_used_this_turn: bool = false
var mission_requires_extract: bool = false
var _last_mission_config: Dictionary = {}
var _last_active_team := -1
var _mission_roster: Array = []
var _player_roster_ids: Array[String] = []
var _player_roster_names: Dictionary = {}
var _dead_hero_ids: Array[String] = []
var _mission_enemy_total: int = 0
var _mission_seed_data: MissionSeed
var _demo_classes: Array[String] = []
var _stealth_active: bool = false
var _stealth_state: String = ""
var _stealth_predeploy_bounds := Rect2i()
var _predeploy_units: Array[Unit] = []
var _predeploy_index: int = 0
var _stealth_panel: Panel
var _stealth_label: Label
var _stealth_start_button: Button
var _global_aim_bonus: int = 0
var _global_pa_bonus: int = 0
var _chunk_map_root: Node3D

const XP_PER_KILL := 10
const XP_OBJECTIVE := 25
const GOLD_PER_KILL := 2
const GOLD_OBJECTIVE := 10

# Fog of war state
var visible_enemies: Dictionary = {} # player_id -> Array[Unit]
var known_enemy_cells: Dictionary = {} # enemy_id -> Vector2i
var known_enemy_turn: Dictionary = {} # enemy_id -> int
var visible_players_for_ai: Dictionary = {} # enemy_id -> Array[Unit]
var known_player_cells_for_ai: Dictionary = {} # player_id -> Vector2i
var _last_visibility_hover_cell := Vector2i(-999, -999)

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
const FACING_CONE_DEG := 120.0
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

var fx

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
var _hover_raw := Vector2i(-999, -999)

# Snap smoothing
var _snap_hold_cell := Vector2i(-999, -999)
var _snap_hold_time := 0.0

# Enemy AI gate
var _enemy_acted_for_turn: bool = false

# Hotbar
var _hotbar_root: Control
var _hotbar_buttons: Array[Button] = []
var _hotbar_labels: Array[Label] = []
var _selected_ability: Dictionary = {}
const HOTBAR_KEYS := ["1", "2", "3", "4", "5", "6"]

# Combat log
const LOG_BUFFER_MAX := 100
var _log_buffer: Array[String] = []
var _log_panel: Control
var _log_scroll: ScrollContainer
var _log_label: RichTextLabel

# Status UI
var _status_label: Label
var _missing_cam_logged: bool = false
var _height_label: Label

# Hints
var _hint_label: Label
var _hint_timer: Timer
var _last_hint_msg := ""
var _last_hint_time := -10.0

# Debug overlay
var _debug_panel: Panel
var _debug_label: RichTextLabel
var _debug_visible: bool = false

# Turn order UI
var _turn_panel: Control
var _turn_label: Label

# Facing selection
var _facing_select_active: bool = false
var _facing_select_unit_id: int = 0
var _facing_dir_preview: Vector2i = Vector2i(0, 1)
var _facing_original_dir: Vector3 = Vector3.FORWARD
var _facing_world_preview: Vector3 = Vector3.ZERO
var _facing_arrows: Array[MeshInstance3D] = []
var _facing_arrow_idle_mat: StandardMaterial3D
var _facing_arrow_selected_mat: StandardMaterial3D

# Grid debug
var _grid_debug_visible: bool = false
var _grid_debug_marker: MeshInstance3D
var _grid_debug_last_cell: Vector2i = Vector2i(-999, -999)

# Fire wall (sustained)
var _active_fire_walls: Array[Dictionary] = []
var _fire_wall_pending: Dictionary = {}
var _fire_wall_selecting_dir: bool = false
var _fire_wall_preview_dir: Vector2i = Vector2i(0, 1)
var _fire_wall_preview_cells: Array[Vector2i] = []
var _fire_wall_preview_mmi: MultiMeshInstance3D
var _fire_wall_preview_mm: MultiMesh
var _fire_wall_mmi: MultiMeshInstance3D
var _fire_wall_mm: MultiMesh

# Stealth vision cones
var _stealth_cone_mmi: MultiMeshInstance3D
var _stealth_cone_mm: MultiMesh
const STEALTH_CONE_WIDTH := 0.6

const FIRE_WALL_ABILITY_ID := "FIRE_WALL"

# Enemies HUD
var _enemies_panel: Control
var _enemies_in_los_list: VBoxContainer
var _enemies_last_known_list: VBoxContainer

# Action confirmation
var _confirm_panel: Control
var _confirm_label: Label
var _confirm_button: Button
var _cancel_button: Button
var _pending_action: Dictionary = {}
var confirm_actions_enabled: bool = SettingsRef.combat_confirmations

# Body targeting UI/state
const HIT_ZONE_PRIORITY := ["HEAD", "TORSO", "ARMS", "LEGS"]
var _body_target_panel: Control
var _body_target_title: Label
var _body_target_list: VBoxContainer
var _body_target_target_id: int = 0
var _hit_zone_selection: Dictionary = {} # target_id -> zone_id
var _body_target_hide_timer := 0.0
const BODY_TARGET_HIDE_DELAY := 0.15
var _seen_enemy_ids: Dictionary = {}

# Action flash markers
var caster_ring: MeshInstance3D
var action_target_ring: MeshInstance3D
var _action_marker_timer: Timer

func _ready() -> void:
	_ensure_helpers()
	_ensure_ui_root()
	_ensure_hud()
	_ensure_base_ui()
	_ensure_stealth_ui()
	_ensure_debug_overlay()
	_ensure_visuals()
	_ensure_action_markers()
	_ensure_los_visuals()
	_ensure_hotbar_ui()
	_ensure_objective_marker()
	_ensure_mission_ui()
	_ensure_fx()
	_ensure_log_ui()
	_ensure_status_ui()
	_ensure_height_toggle_label()
	_ensure_hint_ui()
	_ensure_turn_order_ui()
	_ensure_enemies_panel()
	_ensure_action_confirm_panel()
	_ensure_body_target_panel()
	if _cam == null:
		_cam = get_node_or_null("../CameraRig/Pivot/Camera3D") as Camera3D

	# camera bounds
	var camrig = get_node_or_null("../CameraRig")
	if camrig and camrig.has_method("set_bounds"):
		camrig.set_bounds(map_w, map_h, 1.0)

	if timeline != null:
		timeline.active_unit_changed.connect(_on_active_unit_changed)
		timeline.turn_ending.connect(_on_turn_ending)

	if end_turn_btn:
		end_turn_btn.pressed.connect(_on_end_turn_pressed)
	if restart_button:
		restart_button.pressed.connect(_on_restart_pressed)

	if auto_start:
		_start_new_mission()

func _ensure_helpers() -> void:
	if _los_helper == null and ResourceLoader.exists(LOS_PATH):
		var script = load(LOS_PATH)
		if script != null:
			_los_helper = script.new()
	if _abilities_helper == null and ResourceLoader.exists(ABILITIES_PATH):
		var ascript = load(ABILITIES_PATH)
		if ascript != null:
			_abilities_helper = ascript.new()
	if _ai == null and ResourceLoader.exists(AI_PATH):
		var aiscript = load(AI_PATH)
		if aiscript != null:
			_ai = aiscript.new()

func _ensure_ui_root() -> void:
	if ui_root != null:
		return
	var existing_layer = get_node_or_null("../UI") as CanvasLayer
	if existing_layer != null:
		var root = existing_layer.get_node_or_null("UIRoot") as Control
		if root == null:
			root = Control.new()
			root.name = "UIRoot"
			root.set_anchors_preset(Control.PRESET_FULL_RECT)
			root.offset_left = 0
			root.offset_top = 0
			root.offset_right = 0
			root.offset_bottom = 0
			root.mouse_filter = Control.MOUSE_FILTER_PASS
			existing_layer.add_child(root)
			var children = existing_layer.get_children()
			for child in children:
				if child == root:
					continue
				if child is Control:
					existing_layer.remove_child(child)
					root.add_child(child)
		ui_root = root
		return
	var existing = get_node_or_null("../UI") as Control
	if existing != null:
		ui_root = existing
		ui_root.mouse_filter = Control.MOUSE_FILTER_PASS
		return
	var layer := CanvasLayer.new()
	layer.name = "GeneratedUI"
	add_child(layer)
	var root := Control.new()
	root.name = "UI"
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.offset_left = 0
	root.offset_top = 0
	root.offset_right = 0
	root.offset_bottom = 0
	root.mouse_filter = Control.MOUSE_FILTER_PASS
	layer.add_child(root)
	ui_root = root

func _ensure_hud() -> void:
	if ui_root == null:
		return
	_hud_root = ui_root.get_node_or_null("HUD") as Control
	if _hud_root == null:
		_hud_root = Control.new()
		_hud_root.name = "HUD"
		ui_root.add_child(_hud_root)
	if _hud_root != null:
		_hud_root.mouse_filter = Control.MOUSE_FILTER_PASS
		_hud_root.set_anchors_preset(Control.PRESET_FULL_RECT)
		_hud_root.offset_left = 0
		_hud_root.offset_top = 0
		_hud_root.offset_right = 0
		_hud_root.offset_bottom = 0

	_hud_top_left = _hud_root.get_node_or_null("HudTopLeft") as VBoxContainer
	if _hud_top_left == null:
		_hud_top_left = VBoxContainer.new()
		_hud_top_left.name = "HudTopLeft"
		_hud_root.add_child(_hud_top_left)
	if _hud_top_left != null:
		_hud_top_left.mouse_filter = Control.MOUSE_FILTER_PASS
		_hud_top_left.anchor_left = 0.0
		_hud_top_left.anchor_right = 0.0
		_hud_top_left.anchor_top = 1.0
		_hud_top_left.anchor_bottom = 1.0
		_hud_top_left.offset_left = 12
		_hud_top_left.offset_right = 520
		_hud_top_left.offset_top = -240
		_hud_top_left.offset_bottom = -12
		_hud_top_left.add_theme_constant_override("separation", 6)

	_hud_top_right = _hud_root.get_node_or_null("HudTopRight") as VBoxContainer
	if _hud_top_right == null:
		_hud_top_right = VBoxContainer.new()
		_hud_top_right.name = "HudTopRight"
		_hud_root.add_child(_hud_top_right)
	if _hud_top_right != null:
		_hud_top_right.mouse_filter = Control.MOUSE_FILTER_PASS
		_hud_top_right.anchor_left = 1.0
		_hud_top_right.anchor_right = 1.0
		_hud_top_right.anchor_top = 0.0
		_hud_top_right.anchor_bottom = 0.0
		_hud_top_right.offset_left = -360
		_hud_top_right.offset_right = -12
		_hud_top_right.offset_top = 12
		_hud_top_right.offset_bottom = 240
		_hud_top_right.add_theme_constant_override("separation", 6)

	_hud_bottom_left = _hud_root.get_node_or_null("HudBottomLeft") as VBoxContainer
	if _hud_bottom_left == null:
		_hud_bottom_left = VBoxContainer.new()
		_hud_bottom_left.name = "HudBottomLeft"
		_hud_root.add_child(_hud_bottom_left)
	if _hud_bottom_left != null:
		_hud_bottom_left.mouse_filter = Control.MOUSE_FILTER_PASS
		_hud_bottom_left.anchor_left = 0.0
		_hud_bottom_left.anchor_right = 0.0
		_hud_bottom_left.anchor_top = 1.0
		_hud_bottom_left.anchor_bottom = 1.0
		_hud_bottom_left.offset_left = 12
		_hud_bottom_left.offset_right = 420
		_hud_bottom_left.offset_top = -220
		_hud_bottom_left.offset_bottom = -12
		_hud_bottom_left.add_theme_constant_override("separation", 6)

	_hud_bottom_center = _hud_root.get_node_or_null("HudBottomCenter") as Control
	if _hud_bottom_center == null:
		_hud_bottom_center = Control.new()
		_hud_bottom_center.name = "HudBottomCenter"
		_hud_root.add_child(_hud_bottom_center)
	if _hud_bottom_center != null:
		_hud_bottom_center.mouse_filter = Control.MOUSE_FILTER_PASS
		_hud_bottom_center.anchor_left = 0.5
		_hud_bottom_center.anchor_right = 0.5
		_hud_bottom_center.anchor_top = 1.0
		_hud_bottom_center.anchor_bottom = 1.0
		_hud_bottom_center.offset_left = -400
		_hud_bottom_center.offset_right = 400
		_hud_bottom_center.offset_top = -110
		_hud_bottom_center.offset_bottom = -12

	_hud_bottom_right = _hud_root.get_node_or_null("HudBottomRight") as VBoxContainer
	if _hud_bottom_right == null:
		_hud_bottom_right = VBoxContainer.new()
		_hud_bottom_right.name = "HudBottomRight"
		_hud_root.add_child(_hud_bottom_right)
	if _hud_bottom_right != null:
		_hud_bottom_right.mouse_filter = Control.MOUSE_FILTER_PASS
		_hud_bottom_right.anchor_left = 1.0
		_hud_bottom_right.anchor_right = 1.0
		_hud_bottom_right.anchor_top = 1.0
		_hud_bottom_right.anchor_bottom = 1.0
		_hud_bottom_right.offset_left = -240
		_hud_bottom_right.offset_right = -12
		_hud_bottom_right.offset_top = -120
		_hud_bottom_right.offset_bottom = -12
		_hud_bottom_right.add_theme_constant_override("separation", 6)

func _reparent_control(node: Control, parent: Control) -> void:
	if node == null or parent == null:
		return
	if node.get_parent() == parent:
		return
	var old_parent = node.get_parent()
	if old_parent != null:
		old_parent.remove_child(node)
	parent.add_child(node)

func _ensure_base_ui() -> void:
	if ui_root == null:
		return
	ui_label = ui_root.get_node_or_null("TurnLabel") as Label
	if ui_label == null:
		ui_label = Label.new()
		ui_label.name = "TurnLabel"
		ui_root.add_child(ui_label)
	if ui_label != null:
		ui_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		if _hud_bottom_left != null:
			_reparent_control(ui_label, _hud_bottom_left)
		ui_label.anchor_left = 0.0
		ui_label.anchor_right = 1.0
		ui_label.anchor_top = 0.0
		ui_label.anchor_bottom = 0.0
		ui_label.offset_left = 0
		ui_label.offset_right = 0
		ui_label.offset_top = 0
		ui_label.offset_bottom = 90
		ui_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		ui_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		ui_label.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	aim_label = ui_root.get_node_or_null("AimLabel") as Label
	if aim_label == null:
		aim_label = Label.new()
		aim_label.name = "AimLabel"
		ui_root.add_child(aim_label)
	if aim_label != null:
		aim_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		if _hud_top_right != null:
			_reparent_control(aim_label, _hud_top_right)
		aim_label.anchor_left = 0.0
		aim_label.anchor_right = 1.0
		aim_label.anchor_top = 0.0
		aim_label.anchor_bottom = 0.0
		aim_label.offset_left = 0
		aim_label.offset_right = 0
		aim_label.offset_top = 0
		aim_label.offset_bottom = 0
		aim_label.custom_minimum_size = Vector2(0, 56)
		aim_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		aim_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		aim_label.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	end_turn_btn = ui_root.get_node_or_null("EndTurnButton") as Button
	if end_turn_btn == null:
		end_turn_btn = get_node_or_null("../UI/EndTurnButton") as Button
	if end_turn_btn != null:
		end_turn_btn.mouse_filter = Control.MOUSE_FILTER_STOP
		if _hud_bottom_right != null:
			_reparent_control(end_turn_btn, _hud_bottom_right)
		end_turn_btn.anchor_left = 0.0
		end_turn_btn.anchor_right = 1.0
		end_turn_btn.anchor_top = 0.0
		end_turn_btn.anchor_bottom = 0.0
		end_turn_btn.offset_left = 0
		end_turn_btn.offset_right = 0
		end_turn_btn.offset_top = 0
		end_turn_btn.offset_bottom = 40

	_inventory_button = ui_root.get_node_or_null("InventoryButton") as Button
	if _inventory_button == null:
		_inventory_button = Button.new()
		_inventory_button.name = "InventoryButton"
		_inventory_button.text = "Inventário"
		ui_root.add_child(_inventory_button)
	if _inventory_button != null:
		_inventory_button.mouse_filter = Control.MOUSE_FILTER_STOP
		if not _inventory_button.pressed.is_connected(_on_inventory_pressed):
			_inventory_button.pressed.connect(_on_inventory_pressed)

func _start_new_mission() -> void:
	setup_encounter({})

func start_mission(arg1: Dictionary, roster: Array = []) -> void:
	var config: Dictionary = {}
	if arg1.has("mission") or arg1.has("roster"):
		config = arg1
	else:
		config["mission"] = arg1
		if arg1.has("mission_seed"):
			config["mission_seed"] = arg1.get("mission_seed")
		if arg1.has("consumables"):
			config["consumables"] = arg1.get("consumables", [])
		config["roster"] = roster
		config["seed"] = int(arg1.get("seed", config.get("mission", {}).get("seed", 0)))
	setup_encounter(config)
	if ui_root:
		ui_root.visible = true
	if end_turn_btn:
		end_turn_btn.disabled = false

func _reset_current_mission() -> void:
	if _last_mission_config.is_empty():
		return
	setup_encounter(_last_mission_config)
	if ui_root:
		ui_root.visible = true
	if end_turn_btn:
		end_turn_btn.disabled = false

func _fallback_roster_from_world_state() -> Array:
	var fallback: Array = []
	var world_state = get_tree().get_first_node_in_group("world_state")
	if world_state == null:
		return fallback
	if world_state.has_method("ensure_roster_seeded_if_empty"):
		world_state.ensure_roster_seeded_if_empty()
	var party_ids: Array = []
	if world_state.get("active_party_ids") != null:
		party_ids = world_state.active_party_ids
	var roster_value: Variant = world_state.get("roster")
	var roster_list: Array = roster_value if roster_value is Array else []
	for hero in roster_list:
		if bool(hero.get("dead", false)):
			continue
		if party_ids.is_empty() or party_ids.has(String(hero.get("id", ""))):
			fallback.append(hero.duplicate(true))
	return fallback

func _build_fallback_mission(w: int, h: int) -> Dictionary:
	var map_w: int = max(8, w)
	var map_h: int = max(8, h)
	var player_spawn: Vector2i = Vector2i(1, map_h - 2)
	var enemy_spawn: Vector2i = Vector2i(map_w - 2, 1)
	return {
		"map_w": map_w,
		"map_h": map_h,
		"type": "SKIRMISH",
		"mission_type": "SKIRMISH",
		"objective_type": "KILL_ALL",
		"objective_text": "Elimine todos os inimigos.",
		"player_spawns": [player_spawn],
		"enemy_spawns": [enemy_spawn],
		"enemy_profile": [{"archetype": "skirmisher", "count": 1}]
	}

func _spawn_test_mission() -> void:
	var seed = randi()
	var missions = MissionGeneratorRef.generate_hub_missions(seed, 1)
	if missions.is_empty():
		return
	var mission_def = missions[0]
	var roster: Array = []
	start_mission(mission_def, roster)

func end_mission_cleanup() -> void:
	_clear_current_mission()
	if ui_root:
		ui_root.visible = false
	if end_turn_btn:
		end_turn_btn.disabled = true
	if timeline:
		timeline.set_process(false)

func setup_encounter(config: Dictionary) -> void:
	_clear_current_mission()
	_last_mission_config = config.duplicate(true)
	var bonuses := _get_general_bonuses()
	_global_aim_bonus = int(bonuses.get("party_aim_bonus", 0))
	_global_pa_bonus = int(bonuses.get("party_pa_max", 0))

	var w = int(config.get("map_w", mission.get("map_w", map_w)))
	var h = int(config.get("map_h", mission.get("map_h", map_h)))
	if w <= 0: w = 16
	if h <= 0: h = 16
	map_w = w
	map_h = h
	grid = GridData.new(w, h)

	mission = config.get("mission", {})
	if mission.is_empty():
		push_error("TacticalController: mission vazio (config malformado)")
		mission = _build_fallback_mission(w, h)
		push_warning("TacticalController: usando missão fallback para evitar mapa vazio.")

	_mission_roster = config.get("roster", [])
	if _mission_roster.is_empty():
		push_warning("TacticalController: roster vazio; tentando fallback do WorldState/party")
		_mission_roster = _fallback_roster_from_world_state()
	if _mission_roster.is_empty():
		push_warning("TacticalController: roster vazio; usando heróis dummy.")
	_mission_seed_data = config.get("mission_seed", null)
	_demo_classes.clear()
	for entry in config.get("demo_classes", []):
		var class_id := String(entry)
		if class_id != "":
			_demo_classes.append(class_id)
	_player_roster_ids.clear()
	_player_roster_names.clear()
	_dead_hero_ids.clear()
	_mission_enemy_total = 0
	_mission_consumables.clear()
	var raw_consumables: Array = config.get("consumables", [])
	for c in raw_consumables:
		if c == null:
			continue
		var s := String(c)
		if s != "":
			_mission_consumables.append(s)

	_consumables_used.clear()
	_item_used_this_turn = false

	mission_seed = int(config.get("seed", mission.get("seed", 0)))
	mission_objective_type = String(mission.get("objective_type", "KILL_ALL"))
	mission_objective_text = String(mission.get("objective_text", ""))
	mission_extract_cell = mission.get("extract_cell", Vector2i(-1, -1))
	mission_objectives = mission.get("objectives", [])
	mission_objectives_state = []
	mission_capture_cell = mission.get("capture_cell", Vector2i(-1, -1))
	mission_target_enemy_id = 0
	mission_escort_unit_id = 0
	mission_requires_extract = bool(mission.get("requires_extract", false))
	mission_turn_limit = int(mission.get("turn_limit", 0))
	mission_state = {"completed": false, "failed": false, "turns": 0}
	_last_active_team = -1
	_stealth_active = false
	_stealth_state = ""
	_predeploy_units.clear()
	_predeploy_index = 0
	_stealth_predeploy_bounds = Rect2i()
	_active_fire_walls.clear()
	_fire_wall_pending = {}
	_fire_wall_selecting_dir = false
	_fire_wall_preview_cells.clear()
	_clear_fire_wall_preview()
	_update_fire_wall_visuals()
	visible_enemies.clear()
	known_enemy_cells.clear()
	known_enemy_turn.clear()
	_seen_enemy_ids.clear()
	visible_players_for_ai.clear()
	known_player_cells_for_ai.clear()
	_last_visibility_hover_cell = Vector2i(-999, -999)
	_log_buffer.clear()
	_update_log_ui()

	_build_map_from_mission()
	_spawn_units_from_mission()
	_setup_stealth_mode()

	_update_mission_ui()
	_update_inventory_button()
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
	call_deferred("_initialize_first_active_unit")

	if _stealth_active and timeline:
		timeline.set_process(false)

	_rebuild_obstacles_visual()
	_reach_cost = {}
	_clear_aoe_preview()
	_hide_los_visuals()
	_update_enemy_visibility()

	var camrig = get_node_or_null("../CameraRig")
	if camrig and camrig.has_method("set_bounds"):
		camrig.set_bounds(w, h, 1.0)

func _initialize_first_active_unit() -> void:
	if timeline == null or not timeline.has_method("get_active_unit"):
		return
	var act: Unit = timeline.get_active_unit()
	if act != null:
		_on_active_unit_changed(act)

func _clear_current_mission() -> void:
	_clear_chunk_map()
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

	for ghost in enemy_ghosts_by_id.values():
		if is_instance_valid(ghost):
			ghost.queue_free()
	enemy_ghosts_by_id.clear()

	if extract_marker:
		extract_marker.visible = false

	_reach_cost = {}
	_clear_aoe_preview()
	_clear_target_overlay()
	_hide_los_visuals()
	_hide_path_preview()
	_clear_body_target_selection()
	mission_active = false
	_mission_consumables.clear()
	_consumables_used.clear()
	_item_used_this_turn = false
	_demo_classes.clear()
	_stealth_active = false
	_stealth_state = ""
	_predeploy_units.clear()
	_predeploy_index = 0
	_fire_wall_pending = {}
	_fire_wall_selecting_dir = false
	_fire_wall_preview_cells.clear()
	_clear_fire_wall_preview()
	_active_fire_walls.clear()
	_update_fire_wall_visuals()
	_facing_select_active = false
	_facing_select_unit_id = 0
	_hide_facing_arrows()
	if _stealth_cone_mm != null:
		_stealth_cone_mm.instance_count = 0
	if _stealth_panel != null:
		_stealth_panel.visible = false
	visible_enemies.clear()
	known_enemy_cells.clear()
	known_enemy_turn.clear()
	visible_players_for_ai.clear()
	known_player_cells_for_ai.clear()

func _clear_chunk_map() -> void:
	if _chunk_map_root != null and is_instance_valid(_chunk_map_root):
		_chunk_map_root.queue_free()
	_chunk_map_root = null

func _build_map_from_mission() -> void:
	if _try_build_chunk_map():
		return
	var heights: Dictionary = mission.get("heights", {})
	_max_height = 0
	for cell in heights.keys():
		var z = int(heights[cell])
		grid.set_height(cell.x, cell.y, z)
		_max_height = max(_max_height, z)

	var obstacles: Array = mission.get("obstacles", [])
	for ob in obstacles:
		var cell = ob.get("cell", Vector2i.ZERO)
		var mat = int(ob.get("mat", Damage.MatType.WOOD))
		var hp = int(ob.get("hp", 6))
		grid.set_obstacle(cell.x, cell.y, mat, hp)

func _try_build_chunk_map() -> bool:
	if _mission_seed_data == null:
		return false
	var biome_id := String(mission.get("biome_id", _mission_seed_data.biome_id)).strip_edges()
	if biome_id == "":
		return false
	var generator := ChunkMapGeneratorRef.new()
	var chunk_grid := generator.get_default_chunk_grid_for_biome(biome_id, Vector2i(3, 3))
	var layout := generator.generate_chunk_layout(biome_id, chunk_grid, mission_seed)
	if layout.is_empty() or not _layout_has_entries(layout):
		push_warning("TacticalController: layout de chunks vazio; usando mapa padrão.")
		return false
	_clear_chunk_map()
	_chunk_map_root = generator.build_scene_from_layout(layout, self, 1.0)
	var bounds := generator.get_layout_cell_bounds(layout, Vector2i(10, 10))
	if bounds.x <= 0 or bounds.y <= 0:
		bounds = Vector2i(chunk_grid.x * 10, chunk_grid.y * 10)
	map_w = bounds.x
	map_h = bounds.y
	grid = GridData.new(map_w, map_h)
	_max_height = 0
	_ensure_chunk_spawns()
	var camrig = get_node_or_null("../CameraRig")
	if camrig and camrig.has_method("set_bounds"):
		camrig.set_bounds(map_w, map_h, 1.0)
	print("TacticalController: Generated map biome=%s chunks=%dx%d cells=%dx%d" % [
		biome_id,
		chunk_grid.x,
		chunk_grid.y,
		map_w,
		map_h
	])
	return true

func _layout_has_entries(layout: Array) -> bool:
	for row in layout:
		if row is Array:
			for entry in row:
				if entry is Dictionary and not entry.is_empty():
					return true
	return false

func _ensure_chunk_spawns() -> void:
	var player_spawns: Array = mission.get("player_spawns", [])
	var enemy_spawns: Array = mission.get("enemy_spawns", [])
	if not _spawns_valid(player_spawns):
		mission["player_spawns"] = _default_player_spawns()
	if not _spawns_valid(enemy_spawns):
		mission["enemy_spawns"] = _default_enemy_spawns()

func _spawns_valid(spawns: Array) -> bool:
	if spawns.is_empty() or grid == null:
		return false
	for spawn in spawns:
		if spawn is Vector2i:
			if not grid.in_bounds(spawn.x, spawn.y):
				return false
		else:
			return false
	return true

func _default_player_spawns() -> Array:
	return [
		_clamp_cell(Vector2i(1, map_h - 2)),
		_clamp_cell(Vector2i(2, map_h - 3))
	]

func _default_enemy_spawns() -> Array:
	return [
		_clamp_cell(Vector2i(map_w - 2, 1)),
		_clamp_cell(Vector2i(map_w - 3, 2))
	]

func _clamp_cell(cell: Vector2i) -> Vector2i:
	var x := clamp(cell.x, 0, max(0, map_w - 1))
	var y := clamp(cell.y, 0, max(0, map_h - 1))
	return Vector2i(x, y)

func _spawn_units_from_mission() -> void:
	if unit_scene == null:
		push_error("unit_scene não setado no TacticalController")
		return

	var player_spawns: Array = mission.get("player_spawns", [])
	var enemy_spawns: Array = mission.get("enemy_spawns", [])
	var player_count = max(2, player_spawns.size())
	if not _demo_classes.is_empty():
		player_count = _demo_classes.size()
	elif not _mission_roster.is_empty():
		player_count = _mission_roster.size()
	var enemy_profile: Array = mission.get("enemy_profile", [])
	var enemy_count = max(3, enemy_spawns.size())
	var enemy_archetypes: Array = []
	for entry in enemy_profile:
		if entry is String:
			entry = {"archetype": entry, "count": 1}
		var count = int(entry.get("count", 1))
		var archetype = String(entry.get("archetype", "skirmisher"))
		for i in range(count):
			var entry_copy = entry.duplicate(true)
			entry_copy["archetype"] = archetype
			enemy_archetypes.append(entry_copy)
	if enemy_archetypes.is_empty():
		for i in range(enemy_count):
			enemy_archetypes.append({"archetype": "skirmisher", "count": 1})

	for i in range(player_count):
		var cell: Vector2i = _spawn_cell_for_player(i, player_spawns)
		var u: Unit
		if not _demo_classes.is_empty():
			u = _make_player_unit_from_class(_demo_classes[i], i)
		elif not _mission_roster.is_empty():
			u = _make_player_unit_from_roster(_mission_roster[i])
		else:
			u = _make_player_unit(i)
		_add_unit(u, cell)

	for i in range(enemy_archetypes.size()):
		var ecell: Vector2i = _spawn_cell_for_enemy(i, enemy_spawns)
		var archetype_data = enemy_archetypes[i]
		var e := _make_enemy_unit(i, archetype_data)
		_add_unit(e, ecell)
	_mission_enemy_total = enemy_units.size()

	if _requires_vip() and mission_escort_unit_id == 0:
		_spawn_vip_unit(player_spawns)

	_initialize_objectives()

func _requires_vip() -> bool:
	for obj in mission_objectives:
		if String(obj.get("type", "")) == "escort_unit_to_extract":
			return true
	return false

func _spawn_vip_unit(player_spawns: Array) -> void:
	if unit_scene == null:
		return
	var vip: Unit = unit_scene.instantiate()
	vip.team = 0
	vip.unit_name = "Aliado Escoltado"
	vip.role = "vip"
	vip.tags = ["vip"]
	vip.dex = 8
	vip.agi = 8
	vip.def = 6
	vip.speed = 8
	vip.base_max_hp = 18
	vip.pa_max = 6
	vip.abilities = _kit_for_id("vanguard")
	var cell = _spawn_cell_for_player(player_units.size(), player_spawns)
	_add_unit(vip, cell)
	mission_escort_unit_id = vip.get_instance_id()

func _initialize_objectives() -> void:
	if mission_objectives.is_empty():
		mission_objectives = _default_objectives_for_type()
	mission_objectives_state.clear()
	for obj in mission_objectives:
		var state = obj.duplicate(true)
		state["completed"] = false
		mission_objectives_state.append(state)
	_assign_objective_targets()

func _default_objectives_for_type() -> Array:
	match mission_objective_type:
		"EXTRACT":
			return [{"type": "extract", "text": "Chegue no ponto de extração."}]
		"SURVIVE":
			return [{"type": "survive_turns", "turns": mission_turn_limit, "text": "Resista por %d turnos." % mission_turn_limit}]
		_:
			return [{"type": "kill_all", "text": "Elimine todos os inimigos."}]

func _assign_objective_targets() -> void:
	for obj in mission_objectives_state:
		var obj_type = String(obj.get("type", ""))
		if obj_type == "kill_target" and mission_target_enemy_id == 0:
			var target = _pick_random_enemy()
			if target != null:
				mission_target_enemy_id = target.get_instance_id()
				obj["target_id"] = mission_target_enemy_id
		elif obj_type == "capture_tile" and mission_capture_cell.x < 0:
			mission_capture_cell = Vector2i(int(map_w / 2), int(map_h / 2))
			obj["cell"] = mission_capture_cell
		elif obj_type == "escort_unit_to_extract":
			if mission_escort_unit_id != 0:
				obj["unit_id"] = mission_escort_unit_id

func _make_player_unit(idx: int) -> Unit:
	var u: Unit = unit_scene.instantiate()
	u.hero_id = "hero_%03d" % (idx + 1)
	if idx == 0:
		u.unit_name = "Batedor"
		u.rpg_class_id = "PATRULHEIRO"
		u.dex = 12
		u.agi = 14
		u.def = 8
		u.speed = 16
		u.mp_max = 5
	else:
		u.unit_name = "Vanguarda"
		u.rpg_class_id = "GUERREIRO"
		u.dex = 8
		u.agi = 8
		u.def = 14
		u.speed = 8
		u.mp_max = 3
	u.team = 0
	if _global_pa_bonus != 0:
		u.pa_max = max(1, u.pa_max + _global_pa_bonus)
	var kit_id = "ranger" if idx == 0 else "vanguard"
	u.abilities = _kit_for_id(kit_id)
	if not _player_roster_ids.has(u.hero_id):
		_player_roster_ids.append(u.hero_id)
		_player_roster_names[u.hero_id] = u.unit_name
	return u

func _make_player_unit_from_class(class_id: String, idx: int) -> Unit:
	var u: Unit = unit_scene.instantiate()
	u.team = 0
	var classes_db := RPGClassesRef.new()
	var normalized_id := class_id.strip_edges().to_upper()
	var class_def: Dictionary = classes_db.get_class_data(normalized_id)
	if class_def.is_empty():
		normalized_id = "GUERREIRO"
		class_def = classes_db.get_class_data(normalized_id)
	u.apply_class(normalized_id)
	u.hero_id = "demo_%02d" % (idx + 1)
	var label := String(class_def.get("label", normalized_id))
	u.unit_name = "Demo %s" % label
	if _global_pa_bonus != 0:
		u.pa_max = max(1, u.pa_max + _global_pa_bonus)
	var kit_id := String(class_def.get("kit_id", "vanguard"))
	u.abilities = _kit_for_id(kit_id)
	if not _player_roster_ids.has(u.hero_id):
		_player_roster_ids.append(u.hero_id)
		_player_roster_names[u.hero_id] = u.unit_name
	return u

func _make_player_unit_from_roster(data: Dictionary) -> Unit:
	var u: Unit = unit_scene.instantiate()
	u.team = 0
	u.unit_name = str(data.get("name", "Hero"))
	u.hero_id = str(data.get("id", ""))
	u.rpg_class_id = String(data.get("class_id", data.get("class", "")))
	var stats: Dictionary = data.get("stats", {})
	if not data.has("stats"):
		stats = data.get("current_stats", data.get("base_stats", {}))
	u.base_max_hp = int(stats.get("hp_max", 20))
	u.dex = int(stats.get("dex", 10))
	u.agi = int(stats.get("agi", 10))
	u.def = int(stats.get("def", 10))
	u.speed = int(stats.get("speed", 10))
	u.perception = int(stats.get("perception", 10))
	u.vision_range = int(stats.get("vision_range", 9))
	u.vis_range = u.vision_range
	u.pa_max = int(stats.get("pa_max", 8))
	u.mp_max = int(stats.get("mp_max", 6))
	if _global_pa_bonus != 0:
		u.pa_max = max(1, u.pa_max + _global_pa_bonus)
	var equipped: Dictionary = {"weapon": null, "armor": null, "charm": null}
	var gear_ids: Dictionary = data.get("gear", {})
	for slot in ["weapon", "armor", "charm"]:
		var item_id = str(gear_ids.get(slot, ""))
		if item_id != "":
			var item_data = _resolve_item_data(item_id)
			if not item_data.is_empty():
				equipped[slot] = item_data
	u.equipped = equipped
	var kit_id = str(data.get("abilities_kit", data.get("kit_id", "ranger")))
	u.abilities = _kit_for_id(kit_id)
	if u.hero_id != "" and not _player_roster_ids.has(u.hero_id):
		_player_roster_ids.append(u.hero_id)
		_player_roster_names[u.hero_id] = u.unit_name
	return u

func _resolve_item_data(item_id: String) -> Dictionary:
	if item_id == "":
		return {}
	var world_state = get_tree().get_first_node_in_group("world_state")
	if world_state != null and world_state.has_method("get_item_data"):
		var item = world_state.get_item_data(item_id)
		if not item.is_empty():
			return item
	return GearRef.get_item(item_id)

func _get_general_bonuses() -> Dictionary:
	var world_state = get_tree().get_first_node_in_group("world_state")
	if world_state != null and world_state.has_method("get_general_bonus_summary"):
		return world_state.get_general_bonus_summary()
	return {}

func _make_enemy_unit(idx: int, archetype_data: Variant = "skirmisher") -> Unit:
	var data: Dictionary = {}
	var archetype_id = "skirmisher"
	if archetype_data is Dictionary:
		data = archetype_data
		archetype_id = String(data.get("archetype", "skirmisher"))
	elif archetype_data is String:
		archetype_id = archetype_data

	if archetype_id == "acolyte":
		return _make_acolyte_unit(idx, data)

	var u: Unit = unit_scene.instantiate()
	u.team = 1
	u.init_default_hit_zones()
	var archetype = EnemyDBRef.get_archetype(archetype_id)
	var stats: Dictionary = archetype.get("stats", {})
	u.unit_name = String(archetype.get("name", "Inimigo"))
	u.role = String(archetype.get("role", "skirmisher"))
	u.ai_profile = {
		"aggression": float(archetype.get("aggression", 0.5)),
		"patrol_mode": String(archetype.get("patrol_mode", "radius")),
		"patrol_radius": int(archetype.get("patrol_radius", 3)),
		"patrol_points": archetype.get("patrol_points", [])
	}
	u.base_max_hp = int(stats.get("hp_max", 18))
	u.dex = int(stats.get("dex", 10))
	u.agi = int(stats.get("agi", 10))
	u.def = int(stats.get("def", 10))
	u.speed = int(stats.get("speed", 10))
	u.perception = int(stats.get("perception", 10))
	u.vision_range = int(stats.get("vision_range", 9))
	u.pa_max = int(stats.get("pa_max", 8))
	u.abilities = _kit_for_id(String(archetype.get("kit", "skirmisher")))
	if archetype_id == "brute":
		var torso = u.get_hit_zone("TORSO")
		if not torso.is_empty():
			torso["dmg_mult"] = 0.85
			u.set_hit_zone("TORSO", torso)
		var head = u.get_hit_zone("HEAD")
		if not head.is_empty():
			head["enabled"] = false
			u.set_hit_zone("HEAD", head)
	return u

func _make_acolyte_unit(idx: int, data: Dictionary) -> Unit:
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	var u: Unit = unit_scene.instantiate()
	u.team = 1
	u.init_default_hit_zones()

	var classes_db = RPGClassesRef.new()
	var class_id = String(data.get("class_id", ""))
	var all_classes: Dictionary = classes_db.get_all_class_data()
	if class_id == "" and not all_classes.is_empty():
		var class_keys = all_classes.keys()
		class_id = String(class_keys[rng.randi_range(0, class_keys.size() - 1)])
	var class_def: Dictionary = classes_db.get_class_data(class_id)
	if class_def.is_empty():
		return u

	u.apply_class(class_id)
	u.unit_name = "Acolyte %s" % String(class_def.get("label", class_id))
	u.role = String(class_def.get("role_hint", "skirmisher"))

	var tier = int(data.get("tier", 1))
	u.level = RPGProgressionRef.roll_level_for_tier(tier, rng)
	u.skill_points = RPGProgressionRef.total_skill_points(u.level)
	u.stat_points = RPGProgressionRef.total_stat_points(u.level)

	var build_id = String(data.get("build_id", ""))
	if build_id == "":
		var build_ids: Array = classes_db.list_build_ids(class_id)
		if not build_ids.is_empty():
			build_id = String(build_ids[rng.randi_range(0, build_ids.size() - 1)])
	var build: Dictionary = classes_db.get_build(class_id, build_id)
	var weights: Dictionary = build.get("stat_weights", {})
	u.base_stats = RPGProgressionRef.allocate_stat_points(u.base_stats, u.stat_points, weights)
	u.stat_points = 0
	u.stat_str = int(u.base_stats.get("STR", u.stat_str))
	u.stat_dex = int(u.base_stats.get("DEX", u.stat_dex))
	u.stat_agi = int(u.base_stats.get("AGI", u.stat_agi))
	u.stat_vit = int(u.base_stats.get("VIT", u.stat_vit))
	u.stat_int = int(u.base_stats.get("INT", u.stat_int))

	var kit_id = String(build.get("kit_id", class_def.get("kit_id", "ranger")))
	u.abilities = _kit_for_id(kit_id)

	for skill_id in build.get("skills", []):
		if u.skill_points <= 0:
			break
		if u.unlock_skill(String(skill_id)):
			continue

	var weapon_tags: Array = class_def.get("weapon_tags", [])
	var weapons = RPGItemsRef.items_by_tier_and_tags("weapon", tier, weapon_tags)
	if weapons.is_empty():
		weapons = RPGItemsRef.items_by_tier_and_tags("weapon", tier, [])
	if not weapons.is_empty():
		u.equip(weapons[rng.randi_range(0, weapons.size() - 1)])

	var armors = RPGItemsRef.items_by_tier_and_tags("armor", tier, [])
	if not armors.is_empty():
		u.equip(armors[rng.randi_range(0, armors.size() - 1)])

	var amulets = RPGItemsRef.items_by_tier_and_tags("amulet", tier, [])
	if not amulets.is_empty():
		u.equip(amulets[rng.randi_range(0, amulets.size() - 1)])
	if amulets.size() > 1:
		u.equip(amulets[rng.randi_range(0, amulets.size() - 1)])

	u.ai_profile = {
		"aggression": float(build.get("aggression", 0.6)),
		"patrol_mode": String(build.get("patrol_mode", "radius")),
		"patrol_radius": int(build.get("patrol_radius", 3))
	}

	u._recalc_derived()
	return u

func _add_unit(u: Unit, c: Vector2i) -> void:
	u.cell = c
	u.position = grid.cell_to_world(c.x, c.y)
	units_root.add_child(u)
	if u.team == 0:
		player_units.append(u)
	else:
		enemy_units.append(u)

func _setup_stealth_mode() -> void:
	var mission_type = String(mission.get("type", "")).to_upper()
	_stealth_active = mission_type == "STEALTH" or bool(mission.get("stealth", false))
	if not _stealth_active:
		if _stealth_panel != null:
			_stealth_panel.visible = false
		return
	_stealth_state = "PREP"
	_predeploy_units = []
	for u in player_units:
		if u != null and not u.dead:
			_predeploy_units.append(u)
	_predeploy_index = 0
	_stealth_predeploy_bounds = _default_predeploy_bounds()
	if _stealth_panel != null:
		_stealth_panel.visible = true
	_update_stealth_label()
	_hint("Modo STEALTH: posicione seu squad.")

func _default_predeploy_bounds() -> Rect2i:
	var width = 6
	var height = 3
	var x = 1
	var y = max(1, map_h - height - 1)
	return Rect2i(x, y, width, height)

func _on_active_unit_changed(u: Unit) -> void:
	if not mission_active:
		return
	if u == null:
		return
	_apply_fire_wall_tick(u)
	_clear_pending_action()
	if u.team == 0 and _last_active_team != 0:
		mission_state["turns"] = int(mission_state.get("turns", 0)) + 1
	_update_mission_ui()
	_last_active_team = u.team
	_snap_hold_cell = Vector2i(-999, -999)
	_snap_hold_time = 0.0
	_enemy_acted_for_turn = false
	if u.team == 0:
		_item_used_this_turn = false

	_hide_los_visuals()
	_clear_aoe_preview()
	_clear_fire_wall_preview()

	u.overwatch_used = false
	u.overwatch = false
	u.tick_cooldowns()
	if _handle_channeling_on_turn_start(u):
		return
	var status_events = u.tick_statuses_on_turn_start()
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
		var blocked = get_occupied_cells(u)
		_reach_cost = Pathfinding.reachable_with_pa(grid, u.cell, u.pa, u, blocked)
		_build_reach_overlay(_reach_cost)
	else:
		_reach_cost = {}
		_build_reach_overlay(_reach_cost)

	_selected_ability = {}
	action_mode = ActionMode.MOVE
	_refresh_hotbar(u)
	_clear_target_overlay()
	_refresh_ui(u, Vector2i(-999, -999), Vector2i(-999, -999), null, null, _evaluate_ability_target(u, Vector2i(-999, -999)))
	_update_enemy_visibility()
	_update_enemies_panel(u)

	var camrig = get_node_or_null("../CameraRig")
	if camrig:
		if camrig.has_method("focus_world"):
			camrig.focus_world(u.global_position)
		elif camrig.has_method("center_on_world"):
			camrig.center_on_world(u.global_position)
	_set_view_level_from_cell(u.cell)

	_update_active_ring(u)
	_update_turn_order_ui()
	_update_status_ui(u)

	_check_mission_status()

func _on_turn_ending(u: Unit) -> void:
	if u == null:
		return
	_handle_status_events(u, u.tick_statuses_on_turn_end(), "end")
	_update_status_ui(u)
	u.took_damage_since_last_turn = false

func _handle_channeling_on_turn_start(u: Unit) -> bool:
	if u == null or not u.channeling:
		return false
	var wall = _find_fire_wall_for_caster(u)
	if wall.is_empty():
		u.channeling = false
		u.channel_ability = {}
		return false
	if u.took_damage_since_last_turn:
		_log("%s perdeu a concentração e a Parede de Fogo se dissipou." % u.unit_name)
		_end_fire_wall_channel(u)
		u.took_damage_since_last_turn = false
		return false
	var mp_cost = int(wall.get("mp_cost", 0))
	if mp_cost > 0 and u.mp < mp_cost:
		_log("%s ficou sem MP para manter a Parede de Fogo." % u.unit_name)
		_end_fire_wall_channel(u)
		u.took_damage_since_last_turn = false
		return false
	if u.team == 0:
		_begin_fire_wall_upkeep_prompt(u, mp_cost)
		u.took_damage_since_last_turn = false
		return true
	u.mp = max(0, u.mp - mp_cost)
	u.pa = 0
	if timeline != null:
		timeline.force_end_active_turn()
	u.took_damage_since_last_turn = false
	return true

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

func _handle_stealth_predeploy_input(event: InputEvent) -> void:
	if _predeploy_units.is_empty():
		return
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_TAB:
			_predeploy_index = (_predeploy_index + 1) % _predeploy_units.size()
			_update_stealth_label()
			return
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var hit = _raycast_to_board()
		if hit == null or grid == null:
			return
		var pos = hit.get("plane_position", hit.position)
		if pos == null:
			return
		var cell: Vector2i = _world_to_cell_precise(pos)
		if not grid.in_bounds(cell.x, cell.y):
			return
		if not _stealth_predeploy_bounds.has_point(cell):
			_hint("Fora da zona de infiltração.")
			return
		if is_cell_occupied(cell, _predeploy_units[_predeploy_index]):
			_hint("Célula ocupada.")
			return
		var u: Unit = _predeploy_units[_predeploy_index]
		u.cell = cell
		u.position = grid.cell_to_world(cell.x, cell.y)
		_predeploy_index = (_predeploy_index + 1) % _predeploy_units.size()
		_update_stealth_label()

func _begin_facing_selection(act: Unit) -> void:
	if act == null or _facing_select_active:
		return
	_facing_select_active = true
	_facing_select_unit_id = act.get_instance_id()
	_facing_original_dir = act.facing_dir
	_facing_world_preview = Vector3.ZERO
	_facing_dir_preview = _unit_facing_dir_cell(act)
	if timeline != null:
		timeline.set_process(false)
	_clear_target_overlay()
	_clear_aoe_preview()
	_clear_fire_wall_preview()
	_preview_unit_facing(act, _facing_dir_preview)
	_hint("Escolha direção (WASD/Setas ou clique).")

func _handle_facing_input(event: InputEvent, act: Unit) -> void:
	if act == null or act.get_instance_id() != _facing_select_unit_id:
		return
	if event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_W, KEY_UP:
				_facing_dir_preview = Vector2i(0, -1)
				_facing_world_preview = Vector3.ZERO
			KEY_S, KEY_DOWN:
				_facing_dir_preview = Vector2i(0, 1)
				_facing_world_preview = Vector3.ZERO
			KEY_A, KEY_LEFT:
				_facing_dir_preview = Vector2i(-1, 0)
				_facing_world_preview = Vector3.ZERO
			KEY_D, KEY_RIGHT:
				_facing_dir_preview = Vector2i(1, 0)
				_facing_world_preview = Vector3.ZERO
			KEY_ENTER, KEY_KP_ENTER:
				_confirm_facing_selection(act, _facing_dir_preview)
				return
			KEY_ESCAPE:
				_cancel_facing_selection(act)
				return
		_preview_unit_facing(act, _facing_dir_preview)
		return
	if event is InputEventMouseMotion:
		var hit_motion = _raycast_to_board()
		if hit_motion != null and grid != null:
			var pos_motion = hit_motion.get("plane_position", hit_motion.position)
			if pos_motion != null:
				_facing_world_preview = pos_motion
				act.set_facing_towards(pos_motion)
				_facing_dir_preview = _pick_facing_dir_from_world(act, pos_motion)
				_preview_unit_facing(act, _facing_dir_preview)
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var hit = _raycast_to_board()
		if hit != null and grid != null:
			var pos = hit.get("plane_position", hit.position)
			if pos != null:
				_facing_world_preview = pos
				act.set_facing_towards(pos)
				_facing_dir_preview = _pick_facing_dir_from_world(act, pos)
				_preview_unit_facing(act, _facing_dir_preview)
		_confirm_facing_selection(act, _facing_dir_preview)

func _confirm_facing_selection(act: Unit, dir: Vector2i) -> void:
	if act == null:
		return
	if _facing_world_preview != Vector3.ZERO:
		act.set_facing_towards(_facing_world_preview)
	else:
		_apply_unit_facing_dir(act, dir)
	_facing_world_preview = Vector3.ZERO
	_facing_select_active = false
	_facing_select_unit_id = 0
	_hide_facing_arrows()
	if timeline != null:
		timeline.set_process(true)
		timeline.force_end_active_turn()

func _cancel_facing_selection(act: Unit) -> void:
	if act == null:
		return
	_apply_unit_facing_vector(act, _facing_original_dir)
	_facing_world_preview = Vector3.ZERO
	_facing_select_active = false
	_facing_select_unit_id = 0
	_hide_facing_arrows()
	if timeline != null:
		timeline.set_process(true)

func _show_facing_arrows(act: Unit, selected_dir: Vector2i) -> void:
	if act == null or grid == null or _facing_arrows.is_empty():
		return
	var wpos = grid.cell_to_world(act.cell.x, act.cell.y)
	var dirs = [Vector2i(0, -1), Vector2i(1, 0), Vector2i(0, 1), Vector2i(-1, 0)]
	for i in range(_facing_arrows.size()):
		var arrow = _facing_arrows[i]
		if arrow == null:
			continue
		var dir = dirs[i]
		var offset = Vector3(dir.x * 0.45, 0.2, dir.y * 0.45)
		arrow.global_position = wpos + offset
		arrow.rotation = Vector3(PI, _facing_dir_to_rot_y(dir), 0)
		arrow.visible = true
		arrow.material_override = _facing_arrow_selected_mat if dir == selected_dir else _facing_arrow_idle_mat

func _hide_facing_arrows() -> void:
	for arrow in _facing_arrows:
		if arrow != null:
			arrow.visible = false

func _unit_facing_dir_cell(u: Unit) -> Vector2i:
	if u == null:
		return Vector2i(0, 1)
	var dir := u.facing_dir
	dir.y = 0.0
	if dir.length() <= 0.001:
		return Vector2i(0, 1)
	var rel := Vector2(dir.x, dir.z)
	if abs(rel.x) >= abs(rel.y):
		return Vector2i(1, 0) if rel.x >= 0 else Vector2i(-1, 0)
	return Vector2i(0, 1) if rel.y >= 0 else Vector2i(0, -1)

func _apply_unit_facing_dir(u: Unit, dir: Vector2i) -> void:
	if u == null:
		return
	var target := u.global_position + Vector3(dir.x, 0.0, dir.y)
	u.set_facing_towards(target)

func _apply_unit_facing_vector(u: Unit, dir: Vector3) -> void:
	if u == null:
		return
	var flat := Vector3(dir.x, 0.0, dir.z)
	if flat.length() <= 0.001:
		return
	u.facing_dir = flat.normalized()
	u.facing_yaw = atan2(u.facing_dir.x, u.facing_dir.z)
	u.rotation.y = u.facing_yaw

func _preview_unit_facing(u: Unit, dir: Vector2i) -> void:
	if u == null:
		return
	if _facing_world_preview == Vector3.ZERO:
		u.rotation.y = _facing_dir_to_rot_y(dir)
	_show_facing_arrows(u, dir)

func _facing_dir_to_rot_y(dir: Vector2i) -> float:
	if dir == Vector2i(0, -1):
		return PI
	if dir == Vector2i(0, 1):
		return 0.0
	if dir == Vector2i(1, 0):
		return -PI / 2.0
	if dir == Vector2i(-1, 0):
		return PI / 2.0
	return 0.0

func _pick_facing_dir_from_world(act: Unit, pos: Vector3) -> Vector2i:
	if act == null or grid == null:
		return Vector2i(0, 1)
	var origin = grid.cell_to_world(act.cell.x, act.cell.y)
	var rel = Vector2(pos.x - origin.x, pos.z - origin.z)
	if abs(rel.x) >= abs(rel.y):
		return Vector2i(1, 0) if rel.x >= 0 else Vector2i(-1, 0)
	return Vector2i(0, 1) if rel.y >= 0 else Vector2i(0, -1)

func _world_to_cell_precise(pos: Vector3) -> Vector2i:
	if grid == null:
		return Vector2i(-999, -999)
	var adjusted := pos + Vector3(0.001, 0.0, 0.001)
	return grid.world_to_cell(adjusted)

func _toggle_grid_debug() -> void:
	_grid_debug_visible = not _grid_debug_visible
	_ensure_grid_debug_marker()
	if _grid_debug_marker != null:
		_grid_debug_marker.visible = _grid_debug_visible
	if _grid_debug_visible and _hover_snap.x >= 0:
		_update_grid_debug_marker(_hover_snap)

func _ensure_grid_debug_marker() -> void:
	if _grid_debug_marker != null:
		return
	_grid_debug_marker = MeshInstance3D.new()
	var mesh := CylinderMesh.new()
	mesh.top_radius = 0.18
	mesh.bottom_radius = 0.18
	mesh.height = 0.02
	_grid_debug_marker.mesh = mesh
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.9, 0.9, 0.2, 0.8)
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_grid_debug_marker.material_override = mat
	_grid_debug_marker.visible = false
	add_child(_grid_debug_marker)

func _update_grid_debug_marker(cell: Vector2i) -> void:
	if _grid_debug_marker == null or grid == null:
		return
	if not grid.in_bounds(cell.x, cell.y):
		return
	var wpos = grid.cell_to_world(cell.x, cell.y) + Vector3(0, 0.02, 0)
	_grid_debug_marker.global_position = wpos
	if cell != _grid_debug_last_cell:
		_grid_debug_last_cell = cell
		print("GridDebug cell=(%d,%d) world=(%.2f, %.2f, %.2f)" % [cell.x, cell.y, wpos.x, wpos.y, wpos.z])

func _maybe_request_facing_selection(act: Unit) -> void:
	if act == null or act.team != 0:
		return
	if act.channeling:
		return
	if act.pa <= 0 and not _facing_select_active:
		act.pa = max(1, act.pa)
		_begin_facing_selection(act)

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
	if _stealth_active:
		_update_stealth_cones()
		if _stealth_state == "ACTIVE":
			_check_stealth_detection()
		elif _stealth_state == "PREP":
			return
	var act: Unit = timeline.get_active_unit() if timeline != null and timeline.has_method("get_active_unit") else null
	if _body_target_hide_timer > 0.0:
		_body_target_hide_timer = max(0.0, _body_target_hide_timer - delta)
		if _body_target_hide_timer <= 0.0:
			_hide_body_target_panel()

	if end_turn_btn:
		end_turn_btn.disabled = (act == null or act.team != 0)
	_update_turn_order_ui()
	if _debug_visible:
		_update_debug_overlay()

	if act == null:
		hover_tile.visible = false
		cover_indicator.visible = false
		_hide_los_visuals()
		_clear_aoe_preview()
		_hide_path_preview()
		_hide_body_target_panel()
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
		_hide_body_target_panel()
		if target_ring and target_flash_timer <= 0.0:
			target_ring.visible = false
		if not _enemy_acted_for_turn:
			_enemy_acted_for_turn = true
			_update_enemy_visibility()
			_update_ai_visibility()
			_enemy_take_turn(act)
			if timeline != null:
				timeline.force_end_turn()
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

	if _is_mouse_over_ui():
		hover_tile.visible = false
		cover_indicator.visible = false
		_hide_los_visuals()
		_clear_aoe_preview()
		_clear_fire_wall_preview()
		_hide_path_preview()
		_schedule_body_target_hide()
		_hover_raw = Vector2i(-999, -999)
		_hover_snap = Vector2i(-999, -999)
		var ability_preview_ui = _evaluate_ability_target(act, Vector2i(-999, -999))
		_refresh_ui(act, Vector2i(-999, -999), Vector2i(-999, -999), null, null, ability_preview_ui)
		_update_target_ring_for_context(act, Vector2i(-999, -999), ability_preview_ui)
		return

	var hit = _raycast_to_board()
	if hit == null:
		hover_tile.visible = false
		cover_indicator.visible = false
		_hide_los_visuals()
		_clear_aoe_preview()
		_clear_fire_wall_preview()
		_hide_path_preview()
		_schedule_body_target_hide()
		_hover_raw = Vector2i(-999, -999)
		_hover_snap = Vector2i(-999, -999)
		var ability_preview = _evaluate_ability_target(act, Vector2i(-999, -999))
		_refresh_ui(act, Vector2i(-999, -999), Vector2i(-999, -999), null, null, ability_preview)
		_update_target_ring_for_context(act, Vector2i(-999, -999), ability_preview)
		return

	var hit_pos = hit.get("plane_position", null)
	if hit_pos == null:
		hit_pos = hit.position
	var raw_cell: Vector2i = _world_to_cell_precise(hit_pos)
	if not grid.in_bounds(raw_cell.x, raw_cell.y):
		hover_tile.visible = false
		cover_indicator.visible = false
		_hide_los_visuals()
		_clear_aoe_preview()
		_clear_fire_wall_preview()
		_hide_path_preview()
		_schedule_body_target_hide()
		_hover_raw = Vector2i(-999, -999)
		_hover_snap = Vector2i(-999, -999)
		var ability_preview2 = _evaluate_ability_target(act, Vector2i(-999, -999))
		_refresh_ui(act, Vector2i(-999, -999), Vector2i(-999, -999), null, null, ability_preview2)
		_update_target_ring_for_context(act, Vector2i(-999, -999), ability_preview2)
		return
	_hover_raw = raw_cell
	var snapped_cell = _compute_snap_cell(act, raw_cell)
	_hover_snap = snapped_cell
	if _grid_debug_visible and _hover_snap.x >= 0:
		_update_grid_debug_marker(_hover_snap)
	if snapped_cell != _last_visibility_hover_cell:
		_last_visibility_hover_cell = snapped_cell
		_update_enemy_visibility()
		_update_enemies_panel(act)
	var move_cell = snapped_cell if _reach_cost.has(snapped_cell) else Vector2i(-999, -999)
	var target_cell = raw_cell

	var cover_info = null
	if move_cell.x >= 0:
		var threat = _nearest_enemy_to(move_cell)
		if threat != null:
			cover_info = _cover_vs_attacker(grid, move_cell, threat.cell)
			_draw_cover_indicator(move_cell, cover_info)
		else:
			cover_indicator.visible = false
	else:
		cover_indicator.visible = false

	var enemy = _visible_enemy_at_cell(target_cell)
	var shot_preview = null
	if enemy != null:
		var dist = abs(act.cell.x - enemy.cell.x) + abs(act.cell.y - enemy.cell.y)
		var is_melee = dist <= 1
		var base_dmg = _get_base_attack_damage(act, is_melee)
		var zone_id = _get_selected_hit_zone_id(enemy)
		var ctx = {
			"melee": is_melee,
			"base_dmg": base_dmg,
			"dmg_type": Damage.DmgType.PIERCING,
			"use_hit_zone": true,
			"hit_zone_id": zone_id
		}
		shot_preview = _compute_shot_preview(act, enemy, ctx)
		_update_los_visuals_for_shot(act, enemy)
		_update_body_target_panel(act, enemy, is_melee)
	else:
		_hide_los_visuals()
		_schedule_body_target_hide()

	_update_aoe_preview(target_cell, act)
	_update_path_preview(act, move_cell)
	var ability_preview3 = _evaluate_ability_target(act, target_cell)
	_update_hover_ring(act, move_cell, target_cell, enemy, shot_preview, ability_preview3)
	_refresh_ui(act, move_cell, target_cell, cover_info if move_cell.x >= 0 else null, shot_preview, ability_preview3)
	_update_target_ring_for_context(act, target_cell, ability_preview3)

func _is_mouse_over_ui() -> bool:
	var vp = get_viewport()
	if vp == null:
		return false
	var hovered = vp.gui_get_hovered_control()
	if hovered == null:
		return false
	if hovered is Control and hovered.mouse_filter != Control.MOUSE_FILTER_STOP:
		return false
	return true

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_F6:
			_spawn_test_mission()
			return
		if event.keycode == KEY_F5:
			_reset_current_mission()
			return
		if event.keycode == KEY_F8:
			_toggle_grid_debug()
			return
	if not mission_active or mission_state.get("completed", false) or mission_state.get("failed", false):
		return
	var act: Unit = timeline.get_active_unit() if timeline != null and timeline.has_method("get_active_unit") else null
	if act == null or act.team != 0:
		return
	if _facing_select_active:
		_handle_facing_input(event, act)
		return
	if _fire_wall_selecting_dir:
		_handle_fire_wall_direction_input(event, act)
		return
	if _stealth_active and _stealth_state == "PREP":
		_handle_stealth_predeploy_input(event)
		return
	if not _pending_action.is_empty() and String(_pending_action.get("type", "")) == "CHANNEL":
		return
	if act.channeling:
		return
	if (event is InputEventMouseButton or event is InputEventMouseMotion) and _is_mouse_over_ui():
		return

	# Hotbar keys
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode >= KEY_1 and event.keycode <= KEY_5:
			var idx = int(event.keycode - KEY_1)
			if _body_target_panel != null and _body_target_panel.visible and _body_target_target_id != 0 and idx < HIT_ZONE_PRIORITY.size():
				var target = _find_enemy_by_id(_body_target_target_id)
				if target != null:
					_select_hit_zone_by_index(target, idx)
				return
			if idx < HOTBAR_KEYS.size():
				_select_hotbar(act, HOTBAR_KEYS[idx])
				return
		match event.keycode:
			KEY_PAGEUP:
				_set_view_level_offset(1)
				return
			KEY_PAGEDOWN:
				_set_view_level_offset(-1)
				return
			KEY_H:
				_toggle_view_mode()
				return
			KEY_T:
				_cycle_view_level()
				return
			KEY_C:
				confirm_actions_enabled = not confirm_actions_enabled
				SettingsRef.combat_confirmations = confirm_actions_enabled
				_hint("Confirmação: %s" % ("ON" if confirm_actions_enabled else "OFF"))
				return
			KEY_TAB:
				if timeline != null and timeline.has_method("can_swap_with_next_same_team") and timeline.can_swap_with_next_same_team(act.team):
					if timeline.swap_with_next_same_team(act.team):
						_update_enemy_visibility()
						var swapped = timeline.get_active_unit() if timeline.has_method("get_active_unit") else act
						_update_enemies_panel(swapped)
				return
			KEY_O:
				if act.overwatch:
					act.overwatch = false
					_refresh_hotbar(act)
				elif act.spend_pa(SHOOT_COST):
					act.overwatch = true
					act.pa = 0
					_refresh_hotbar(act)
					if act.team == 0:
						_begin_facing_selection(act)
				return
			KEY_F1:
				_debug_visible = not _debug_visible
				if _debug_panel:
					_debug_panel.visible = _debug_visible
				_update_debug_overlay()
				return
			KEY_0, KEY_ESCAPE:
				action_mode = ActionMode.MOVE
				_selected_ability = {}
				_clear_aoe_preview()
				_clear_target_overlay()
				_clear_body_target_selection()
				_clear_pending_action()
				_refresh_hotbar(act)
				return

	# Left click
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		if not _pending_action.is_empty():
			return
		if _hover_snap.x >= 0:
			var ghost = _ghost_at_cell(_hover_snap)
			if ghost != null:
				_focus_camera_on_cell(_hover_snap, false)
				return

		# Ability mode
		if action_mode == ActionMode.ABILITY and not _selected_ability.is_empty():
			var ability_preview = _evaluate_ability_target(act, _hover_snap)
			if not bool(ability_preview.get("valid", false)):
				return
			var prompt = _ability_confirm_prompt(act, _selected_ability, ability_preview)
			_request_action_confirm({
				"type": "ABILITY",
				"ability": _selected_ability,
				"cell": ability_preview.get("target_cell", _hover_snap)
			}, prompt, act)
			return

		# Move default (attack if clicking enemy)
		var friendly = _unit_at_cell(_hover_raw, 0)
		if friendly != null:
			_focus_camera_on_unit(friendly, false)
			return
		var enemy2 = _visible_enemy_at_cell(_hover_raw)
		if enemy2 != null:
			var is_melee2 = _manhattan(act.cell, enemy2.cell) <= 1
			action_mode = ActionMode.SHOOT
			_selected_ability = {}
			_refresh_hotbar(act)
			_clear_target_overlay()
			_update_body_target_panel(act, enemy2, is_melee2)
			return

		if not _reach_cost.has(_hover_snap):
			return
		if is_cell_occupied(_hover_snap, act):
			_hint("Destino ocupado")
			return
		var move_cost = int(_reach_cost.get(_hover_snap, 0))
		var move_prompt = "Mover para (%d,%d)? custo PA: %d" % [_hover_snap.x, _hover_snap.y, move_cost]
		if grid != null:
			var dh = grid.get_height(_hover_snap.x, _hover_snap.y) - grid.get_height(act.cell.x, act.cell.y)
			if dh != 0:
				move_prompt += " (Δh:%+d)" % dh
		_request_action_confirm({"type": "MOVE", "cell": _hover_snap}, move_prompt, act)

func _select_hotbar(act: Unit, key: String) -> void:
	_selected_ability = {}
	for a in act.abilities:
		if String(a.get("hotkey", "")) == key:
			_selected_ability = a
			break
	if not _selected_ability.is_empty() and _selected_ability.get("tags", []).has("ATTACK_NORMAL"):
		action_mode = ActionMode.SHOOT
	else:
		action_mode = ActionMode.ABILITY if not _selected_ability.is_empty() else ActionMode.MOVE
	_refresh_hotbar(act)
	_hide_body_target_panel()
	if action_mode == ActionMode.ABILITY:
		_build_target_overlay_for_ability(act, _selected_ability)
	else:
		_clear_target_overlay()

func _on_hotbar_button_pressed(key: String) -> void:
	var act: Unit = timeline.get_active_unit() if timeline != null and timeline.has_method("get_active_unit") else null
	if act == null:
		return
	_select_hotbar(act, key)

func _ability_tooltip(ability: Dictionary) -> String:
	if ability.is_empty():
		return ""
	var lines: Array[String] = []
	lines.append(String(ability.get("name", "Habilidade")))
	var cost = int(ability.get("cost_pa", 0))
	lines.append("PA: %d" % cost)
	var mp_cost = int(ability.get("mp_cost", 0))
	if mp_cost > 0:
		lines.append("MP/turno: %d" % mp_cost)
	var dmg = int(ability.get("dmg", 0))
	if dmg > 0:
		lines.append("Dano: %d" % dmg)
	var desc = String(ability.get("desc", ability.get("short_desc", "")))
	if desc != "":
		lines.append(desc)
	return "\n".join(lines)

func _execute_selected_ability(act: Unit, cell: Vector2i) -> void:
	var a := _selected_ability
	if a.is_empty():
		return

	var ability_name := String(a.get("name", ""))
	var cost := int(a.get("cost_pa", 0))
	var cd := int(a.get("cooldown", 0))
	var target_mode := int(a.get("target_mode", AbilityTargetMode.CELL))
	var r := int(a.get("range", 0))

	# cooldown / PA
	if act.cd_left(ability_name) > 0:
		_hint("Em CD")
		return
	if act.pa < cost:
		_hint("Sem PA")
		return

	if target_mode != AbilityTargetMode.SELF:
		if grid == null or not grid.in_bounds(cell.x, cell.y):
			_hint("Alvo inválido")
			return

	# range check (manhattan)
	if r > 0:
		if abs(cell.x - act.cell.x) + abs(cell.y - act.cell.y) > r:
			_hint("Fora de alcance")
			return

	if _is_fire_wall_ability(a):
		_begin_fire_wall_targeting(act, a, cell)
		return

	# resolve target
	match target_mode:
		AbilityTargetMode.CELL:
			if _ability_has_effect(a, "dash") and not grid.is_walkable(cell.x, cell.y):
				_hint("Alvo inválido")
				return
			_cast_ability_on_cell(act, a, cell)
		AbilityTargetMode.UNIT:
			var tgt: Unit = _unit_at_cell(cell, 0)
			if tgt == null:
				tgt = _unit_at_cell(cell, 1)
			if tgt == null or not _is_valid_ability_target_unit(act, a, tgt):
				_hint("Alvo inválido")
				return
			_focus_camera_on_world(tgt.global_position, false)
			_cast_ability_on_unit(act, a, tgt)
		AbilityTargetMode.SELF:
			_focus_camera_on_world(act.global_position, false)
			_cast_ability_on_unit(act, a, act)

	# spend + cd
	act.pa -= cost
	if cd > 0:
		act.set_cd(ability_name, cd)
		var tags: Array = a.get("tags", [])
		if tags.has("END_TURN"):
			act.overwatch = false
			act.pa = 0
			if act.team == 0:
				_begin_facing_selection(act)
			elif timeline != null and timeline.has_method("force_end_turn"):
				timeline.force_end_turn()
		if tags.has("OVERWATCH"):
			act.overwatch = true
			act.overwatch_used = false
			act.pa = 0
			if act.team == 0:
				_begin_facing_selection(act)

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
	_flash_action_markers(caster.cell, cell)
	if grid != null:
		var wpos = grid.cell_to_world(cell.x, cell.y)
		_notify_combat_fx_at_pos(wpos, String(a.get("name", "ABILITY")))
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

func _context_from_ability(a: Dictionary, caster: Unit = null) -> Dictionary:
	var tags: Array = a.get("tags", [])
	var is_melee = tags.has("MELEE")
	var ctx = {
		"hit_bonus": int(a.get("hit_bonus", 0)),
		"crit_bonus": int(a.get("crit_bonus", 0)),
		"tags": tags,
		"melee": is_melee
	}
	if caster != null:
		ctx["damage_mult"] = float(ctx.get("damage_mult", 1.0)) * caster.get_damage_mod_from_status()
		ctx["damage_mod_applied"] = true
	return ctx

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

func _is_fire_wall_ability(a: Dictionary) -> bool:
	if a.is_empty():
		return false
	if String(a.get("id", "")).to_upper() == FIRE_WALL_ABILITY_ID:
		return true
	var tags: Array = a.get("tags", [])
	if tags.has("FIRE_WALL"):
		return true
	if _ability_has_effect(a, "fire_wall"):
		return true
	return String(a.get("name", "")).to_upper() == "PAREDE DE FOGO"

func _begin_fire_wall_targeting(caster: Unit, a: Dictionary, anchor: Vector2i) -> void:
	if caster == null or grid == null:
		return
	var cost = int(a.get("cost_pa", 0))
	var mp_cost = int(a.get("mp_cost", 0))
	if caster.pa < cost:
		_hint("Sem PA")
		return
	if mp_cost > 0 and caster.mp < mp_cost:
		_hint("Sem MP")
		return
	_fire_wall_pending = {
		"caster_id": caster.get_instance_id(),
		"ability": a,
		"anchor": anchor
	}
	_fire_wall_selecting_dir = true
	var caster_facing := _unit_facing_dir_cell(caster)
	_fire_wall_preview_dir = caster_facing if caster_facing != Vector2i.ZERO else Vector2i(0, 1)
	_update_fire_wall_preview(anchor, _fire_wall_preview_dir, int(a.get("wall_length", 5)))
	_hint("Escolha direção da Parede de Fogo.")

func _handle_fire_wall_direction_input(event: InputEvent, act: Unit) -> void:
	if act == null or _fire_wall_pending.is_empty():
		return
	var a: Dictionary = _fire_wall_pending.get("ability", {})
	var anchor: Vector2i = _fire_wall_pending.get("anchor", act.cell)
	if event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_W, KEY_UP:
				_fire_wall_preview_dir = Vector2i(0, -1)
			KEY_S, KEY_DOWN:
				_fire_wall_preview_dir = Vector2i(0, 1)
			KEY_A, KEY_LEFT:
				_fire_wall_preview_dir = Vector2i(-1, 0)
			KEY_D, KEY_RIGHT:
				_fire_wall_preview_dir = Vector2i(1, 0)
			KEY_ENTER, KEY_KP_ENTER:
				_confirm_fire_wall_direction(act)
				return
			KEY_ESCAPE:
				_cancel_fire_wall_targeting()
				return
		_update_fire_wall_preview(anchor, _fire_wall_preview_dir, int(a.get("wall_length", 5)))
		return
	if event is InputEventMouseMotion:
		if grid != null and _hover_raw.x >= 0:
			_fire_wall_preview_dir = _cardinal_dir(anchor, _hover_raw)
			_update_fire_wall_preview(anchor, _fire_wall_preview_dir, int(a.get("wall_length", 5)))
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		if grid != null and _hover_raw.x >= 0:
			_fire_wall_preview_dir = _cardinal_dir(anchor, _hover_raw)
			_update_fire_wall_preview(anchor, _fire_wall_preview_dir, int(a.get("wall_length", 5)))
		_confirm_fire_wall_direction(act)
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_RIGHT:
		_cancel_fire_wall_targeting()

func _confirm_fire_wall_direction(caster: Unit) -> void:
	if caster == null or _fire_wall_pending.is_empty():
		return
	var a: Dictionary = _fire_wall_pending.get("ability", {})
	var anchor: Vector2i = _fire_wall_pending.get("anchor", caster.cell)
	var length = int(a.get("wall_length", 5))
	var cost = int(a.get("cost_pa", 0))
	var mp_cost = int(a.get("mp_cost", 0))
	if caster.pa < cost:
		_hint("Sem PA")
		_cancel_fire_wall_targeting()
		return
	if mp_cost > 0 and caster.mp < mp_cost:
		_hint("Sem MP")
		_cancel_fire_wall_targeting()
		return
	var cells = _fire_wall_cells(anchor, _fire_wall_preview_dir, length)
	_active_fire_walls.append({
		"caster_id": caster.get_instance_id(),
		"cells": cells,
		"mp_cost": mp_cost,
		"dmg": int(a.get("dmg_per_turn", 4)),
		"dir": _fire_wall_preview_dir
	})
	caster.channeling = true
	caster.channel_ability = a
	_apply_unit_facing_dir(caster, _fire_wall_preview_dir)
	caster.pa = 0
	caster.mp = max(0, caster.mp - mp_cost)
	_fire_wall_selecting_dir = false
	_fire_wall_pending = {}
	_update_fire_wall_visuals()
	_clear_fire_wall_preview()
	_log("%s conjurou Parede de Fogo." % caster.unit_name)
	_after_player_action(caster)
	_refresh_hotbar(caster)

func _cancel_fire_wall_targeting() -> void:
	_fire_wall_selecting_dir = false
	_fire_wall_pending = {}
	_clear_fire_wall_preview()

func _fire_wall_cells(anchor: Vector2i, dir: Vector2i, length: int) -> Array[Vector2i]:
	var cells: Array[Vector2i] = []
	var d = dir
	if d == Vector2i.ZERO:
		d = Vector2i(0, 1)
	for i in range(length):
		var c = anchor + d * i
		if grid != null and grid.in_bounds(c.x, c.y):
			cells.append(c)
	return cells

func _update_fire_wall_preview(anchor: Vector2i, dir: Vector2i, length: int) -> void:
	if _fire_wall_preview_mm == null or grid == null:
		return
	_fire_wall_preview_cells = _fire_wall_cells(anchor, dir, length)
	_fire_wall_preview_mm.instance_count = _fire_wall_preview_cells.size()
	for i in range(_fire_wall_preview_cells.size()):
		var cell = _fire_wall_preview_cells[i]
		var wpos = grid.cell_to_world(cell.x, cell.y) + Vector3(0, 0.02, 0)
		var xform = Transform3D(Basis.IDENTITY, wpos)
		_fire_wall_preview_mm.set_instance_transform(i, xform)

func _clear_fire_wall_preview() -> void:
	if _fire_wall_preview_mm != null:
		_fire_wall_preview_mm.instance_count = 0
	_fire_wall_preview_cells.clear()

func _update_fire_wall_visuals() -> void:
	if _fire_wall_mm == null or grid == null:
		return
	var cells: Array[Vector2i] = []
	for wall in _active_fire_walls:
		for cell in wall.get("cells", []):
			if cell is Vector2i:
				cells.append(cell)
	_fire_wall_mm.instance_count = cells.size()
	for i in range(cells.size()):
		var cell = cells[i]
		var wpos = grid.cell_to_world(cell.x, cell.y) + Vector3(0, 0.02, 0)
		var xform = Transform3D(Basis.IDENTITY, wpos)
		_fire_wall_mm.set_instance_transform(i, xform)

func _find_fire_wall_for_caster(caster: Unit) -> Dictionary:
	if caster == null:
		return {}
	var caster_id = caster.get_instance_id()
	for wall in _active_fire_walls:
		if int(wall.get("caster_id", 0)) == caster_id:
			return wall
	return {}

func _end_fire_wall_channel(caster: Unit) -> void:
	if caster == null:
		return
	var caster_id = caster.get_instance_id()
	for i in range(_active_fire_walls.size() - 1, -1, -1):
		var wall = _active_fire_walls[i]
		if int(wall.get("caster_id", 0)) == caster_id:
			_active_fire_walls.remove_at(i)
	caster.channeling = false
	caster.channel_ability = {}
	_update_fire_wall_visuals()

func _begin_fire_wall_upkeep_prompt(caster: Unit, mp_cost: int) -> void:
	if caster == null:
		return
	var prompt = "Manter Parede de Fogo? custo MP: %d" % mp_cost
	_pending_action = {"type": "CHANNEL", "unit_id": caster.get_instance_id(), "mp_cost": mp_cost}
	_show_confirm_panel(prompt)
	if timeline != null:
		timeline.set_process(false)

func _apply_fire_wall_tick(u: Unit) -> void:
	if u == null or u.dead or _active_fire_walls.is_empty():
		return
	for wall in _active_fire_walls:
		var cells: Array = wall.get("cells", [])
		for cell in cells:
			if cell == u.cell:
				var dmg = int(wall.get("dmg", 4))
				if dmg > 0:
					var result = Damage.apply_damage(dmg, u, u, Damage.DmgType.MELTING, false, {"true_damage": false}, 1.0, CRIT_MULT)
					var applied = int(result.get("applied", 0))
					_spawn_floating_text(u.global_position, "-%d" % applied, "dmg")
					_spawn_action_ring(u.global_position, Color(1.0, 0.35, 0.2, 0.55))
					_log("%s sofreu %d de fogo da Parede de Fogo." % [u.unit_name, applied])
					if u.dead:
						_on_unit_died(u)
				return

func _ability_aoe_radius(a: Dictionary) -> int:
	for effect in _ability_effects(a):
		if String(effect.get("type", "")) == "aoe":
			return int(effect.get("radius", a.get("aoe_radius", 0)))
	return int(a.get("aoe_radius", 0))

func _apply_ability_effects_on_unit(caster: Unit, target: Unit, a: Dictionary) -> void:
	if target == null or target.dead:
		return
	_flash_action_markers(caster.cell, target.cell)
	_notify_combat_fx_at_pos(target.global_position, String(a.get("name", "ABILITY")), target)
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
			var ctx = _context_from_ability(a, caster)
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
		var ctx2 = _context_from_ability(a, caster)
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
	var act: Unit = timeline.get_active_unit() if timeline != null and timeline.has_method("get_active_unit") else null
	if act == null or act.team != 0:
		return
	_begin_facing_selection(act)



func _after_player_action(act: Unit) -> void:
	var blocked = get_occupied_cells(act)
	_reach_cost = Pathfinding.reachable_with_pa(grid, act.cell, act.pa, act, blocked)
	_build_reach_overlay(_reach_cost)
	if action_mode == ActionMode.ABILITY:
		_build_target_overlay_for_ability(act, _selected_ability)
	_update_enemy_visibility()
	_update_enemies_panel(act)
	_check_mission_status()
	_maybe_request_facing_selection(act)

# ---------------- UI ----------------

func _ensure_hotbar_ui() -> void:
	var ui = ui_root
	if ui == null:
		return

	_hotbar_root = ui.get_node_or_null("Hotbar") as Control
	if _hotbar_root == null:
		_hotbar_root = Control.new()
		_hotbar_root.name = "Hotbar"
		if _hud_bottom_center != null:
			_hud_bottom_center.add_child(_hotbar_root)
		else:
			ui.add_child(_hotbar_root)
	if _hotbar_root != null:
		if _hud_bottom_center != null:
			_reparent_control(_hotbar_root, _hud_bottom_center)
		_hotbar_root.anchor_left = 0.0
		_hotbar_root.anchor_right = 1.0
		_hotbar_root.anchor_top = 0.0
		_hotbar_root.anchor_bottom = 1.0
		_hotbar_root.offset_left = 0
		_hotbar_root.offset_right = 0
		_hotbar_root.offset_top = 0
		_hotbar_root.offset_bottom = 0
		for child in _hotbar_root.get_children():
			child.queue_free()

	_hotbar_buttons.clear()
	_hotbar_labels.clear()
	for i in range(HOTBAR_KEYS.size()):
		var btn = Button.new()
		btn.position = Vector2(8 + i * 98, 0)
		btn.size = Vector2(104, 70)
		btn.text = "%s\n-" % HOTBAR_KEYS[i]
		btn.tooltip_text = ""
		btn.pressed.connect(_on_hotbar_button_pressed.bind(HOTBAR_KEYS[i]))
		_hotbar_root.add_child(btn)
		_hotbar_buttons.append(btn)

	if _inventory_button != null:
		if _inventory_button.get_parent() != _hotbar_root:
			_reparent_control(_inventory_button, _hotbar_root)
		_inventory_button.position = Vector2(8 + HOTBAR_KEYS.size() * 98, 0)
		_inventory_button.size = Vector2(120, 70)

func _ensure_stealth_ui() -> void:
	if ui_root == null:
		return
	_stealth_panel = ui_root.get_node_or_null("StealthPanel") as Panel
	if _stealth_panel == null:
		_stealth_panel = Panel.new()
		_stealth_panel.name = "StealthPanel"
		ui_root.add_child(_stealth_panel)
	if _stealth_panel != null:
		_stealth_panel.anchor_left = 0.5
		_stealth_panel.anchor_right = 0.5
		_stealth_panel.anchor_top = 0.0
		_stealth_panel.anchor_bottom = 0.0
		_stealth_panel.offset_left = -180
		_stealth_panel.offset_right = 180
		_stealth_panel.offset_top = 20
		_stealth_panel.offset_bottom = 90
		_stealth_panel.visible = false

	_stealth_label = _stealth_panel.get_node_or_null("StealthLabel") as Label
	if _stealth_label == null:
		_stealth_label = Label.new()
		_stealth_label.name = "StealthLabel"
		_stealth_label.position = Vector2(12, 8)
		_stealth_label.size = Vector2(340, 24)
		_stealth_panel.add_child(_stealth_label)

	_stealth_start_button = _stealth_panel.get_node_or_null("StealthStartButton") as Button
	if _stealth_start_button == null:
		_stealth_start_button = Button.new()
		_stealth_start_button.name = "StealthStartButton"
		_stealth_start_button.text = "Iniciar Infiltração"
		_stealth_start_button.position = Vector2(12, 36)
		_stealth_start_button.size = Vector2(320, 28)
		_stealth_panel.add_child(_stealth_start_button)
	if _stealth_start_button != null and not _stealth_start_button.pressed.is_connected(_on_stealth_start_pressed):
		_stealth_start_button.pressed.connect(_on_stealth_start_pressed)

func _on_stealth_start_pressed() -> void:
	if not _stealth_active:
		return
	_stealth_state = "ACTIVE"
	if _stealth_panel != null:
		_stealth_panel.visible = false
	if timeline != null:
		timeline.set_process(true)
	_update_enemy_visibility()
	_hint("Infiltração iniciada.")

func _update_stealth_label() -> void:
	if _stealth_label == null:
		return
	if _stealth_state == "PREP":
		var idx = clamp(_predeploy_index + 1, 1, max(1, _predeploy_units.size()))
		_stealth_label.text = "STEALTH: posicione seu squad (%d/%d)" % [idx, _predeploy_units.size()]
	else:
		_stealth_label.text = "STEALTH: infiltração ativa"

func _refresh_hotbar(act: Unit) -> void:
	if _hotbar_buttons.is_empty():
		return
	if act == null:
		return
	for i in range(HOTBAR_KEYS.size()):
		var key = HOTBAR_KEYS[i]
		var btn = _hotbar_buttons[i]
		var txt = "%s\n-" % key
		var tooltip = ""
		for a in act.abilities:
			if String(a.get("hotkey","")) == key:
				var nm = String(a.get("name",""))
				var cost = int(a.get("cost_pa",0))
				var cd = act.cd_left(nm)
				txt = "%s\n%s" % [key, nm]
				if cd > 0:
					txt += " (CD:%d)" % cd
				if not _selected_ability.is_empty() and String(_selected_ability.get("hotkey","")) == key and action_mode == ActionMode.ABILITY:
					txt += " [SELECIONADO]"
				tooltip = _ability_tooltip(a)
				break
		btn.text = txt
		btn.tooltip_text = tooltip

func _refresh_ui(u: Unit, move_cell: Vector2i, _target_cell: Vector2i, cover_info, shot_preview, ability_preview: Dictionary) -> void:
	if ui_label == null or aim_label == null:
		return
	var base = "Turno:%s | HP:%d/%d | MP:%d/%d | PA:%d/%d | SPD:%d" % [u.unit_name, u.hp, u.max_hp, u.mp, u.mp_max, u.pa, u.pa_max, u.speed]
	var status_txt = u.get_status_summary()
	if status_txt != "":
		base += " | STATUS:%s" % status_txt
	if u.overwatch:
		base += " | OVERWATCH"
	if u.channeling:
		base += " | CHANNELING"

	var move_cost = int(_reach_cost.get(move_cell, -1)) if move_cell.x >= 0 else -1

	if move_cell.x < 0:
		ui_label.text = base
	else:
		var zoc_warn = " | OA RISK" if _hover_path_risky else ""
		var height_txt = ""
		if grid != null:
			var dh = grid.get_height(move_cell.x, move_cell.y) - grid.get_height(u.cell.x, u.cell.y)
			if dh != 0:
				height_txt = " | Δh:%+d" % dh
		ui_label.text = "%s | Mover:%dPA%s%s" % [base, move_cost, zoc_warn, height_txt]

	var aim_lines: Array[String] = []
	if cover_info != null:
		aim_lines.append("Cobertura:%s (%s)" % [cover_info.type, cover_info.dir_name])
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
		if shot_preview.has("hit_zone") and not shot_preview.hit_zone.is_empty():
			var zone: Dictionary = shot_preview.hit_zone
			var zone_label = String(zone.get("label", zone.get("id", "")))
			var to_hit_mod = int(zone.get("to_hit_mod", 0))
			var dmg_mult = float(zone.get("dmg_mult", 1.0))
			aim_lines.append("Parte:%s (%+d hit | x%.2f dmg)" % [zone_label, to_hit_mod, dmg_mult])
			var status_id = String(zone.get("status_on_hit", ""))
			if status_id != "":
				var chance = float(zone.get("status_chance", 0.0))
				aim_lines.append("Debuff:%s %.0f%%" % [status_id, chance * 100.0])
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
		var tm = int(_selected_ability.get("target_mode", AbilityTargetMode.CELL))
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

func _update_inventory_button() -> void:
	if _inventory_button == null:
		return
	var count = _mission_consumables.size()
	_inventory_button.text = "Itens (%d)" % count
	_inventory_button.disabled = count <= 0

func _on_inventory_pressed() -> void:
	if not mission_active:
		return
	if _item_used_this_turn:
		_hint("Você já usou um item neste turno.")
		return
	if _mission_consumables.is_empty():
		_hint("Sem itens disponíveis.")
		return
	if timeline == null or not timeline.has_method("get_active_unit"):
		return
	var act: Unit = timeline.get_active_unit()
	if act == null or act.team != 0:
		return
	if not act.spend_pa(1):
		_hint("PA insuficiente para usar item.")
		return
	var item_id = _mission_consumables[0]
	if _use_consumable_on_unit(item_id, act):
		_mission_consumables.erase(item_id)
		_consumables_used.append(item_id)
		_item_used_this_turn = true
		_update_inventory_button()

func _use_consumable_on_unit(item_id: String, act: Unit) -> bool:
	var item_data = _resolve_item_data(item_id)
	if item_data.is_empty():
		return false
	var effect: Dictionary = item_data.get("effect", {})
	var heal = int(effect.get("heal", 0))
	if heal > 0:
		var applied = act.apply_heal(heal)
		_log("%s usou %s (+%d HP)." % [act.unit_name, String(item_data.get("name", item_id)), applied])
		return true
	_log("%s usou %s." % [act.unit_name, String(item_data.get("name", item_id))])
	return true

func _ensure_mission_ui() -> void:
	var ui = ui_root
	if ui == null:
		return

	mission_panel = ui.get_node_or_null("MissionPanel") as Control
	if mission_panel == null:
		mission_panel = Panel.new()
		mission_panel.name = "MissionPanel"
		ui.add_child(mission_panel)
	if mission_panel != null:
		mission_panel.mouse_filter = Control.MOUSE_FILTER_PASS
	if _hud_top_left != null:
		_reparent_control(mission_panel, _hud_top_left)
		_hud_top_left.move_child(mission_panel, 0)
		mission_panel.anchor_left = 0.0
		mission_panel.anchor_right = 1.0
		mission_panel.anchor_top = 0.0
		mission_panel.anchor_bottom = 0.0
		mission_panel.offset_left = 0
		mission_panel.offset_right = 0
		mission_panel.offset_top = 0
		mission_panel.offset_bottom = 0
		mission_panel.custom_minimum_size = Vector2(360, 84)
		mission_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		mission_panel.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	else:
		mission_panel.anchor_left = 0.0
		mission_panel.anchor_right = 0.0
		mission_panel.anchor_top = 0.0
		mission_panel.anchor_bottom = 0.0
		mission_panel.offset_left = 12
		mission_panel.offset_top = 12
		mission_panel.offset_right = 360
		mission_panel.offset_bottom = 96

	mission_objective_label = mission_panel.get_node_or_null("ObjectiveLabel") as Label
	if mission_objective_label == null:
		mission_objective_label = Label.new()
		mission_objective_label.name = "ObjectiveLabel"
		mission_objective_label.position = Vector2(12, 8)
		mission_objective_label.size = Vector2(330, 32)
		mission_objective_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		mission_panel.add_child(mission_objective_label)
	if mission_objective_label != null:
		mission_objective_label.mouse_filter = Control.MOUSE_FILTER_IGNORE

	mission_progress_label = mission_panel.get_node_or_null("ProgressLabel") as Label
	if mission_progress_label == null:
		mission_progress_label = Label.new()
		mission_progress_label.name = "ProgressLabel"
		mission_progress_label.position = Vector2(12, 44)
		mission_progress_label.size = Vector2(330, 32)
		mission_progress_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		mission_panel.add_child(mission_progress_label)
	if mission_progress_label != null:
		mission_progress_label.mouse_filter = Control.MOUSE_FILTER_IGNORE

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
	if end_screen != null:
		end_screen.mouse_filter = Control.MOUSE_FILTER_PASS

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
	if end_title_label != null:
		end_title_label.mouse_filter = Control.MOUSE_FILTER_IGNORE

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
	if end_reason_label != null:
		end_reason_label.mouse_filter = Control.MOUSE_FILTER_IGNORE

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
	var objective_lines: Array[String] = []
	for obj in mission_objectives_state:
		var text = String(obj.get("text", ""))
		if text == "":
			text = _objective_text_for(String(obj.get("type", "")))
		var done = bool(obj.get("completed", false))
		objective_lines.append("%s%s" % ["✓ " if done else "- ", text])
	if objective_lines.is_empty():
		objective_lines.append(mission_objective_text)
	mission_objective_label.text = "Objetivo:\n%s" % "\n".join(objective_lines)

	var progress: Array[String] = []
	for obj in mission_objectives_state:
		var obj_type = String(obj.get("type", ""))
		match obj_type:
			"kill_all":
				progress.append("Inimigos restantes: %d" % enemy_units.size())
			"extract":
				var extracted = 0
				for u in player_units:
					if u == null or not is_instance_valid(u) or u.dead:
						continue
					if u.cell == mission_extract_cell:
						extracted += 1
				progress.append("Extração: %d/%d" % [extracted, max(1, player_units.size())])
			"survive_turns":
				progress.append("Turnos: %d/%d" % [int(mission_state.get("turns", 0)), mission_turn_limit])
			"kill_target":
				progress.append("Alvo prioritário: %s" % ("Eliminado" if mission_target_enemy_id == 0 else "Ativo"))
			"capture_tile":
				progress.append("Captura: %s" % ("Controlada" if _is_capture_controlled() else "Contestar"))
			"escort_unit_to_extract":
				progress.append("Escolta: %s" % ("No ponto" if _is_escort_at_extract() else "Em movimento"))
	mission_progress_label.text = "\n".join(progress)

func _show_end_screen(title: String, detail: String = "") -> void:
	if end_screen:
		end_screen.visible = true
	if end_title_label:
		end_title_label.text = title
	if end_reason_label:
		end_reason_label.text = detail

func _objective_text_for(obj_type: String) -> String:
	match obj_type:
		"kill_all":
			return "Elimine todos os inimigos."
		"extract":
			return "Chegue no ponto de extração."
		"survive_turns":
			return "Resista por %d turnos." % mission_turn_limit
		"kill_target":
			return "Eliminar o líder inimigo."
		"capture_tile":
			return "Capture o ponto rúnico."
		"escort_unit_to_extract":
			return "Escolte o aliado até a extração."
	return "Objetivo"

func _is_capture_controlled() -> bool:
	if mission_capture_cell.x < 0:
		return false
	for u in player_units:
		if u == null or not is_instance_valid(u) or u.dead:
			continue
		if u.cell == mission_capture_cell:
			return true
	return false

func _is_escort_at_extract() -> bool:
	if mission_escort_unit_id == 0:
		return false
	var vip = _find_unit_by_instance_id(mission_escort_unit_id)
	if vip == null:
		return false
	return vip.cell == mission_extract_cell

func _is_any_player_at_extract() -> bool:
	if mission_extract_cell.x < 0:
		return false
	for u in player_units:
		if u == null or not is_instance_valid(u) or u.dead:
			continue
		if u.cell == mission_extract_cell:
			return true
	return false

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
	query.collision_mask = 1
	query.collide_with_areas = true
	query.collide_with_bodies = true
	var res = space.intersect_ray(query)

	var plane = Plane(Vector3.UP, 0.0)
	var plane_pos = plane.intersects_ray(from, dir)
	if plane_pos == null:
		plane_pos = _cam.project_position(mp, 200.0)
	if plane_pos == null and res.is_empty():
		return null
	var result = {}
	if not res.is_empty():
		var normal: Vector3 = res.get("normal", Vector3.UP)
		if normal.dot(Vector3.UP) >= 0.4:
			result = res
	result["plane_position"] = plane_pos
	if plane_pos != null:
		result["position"] = plane_pos
	elif not result.has("position"):
		result = res
	return result

func _focus_camera_on_world(pos: Vector3, snap := false) -> void:
	var camrig = get_node_or_null("../CameraRig")
	if camrig != null:
		if camrig.has_method("focus_world"):
			camrig.focus_world(pos, snap)
			return
		if camrig.has_method("center_on_world"):
			camrig.center_on_world(pos)
			return

	var cam = _cam if _cam != null else get_viewport().get_camera_3d()
	if cam == null:
		return
	var target = pos + Vector3(0, 8.0, 8.0)
	if snap:
		cam.global_position = target
	else:
		cam.global_position = cam.global_position.lerp(target, 0.35)

func _focus_camera_on_cell(cell: Vector2i, snap := false) -> void:
	if grid == null:
		return
	var camrig = get_node_or_null("../CameraRig")
	if camrig != null:
		if camrig.has_method("focus_cell"):
			camrig.focus_cell(grid, cell, snap)
			return
		if camrig.has_method("focus_world"):
			camrig.focus_world(grid.cell_to_world(cell.x, cell.y), snap)
			return
		if camrig.has_method("center_on_world"):
			camrig.center_on_world(grid.cell_to_world(cell.x, cell.y))
			return
	_focus_camera_on_world(grid.cell_to_world(cell.x, cell.y), snap)
	_set_view_level_from_cell(cell)

func _focus_camera_on_unit(u: Unit, snap := false) -> void:
	if u == null:
		return
	_focus_camera_on_world(u.global_position, snap)
	_set_view_level_from_cell(u.cell)


# ---------------- Units & movement ----------------

func get_occupied_cells(ignore_unit: Unit = null) -> Dictionary:
	var blocked: Dictionary = {}
	for u in player_units:
		if u == null or u.dead or u == ignore_unit:
			continue
		blocked[u.cell] = true
	for e in enemy_units:
		if e == null or e.dead or e == ignore_unit:
			continue
		blocked[e.cell] = true
	return blocked

func is_cell_occupied(cell: Vector2i, ignore_unit: Unit = null) -> bool:
	for u in player_units:
		if u != null and not u.dead and u != ignore_unit and u.cell == cell:
			return true
	for e in enemy_units:
		if e != null and not e.dead and e != ignore_unit and e.cell == cell:
			return true
	return false

func _unit_at_cell(c: Vector2i, team_id: int) -> Unit:
	var arr = enemy_units if team_id == 1 else player_units
	for u in arr:
		if u != null and not u.dead and u.cell == c:
			return u
	return null

func _visible_enemy_at_cell(c: Vector2i) -> Unit:
	var enemy = _unit_at_cell(c, 1)
	if enemy != null and not enemy.visible_to_player:
		return null
	return enemy

func _ghost_at_cell(c: Vector2i) -> Node3D:
	for ghost in enemy_ghosts_by_id.values():
		if ghost == null or not is_instance_valid(ghost):
			continue
		var cell = ghost.get_meta("cell", Vector2i(-999, -999))
		if cell == c:
			return ghost
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
	if is_cell_occupied(dest, u):
		_hint("Destino ocupado")
		return
	_flash_target_at_cell(dest)
	var blocked = get_occupied_cells(u)
	var path = Pathfinding.find_path(grid, u.cell, dest, u, blocked)
	if path.is_empty():
		return
	var moved = false
	for i in range(1, path.size()):
		if u.pa <= 0:
			break
		var step: Vector2i = path[i]
		if is_cell_occupied(step, u):
			break
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
	var stats_pack = RPGStatsRef.compute_final_stats(attacker)
	var stats: Dictionary = stats_pack.get("stats", {})
	var weapon_base = attacker.get_weapon_base_atk()
	if weapon_base <= 0:
		weapon_base = attacker.get_weapon_dmg()
	var mods_skill = attacker.get_melee_dmg_bonus() if melee else 0
	var dmg = RPGStatsRef.physical_damage(weapon_base, stats, mods_skill)
	return max(1, dmg)

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

func _try_melee_attack(attacker: Unit, defender: Unit, spend_cost: bool, hit_zone_id: String = "") -> void:
	if attacker == null or defender == null:
		return
	if attacker.team == 1 and not _can_unit_see_unit(attacker, defender):
		return
	if _manhattan(attacker.cell, defender.cell) > 1:
		if attacker.team == 0:
			_hint("Fora de alcance")
		return
	if spend_cost and not attacker.spend_pa(MELEE_COST):
		if attacker.team == 0:
			_hint("Sem PA")
		return

	_update_unit_facing(attacker, attacker.cell, defender.cell)
	var raw_dmg = _get_base_attack_damage(attacker, true)
	_flash_action_markers(attacker.cell, defender.cell)
	_notify_combat_fx_at_pos(defender.global_position, "MELEE", defender)
	var zone_id = hit_zone_id if hit_zone_id != "" else _get_selected_hit_zone_id(defender)
	_resolve_attack(attacker, defender, raw_dmg, Damage.DmgType.PIERCING, {
		"tags": ["MELEE"],
		"melee": true,
		"skip_range_los": true,
		"use_hit_zone": true,
		"hit_zone_id": zone_id
	})
	_consume_hit_zone_selection(defender)
	_pulse_active_marker()

func _try_attack(attacker: Unit, defender: Unit, spend_cost: bool, hit_zone_id: String = "") -> void:
	if attacker == null or defender == null:
		return
	if attacker.team == 1 and not _can_unit_see_unit(attacker, defender):
		return
	if spend_cost and not attacker.spend_pa(SHOOT_COST):
		if attacker.team == 0:
			_hint("Sem PA")
		return
	var zone_id = hit_zone_id if hit_zone_id != "" else _get_selected_hit_zone_id(defender)
	var preview = _compute_shot_preview(attacker, defender, {"tags": ["RANGED"], "use_hit_zone": true, "hit_zone_id": zone_id})
	if not preview.has_los:
		if attacker.team == 0:
			_hint("Sem LOS")
		return
	if preview.dist > preview.max_range:
		if attacker.team == 0:
			_hint("Fora de alcance")
		return

	_update_unit_facing(attacker, attacker.cell, defender.cell)
	var raw_dmg = _get_base_attack_damage(attacker, false)
	_flash_action_markers(attacker.cell, defender.cell)
	_notify_combat_fx_at_pos(defender.global_position, "ATAQUE", defender)
	_resolve_attack(attacker, defender, raw_dmg, Damage.DmgType.PIERCING, {
		"tags": ["RANGED"],
		"use_hit_zone": true,
		"hit_zone_id": zone_id
	})
	_consume_hit_zone_selection(defender)
	_pulse_active_marker()

func _try_opportunity_attack(attacker: Unit, defender: Unit) -> void:
	if attacker == null or defender == null:
		return
	if attacker.dead or attacker.is_stunned():
		return
	if attacker.oa_used_this_turn:
		return
	if not _is_in_facing_cone(attacker, defender.global_position):
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

func _is_in_facing_cone(attacker: Unit, target_pos: Vector3) -> bool:
	if attacker == null:
		return false
	var facing := attacker.facing_dir
	facing.y = 0.0
	if facing.length() <= 0.001:
		facing = Vector3.FORWARD
	else:
		facing = facing.normalized()
	var to_target := target_pos - attacker.global_position
	to_target.y = 0.0
	if to_target.length() <= 0.001:
		return true
	to_target = to_target.normalized()
	var cos_limit := cos(deg_to_rad(FACING_CONE_DEG * 0.5))
	return facing.dot(to_target) >= cos_limit

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

func _resolve_hit_zone(context: Dictionary, defender: Unit) -> Dictionary:
	if defender == null:
		return {}
	if not bool(context.get("use_hit_zone", false)):
		return {}
	if context.has("hit_zone"):
		var zone: Dictionary = context.get("hit_zone", {})
		if not zone.is_empty() and bool(zone.get("enabled", true)):
			return zone
	var zone_id = String(context.get("hit_zone_id", "")).to_upper()
	if zone_id != "":
		var z = defender.get_hit_zone(zone_id)
		if not z.is_empty() and bool(z.get("enabled", true)):
			return z
	return defender.get_default_hit_zone()

func _apply_damage_modifiers(ctx: Dictionary, attacker: Unit, zone: Dictionary) -> Dictionary:
	if bool(ctx.get("damage_mod_applied", false)):
		return ctx
	var mult = float(ctx.get("damage_mult", 1.0))
	if attacker != null:
		mult *= attacker.get_damage_mod_from_status()
	if not zone.is_empty():
		mult *= float(zone.get("dmg_mult", 1.0))
	ctx["damage_mult"] = mult
	ctx["damage_mod_applied"] = true
	return ctx

func _hit_zone_status_turns(status_id: String) -> int:
	match status_id:
		"BLEED":
			return 2
		"CRIPPLE":
			return 2
		"WEAKEN":
			return 2
		"BLIND":
			return 1
		"STUN":
			return 1
		_:
			return 1

func _apply_hit_zone_status(attacker: Unit, defender: Unit, zone: Dictionary) -> void:
	if attacker == null or defender == null or zone.is_empty():
		return
	if defender.dead:
		return
	var status_id = String(zone.get("status_on_hit", "")).to_upper()
	if status_id == "":
		return
	var chance = float(zone.get("status_chance", 0.0))
	if chance <= 0.0:
		return
	if chance < 1.0 and randf() > chance:
		return
	var turns = _hit_zone_status_turns(status_id)
	defender.apply_status(status_id, turns, 1.0)
	_log("%s atingiu %s (%s) e aplicou %s." % [attacker.unit_name, defender.unit_name, String(zone.get("id", "")), status_id])
	_spawn_floating_text(defender.global_position, "%s!" % status_id, "status")
	_update_status_ui(defender)

func _resolve_attack(attacker: Unit, defender: Unit, base_dmg: int, dmg_type: int, context: Dictionary) -> Dictionary:
	var ctx := context.duplicate(true)
	ctx["base_dmg"] = base_dmg
	ctx["dmg_type"] = dmg_type
	var zone = _resolve_hit_zone(ctx, defender)
	ctx["hit_zone"] = zone
	ctx["hit_zone_id"] = String(zone.get("id", ""))
	ctx = _apply_damage_modifiers(ctx, attacker, zone)
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
	if bool(ctx.get("use_hit_zone", false)):
		_apply_hit_zone_status(attacker, defender, zone)
	if defender.dead:
		_on_unit_died(defender)
	return {"result": "CRIT" if crit else "HIT", "damage": applied, "preview": preview}

func _compute_shot_preview(attacker: Unit, defender: Unit, context: Dictionary = {}, from_cell: Vector2i = Vector2i(-999, -999)):
	var att_cell = attacker.cell if from_cell.x < 0 else from_cell
	var pts = _los_line(att_cell, defender.cell)
	var blocker = _first_blocker_cell(pts)

	var has_los = (blocker == null)
	var dist = _los_dist3d(grid, att_cell, defender.cell)
	if bool(context.get("melee", false)):
		has_los = true
		blocker = null

	var h_att = grid.get_height(att_cell.x, att_cell.y)
	var h_def = grid.get_height(defender.cell.x, defender.cell.y)
	var dh = h_att - h_def
	var max_range = (BASE_RANGE_3D + attacker.get_weapon_range_bonus()) + max(0, dh) * RANGE_BONUS_PER_LEVEL

	var cover = _cover_vs_attacker_for_unit(defender, att_cell)
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
	var zone = _resolve_hit_zone(context, defender)
	var stats_attacker = RPGStatsRef.compute_final_stats(attacker).get("stats", {})
	var stats_defender = RPGStatsRef.compute_final_stats(defender).get("stats", {})
	var base_aim = BASE_WEAPON_AIM
	var aim_bonus = attacker.get_weapon_aim_bonus()
	if bool(context.get("melee", false)):
		base_aim = MELEE_AIM_BASE
		aim_bonus = attacker.get_melee_aim_bonus()
	var mods_cover = high_bonus - cover_pen + flank_bonus + _global_aim_bonus + aim_bonus
	var mods_skill = attacker.get_aim_mod_from_status() - attacker.get_aim_penalty() - defender.get_def_bonus_from_status() + int(context.get("hit_bonus", 0))
	var mods_zone = int(zone.get("to_hit_mod", 0)) if not zone.is_empty() else 0
	var hit = RPGStatsRef.hit_chance(base_aim, stats_attacker, stats_defender, mods_cover, mods_skill, mods_zone)

	var dmg_est: Dictionary = {}
	if context.has("base_dmg"):
		var base_dmg = int(context.get("base_dmg", 0))
		var dmg_type = int(context.get("dmg_type", Damage.DmgType.PIERCING))
		if base_dmg > 0:
			var preview_ctx = context.duplicate(true)
			preview_ctx = _apply_damage_modifiers(preview_ctx, attacker, zone)
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
		"dmg_est": dmg_est,
		"hit_zone": zone,
		"hit_zone_id": String(zone.get("id", "")),
		"status_on_hit": String(zone.get("status_on_hit", "")),
		"status_chance": float(zone.get("status_chance", 0.0))
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
	_apply_unit_facing_dir(u, _cardinal_dir(from_cell, to_cell))

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
	if grid == null:
		extract_marker.visible = false
		return
	var c = Vector2i(-1, -1)
	if _objective_requires_extract():
		c = mission_extract_cell
	elif mission_capture_cell.x >= 0:
		c = mission_capture_cell
	if not grid.in_bounds(c.x, c.y):
		extract_marker.visible = false
		return
	var wpos = grid.cell_to_world(c.x, c.y)
	extract_marker.global_position = wpos + Vector3(0, 0.02, 0)
	extract_marker.visible = true

func _objective_requires_extract() -> bool:
	if mission_requires_extract:
		return true
	for obj in mission_objectives_state:
		var obj_type = String(obj.get("type", ""))
		if obj_type in ["extract", "escort_unit_to_extract"]:
			return true
	return false

func _first_blocker_cell(pts: Array[Vector2i]):
	if pts.size() <= 2:
		return null
	for i in range(1, pts.size() - 1):
		var c: Vector2i = pts[i]
		if grid.in_bounds(c.x, c.y) and not grid.is_walkable(c.x, c.y):
			return c
	return null

func _los_line(a: Vector2i, b: Vector2i) -> Array[Vector2i]:
	if _los_helper != null and _los_helper.has_method("line"):
		return _los_helper.call("line", a, b)
	return _bresenham_line(a, b)

func _los_dist3d(grid_ref, a: Vector2i, b: Vector2i) -> float:
	if _los_helper != null and _los_helper.has_method("dist3d"):
		return float(_los_helper.call("dist3d", grid_ref, a, b))
	return _fallback_dist3d(grid_ref, a, b)

func _cover_vs_attacker(grid_ref, defender: Vector2i, attacker: Vector2i) -> Dictionary:
	if _los_helper != null and _los_helper.has_method("cover_vs_attacker"):
		return _los_helper.call("cover_vs_attacker", grid_ref, defender, attacker)
	var dx = attacker.x - defender.x
	var dy = attacker.y - defender.y
	var dir = Vector2i.ZERO
	if abs(dx) >= abs(dy):
		dir = Vector2i(1, 0) if dx > 0 else Vector2i(-1, 0)
	else:
		dir = Vector2i(0, 1) if dy > 0 else Vector2i(0, -1)

	var dir_name := "E"
	if dir == Vector2i(0, -1): dir_name = "N"
	elif dir == Vector2i(0, 1): dir_name = "S"
	elif dir == Vector2i(-1, 0): dir_name = "W"

	if grid_ref == null:
		return {"type": "NONE", "dir": dir, "dir_name": dir_name}

	var front = defender + dir
	if grid_ref.in_bounds(front.x, front.y) and grid_ref.has_obstacle(front.x, front.y):
		return { "type": "FULL", "dir": dir, "dir_name": dir_name }

	var p1 = Vector2i(-dir.y, dir.x)
	var p2 = Vector2i(dir.y, -dir.x)
	var diag1 = defender + dir + p1
	var diag2 = defender + dir + p2
	if grid_ref.in_bounds(diag1.x, diag1.y) and grid_ref.has_obstacle(diag1.x, diag1.y):
		return { "type": "HALF", "dir": dir, "dir_name": dir_name }
	if grid_ref.in_bounds(diag2.x, diag2.y) and grid_ref.has_obstacle(diag2.x, diag2.y):
		return { "type": "HALF", "dir": dir, "dir_name": dir_name }

	return {"type": "NONE", "dir": dir, "dir_name": dir_name}

func _cover_vs_attacker_for_unit(defender: Unit, attacker_cell: Vector2i) -> Dictionary:
	if defender == null:
		return {"type": "NONE", "dir": Vector2i.ZERO, "dir_name": "E"}
	var has_hunker = defender.has_status("HUNKER")
	if _los_helper != null and _los_helper.has_method("cover_vs_attacker_with_status"):
		return _los_helper.call("cover_vs_attacker_with_status", grid, defender.cell, attacker_cell, has_hunker)
	var cover = _cover_vs_attacker(grid, defender.cell, attacker_cell)
	if has_hunker and String(cover.get("type", "")) == "HALF":
		cover["type"] = "FULL"
	return cover

func _fallback_dist3d(grid_ref, a: Vector2i, b: Vector2i) -> float:
	var ax = float(a.x)
	var ay = float(a.y)
	var bx = float(b.x)
	var by = float(b.y)
	var az = 0.0
	var bz = 0.0
	if grid_ref != null and grid_ref.has_method("get_height"):
		az = float(grid_ref.get_height(a.x, a.y))
		bz = float(grid_ref.get_height(b.x, b.y))
	var dx = ax - bx
	var dy = ay - by
	var dz = az - bz
	return sqrt(dx * dx + dy * dy + dz * dz)

func _bresenham_line(a: Vector2i, b: Vector2i) -> Array[Vector2i]:
	var pts: Array[Vector2i] = []
	var x0 = a.x
	var y0 = a.y
	var x1 = b.x
	var y1 = b.y
	var dx = abs(x1 - x0)
	var dy = -abs(y1 - y0)
	var sx = 1 if x0 < x1 else -1
	var sy = 1 if y0 < y1 else -1
	var err = dx + dy
	while true:
		pts.append(Vector2i(x0, y0))
		if x0 == x1 and y0 == y1:
			break
		var e2 = 2 * err
		if e2 >= dy:
			err += dy
			x0 += sx
		if e2 <= dx:
			err += dx
			y0 += sy
	return pts

func _update_enemy_visibility() -> void:
	if grid == null:
		return
	if _stealth_active:
		visible_enemies.clear()
		var turn_index = _current_turn_index()
		for u in player_units:
			if u == null or u.dead:
				continue
			var list: Array[Unit] = []
			for enemy in enemy_units:
				if enemy == null or enemy.dead:
					continue
				list.append(enemy)
				var enemy_id = enemy.get_instance_id()
				_seen_enemy_ids[enemy_id] = true
				known_enemy_cells[enemy_id] = enemy.cell
				known_enemy_turn[enemy_id] = turn_index
			visible_enemies[u.get_instance_id()] = list
		for enemy in enemy_units:
			if enemy == null:
				continue
			enemy.visible_to_player = true
			enemy.set_visible_state(true)
			_hide_enemy_ghost(enemy)
		_apply_height_visibility()
		return
	var now = float(Time.get_ticks_msec()) / 1000.0
	var turn_index = _current_turn_index()
	visible_enemies.clear()
	var visible_any: Dictionary = {}
	for u in player_units:
		if u == null or u.dead:
			continue
		var list: Array[Unit] = []
		for enemy in enemy_units:
			if enemy == null or enemy.dead:
				continue
			if _can_unit_see_unit(u, enemy):
				list.append(enemy)
				var enemy_id = enemy.get_instance_id()
				visible_any[enemy_id] = true
				_seen_enemy_ids[enemy_id] = true
				known_enemy_cells[enemy_id] = enemy.cell
				known_enemy_turn[enemy_id] = turn_index
				enemy.mark_seen(enemy.cell, now)
		visible_enemies[u.get_instance_id()] = list

	for enemy in enemy_units:
		if enemy == null or enemy.dead:
			continue
		var enemy_id = enemy.get_instance_id()
		var visible = bool(visible_any.get(enemy_id, false))
		enemy.visible_to_player = visible
		enemy.set_visible_state(visible)
		if visible:
			_hide_enemy_ghost(enemy)
		else:
			var last_cell: Vector2i = known_enemy_cells.get(enemy_id, enemy.last_seen_cell)
			if last_cell.x >= 0:
				var ghost = _ensure_enemy_ghost(enemy)
				_position_enemy_ghost(ghost, last_cell)
			else:
				_hide_enemy_ghost(enemy)
	_apply_height_visibility()

func _update_ai_visibility() -> void:
	visible_players_for_ai.clear()
	for enemy in enemy_units:
		if enemy == null or enemy.dead:
			continue
		var list: Array[Unit] = []
		for p in player_units:
			if p == null or p.dead:
				continue
			if _can_unit_see_unit(enemy, p):
				list.append(p)
				known_player_cells_for_ai[p.get_instance_id()] = p.cell
		visible_players_for_ai[enemy.get_instance_id()] = list

func _has_los_between(a: Vector2i, b: Vector2i) -> bool:
	var pts = _los_line(a, b)
	var blocker = _first_blocker_cell(pts)
	return blocker == null

func _is_cell_in_fov(viewer: Unit, cell: Vector2i) -> bool:
	if viewer == null:
		return false
	var vis_range = viewer.get_vis_range() if viewer.has_method("get_vis_range") else 8
	if not viewer.has_method("get_vis_range"):
		var v = viewer.get("vis_range")
		if v != null:
			vis_range = int(v)
	var facing = _unit_facing_dir_cell(viewer)
	if _los_helper != null and _los_helper.has_method("in_fov_cone"):
		return bool(_los_helper.call("in_fov_cone", viewer.cell, cell, facing, vis_range, STEALTH_CONE_WIDTH))
	var dx = cell.x - viewer.cell.x
	var dy = cell.y - viewer.cell.y
	if abs(dx) + abs(dy) > vis_range:
		return false
	return true

func _can_unit_see_unit(viewer: Unit, target: Unit) -> bool:
	if viewer == null or target == null or target.dead:
		return false
	var can_see = false
	if _los_helper != null and _los_helper.has_method("can_see_unit"):
		can_see = bool(_los_helper.call("can_see_unit", grid, viewer, target))
	else:
		can_see = _can_unit_see_cell(viewer, target.cell)
	if not can_see:
		return false
	return _is_cell_in_fov(viewer, target.cell)

func _can_unit_see_cell(viewer: Unit, cell: Vector2i) -> bool:
	if viewer == null or grid == null:
		return false
	if not grid.in_bounds(cell.x, cell.y):
		return false

	var dist := _los_dist3d(grid, viewer.cell, cell)
	var vis_range := 8

	if viewer.has_method("get_vis_range"):
		vis_range = int(viewer.get_vis_range())
	else:
		var v = viewer.get("vis_range")
		if v != null:
			vis_range = int(v)

	if dist > float(vis_range):
		return false

	if not _is_cell_in_fov(viewer, cell):
		return false

	return _has_los_between(viewer.cell, cell)


func _ensure_enemy_ghost(enemy: Unit) -> MeshInstance3D:
	var key = enemy.get_instance_id()
	var ghost = enemy_ghosts_by_id.get(key, null)
	if ghost == null or not is_instance_valid(ghost):
		ghost = MeshInstance3D.new()
		ghost.name = "EnemyGhost_%d" % key
		ghost.mesh = _make_ghost_mesh()
		ghost.material_override = _make_ghost_material()
		ghost.visible = false
		ghost.rotation = Vector3(-PI / 2.0, 0, 0)
		ghost.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		if units_root != null:
			units_root.add_child(ghost)
		else:
			add_child(ghost)
		enemy_ghosts_by_id[key] = ghost
	return ghost

func _position_enemy_ghost(ghost: MeshInstance3D, cell: Vector2i) -> void:
	if ghost == null or grid == null:
		return
	var wpos = grid.cell_to_world(cell.x, cell.y)
	ghost.global_position = wpos + Vector3(0, 0.02, 0)
	ghost.set_meta("cell", cell)
	ghost.visible = true

func _hide_enemy_ghost(enemy: Unit) -> void:
	if enemy == null:
		return
	var key = enemy.get_instance_id()
	var ghost = enemy_ghosts_by_id.get(key, null)
	if ghost != null and is_instance_valid(ghost):
		ghost.visible = false

func _update_los_visuals_for_shot(attacker: Unit, defender: Unit) -> void:
	var pts = _los_line(attacker.cell, defender.cell)
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

func _update_stealth_cones() -> void:
	if _stealth_cone_mm == null or grid == null:
		return
	if not _stealth_active or _stealth_state == "":
		_stealth_cone_mm.instance_count = 0
		return
	var unique_cells: Dictionary = {}
	for enemy in enemy_units:
		if enemy == null or enemy.dead:
			continue
		var vis_range = enemy.get_vis_range() if enemy.has_method("get_vis_range") else enemy.vis_range
		if _los_helper != null and _los_helper.has_method("cells_in_cone"):
			var cone_cells: Array = _los_helper.call("cells_in_cone", enemy.cell, _unit_facing_dir_cell(enemy), vis_range, STEALTH_CONE_WIDTH)
			for c in cone_cells:
				if grid.in_bounds(c.x, c.y):
					unique_cells[c] = true
		else:
			unique_cells[enemy.cell] = true
	var cells: Array = unique_cells.keys()
	_stealth_cone_mm.instance_count = cells.size()
	for i in range(cells.size()):
		var cell = cells[i]
		var wpos = grid.cell_to_world(cell.x, cell.y) + Vector3(0, 0.02, 0)
		var xform = Transform3D(Basis.IDENTITY, wpos)
		_stealth_cone_mm.set_instance_transform(i, xform)

func _check_stealth_detection() -> void:
	if not _stealth_active or _stealth_state != "ACTIVE":
		return
	for enemy in enemy_units:
		if enemy == null or enemy.dead:
			continue
		for p in player_units:
			if p == null or p.dead:
				continue
			if _can_unit_see_cell(enemy, p.cell):
				_reveal_stealth()
				return

func _reveal_stealth() -> void:
	if not _stealth_active:
		return
	_stealth_active = false
	_stealth_state = "REVEALED"
	_stealth_cone_mm.instance_count = 0
	_hint("Detectado! Combate iniciado.")
	_update_enemy_visibility()

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

	_fire_wall_preview_mmi = MultiMeshInstance3D.new()
	add_child(_fire_wall_preview_mmi)
	_fire_wall_preview_mm = MultiMesh.new()
	_fire_wall_preview_mm.transform_format = MultiMesh.TRANSFORM_3D
	_fire_wall_preview_mm.instance_count = 0
	_fire_wall_preview_mmi.multimesh = _fire_wall_preview_mm
	var fw_preview_quad := QuadMesh.new()
	fw_preview_quad.size = Vector2(1.0, 1.0)
	_fire_wall_preview_mm.mesh = fw_preview_quad
	var fw_preview_mat := StandardMaterial3D.new()
	fw_preview_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	fw_preview_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	fw_preview_mat.albedo_color = Color(1.0, 0.4, 0.2, 0.45)
	_fire_wall_preview_mmi.material_override = fw_preview_mat

	_fire_wall_mmi = MultiMeshInstance3D.new()
	add_child(_fire_wall_mmi)
	_fire_wall_mm = MultiMesh.new()
	_fire_wall_mm.transform_format = MultiMesh.TRANSFORM_3D
	_fire_wall_mm.instance_count = 0
	_fire_wall_mmi.multimesh = _fire_wall_mm
	var fw_quad := QuadMesh.new()
	fw_quad.size = Vector2(1.0, 1.0)
	_fire_wall_mm.mesh = fw_quad
	var fw_mat := StandardMaterial3D.new()
	fw_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	fw_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	fw_mat.albedo_color = Color(1.0, 0.25, 0.1, 0.6)
	fw_mat.emission_enabled = true
	fw_mat.emission = Color(1.0, 0.4, 0.2)
	_fire_wall_mmi.material_override = fw_mat

	_stealth_cone_mmi = MultiMeshInstance3D.new()
	add_child(_stealth_cone_mmi)
	_stealth_cone_mm = MultiMesh.new()
	_stealth_cone_mm.transform_format = MultiMesh.TRANSFORM_3D
	_stealth_cone_mm.instance_count = 0
	_stealth_cone_mmi.multimesh = _stealth_cone_mm
	var cone_quad := QuadMesh.new()
	cone_quad.size = Vector2(1.0, 1.0)
	_stealth_cone_mm.mesh = cone_quad
	var cone_mat := StandardMaterial3D.new()
	cone_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	cone_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	cone_mat.albedo_color = Color(1.0, 0.85, 0.25, 0.25)
	_stealth_cone_mmi.material_override = cone_mat

	_facing_arrow_idle_mat = StandardMaterial3D.new()
	_facing_arrow_idle_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_facing_arrow_idle_mat.albedo_color = Color(0.2, 0.6, 0.9, 0.6)
	_facing_arrow_idle_mat.emission_enabled = true
	_facing_arrow_idle_mat.emission = Color(0.2, 0.6, 0.9)

	_facing_arrow_selected_mat = StandardMaterial3D.new()
	_facing_arrow_selected_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_facing_arrow_selected_mat.albedo_color = Color(0.2, 0.95, 1.0, 0.9)
	_facing_arrow_selected_mat.emission_enabled = true
	_facing_arrow_selected_mat.emission = Color(0.2, 0.95, 1.0)

	for i in range(4):
		var arrow := MeshInstance3D.new()
		arrow.mesh = _make_arrow_mesh()
		arrow.visible = false
		arrow.scale = Vector3(0.6, 0.6, 0.6)
		arrow.material_override = _facing_arrow_idle_mat
		add_child(arrow)
		_facing_arrows.append(arrow)

func _ensure_action_markers() -> void:
	if active_ring != null and target_ring != null and active_arrow != null and caster_ring != null and action_target_ring != null and _action_marker_timer != null:
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

	if caster_ring == null:
		caster_ring = MeshInstance3D.new()
		caster_ring.name = "CasterRing"
		add_child(caster_ring)
		caster_ring.mesh = _make_ring_mesh()
		caster_ring.material_override = _make_ring_material(Color(0.2, 0.9, 0.4, 0.65))
		caster_ring.visible = false
		caster_ring.rotation = Vector3(-PI/2, 0, 0)

	if action_target_ring == null:
		action_target_ring = MeshInstance3D.new()
		action_target_ring.name = "ActionTargetRing"
		add_child(action_target_ring)
		action_target_ring.mesh = _make_ring_mesh()
		action_target_ring.material_override = _make_ring_material(Color(1.0, 0.4, 0.25, 0.65))
		action_target_ring.visible = false
		action_target_ring.rotation = Vector3(-PI/2, 0, 0)

	if _action_marker_timer == null:
		_action_marker_timer = Timer.new()
		_action_marker_timer.name = "ActionMarkerTimer"
		_action_marker_timer.one_shot = true
		_action_marker_timer.wait_time = 0.6
		add_child(_action_marker_timer)
		_action_marker_timer.timeout.connect(_hide_action_markers)

func _make_ring_mesh() -> Mesh:
	var mesh := ImmediateMesh.new()
	var segments := 32
	var radius := 0.45
	mesh.clear_surfaces()
	mesh.surface_begin(Mesh.PRIMITIVE_LINE_STRIP)
	for i in range(segments + 1):
		var t = TAU * float(i) / float(segments)
		mesh.surface_add_vertex(Vector3(cos(t) * radius, 0.0, sin(t) * radius))
	mesh.surface_end()
	return mesh

func _make_ghost_mesh() -> Mesh:
	var quad := QuadMesh.new()
	quad.size = Vector2(0.7, 0.7)
	return quad

func _make_ghost_material() -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color = Color(0.45, 0.6, 0.9, 0.45)
	return mat


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
	if CombatFXRef == null:
		_log("CombatFX indisponível (%s). FX desativado." % COMBAT_FX_PATH)
		return
	fx = CombatFXRef.new()
	if fx != null:
		fx.name = "CombatFX"
		add_child(fx)

func _notify_combat_fx_at_pos(pos: Vector3, label: String, target: Unit = null) -> void:
	if fx == null:
		if label != "":
			_log(label)
		return
	if fx.has_method("spawn_text"):
		fx.call("spawn_text", label, pos)
	elif fx.has_method("spawn_floating_text"):
		fx.spawn_floating_text(label, pos, Color(1.0, 0.9, 0.6, 1.0))
	if target != null and fx.has_method("flash_target"):
		fx.call("flash_target", target)

func _ensure_log_ui() -> void:
	var ui = ui_root
	if ui == null:
		return

	_log_panel = ui.get_node_or_null("CombatLogPanel") as Control
	if _log_panel == null:
		_log_panel = Panel.new()
		_log_panel.name = "CombatLogPanel"
		_log_panel.anchor_left = 0.0
		_log_panel.anchor_right = 1.0
		_log_panel.anchor_top = 0.0
		_log_panel.anchor_bottom = 1.0
		_log_panel.offset_left = 0
		_log_panel.offset_right = 0
		_log_panel.offset_top = 0
		_log_panel.offset_bottom = 0
		_log_panel.mouse_filter = Control.MOUSE_FILTER_PASS
		if _hud_bottom_left != null:
			_hud_bottom_left.add_child(_log_panel)
		else:
			ui.add_child(_log_panel)
	if _log_panel != null:
		_log_panel.mouse_filter = Control.MOUSE_FILTER_PASS
		_log_panel.custom_minimum_size = Vector2(0, 110)
		_log_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_log_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	if _hud_bottom_left != null:
		_reparent_control(_log_panel, _hud_bottom_left)

	_log_scroll = _log_panel.get_node_or_null("LogScroll") as ScrollContainer
	if _log_scroll == null:
		_log_scroll = ScrollContainer.new()
		_log_scroll.name = "LogScroll"
		_log_scroll.anchor_left = 0.0
		_log_scroll.anchor_right = 1.0
		_log_scroll.anchor_top = 0.0
		_log_scroll.anchor_bottom = 1.0
		_log_scroll.offset_left = 6
		_log_scroll.offset_right = -6
		_log_scroll.offset_top = 6
		_log_scroll.offset_bottom = -6
		_log_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		_log_panel.add_child(_log_scroll)
	if _log_scroll != null:
		_log_scroll.mouse_filter = Control.MOUSE_FILTER_PASS

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
	if _log_label != null:
		_log_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_update_log_ui()

func _update_log_ui() -> void:
	if _log_label == null:
		return
	_log_label.text = "\n".join(_log_buffer)
	if _log_label.get_line_count() > 0:
		_log_label.scroll_to_line(_log_label.get_line_count() - 1)

func _ensure_status_ui() -> void:
	var ui = ui_root
	if ui == null:
		return
	_status_label = ui.get_node_or_null("StatusLabel") as Label
	if _status_label == null:
		_status_label = Label.new()
		_status_label.name = "StatusLabel"
		_status_label.anchor_left = 0.0
		_status_label.anchor_right = 1.0
		_status_label.anchor_top = 0.0
		_status_label.anchor_bottom = 0.0
		_status_label.offset_left = 0
		_status_label.offset_right = 0
		_status_label.offset_top = 0
		_status_label.offset_bottom = 24
		_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		_status_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		if _hud_bottom_left != null:
			_hud_bottom_left.add_child(_status_label)
		else:
			ui.add_child(_status_label)
	if _status_label != null:
		_status_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_status_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_status_label.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
		if _hud_bottom_left != null:
			_reparent_control(_status_label, _hud_bottom_left)
	_update_status_ui(null)

func _ensure_hint_ui() -> void:
	var ui = ui_root
	if ui == null:
		return
	_hint_label = ui.get_node_or_null("HintLabel") as Label
	if _hint_label == null:
		_hint_label = Label.new()
		_hint_label.name = "HintLabel"
		_hint_label.anchor_left = 0.5
		_hint_label.anchor_right = 0.5
		_hint_label.anchor_top = 1.0
		_hint_label.anchor_bottom = 1.0
		_hint_label.offset_left = -220
		_hint_label.offset_right = 220
		_hint_label.offset_top = -140
		_hint_label.offset_bottom = -100
		_hint_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_hint_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		_hint_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		_hint_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		ui.add_child(_hint_label)
	if _hint_label != null:
		_hint_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hint_label.visible = false

	_hint_timer = ui.get_node_or_null("HintTimer") as Timer
	if _hint_timer == null:
		_hint_timer = Timer.new()
		_hint_timer.name = "HintTimer"
		_hint_timer.one_shot = true
		ui.add_child(_hint_timer)
	if not _hint_timer.timeout.is_connected(_on_hint_timeout):
		_hint_timer.timeout.connect(_on_hint_timeout)

func _on_hint_timeout() -> void:
	if _hint_label != null:
		_hint_label.visible = false

func _hint(msg: String, duration := 1.2) -> void:
	if msg == "":
		return
	if _hint_label == null:
		return
	var now = float(Time.get_ticks_msec()) / 1000.0
	if msg == _last_hint_msg and (now - _last_hint_time) < 0.4:
		return
	_last_hint_msg = msg
	_last_hint_time = now
	_hint_label.text = msg
	_hint_label.visible = true
	if _hint_timer != null:
		_hint_timer.stop()
		_hint_timer.wait_time = duration
		_hint_timer.start()

func _update_status_ui(u: Unit) -> void:
	if _status_label == null:
		return
	if u == null:
		_status_label.text = "STATUS: -"
		return
	var summary = u.get_status_summary()
	_status_label.text = "STATUS: %s" % (summary if summary != "" else "-")

func _ensure_height_toggle_label() -> void:
	if ui_root == null:
		return
	_height_label = ui_root.get_node_or_null("HeightToggleLabel") as Label
	if _height_label == null:
		_height_label = Label.new()
		_height_label.name = "HeightToggleLabel"
		ui_root.add_child(_height_label)
	if _height_label != null:
		_height_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		if _hud_bottom_left != null:
			_reparent_control(_height_label, _hud_bottom_left)
		_height_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		_height_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_height_label.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	_update_height_toggle_label()

func _update_height_toggle_label() -> void:
	if _height_label == null:
		return
	var mode_txt = "ALL" if view_mode == ViewMode.VIEW_ALL else "LEVEL"
	_height_label.text = "VISÃO: %s | Nível: %d" % [mode_txt, view_level]

func _set_view_level_from_cell(cell: Vector2i) -> void:
	if grid == null or not grid.in_bounds(cell.x, cell.y):
		return
	view_level = grid.get_height(cell.x, cell.y)
	_update_height_toggle_label()
	_apply_height_visibility()
	_build_reach_overlay(_reach_cost)

func _set_view_level_offset(delta: int) -> void:
	view_level += delta
	_update_height_toggle_label()
	_apply_height_visibility()
	_build_reach_overlay(_reach_cost)

func _cycle_view_level() -> void:
	if view_mode == ViewMode.VIEW_ALL:
		view_mode = ViewMode.VIEW_LEVEL_ONLY
		view_level = 0
	else:
		view_level += 1
		if view_level > _max_height:
			view_level = 0
	_update_height_toggle_label()
	_apply_height_visibility()
	_build_reach_overlay(_reach_cost)

func _toggle_view_mode() -> void:
	view_mode = ViewMode.VIEW_LEVEL_ONLY if view_mode == ViewMode.VIEW_ALL else ViewMode.VIEW_ALL
	_update_height_toggle_label()
	_apply_height_visibility()
	_build_reach_overlay(_reach_cost)

func _is_cell_visible_in_view(cell: Vector2i) -> bool:
	if view_mode == ViewMode.VIEW_ALL:
		return true
	if grid == null or not grid.in_bounds(cell.x, cell.y):
		return false
	var h = grid.get_height(cell.x, cell.y)
	return abs(h - view_level) <= view_level_tolerance

func _apply_height_visibility() -> void:
	if grid == null:
		return
	for u in player_units:
		if u == null:
			continue
		var show = _is_cell_visible_in_view(u.cell)
		u.visible = show
	for e in enemy_units:
		if e == null:
			continue
		var show_e = _is_cell_visible_in_view(e.cell)
		e.visible = show_e
		if show_e:
			e.set_visible_state(e.visible_to_player)
	for cell in obstacle_mesh.keys():
		var obs = obstacle_mesh[cell]
		if obs == null:
			continue
		obs.visible = _is_cell_visible_in_view(cell)
	for ghost in enemy_ghosts_by_id.values():
		if ghost == null or not is_instance_valid(ghost):
			continue
		var gcell = ghost.get_meta("cell", Vector2i(-999, -999))
		ghost.visible = _is_cell_visible_in_view(gcell)

func _ensure_turn_order_ui() -> void:
	var ui = ui_root
	if ui == null:
		return
	_turn_panel = ui.get_node_or_null("TurnOrderPanel") as Control
	if _turn_panel == null:
		_turn_panel = Panel.new()
		_turn_panel.name = "TurnOrderPanel"
		if _hud_top_right != null:
			_hud_top_right.add_child(_turn_panel)
		else:
			ui.add_child(_turn_panel)
	if _turn_panel != null:
		if _hud_top_right != null:
			_reparent_control(_turn_panel, _hud_top_right)
		_turn_panel.mouse_filter = Control.MOUSE_FILTER_PASS
		_turn_panel.custom_minimum_size = Vector2(0, 90)
		_turn_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_turn_panel.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
		_turn_panel.anchor_left = 0.0
		_turn_panel.anchor_right = 1.0
		_turn_panel.anchor_top = 0.0
		_turn_panel.anchor_bottom = 0.0
		_turn_panel.offset_left = 0
		_turn_panel.offset_right = 0
		_turn_panel.offset_top = 0
		_turn_panel.offset_bottom = 90

	_turn_label = _turn_panel.get_node_or_null("TurnOrderLabel") as Label
	if _turn_label == null:
		_turn_label = Label.new()
		_turn_label.name = "TurnOrderLabel"
		_turn_label.position = Vector2(8, 6)
		_turn_label.size = Vector2(320, 80)
		_turn_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		_turn_panel.add_child(_turn_label)
	if _turn_label != null:
		_turn_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		if _hud_top_right != null and aim_label != null and aim_label.get_parent() == _hud_top_right:
			_hud_top_right.move_child(aim_label, 1)
	_update_turn_order_ui()

func _ensure_enemies_panel() -> void:
	var ui = ui_root
	if ui == null:
		return
	# UI: painel de inimigos em LOS / last known
	_enemies_panel = ui.get_node_or_null("EnemiesPanel") as Control
	if _enemies_panel == null:
		_enemies_panel = Panel.new()
		_enemies_panel.name = "EnemiesPanel"
		if _hud_top_right != null:
			_hud_top_right.add_child(_enemies_panel)
		else:
			ui.add_child(_enemies_panel)
	if _enemies_panel != null:
		if _hud_top_right != null:
			_reparent_control(_enemies_panel, _hud_top_right)
		_enemies_panel.mouse_filter = Control.MOUSE_FILTER_PASS
		_enemies_panel.custom_minimum_size = Vector2(0, 200)
		_enemies_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_enemies_panel.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
		_enemies_panel.anchor_left = 0.0
		_enemies_panel.anchor_right = 1.0
		_enemies_panel.anchor_top = 0.0
		_enemies_panel.anchor_bottom = 0.0
		_enemies_panel.offset_left = 0
		_enemies_panel.offset_right = 0
		_enemies_panel.offset_top = 96
		_enemies_panel.offset_bottom = 300

	var root = _enemies_panel.get_node_or_null("EnemiesRoot") as VBoxContainer
	if root == null:
		root = VBoxContainer.new()
		root.name = "EnemiesRoot"
		root.anchor_left = 0.0
		root.anchor_right = 1.0
		root.anchor_top = 0.0
		root.anchor_bottom = 1.0
		root.offset_left = 8
		root.offset_right = -8
		root.offset_top = 8
		root.offset_bottom = -8
		root.add_theme_constant_override("separation", 4)
		_enemies_panel.add_child(root)
	if root != null:
		root.mouse_filter = Control.MOUSE_FILTER_PASS

	var in_los_label = root.get_node_or_null("InLosLabel") as Label
	if in_los_label == null:
		in_los_label = Label.new()
		in_los_label.name = "InLosLabel"
		in_los_label.text = "Inimigos em LOS"
		root.add_child(in_los_label)
	if in_los_label != null:
		in_los_label.mouse_filter = Control.MOUSE_FILTER_IGNORE

	_enemies_in_los_list = root.get_node_or_null("InLosList") as VBoxContainer
	if _enemies_in_los_list == null:
		_enemies_in_los_list = VBoxContainer.new()
		_enemies_in_los_list.name = "InLosList"
		root.add_child(_enemies_in_los_list)

	var last_known_label = root.get_node_or_null("LastKnownLabel") as Label
	if last_known_label == null:
		last_known_label = Label.new()
		last_known_label.name = "LastKnownLabel"
		last_known_label.text = "Última posição"
		root.add_child(last_known_label)
	if last_known_label != null:
		last_known_label.mouse_filter = Control.MOUSE_FILTER_IGNORE

	_enemies_last_known_list = root.get_node_or_null("LastKnownList") as VBoxContainer
	if _enemies_last_known_list == null:
		_enemies_last_known_list = VBoxContainer.new()
		_enemies_last_known_list.name = "LastKnownList"
		root.add_child(_enemies_last_known_list)

func _ensure_action_confirm_panel() -> void:
	var ui = ui_root
	if ui == null:
		return
	# UI: confirmação de ações
	_confirm_panel = ui.get_node_or_null("ActionConfirmPanel") as Control
	if _confirm_panel == null:
		_confirm_panel = Panel.new()
		_confirm_panel.name = "ActionConfirmPanel"
		ui.add_child(_confirm_panel)
	if _confirm_panel != null:
		_confirm_panel.mouse_filter = Control.MOUSE_FILTER_PASS
		_confirm_panel.anchor_left = 0.5
		_confirm_panel.anchor_right = 0.5
		_confirm_panel.anchor_top = 1.0
		_confirm_panel.anchor_bottom = 1.0
		_confirm_panel.offset_left = -200
		_confirm_panel.offset_right = 200
		_confirm_panel.offset_top = -160
		_confirm_panel.offset_bottom = -96
		_confirm_panel.visible = false

	_confirm_label = _confirm_panel.get_node_or_null("ConfirmLabel") as Label
	if _confirm_label == null:
		_confirm_label = Label.new()
		_confirm_label.name = "ConfirmLabel"
		_confirm_label.position = Vector2(12, 8)
		_confirm_label.size = Vector2(376, 28)
		_confirm_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		_confirm_panel.add_child(_confirm_label)
	if _confirm_label != null:
		_confirm_label.mouse_filter = Control.MOUSE_FILTER_IGNORE

	var buttons = _confirm_panel.get_node_or_null("ConfirmButtons") as HBoxContainer
	if buttons == null:
		buttons = HBoxContainer.new()
		buttons.name = "ConfirmButtons"
		buttons.position = Vector2(12, 40)
		buttons.size = Vector2(376, 24)
		buttons.add_theme_constant_override("separation", 8)
		_confirm_panel.add_child(buttons)
	if buttons != null:
		buttons.mouse_filter = Control.MOUSE_FILTER_PASS

	_confirm_button = buttons.get_node_or_null("ConfirmButton") as Button
	if _confirm_button == null:
		_confirm_button = Button.new()
		_confirm_button.name = "ConfirmButton"
		_confirm_button.text = "Confirmar"
		buttons.add_child(_confirm_button)

	_cancel_button = buttons.get_node_or_null("CancelButton") as Button
	if _cancel_button == null:
		_cancel_button = Button.new()
		_cancel_button.name = "CancelButton"
		_cancel_button.text = "Cancelar"
		buttons.add_child(_cancel_button)

	if _confirm_button != null and not _confirm_button.pressed.is_connected(_on_confirm_action_pressed):
		_confirm_button.pressed.connect(_on_confirm_action_pressed)
	if _cancel_button != null and not _cancel_button.pressed.is_connected(_on_cancel_action_pressed):
		_cancel_button.pressed.connect(_on_cancel_action_pressed)

func _ensure_debug_overlay() -> void:
	if ui_root == null:
		return
	_debug_panel = ui_root.get_node_or_null("DebugOverlay") as Panel
	if _debug_panel == null:
		_debug_panel = Panel.new()
		_debug_panel.name = "DebugOverlay"
		_debug_panel.anchor_left = 0.0
		_debug_panel.anchor_top = 0.0
		_debug_panel.anchor_right = 0.0
		_debug_panel.anchor_bottom = 0.0
		_debug_panel.offset_left = 12
		_debug_panel.offset_top = 12
		_debug_panel.offset_right = 360
		_debug_panel.offset_bottom = 220
		ui_root.add_child(_debug_panel)
	_debug_panel.visible = _debug_visible
	_debug_label = _debug_panel.get_node_or_null("DebugLabel") as RichTextLabel
	if _debug_label == null:
		_debug_label = RichTextLabel.new()
		_debug_label.name = "DebugLabel"
		_debug_label.fit_content = true
		_debug_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		_debug_label.scroll_active = false
		_debug_label.scroll_following = false
		_debug_label.anchor_left = 0.0
		_debug_label.anchor_top = 0.0
		_debug_label.anchor_right = 1.0
		_debug_label.anchor_bottom = 1.0
		_debug_label.offset_left = 8
		_debug_label.offset_top = 8
		_debug_label.offset_right = -8
		_debug_label.offset_bottom = -8
		_debug_panel.add_child(_debug_label)

func _update_debug_overlay() -> void:
	if _debug_label == null or not _debug_visible:
		return
	var lines: Array[String] = []
	lines.append("Seed: %d" % mission_seed)
	lines.append("Mission: %s" % String(mission.get("id", "")))
	lines.append("Objectives:")
	for obj in mission_objectives_state:
		lines.append("- %s: %s" % [String(obj.get("type", "")), "OK" if bool(obj.get("completed", false)) else "PEND"])
	var act: Unit = timeline.get_active_unit() if timeline != null and timeline.has_method("get_active_unit") else null
	if act != null:
		lines.append("Active: %s | Team %d" % [act.unit_name, act.team])
		lines.append("AI State: %s" % ("ACTIVE" if act.team == 1 else "PLAYER"))
		if _hover_snap.x >= 0:
			var los_ok = _can_unit_see_cell(act, _hover_snap)
			lines.append("LOS hover: %s" % ("OK" if los_ok else "BLOCK"))
	lines.append("AI visible players: %d" % visible_players_for_ai.size())
	lines.append("Last known enemies: %d" % known_enemy_cells.size())
	lines.append("Last known players (AI): %d" % known_player_cells_for_ai.size())
	_debug_label.text = "\n".join(lines)

func _ensure_body_target_panel() -> void:
	if ui_root == null:
		return
	_body_target_panel = ui_root.get_node_or_null("BodyTargetPanel") as Control
	if _body_target_panel == null:
		_body_target_panel = Panel.new()
		_body_target_panel.name = "BodyTargetPanel"
		ui_root.add_child(_body_target_panel)
	if _body_target_panel != null:
		_body_target_panel.mouse_filter = Control.MOUSE_FILTER_PASS
		_body_target_panel.anchor_left = 0.5
		_body_target_panel.anchor_right = 0.5
		_body_target_panel.anchor_top = 1.0
		_body_target_panel.anchor_bottom = 1.0
		_body_target_panel.offset_left = -260
		_body_target_panel.offset_right = 260
		_body_target_panel.offset_top = -260
		_body_target_panel.offset_bottom = -80
		_body_target_panel.visible = false

	_body_target_title = _body_target_panel.get_node_or_null("BodyTargetTitle") as Label
	if _body_target_title == null:
		_body_target_title = Label.new()
		_body_target_title.name = "BodyTargetTitle"
		_body_target_title.position = Vector2(12, 8)
		_body_target_title.size = Vector2(280, 20)
		_body_target_panel.add_child(_body_target_title)
	if _body_target_title != null:
		_body_target_title.mouse_filter = Control.MOUSE_FILTER_IGNORE

	_body_target_list = _body_target_panel.get_node_or_null("BodyTargetList") as VBoxContainer
	if _body_target_list == null:
		_body_target_list = VBoxContainer.new()
		_body_target_list.name = "BodyTargetList"
		_body_target_list.position = Vector2(12, 36)
		_body_target_list.size = Vector2(280, 200)
		_body_target_list.add_theme_constant_override("separation", 6)
		_body_target_panel.add_child(_body_target_list)
	if _body_target_list != null:
		_body_target_list.mouse_filter = Control.MOUSE_FILTER_PASS

func _update_enemies_panel(active_unit: Unit) -> void:
	if _enemies_panel == null or _enemies_in_los_list == null or _enemies_last_known_list == null:
		return
	_clear_ui_list(_enemies_in_los_list)
	_clear_ui_list(_enemies_last_known_list)
	if active_unit == null or active_unit.team != 0:
		return

	var active_id = active_unit.get_instance_id()
	var visibles: Array = visible_enemies.get(active_id, [])
	var visible_ids: Dictionary = {}
	for enemy in visibles:
		if enemy == null or enemy.dead:
			continue
		visible_ids[enemy.get_instance_id()] = true
		var dist = _manhattan(active_unit.cell, enemy.cell)
		var row = VBoxContainer.new()
		var btn = Button.new()
		btn.text = "%s | Dist %d" % [enemy.unit_name, dist]
		btn.add_theme_color_override("font_color", Color(0.95, 0.2, 0.2))
		btn.pressed.connect(_on_enemy_focus_pressed.bind(enemy.get_instance_id(), true))
		row.add_child(btn)
		var hp_bar = ProgressBar.new()
		hp_bar.min_value = 0
		hp_bar.max_value = max(1, enemy.max_hp)
		hp_bar.value = enemy.hp
		hp_bar.show_percentage = false
		hp_bar.modulate = Color(0.9, 0.2, 0.2)
		row.add_child(hp_bar)
		_enemies_in_los_list.add_child(row)

	var current_turn = _current_turn_index()
	for enemy_id in known_enemy_cells.keys():
		if not _seen_enemy_ids.has(enemy_id):
			continue
		if visible_ids.has(enemy_id):
			continue
		var enemy = _find_enemy_by_id(enemy_id)
		var last_cell: Vector2i = known_enemy_cells.get(enemy_id, Vector2i(-999, -999))
		if last_cell.x < 0:
			continue
		var last_turn = int(known_enemy_turn.get(enemy_id, current_turn))
		var ago = max(0, current_turn - last_turn)
		var label = enemy.unit_name if enemy != null else "Inimigo"
		var btn2 = Button.new()
		btn2.text = "%s (?) | visto há %d turnos" % [label, ago]
		btn2.add_theme_color_override("font_color", Color(0.95, 0.2, 0.2))
		btn2.pressed.connect(_on_enemy_focus_pressed.bind(enemy_id, false))
		_enemies_last_known_list.add_child(btn2)

func _clear_ui_list(container: VBoxContainer) -> void:
	if container == null:
		return
	for child in container.get_children():
		child.queue_free()

func _ordered_hit_zones(zones: Array[Dictionary]) -> Array[Dictionary]:
	var ordered: Array[Dictionary] = []
	for zone_id in HIT_ZONE_PRIORITY:
		for zone in zones:
			if String(zone.get("id", "")).to_upper() == zone_id:
				ordered.append(zone)
				break
	for zone in zones:
		if ordered.has(zone):
			continue
		ordered.append(zone)
	return ordered

func _set_selected_hit_zone(target: Unit, zone_id: String) -> void:
	if target == null or zone_id == "":
		return
	_hit_zone_selection[target.get_instance_id()] = zone_id

func _get_selected_hit_zone_id(target: Unit) -> String:
	if target == null:
		return ""
	var tid = target.get_instance_id()
	if _hit_zone_selection.has(tid):
		return String(_hit_zone_selection[tid])
	var default_zone = target.get_default_hit_zone()
	var default_id = String(default_zone.get("id", ""))
	if default_id != "":
		_hit_zone_selection[tid] = default_id
	return default_id

func _clear_body_target_selection(target_id: int = 0) -> void:
	if target_id > 0:
		_hit_zone_selection.erase(target_id)
	else:
		_hit_zone_selection.clear()
	_body_target_target_id = 0
	if _body_target_panel != null:
		_body_target_panel.visible = false
	_body_target_hide_timer = 0.0

func _hide_body_target_panel() -> void:
	if _body_target_panel != null:
		_body_target_panel.visible = false
	_body_target_target_id = 0
	_body_target_hide_timer = 0.0

func _schedule_body_target_hide() -> void:
	if _body_target_panel == null or not _body_target_panel.visible:
		return
	_body_target_hide_timer = BODY_TARGET_HIDE_DELAY

func _update_body_target_panel(attacker: Unit, target: Unit, is_melee: bool) -> void:
	if _body_target_panel == null or _body_target_list == null or _body_target_title == null:
		return
	if attacker == null or attacker.team != 0 or target == null or action_mode != ActionMode.SHOOT:
		_hide_body_target_panel()
		return
	var zones = target.get_enabled_hit_zones()
	if zones.is_empty():
		_hide_body_target_panel()
		return
	_body_target_panel.visible = true
	_body_target_hide_timer = 0.0
	_body_target_target_id = target.get_instance_id()
	var selected_id = _get_selected_hit_zone_id(target)
	_body_target_title.text = "Alvo: %s" % target.unit_name
	_clear_ui_list(_body_target_list)

	var base_dmg = _get_base_attack_damage(attacker, is_melee)
	var ordered_zones = _ordered_hit_zones(zones)
	for zone in ordered_zones:
		var zone_id = String(zone.get("id", ""))
		var zone_label = String(zone.get("label", zone_id))
		var ctx = {
			"melee": is_melee,
			"base_dmg": base_dmg,
			"dmg_type": Damage.DmgType.PIERCING,
			"use_hit_zone": true,
			"hit_zone_id": zone_id
		}
		var preview = _compute_shot_preview(attacker, target, ctx)
		var hit_txt = "%d%%" % int(preview.get("hit", 0))
		var dmg_txt = "-"
		if preview.has("dmg_est"):
			var dmg_est: Dictionary = preview.dmg_est
			dmg_txt = "%d-%d" % [int(dmg_est.get("min", 0)), int(dmg_est.get("max", 0))]
		var status_txt = "-"
		var status_id = String(zone.get("status_on_hit", ""))
		if status_id != "":
			var chance = float(zone.get("status_chance", 0.0))
			status_txt = "%s %.0f%%" % [status_id, chance * 100.0]
		var key_idx = HIT_ZONE_PRIORITY.find(zone_id)
		var key_txt = "%d" % (key_idx + 1) if key_idx >= 0 else "-"
		var btn = Button.new()
		btn.text = "%s %s | Hit:%s | Dmg:%s | %s" % [key_txt, zone_label, hit_txt, dmg_txt, status_txt]
		if zone_id == selected_id:
			btn.text += " [ALVO]"
		btn.pressed.connect(_on_body_zone_pressed.bind(zone_id))
		_body_target_list.add_child(btn)

func _on_body_zone_pressed(zone_id: String) -> void:
	if _body_target_target_id == 0:
		return
	var target = _find_enemy_by_id(_body_target_target_id)
	if target == null:
		return
	_set_selected_hit_zone(target, zone_id)
	var act: Unit = timeline.get_active_unit() if timeline != null and timeline.has_method("get_active_unit") else null
	if act != null and action_mode != ActionMode.ABILITY:
		_request_attack_confirm(act, target, zone_id)
	_hide_body_target_panel()

func _select_hit_zone_by_index(target: Unit, idx: int) -> void:
	if target == null:
		return
	if idx < 0 or idx >= HIT_ZONE_PRIORITY.size():
		return
	var zone_id = HIT_ZONE_PRIORITY[idx]
	var zone = target.get_hit_zone(zone_id)
	if zone.is_empty() or not bool(zone.get("enabled", true)):
		_hint("Parte indisponível")
		return
	_set_selected_hit_zone(target, zone_id)
	var act: Unit = timeline.get_active_unit() if timeline != null and timeline.has_method("get_active_unit") else null
	if act != null and action_mode != ActionMode.ABILITY:
		_request_attack_confirm(act, target, zone_id)
	_hide_body_target_panel()

func _consume_hit_zone_selection(target: Unit) -> void:
	if target == null:
		return
	_hit_zone_selection.erase(target.get_instance_id())

func _request_attack_confirm(attacker: Unit, target: Unit, zone_id: String) -> void:
	if attacker == null or target == null:
		return
	if not _pending_action.is_empty():
		return
	var is_melee = _manhattan(attacker.cell, target.cell) <= 1
	var attack_prompt = _attack_confirm_prompt(attacker, target, zone_id, is_melee)
	var attack_type = "MELEE" if is_melee else "ATTACK"
	_request_action_confirm({
		"type": attack_type,
		"target_id": target.get_instance_id(),
		"hit_zone_id": zone_id
	}, attack_prompt, attacker, true)

func _on_enemy_focus_pressed(enemy_id: int, in_los: bool) -> void:
	if in_los:
		var enemy = _find_enemy_by_id(enemy_id)
		if enemy != null:
			_focus_camera_on_unit(enemy, false)
			_set_view_level_from_cell(enemy.cell)
		return
	var cell: Vector2i = known_enemy_cells.get(enemy_id, Vector2i(-999, -999))
	if cell.x >= 0:
		_focus_camera_on_cell(cell, false)
		_set_view_level_from_cell(cell)

func _find_enemy_by_id(enemy_id: int) -> Unit:
	for enemy in enemy_units:
		if enemy != null and enemy.get_instance_id() == enemy_id:
			return enemy
	return null

func _find_unit_by_instance_id(unit_id: int) -> Unit:
	for u in player_units:
		if u != null and u.get_instance_id() == unit_id:
			return u
	for u in enemy_units:
		if u != null and u.get_instance_id() == unit_id:
			return u
	return null

func _find_player_by_hero_id(hero_id: String) -> Unit:
	for u in player_units:
		if u != null and u.hero_id == hero_id:
			return u
	return null

func _pick_random_enemy() -> Unit:
	if enemy_units.is_empty():
		return null
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	return enemy_units[rng.randi_range(0, enemy_units.size() - 1)]

func _current_turn_index() -> int:
	if timeline != null:
		return timeline.activation_count
	return int(mission_state.get("turns", 0))

func _on_confirm_action_pressed() -> void:
	_execute_pending_action()

func _on_cancel_action_pressed() -> void:
	if not _pending_action.is_empty() and String(_pending_action.get("type", "")) == "CHANNEL":
		var act: Unit = timeline.get_active_unit() if timeline != null and timeline.has_method("get_active_unit") else null
		if act != null:
			_log("%s interrompeu a Parede de Fogo." % act.unit_name)
			_end_fire_wall_channel(act)
		if timeline != null:
			timeline.set_process(true)
	_clear_pending_action()

func _clear_pending_action() -> void:
	_pending_action = {}
	if _confirm_panel != null:
		_confirm_panel.visible = false

func _show_confirm_panel(text: String) -> void:
	if _confirm_panel == null or _confirm_label == null:
		return
	_confirm_label.text = text
	_confirm_panel.visible = true

func _execute_pending_action() -> void:
	if _pending_action.is_empty():
		_clear_pending_action()
		return
	var act = timeline.get_active_unit() if timeline != null and timeline.has_method("get_active_unit") else null
	if act == null or act.get_instance_id() != int(_pending_action.get("unit_id", 0)):
		_clear_pending_action()
		return
	_confirm_panel.visible = false
	var action_type = String(_pending_action.get("type", ""))
	var end_turn_after := false
	match action_type:
		"MOVE":
			var dest: Vector2i = _pending_action.get("cell", Vector2i(-999, -999))
			if dest.x >= 0:
				_try_move_with_overwatch_triggers(act, dest)
		"ATTACK":
			var target_id = int(_pending_action.get("target_id", 0))
			var target = _find_enemy_by_id(target_id)
			if target != null:
				_focus_camera_on_world(target.global_position, false)
				var zone_id = String(_pending_action.get("hit_zone_id", ""))
				_try_attack(act, target, true, zone_id)
		"MELEE":
			var target_id2 = int(_pending_action.get("target_id", 0))
			var target2 = _find_enemy_by_id(target_id2)
			if target2 != null:
				_focus_camera_on_world(target2.global_position, false)
				var zone_id2 = String(_pending_action.get("hit_zone_id", ""))
				_try_melee_attack(act, target2, true, zone_id2)
		"ABILITY":
			var ability = _pending_action.get("ability", {})
			var tags: Array = ability.get("tags", [])
			end_turn_after = tags.has("END_TURN")
			var cell: Vector2i = _pending_action.get("cell", act.cell)
			_selected_ability = ability
			action_mode = ActionMode.ABILITY
			_execute_selected_ability(act, cell)
			if _fire_wall_selecting_dir:
				_clear_pending_action()
				return
		"CHANNEL":
			var mp_cost = int(_pending_action.get("mp_cost", 0))
			if act.channeling and mp_cost > 0:
				act.mp = max(0, act.mp - mp_cost)
			act.pa = 0
			_clear_pending_action()
			if timeline != null:
				timeline.set_process(true)
				timeline.force_end_active_turn()
			return
		_:
			_clear_pending_action()
			return
	if end_turn_after:
		_clear_pending_action()
		return
	_after_player_action(act)
	_refresh_hotbar(act)
	_clear_pending_action()

func _request_action_confirm(action: Dictionary, prompt: String, act: Unit, force_confirm: bool = false) -> void:
	if act == null:
		return
	# Fluxo: abrir confirmação (ou executar direto se desativado)
	action["unit_id"] = act.get_instance_id()
	if not confirm_actions_enabled and not force_confirm:
		_pending_action = action
		_execute_pending_action()
		return
	_pending_action = action
	_show_confirm_panel(prompt)

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
		AbilityTargetMode.CELL:
			return "CELL"
		AbilityTargetMode.UNIT:
			return "UNIT"
		AbilityTargetMode.SELF:
			return "SELF"
		_:
			return "?"

func _kit_for_id(kit_id: String) -> Array[Dictionary]:
	if _abilities_helper != null and _abilities_helper.has_method("kit_by_id"):
		return _abilities_helper.call("kit_by_id", kit_id)
	return _default_kit()

func _default_kit() -> Array[Dictionary]:
	if _abilities_helper != null and _abilities_helper.has_method("default_kit"):
		return _abilities_helper.call("default_kit")
	return []

func _ability_is_heal(ability: Dictionary) -> bool:
	var tags: Array = ability.get("tags", [])
	if tags.has("HEAL"):
		return true
	var effects = _ability_effects(ability)
	for effect in effects:
		if String(effect.get("type", "")) == "heal":
			return true
	return false

func _ability_confirm_prompt(act: Unit, ability: Dictionary, preview: Dictionary) -> String:
	var ability_name = String(ability.get("name", "Ability"))
	var cost = int(ability.get("cost_pa", 0))
	var tm = int(preview.get("target_mode", ability.get("target_mode", AbilityTargetMode.CELL)))
	var is_heal = _ability_is_heal(ability)
	if tm == AbilityTargetMode.SELF:
		return "Usar %s? custo PA: %d" % [ability_name, cost]
	if tm == AbilityTargetMode.UNIT:
		var target: Unit = preview.get("target_unit", null)
		var target_name = target.unit_name if target != null else "alvo"
		if is_heal:
			return "Curar %s? custo PA: %d" % [target_name, cost]
		return "Usar %s em %s? custo PA: %d" % [ability_name, target_name, cost]
	var cell: Vector2i = preview.get("target_cell", act.cell)
	return "Usar %s em (%d,%d)? custo PA: %d" % [ability_name, cell.x, cell.y, cost]

func _attack_confirm_prompt(attacker: Unit, target: Unit, hit_zone_id: String, is_melee: bool) -> String:
	if attacker == null or target == null:
		return "Atacar alvo?"
	var zone = target.get_hit_zone(hit_zone_id)
	if zone.is_empty():
		zone = target.get_default_hit_zone()
	var zone_label = String(zone.get("label", "Tronco"))
	var base_dmg = _get_base_attack_damage(attacker, is_melee)
	var ctx = {
		"melee": is_melee,
		"base_dmg": base_dmg,
		"dmg_type": Damage.DmgType.PIERCING,
		"use_hit_zone": true,
		"hit_zone_id": hit_zone_id
	}
	var preview = _compute_shot_preview(attacker, target, ctx)
	var chance = int(preview.get("hit", 0))
	var dmg_txt = "-"
	if preview.has("dmg_est"):
		var dmg_est: Dictionary = preview.dmg_est
		dmg_txt = "%d-%d" % [int(dmg_est.get("min", 0)), int(dmg_est.get("max", 0))]
	return "Atacar %s na %s? chance: %d%% dano est.: %s" % [target.unit_name, zone_label, chance, dmg_txt]

func _is_valid_ability_target_unit(act: Unit, ability: Dictionary, target: Unit) -> bool:
	if act == null or target == null:
		return false
	if act.team == 0 and target.team == 1 and not target.visible_to_player:
		return false
	var wants_allies = _ability_targets_allies(ability)
	if wants_allies:
		return target.team == act.team
	return target.team != act.team

func _evaluate_ability_target(act: Unit, cell: Vector2i) -> Dictionary:
	var result := {"valid": false, "reason": "", "target_mode": AbilityTargetMode.CELL, "target_unit": null, "target_cell": cell}
	if act == null or _selected_ability.is_empty() or action_mode != ActionMode.ABILITY:
		return result
	if grid == null:
		return result
	var ability_name = String(_selected_ability.get("name", ""))
	var cost = int(_selected_ability.get("cost_pa", 0))
	var cd = act.cd_left(ability_name)
	var target_mode = int(_selected_ability.get("target_mode", AbilityTargetMode.CELL))
	result.target_mode = target_mode
	if cd > 0:
		result.reason = "COOLDOWN"
		return result
	if act.pa < cost:
		result.reason = "SEM PA"
		return result
	var mp_cost = int(_selected_ability.get("mp_cost", 0))
	if mp_cost > 0 and act.mp < mp_cost:
		result.reason = "SEM MP"
		return result

	if target_mode == AbilityTargetMode.SELF:
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

	if target_mode == AbilityTargetMode.CELL:
		if _ability_has_effect(_selected_ability, "dash") and not grid.is_walkable(cell.x, cell.y):
			result.reason = "BLOQUEADO"
			return result
		result.valid = true
		return result
	if target_mode == AbilityTargetMode.UNIT:
		var tgt = _unit_at_cell(cell, 0)
		if tgt == null:
			tgt = _unit_at_cell(cell, 1)
			if tgt != null and act.team == 0 and not tgt.visible_to_player:
				tgt = null
		if tgt == null or not _is_valid_ability_target_unit(act, _selected_ability, tgt):
			result.reason = "SEM ALVO"
			return result
		result.valid = true
		result.target_unit = tgt
		var base_dmg = _ability_damage_amount(_selected_ability)
		if base_dmg > 0:
			var dmg_type = _ability_primary_damage_type(_selected_ability)
			var ctx = _context_from_ability(_selected_ability, act)
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
			ActionMode.ABILITY:
				if ability_preview.get("valid", false):
					should_show = true
					color = _hover_valid_ability
					if ability_preview.get("target_mode", AbilityTargetMode.CELL) == AbilityTargetMode.SELF:
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
		var tm = int(ability_preview.get("target_mode", AbilityTargetMode.CELL))
		if tm == AbilityTargetMode.SELF:
			var pos = grid.cell_to_world(act.cell.x, act.cell.y)
			target_ring.global_position = pos + Vector3(0, 0.02, 0)
		elif tm == AbilityTargetMode.UNIT and ability_preview.get("target_unit", null) != null:
			var u: Unit = ability_preview.get("target_unit", null)
			var pos_u = grid.cell_to_world(u.cell.x, u.cell.y)
			target_ring.global_position = pos_u + Vector3(0, 0.02, 0)
		else:
			var wpos = grid.cell_to_world(target_cell.x, target_cell.y)
			target_ring.global_position = wpos + Vector3(0, 0.02, 0)
		target_ring.visible = true
		return

	var enemy = _visible_enemy_at_cell(target_cell)
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

func _flash_action_markers(caster_cell: Vector2i, target_cell: Vector2i) -> void:
	if caster_ring == null or action_target_ring == null or grid == null:
		return
	if caster_cell.x < 0 or caster_cell.y < 0 or target_cell.x < 0 or target_cell.y < 0:
		return
	var caster_pos = grid.cell_to_world(caster_cell.x, caster_cell.y)
	var target_pos = grid.cell_to_world(target_cell.x, target_cell.y)
	caster_ring.global_position = caster_pos + Vector3(0, 0.02, 0)
	action_target_ring.global_position = target_pos + Vector3(0, 0.02, 0)
	caster_ring.visible = true
	action_target_ring.visible = true
	if _action_marker_timer:
		_action_marker_timer.stop()
		_action_marker_timer.wait_time = 0.6
		_action_marker_timer.start()

func _hide_action_markers() -> void:
	if caster_ring != null:
		caster_ring.visible = false
	if action_target_ring != null:
		action_target_ring.visible = false

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
	if not _is_cell_visible_in_view(unit.cell):
		active_ring.visible = false
		active_arrow.visible = false
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
	if not _is_cell_visible_in_view(cell):
		target_ring.visible = false
		return

	var unit_target = _unit_at_cell(cell, 0)
	if unit_target == null:
		unit_target = _visible_enemy_at_cell(cell)

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
	var tm = int(ability.get("target_mode", AbilityTargetMode.CELL))
	if tm == AbilityTargetMode.SELF:
		_clear_target_overlay()
		return

	var cells: Array[Vector2i] = []
	var rng = int(ability.get("range", 0))
	if tm == AbilityTargetMode.UNIT:
		var wants_allies = _ability_targets_allies(ability)
		var candidates = player_units if wants_allies else enemy_units
		for u in candidates:
			if u == null or u.dead:
				continue
			if rng > 0 and _manhattan(act.cell, u.cell) > rng:
				continue
			cells.append(u.cell)
	elif tm == AbilityTargetMode.CELL:
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
	var filtered: Array[Vector2i] = []
	for c in keys:
		if _is_cell_visible_in_view(c):
			filtered.append(c)
	reach_mm.instance_count = filtered.size()
	for i in range(filtered.size()):
		var c: Vector2i = filtered[i]
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
	var blocked = get_occupied_cells(act)
	var path = Pathfinding.find_path(grid, act.cell, move_cell, act, blocked)
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
			var info = _cover_vs_attacker(grid, c, threat_cell)
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
	var tm = int(_selected_ability.get("target_mode", AbilityTargetMode.CELL))
	if tm == AbilityTargetMode.SELF:
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
	if u == null or not is_instance_valid(u):
		return
	if u.dead:
		return
	var d = abs(u.cell.x - center.x) + abs(u.cell.y - center.y)
	if d > radius:
		return
	var falloff = max(0.35, 1.0 - float(d) * 0.25)
	var raw = int(round(float(dmg) * falloff))
	var act: Unit = timeline.get_active_unit()
	if act == null:
		return
	var ctx = _context_from_ability(a, act)
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
	_apply_height_visibility()

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
		if not _is_cell_in_fov(s, mover.cell):
			continue
		if not _is_in_facing_cone(s, mover.global_position):
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
	if _ai != null and _ai.has_method("take_turn"):
		_ai.call("take_turn", self, enemy)
		return

	var visible_targets: Array = visible_players_for_ai.get(enemy.get_instance_id(), [])
	var target: Unit = _pick_best_visible_target(enemy, visible_targets)

	if target == null:
		var last_cell = _pick_known_player_cell(enemy.cell)
		if last_cell.x >= 0:
			_move_towards_cell(enemy, last_cell)
		else:
			var patrol = _fallback_patrol_cell()
			_move_towards_cell(enemy, patrol)
		return

	var ability_pick = _choose_enemy_ability(enemy, visible_targets)
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
	var blocked = get_occupied_cells(enemy)
	var reachable = Pathfinding.reachable_with_pa(grid, enemy.cell, reach_pa, enemy, blocked)
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
		var cover = _cover_vs_attacker(grid, cell, target.cell)
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
			var path = Pathfinding.find_path(grid, enemy.cell, cell, enemy, blocked)
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
		if p == null or not is_instance_valid(p) or p.dead:
			continue
		var dx = p.cell.x - cell.x
		var dy = p.cell.y - cell.y
		var d = dx*dx + dy*dy
		if d < best_d:
			best_d = d
			best = p
	return best

func _pick_best_visible_target(enemy: Unit, candidates: Array) -> Unit:
	if enemy == null:
		return null
	var best: Unit = null
	var best_score = INF
	for p in candidates:
		if p == null or p.dead:
			continue
		var dist = _manhattan(enemy.cell, p.cell)
		var hp_ratio = float(p.hp) / float(p.max_hp if p.max_hp > 0 else 1)
		var score = float(dist) + hp_ratio * 2.0
		if score < best_score:
			best_score = score
			best = p
	return best

func _pick_known_player_cell(from_cell: Vector2i) -> Vector2i:
	var best_cell = Vector2i(-999, -999)
	var best_dist = INF
	for cell in known_player_cells_for_ai.values():
		if cell == null:
			continue
		var dist = _manhattan(from_cell, cell)
		if dist < best_dist:
			best_dist = dist
			best_cell = cell
	return best_cell

func _fallback_patrol_cell() -> Vector2i:
	return Vector2i(int(map_w / 2), int(map_h / 2))

func _move_towards_cell(enemy: Unit, target_cell: Vector2i) -> void:
	if enemy == null or grid == null:
		return
	if target_cell.x < 0:
		return
	var blocked = get_occupied_cells(enemy)
	var path = Pathfinding.find_path(grid, enemy.cell, target_cell, enemy, blocked)
	if path.is_empty():
		return
	var remaining_pa = enemy.pa
	var dest = enemy.cell
	for i in range(1, path.size()):
		var step: Vector2i = path[i]
		if _unit_at_cell(step, 0) != null or _unit_at_cell(step, 1) != null:
			break
		var cost = _step_move_cost(enemy, dest, step)
		if cost <= 0 or cost >= INF or cost > remaining_pa:
			break
		remaining_pa -= cost
		dest = step
	if dest != enemy.cell:
		_try_move_with_overwatch_triggers(enemy, dest)

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
		if e == null or not is_instance_valid(e) or e.dead:
			continue
		var dx = e.cell.x - cell.x
		var dy = e.cell.y - cell.y
		var d = dx*dx + dy*dy
		if d < best_d:
			best_d = d
			best = e
	return best

# ---------------- Death cleanup ----------------

func _on_unit_died(u: Unit) -> void:
	_end_fire_wall_channel(u)
	if player_units.has(u):
		player_units.erase(u)
		if u.hero_id != "" and not _dead_hero_ids.has(u.hero_id):
			_dead_hero_ids.append(u.hero_id)
	if enemy_units.has(u):
		enemy_units.erase(u)
		if u.get_instance_id() == mission_target_enemy_id:
			mission_target_enemy_id = 0
		var ghost = enemy_ghosts_by_id.get(u.get_instance_id(), null)
		if ghost != null and is_instance_valid(ghost):
			ghost.queue_free()
		enemy_ghosts_by_id.erase(u.get_instance_id())
		known_enemy_cells.erase(u.get_instance_id())
		known_enemy_turn.erase(u.get_instance_id())
		visible_players_for_ai.erase(u.get_instance_id())
	if player_units.has(u):
		known_player_cells_for_ai.erase(u.get_instance_id())
		visible_enemies.erase(u.get_instance_id())

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
	if mission_escort_unit_id != 0 and _find_unit_by_instance_id(mission_escort_unit_id) == null:
		_handle_defeat("O escoltado foi derrotado.")
		return
	var all_done = true
	for obj in mission_objectives_state:
		var obj_type = String(obj.get("type", ""))
		var completed := false
		match obj_type:
			"kill_all":
				completed = enemy_units.is_empty()
			"kill_target":
				completed = mission_target_enemy_id == 0 or _find_enemy_by_id(mission_target_enemy_id) == null
			"survive_turns":
				completed = mission_turn_limit > 0 and int(mission_state.get("turns", 0)) >= mission_turn_limit
			"capture_tile":
				completed = _is_capture_controlled()
			"escort_unit_to_extract":
				completed = _is_escort_at_extract()
			"extract":
				completed = _is_any_player_at_extract()
		obj["completed"] = completed
		if not completed:
			all_done = false
	_update_mission_ui()

	if mission_turn_limit > 0 and int(mission_state.get("turns", 0)) > mission_turn_limit and not all_done:
		_handle_defeat("Tempo esgotado.")
		return

	if all_done:
		if mission_requires_extract and not _is_any_player_at_extract():
			return
		_handle_victory("Objetivos concluídos.")

func _build_mission_result(victory: bool, reason: String) -> MissionResult:
	var objectives_completed: Array = []
	for obj in mission_objectives_state:
		var text = String(obj.get("text", ""))
		if text == "":
			text = _objective_text_for(String(obj.get("type", "")))
		var done = bool(obj.get("completed", false))
		if done:
			objectives_completed.append(text)
	var kills = max(0, _mission_enemy_total - enemy_units.size())
	var xp_total = kills * XP_PER_KILL
	var gold_total = kills * GOLD_PER_KILL
	if victory:
		xp_total += XP_OBJECTIVE
		gold_total += GOLD_OBJECTIVE
	var hero_results: Array = []
	var roster_ids: Array = _player_roster_ids.duplicate()
	if roster_ids.is_empty():
		for u in player_units:
			if u.hero_id != "" and not roster_ids.has(u.hero_id):
				roster_ids.append(u.hero_id)
	var xp_each = 0
	if not roster_ids.is_empty():
		xp_each = int(round(float(xp_total) / float(roster_ids.size())))
	var wounds = 0
	for hero_id in roster_ids:
		var is_dead = _dead_hero_ids.has(hero_id)
		var wounded = false
		if not is_dead:
			var unit := _find_player_by_hero_id(hero_id)
			if unit != null and unit.hp < unit.max_hp:
				wounded = true
		if wounded:
			wounds += 1
		hero_results.append({
			"id": hero_id,
			"name": String(_player_roster_names.get(hero_id, "Hero")),
			"xp": xp_each,
			"wounded": wounded,
			"dead": is_dead
		})
	var rng := RandomNumberGenerator.new()
	rng.seed = mission_seed
	var loot_items: Array = []
	var base_loot = int(mission.get("loot_count", 1))
	var loot_count = base_loot if victory else max(0, base_loot - 1)
	for i in range(loot_count):
		var item_id = GearRef.get_random_item_id(rng)
		if item_id != "":
			loot_items.append(item_id)
	var relation_changes: Dictionary = {}
	if victory and _mission_seed_data != null:
		var reward: Dictionary = _mission_seed_data.reward
		gold_total += int(reward.get("gold", 0))
		for item_id in reward.get("items", []):
			loot_items.append(String(item_id))
		if reward.has("relations"):
			relation_changes = reward.get("relations", {})
		elif reward.has("relation"):
			relation_changes = reward.get("relation", {})
	var mission_id = String(mission.get("id", ""))
	if _mission_seed_data != null and _mission_seed_data.mission_id != "":
		mission_id = _mission_seed_data.mission_id
	var boss_defeated := false
	if _mission_seed_data != null and _mission_seed_data.boss_id != null:
		boss_defeated = enemy_units.is_empty()
	var result := MissionResult.new({
		"mission_id": mission_id,
		"success": victory,
		"time_spent_days": 1,
		"casualties": _dead_hero_ids.size(),
		"wounds": wounds,
		"loot": {"gold": gold_total, "items": loot_items},
		"relation_changes": relation_changes,
		"flags_gained": [],
		"flags_lost": [],
		"objectives_completed": objectives_completed,
		"boss_defeated": boss_defeated,
		"hero_results": hero_results,
		"notes": reason,
		"consumables_used": _consumables_used
	})
	return result

func _emit_mission_result(result: MissionResult) -> void:
	if end_screen:
		end_screen.visible = false
	if ui_root:
		ui_root.visible = false
	var bridge = get_tree().get_first_node_in_group("tactical_bridge")
	if bridge != null and bridge.has_method("complete_mission"):
		bridge.complete_mission(result)
	emit_signal("mission_completed", _build_legacy_result(result))

func _build_legacy_result(result: MissionResult) -> Dictionary:
	var objectives: Array = []
	for obj in mission_objectives_state:
		var text = String(obj.get("text", ""))
		if text == "":
			text = _objective_text_for(String(obj.get("type", "")))
		var done = bool(obj.get("completed", false))
		objectives.append("%s%s" % ["✓ " if done else "- ", text])
	var hero_xp: Array = []
	for entry in result.hero_results:
		hero_xp.append({
			"id": entry.get("id", ""),
			"name": String(entry.get("name", "Hero")),
			"xp": int(entry.get("xp", 0))
		})
	var loot: Array = []
	for item_id in result.loot.get("items", []):
		var item = _resolve_item_data(String(item_id))
		if item.is_empty():
			continue
		loot.append(_flatten_item_for_legacy(item))
	return {
		"victory": result.success,
		"reason": result.notes,
		"objectives": objectives,
		"hero_xp": hero_xp,
		"loot": loot,
		"gold": int(result.loot.get("gold", 0)),
		"injured_heroes": _dead_hero_ids.duplicate(),
		"mission_id": result.mission_id,
		"seed": mission_seed
	}

func _flatten_item_for_legacy(item: Dictionary) -> Dictionary:
	var flat = item.duplicate(true)
	var mods: Dictionary = item.get("mods", {})
	for key in mods.keys():
		flat[key] = mods[key]
	if mods.has("armor_bonus"):
		flat["armor"] = mods.get("armor_bonus")
	return flat

func _handle_victory(reason: String) -> void:
	if not mission_active:
		return
	mission_active = false
	mission_state["completed"] = true
	if timeline:
		timeline.set_process(false)
	if end_turn_btn:
		end_turn_btn.disabled = true
	var result = _build_mission_result(true, reason)
	_emit_mission_result(result)

func _handle_defeat(reason: String) -> void:
	if not mission_active:
		return
	mission_active = false
	mission_state["failed"] = true
	if timeline:
		timeline.set_process(false)
	if end_turn_btn:
		end_turn_btn.disabled = true
	var result = _build_mission_result(false, reason)
	_emit_mission_result(result)

func _on_restart_pressed() -> void:
	get_tree().reload_current_scene()

func _find_valid_spawn_cell(seed_cell: Vector2i) -> Vector2i:
	if grid == null:
		return seed_cell
	if grid.in_bounds(seed_cell.x, seed_cell.y) and grid.is_walkable(seed_cell.x, seed_cell.y):
		if _unit_at_cell(seed_cell, 0) == null and _unit_at_cell(seed_cell, 1) == null:
			return seed_cell
	for radius in range(1, 4):
		for dx in range(-radius, radius + 1):
			for dy in range(-radius, radius + 1):
				if abs(dx) + abs(dy) > radius:
					continue
				var cell = seed_cell + Vector2i(dx, dy)
				if not grid.in_bounds(cell.x, cell.y):
					continue
				if not grid.is_walkable(cell.x, cell.y):
					continue
				if _unit_at_cell(cell, 0) != null or _unit_at_cell(cell, 1) != null:
					continue
				return cell
	return seed_cell

func _spawn_cell_for_player(idx: int, spawns: Array) -> Vector2i:
	if idx < spawns.size():
		return _find_valid_spawn_cell(spawns[idx])
	return _find_valid_spawn_cell(_fallback_player_spawn(idx))

func _spawn_cell_for_enemy(idx: int, spawns: Array) -> Vector2i:
	if idx < spawns.size():
		return _find_valid_spawn_cell(spawns[idx])
	return _find_valid_spawn_cell(_fallback_enemy_spawn(idx))

func _fallback_player_spawn(idx: int) -> Vector2i:
	var base = [
		Vector2i(1, map_h - 2),
		Vector2i(2, map_h - 3),
		Vector2i(1, map_h - 4),
		Vector2i(2, map_h - 5)
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

func _choose_enemy_ability(enemy: Unit, candidates: Array = []) -> Dictionary:
	var best_score = -999999.0
	var best_pick: Dictionary = {}
	for a in enemy.abilities:
		var cost := int(a.get("cost_pa", 0))
		if enemy.pa < cost:
			continue
		var ability_name := String(a.get("name", ""))
		if enemy.cd_left(ability_name) > 0:
			continue
		if int(a.get("target_mode", AbilityTargetMode.UNIT)) != AbilityTargetMode.UNIT:
			continue
		var tags: Array = a.get("tags", [])
		var ability_range := int(a.get("range", 0))
		var pool = candidates if not candidates.is_empty() else player_units
		for p in pool:
			if p == null or p.dead:
				continue
			var dist = abs(p.cell.x - enemy.cell.x) + abs(p.cell.y - enemy.cell.y)
			if ability_range > 0 and dist > ability_range:
				continue
			var prev = _compute_shot_preview(enemy, p, _context_from_ability(a, enemy))
			if not prev.has_los or prev.dist > prev.max_range:
				continue
			var score = 0.0
			var base_dmg = _ability_damage_amount(a)
			if base_dmg > 0:
				var dmg_type = _ability_primary_damage_type(a)
				var ctx = _context_from_ability(a, enemy)
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
			var cover = _cover_vs_attacker(grid, p.cell, enemy.cell)
			if cover.type == "NONE":
				score += 10.0
			if score > best_score:
				best_score = score
				best_pick = {"ability": a, "target": p, "score": score}
	return best_pick
