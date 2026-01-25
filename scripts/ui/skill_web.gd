extends Control

const MAP_SCREEN_SCENE := "res://scene/ui/map_screen.tscn"
const CLASS_WEBS_PATH := "res://content/class_webs.json"

@onready var title_label: Label = $Root/TopBar/TitleLabel
@onready var back_button: Button = $Root/TopBar/BackButton
@onready var unit_label: Label = $Root/InfoBar/UnitLabel
@onready var class_label: Label = $Root/InfoBar/ClassLabel
@onready var points_label: Label = $Root/InfoBar/PointsLabel
@onready var skill_body: Control = $Root/Scroll/SkillBody

var world_state: Node
var _unit_id: String = ""
var _unit_class: String = ""
var _unit_name: String = ""
var _class_webs: Dictionary = {}
var _node_positions: Dictionary = {}
var _node_prereqs: Dictionary = {}

const GRID_SPACING := Vector2(140, 110)
const CLASS_ID_MAP := {
	"VANGUARD": "WARRIOR",
	"MYSTIC": "ARCANE",
	"SCOUT": "RANGER",
	"GENERAL": "MERCENARY",
	"GUERREIRO": "WARRIOR",
	"ARCANO": "ARCANE",
	"ARQUEIRO": "ARCHER",
	"MERCENARIO": "MERCENARY",
	"PATRULHEIRO": "RANGER"
}

func _ready() -> void:
	world_state = get_tree().get_first_node_in_group("world_state")
	back_button.pressed.connect(_on_back_pressed)
	_class_webs = _load_class_webs()
	_load_unit_context()
	_build_skill_web()

func _on_back_pressed() -> void:
	get_tree().change_scene_to_file(MAP_SCREEN_SCENE)

func _load_unit_context() -> void:
	if world_state == null:
		return
	_unit_id = String(world_state.get("selected_unit_id", ""))
	if _unit_id == "" and world_state.has_method("get_roster_unit"):
		var roster: Array = world_state.get("roster", [])
		if not roster.is_empty():
			_unit_id = String(roster[0].get("id", ""))
	if _unit_id != "" and world_state.has_method("get_roster_unit"):
		var hero: Dictionary = world_state.get_roster_unit(_unit_id)
		_unit_name = String(hero.get("name", "Herói"))
		_unit_class = String(hero.get("class_id", ""))
	if _unit_name == "":
		_unit_name = "Herói"

func _build_skill_web() -> void:
	if title_label != null:
		var header_class := _unit_class if _unit_class != "" else "Classe"
		title_label.text = "Skill Web — %s (%s)" % [_unit_name, header_class]
	if unit_label != null:
		unit_label.text = "Herói: %s" % _unit_name
	if class_label != null:
		class_label.text = "Classe: %s" % (_unit_class if _unit_class != "" else "Desconhecida")
	if points_label != null and world_state != null:
		points_label.text = "Pontos: %d" % world_state.get_unit_points(_unit_id)
	for child in skill_body.get_children():
		child.queue_free()
	if world_state == null:
		var error_label := Label.new()
		error_label.text = "WorldState indisponível."
		skill_body.add_child(error_label)
		return
	var class_web := _get_class_web()
	if class_web.is_empty():
		var fallback_label := Label.new()
		fallback_label.text = "Teia não encontrada para esta classe."
		skill_body.add_child(fallback_label)
		return
	var root_id := String(class_web.get("root", ""))
	if root_id != "" and world_state.has_method("ensure_node_unlocked"):
		world_state.ensure_node_unlocked(_unit_id, root_id)
	var nodes: Array = class_web.get("nodes", [])
	if nodes.is_empty():
		var empty_label := Label.new()
		empty_label.text = "Sem nós cadastrados."
		skill_body.add_child(empty_label)
		return
	_render_web(nodes)

