extends Control

const MAP_SCREEN_SCENE := "res://scene/ui/map_screen.tscn"

@onready var back_button: Button = $TopBar/BackButton
@onready var gold_label: Label = $Body/GoldLabel
@onready var candidates_content: VBoxContainer = $Body/CandidatesPanel/CandidatesMargin/CandidatesContent

var world_state: Node

func _ready() -> void:
	world_state = get_tree().get_first_node_in_group("world_state")
	back_button.pressed.connect(_on_back_pressed)
	_refresh()

func _on_back_pressed() -> void:
	get_tree().change_scene_to_file(MAP_SCREEN_SCENE)

func _refresh() -> void:
	if world_state == null:
		return
	gold_label.text = "Ouro: %d" % int(world_state.gold)
	for child in candidates_content.get_children():
		child.queue_free()
	var candidates: Array = world_state.recruit_state.get("candidates", [])
	if candidates.is_empty():
		var empty := Label.new()
		empty.text = "Nenhum candidato disponível hoje."
		candidates_content.add_child(empty)
		return
	for candidate in candidates:
		var row := HBoxContainer.new()
		var label := Label.new()
		label.text = "%s (%s) - %d ouro" % [
			String(candidate.get("name", "")),
			String(candidate.get("class_id", "")),
			int(candidate.get("recruit_cost", 0))
		]
		var button := Button.new()
		button.text = "Recrutar"
		var candidate_id := String(candidate.get("id", ""))
		button.pressed.connect(func():
			if world_state.recruit_hero(candidate_id):
				_refresh()
		)
		row.add_child(label)
		row.add_child(button)
		candidates_content.add_child(row)
