extends Control

const MAP_SCREEN_SCENE := "res://scene/ui/map_screen.tscn"

@onready var title_label: Label = $Panel/Content/TitleLabel
@onready var details_label: Label = $Panel/Content/DetailsLabel
@onready var party_label: Label = $Panel/Content/PartyLabel
@onready var deploy_button: Button = $Panel/Content/Buttons/DeployButton
@onready var cancel_button: Button = $Panel/Content/Buttons/CancelButton

var world_state: Node
var _card: Dictionary = {}

func _ready() -> void:
	world_state = get_tree().get_first_node_in_group("world_state")	
	deploy_button.pressed.connect(_on_deploy_pressed)
	cancel_button.pressed.connect(_on_cancel_pressed)
	_load_pending_mission()

func _load_pending_mission() -> void:
	if world_state == null:
		return
	_card = world_state.progression.get("pending_mission_card", {})
	if _card.is_empty():
		details_label.text = "Nenhuma missão selecionada."
		deploy_button.disabled = true
		return
	var template := _template_for_id(String(_card.get("template_id", "")))
	var mission_name := String(template.get("name", "Missão"))
	var mission_type := String(_card.get("mission_type", _card.get("type", "")))
	var region_id := String(_card.get("region_id", ""))
	var timer_minutes := int(_card.get("timer_minutes", int(_card.get("timer_days", 1)) * 1440))
	var hours_left := int(ceil(float(timer_minutes) / 60.0))
	title_label.text = "Pré-Missão — %s" % mission_name
	details_label.text = "Tipo: %s\nRegião: %s\nTimer: %dh" % [mission_type, region_id, hours_left]
	_refresh_party()

func _refresh_party() -> void:
	if world_state == null:
		return
	var lines: Array[String] = []
	var party_ids: Array = world_state.active_party_ids
	for hero in world_state.roster:
		var hero_id := String(hero.get("id", ""))
		if not party_ids.has(hero_id):
			continue
		if world_state.is_unit_training(hero_id):
			continue
		lines.append("%s [%s]" % [String(hero.get("name", "Hero")), String(hero.get("class_id", ""))])
	if lines.is_empty():
		party_label.text = "Nenhum herói disponível na party."
		deploy_button.disabled = true
	else:
		party_label.text = "Party:\n" + "\n".join(lines)
		deploy_button.disabled = false

func _on_deploy_pressed() -> void:
	if world_state == null or _card.is_empty():
		return
	var seed = world_state.build_mission_seed(_card)
	world_state.progression["pending_mission_id"] = String(_card.get("mission_id", ""))
	world_state.progression.erase("pending_mission_card")
	world_state.progression.erase("pending_mission_action")
	var bridge = get_tree().get_first_node_in_group("tactical_bridge")
	if bridge != null and bridge.has_method("start_mission"):
		bridge.start_mission(seed)
	else:
		get_tree().change_scene_to_file(MAP_SCREEN_SCENE)

func _on_cancel_pressed() -> void:
	if world_state != null:
		world_state.progression.erase("pending_mission_card")
		world_state.progression.erase("pending_mission_action")
	get_tree().change_scene_to_file(MAP_SCREEN_SCENE)

func _template_for_id(template_id: String) -> Dictionary:
	if world_state == null:
		return {}
	for template in world_state.mission_templates:
		if String(template.get("id", "")) == template_id:
			return template
	return {}
