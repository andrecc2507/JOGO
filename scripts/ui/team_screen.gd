extends Control

const MAP_SCREEN_SCENE := "res://scene/ui/map_screen.tscn"
const SKILL_WEB_SCENE := "res://scene/ui/skill_web.tscn"

@onready var back_button: Button = $TopBar/BackButton
@onready var roster_list: VBoxContainer = $Body/RosterPanel/RosterMargin/RosterScroll/RosterList
@onready var detail_content: VBoxContainer = $Body/DetailPanel/DetailMargin/DetailContent

var world_state: Node
var _selected_id := ""

func _ready() -> void:
	world_state = get_tree().get_first_node_in_group("world_state")
	back_button.pressed.connect(_on_back_pressed)
	_refresh_roster()

func _on_back_pressed() -> void:
	get_tree().change_scene_to_file(MAP_SCREEN_SCENE)

func _refresh_roster() -> void:
	for child in roster_list.get_children():
		child.queue_free()
	if world_state == null:
		return
	for hero in world_state.roster:
		var hero_id := String(hero.get("id", ""))
		var row := HBoxContainer.new()
		var checkbox := CheckBox.new()
		checkbox.button_pressed = world_state.active_party_ids.has(hero_id)
		checkbox.toggled.connect(_on_party_toggled.bind(hero_id, checkbox))
		row.add_child(checkbox)
		var label := Button.new()
		label.flat = true
		label.text = "%s [%s] Lv %d" % [
			String(hero.get("name", "Hero")),
			String(hero.get("class_id", "")),
			int(hero.get("level", 1))
		]
		label.pressed.connect(func():
			_selected_id = hero_id
			_show_hero_details(hero_id)
		)
		row.add_child(label)
		if world_state.is_unit_training(hero_id):
			var tag := Label.new()
			tag.text = "Treinando"
			row.add_child(tag)
		roster_list.add_child(row)
	if _selected_id == "" and not world_state.roster.is_empty():
		_selected_id = String(world_state.roster[0].get("id", ""))
		_show_hero_details(_selected_id)

func _on_party_toggled(pressed: bool, hero_id: String, checkbox: CheckBox) -> void:
	if world_state == null:
		return
	if world_state.is_unit_training(hero_id):
		checkbox.set_pressed_no_signal(false)
		return
	if pressed:
		if world_state.active_party_ids.has(hero_id):
			return
		if world_state.active_party_ids.size() >= world_state.PARTY_SIZE:
			checkbox.set_pressed_no_signal(false)
			return
		world_state.active_party_ids.append(hero_id)
	else:
		world_state.active_party_ids.erase(hero_id)
	world_state.ensure_active_party_valid()

func _show_hero_details(hero_id: String) -> void:
	for child in detail_content.get_children():
		child.queue_free()
	if world_state == null:
		return
	var hero: Dictionary = world_state.get_roster_unit(hero_id)
	if hero.is_empty():
		return
	var title := Label.new()
	title.text = "%s (%s)" % [String(hero.get("name", "Hero")), String(hero.get("class_id", ""))]
	title.add_theme_font_size_override("font_size", 16)
	detail_content.add_child(title)
	var stats: Dictionary = hero.get("stats_base", {})
	var hp := int(stats.get("hp", stats.get("hp_max", 0)))
	var mp := int(stats.get("mp", stats.get("mp_max", 0)))
	var pa := int(stats.get("pa", stats.get("pa_max", 0)))
	var label := Label.new()
	label.text = "HP %d | MP %d | PA %d" % [hp, mp, pa]
	detail_content.add_child(label)
	var equipped_id := String(hero.get("equipped_item", ""))
	var equip_label := Label.new()
	if equipped_id != "":
		var item_data: Dictionary = world_state.get_item_data(equipped_id)
		equip_label.text = "Equipamento: %s" % String(item_data.get("name", equipped_id))
	else:
		equip_label.text = "Equipamento: nenhum"
	detail_content.add_child(equip_label)
	var skill_button := Button.new()
	skill_button.text = "Skill Web"
	skill_button.pressed.connect(func():
		world_state.set_selected_unit(hero_id)
		get_tree().change_scene_to_file(SKILL_WEB_SCENE)
	)
	detail_content.add_child(skill_button)
