extends Control

const MAP_SCREEN_SCENE := "res://scene/ui/map_screen.tscn"

const TRAINING_SKILLS := [
	{"id": "teletransporte", "name": "Teletransporte", "int_req": 3, "prereq": "INT min 3", "gold": 0, "hours": 240}
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
		row.add_theme_constant_override("separation", 8)
		var label := Label.new()
		label.text = "%s / %s / %dg / %dh" % [
			String(skill.get("name", "")),
			String(skill.get("prereq", "")),
			int(skill.get("gold", 0)),
			int(skill.get("hours", 0))
		]
		row.add_child(label)
		var picker := OptionButton.new()
		picker.add_item("Selecionar soldado", 0)
		var eligible := _eligible_heroes_for_int(int(skill.get("int_req", 0)))
		for hero in eligible:
			picker.add_item(String(hero.get("name", "Hero")))
			picker.set_item_metadata(picker.item_count - 1, String(hero.get("id", "")))
		row.add_child(picker)
		var train_button := Button.new()
		train_button.text = "Treinar"
		train_button.disabled = eligible.is_empty()
		train_button.pressed.connect(func():
			if picker.selected <= 0:
				return
			var hero_id := String(picker.get_item_metadata(picker.selected))
			if world_state.start_unit_training(hero_id, String(skill.get("id", "")), float(skill.get("hours", 0))):
				_refresh()
		)
		row.add_child(train_button)
		training_content.add_child(row)

func _eligible_heroes_for_int(min_int: int) -> Array:
	var out: Array = []
	if world_state == null:
		return out
	for hero in world_state.roster:
		var stats: Dictionary = hero.get("stats_base", {})
		if int(stats.get("INT", 0)) >= min_int:
			out.append(hero)
	return out
