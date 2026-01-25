extends Control

const MAP_SCREEN_SCENE := "res://scene/ui/map_screen.tscn"
const SKILL_WEB_SCENE := "res://scene/ui/skill_web.tscn"

@onready var roster_list: ItemList = $Body/RosterPanel/RosterMargin/RosterList
@onready var detail_content: VBoxContainer = $Body/DetailPanel/DetailMargin/DetailContent
@onready var back_button: Button = $TopBar/BackButton

var world_state: Node
var _roster_ids: Array[String] = []

func _ready() -> void:
	world_state = get_tree().get_first_node_in_group("world_state")
	back_button.pressed.connect(_on_back_pressed)
	roster_list.item_selected.connect(_on_roster_selected)
	_refresh_roster()

func _on_back_pressed() -> void:
	get_tree().change_scene_to_file(MAP_SCREEN_SCENE)

func _refresh_roster() -> void:
	_roster_ids.clear()
	roster_list.clear()
	if world_state == null:
		return
	for hero in world_state.roster:
		var hero_id := String(hero.get("id", ""))
		var label := "%s [%s] Lv %d" % [
			String(hero.get("name", "Hero")),
			String(hero.get("class_id", "")),
			int(hero.get("level", 1))
		]
		roster_list.add_item(label)
		_roster_ids.append(hero_id)
	if not _roster_ids.is_empty():
		roster_list.select(0)
		_show_hero_details(_roster_ids[0])

func _on_roster_selected(index: int) -> void:
	if index < 0 or index >= _roster_ids.size():
		return
	_show_hero_details(_roster_ids[index])

func _show_hero_details(hero_id: String) -> void:
	for child in detail_content.get_children():
		child.queue_free()
	if world_state == null:
		return
	var hero: Dictionary = world_state.get_roster_unit(hero_id)
	if hero.is_empty():
		return
	var header := Label.new()
	header.text = "%s (%s)" % [String(hero.get("name", "Hero")), String(hero.get("class_id", ""))]
	header.add_theme_font_size_override("font_size", 16)
	detail_content.add_child(header)
	var level_label := Label.new()
	level_label.text = "Nível: %d" % int(hero.get("level", 1))
	detail_content.add_child(level_label)
	var stats: Dictionary = hero.get("stats_base", {})
	var item_stats := _collect_item_stats(hero)
	var hp := int(stats.get("hp", stats.get("hp_max", 0)))
	var mp := int(stats.get("mp", stats.get("mp_max", 0)))
	var pa := int(stats.get("pa", stats.get("pa_max", 0)))
	var stats_label := Label.new()
	stats_label.text = "HP %d | MP %d | PA %d" % [hp, mp, pa]
	detail_content.add_child(stats_label)
	var item_label := Label.new()
	item_label.text = "Bônus de itens: STR %+d DEX %+d AGI %+d VIT %+d INT %+d" % [
		int(item_stats.get("STR", 0)),
		int(item_stats.get("DEX", 0)),
		int(item_stats.get("AGI", 0)),
		int(item_stats.get("VIT", 0)),
		int(item_stats.get("INT", 0))
	]
	detail_content.add_child(item_label)
	var equipped_id := String(hero.get("equipped_item", ""))
	var equip_label := Label.new()
	if equipped_id != "":
		var item_data: Dictionary = world_state.get_item_data(equipped_id)
		equip_label.text = "Equipado: %s" % String(item_data.get("name", equipped_id))
	else:
		equip_label.text = "Equipado: nenhum"
	detail_content.add_child(equip_label)
	if equipped_id != "":
		var unequip := Button.new()
		unequip.text = "Desequipar"
		unequip.pressed.connect(func():
			if world_state.unequip_item(hero_id):
				_show_hero_details(hero_id)
		)
		detail_content.add_child(unequip)
	var inv_title := Label.new()
	inv_title.text = "Inventário"
	detail_content.add_child(inv_title)
	var inventory: Array = world_state.inventory.get("items", [])
	if inventory.is_empty():
		var empty_label := Label.new()
		empty_label.text = "Sem itens disponíveis."
		detail_content.add_child(empty_label)
	else:
		for item_id in inventory:
			var item_data: Dictionary = world_state.get_item_data(String(item_id))
			var row := HBoxContainer.new()
			var label := Label.new()
			label.text = String(item_data.get("name", item_id))
			var equip_button := Button.new()
			equip_button.text = "Equipar"
			equip_button.pressed.connect(func():
				if world_state.equip_item(hero_id, String(item_id)):
					_show_hero_details(hero_id)
			)
			row.add_child(label)
			row.add_child(equip_button)
			detail_content.add_child(row)
	var skill_button := Button.new()
	skill_button.text = "Skill Web"
	skill_button.pressed.connect(func():
		world_state.set_selected_unit(hero_id)
		get_tree().change_scene_to_file(SKILL_WEB_SCENE)
	)
	detail_content.add_child(skill_button)

func _collect_item_stats(hero: Dictionary) -> Dictionary:
	var totals := {"STR": 0, "DEX": 0, "AGI": 0, "VIT": 0, "INT": 0}
	if world_state == null:
		return totals
	var equipped_id := String(hero.get("equipped_item", ""))
	if equipped_id != "":
		var item_data: Dictionary = world_state.get_item_data(equipped_id)
		var stats: Dictionary = item_data.get("stats", {})
		for key in totals.keys():
			totals[key] += int(stats.get(key, 0))
	return totals
