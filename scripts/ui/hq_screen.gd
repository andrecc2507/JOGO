extends Control

const MAP_SCREEN_SCENE := "res://scene/ui/map_screen.tscn"
const SKILL_WEB_SCENE := "res://scene/ui/skill_web.tscn"
const STAT_UPGRADES := [
	{"key": "hp", "label": "HP"},
	{"key": "pa", "label": "PA"},
	{"key": "aim", "label": "Mira"},
	{"key": "def", "label": "Defesa"},
	{"key": "agi", "label": "Agilidade"},
	{"key": "move", "label": "Movimento"},
	{"key": "INT", "label": "INT"}
]

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
	_build_stat_upgrades(hero_id, hero)
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
	var equipment_title := Label.new()
	equipment_title.text = "Equipamentos"
	detail_content.add_child(equipment_title)
	_build_equipment_slots(hero_id)
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

func _build_stat_upgrades(hero_id: String, hero: Dictionary) -> void:
	var points := int(hero.get("stat_points", 0))
	var points_label := Label.new()
	points_label.text = "Pontos de atributo: %d" % points
	detail_content.add_child(points_label)
	var title := Label.new()
	title.text = "Atributos"
	detail_content.add_child(title)
	var stats: Dictionary = hero.get("stats_base", {})
	for stat_def in STAT_UPGRADES:
		var key := String(stat_def.get("key", ""))
		var label_text := String(stat_def.get("label", key))
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 6)
		var label := Label.new()
		label.text = "%s: %d" % [label_text, int(stats.get(key, 0))]
		row.add_child(label)
		var add_button := Button.new()
		add_button.text = "+1"
		add_button.disabled = points <= 0
		add_button.pressed.connect(func():
			if world_state.allocate_stat_point(hero_id, key):
				_show_hero_details(hero_id)
		)
		row.add_child(add_button)
		detail_content.add_child(row)

func _collect_item_stats(hero: Dictionary) -> Dictionary:
	var totals := {"STR": 0, "DEX": 0, "AGI": 0, "VIT": 0, "INT": 0}
	if world_state == null:
		return totals
	var equipment: Dictionary = world_state.get_hero_equipment(String(hero.get("id", "")))
	for slot in equipment.keys():
		var equipped_id := String(equipment.get(slot, ""))
		if equipped_id == "":
			continue
		var item_data: Dictionary = world_state.get_item_data(equipped_id)
		var stats: Dictionary = item_data.get("stats", {})
		for key in totals.keys():
			totals[key] += int(stats.get(key, 0))
	return totals

func _build_equipment_slots(hero_id: String) -> void:
	if world_state == null:
		return
	var equipment: Dictionary = world_state.get_hero_equipment(hero_id)
	var inventory: Array = world_state.inventory.get("items", [])
	var slot_labels := {
		"hand_r": "Hand R",
		"hand_l": "Hand L",
		"armor": "Armor set",
		"accessory_1": "Acessorie 1",
		"accessory_2": "Acessorie 2"
	}
	for slot in world_state.EQUIPMENT_SLOTS:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 6)
		var label := Label.new()
		label.text = String(slot_labels.get(slot, slot))
		label.custom_minimum_size = Vector2(110, 0)
		row.add_child(label)
		var equipped_id := String(equipment.get(slot, ""))
		var item_label := Label.new()
		item_label.text = "Vazio"
		if equipped_id != "":
			var item_data: Dictionary = world_state.get_item_data(equipped_id)
			item_label.text = String(item_data.get("name", equipped_id))
		item_label.custom_minimum_size = Vector2(120, 0)
		row.add_child(item_label)
		var picker := OptionButton.new()
		picker.add_item("Selecionar", 0)
		for item_id in inventory:
			var item_data: Dictionary = world_state.get_item_data(String(item_id))
			picker.add_item(String(item_data.get("name", item_id)))
			picker.set_item_metadata(picker.item_count - 1, String(item_id))
		row.add_child(picker)
		var equip_button := Button.new()
		equip_button.text = "Equipar"
		equip_button.pressed.connect(func():
			if picker.selected <= 0:
				return
			var item_id := String(picker.get_item_metadata(picker.selected))
			if world_state.equip_item_in_slot(hero_id, item_id, slot):
				_show_hero_details(hero_id)
		)
		row.add_child(equip_button)
		var unequip_button := Button.new()
		unequip_button.text = "Desequipar"
		unequip_button.disabled = equipped_id == ""
		unequip_button.pressed.connect(func():
			if world_state.unequip_item_in_slot(hero_id, slot):
				_show_hero_details(hero_id)
		)
		row.add_child(unequip_button)
		detail_content.add_child(row)