func _render_web(nodes: Array) -> void:
	_node_positions.clear()
	_node_prereqs.clear()
	var min_pos := Vector2.ZERO
	var max_pos := Vector2.ZERO
	for node in nodes:
		var grid := _node_grid_pos(node)
		min_pos.x = min(min_pos.x, grid.x)
		min_pos.y = min(min_pos.y, grid.y)
		max_pos.x = max(max_pos.x, grid.x)
		max_pos.y = max(max_pos.y, grid.y)
	var grid_size := max_pos - min_pos + Vector2.ONE
	var canvas_size := Vector2(
		grid_size.x * GRID_SPACING.x + GRID_SPACING.x * 2.0,
		grid_size.y * GRID_SPACING.y + GRID_SPACING.y * 2.0
	)
	skill_body.custom_minimum_size = canvas_size
	var origin := Vector2(GRID_SPACING.x, GRID_SPACING.y)
	for node in nodes:
		var grid := _node_grid_pos(node)
		var pos := origin + Vector2(
			(grid.x - min_pos.x) * GRID_SPACING.x,
			(grid.y - min_pos.y) * GRID_SPACING.y
		)
		var node_id := String(node.get("id", ""))
		_node_positions[node_id] = pos
		_node_prereqs[node_id] = node.get("prereq", [])
	_render_lines(nodes)
	for node in nodes:
		var button := _build_node_button(node)
		button.position = _node_positions.get(String(node.get("id", "")), Vector2.ZERO)
		skill_body.add_child(button)

func _build_node_button(node: Dictionary) -> Button:
	var node_id := String(node.get("id", ""))
	var node_name := String(node.get("name", node_id))
	var node_type := String(node.get("type", "perk"))
	var prereqs: Array = node.get("prereq", [])
	var unlocked := _is_node_unlocked(node_id, node_type)
	var available := world_state.can_unlock(_unit_id, node_id, prereqs) and not unlocked
	var button := Button.new()
	button.text = node_name
	button.custom_minimum_size = Vector2(160, 44)
	button.add_theme_font_size_override("font_size", 12)
	button.disabled = not available
	if unlocked:
		button.disabled = true
		button.text = "%s ✓" % node_name
		button.add_theme_color_override("font_color", Color(0.8, 1.0, 0.8))
	elif available:
		button.add_theme_color_override("font_color", Color(1.0, 0.95, 0.7))
	else:
		button.add_theme_color_override("font_color", Color(0.7, 0.7, 0.7))
	if node_type == "core":
		button.disabled = true
		button.text = "%s ✓" % node_name
	button.pressed.connect(_on_node_pressed.bind(node_id))
	return button

func _render_lines(nodes: Array) -> void:
	for node in nodes:
		var node_id := String(node.get("id", ""))
		var prereqs: Array = node.get("prereq", [])
		for prereq in prereqs:
			var from_id := String(prereq)
			if not _node_positions.has(from_id) or not _node_positions.has(node_id):
				continue
			var line := Line2D.new()
			line.width = 3.0
			line.default_color = Color(0.35, 0.6, 0.9, 0.6)
			if _is_node_unlocked(node_id, String(node.get("type", "perk"))):
				line.default_color = Color(0.3, 0.9, 0.45, 0.8)
			var from_pos: Vector2 = _node_positions[from_id]
			var to_pos: Vector2 = _node_positions[node_id]
			line.points = [from_pos + Vector2(80, 22), to_pos + Vector2(80, 22)]
			skill_body.add_child(line)

func _node_grid_pos(node: Dictionary) -> Vector2:
	var pos: Array = node.get("pos", [0, 0])
	return Vector2(float(pos[0]), float(pos[1]))

func _on_node_pressed(node_id: String) -> void:
	if world_state == null or _unit_id == "" or node_id == "":
		return
	var prereqs: Array = _node_prereqs.get(node_id, [])
	if world_state.unlock_node(_unit_id, node_id, prereqs):
		_build_skill_web()

func _get_class_web() -> Dictionary:
	var class_id := _resolve_class_id(_unit_class)
	for class_entry in _class_webs.get("classes", []):
		if String(class_entry.get("id", "")).to_upper() == class_id:
			return class_entry.get("web", {})
	return {}

func _resolve_class_id(class_id: String) -> String:
	var upper := class_id.to_upper()
	return String(CLASS_ID_MAP.get(upper, upper))

func _is_node_unlocked(node_id: String, node_type: String) -> bool:
	if node_type == "core":
		return true
	return world_state.is_unlocked(_unit_id, node_id)

func _load_class_webs() -> Dictionary:
	if not FileAccess.file_exists(CLASS_WEBS_PATH):
		return {}
	var file := FileAccess.open(CLASS_WEBS_PATH, FileAccess.READ)
	if file == null:
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if parsed is Dictionary:
		return parsed
	return {}
