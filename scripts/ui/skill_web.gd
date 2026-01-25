extends Control

const MAP_SCREEN_SCENE := "res://scene/ui/map_screen.tscn"

@onready var title_label: Label = $Root/TopBar/TitleLabel
@onready var back_button: Button = $Root/TopBar/BackButton
@onready var skill_body: VBoxContainer = $Root/Scroll/SkillBody

const FALLBACK_LINES := [
	{
		"id": "fallback_line_1",
		"name": "Linha A",
		"skills": [
			{"id": "fb_skill_a1", "name": "Foco I"},
			{"id": "fb_skill_a2", "name": "Foco II"},
			{"id": "fb_skill_a3", "name": "Foco III"}
		]
	},
	{
		"id": "fallback_line_2",
		"name": "Linha B",
		"skills": [
			{"id": "fb_skill_b1", "name": "Tática I"},
			{"id": "fb_skill_b2", "name": "Tática II"},
			{"id": "fb_skill_b3", "name": "Tática III"}
		]
	},
	{
		"id": "fallback_line_3",
		"name": "Linha C",
		"skills": [
			{"id": "fb_skill_c1", "name": "Defesa I"},
			{"id": "fb_skill_c2", "name": "Defesa II"},
			{"id": "fb_skill_c3", "name": "Defesa III"}
		]
	}
]

var world_state: Node
var _unit_id: String = ""
var _unit_class: String = ""
var _unit_name: String = ""

func _ready() -> void:
	world_state = get_tree().get_first_node_in_group("world_state")
	back_button.pressed.connect(_on_back_pressed)
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
		var class_label := _unit_class if _unit_class != "" else "Classe"
		title_label.text = "Skill Web — %s (%s)" % [_unit_name, class_label]
	for child in skill_body.get_children():
		child.queue_free()
	if world_state == null:
		var error_label := Label.new()
		error_label.text = "WorldState indisponível."
		skill_body.add_child(error_label)
		return
	var core_container := CenterContainer.new()
	var core_button := Button.new()
	core_button.text = "Core"
	core_button.disabled = true
	core_container.add_child(core_button)
	skill_body.add_child(core_container)
	var branches := HBoxContainer.new()
	branches.add_theme_constant_override("separation", 20)
	var lines: Array = _get_skill_lines()
	for line in lines:
		var line_box := VBoxContainer.new()
		line_box.add_theme_constant_override("separation", 6)
		var line_title := Label.new()
		line_title.text = String(line.get("name", "Linha"))
		line_box.add_child(line_title)
		var skills: Array = line.get("skills", [])
		var prev_skill_id := ""
		for skill in skills:
			var skill_id := String(skill.get("id", ""))
			var skill_name := String(skill.get("name", skill_id))
			var is_unlocked := world_state.is_skill_unlocked(_unit_id, skill_id)
			var prereq_ok := true
			if prev_skill_id != "":
				prereq_ok = world_state.is_skill_unlocked(_unit_id, prev_skill_id)
			var button := Button.new()
			button.text = "%s%s" % [skill_name, " ✓" if is_unlocked else ""]
			button.disabled = not prereq_ok or is_unlocked
			button.pressed.connect(_unlock_skill.bind(skill_id))
			line_box.add_child(button)
			prev_skill_id = skill_id
		branches.add_child(line_box)
	skill_body.add_child(branches)

func _unlock_skill(skill_id: String) -> void:
	if world_state == null or _unit_id == "" or skill_id == "":
		return
	world_state.unlock_skill(_unit_id, skill_id)
	_build_skill_web()

func _get_skill_lines() -> Array:
	if world_state == null:
		return FALLBACK_LINES
	var skill_defs: Dictionary = world_state.get("skill_defs", {})
	var classes: Dictionary = skill_defs.get("classes", {})
	var class_key := _unit_class.to_upper()
	if classes.has(class_key):
		var class_def: Dictionary = classes[class_key]
		var lines: Array = class_def.get("lines", [])
		if not lines.is_empty():
			return lines
	return FALLBACK_LINES
