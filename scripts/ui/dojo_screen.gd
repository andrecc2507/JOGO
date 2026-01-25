extends Control

const MAP_SCREEN_SCENE := "res://scene/ui/map_screen.tscn"

const TRAINING_SKILLS := [
	{"id": "teletransporter", "name": "Teletransporter", "int_req": 0, "hours": 480.0}
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
	if world_state.roster.is_empty():
		var empty := Label.new()
		empty.text = "Sem heróis disponíveis."
		training_content.add_child(empty)
		return
	for hero in world_state.roster:
		var hero_id := String(hero.get("id", ""))
		var row := HBoxContainer.new()
		var label := Label.new()
		label.text = "%s [%s]" % [String(hero.get("name", "Hero")), String(hero.get("class_id", ""))]
		row.add_child(label)
		if world_state.is_unit_training(hero_id):
			var status := Label.new()
			var entry: Dictionary = world_state.unit_training.get(hero_id, {})
			var hours_left := int(ceil(float(entry.get("remaining_hours", 0.0))))
			status.text = "Treinando (%dh)" % hours_left
			row.add_child(status)
		else:
			var skill := TRAINING_SKILLS[0]
			var button := Button.new()
			button.text = "Treinar %s" % String(skill.get("name", ""))
			button.pressed.connect(func():
				var int_req := int(skill.get("int_req", 0))
				var ok := world_state.start_unit_training(hero_id, String(skill.get("id", "")), float(skill.get("hours", 0.0)))
				if ok:
					_refresh()
			)
			row.add_child(button)
		training_content.add_child(row)
