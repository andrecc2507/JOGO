extends Control

const MAP_SCREEN_SCENE := "res://scene/ui/map_screen.tscn"

const TRAINING_SKILLS := [
	{"id": "teletransporte", "name": "Teletransporte", "prereq": "INT min 3", "gold": 0, "hours": 240}
]

@onready var back_button: Button = $TopBar/BackButton
@onready var training_content: VBoxContainer = $Body/TrainingPanel/TrainingMargin/TrainingContent

var world_state: Node

func _ready() -> void:
	world_state = get_tree().get_first_node_in_group("world_state")
	back_button.pressed.connect(_on_back_pressed)
	_refresh()

func _on_back_pressed() -> void:
	get_tree().change_scene_to_file(MAP_SCREEN_SCENE)

func _refresh() -> void:
	for child in training_content.get_children():
		child.queue_free()
	if world_state == null:
		return
	var header := Label.new()
	header.text = "Skill name / Pre-requisites / Gold cost / Time necessary to learn"
	header.add_theme_font_size_override("font_size", 12)
	training_content.add_child(header)
	for skill in TRAINING_SKILLS:
		var row := HBoxContainer.new()
		var label := Label.new()
		label.text = "%s / %s / %dg / %dh" % [
			String(skill.get("name", "")),
			String(skill.get("prereq", "")),
			int(skill.get("gold", 0)),
			int(skill.get("hours", 0))
		]
		row.add_child(label)
		training_content.add_child(row)
